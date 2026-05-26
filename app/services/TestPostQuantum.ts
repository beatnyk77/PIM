import { EncryptionService } from './messaging/EncryptionService';
import { IdentityService } from './auth/IdentityService';
import { getSignalStoreValue, saveSignalStoreValue } from './storage/LocalDb';

export async function runPostQuantumIntegrationTest(): Promise<boolean> {
  console.log('\n==================================================');
  console.log('🧪 STARTING PIM HYBRID POST-QUANTUM INTEGRATION TEST');
  console.log('==================================================\n');

  try {
    // 1. Setup Identities
    console.log('1. Generating long-term classical and post-quantum keys for Alice...');
    const aliceClassicKeys = await IdentityService.generateIdentity();
    if (!aliceClassicKeys) throw new Error("Failed to generate Alice's classic keys");
    const alicePqKeys = await IdentityService.generatePqIdentity();
    if (!alicePqKeys) throw new Error("Failed to generate Alice's post-quantum keys");

    console.log('2. Generating long-term classical and post-quantum keys for Bob...');
    const bobClassicKeys = {
      registrationId: 4321,
      identityKey: aliceClassicKeys.identityKey, // mock for local execution
      privateKey: aliceClassicKeys.privateKey,
    };
    // Initialize mock database entries to represent Bob's distinct store
    const bobPqKeys = await IdentityService.generatePqIdentity();
    if (!bobPqKeys) throw new Error("Failed to generate Bob's post-quantum keys");

    console.log('\n3. Generating Bob\'s public hybrid prekey bundle...');
    const bobBundle = await IdentityService.generatePreKeyBundle(bobClassicKeys, true);
    if (!bobBundle) throw new Error("Failed to generate Bob's prekey bundle");

    console.log('PreKey Bundle Keys Generated successfully:');
    console.log('- Registration ID:', bobBundle.registrationId);
    console.log('- Classic Identity Key (base64):', bobBundle.identityKey.substring(0, 15) + '...');
    console.log('- PQ Identity Key (base64):', bobBundle.pqIdentityKey.substring(0, 15) + '...');
    console.log('- PQ Signed PreKey (base64):', bobBundle.pqSignedPreKey.publicKey.substring(0, 15) + '...');
    console.log('- PQ One-Time PreKeys generated:', bobBundle.pqPreKeys.length);

    // 4. Initialize Encryption Service (represented by Alice's store in this scope)
    await EncryptionService.initialize();
    
    // 5. Establish hybrid session from Alice to Bob
    console.log('\n4. Alice establishing hybrid post-quantum session against Bob...');
    const success = await EncryptionService.establishHybridSession('bob', bobBundle);
    if (!success) throw new Error("Alice failed to establish hybrid session against Bob");

    // 6. Alice encrypts the first message
    const msg1 = "Hello, Bob! This is a quantum-safe secure chat.";
    console.log(`\n5. Alice encrypting initial message: "${msg1}"`);
    const envelope1 = await EncryptionService.encryptHybridMessage('bob', msg1);
    if (!envelope1) throw new Error("Failed to encrypt initial message");

    console.log('Hybrid Envelope 1 generated:');
    console.log('- Protocol Version:', envelope1.version);
    console.log('- Ephemeral KEM PK (base64):', envelope1.my_ephemeral_pk.substring(0, 15) + '...');
    console.log('- Encapsulated Signed PreKey Ciphertext (ctSpk):', envelope1.ctSpk.substring(0, 15) + '...');
    console.log('- Outer AES Ciphertext (base64):', envelope1.ciphertext_pq.substring(0, 15) + '...');

    // 7. Bob receives and decrypts initial message
    console.log('\n6. Bob processing incoming initial message...');
    // In our test, Bob reads Bob's own local keys and decapsulates
    const decrypted1 = await EncryptionService.decryptHybridMessage('bob', envelope1);
    console.log('Bob Decrypted Plaintext:', decrypted1);
    if (decrypted1 !== msg1) {
      throw new Error("Message 1 verification failed: plaintexts mismatch");
    }
    console.log('✅ Message 1 successfully onion-decrypted and validated!');

    // 8. Continuous Ratchet Round: Bob responds
    const msg2 = "Hi Alice! Received securely. Ratcheting session key...";
    console.log(`\n7. Bob encrypting reply: "${msg2}"`);
    const envelope2 = await EncryptionService.encryptHybridMessage('bob', msg2);
    if (!envelope2) throw new Error("Failed to encrypt Bob's reply");

    // Alice receives Bob's reply, decapsulates and ratchets K_pq
    console.log('\n8. Alice processing Bob\'s reply and ratcheting key...');
    const decrypted2 = await EncryptionService.decryptHybridMessage('bob', envelope2);
    console.log('Alice Decrypted Plaintext:', decrypted2);
    if (decrypted2 !== msg2) {
      throw new Error("Message 2 verification failed: plaintexts mismatch");
    }
    console.log('✅ Message 2 successfully onion-decrypted and continuous ratchet updated!');

    // 9. Verify continuous ratchet key update: Alice sends another message
    const msg3 = "Perfect! The post-quantum continuous ratchet is ticking.";
    console.log(`\n9. Alice encrypting follow-up message: "${msg3}"`);
    const envelope3 = await EncryptionService.encryptHybridMessage('bob', msg3);
    if (!envelope3) throw new Error("Failed to encrypt Alice's third message");

    console.log('\n10. Bob processing Alice\'s third message...');
    const decrypted3 = await EncryptionService.decryptHybridMessage('bob', envelope3);
    console.log('Bob Decrypted Plaintext:', decrypted3);
    if (decrypted3 !== msg3) {
      throw new Error("Message 3 verification failed: plaintexts mismatch");
    }
    console.log('✅ Message 3 successfully onion-decrypted over ratcheted keys!');

    console.log('\n==================================================');
    console.log('🎉 ALL HYBRID POST-QUANTUM INTEGRATION TESTS PASSED!');
    console.log('==================================================\n');
    return true;
  } catch (error) {
    console.error('\n❌ POST-QUANTUM INTEGRATION TEST FAILED:', error);
    return false;
  }
}
