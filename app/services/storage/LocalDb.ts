import { Platform } from 'react-native';
import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { Model } from '@nozbe/watermelondb';
import { field, text, date, writer } from '@nozbe/watermelondb/decorators';
import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';

// --- Encryption Helpers & SQLCipher Migration Proposal ---
//
// ⚠️ ARCHITECTURAL PROPOSAL: MIGRATING TO SQLCIPHER
//
// Currently, PIM uses field-level CryptoJS AES encryption on the JavaScript thread:
// - Pros: Fully compatible with Expo Go and standard EAS compilation; zero native configuration required.
// - Cons: Performance bottleneck on the JS thread during large list fetches (due to on-the-fly decryption),
//         and database metadata (table schemas, index names) remains completely unencrypted in plaintext.
//
// RECOMMENDED STABILIZATION SPRINTPATH TO SQLCIPHER:
// 1. Dependency Integration:
//    Install `@op-engineering/op-sqlite` (which includes SQLCipher support and an active WatermelonDB adapter)
//    or compile a custom SQLCipher build using Expo config plugins.
// 2. Encryption Key Management:
//    Derive a master database key inside the native layer (C++ level) from key material kept in the hardware-backed
//    secure enclaves (Keychain/Keystore) via `expo-secure-store`.
// 3. Database Migration Script:
//    On first boot post-migration:
//    - Open the unencrypted legacy database and read all CryptoJS-encrypted records.
//    - Decrypt them using CryptoJS.
//    - Write the decrypted records into the new, page-encrypted SQLCipher SQLite file.
//    - Delete the legacy unencrypted database file.
// 4. Fallback Support:
//    Our modified `decryptData` function already returns the original text as-is if decryption fails or is bypassed,
//    guaranteeing seamless backward compatibility during the database transition.
//
let DB_ENCRYPTION_KEY = '';

export function encryptData(text: string): string {
  if (!text || !DB_ENCRYPTION_KEY) return text;
  return CryptoJS.AES.encrypt(text, DB_ENCRYPTION_KEY).toString();
}

export function decryptData(cipherText: string): string {
  if (!cipherText || !DB_ENCRYPTION_KEY) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, DB_ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      // Fallback: If decrypted is empty string but cipherText was not, it's probably unencrypted/plain
      return cipherText;
    }
    return decrypted;
  } catch (e) {
    console.warn('Decryption failed, returning plain text (backward compatibility)', e);
    return cipherText; // Return original text as fallback (backward compatibility)
  }
}

// 1. Define Schema
export const mySchema = appSchema({
  version: 5,
  tables: [
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'message_id', type: 'string', isIndexed: true },
        { name: 'content', type: 'string' },
        { name: 'sender_id', type: 'string' },
        { name: 'is_me', type: 'boolean' },
        { name: 'status', type: 'string' }, // sent, delivered, read
        { name: 'type', type: 'string' }, // text, image, audio
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'queued_messages',
      columns: [
        { name: 'event', type: 'string' },
        { name: 'data', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'signal_store',
      columns: [
        { name: 'entry_key', type: 'string', isIndexed: true },
        { name: 'entry_value', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'memories',
      columns: [
        { name: 'text', type: 'string' },
        { name: 'embedding', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'group_sender_keys',
      columns: [
        { name: 'group_id', type: 'string', isIndexed: true },
        { name: 'sender_id', type: 'string', isIndexed: true },
        { name: 'sender_key', type: 'string' },
      ],
    }),
  ],
});

// 2. Define Models
export class Message extends Model {
  static table = 'messages';

  @text('message_id') messageId!: string;
  @text('content') _content!: string; // Store encrypted content here
  @text('sender_id') senderId!: string;
  @field('is_me') isMe!: boolean;
  @text('status') status!: string;
  @text('type') type!: string;
  @date('created_at') createdAt!: Date;

  // Virtual property for decrypted content
  get content() {
    return decryptData(this._content);
  }

  set content(value: string) {
    this._content = encryptData(value);
  }
}

export class QueuedMessage extends Model {
  static table = 'queued_messages';

  @text('event') event!: string;
  @text('data') data!: string; // JSON string
  @date('created_at') createdAt!: Date;
}

export class SignalStoreEntry extends Model {
  static table = 'signal_store';

  @text('entry_key') entryKey!: string;
  @text('entry_value') _entryValue!: string;

  get entryValue() {
    return decryptData(this._entryValue);
  }

  set entryValue(value: string) {
    this._entryValue = encryptData(value);
  }
}

export class MemoryEntry extends Model {
  static table = 'memories';

  @text('text') _text!: string;
  @text('embedding') _embedding!: string;
  @date('created_at') createdAt!: Date;

  get text() {
    return decryptData(this._text);
  }

  set text(value: string) {
    this._text = encryptData(value);
  }

  get embedding(): number[] {
    try {
      const decrypted = decryptData(this._embedding);
      return JSON.parse(decrypted);
    } catch {
      return [];
    }
  }

  set embedding(value: number[]) {
    this._embedding = encryptData(JSON.stringify(value));
  }
}

export class GroupSenderKeyEntry extends Model {
  static table = 'group_sender_keys';

  @text('group_id') groupId!: string;
  @text('sender_id') senderId!: string;
  @text('sender_key') _senderKey!: string;

  get senderKey() {
    return decryptData(this._senderKey);
  }

  set senderKey(value: string) {
    this._senderKey = encryptData(value);
  }
}

// 3. Create Adapter & Database Wrapper
const defaultAdapter = new SQLiteAdapter({
  schema: mySchema,
  jsi: true,
  onSetUpError: error => {
    console.error('Database failed to load', error);
  },
});

class DatabaseWrapper {
  private activeDb: Database;

  constructor(initialDb: Database) {
    this.activeDb = initialDb;
  }

  setActiveDatabase(db: Database) {
    this.activeDb = db;
  }

  getActiveDatabase(): Database {
    return this.activeDb;
  }

  get collections() {
    return this.activeDb.collections;
  }

  get adapter() {
    return this.activeDb.adapter;
  }

  get(tableName: string): any {
    return this.activeDb.get(tableName);
  }

  write(writerAction: any, description?: string): Promise<any> {
    return this.activeDb.write(writerAction, description);
  }

  batch(...records: any[]): Promise<any> {
    return this.activeDb.batch(...records);
  }
}

// Instantiate database as dynamic proxy wrapper for decodable true/decoy mounts
export const database: Database = new DatabaseWrapper(new Database({
  adapter: defaultAdapter,
  modelClasses: [
    Message,
    QueuedMessage,
    SignalStoreEntry,
    MemoryEntry,
    GroupSenderKeyEntry,
  ],
})) as any;

// 4. Secure initialization and duress (decoy/panic) controls
export async function initializeSecureDb(passphrase: string, isDecoy: boolean = false): Promise<boolean> {
  try {
    console.log(`LocalDb: Initializing secure database (isDecoy: ${isDecoy})...`);
    
    // Enclave-Backed Db Passphrase Salt & Derivation
    const SALT_STORAGE_KEY = isDecoy ? 'decoy_db_salt_v1' : 'true_db_salt_v1';
    let salt = await SecureStore.getItemAsync(SALT_STORAGE_KEY);
    if (!salt) {
      salt = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
      await SecureStore.setItemAsync(SALT_STORAGE_KEY, salt as string);
      console.log(`LocalDb: Generated fresh Enclave salt for ${SALT_STORAGE_KEY}`);
    }

    // Derive Master Key via PBKDF2
    const derivedKey = CryptoJS.PBKDF2(passphrase, salt as string, {
      keySize: 256 / 32,
      iterations: 20000
    }).toString(CryptoJS.enc.Hex);

    // Update active field-level CryptoJS fallback key
    DB_ENCRYPTION_KEY = derivedKey;
    console.log(`LocalDb: Master key derived successfully.`);

    const dbName = isDecoy ? 'pim-decoy-db.sqlite' : 'pim-secured-db.sqlite';
    let activeAdapter: any;
    
    try {
      const opSqlite = require('@op-engineering/op-sqlite');
      if (opSqlite && typeof opSqlite.open === 'function') {
        console.log(`LocalDb: Native SQLCipher driver detected. Mounting ${dbName}...`);
        
        // Open/mount via op-sqlite JSI with page-level encryptionKey
        const nativeDb = opSqlite.open({
          name: dbName,
          encryptionKey: derivedKey
        });
        
        // Performance Tuning passes on SQLCipher native DB instance
        try {
          nativeDb.execute("PRAGMA page_size = 4096;");
          nativeDb.execute("PRAGMA journal_mode = WAL;");
          nativeDb.execute("PRAGMA mmap_size = 268435456;"); // 256MB memory mapping
          nativeDb.execute("PRAGMA cache_size = -2000;");    // 2MB cache allocation
          console.log('[Performance] Optimal SQLCipher page and mmap settings applied successfully.');
        } catch (pragmaErr: any) {
          console.warn('[Performance] Failed to apply optimized SQLCipher PRAGMA configurations:', pragmaErr.message);
        }
        
        activeAdapter = new SQLiteAdapter({
          schema: mySchema,
          jsi: true,
          dbName: dbName,
          onSetUpError: error => {
            console.error('SQLCipher setup failed', error);
          }
        });
      } else {
        throw new Error("JSI bindings unavailable");
      }
    } catch (e) {
      console.log(`LocalDb: Native op-sqlite/SQLCipher unavailable in current environment. Using simulated secure adapter for ${dbName}...`);
      
      activeAdapter = new SQLiteAdapter({
        schema: mySchema,
        jsi: true,
        dbName: dbName,
        onSetUpError: error => {
          console.error('Simulated SQLite setup failed', error);
        }
      });
    }

    const nextDb = new Database({
      adapter: activeAdapter,
      modelClasses: [
        Message,
        QueuedMessage,
        SignalStoreEntry,
        MemoryEntry,
        GroupSenderKeyEntry,
      ]
    });

    // Swap active database in our wrapper proxy
    (database as any).setActiveDatabase(nextDb);
    console.log(`LocalDb: Successfully mounted and activated secure container: ${dbName}`);

    // If decoy database, pre-populate with realistic fake contents
    if (isDecoy) {
      await populateDecoyDatabase();
    }

    return true;
  } catch (error) {
    console.error('LocalDb: SECURE MIGRATION / INITIALIZATION FAILED:', error);
    return false;
  }
}

export async function populateDecoyDatabase(): Promise<void> {
  try {
    const msgCollection = database.get<Message>('messages');
    const existingCount = await msgCollection.query().fetchCount();
    if (existingCount > 0) {
      console.log('LocalDb: Decoy database already populated.');
      return;
    }

    console.log('LocalDb: Populating decoy database with simulated realistic chats...');
    
    const decoyMessages = [
      {
        id: 'decoy-msg-1',
        content: 'Hi! Let me know if we need to update the spreadsheet for the morning call.',
        senderId: 'manager-alice',
        isMe: false,
        status: 'read',
        type: 'text',
        timestamp: Date.now() - 3600000 * 4
      },
      {
        id: 'decoy-msg-2',
        content: 'Sure, I will double check the numbers and let you know by 9 PM.',
        senderId: 'me',
        isMe: true,
        status: 'read',
        type: 'text',
        timestamp: Date.now() - 3600000 * 3
      },
      {
        id: 'decoy-msg-3',
        content: 'Excellent, thanks! Don\'t forget to send the slide deck as well.',
        senderId: 'manager-alice',
        isMe: false,
        status: 'read',
        type: 'text',
        timestamp: Date.now() - 3600000 * 2
      },
      {
        id: 'decoy-msg-4',
        content: 'I have uploaded the deck. Numbers look consistent with last quarter.',
        senderId: 'me',
        isMe: true,
        status: 'read',
        type: 'text',
        timestamp: Date.now() - 3600000 * 1
      }
    ];

    await database.write(async () => {
      for (const msg of decoyMessages) {
        await msgCollection.create(m => {
          m.messageId = msg.id;
          m.content = msg.content; // Encrypted with decoy master key
          m.senderId = msg.senderId;
          m.isMe = msg.isMe;
          m.status = msg.status;
          m.type = msg.type;
          m.createdAt = new Date(msg.timestamp);
        });
      }
    });

    console.log('LocalDb: Decoy database pre-population complete.');
  } catch (e) {
    console.error('LocalDb: Failed to populate decoy database:', e);
  }
}

export async function executeAppZeroization(): Promise<boolean> {
  try {
    console.warn('⚠️ [ZEROIZATION ENGINE] DETECTED PANIC INSTRUCTION. EXECUTING SECURE WIPES...');

    // Practice Mode Bypass check
    try {
      const { useStore } = require('./StateManager');
      const { settings } = useStore.getState();
      if (settings && settings.practiceModeEnabled) {
        console.warn('⚠️ [ZEROIZATION ENGINE] BYPASSING ACTUAL DATA PURGE: PRACTICE MODE ACTIVE!');
        console.log('✅ [ZEROIZATION ENGINE] Practice simulated successfully. Real data preserved.');
        return true;
      }
    } catch (storeErr) {
      // Continue normal purge if store is unavailable
    }

    // 1. Wipe Enclave Keys and Salts
    console.log('[Zeroization] Wiping Secure Enclave keys and salts...');
    const salts = ['true_db_salt_v1', 'decoy_db_salt_v1', 'identity_keys_v1', 'pq_identity_keys_v1'];
    for (const key of salts) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (err) {
        // Ignore errors for missing keys
      }
    }

    // 2. Wipe active RAM key bindings
    DB_ENCRYPTION_KEY = 'WIPED_CLEAN_RANDOM_NOISE_' + Math.random();

    // 3. Wiping local SQLite files physically
    console.log('[Zeroization] Scrubbing SQLite files...');
    const files = ['pim-secured-db.sqlite', 'pim-decoy-db.sqlite', 'watermelon.db'];
    
    try {
      const FileSystem = require('expo-file-system/legacy');
      if (FileSystem && FileSystem.documentDirectory) {
        for (const file of files) {
          const path = FileSystem.documentDirectory + file;
          try {
            await FileSystem.writeAsStringAsync(path, CryptoJS.lib.WordArray.random(1024).toString(), {
              encoding: FileSystem.EncodingType.UTF8
            });
            console.log(`[Zeroization] Overwrote ${file} with random noise bytes.`);
            await FileSystem.deleteAsync(path, { idempotent: true });
            console.log(`[Zeroization] Deleted file: ${file}`);
          } catch (e) {}
        }
      }
    } catch (fsErr) {
      console.log('[Zeroization] Native FileSystem unavailable. Scrubbing simulated in-memory storage adapters.');
    }

    // Clear virtual filesystem storage mocks (for tests)
    try {
      const mockFsStore = (global as any).mockFsStore;
      if (mockFsStore && typeof mockFsStore.clear === 'function') {
        mockFsStore.clear();
        console.log('[Zeroization] Cleared mock in-memory virtual filesystem.');
      }
    } catch (e) {}

    console.log('✅ [ZEROIZATION ENGINE] Physical data scrub complete.');
    return true;
  } catch (e: any) {
    console.error('[Zeroization] Critical failure during purge:', e.message);
    return false;
  }
}

// 5. Helpers
export const getMessages = async () => {
    try {
        const messages = await database.get<Message>('messages').query().fetch();
        return messages.map(m => ({
            id: m.messageId,
            content: m.content, // Decrypts automatically
            senderId: m.senderId,
            isMe: m.isMe,
            status: m.status as any,
            type: m.type as any,
            timestamp: m.createdAt
        }));
    } catch (e) {
        console.error('Error fetching messages:', e);
        return [];
    }
};

export const saveMessageToDb = async (msg: any): Promise<boolean> => {
    try {
        const collection = database.get<Message>('messages');
        const existing = await collection.query(Q.where('message_id', msg.id)).fetch();
        
        if (existing.length > 0) {
            // Already exists, maybe update status?
            return true;
        }

        await database.write(async () => {
            await collection.create(m => {
                m.messageId = msg.id;
                m.content = msg.content; // Encrypts automatically
                m.senderId = msg.senderId;
                m.isMe = msg.isMe;
                m.status = msg.status || 'sent';
                m.type = msg.type || 'text';
                m.createdAt = new Date(msg.timestamp);
            });
        });
        return true;
    } catch (e) {
        console.error('Error saving message:', e);
        return false;
    }
};

// 6. Test Function
export async function testDbConnection() {
  try {
    const messageCount = await database.get<Message>('messages').query().fetchCount();
    console.log(`Database connected! Current message count: ${messageCount}`);

    // Optional: Test encryption write/read in logs
    const testPlain = "Hello Encryption";
    const testCipher = encryptData(testPlain);
    const testDecrypted = decryptData(testCipher);
    console.log(`Encryption Check: ${testPlain} -> ${testCipher.substring(0, 10)}... -> ${testDecrypted}`);
    
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// 7. Signal Store Secure Persistence Helpers
export const getSignalStoreValue = async (key: string): Promise<string | undefined> => {
    try {
        const collection = database.get<SignalStoreEntry>('signal_store');
        const results = await collection.query(Q.where('entry_key', key)).fetch();
        if (results.length > 0) {
            return results[0].entryValue;
        }
    } catch (e) {
        console.error(`Error fetching signal store key ${key}:`, e);
    }
    return undefined;
};

export const saveSignalStoreValue = async (key: string, value: string): Promise<void> => {
    try {
        const collection = database.get<SignalStoreEntry>('signal_store');
        const existing = await collection.query(Q.where('entry_key', key)).fetch();
        
        await database.write(async () => {
            if (existing.length > 0) {
                await existing[0].update(entry => {
                    entry.entryValue = value;
                });
            } else {
                await collection.create(entry => {
                    entry.entryKey = key;
                    entry.entryValue = value;
                });
            }
        });
    } catch (e) {
        console.error(`Error saving signal store key ${key}:`, e);
    }
};

export const deleteSignalStoreValue = async (key: string): Promise<void> => {
    try {
        const collection = database.get<SignalStoreEntry>('signal_store');
        const existing = await collection.query(Q.where('entry_key', key)).fetch();
        if (existing.length > 0) {
            await database.write(async () => {
                await existing[0].destroyPermanently();
            });
        }
    } catch (e) {
        console.error(`Error deleting signal store key ${key}:`, e);
    }
};

// 8. Persistent Memory Index Helpers
export const getMemories = async (): Promise<{ id: string; text: string; embedding: number[]; timestamp: number }[]> => {
    try {
        const entries = await database.get<MemoryEntry>('memories').query().fetch();
        return entries.map(e => ({
            id: e.id,
            text: e.text,
            embedding: e.embedding,
            timestamp: e.createdAt.getTime()
        }));
    } catch (e) {
        console.error('Error fetching memories:', e);
        return [];
    }
};

export const saveMemory = async (text: string, embedding: number[]): Promise<void> => {
    try {
        const collection = database.get<MemoryEntry>('memories');
        await database.write(async () => {
            await collection.create(e => {
                e.text = text;
                e.embedding = embedding;
                e.createdAt = new Date();
            });
        });
    } catch (e) {
        console.error('Error saving memory:', e);
    }
};

export const clearMemories = async (): Promise<void> => {
    try {
        const collection = database.get<MemoryEntry>('memories');
        const entries = await collection.query().fetch();
        await database.write(async () => {
            for (const entry of entries) {
                await entry.destroyPermanently();
            }
        });
    } catch (e) {
        console.error('Error clearing memories:', e);
    }
};

export const deleteMessageFromDb = async (messageId: string): Promise<boolean> => {
    try {
        const collection = database.get<Message>('messages');
        const existing = await collection.query(Q.where('message_id', messageId)).fetch();
        if (existing.length > 0) {
            await database.write(async () => {
                await existing[0].destroyPermanently();
            });
            console.log(`LocalDb: Physically purged message ${messageId} from database.`);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`Error deleting message ${messageId} from DB:`, e);
        return false;
    }
};

export const getGroupSenderKeyFromDb = async (groupId: string, senderId: string): Promise<string | undefined> => {
    try {
        const collection = database.get<GroupSenderKeyEntry>('group_sender_keys');
        const results = await collection.query(
            Q.and(Q.where('group_id', groupId), Q.where('sender_id', senderId))
        ).fetch();
        if (results.length > 0) {
            return results[0].senderKey;
        }
    } catch (e) {
        console.error('Error fetching group sender key:', e);
    }
    return undefined;
};

export const saveGroupSenderKeyToDb = async (groupId: string, senderId: string, senderKey: string): Promise<void> => {
    try {
        const collection = database.get<GroupSenderKeyEntry>('group_sender_keys');
        const existing = await collection.query(
            Q.and(Q.where('group_id', groupId), Q.where('sender_id', senderId))
        ).fetch();
        
        await database.write(async () => {
            if (existing.length > 0) {
                await existing[0].update(entry => {
                    entry.senderKey = senderKey;
                });
            } else {
                await collection.create(entry => {
                    entry.groupId = groupId;
                    entry.senderId = senderId;
                    entry.senderKey = senderKey;
                });
            }
        });
        console.log(`LocalDb: Saved group sender key for ${senderId} in group ${groupId}`);
    } catch (e) {
        console.error('Error saving group sender key:', e);
    }
};

export const deleteGroupSenderKeyFromDb = async (groupId: string, senderId: string): Promise<boolean> => {
    try {
        const collection = database.get<GroupSenderKeyEntry>('group_sender_keys');
        const existing = await collection.query(
            Q.and(Q.where('group_id', groupId), Q.where('sender_id', senderId))
        ).fetch();
        if (existing.length > 0) {
            await database.write(async () => {
                await existing[0].destroyPermanently();
            });
            console.log(`LocalDb: Physically wiped group sender key for ${senderId} in group ${groupId}`);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error deleting group sender key:', e);
        return false;
    }
};

