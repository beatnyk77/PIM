import * as Signal from '@privacyresearch/libsignal-protocol-typescript';
import { IdentityService } from '../auth/IdentityService';

// We need to implement a basic SignalProtocolStore
// For now, we'll use an in-memory store for the skeleton
// In a real app, this should persist to SecureStore/LocalDb
class InMemorySignalProtocolStore implements Signal.StorageType {
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

  // --- Stubs for other required methods ---
  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    console.log(`[Store] Saving identity for ${identifier}`);
    return true;
  }
  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, direction: Signal.Direction): Promise<boolean> {
    return true; // Trust everyone for now
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
  private store: InMemorySignalProtocolStore | null = null;

  async initialize() {
    console.log('EncryptionService: Initializing...');
    const keys = await IdentityService.loadKeys();
    
    if (!keys) {
      console.warn('EncryptionService: No identity keys found.');
      return;
    }

    // Convert keys back to Signal format if needed, or just pass them
    // Note: IdentityService keys are ArrayBuffers.
    const identityKeyPair: Signal.KeyPairType = {
      pubKey: keys.identityKey,
      privKey: keys.privateKey,
    };

    this.store = new InMemorySignalProtocolStore(identityKeyPair, keys.registrationId);
    console.log('EncryptionService: Store initialized with Registration ID', keys.registrationId);
  }

  isInitialized(): boolean {
    return !!this.store;
  }

  async encryptMessage(remoteUserId: string, message: string): Promise<Signal.MessageType | null> {
    if (!this.store) {
      console.error('EncryptionService: Not initialized');
      return null;
    }

    const address = new Signal.SignalProtocolAddress(remoteUserId, 1); // Device ID 1
    const sessionCipher = new Signal.SessionCipher(this.store, address);

    try {
      // In a real flow, we would need to build a session first if it doesn't exist
      // For this task, we assume session exists or we'll get an error
      // Note: encrypt returns a CiphertextMessage object (type: number, body: string)
      const ciphertext = await sessionCipher.encrypt(new TextEncoder().encode(message).buffer);
      return ciphertext;
    } catch (e) {
      console.error(`EncryptionService: Failed to encrypt for ${remoteUserId}`, e);
      return null;
    }
  }
}

export const EncryptionService = new EncryptionServiceClass();
