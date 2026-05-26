import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for dev
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Store connected users: userId -> socketId
const connectedUsers = new Map<string, string>();

// Key Registry: userId -> KeyBundle
const keyRegistry = new Map<string, any>();

io.on('connection', (socket: Socket) => {
  const userId = socket.handshake.query.userId as string;

  if (!userId) {
    console.log(`[Connection] Rejected: No userId provided (Socket ID: ${socket.id})`);
    socket.disconnect();
    return;
  }

  console.log(`[Connection] User connected: ${userId} (Socket ID: ${socket.id})`);
  
  // Store mapping
  connectedUsers.set(userId, socket.id);

  socket.on('disconnect', () => {
    console.log(`[Disconnect] User disconnected: ${userId}`);
    connectedUsers.delete(userId);
  });

  // --- Key Management ---

  // 1. Register Public Keys (Upload Bundle)
  socket.on('register-keys', (bundle: any, ack: (response: any) => void) => {
    console.log(`[Keys] Registering keys for ${userId}`);
    // In a real app, validate signature here
    keyRegistry.set(userId, bundle);
    
    if (ack) ack({ success: true });
  });

  // 2. Fetch Public Keys (Download Bundle)
  socket.on('fetch-keys', (targetUserId: string, ack: (response: any) => void) => {
    console.log(`[Keys] ${userId} requesting keys for ${targetUserId}`);
    const bundle = keyRegistry.get(targetUserId);
    
    if (bundle) {
      // Deep clone public bundle values
      const yieldedBundle = {
        registrationId: bundle.registrationId,
        identityKey: bundle.identityKey,
        signedPreKey: bundle.signedPreKey,
        preKeys: [] as any[],
        pqIdentityKey: bundle.pqIdentityKey,
        pqSignedPreKey: bundle.pqSignedPreKey,
        pqPreKeys: [] as any[]
      };

      // Extract and pop exactly one prekey from the pool
      if (bundle.preKeys && bundle.preKeys.length > 0) {
        const poppedKey = bundle.preKeys.shift(); // Remove from server pool
        yieldedBundle.preKeys = [poppedKey];
        console.log(`[Keys] Consumed one-time prekey ${poppedKey.keyId} for ${targetUserId}. Remaining in server registry: ${bundle.preKeys.length}`);

        // Proactively notify user Bob if his prekey pool is running low (below 20 keys)
        if (bundle.preKeys.length < 20) {
          console.log(`[Keys] User ${targetUserId} prekeys pool running low (${bundle.preKeys.length}). Dispatching replenish alert.`);
          const targetSocketId = connectedUsers.get(targetUserId);
          if (targetSocketId) {
            io.to(targetSocketId).emit('replenish-keys', { remaining: bundle.preKeys.length });
          }
        }
      }

      // Pop one post-quantum prekey if available
      if (bundle.pqPreKeys && bundle.pqPreKeys.length > 0) {
        const poppedPqKey = bundle.pqPreKeys.shift();
        yieldedBundle.pqPreKeys = [poppedPqKey];
        console.log(`[Keys] Consumed one-time PQ prekey ${poppedPqKey.keyId} for ${targetUserId}. Remaining: ${bundle.pqPreKeys.length}`);
      }
      
      if (ack) ack({ success: true, bundle: yieldedBundle });
    } else {
      if (ack) ack({ success: false, error: 'User not found or no keys registered' });
    }
  });

  // --- Messaging ---

  // Handle generic messages (unencrypted or system)
  socket.on('message', (data: any) => {
    console.log(`[Message] From ${userId}:`, data);
    // Echo back for now or forward if 'to' exists
    if (data.to && connectedUsers.has(data.to)) {
      const targetSocketId = connectedUsers.get(data.to);
      io.to(targetSocketId!).emit('message', { ...data, from: userId });
    }
  });

  // Handle Encrypted Chat Messages
  socket.on('chat-message', (data: any) => {
    // Expecting: { to: string, ciphertext: any, timestamp: number }
    const { to, ciphertext, timestamp } = data;
    
    if (!to || !ciphertext) {
      console.warn(`[Chat] Invalid payload from ${userId}`);
      return;
    }

    console.log(`[Chat] Relaying secure message from ${userId} to ${to}`);

    if (connectedUsers.has(to)) {
      const targetSocketId = connectedUsers.get(to);
      io.to(targetSocketId!).emit('chat-message', {
        from: userId,
        ciphertext,
        timestamp,
        messageId: data.messageId // Pass through messageId
      });
    } else {
      console.log(`[Chat] User ${to} is offline. Message dropped (Queueing not implemented on backend yet).`);
      // In a real app, we would queue this in a DB here.
    }
  });

  // Handle Read Receipts
  socket.on('read-receipt', (data: any) => {
      const { to, messageId } = data;
      if (to && connectedUsers.has(to)) {
          const targetSocketId = connectedUsers.get(to);
          io.to(targetSocketId!).emit('read-receipt', {
              from: userId,
              messageId
          });
      }
  });

  // --- Groups ---

  // Join Group (Room)
  socket.on('join-group', (groupId: string) => {
      console.log(`[Groups] User ${userId} joining group ${groupId}`);
      socket.join(groupId);
  });

  // Group Message
  socket.on('group-message', (data: any) => {
      // { groupId, content (plaintext for now or encrypted shared key), timestamp }
      const { groupId, content, timestamp, type, mediaUri } = data;
      console.log(`[Groups] Message in ${groupId} from ${userId}`);
      
      // Broadcast to room excluding sender
      socket.to(groupId).emit('group-message', {
          from: userId,
          groupId,
          content,
          timestamp,
          type,
          mediaUri
      });
  });

});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Relay Server running on http://localhost:${PORT}\n`);
});
