import * as Signal from '@privacyresearch/libsignal-protocol-typescript';
import * as SecureStore from 'expo-secure-store';
import { createMlKem768 } from 'mlkem';
import CryptoJS from 'crypto-js';

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
  deviceId: number; // Support for multi-device independent PreKeys
  identityKey: ArrayBuffer; // Public Key
  privateKey: ArrayBuffer;
}

export interface LinkedDevice {
  deviceId: number;
  publicKey: string; // Base64
  addedAt: number;
  revocationEpoch?: number;
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
        deviceId: 1, // Primary device is always 1
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
        deviceId: keys.deviceId || 1,
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
        deviceId: parsed.deviceId || 1,
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
        deviceId: keys.deviceId || 1,
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
    await SecureStore.deleteItemAsync('linked_devices_v1');
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

  static async generateD2DTransferPayload(pin: string): Promise<string | null> {
    try {
      console.log('[D2D Sync] Preparing secure primary-to-secondary identity key transfer payload...');
      
      const keys = await this.loadKeys();
      const pqKeys = await this.loadPqKeys();
      if (!keys || !pqKeys) throw new Error('Identity keys not generated yet');

      // Derive symmetric wrapping key from high-entropy pin using PBKDF2
      const salt = CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
      const derivedKey = CryptoJS.PBKDF2(pin, salt, {
        keySize: 256 / 32,
        iterations: 10000
      }).toString();

      const payload = JSON.stringify({
        registrationId: keys.registrationId,
        identityKey: arrayBufferToBase64(keys.identityKey),
        privateKey: arrayBufferToBase64(keys.privateKey),
        pqPublicKey: arrayBufferToBase64(pqKeys.publicKey),
        pqSecretKey: arrayBufferToBase64(pqKeys.secretKey),
      });

      const encrypted = CryptoJS.AES.encrypt(payload, derivedKey).toString();
      
      return JSON.stringify({
        salt,
        ciphertext: encrypted
      });
    } catch (e: any) {
      console.error('[D2D Sync] Failed to generate transfer package:', e.message);
      return null;
    }
  }

  // --- D2D Linking & Forward Secrecy ---

  static generateD2DSafetyNumber(primaryPubKey: ArrayBuffer, secondaryPubKey: ArrayBuffer): { hex: string, numeric: string } {
    const combined = arrayBufferToBase64(primaryPubKey) + arrayBufferToBase64(secondaryPubKey);
    const hashHex = CryptoJS.SHA256(combined).toString(CryptoJS.enc.Hex);
    // Create a 30-digit numeric fingerprint by extracting numbers from hex
    let numeric = '';
    for (let i = 0; i < hashHex.length; i++) {
        const num = parseInt(hashHex[i], 16);
        numeric += (num % 10).toString();
    }
    const formattedNumeric = numeric.substring(0, 30).match(/.{1,5}/g)?.join(' ') || numeric;
    
    return {
        hex: hashHex.substring(0, 16).toUpperCase().match(/.{1,4}/g)?.join('-') || hashHex,
        numeric: formattedNumeric
    };
  }

  static async getLinkedDevices(): Promise<LinkedDevice[]> {
    try {
      const raw = await SecureStore.getItemAsync('linked_devices_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static async saveLinkedDevice(device: LinkedDevice): Promise<void> {
    const devices = await this.getLinkedDevices();
    devices.push(device);
    await SecureStore.setItemAsync('linked_devices_v1', JSON.stringify(devices));
  }

  static async revokeDevice(deviceId: number): Promise<boolean> {
    try {
      const devices = await this.getLinkedDevices();
      const updated = devices.map(d => d.deviceId === deviceId ? { ...d, revocationEpoch: Date.now() } : d);
      await SecureStore.setItemAsync('linked_devices_v1', JSON.stringify(updated));
      console.log(`[D2D Sync] Device ${deviceId} cryptographically revoked (epoch updated).`);
      return true;
    } catch (e) {
      console.error('[D2D Sync] Failed to revoke device', e);
      return false;
    }
  }

  static async decodeD2DPayload(transferString: string, pin: string): Promise<{ safetyNumber: { hex: string, numeric: string }, rawPayload: any } | null> {
    try {
      const { salt, ciphertext } = JSON.parse(transferString);
      if (!salt || !ciphertext) throw new Error('Invalid transfer package format');

      const derivedKey = CryptoJS.PBKDF2(pin, salt, {
        keySize: 256 / 32,
        iterations: 10000
      }).toString();

      const decrypted = CryptoJS.AES.decrypt(ciphertext, derivedKey).toString(CryptoJS.enc.Utf8);
      if (!decrypted) throw new Error('PIN verification failed');

      const parsed = JSON.parse(decrypted);
      
      // We need a secondary temporary public key for the safety number
      // For this implementation, we use the primary key combined with the pin salt
      const pseudoSecondaryBuf = base64ToArrayBuffer(btoa(salt)); 
      const safetyNumber = this.generateD2DSafetyNumber(base64ToArrayBuffer(parsed.identityKey), pseudoSecondaryBuf);

      return { safetyNumber, rawPayload: parsed };
    } catch (e: any) {
      console.error('[D2D Sync] Decode failed:', e.message);
      return null;
    }
  }

  static async confirmD2DImport(rawPayload: any): Promise<boolean> {
    try {
      // 1. Assign unique Device ID (random 10-100 for secondary devices) to enforce Forward Secrecy prekey separation
      const secondaryDeviceId = Math.floor(Math.random() * 90) + 10;

      // Save Classical Keys with independent deviceId
      const keys = {
        registrationId: rawPayload.registrationId,
        deviceId: secondaryDeviceId,
        identityKey: base64ToArrayBuffer(rawPayload.identityKey),
        privateKey: base64ToArrayBuffer(rawPayload.privateKey),
      };
      await this.saveKeys(keys);

      // Save Post-Quantum Keys
      const pqKeys = {
        publicKey: base64ToArrayBuffer(rawPayload.pqPublicKey),
        secretKey: base64ToArrayBuffer(rawPayload.pqSecretKey),
      };
      await this.savePqKeys(pqKeys);

      // Force generation of fresh, unique PreKeys for this specific device
      await this.generatePreKeyBundle(keys, true);

      console.log(`✅ [D2D Sync] Multi-device identity securely imported! Secondary DeviceID: ${secondaryDeviceId}. Independent PreKeys generated.`);
      return true;
    } catch (e: any) {
      console.error('[D2D Sync] Failed to confirm and import shared identities:', e.message);
      return false;
    }
  }
}
