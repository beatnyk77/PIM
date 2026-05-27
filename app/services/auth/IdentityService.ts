import * as Signal from '@privacyresearch/libsignal-protocol-typescript';
import * as SecureStore from 'expo-secure-store';
import { createMlKem768 } from 'mlkem';

// Helper to convert ArrayBuffer to Base64 and back
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface IdentityKeys {
  registrationId: number;
  identityKey: ArrayBuffer; // Public Key
  privateKey: ArrayBuffer;
}

const STORAGE_KEY = 'identity_keys_v1';

export class IdentityService {
  static async generateIdentity(): Promise<IdentityKeys | null> {
    try {
      // 1. Generate Registration ID
      const registrationId = Signal.KeyHelper.generateRegistrationId();

      // 2. Generate Identity Key Pair
      const identityKeyPair = await Signal.KeyHelper.generateIdentityKeyPair();

      console.log('Identity Keys Generated successfully');
      
      const keys = {
        registrationId,
        identityKey: identityKeyPair.pubKey,
        privateKey: identityKeyPair.privKey,
      };

      // Auto-save on generation
      await this.saveKeys(keys);

      return keys;
    } catch (error) {
      console.error('Failed to generate identity keys:', error);
      return null;
    }
  }

  static async saveKeys(keys: IdentityKeys): Promise<boolean> {
    try {
      const serialized = JSON.stringify({
        registrationId: keys.registrationId,
        identityKey: arrayBufferToBase64(keys.identityKey),
        privateKey: arrayBufferToBase64(keys.privateKey),
      });
      await SecureStore.setItemAsync(STORAGE_KEY, serialized);
      console.log('Identity Keys Saved to SecureStore');
      return true;
    } catch (error) {
      console.error('Failed to save keys:', error);
      return false;
    }
  }

  static async loadKeys(): Promise<IdentityKeys | null> {
    try {
      const serialized = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!serialized) return null;

      const parsed = JSON.parse(serialized);
      return {
        registrationId: parsed.registrationId,
        identityKey: base64ToArrayBuffer(parsed.identityKey),
        privateKey: base64ToArrayBuffer(parsed.privateKey),
      };
    } catch (error) {
      console.error('Failed to load keys:', error);
      return null;
    }
  }

  static async loadPqKeys(): Promise<{ publicKey: ArrayBuffer; secretKey: ArrayBuffer } | null> {
    try {
      const PQ_STORAGE_KEY = 'pq_identity_keys_v1';
      const serialized = await SecureStore.getItemAsync(PQ_STORAGE_KEY);
      if (!serialized) return null;

      const parsed = JSON.parse(serialized);
      return {
        publicKey: base64ToArrayBuffer(parsed.publicKey),
        secretKey: base64ToArrayBuffer(parsed.secretKey),
      };
    } catch (error) {
      console.error('Failed to load PQ identity keys:', error);
      return null;
    }
  }

  static async savePqKeys(keys: { publicKey: ArrayBuffer; secretKey: ArrayBuffer }): Promise<boolean> {
    try {
      const PQ_STORAGE_KEY = 'pq_identity_keys_v1';
      const serialized = JSON.stringify({
        publicKey: arrayBufferToBase64(keys.publicKey),
        secretKey: arrayBufferToBase64(keys.secretKey),
      });
      await SecureStore.setItemAsync(PQ_STORAGE_KEY, serialized);
      console.log('PQ Identity Keys Saved to SecureStore');
      return true;
    } catch (error) {
      console.error('Failed to save PQ keys:', error);
      return false;
    }
  }

  static async generatePqIdentity(): Promise<{ publicKey: ArrayBuffer; secretKey: ArrayBuffer } | null> {
    try {
      const kemInstance = await createMlKem768();
      const [pk, sk] = kemInstance.generateKeyPair();
      
      const keys = {
        publicKey: pk.buffer as ArrayBuffer,
        secretKey: sk.buffer as ArrayBuffer,
      };

      await this.savePqKeys(keys);
      return keys;
    } catch (error) {
      console.error('Failed to generate PQ identity:', error);
      return null;
    }
  }

  static async generatePreKeyBundle(keys: IdentityKeys, forceRegenerate = false): Promise<any | null> {
    try {
      const { getSignalStoreValue, saveSignalStoreValue } = require('../storage/LocalDb');
      
      const existingSignedPreKeyJson = await getSignalStoreValue('signedprekey:1');
      const existingPqSignedJson = await getSignalStoreValue('pq_signedprekey:1');
      
      let signedPreKeyData: any;
      let preKeysList: any[] = [];
      
      let pqKeys = await this.loadPqKeys();
      if (!pqKeys) {
        pqKeys = await this.generatePqIdentity();
      }
      if (!pqKeys) throw new Error("Failed to generate or load PQ identity keys");

      let pqSignedPreKeyData: any;
      let pqPreKeysList: any[] = [];

      const kemInstance = await createMlKem768();

      if (existingSignedPreKeyJson && existingPqSignedJson && !forceRegenerate) {
        console.log('[IdentityService] Loading existing hybrid prekey bundle from local store...');
        const parsedSigned = JSON.parse(existingSignedPreKeyJson);
        signedPreKeyData = {
          pubKey: parsedSigned.pubKey,
          signature: parsedSigned.signature,
        };

        const parsedPqSigned = JSON.parse(existingPqSignedJson);
        pqSignedPreKeyData = {
          pubKey: parsedPqSigned.pubKey,
          signature: parsedPqSigned.signature,
        };

        for (let i = 1; i <= 100; i++) {
          const preKeyJson = await getSignalStoreValue(`prekey:${i}`);
          if (preKeyJson) {
            const parsedPreKey = JSON.parse(preKeyJson);
            preKeysList.push({
              keyId: i,
              publicKey: parsedPreKey.pubKey,
            });
          }

          const pqPreKeyJson = await getSignalStoreValue(`pq_prekey:${i}`);
          if (pqPreKeyJson) {
            const parsedPqPreKey = JSON.parse(pqPreKeyJson);
            pqPreKeysList.push({
              keyId: i,
              publicKey: parsedPqPreKey.pubKey,
            });
          }
        }
      } else {
        console.log('[IdentityService] Generating 100 new one-time hybrid prekeys and signed prekeys...');
        const identityKeyPair: Signal.KeyPairType = {
          pubKey: keys.identityKey,
          privKey: keys.privateKey,
        };

        // 1. Generate Classic Signed PreKey (signedPreKeyId = 1)
        const signedPreKeyId = 1;
        const signedPreKey = await Signal.KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
        
        const signedPreKeyString = JSON.stringify({
          pubKey: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
          privKey: arrayBufferToBase64(signedPreKey.keyPair.privKey),
          signature: arrayBufferToBase64(signedPreKey.signature),
        });
        await saveSignalStoreValue(`signedprekey:${signedPreKeyId}`, signedPreKeyString);
        
        signedPreKeyData = {
          pubKey: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
          signature: arrayBufferToBase64(signedPreKey.signature),
        };

        // 2. Generate PQ Signed PreKey (pqSignedPreKeyId = 1)
        const [pqSpkPk, pqSpkSk] = kemInstance.generateKeyPair();
        
        // Sign the PQ signed prekey using Bob's classical private key
        const libsignal = require('@privacyresearch/libsignal-protocol-typescript').default;
        const initialized = await libsignal();
        const curve = initialized.Curve;
        const signature = curve.calculateSignature(keys.privateKey, pqSpkPk.buffer as ArrayBuffer);

        const pqSignedPreKeyString = JSON.stringify({
          pubKey: arrayBufferToBase64(pqSpkPk.buffer as ArrayBuffer),
          privKey: arrayBufferToBase64(pqSpkSk.buffer as ArrayBuffer),
          signature: arrayBufferToBase64(signature),
        });
        await saveSignalStoreValue('pq_signedprekey:1', pqSignedPreKeyString);

        pqSignedPreKeyData = {
          pubKey: arrayBufferToBase64(pqSpkPk.buffer as ArrayBuffer),
          signature: arrayBufferToBase64(signature),
        };

        // 3. Generate 100 One-Time PreKeys & 100 One-Time PQ PreKeys
        for (let i = 1; i <= 100; i++) {
          const preKey = await Signal.KeyHelper.generatePreKey(i);
          
          const preKeyString = JSON.stringify({
            pubKey: arrayBufferToBase64(preKey.keyPair.pubKey),
            privKey: arrayBufferToBase64(preKey.keyPair.privKey),
          });
          await saveSignalStoreValue(`prekey:${i}`, preKeyString);

          preKeysList.push({
            keyId: i,
            publicKey: arrayBufferToBase64(preKey.keyPair.pubKey),
          });

          // PQ PreKey
          const [pqPk, pqSk] = kemInstance.generateKeyPair();
          const pqPreKeyString = JSON.stringify({
            pubKey: arrayBufferToBase64(pqPk.buffer as ArrayBuffer),
            privKey: arrayBufferToBase64(pqSk.buffer as ArrayBuffer),
          });
          await saveSignalStoreValue(`pq_prekey:${i}`, pqPreKeyString);

          pqPreKeysList.push({
            keyId: i,
            publicKey: arrayBufferToBase64(pqPk.buffer as ArrayBuffer),
          });
        }
      }

      return {
        registrationId: keys.registrationId,
        identityKey: arrayBufferToBase64(keys.identityKey),
        signedPreKey: {
          keyId: 1,
          publicKey: signedPreKeyData.pubKey,
          signature: signedPreKeyData.signature,
        },
        preKeys: preKeysList,
        // Post-Quantum extensions:
        pqIdentityKey: arrayBufferToBase64(pqKeys.publicKey),
        pqSignedPreKey: {
          keyId: 1,
          publicKey: pqSignedPreKeyData.pubKey,
          signature: pqSignedPreKeyData.signature,
        },
        pqPreKeys: pqPreKeysList,
      };
    } catch (error) {
      console.error('Failed to generate hybrid prekey bundle:', error);
      return null;
    }
  }

  static async clearKeys(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    await SecureStore.deleteItemAsync('pq_identity_keys_v1');
  }

  static async authenticateUser(passphrase: string, isDecoy: boolean = false): Promise<boolean> {
    const { initializeSecureDb } = require('../storage/LocalDb');
    return await initializeSecureDb(passphrase, isDecoy);
  }

  static async executePanicZeroization(): Promise<boolean> {
    console.warn('[IdentityService] Panic Zeroization request received. Purging all keys...');
    await this.clearKeys();
    
    const { executeAppZeroization } = require('../storage/LocalDb');
    return await executeAppZeroization();
  }
}
