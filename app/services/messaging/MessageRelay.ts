import { io, Socket } from 'socket.io-client';
import mitt from 'mitt';
import { database, QueuedMessage } from '../storage/LocalDb';

// Events that the Relay emits to the app
type RelayEvents = {
  'connected': void;
  'disconnected': void;
  'message': any;
};

export const relayEvents = mitt<RelayEvents>();

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
      relayEvents.emit('connected');
      this.processOfflineQueue();
    });

    this.socket.on('disconnect', () => {
      console.log('MessageRelay: Disconnected');
      relayEvents.emit('disconnected');
    });

    this.socket.on('message', (data: any) => {
      console.log('MessageRelay: Received message:', data);
      relayEvents.emit('message', data);
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
