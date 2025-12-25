import * as Signal from '@privacyresearch/libsignal-protocol-typescript';
import * as SecureStore from 'expo-secure-store';

// Helper to convert ArrayBuffer to Base64 and back
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
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

  static async clearKeys(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  }
}
