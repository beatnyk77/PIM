import { io, Socket } from 'socket.io-client';
import { database, QueuedMessage, saveMessageToDb } from '../storage/LocalDb';
import { EncryptionService } from './EncryptionService';
import { EventBus } from '../EventBus';
import { useStore } from '../storage/StateManager';

class MessageRelayService {
  private socket: Socket | null = null;
  // Placeholder URL - will need to be updated with actual backend URL
  // For Android Emulator use 'http://10.0.2.2:3000'
  // For iOS Simulator use 'http://localhost:3000'
  private serverUrl: string = 'http://localhost:3000'; 

  connect(userId: string) {
    if (this.socket?.connected) return;

    console.log('MessageRelay: Connecting to', this.serverUrl);

    this.socket = io(this.serverUrl, {
      query: { userId },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });

    this.socket.on('connect', () => {
      console.log('MessageRelay: Connected:', this.socket?.id);
      EventBus.emit('network.connected');
      this.processOfflineQueue();
      
      // Auto-join test group for MVP
      this.joinGroup('test-group');
    });

    this.socket.on('disconnect', () => {
      console.log('MessageRelay: Disconnected');
      EventBus.emit('network.disconnected');
    });

    this.socket.on('message', (data: any) => {
      console.log('MessageRelay: Received message:', data);
      EventBus.emit('message.received', data);
    });

    // Listen for encrypted chat messages
    this.socket.on('chat-message', async (data: any) => {
      // Expecting: { from: string, ciphertext: Signal.MessageType, timestamp: number, messageId: string }
      console.log('MessageRelay: Received encrypted message from', data.from);
      
      try {
        const decryptedContent = await EncryptionService.decryptMessage(data.from, data.ciphertext);
        
        if (decryptedContent) {
          console.log('MessageRelay: Message decrypted successfully');
          EventBus.emit('message.secure-received', {
            from: data.from,
            content: decryptedContent,
            timestamp: data.timestamp || Date.now(),
            messageId: data.messageId
          });
          
          // Send Read Receipt automatically if successfully decrypted
          // In a real app, this might be triggered by UI view
          if (data.messageId) {
             const { settings } = useStore.getState();
             if (settings.readReceiptsEnabled) {
                 this.sendReadReceipt(data.from, data.messageId);
             }
          }

          // Persist message to DB immediately
          await saveMessageToDb({
              id: data.messageId,
              content: decryptedContent,
              senderId: data.from,
              timestamp: data.timestamp || Date.now(),
              isMe: false,
              status: 'read', // Mark as read since we processed it? Or 'delivered'?
              type: 'text'
          });

        } else {
          console.warn('MessageRelay: Failed to decrypt message');
        }
      } catch (e) {
        console.error('MessageRelay: Error handling encrypted message', e);
      }
    });

    // Listen for read receipts
    this.socket.on('read-receipt', (data: any) => {
        console.log('MessageRelay: Received read receipt', data);
        EventBus.emit('message.read-receipt', data);
    });

    // Listen for group messages
    this.socket.on('group-message', (data: any) => {
        console.log('MessageRelay: Received group message in', data.groupId);
        EventBus.emit('message.group-received', data);
    });

    this.socket.on('connect_error', (err) => {
      console.log('MessageRelay: Connection Error:', err.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinGroup(groupId: string) {
      if (this.socket?.connected) {
          this.socket.emit('join-group', groupId);
      }
  }

  sendGroupMessage(groupId: string, content: string, type: string = 'text', mediaUri?: string) {
      this.sendMessage('group-message', {
          groupId,
          content,
          timestamp: Date.now(),
          type,
          mediaUri
      });
  }

  sendReadReceipt(toUserId: string, messageId: string) {
      this.sendMessage('read-receipt', {
          to: toUserId,
          messageId,
          timestamp: Date.now()
      });
  }

  async sendSecureMessage(toUserId: string, content: string) {
    if (!EncryptionService.isInitialized()) {
      console.error('MessageRelay: EncryptionService not initialized');
      return;
    }

    try {
      console.log(`MessageRelay: Encrypting message for ${toUserId}...`);
      const ciphertext = await EncryptionService.encryptMessage(toUserId, content);
      
      if (!ciphertext) {
        throw new Error('Encryption failed');
      }

      // Generate a temporary ID if one doesn't exist to track receipts
      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

      const payload = {
        to: toUserId,
        ciphertext,
        timestamp: Date.now(),
        messageId,
      };

      // We use the generic 'chat-message' event for the relay
      await this.sendMessage('chat-message', payload);
      console.log('MessageRelay: Secure message sent (or queued)');
      return messageId;
    } catch (e) {
      console.error('MessageRelay: Failed to send secure message', e);
      return null;
    }
  }

  async sendMessage(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.log('MessageRelay: Offline. Queuing message...');
      try {
        await database.write(async () => {
          await database.get<QueuedMessage>('queued_messages').create(msg => {
            msg.event = event;
            msg.data = JSON.stringify(data);
            msg.createdAt = new Date();
          });
        });
        console.log('MessageRelay: Message queued successfully.');
      } catch (e) {
        console.error('MessageRelay: Failed to queue message', e);
      }
    }
  }

  private async processOfflineQueue() {
    try {
      const queuedMessages = await database.get<QueuedMessage>('queued_messages').query().fetch();
      
      if (queuedMessages.length === 0) return;

      console.log(`MessageRelay: Processing ${queuedMessages.length} queued messages...`);

      // Process strictly in order
      // Note: In a real app, we might want to batch this or handle failures more robustly
      for (const msg of queuedMessages) {
        if (this.socket?.connected) {
          try {
             const data = JSON.parse(msg.data);
             this.socket.emit(msg.event, data);
             
             // Remove from DB after sending
             await database.write(async () => {
               await msg.destroyPermanently();
             });
          } catch (e) {
            console.error('MessageRelay: Failed to process queued message', e);
          }
        } else {
          console.warn('MessageRelay: Connection lost while processing queue.');
          break;
        }
      }
    } catch (e) {
      console.error('MessageRelay: Error reading queue', e);
    }
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }
}

export const MessageRelay = new MessageRelayService();
