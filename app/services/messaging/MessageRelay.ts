import { io, Socket } from 'socket.io-client';
import { database, QueuedMessage, saveMessageToDb, getSignalStoreValue, saveSignalStoreValue, saveGroupSenderKeyToDb } from '../storage/LocalDb';
import { EncryptionService } from './EncryptionService';
import { EventBus } from '../EventBus';
import { useStore } from '../storage/StateManager';
import { IdentityService } from '../auth/IdentityService';

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
      reconnectionAttempts: Infinity, // Infinite reconnect attempts to guarantee offline-first recovery
      reconnectionDelay: 1000,        // Start backoff at 1 second
      reconnectionDelayMax: 30000,    // Caps max reconnection interval at 30 seconds to optimize battery
      randomizationFactor: 0.5,       // 50% random jitter to mitigate thundering herd spikes on relay boot
    });

    this.socket.on('connect', () => {
      console.log('MessageRelay: Connected:', this.socket?.id);
      EventBus.emit('network.connected');
      this.processOfflineQueue();
      
      // Auto-join test group for MVP
      this.joinGroup('test-group');

      // Auto-register public E2EE key bundle
      this.registerKeys();

      // Listen for E2EE keys replenishment requests
      this.socket!.on('replenish-keys', async (data: any) => {
        console.log(`MessageRelay: Server reports E2EE prekeys running low (${data.remaining}). Replenishing pool...`);
        await this.replenishKeys();
      });
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
      console.log('MessageRelay: Received encrypted message from', data.from);
      
      try {
        const decryptedContent = await EncryptionService.decryptHybridMessage(data.from, data.ciphertext);
        
        if (decryptedContent) {
          console.log('MessageRelay: Message decrypted successfully');

          // Intercept group-key-distribution
          try {
            const parsed = JSON.parse(decryptedContent);
            if (parsed && parsed.type === 'group-key-distribution') {
              console.log(`MessageRelay: Received group-key-distribution for group ${parsed.groupId} from ${data.from}`);
              await saveGroupSenderKeyToDb(parsed.groupId, data.from, parsed.senderKey);
              return;
            }
          } catch (e) {
            // Not a JSON payload, process normally
          }

          let textContent = decryptedContent;
          let mediaUriDecrypted = data.mediaUri;
          let isMedia = false;

          try {
            const parsed = JSON.parse(decryptedContent);
            if (parsed && parsed.type === 'media') {
              textContent = parsed.text || '';
              isMedia = true;
              if (parsed.encryptedMediaUri && parsed.mediaKey && parsed.mediaIv) {
                const localDecryptedPath = await EncryptionService.decryptMedia(parsed.encryptedMediaUri, parsed.mediaKey, parsed.mediaIv);
                mediaUriDecrypted = localDecryptedPath;
              }
            }
          } catch (e) {
            // Not media payload
          }

          EventBus.emit('message.secure-received', {
            from: data.from,
            content: textContent,
            timestamp: data.timestamp || Date.now(),
            messageId: data.messageId,
            type: data.type || (isMedia ? 'image' : 'text'),
            mediaUri: mediaUriDecrypted
          });
          
          if (data.messageId) {
             const { settings } = useStore.getState();
             if (settings.readReceiptsEnabled) {
                 this.sendReadReceipt(data.from, data.messageId);
             }
          }

          await saveMessageToDb({
              id: data.messageId,
              content: textContent,
              senderId: data.from,
              timestamp: data.timestamp || Date.now(),
              isMe: false,
              status: 'read',
              type: data.type || (isMedia ? 'image' : 'text'),
              mediaUri: mediaUriDecrypted
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
    this.socket.on('group-message', async (data: any) => {
        console.log('MessageRelay: Received group message in', data.groupId);
        try {
          if (data.ciphertext && data.ciphertext.version === 'v1_group_sender_key') {
            const decryptedContent = await EncryptionService.decryptGroupMessage(data.groupId, data.from, data.ciphertext);
            if (decryptedContent) {
              console.log('MessageRelay: Group message decrypted successfully!');
              
              let textContent = decryptedContent;
              let mediaUriDecrypted = data.mediaUri;
              let isMedia = false;

              try {
                const parsed = JSON.parse(decryptedContent);
                if (parsed && parsed.type === 'media') {
                  textContent = parsed.text || '';
                  isMedia = true;
                  if (parsed.encryptedMediaUri && parsed.mediaKey && parsed.mediaIv) {
                    const localDecryptedPath = await EncryptionService.decryptMedia(parsed.encryptedMediaUri, parsed.mediaKey, parsed.mediaIv);
                    mediaUriDecrypted = localDecryptedPath;
                  }
                }
              } catch (e) {
                // Not media JSON
              }

              EventBus.emit('message.group-received', {
                from: data.from,
                groupId: data.groupId,
                content: textContent,
                timestamp: data.timestamp || Date.now(),
                type: data.type || (isMedia ? 'image' : 'text'),
                mediaUri: mediaUriDecrypted
              });

              await saveMessageToDb({
                  id: data.messageId || Date.now().toString(),
                  content: textContent,
                  senderId: data.from,
                  timestamp: data.timestamp || Date.now(),
                  isMe: false,
                  status: 'read',
                  type: data.type || (isMedia ? 'image' : 'text'),
                  mediaUri: mediaUriDecrypted
              });
            } else {
              console.warn('MessageRelay: Failed to decrypt group message from', data.from);
            }
          } else {
            // Fallback for unencrypted/legacy group messages
            EventBus.emit('message.group-received', data);
          }
        } catch (err) {
          console.error('MessageRelay: Error decrypting group message', err);
        }
    });

    this.socket.on('connect_error', (err) => {
      console.log('MessageRelay: Connection Error:', err.message);
    });
  }

  async registerKeys() {
    if (!this.socket?.connected) {
      console.warn('MessageRelay: Socket not connected. Cannot register keys.');
      return;
    }

    const keys = await IdentityService.loadKeys();
    if (!keys) {
      console.warn('MessageRelay: No identity keys found to register.');
      return;
    }

    console.log('MessageRelay: Preparing PreKey bundle...');
    const bundle = await IdentityService.generatePreKeyBundle(keys);
    if (!bundle) {
      console.error('MessageRelay: Failed to generate or load prekey bundle.');
      return;
    }

    console.log('MessageRelay: Registering prekeys bundle with server...');
    this.socket.emit('register-keys', bundle, (res: any) => {
      if (res && res.success) {
        console.log('MessageRelay: Keys successfully registered on relay server.');
      } else {
        console.error('MessageRelay: Key registration failed:', res?.error);
      }
    });
  }

  async replenishKeys() {
    if (!this.socket?.connected) {
      console.warn('MessageRelay: Socket not connected. Cannot replenish keys.');
      return;
    }

    const keys = await IdentityService.loadKeys();
    if (!keys) {
      console.warn('MessageRelay: No identity keys found to replenish.');
      return;
    }

    console.log('MessageRelay: Generating a fresh E2EE prekey bundle...');
    const bundle = await IdentityService.generatePreKeyBundle(keys, true); // forceRegenerate = true
    if (!bundle) {
      console.error('MessageRelay: Failed to replenish prekey bundle.');
      return;
    }

    console.log('MessageRelay: Uploading replenished prekeys to server...');
    this.socket.emit('register-keys', bundle, (res: any) => {
      if (res && res.success) {
        console.log('MessageRelay: Prekeys pool successfully replenished on server!');
      } else {
        console.error('MessageRelay: Replenish upload failed:', res?.error);
      }
    });
  }

  fetchPreKeyBundle(targetUserId: string): Promise<any | null> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        console.warn('MessageRelay: Socket not connected. Cannot fetch prekey bundle.');
        resolve(null);
        return;
      }

      console.log(`MessageRelay: Fetching prekey bundle for ${targetUserId} from server...`);
      this.socket.emit('fetch-keys', targetUserId, (res: any) => {
        if (res && res.success && res.bundle) {
          resolve(res.bundle);
        } else {
          console.warn(`MessageRelay: Failed to fetch prekey bundle for ${targetUserId}:`, res?.error);
          resolve(null);
        }
      });
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

  async sendGroupMessage(groupId: string, content: string, type: string = 'text', mediaUri?: string) {
    try {
      // 1. Distribute key to other group participants if not done
      // For MVP/test-group, the remote participant is 'user2'
      const participants = ['user2'];
      const mySenderKey = await EncryptionService.getOrGenerateGroupSenderKey(groupId);

      for (const userId of participants) {
        const distributedKey = await getSignalStoreValue(`group_key_sent:${groupId}:${userId}`);
        if (!distributedKey) {
          console.log(`MessageRelay: Distributing group key for ${groupId} to participant ${userId}`);
          const distributionPayload = JSON.stringify({
            type: 'group-key-distribution',
            groupId,
            senderKey: mySenderKey
          });
          await this.sendSecureMessage(userId, distributionPayload);
          await saveSignalStoreValue(`group_key_sent:${groupId}:${userId}`, 'true');
        }
      }

      // 2. Encrypt the group message payload using our group sender key
      let encryptedPayload: any;
      if (type === 'image' || type === 'audio') {
        if (mediaUri) {
          console.log(`MessageRelay: Encrypting media attachment: ${mediaUri}`);
          const mediaEncResult = await EncryptionService.encryptMedia(mediaUri);
          
          const mediaPayload = JSON.stringify({
            type: 'media',
            text: content,
            encryptedMediaUri: mediaEncResult.encryptedUri,
            mediaKey: mediaEncResult.key,
            mediaIv: mediaEncResult.iv
          });

          encryptedPayload = await EncryptionService.encryptGroupMessage(groupId, mediaPayload);
        } else {
          encryptedPayload = await EncryptionService.encryptGroupMessage(groupId, content);
        }
      } else {
        encryptedPayload = await EncryptionService.encryptGroupMessage(groupId, content);
      }

      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

      this.sendMessage('group-message', {
          groupId,
          ciphertext: encryptedPayload,
          timestamp: Date.now(),
          type,
          mediaUri,
          messageId
      });
    } catch (e) {
      console.error('MessageRelay: Failed to send E2EE group message', e);
    }
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
      return null;
    }

    try {
      const sessionExists = await EncryptionService.hasSession(toUserId);
      if (!sessionExists) {
        console.log(`MessageRelay: No active session for ${toUserId}. Initiating handshake...`);
        const bundle = await this.fetchPreKeyBundle(toUserId);
        if (!bundle) {
          throw new Error(`E2EE bundle for recipient ${toUserId} not found on server.`);
        }

        const success = await EncryptionService.establishHybridSession(toUserId, bundle);
        if (!success) {
          throw new Error(`Cryptographic handshake with ${toUserId} failed.`);
        }
      }

      console.log(`MessageRelay: Encrypting message for ${toUserId}...`);
      const ciphertext = await EncryptionService.encryptHybridMessage(toUserId, content);
      
      if (!ciphertext) {
        throw new Error('Encryption failed');
      }

      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

      const payload = {
        to: toUserId,
        ciphertext,
        timestamp: Date.now(),
        messageId,
      };

      await this.sendMessage('chat-message', payload);
      console.log('MessageRelay: Secure hybrid message sent (or queued)');
      return messageId;
    } catch (e) {
      console.error('MessageRelay: Failed to send secure message', e);
      return null;
    }
  }

  async sendSecureMessageWithMedia(toUserId: string, content: string, type: 'image' | 'audio', mediaUri: string) {
    if (!EncryptionService.isInitialized()) {
      console.error('MessageRelay: EncryptionService not initialized');
      return null;
    }

    try {
      const sessionExists = await EncryptionService.hasSession(toUserId);
      if (!sessionExists) {
        console.log(`MessageRelay: No active session for ${toUserId}. Initiating handshake...`);
        const bundle = await this.fetchPreKeyBundle(toUserId);
        if (!bundle) {
          throw new Error(`E2EE bundle for recipient ${toUserId} not found on server.`);
        }

        const success = await EncryptionService.establishHybridSession(toUserId, bundle);
        if (!success) {
          throw new Error(`Cryptographic handshake with ${toUserId} failed.`);
        }
      }

      console.log(`MessageRelay: Encrypting media attachment: ${mediaUri}`);
      const mediaEncResult = await EncryptionService.encryptMedia(mediaUri);

      const mediaPayload = JSON.stringify({
        type: 'media',
        text: content,
        encryptedMediaUri: mediaEncResult.encryptedUri,
        mediaKey: mediaEncResult.key,
        mediaIv: mediaEncResult.iv
      });

      console.log(`MessageRelay: Encrypting E2EE hybrid envelope for ${toUserId}...`);
      const ciphertext = await EncryptionService.encryptHybridMessage(toUserId, mediaPayload);
      if (!ciphertext) {
        throw new Error('Encryption failed');
      }

      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

      const payload = {
        to: toUserId,
        ciphertext,
        timestamp: Date.now(),
        messageId,
        type,
        mediaUri
      };

      await this.sendMessage('chat-message', payload);
      console.log('MessageRelay: Secure hybrid media message sent successfully');
      return messageId;
    } catch (e) {
      console.error('MessageRelay: Failed to send secure message with media', e);
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
