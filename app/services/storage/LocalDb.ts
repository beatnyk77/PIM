import { Platform } from 'react-native';
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { Model } from '@nozbe/watermelondb';
import { field, text, date, writer } from '@nozbe/watermelondb/decorators';

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

  @text('content') content!: string;
  @text('sender_id') senderId!: string;
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
  ],
});

// 5. Test Function
export async function testDbConnection() {
  try {
    const messageCount = await database.get('messages').query().fetchCount();
    console.log(`Database connected! Current message count: ${messageCount}`);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
