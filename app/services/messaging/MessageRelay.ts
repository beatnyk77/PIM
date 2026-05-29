import { io, Socket } from 'socket.io-client';
import { 
  database, 
  QueuedMessage, 
  saveMessageToDb, 
  getSignalStoreValue, 
  saveSignalStoreValue, 
  saveGroupSenderKeyToDb 
} from '../storage/LocalDb';
import { EncryptionService } from './EncryptionService';
import { EventBus } from '../EventBus';
import { useStore } from '../storage/StateManager';
import { IdentityService } from '../auth/IdentityService';
import CryptoJS from 'crypto-js';

class MessageRelayService {
  private socket: Socket | null = null;
  private serverUrl: string = (() => {
    const envUrl = process.env.EXPO_PUBLIC_RELAY_URL || process.env.RELAY_URL;
    if (envUrl) {
      return envUrl;
    }
    return 'wss://relay.pim-protocol.net';
  })();
  private dummyInterval: any = null;
  private revocationRebroadcastInterval: any = null;

  connect(userId: string) {
    if (this.socket?.connected) return;

    console.log('MessageRelay: Connecting anonymously to', this.serverUrl);

    this.socket = io(this.serverUrl, {
      query: { userId },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });

    this.socket.on('connect', async () => {
      console.log('MessageRelay: Connected:', this.socket?.id);
      EventBus.emit('network.connected');
      this.processOfflineQueue();


      // Auto-register public E2EE key bundle
      this.registerKeys();

      // Subscribe to active pre-shared inbound tokens on backend for metadata masking
      await this.subscribeInboundTokens();

      // Start periodic randomized dummy packets background stream
      this.startDummyPacketNoise();

      // Start periodic re-broadcast of latest revocation epochs
      this.startRevocationRebroadcast();

      // Listen for E2EE keys replenishment requests
      this.socket!.on('replenish-keys', async (data: any) => {
        console.log(`MessageRelay: Server reports E2EE prekeys running low (${data.remaining}). Replenishing pool...`);
        await this.replenishKeys();
      });
    });

    this.socket.on('disconnect', () => {
      console.log('MessageRelay: Disconnected');
      EventBus.emit('network.disconnected');
      if (this.dummyInterval) {
        clearInterval(this.dummyInterval);
        this.dummyInterval = null;
      }
      if (this.revocationRebroadcastInterval) {
        clearInterval(this.revocationRebroadcastInterval);
        this.revocationRebroadcastInterval = null;
      }
    });

    this.socket.on('message', (data: any) => {
      console.log('MessageRelay: Received message:', data);
      EventBus.emit('message.received', data);
    });

    // Listen for anonymous token-routed envelopes
    this.socket.on('anonymous-receive', async (data: any) => {
      console.log('MessageRelay: Received anonymous token-routed envelope via token:', data.destinationToken);
      
      try {
        const senderId = await this.resolveTokenOwner(data.destinationToken);
        if (!senderId) {
          console.warn(`MessageRelay: Anonymous envelope consumed token ${data.destinationToken} does not map to any active dynamic contact. Dropping.`);
          return;
        }
        
        // Remove this consumed token from our inbound local list
        const currentInbound = await this.getInboundTokens(senderId);
        await this.saveInboundTokens(senderId, currentInbound.filter(t => t !== data.destinationToken));

        const decryptedContent = await EncryptionService.decryptHybridMessage(senderId, data.ciphertext);
        if (!decryptedContent) {
          console.warn('MessageRelay: Failed to decrypt anonymous message');
          return;
        }

        console.log('MessageRelay: Anonymous message decrypted successfully');

        // Intercept token handshakes, responses, and replenishments
        try {
          const parsed = JSON.parse(decryptedContent);
          
          if (parsed && parsed.type === 'device-revocation') {
            console.log(`[MessageRelay] Received signed device-revocation broadcast from ${senderId} for device ${parsed.revokedDeviceId}`);
            const isVerified = await IdentityService.verifyRevocationSignature(
              senderId,
              parsed.revokedDeviceId,
              parsed.revocationEpoch,
              parsed.signature
            );
            if (isVerified) {
              console.log(`[MessageRelay] Revocation signature verified! Saving epoch ${parsed.revocationEpoch} for device ${parsed.revokedDeviceId}`);
              await IdentityService.saveContactRevocationEpoch(senderId, parsed.revokedDeviceId, parsed.revocationEpoch);
            } else {
              console.warn(`[MessageRelay] INVALID revocation signature received from ${senderId}!`);
            }
            return;
          }

          if (parsed && parsed.type === 'token-handshake') {
            console.log(`MessageRelay: Processing bootstrap token-handshake from ${senderId}`);
            await this.saveOutboundTokens(senderId, parsed.tokens);
            
            // Generate and reply with our inbound token batch to complete anonymous channel bootstrap
            const myInboundTokens: string[] = [];
            for (let i = 0; i < 50; i++) {
              myInboundTokens.push(CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex));
            }
            await this.saveInboundTokens(senderId, myInboundTokens);
            this.socket?.emit('subscribe-tokens-batch', myInboundTokens);

            const handshakeResponse = JSON.stringify({
              type: 'token-handshake-response',
              tokens: myInboundTokens
            });
            await this.sendSecureMessage(senderId, handshakeResponse);
            
            if (parsed.text) {
              EventBus.emit('message.secure-received', {
                from: senderId,
                content: parsed.text,
                timestamp: data.timestamp || Date.now(),
                messageId: data.messageId
              });
              await saveMessageToDb({
                  id: data.messageId || Date.now().toString(),
                  content: parsed.text,
                  senderId: senderId,
                  timestamp: data.timestamp || Date.now(),
                  isMe: false,
                  status: 'read'
              });
            }
            return;
          }

          if (parsed && parsed.type === 'token-handshake-response') {
            console.log(`MessageRelay: Received token-handshake-response from ${senderId}. Outbound batch mapped.`);
            await this.saveOutboundTokens(senderId, parsed.tokens);
            return;
          }

          if (parsed && parsed.type === 'token-replenishment') {
            console.log(`MessageRelay: Appending replenished outbound token batch from ${senderId}`);
            const currentOutbound = await this.getOutboundTokens(senderId);
            await this.saveOutboundTokens(senderId, [...currentOutbound, ...parsed.tokens]);
            return;
          }

          if (parsed && parsed.type === 'group-key-distribution') {
            console.log(`MessageRelay: Received group-key-distribution for group ${parsed.groupId} from ${senderId} device ${parsed.senderDeviceId || '1'}`);
            const compositeSenderId = `${senderId}:${parsed.senderDeviceId || '1'}`;
            await saveGroupSenderKeyToDb(parsed.groupId, compositeSenderId, parsed.senderKey);
            return;
          }

          if (parsed && parsed.type === 'group-handshake') {
            console.log(`MessageRelay: Received group-handshake control packet from ${senderId}`);
            const { GroupSessionManager } = require('./GroupSessionManager');
            await GroupSessionManager.processInboundHandshake(parsed.groupId, senderId, parsed.envelope.senderDeviceId.toString(), parsed.envelope.payload ? JSON.parse(parsed.envelope.payload) : parsed.envelope);
            return;
          }
        } catch (e) {
          // Normal message text
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
          // Normal text
        }

        EventBus.emit('message.secure-received', {
          from: senderId,
          content: textContent,
          timestamp: Date.now(),
          messageId: data.messageId,
          type: data.type || (isMedia ? 'image' : 'text'),
          mediaUri: mediaUriDecrypted
        });

        await saveMessageToDb({
            id: data.messageId || Date.now().toString(),
            content: textContent,
            senderId: senderId,
            timestamp: Date.now(),
            isMe: false,
            status: 'read',
            type: data.type || (isMedia ? 'image' : 'text'),
            mediaUri: mediaUriDecrypted
        });

      } catch (err) {
        console.error('MessageRelay: Error handling anonymous-receive', err);
      }
    });

    // Listen for classical encrypted chat messages
    this.socket.on('chat-message', async (data: any) => {
      console.log('MessageRelay: Received encrypted message from', data.from);
      
      try {
        const decryptedContent = await EncryptionService.decryptHybridMessage(data.from, data.ciphertext);
        
        if (decryptedContent) {
          console.log('MessageRelay: Message decrypted successfully');

          // Intercept bootstrap token handshakes and group keys
          try {
            const parsed = JSON.parse(decryptedContent);
            
            if (parsed && parsed.type === 'device-revocation') {
              console.log(`[MessageRelay] Received signed device-revocation broadcast from ${data.from} for device ${parsed.revokedDeviceId}`);
              const isVerified = await IdentityService.verifyRevocationSignature(
                data.from,
                parsed.revokedDeviceId,
                parsed.revocationEpoch,
                parsed.signature
              );
              if (isVerified) {
                console.log(`[MessageRelay] Revocation signature verified! Saving epoch ${parsed.revocationEpoch} for device ${parsed.revokedDeviceId}`);
                await IdentityService.saveContactRevocationEpoch(data.from, parsed.revokedDeviceId, parsed.revocationEpoch);
              } else {
                console.warn(`[MessageRelay] INVALID revocation signature received from ${data.from}!`);
              }
              return;
            }

            if (parsed && parsed.type === 'token-handshake') {
              console.log(`MessageRelay: Processing bootstrap token-handshake from ${data.from}`);
              await this.saveOutboundTokens(data.from, parsed.tokens);

              const myInboundTokens: string[] = [];
              for (let i = 0; i < 50; i++) {
                myInboundTokens.push(CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex));
              }
              await this.saveInboundTokens(data.from, myInboundTokens);
              this.socket?.emit('subscribe-tokens-batch', myInboundTokens);

              const handshakeResponse = JSON.stringify({
                type: 'token-handshake-response',
                tokens: myInboundTokens
              });
              await this.sendSecureMessage(data.from, handshakeResponse);

              let mediaUriDecrypted = data.mediaUri;
              let isMedia = false;
              if (parsed.mediaDetails) {
                isMedia = true;
                const details = parsed.mediaDetails;
                if (details.encryptedMediaUri && details.mediaKey && details.mediaIv) {
                  const localDecryptedPath = await EncryptionService.decryptMedia(details.encryptedMediaUri, details.mediaKey, details.mediaIv);
                  mediaUriDecrypted = localDecryptedPath;
                }
              }

              EventBus.emit('message.secure-received', {
                from: data.from,
                content: parsed.text || '',
                timestamp: data.timestamp || Date.now(),
                messageId: data.messageId,
                type: data.type || (isMedia ? 'image' : 'text'),
                mediaUri: mediaUriDecrypted
              });

              await saveMessageToDb({
                  id: data.messageId,
                  content: parsed.text || '',
                  senderId: data.from,
                  timestamp: data.timestamp || Date.now(),
                  isMe: false,
                  status: 'read',
                  type: data.type || (isMedia ? 'image' : 'text'),
                  mediaUri: mediaUriDecrypted
              });
              return;
            }

            if (parsed && parsed.type === 'token-handshake-response') {
              console.log(`MessageRelay: Received token-handshake-response from ${data.from}. Outbound batch mapped.`);
              await this.saveOutboundTokens(data.from, parsed.tokens);
              return;
            }

            if (parsed && parsed.type === 'group-key-distribution') {
              console.log(`MessageRelay: Received group-key-distribution for group ${parsed.groupId} from ${data.from} device ${parsed.senderDeviceId || '1'}`);
              const compositeSenderId = `${data.from}:${parsed.senderDeviceId || '1'}`;
              await saveGroupSenderKeyToDb(parsed.groupId, compositeSenderId, parsed.senderKey);
              return;
            }

            if (parsed && parsed.type === 'group-handshake') {
              console.log(`MessageRelay: Received group-handshake control packet from ${data.from}`);
              const { GroupSessionManager } = require('./GroupSessionManager');
              await GroupSessionManager.processInboundHandshake(parsed.groupId, data.from, parsed.envelope.senderDeviceId.toString(), parsed.envelope.payload ? JSON.parse(parsed.envelope.payload) : parsed.envelope);
              return;
            }
          } catch (e) {
            // Normal message
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
            // Normal message
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
          if (data.ciphertext && (
            data.ciphertext.version === 'v1_group_sender_key' || 
            data.ciphertext.version === 'v1_group_sender_key_multi' || 
            data.ciphertext.version === 'v2_group_mls_transition'
          )) {
            let decryptedContent: string | null = null;
            if (data.ciphertext.version === 'v2_group_mls_transition') {
              const { GroupSessionManager } = require('./GroupSessionManager');
              decryptedContent = await GroupSessionManager.decrypt(data.groupId, data.ciphertext);
            } else {
              decryptedContent = await EncryptionService.decryptGroupMessage(
                data.groupId, 
                data.from, 
                data.ciphertext, 
                data.ciphertext.senderDeviceId?.toString()
              );
            }

            if (decryptedContent) {
              console.log('MessageRelay: Group message decrypted successfully!');
              
              let textContent = decryptedContent;
              let mediaUriDecrypted = data.mediaUri;
              let isMedia = false;

              try {
                const parsed = JSON.parse(decryptedContent);
                if (parsed && parsed.type === 'group-moderation') {
                  if (parsed.action === 'delete-message' && parsed.targetMessageId) {
                    console.log(`[MessageRelay] Received admin moderation delete request for message ${parsed.targetMessageId}`);
                    const { GroupSessionManager } = require('./GroupSessionManager');
                    const roster = await GroupSessionManager.getGroupRoster(data.groupId);
                    const senderNode = (roster as any[]).find((m: any) => m.userId === data.from);
                    
                    if (senderNode && senderNode.role === 'admin') {
                      console.log(`[MessageRelay] Cryptographic admin role verified for ${data.from}. Executing deletion...`);
                      const { deleteMessageFromDb } = require('../storage/LocalDb');
                      await deleteMessageFromDb(parsed.targetMessageId);

                      const { useStore } = require('../storage/StateManager');
                      useStore.getState().deleteMessage(parsed.targetMessageId);
                      
                      // Log the admin moderation event in the E2EE ledger
                      await GroupSessionManager.logAdminAction(data.groupId, 'Message Moderated', `Admin ${data.from} deleted message ID ${parsed.targetMessageId} for everyone.`);

                      EventBus.emit('message.deleted', { messageId: parsed.targetMessageId });
                    } else {
                      console.warn(`[MessageRelay] Security breach block: Non-admin ${data.from} tried to delete message!`);
                    }
                  }
                  return; // Void further rendering for control packet
                }

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

  // --- Ephemeral Token Management & Batches ---
  async getInboundTokens(remoteUserId: string): Promise<string[]> {
    const raw = await getSignalStoreValue(`tokens_inbound:${remoteUserId}`);
    return raw ? JSON.parse(raw) : [];
  }

  async saveInboundTokens(remoteUserId: string, tokens: string[]): Promise<void> {
    await saveSignalStoreValue(`tokens_inbound:${remoteUserId}`, JSON.stringify(tokens));
    for (const tok of tokens) {
      await saveSignalStoreValue(`token_owner:${tok}`, remoteUserId);
    }
  }

  async getOutboundTokens(remoteUserId: string): Promise<string[]> {
    const raw = await getSignalStoreValue(`tokens_outbound:${remoteUserId}`);
    return raw ? JSON.parse(raw) : [];
  }

  async saveOutboundTokens(remoteUserId: string, tokens: string[]): Promise<void> {
    await saveSignalStoreValue(`tokens_outbound:${remoteUserId}`, JSON.stringify(tokens));
  }

  async resolveTokenOwner(token: string): Promise<string | undefined> {
    return await getSignalStoreValue(`token_owner:${token}`);
  }

  async subscribeInboundTokens() {
    if (!this.socket?.connected) return;
    try {
      const contacts = await IdentityService.getContacts();
      for (const contact of contacts) {
        const tokens = await this.getInboundTokens(contact);
        if (tokens.length > 0) {
          console.log(`MessageRelay: Subscribing to ${tokens.length} inbound tokens for dynamic contact ${contact}.`);
          this.socket.emit('subscribe-tokens-batch', tokens);
        }
      }
    } catch (e) {
      console.error('MessageRelay: Failed to subscribe dynamic inbound tokens', e);
    }
  }

  async generateAndSendTokenReplenishment(remoteUserId: string): Promise<void> {
    console.log(`MessageRelay: Automatically replenishing token batch for ${remoteUserId}...`);
    const newTokens: string[] = [];
    for (let i = 0; i < 50; i++) {
      newTokens.push(CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex));
    }
    
    const currentInbound = await this.getInboundTokens(remoteUserId);
    const updatedInbound = [...currentInbound, ...newTokens];
    await this.saveInboundTokens(remoteUserId, updatedInbound);

    if (this.socket?.connected) {
      this.socket.emit('subscribe-tokens-batch', newTokens);
    }

    const payload = JSON.stringify({
      type: 'token-replenishment',
      senderId: 'me',
      tokens: newTokens
    });
    
    await this.sendSecureMessage(remoteUserId, payload);
  }

  // --- Background Dummy Packet Stream ---
  startDummyPacketNoise() {
    if (this.dummyInterval) clearInterval(this.dummyInterval);
    
    this.dummyInterval = setInterval(() => {
      if (this.socket?.connected) {
        const dummyEnvelope = {
          version: 'v2_hybrid_kem',
          type: 'dummy',
          ciphertext_pq: CryptoJS.lib.WordArray.random(128).toString(CryptoJS.enc.Base64),
          nonce: CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex)
        };
        setTimeout(() => {
          if (this.socket?.connected) {
            this.socket.emit('anonymous-relay', {
              destinationToken: CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex),
              ciphertext: dummyEnvelope
            });
          }
        }, Math.random() * 200 + 50);
      }
    }, 25000);
  }

  startRevocationRebroadcast() {
    if (this.revocationRebroadcastInterval) {
      clearInterval(this.revocationRebroadcastInterval);
    }
    // Re-broadcast immediately on connection establishment
    IdentityService.rebroadcastRevocations().catch(e => console.error('[MessageRelay] Failed to rebroadcast revocations:', e));

    // Periodically run every 15 minutes (or 5 seconds in E2E tests, which we can trigger or mock)
    this.revocationRebroadcastInterval = setInterval(() => {
      IdentityService.rebroadcastRevocations().catch(e => console.error('[MessageRelay] Periodic rebroadcast failed:', e));
    }, 15 * 60 * 1000);
  }

  // --- Volatile Key Bundle links ---
  registerVolatileKeys(linkToken: string, bundle: any): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        console.warn('MessageRelay: Socket not connected. Cannot register volatile keys.');
        resolve(false);
        return;
      }
      this.socket.emit('register-volatile-bundle', { linkToken, bundle }, (res: any) => {
        if (res && res.success) {
          console.log(`MessageRelay: Volatile prekeys registered successfully: ${linkToken}`);
          resolve(true);
        } else {
          console.error('MessageRelay: Volatile prekey registration failed:', res?.error);
          resolve(false);
        }
      });
    });
  }

  fetchVolatileKeys(linkToken: string): Promise<any | null> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        console.warn('MessageRelay: Socket not connected. Cannot fetch volatile prekeys.');
        resolve(null);
        return;
      }
      this.socket.emit('fetch-volatile-bundle', linkToken, (res: any) => {
        if (res && res.success && res.bundle) {
          console.log(`MessageRelay: Volatile prekeys fetched successfully: ${linkToken}`);
          resolve(res.bundle);
        } else {
          console.error('MessageRelay: Volatile prekey fetch failed:', res?.error);
          resolve(null);
        }
      });
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
    const bundle = await IdentityService.generatePreKeyBundle(keys, true);
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
    if (this.dummyInterval) {
      clearInterval(this.dummyInterval);
      this.dummyInterval = null;
    }
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
      const { GroupSessionManager } = require('./GroupSessionManager');
      const context = await GroupSessionManager.getGroupContext(groupId);

      let encryptedPayload: any;

      if (context) {
        console.log(`[MessageRelay] Encrypting group message via MLS-aligned GroupSessionManager (Epoch ${context.epoch})`);
        if ((type === 'image' || type === 'audio') && mediaUri) {
          console.log(`[MessageRelay] Encrypting media attachment for MLS group: ${mediaUri}`);
          const mediaEncResult = await EncryptionService.encryptMedia(mediaUri);
          const mediaPayload = JSON.stringify({
            type: 'media',
            text: content,
            encryptedMediaUri: mediaEncResult.encryptedUri,
            mediaKey: mediaEncResult.key,
            mediaIv: mediaEncResult.iv
          });
          encryptedPayload = await GroupSessionManager.encrypt(groupId, mediaPayload);
        } else {
          encryptedPayload = await GroupSessionManager.encrypt(groupId, content);
        }
      } else {
        const keys = await IdentityService.loadKeys();
        const myId = keys?.registrationId.toString() || '1';
        const roster = await GroupSessionManager.getGroupRoster(groupId);
        const participants = roster.map((m: any) => m.userId).filter((id: any) => id !== myId);
        const myDeviceId = keys ? keys.deviceId.toString() : '1';
        const mySenderKey = await EncryptionService.getOrGenerateGroupSenderKey(groupId, myDeviceId);

        for (const userId of participants) {
          const distributedKey = await getSignalStoreValue(`group_key_sent:${groupId}:${userId}`);
          if (!distributedKey) {
            console.log(`MessageRelay: Distributing legacy group key for ${groupId} to participant ${userId}`);
            const distributionPayload = JSON.stringify({
              type: 'group-key-distribution',
              groupId,
              senderKey: mySenderKey,
              senderDeviceId: myDeviceId
            });
            await this.sendSecureMessage(userId, distributionPayload);
            await saveSignalStoreValue(`group_key_sent:${groupId}:${userId}`, 'true');
          }
        }

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

            encryptedPayload = await EncryptionService.encryptGroupMessage(groupId, mediaPayload, myDeviceId);
          } else {
            encryptedPayload = await EncryptionService.encryptGroupMessage(groupId, content, myDeviceId);
          }
        } else {
          encryptedPayload = await EncryptionService.encryptGroupMessage(groupId, content, myDeviceId);
        }
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

      const outboundTokens = await this.getOutboundTokens(toUserId);
      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

      if (outboundTokens.length > 0) {
        const nextToken = outboundTokens.shift()!;
        await this.saveOutboundTokens(toUserId, outboundTokens);

        console.log(`MessageRelay: Securely routing message anonymously via token: ${nextToken.substring(0, 8)}...`);
        
        if (outboundTokens.length < 10) {
          setTimeout(() => this.generateAndSendTokenReplenishment(toUserId), 100);
        }

        const ciphertext = await EncryptionService.encryptHybridMessage(toUserId, content);
        if (!ciphertext) throw new Error('Encryption failed');

        // Traffic Shaping: 50-250ms delayed anonymous relay dispatch
        setTimeout(() => {
          if (this.socket?.connected) {
            this.socket.emit('anonymous-relay', {
              destinationToken: nextToken,
              ciphertext,
              messageId
            });
            console.log('[Shaping] Anonymous padded E2EE packet dispatched.');
          }
        }, Math.random() * 200 + 50);

        return messageId;

      } else {
        console.log('MessageRelay: No pre-shared tokens yet. Bootstrapping anonymous tokens batch...');
        
        const myInboundTokens: string[] = [];
        for (let i = 0; i < 50; i++) {
          myInboundTokens.push(CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex));
        }
        await this.saveInboundTokens(toUserId, myInboundTokens);
        
        if (this.socket?.connected) {
          this.socket.emit('subscribe-tokens-batch', myInboundTokens);
        }

        const bootstrappedPayload = JSON.stringify({
          type: 'token-handshake',
          tokens: myInboundTokens,
          text: content
        });

        console.log(`MessageRelay: Encrypting bootstrap hybrid message for ${toUserId}...`);
        const ciphertext = await EncryptionService.encryptHybridMessage(toUserId, bootstrappedPayload);
        if (!ciphertext) throw new Error('Encryption failed');

        const payload = {
          to: toUserId,
          ciphertext,
          timestamp: Date.now(),
          messageId,
        };

        // Dispatch via classical handshake wrapper with shaped delay
        setTimeout(() => {
          if (this.socket?.connected) {
            this.socket.emit('chat-message', payload);
            console.log('[Shaping] Bootstrap classic E2EE packet dispatched.');
          }
        }, Math.random() * 200 + 50);

        return messageId;
      }
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

      const outboundTokens = await this.getOutboundTokens(toUserId);
      const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

      if (outboundTokens.length > 0) {
        const nextToken = outboundTokens.shift()!;
        await this.saveOutboundTokens(toUserId, outboundTokens);

        if (outboundTokens.length < 10) {
          setTimeout(() => this.generateAndSendTokenReplenishment(toUserId), 100);
        }

        console.log(`MessageRelay: Encrypting E2EE hybrid envelope for anonymous token: ${nextToken.substring(0, 8)}...`);
        const ciphertext = await EncryptionService.encryptHybridMessage(toUserId, mediaPayload);
        if (!ciphertext) throw new Error('Encryption failed');

        setTimeout(() => {
          if (this.socket?.connected) {
            this.socket.emit('anonymous-relay', {
              destinationToken: nextToken,
              ciphertext,
              type,
              mediaUri,
              messageId
            });
            console.log('[Shaping] Anonymous media padded packet dispatched.');
          }
        }, Math.random() * 200 + 50);

        return messageId;
      } else {
        console.log('MessageRelay: Bootstrapping anonymous tokens batch for media channel...');
        const myInboundTokens: string[] = [];
        for (let i = 0; i < 50; i++) {
          myInboundTokens.push(CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex));
        }
        await this.saveInboundTokens(toUserId, myInboundTokens);
        
        if (this.socket?.connected) {
          this.socket.emit('subscribe-tokens-batch', myInboundTokens);
        }

        const bootstrappedMediaPayload = JSON.stringify({
          type: 'token-handshake',
          tokens: myInboundTokens,
          text: content,
          mediaDetails: {
            encryptedMediaUri: mediaEncResult.encryptedUri,
            mediaKey: mediaEncResult.key,
            mediaIv: mediaEncResult.iv
          }
        });

        console.log(`MessageRelay: Encrypting bootstrap media hybrid message for ${toUserId}...`);
        const ciphertext = await EncryptionService.encryptHybridMessage(toUserId, bootstrappedMediaPayload);
        if (!ciphertext) throw new Error('Encryption failed');

        const payload = {
          to: toUserId,
          ciphertext,
          timestamp: Date.now(),
          messageId,
          type,
          mediaUri
        };

        setTimeout(() => {
          if (this.socket?.connected) {
            this.socket.emit('chat-message', payload);
            console.log('[Shaping] Bootstrap classic E2EE media packet dispatched.');
          }
        }, Math.random() * 200 + 50);

        return messageId;
      }
    } catch (e) {
      console.error('MessageRelay: Failed to send secure message with media', e);
      return null;
    }
  }

  async sendMessage(event: string, data: any) {
    if (this.socket?.connected) {
      // Direct emit for system events, shaping delay
      setTimeout(() => {
        if (this.socket?.connected) {
          this.socket.emit(event, data);
        }
      }, Math.random() * 200 + 50);
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

      for (const msg of queuedMessages) {
        if (this.socket?.connected) {
          try {
             const data = JSON.parse(msg.data);
             // Directly emit offline flushes
             this.socket.emit(msg.event, data);
             
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
