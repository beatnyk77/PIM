import * as Signal from '@privacyresearch/libsignal-protocol-typescript';
import { EncryptionService, InMemorySignalProtocolStore } from './EncryptionService';
import { IdentityService } from '../auth/IdentityService';

export async function runEncryptionTest() {
  console.log('--- Starting Encryption/Decryption Test ---');

  try {
    // 1. Initialize Service (Alice)
    const existingKeys = await IdentityService.loadKeys();
    if (!existingKeys) {
      await IdentityService.generateIdentity();
    }
    await EncryptionService.initialize();

    // Access Alice's store (private)
    const aliceStore = (EncryptionService as any).store as InMemorySignalProtocolStore;
    if (!aliceStore) throw new Error('Alice store not initialized');

    // 2. Setup Bob (Manual Store)
    const bobRegistrationId = 222;
    const bobIdentityKeyPair = await Signal.KeyHelper.generateIdentityKeyPair();
    const bobStore = new InMemorySignalProtocolStore(bobIdentityKeyPair, bobRegistrationId);

    // 3. Generate Bob's PreKeys
    const bobPreKey = await Signal.KeyHelper.generatePreKey(bobRegistrationId);
    const bobSignedPreKey = await Signal.KeyHelper.generateSignedPreKey(bobIdentityKeyPair, 1);
    
    // Store Bob's keys in Bob's store (so he can decrypt)
    await bobStore.storePreKey(bobPreKey.keyId, bobPreKey.keyPair);
    await bobStore.storeSignedPreKey(bobSignedPreKey.keyId, bobSignedPreKey.keyPair);

    const bobPreKeyBundle = {
      registrationId: bobRegistrationId,
      identityKey: bobIdentityKeyPair.pubKey,
      signedPreKey: {
        keyId: bobSignedPreKey.keyId,
        publicKey: bobSignedPreKey.keyPair.pubKey,
        signature: bobSignedPreKey.signature,
      },
      preKey: {
        keyId: bobPreKey.keyId,
        publicKey: bobPreKey.keyPair.pubKey,
      },
    };

    // 4. Establish Session (Alice -> Bob)
    const bobUserId = 'bob-user';
    const aliceBuilder = new Signal.SessionBuilder(aliceStore, new Signal.SignalProtocolAddress(bobUserId, 1));
    await aliceBuilder.processPreKey(bobPreKeyBundle);
    console.log('Session established (Alice -> Bob)');

    // 5. Alice Encrypts for Bob
    const messageToBob = "Hello Bob! Secure message.";
    console.log(`Alice sending: "${messageToBob}"`);
    const ciphertext = await EncryptionService.encryptMessage(bobUserId, messageToBob);

    if (!ciphertext) throw new Error('Encryption failed (Alice -> Bob)');
    console.log('Alice encrypted message type:', ciphertext.type);

    // 6. Bob Decrypts
    // Bob needs to process the incoming message.
    // The sender is Alice. We need Alice's address.
    // In a real app, Alice's ID comes from the message envelope. We'll simulate 'alice-user'.
    const aliceUserId = 'alice-user';
    const bobSessionCipher = new Signal.SessionCipher(bobStore, new Signal.SignalProtocolAddress(aliceUserId, 1));
    
    // Note: To decrypt a PreKey message, Bob doesn't need to build a session first; 
    // the message *builds* the session if it contains the necessary key info (which Type 3 does).
    // However, SignalProtocolAddress for the sender must match what Alice used? 
    // No, Alice used Bob's address. Bob uses Alice's address.
    // IMPORTANT: The session is bound to the pair (Alice, Bob).
    // When Alice processes PreKey, she binds session to 'bob-user'.
    // The message generated is for 'bob-user'.
    // Bob receives it. He needs to know it came from 'alice-user'.
    // Does the message contain 'alice-user'? No.
    // But does the PreKey logic require Alice's identity?
    // The message header contains Alice's Identity Key.
    // Bob will trust it (InMemoryStore trusts all).
    
    let decryptedTextBuffer: ArrayBuffer;
    if (ciphertext.type === 3) {
      decryptedTextBuffer = await bobSessionCipher.decryptPreKeyWhisperMessage(ciphertext.body as string, 'binary');
    } else {
      decryptedTextBuffer = await bobSessionCipher.decryptWhisperMessage(ciphertext.body as string, 'binary');
    }
    
    const decryptedText = new TextDecoder().decode(decryptedTextBuffer);
    console.log(`Bob received: "${decryptedText}"`);
    
    if (decryptedText !== messageToBob) throw new Error('Decryption mismatch (Bob)');

    // 7. Bob Replies to Alice (Round Trip)
    const replyText = "Hi Alice! Loud and clear.";
    console.log(`Bob replying: "${replyText}"`);
    
    // Bob now has a session with Alice (established by the incoming message).
    const replyCiphertext = await bobSessionCipher.encrypt(new TextEncoder().encode(replyText).buffer);
    
    // 8. Alice Decrypts
    // Alice receives message from 'bob-user'.
    // Use EncryptionService.decryptMessage
    const aliceDecrypted = await EncryptionService.decryptMessage(bobUserId, replyCiphertext);
    console.log(`Alice received: "${aliceDecrypted}"`);

    if (aliceDecrypted !== replyText) throw new Error('Decryption mismatch (Alice)');

    console.log('--- TEST PASSED: Round Trip Encryption/Decryption ---');
    alert('Encryption Test Passed!');

  } catch (e) {
    console.error('Test Failed:', e);
    alert('Encryption Test Failed (Check Console)');
  }
}
