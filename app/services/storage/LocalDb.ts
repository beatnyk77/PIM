import { Platform } from 'react-native';
import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { Model } from '@nozbe/watermelondb';
import { field, text, date, writer } from '@nozbe/watermelondb/decorators';
import CryptoJS from 'crypto-js';

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
const DB_ENCRYPTION_KEY = 'super-secret-local-db-key-placeholder';

export function encryptData(text: string): string {
  if (!text) return text;
  return CryptoJS.AES.encrypt(text, DB_ENCRYPTION_KEY).toString();
}

export function decryptData(cipherText: string): string {
  if (!cipherText) return cipherText;
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

// 3. Create Adapter
const adapter = new SQLiteAdapter({
  schema: mySchema,
  // (You might want to comment out migration events for now)
  // migrations,
  jsi: true, // improved performance
  onSetUpError: error => {
    console.error('Database failed to load', error);
  },
});

// 4. Initialize Database
export const database = new Database({
  adapter,
  modelClasses: [
    Message,
    QueuedMessage,
    SignalStoreEntry,
    MemoryEntry,
  ],
});

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
