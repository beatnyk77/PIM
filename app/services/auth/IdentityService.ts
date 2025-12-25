import * as Signal from '@privacyresearch/libsignal-protocol-typescript';
import * as Crypto from 'expo-crypto';

// Polyfill for random values if needed (Expo usually handles this, but for Signal protocol compatibility)
// We might need to ensure window.crypto.getRandomValues is available.

export interface IdentityKeys {
  registrationId: number;
  identityKey: ArrayBuffer; // Public Key
  privateKey: ArrayBuffer;
}

export class IdentityService {
  static async generateIdentity(): Promise<IdentityKeys | null> {
    try {
      // 1. Generate Registration ID
      const registrationId = Signal.KeyHelper.generateRegistrationId();

      // 2. Generate Identity Key Pair
      const identityKeyPair = await Signal.KeyHelper.generateIdentityKeyPair();

      console.log('Identity Keys Generated successfully');
      
      return {
        registrationId,
        identityKey: identityKeyPair.pubKey,
        privateKey: identityKeyPair.privKey,
      };
    } catch (error) {
      console.error('Failed to generate identity keys:', error);
      return null;
    }
  }
}
