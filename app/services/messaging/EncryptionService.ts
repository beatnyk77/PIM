import * as Signal from '@privacyresearch/libsignal-protocol-typescript';
import { IdentityService, arrayBufferToBase64, base64ToArrayBuffer } from '../auth/IdentityService';
import { getSignalStoreValue, saveSignalStoreValue, deleteSignalStoreValue } from '../storage/LocalDb';
import { createMlKem768 } from 'mlkem';

import CryptoJS from 'crypto-js';

// --- Symmetric Encryption Helpers for Post-Quantum Hybrid Onion Envelope ---
function encryptSymmetric(plaintext: string, hexKey: string): { ciphertext: string; iv: string } {
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Hex.parse(hexKey), {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return {
    ciphertext: encrypted.toString(),
    iv: iv.toString()
  };
}

function decryptSymmetric(ciphertext: string, hexKey: string, ivHex: string): string {
  const decrypted = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Hex.parse(hexKey), {
    iv: CryptoJS.enc.Hex.parse(ivHex),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

// --- Standard HKDF-SHA256 Implementation using CryptoJS ---
function hkdfSha256(ikm: CryptoJS.lib.WordArray, salt: CryptoJS.lib.WordArray, info: string, length: number): string {
  let localSalt = salt;
  if (!localSalt) {
    localSalt = CryptoJS.lib.WordArray.create(new Uint8Array(32) as any);
  }
  
  // Extract: PRK = HMAC-SHA256(salt, IKM)
  const prk = CryptoJS.HmacSHA256(ikm, localSalt);
  
  // Expand
  let okm = CryptoJS.lib.WordArray.create();
  let t = CryptoJS.lib.WordArray.create();
  let i = 1;
  
  const infoWords = CryptoJS.enc.Utf8.parse(info);
  
  while (okm.sigBytes < length) {
    // T(i) = HMAC-SHA256(PRK, T(i-1) | info | i)
    const currentPayload = t.clone().concat(infoWords).concat(CryptoJS.lib.WordArray.create([i << 24], 1));
    t = CryptoJS.HmacSHA256(currentPayload, prk);
    okm = okm.concat(t);
    i++;
  }
  
  okm.sigBytes = length;
  okm.clamp();
  return okm.toString(CryptoJS.enc.Hex);
}

// Helpers to serialize/deserialize KeyPairType (ArrayBuffers) to/from secure DB
function serializeKeyPair(keyPair: Signal.KeyPairType): string {
  return JSON.stringify({
    pubKey: arrayBufferToBase64(keyPair.pubKey),
    privKey: arrayBufferToBase64(keyPair.privKey),
  });
}

function deserializeKeyPair(json: string): Signal.KeyPairType {
  const parsed = JSON.parse(json);
  return {
    pubKey: base64ToArrayBuffer(parsed.pubKey),
    privKey: base64ToArrayBuffer(parsed.privKey),
  };
}

// Queue system to serialize asynchronous writes to the same session record, preventing desync
class SessionWriteQueue {
  private static queues: Map<string, Promise<void>> = new Map();

  static async enqueue(identifier: string, task: () => Promise<void>): Promise<void> {
    const existing = this.queues.get(identifier) || Promise.resolve();
    const next = existing.then(task).catch((err) => {
      console.error(`SessionWriteQueue: Error executing session task for ${identifier}`, err);
    });
    this.queues.set(identifier, next);
    return next;
  }
}

// Persistent Signal Store implementation mapping all operations directly to WatermelonDB/SecureStore
export class PersistentSignalProtocolStore implements Signal.StorageType {
  private identityKeyPair: Signal.KeyPairType | undefined;
  private localRegistrationId: number | undefined;

  constructor(identityKeyPair?: Signal.KeyPairType, registrationId?: number) {
    this.identityKeyPair = identityKeyPair;
    this.localRegistrationId = registrationId;
  }

  async getIdentityKeyPair(): Promise<Signal.KeyPairType | undefined> {
    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.localRegistrationId;
  }

  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    console.log(`[Store] Saving identity for ${identifier}`);
    await saveSignalStoreValue(`identity:${identifier}`, arrayBufferToBase64(identityKey));
    return true;
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, direction: Signal.Direction): Promise<boolean> {
    const savedBase64 = await getSignalStoreValue(`identity:${identifier}`);
    if (!savedBase64) {
      // First use, save and trust
      await this.saveIdentity(identifier, identityKey);
      return true;
    }
    const savedKey = base64ToArrayBuffer(savedBase64);
    const isMatch = this.compareBuffers(identityKey, savedKey);
    if (!isMatch) {
      console.warn(`[Store] Identity mismatch for user ${identifier}! Possible MITM!`);
    }
    return isMatch;
  }

  private compareBuffers(buf1: ArrayBuffer, buf2: ArrayBuffer): boolean {
    if (buf1.byteLength !== buf2.byteLength) return false;
    const dv1 = new Uint8Array(buf1);
    const dv2 = new Uint8Array(buf2);
    for (let i = 0; i < dv1.length; i++) {
      if (dv1[i] !== dv2[i]) return false;
    }
    return true;
  }

  async loadPreKey(keyId: string | number): Promise<Signal.KeyPairType | undefined> {
    const raw = await getSignalStoreValue(`prekey:${keyId}`);
    return raw ? deserializeKeyPair(raw) : undefined;
  }

  async storePreKey(keyId: string | number, keyPair: Signal.KeyPairType): Promise<void> {
    await saveSignalStoreValue(`prekey:${keyId}`, serializeKeyPair(keyPair));
  }

  async removePreKey(keyId: string | number): Promise<void> {
    await deleteSignalStoreValue(`prekey:${keyId}`);
  }

  async loadSignedPreKey(keyId: string | number): Promise<Signal.KeyPairType | undefined> {
    const raw = await getSignalStoreValue(`signedprekey:${keyId}`);
    return raw ? deserializeKeyPair(raw) : undefined;
  }

  async storeSignedPreKey(keyId: string | number, keyPair: Signal.KeyPairType): Promise<void> {
    await saveSignalStoreValue(`signedprekey:${keyId}`, serializeKeyPair(keyPair));
  }

  async removeSignedPreKey(keyId: string | number): Promise<void> {
    await deleteSignalStoreValue(`signedprekey:${keyId}`);
  }

  async loadSession(identifier: string): Promise<string | undefined> {
    return await getSignalStoreValue(`session:${identifier}`);
  }

  async storeSession(identifier: string, record: string): Promise<void> {
    await SessionWriteQueue.enqueue(identifier, async () => {
      await saveSignalStoreValue(`session:${identifier}`, record);
    });
  }
}

// In-Memory implementation kept to preserve offline/transient tests (like TestEncryption.ts)
export class InMemorySignalProtocolStore implements Signal.StorageType {
  private identityKeyPair: Signal.KeyPairType | undefined;
  private localRegistrationId: number | undefined;
  private sessions: Map<string, string> = new Map();

  constructor(identityKeyPair?: Signal.KeyPairType, registrationId?: number) {
    this.identityKeyPair = identityKeyPair;
    this.localRegistrationId = registrationId;
  }

  async getIdentityKeyPair(): Promise<Signal.KeyPairType | undefined> {
    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.localRegistrationId;
  }

  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    console.log(`[Store] Saving identity for ${identifier}`);
    return true;
  }
  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, direction: Signal.Direction): Promise<boolean> {
    return true;
  }
  async loadPreKey(keyId: string | number): Promise<Signal.KeyPairType | undefined> { return undefined; }
  async storePreKey(keyId: string | number, keyPair: Signal.KeyPairType): Promise<void> {}
  async removePreKey(keyId: string | number): Promise<void> {}
  async loadSignedPreKey(keyId: string | number): Promise<Signal.KeyPairType | undefined> { return undefined; }
  async storeSignedPreKey(keyId: string | number, keyPair: Signal.KeyPairType): Promise<void> {}
  async removeSignedPreKey(keyId: string | number): Promise<void> {}
  async loadSession(identifier: string): Promise<string | undefined> { 
    return this.sessions.get(identifier); 
  }
  async storeSession(identifier: string, record: string): Promise<void> {
    this.sessions.set(identifier, record);
  }
}

class EncryptionServiceClass {
  private store: PersistentSignalProtocolStore | null = null;

  async initialize() {
    console.log('EncryptionService: Initializing...');
    const keys = await IdentityService.loadKeys();
    
    if (!keys) {
      console.warn('EncryptionService: No identity keys found.');
      return;
    }

    const identityKeyPair: Signal.KeyPairType = {
      pubKey: keys.identityKey,
      privKey: keys.privateKey,
    };

    this.store = new PersistentSignalProtocolStore(identityKeyPair, keys.registrationId);
    console.log('EncryptionService: Persistent Store initialized with Registration ID', keys.registrationId);
  }

  isInitialized(): boolean {
    return !!this.store;
  }

  async hasSession(remoteUserId: string): Promise<boolean> {
    if (!this.store) return false;
    const session = await this.store.loadSession(remoteUserId);
    return !!session;
  }

  async establishSession(remoteUserId: string, bundle: any): Promise<boolean> {
    if (!this.store) {
      console.error('EncryptionService: Store not initialized');
      return false;
    }

    try {
      console.log(`EncryptionService: Handshaking with ${remoteUserId}...`);
      const address = new Signal.SignalProtocolAddress(remoteUserId, 1);
      const sessionBuilder = new Signal.SessionBuilder(this.store, address);

      // Assemble PreKeyBundle with ArrayBuffers
      const formattedBundle = {
        registrationId: bundle.registrationId,
        identityKey: base64ToArrayBuffer(bundle.identityKey),
        signedPreKey: {
          keyId: bundle.signedPreKey.keyId,
          publicKey: base64ToArrayBuffer(bundle.signedPreKey.publicKey),
          signature: base64ToArrayBuffer(bundle.signedPreKey.signature),
        },
        preKey: bundle.preKeys && bundle.preKeys.length > 0 ? {
          keyId: bundle.preKeys[0].keyId,
          publicKey: base64ToArrayBuffer(bundle.preKeys[0].publicKey),
        } : undefined,
      };

      await sessionBuilder.processPreKey(formattedBundle);
      console.log(`EncryptionService: Cryptographic session established with ${remoteUserId}`);
      return true;
    } catch (e) {
      console.error(`EncryptionService: Failed to establish session with ${remoteUserId}`, e);
      return false;
    }
  }

  async establishHybridSession(remoteUserId: string, bundle: any): Promise<boolean> {
    if (!this.store) {
      console.error('EncryptionService: Store not initialized');
      return false;
    }

    try {
      console.log(`EncryptionService: Establishing hybrid session with ${remoteUserId}...`);
      
      // 1. Establish classical session
      const classicEstablished = await this.establishSession(remoteUserId, bundle);
      if (!classicEstablished) {
        throw new Error("Classic session establishment failed");
      }

      // 2. Perform ML-KEM-768 key exchange
      const kemInstance = await createMlKem768();
      
      if (!bundle.pqSignedPreKey || !bundle.pqIdentityKey) {
        console.warn(`EncryptionService: Remote user ${remoteUserId} does not have post-quantum keys registered. Falling back to classical-only session key derivation.`);
        const fallbackSecret = "FALLBACK-CLASSIC-PQ-SECRET-SEED";
        const fallbackHex = CryptoJS.SHA256(fallbackSecret).toString();
        await saveSignalStoreValue(`pq_session_key:${remoteUserId}`, fallbackHex);
        return true;
      }

      const bobSpkBuffer = base64ToArrayBuffer(bundle.pqSignedPreKey.publicKey);
      const [ctSpk, ssSpk] = kemInstance.encap(new Uint8Array(bobSpkBuffer));

      let ctOpkBase64: string | undefined;
      let ssOpk: Uint8Array | null = null;
      let opkId: number | undefined;

      if (bundle.pqPreKeys && bundle.pqPreKeys.length > 0) {
        const opk = bundle.pqPreKeys[0];
        opkId = opk.keyId;
        const bobOpkBuffer = base64ToArrayBuffer(opk.publicKey);
        const [ctOpk, secretOpk] = kemInstance.encap(new Uint8Array(bobOpkBuffer));
        ctOpkBase64 = arrayBufferToBase64(ctOpk.buffer as ArrayBuffer);
        ssOpk = secretOpk;
        console.log(`EncryptionService: Encapsulated KEM one-time prekey ${opkId} for ${remoteUserId}`);
      }

      // Combine shared secrets
      const combinedSecrets = new Uint8Array(32 + (ssOpk ? 32 : 0));
      combinedSecrets.set(ssSpk, 0);
      if (ssOpk) {
        combinedSecrets.set(ssOpk, 32);
      }

      // Derivation of the post-quantum master key
      const ikm = CryptoJS.lib.WordArray.create(combinedSecrets as any);
      const salt = CryptoJS.lib.WordArray.create(new Uint8Array(32) as any);
      const K_pq = hkdfSha256(ikm, salt, "PIM-PQ-MASTER-KEY-DERIVATION", 32);

      // Save initial PQ session key and handshaking parameters
      await saveSignalStoreValue(`pq_session_key:${remoteUserId}`, K_pq);
      
      const handshakeInfo = {
        ctSpk: arrayBufferToBase64(ctSpk.buffer as ArrayBuffer),
        ctOpk: ctOpkBase64,
        opkId: opkId
      };
      await saveSignalStoreValue(`pq_handshake_outbound:${remoteUserId}`, JSON.stringify(handshakeInfo));
      console.log(`EncryptionService: Hybrid KEM master key successfully established for ${remoteUserId}`);

      return true;
    } catch (e) {
      console.error(`EncryptionService: Failed to establish hybrid session with ${remoteUserId}`, e);
      return false;
    }
  }

  async encryptHybridMessage(remoteUserId: string, message: string): Promise<any | null> {
    if (!this.store) {
      console.error('EncryptionService: Not initialized');
      return null;
    }

    try {
      console.log(`EncryptionService: Encrypting hybrid message for ${remoteUserId}...`);
      
      // 1. Classical encryption
      const classicCiphertext = await this.encryptMessage(remoteUserId, message);
      if (!classicCiphertext) return null;

      // 2. Load or establish post-quantum keys
      let K_pq = await getSignalStoreValue(`pq_session_key:${remoteUserId}`);
      
      // Check if we have outbound handshake info that hasn't been sent yet
      const handshakeInfoJson = await getSignalStoreValue(`pq_handshake_outbound:${remoteUserId}`);
      let handshakeInfo: any = null;
      if (handshakeInfoJson) {
        handshakeInfo = JSON.parse(handshakeInfoJson);
        await deleteSignalStoreValue(`pq_handshake_outbound:${remoteUserId}`);
      }

      const kemInstance = await createMlKem768();
      
      // Generate a new ephemeral ML-KEM-768 key pair for continuous ratcheting
      const [ePk, eSk] = kemInstance.generateKeyPair();
      await saveSignalStoreValue(`pq_my_ephemeral_sk:${remoteUserId}`, arrayBufferToBase64(eSk.buffer as ArrayBuffer));

      // Check if Bob sent us a new ephemeral post-quantum key in his last message
      const bobEpk = await getSignalStoreValue(`pq_remote_ephemeral_pk:${remoteUserId}`);
      let ctEpkBase64: string | null = null;

      if (bobEpk && K_pq) {
        console.log(`EncryptionService: Ratcheting session key using remote's ephemeral public key...`);
        const [ct, ss] = kemInstance.encap(new Uint8Array(base64ToArrayBuffer(bobEpk)));
        ctEpkBase64 = arrayBufferToBase64(ct.buffer as ArrayBuffer);

        K_pq = hkdfSha256(
          CryptoJS.lib.WordArray.create(ss as any),
          CryptoJS.enc.Hex.parse(K_pq),
          "PIM-PQ-RATCHET-UPDATE",
          32
        );
        await saveSignalStoreValue(`pq_session_key:${remoteUserId}`, K_pq);
        
        await deleteSignalStoreValue(`pq_remote_ephemeral_pk:${remoteUserId}`);
      }

      if (!K_pq) {
        console.warn('EncryptionService: No active PQ session key. Establishing fallback key.');
        K_pq = CryptoJS.SHA256("FALLBACK-CLASSIC-PQ-SECRET-SEED").toString();
        await saveSignalStoreValue(`pq_session_key:${remoteUserId}`, K_pq);
      }

      // 3. Encrypt the classic ciphertext envelope symmetrically using K_pq
      const classicString = JSON.stringify(classicCiphertext);
      const symmetricResult = encryptSymmetric(classicString, K_pq);

      const envelope = {
        version: 'v2_hybrid_kem',
        ciphertext_classic: classicCiphertext,
        my_ephemeral_pk: arrayBufferToBase64(ePk.buffer as ArrayBuffer),
        ct_ephemeral: ctEpkBase64,
        ciphertext_pq: symmetricResult.ciphertext,
        nonce: symmetricResult.iv,
        ctSpk: handshakeInfo?.ctSpk,
        ctOpk: handshakeInfo?.ctOpk,
        opkId: handshakeInfo?.opkId
      };

      return envelope;
    } catch (e) {
      console.error('EncryptionService: Failed hybrid encryption', e);
      return null;
    }
  }

  async decryptHybridMessage(remoteUserId: string, envelope: any): Promise<string | null> {
    if (!this.store) {
      console.error('EncryptionService: Not initialized');
      return null;
    }

    try {
      if (!envelope || envelope.version !== 'v2_hybrid_kem') {
        console.log('EncryptionService: Decoding legacy classical envelope...');
        return this.decryptMessage(remoteUserId, envelope);
      }

      console.log(`EncryptionService: Decrypting hybrid envelope from ${remoteUserId}...`);

      const kemInstance = await createMlKem768();
      let K_pq = await getSignalStoreValue(`pq_session_key:${remoteUserId}`);

      // 1. Process PQ handshake if it's the initial message and we don't have a K_pq yet
      if (!K_pq && envelope.ctSpk) {
        console.log('EncryptionService: Initial hybrid message received. Executing KEM decapsulations...');
        
        // Load our private KEM signed prekey
        const rawSpk = await getSignalStoreValue('pq_signedprekey:1');
        if (!rawSpk) throw new Error("Local private KEM signed prekey not found");
        const parsedSpk = JSON.parse(rawSpk);
        const bobSkSpk = base64ToArrayBuffer(parsedSpk.privKey);

        const ssSpk = kemInstance.decap(new Uint8Array(base64ToArrayBuffer(envelope.ctSpk)), new Uint8Array(bobSkSpk));

        let ssOpk: Uint8Array | null = null;
        if (envelope.ctOpk && envelope.opkId) {
          const rawOpk = await getSignalStoreValue(`pq_prekey:${envelope.opkId}`);
          if (rawOpk) {
            const parsedOpk = JSON.parse(rawOpk);
            const bobSkOpk = base64ToArrayBuffer(parsedOpk.privKey);
            ssOpk = kemInstance.decap(new Uint8Array(base64ToArrayBuffer(envelope.ctOpk)), new Uint8Array(bobSkOpk));
            
            await deleteSignalStoreValue(`pq_prekey:${envelope.opkId}`);
            console.log(`EncryptionService: Decapsulated and physically deleted KEM prekey ${envelope.opkId}`);
          }
        }

        // Combine shared secrets
        const combinedSecrets = new Uint8Array(32 + (ssOpk ? 32 : 0));
        combinedSecrets.set(ssSpk, 0);
        if (ssOpk) {
          combinedSecrets.set(ssOpk, 32);
        }

        const ikm = CryptoJS.lib.WordArray.create(combinedSecrets as any);
        const salt = CryptoJS.lib.WordArray.create(new Uint8Array(32) as any);
        K_pq = hkdfSha256(ikm, salt, "PIM-PQ-MASTER-KEY-DERIVATION", 32);
        await saveSignalStoreValue(`pq_session_key:${remoteUserId}`, K_pq);
      }

      // 2. Process active ratchet update if Alice encapsulated a secret against our previous ephemeral key
      if (envelope.ct_ephemeral && K_pq) {
        const mySk = await getSignalStoreValue(`pq_my_ephemeral_sk:${remoteUserId}`);
        if (mySk) {
          console.log(`EncryptionService: Applying continuous post-quantum ratchet update...`);
          const ss = kemInstance.decap(
            new Uint8Array(base64ToArrayBuffer(envelope.ct_ephemeral)),
            new Uint8Array(base64ToArrayBuffer(mySk))
          );

          K_pq = hkdfSha256(
            CryptoJS.lib.WordArray.create(ss as any),
            CryptoJS.enc.Hex.parse(K_pq),
            "PIM-PQ-RATCHET-UPDATE",
            32
          );
          await saveSignalStoreValue(`pq_session_key:${remoteUserId}`, K_pq);
          
          await deleteSignalStoreValue(`pq_my_ephemeral_sk:${remoteUserId}`);
        }
      }

      if (!K_pq) {
        console.warn('EncryptionService: No active PQ session key. Performing fallback decryption.');
        K_pq = CryptoJS.SHA256("FALLBACK-CLASSIC-PQ-SECRET-SEED").toString();
      }

      // 3. Decrypt outer symmetric layer
      const classicString = decryptSymmetric(envelope.ciphertext_pq, K_pq, envelope.nonce);
      if (!classicString) {
        throw new Error("Symmetric outer decryption failed (keys/IV mismatch)");
      }

      const parsedClassic = JSON.parse(classicString);

      // 4. Cache remote's new ephemeral public key for our next sent message
      if (envelope.my_ephemeral_pk) {
        await saveSignalStoreValue(`pq_remote_ephemeral_pk:${remoteUserId}`, envelope.my_ephemeral_pk);
      }

      // 5. Decrypt inner classic layer
      return this.decryptMessage(remoteUserId, parsedClassic);
    } catch (e) {
      console.error('EncryptionService: Failed hybrid decryption', e);
      return null;
    }
  }

  async encryptMessage(remoteUserId: string, message: string): Promise<Signal.MessageType | null> {
    if (!this.store) {
      console.error('EncryptionService: Not initialized');
      return null;
    }

    const address = new Signal.SignalProtocolAddress(remoteUserId, 1);
    const sessionCipher = new Signal.SessionCipher(this.store, address);

    try {
      const ciphertext = await sessionCipher.encrypt(new TextEncoder().encode(message).buffer);
      return ciphertext;
    } catch (e) {
      console.error(`EncryptionService: Failed to encrypt for ${remoteUserId}`, e);
      return null;
    }
  }

  async decryptMessage(remoteUserId: string, ciphertext: Signal.MessageType): Promise<string | null> {
    if (!this.store) {
      console.error('EncryptionService: Not initialized');
      return null;
    }

    const address = new Signal.SignalProtocolAddress(remoteUserId, 1);
    const sessionCipher = new Signal.SessionCipher(this.store, address);

    try {
      let plaintextBuffer: ArrayBuffer;
      
      if (ciphertext.type === 3) {
        plaintextBuffer = await sessionCipher.decryptPreKeyWhisperMessage(ciphertext.body as string, 'binary');
      } else if (ciphertext.type === 1) {
        plaintextBuffer = await sessionCipher.decryptWhisperMessage(ciphertext.body as string, 'binary');
      } else {
        console.warn('EncryptionService: Unknown message type', ciphertext.type);
        return null;
      }

      return new TextDecoder().decode(plaintextBuffer);
    } catch (e) {
      console.error(`EncryptionService: Failed to decrypt from ${remoteUserId}`, e);
      return null;
    }
  }

  async getSafetyNumber(remoteUserId: string): Promise<string | null> {
    if (!this.store) return null;

    try {
      // 1. Get local Identity Key
      const localKeys = await IdentityService.loadKeys();
      if (!localKeys) return null;
      const localKeyBase64 = arrayBufferToBase64(localKeys.identityKey);

      // 2. Get remote Identity Key
      const remoteKeyBase64 = await getSignalStoreValue(`identity:${remoteUserId}`);
      if (!remoteKeyBase64) return null;

      // 3. Sort keys lexicographically to ensure order-independence
      const sortedKeys = [localKeyBase64, remoteKeyBase64].sort();
      const combinedPayload = sortedKeys.join(':');

      // 4. Compute SHA-256 fingerprint hash
      const hash = CryptoJS.SHA256(combinedPayload).toString();

      // 5. Format as 8 blocks of 4 hex characters, capitalized: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
      const cleaned = hash.toUpperCase();
      const blocks: string[] = [];
      for (let i = 0; i < 32; i += 4) {
        blocks.push(cleaned.substring(i, i + 4));
      }
      return blocks.join('-');
    } catch (e) {
      console.error('EncryptionService: Failed to compute safety number', e);
      return null;
    }
  }
}

export const EncryptionService = new EncryptionServiceClass();
