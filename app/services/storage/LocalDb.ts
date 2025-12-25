import { Platform } from 'react-native';
import { Database } from '@nozbe/watermelondb';
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
  version: 1,
  tables: [
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'content', type: 'string' },
        { name: 'sender_id', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});

// 2. Define Models
export class Message extends Model {
  static table = 'messages';

  @text('content') _content!: string; // Store encrypted content here
  @text('sender_id') senderId!: string;
  @date('created_at') createdAt!: Date;

  // Virtual property for decrypted content
  get content() {
    return decryptData(this._content);
  }

  set content(value: string) {
    this._content = encryptData(value);
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
  ],
});

// 5. Test Function
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
