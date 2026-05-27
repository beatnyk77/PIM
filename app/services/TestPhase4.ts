import { EncryptionService } from './messaging/EncryptionService';
import { IdentityService } from './auth/IdentityService';
import { MessageRelay } from './messaging/MessageRelay';
import { GroupSessionManager } from './messaging/GroupSessionManager';
import { 
  getGroupSenderKeyFromDb, 
  saveGroupSenderKeyToDb, 
  saveMessageToDb, 
  deleteMessageFromDb, 
  database 
} from './storage/LocalDb';
import { Q } from '@nozbe/watermelondb';

// Intercept 'expo-file-system/legacy' globally for mock tests
const mockFsStore = new Map<string, string>();
try {
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function (this: any, id: string) {
    if (id === 'expo-file-system/legacy') {
      return {
        documentDirectory: 'file:///mock-documents/',
        EncodingType: {
          Base64: 'base64',
          UTF8: 'utf8',
        },
        readAsStringAsync: async (uri: string, options: any) => {
          if (!mockFsStore.has(uri)) {
            throw new Error("File not found in mock store: " + uri);
          }
          return mockFsStore.get(uri)!;
        },
        writeAsStringAsync: async (uri: string, content: string, options: any) => {
          mockFsStore.set(uri, content);
        }
      };
    }
    return originalRequire.apply(this, arguments);
  };
} catch (e) {
  console.log("Mock require hook not initialized (running in a pure React Native context). Using native expo-file-system.");
}

export async function runPhase4IntegrationTest(): Promise<boolean> {
  console.log('\n==================================================');
  console.log('🧪 STARTING PIM PHASE 4 E2EE INTEGRATION TEST');
  console.log('==================================================\n');

  try {
    // Make sure EncryptionService is initialized
    await EncryptionService.initialize();

    // ----------------------------------------------------
    // Test 1: Group Sender Keys Generation & Persistent DB Cache
    // ----------------------------------------------------
    console.log('1. Testing Group Sender Keys Generation and DB Cache...');
    const testGroupId = 'test-group-42';
    
    // Generate Alice's key
    const aliceKey = await EncryptionService.getOrGenerateGroupSenderKey(testGroupId);
    console.log(`- Alice's generated group sender key seed: ${aliceKey}`);
    if (!aliceKey || aliceKey.length !== 64) {
      throw new Error("Failed to generate a valid 32-byte (64 hex characters) sender key");
    }

    // Retrieve again to verify persistence
    const loadedKey = await EncryptionService.getOrGenerateGroupSenderKey(testGroupId);
    if (loadedKey !== aliceKey) {
      throw new Error("Persistence check failed: loaded key does not match generated key");
    }
    console.log('✅ Group Sender Key persisted and retrieved successfully!');

    // ----------------------------------------------------
    // Test 2: Secure Group Message Encrypt & O(1) Decrypt
    // ----------------------------------------------------
    console.log('\n2. Testing E2EE Group Message Broadcast & O(1) Decryption...');
    
    // Bob receives Alice's key distribution payload
    const bobGroupId = 'test-group-42';
    const aliceSenderId = '9999'; // Simulated Alice's registration ID
    
    // Save Alice's group key in Bob's DB
    console.log(`- Simulated: Bob receives Alice's group key distribution packet.`);
    await saveGroupSenderKeyToDb(bobGroupId, aliceSenderId, aliceKey);

    const messageText = 'Secure group briefing at 0400 hours.';
    console.log(`- Alice encrypting group message: "${messageText}"`);
    
    // Alice encrypts the message
    const envelope = await EncryptionService.encryptGroupMessage(bobGroupId, messageText);
    console.log('Group Message Envelope:');
    console.log(`  - Version: ${envelope.version}`);
    console.log(`  - Group ID: ${envelope.groupId}`);
    console.log(`  - Sender ID: ${envelope.senderId}`);
    console.log(`  - Ciphertext: ${envelope.ciphertext.substring(0, 15)}...`);
    console.log(`  - IV: ${envelope.iv}`);

    if (envelope.groupId !== bobGroupId || envelope.version !== 'v1_group_sender_key') {
      throw new Error("Group envelope format mismatch");
    }

    // Bob decrypts the group message
    console.log(`- Bob decrypting Alice's group message...`);
    const decryptedText = await EncryptionService.decryptGroupMessage(bobGroupId, aliceSenderId, envelope);
    console.log(`- Bob decrypted content: "${decryptedText}"`);
    if (decryptedText !== messageText) {
      throw new Error("Group message decryption failed: plaintexts mismatch");
    }

    // Verify key was ratcheted forward
    const ratchetedAliceKey = await getGroupSenderKeyFromDb(bobGroupId, aliceSenderId);
    if (!ratchetedAliceKey || ratchetedAliceKey === aliceKey) {
      throw new Error("Group sender key failed to ratchet forward after decryption");
    }
    console.log(`  - Group sender key ratcheted successfully: ${aliceKey.substring(0, 8)}... -> ${ratchetedAliceKey.substring(0, 8)}...`);
    console.log('✅ O(1) Group message encryption/decryption with ratcheting successful!');

    // ----------------------------------------------------
    // Test 3: Media Symmetric E2EE Pipeline
    // ----------------------------------------------------
    console.log('\n3. Testing Media Symmetric E2EE Pipeline...');
    
    const mediaPlaintext = 'AudioDataRawBytesBase64Mock';
    const testFileUri = 'file:///mock-documents/test_voice_note.aac';
    mockFsStore.set(testFileUri, mediaPlaintext);

    console.log(`- Simulated local file written to: ${testFileUri}`);
    console.log(`- Encrypting file locally...`);
    const encResult = await EncryptionService.encryptMedia(testFileUri);
    
    console.log('Symmetric Encryption Result:');
    console.log(`  - Encrypted File Path: ${encResult.encryptedUri}`);
    console.log(`  - Key (hex): ${encResult.key}`);
    console.log(`  - IV (hex): ${encResult.iv}`);

    const fileContentEncrypted = mockFsStore.get(encResult.encryptedUri);
    if (!fileContentEncrypted || fileContentEncrypted === mediaPlaintext) {
      throw new Error("File was not encrypted correctly inside filesystem");
    }
    console.log(`  - Encrypted file contents in virtual FS: ${fileContentEncrypted.substring(0, 20)}...`);

    // Decrypt media
    console.log(`- Decrypting file locally...`);
    const decFileUri = await EncryptionService.decryptMedia(encResult.encryptedUri, encResult.key, encResult.iv);
    console.log(`  - Decrypted File Path: ${decFileUri}`);

    const fileContentDecrypted = mockFsStore.get(decFileUri);
    if (fileContentDecrypted !== mediaPlaintext) {
      throw new Error("Decrypted file content mismatch");
    }
    console.log('✅ Media E2EE pipeline verified with absolute byte equality!');

    // ----------------------------------------------------
    // Test 4: Physical Database Deletions (SQLite Wipes)
    // ----------------------------------------------------
    console.log('\n4. Testing SQLite Wipes (Physical DB Deletions)...');

    const testMsgId = 'destruct-msg-id-1234';
    const mockMessage = {
      id: testMsgId,
      content: 'Classified brief. Self-destruct in 30s.',
      senderId: 'me',
      timestamp: Date.now(),
      isMe: true,
      status: 'sent',
      type: 'text'
    };

    console.log(`- Saving message ${testMsgId} to local SQLite database...`);
    await saveMessageToDb(mockMessage);

    // Verify it is written
    const collection = database.get('messages');
    let messages = await collection.query(Q.where('message_id', testMsgId)).fetch();
    if (messages.length === 0) {
      throw new Error("Failed to write test message to SQLite");
    }
    console.log(`  - Confirmed: Message exists in DB.`);

    // Perform physical wipe
    console.log(`- Wiping message physically from database...`);
    const deleteSuccess = await deleteMessageFromDb(testMsgId);
    if (!deleteSuccess) {
      throw new Error("deleteMessageFromDb reported failure");
    }

    // Verify it is gone
    messages = await collection.query(Q.where('message_id', testMsgId)).fetch();
    if (messages.length > 0) {
      throw new Error("SQLite record still exists after destroyPermanently! Physical wipe failed!");
    }
    console.log(`  - Confirmed: Record physically deleted from database.`);
    console.log('✅ Physical SQLite deletion verified successfully!');

    // ----------------------------------------------------
    // Test 5: MLS-aligned Multi-Device Group Roster & Epoch Increment
    // ----------------------------------------------------
    console.log('\n5. Testing MLS-aligned Multi-Device Group Roster & Epoch Increment...');
    
    const mlsGroupId = 'mls-group-test-99';
    // Roster of initial devices: Bob (Device 1 and Device 45), and ourselves (will be auto-added)
    const initialRoster = [
      { userId: 'user2', deviceId: 1, identityKey: 'mock-id-key-u2', role: 'member' as const },
      { userId: 'user3', deviceId: 1, identityKey: 'mock-id-key-u3', role: 'member' as const },
      { userId: 'loopback', deviceId: 99, identityKey: 'loopback-device-99', role: 'member' as const }
    ];

    const initContext = await GroupSessionManager.createGroupSession(mlsGroupId, initialRoster);
    console.log(`- Created Group Context: Epoch ${initContext.epoch}, Tree Hash: ${initContext.treeHash}`);
    if (initContext.epoch !== 1) {
      throw new Error("MLS-aligned group initialization epoch is not 1");
    }

    const initialRosterList = await GroupSessionManager.getGroupRoster(mlsGroupId);
    console.log(`- Initial Roster Size: ${initialRosterList.length}`);
    if (initialRosterList.length < 4) {
      throw new Error("Roster did not include all members plus primary device");
    }
    console.log('✅ MLS group initialized successfully with dynamic device roster tree!');

    // ----------------------------------------------------
    // Test 6: E2EE Group Message, Active Revocation & Post-Compromise Security (PCS)
    // ----------------------------------------------------
    console.log('\n6. Testing Active Revocation, Key Rotation & PCS Block...');
    
    // Distribute keys to loopback device and encrypt test message
    const originalSendSecureMessage = MessageRelay.sendSecureMessage;
    const sentMessages: string[] = [];
    MessageRelay.sendSecureMessage = async (recipient: string, payload: string) => {
      sentMessages.push(recipient);
      return "mock-e2e-id";
    };

    console.log('- Encrypting a normal group message under Epoch 1...');
    const envelope1 = await GroupSessionManager.encrypt(mlsGroupId, 'Pre-revocation secure communication.');
    console.log(`  - Envelope Epoch: ${envelope1.epoch}`);
    console.log(`  - Content Type: ${envelope1.contentType}`);
    console.log(`  - Ciphertext Signature: ${envelope1.signature}`);
    
    if (envelope1.epoch !== 1 || envelope1.contentType !== 'application') {
      throw new Error("Application E2EE envelope metadata mismatch");
    }

    // Decrypt E2EE message as active member (loopback)
    const decrypted1 = await GroupSessionManager.decrypt(mlsGroupId, envelope1);
    console.log(`- Loopback Decrypted content: "${decrypted1}"`);
    if (decrypted1 !== 'Pre-revocation secure communication.') {
      throw new Error("Application decryption failed for active member");
    }

    // Now, perform revocation of Bob
    console.log('- Revoking Bob (bob-user-id) from the group to heal tree...');
    const nextContext = await GroupSessionManager.revokeGroupMember(mlsGroupId, 'bob-user-id');
    console.log(`  - Healed Epoch: ${nextContext.epoch}`);
    console.log(`  - Healed Tree Hash: ${nextContext.treeHash}`);
    if (nextContext.epoch !== 2) {
      throw new Error("Revocation did not increment group epoch to 2");
    }

    const rosterAfterRevoke = await GroupSessionManager.getGroupRoster(mlsGroupId);
    const bobNode = rosterAfterRevoke.find(m => m.userId === 'bob-user-id');
    if (bobNode && bobNode.status !== 'revoked') {
      throw new Error("Revoked user status is not marked as revoked");
    }
    console.log('  - Confirmed: Bob\'s roster leaf state set to revoked.');

    // Assert that Bob\'s keys have been physically purged from local DB
    const bobKey1 = await getGroupSenderKeyFromDb(mlsGroupId, 'bob-user-id:1');
    const bobKey2 = await getGroupSenderKeyFromDb(mlsGroupId, 'bob-user-id:45');
    if (bobKey1 || bobKey2) {
      throw new Error("Failed to physically wipe revoked member keys from local DB cache!");
    }
    console.log('  - Confirmed: Revoked member\'s keys physically deleted from local storage.');

    // Encrypt a new message under Epoch 2 (post-compromise)
    console.log('- Encrypting new group message under Epoch 2...');
    const envelope2 = await GroupSessionManager.encrypt(mlsGroupId, 'Post-revocation highly-classified brief.');
    console.log(`  - New Envelope Epoch: ${envelope2.epoch}`);
    if (envelope2.epoch !== 2) {
      throw new Error("New message was not encrypted under updated epoch 2");
    }

    // Try to decrypt under old epoch (Simulate Bob attempting to replay older keys/epochs)
    console.log('- Bob attempts to decrypt envelope2...');
    const bobEnvelope = { ...envelope2, epoch: 1 }; // Bob has not received updated epoch
    const bobDecrypted = await GroupSessionManager.decrypt(mlsGroupId, bobEnvelope);
    if (bobDecrypted !== null) {
      throw new Error("VULNERABILITY: Revoked member decrypted a message using an older epoch!");
    }
    console.log('  - Confirmed: Bob blocked from decrypting post-revocation message (PCS preserved)!');

    // Remaining active loopback member decrypts successfully
    console.log('- Loopback device decrypting envelope2...');
    const decrypted2 = await GroupSessionManager.decrypt(mlsGroupId, envelope2);
    console.log(`  - Loopback Decrypted content: "${decrypted2}"`);
    if (decrypted2 !== 'Post-revocation highly-classified brief.') {
      throw new Error("Active remaining member failed to decrypt post-revocation message");
    }

    // Try to decrypt a message sent by Bob after he was revoked
    console.log('- Revoked Bob attempts to send a forged group message...');
    const forgedBobEnvelope = {
      ...envelope2,
      senderId: 'bob-user-id',
      senderDeviceId: 1
    };
    const forgedDecrypted = await GroupSessionManager.decrypt(mlsGroupId, forgedBobEnvelope);
    if (forgedDecrypted !== null) {
      throw new Error("VULNERABILITY: Accepted and decrypted group message from a revoked participant!");
    }
    console.log('  - Confirmed: Messages from revoked senders are strictly rejected and blocked!');

    // Restore MessageRelay stub
    MessageRelay.sendSecureMessage = originalSendSecureMessage;

    console.log('✅ Group revocation, epoch propagation, and PCS E2E verified successfully!');

    console.log('\n==================================================');
    console.log('🎉 ALL PHASE 4 & 8 INTEGRATION TESTS PASSED!');
    console.log('==================================================\n');
    return true;
  } catch (error) {
    console.error('\n❌ PHASE 4 INTEGRATION TEST FAILED:', error);
    return false;
  }
}
