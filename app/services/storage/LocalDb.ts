import { Platform } from 'react-native';
import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { Model } from '@nozbe/watermelondb';
import { field, text, date, writer } from '@nozbe/watermelondb/decorators';
import CryptoJS from 'crypto-js';

// --- Encryption Helpers ---
// In a real app, this key should come from SecureStore or a KDF derived from user pin.
// For MVP/Skeleton, we use a constant placeholder or environment variable.
const DB_ENCRYPTION_KEY = 'super-secret-local-db-key-placeholder';

export function encryptData(text: string): string {
  if (!text) return text;
  return CryptoJS.AES.encrypt(text, DB_ENCRYPTION_KEY).toString();
}

export function decryptData(cipherText: string): string {
  if (!cipherText) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, DB_ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('Decryption failed', e);
    return '*** Decryption Error ***';
  }
}

// 1. Define Schema
export const mySchema = appSchema({
  version: 3,
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

export const saveMessageToDb = async (msg: any) => {
    try {
        const collection = database.get<Message>('messages');
        const existing = await collection.query(Q.where('message_id', msg.id)).fetch();
        
        if (existing.length > 0) {
            // Already exists, maybe update status?
            return;
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
    } catch (e) {
        console.error('Error saving message:', e);
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
