import { io, Socket } from 'socket.io-client';
import mitt from 'mitt';

// Events that the Relay emits to the app
type RelayEvents = {
  'connected': void;
  'disconnected': void;
  'message': any; // We'll define a stricter type later
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

  sendMessage(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('MessageRelay: Cannot send, socket not connected');
      // TODO: Queue message for later (Task 15)
    }
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }
}

export const MessageRelay = new MessageRelayService();
