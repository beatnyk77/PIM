import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();

// 1. Production CORS allowed origins
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['https://app.pim-protocol.org', 'https://pim-client.netlify.app'];

// Ensure '*' is parsed securely if supplied
const isAllOriginsAllowed = ALLOWED_ORIGINS.includes('*');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like native mobile apps or curl)
    if (!origin) return callback(null, true);
    if (isAllOriginsAllowed || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// 2. Privacy-First Request Logging Middleware (anonymizes IPs to prevent metadata tracking)
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const anonymizedIp = ip.includes('.') 
    ? ip.split('.').slice(0, 2).join('.') + '.x.x'
    : 'ipv6-masked';
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} | Status ${res.statusCode} | IP ${anonymizedIp} | ${duration}ms`);
  });
  next();
});

// 3. Production Hardened Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; object-src 'none';");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  next();
});

// 4. In-Memory HTTP Rate Limiter (IP-based)
const ipLimits = new Map<string, { count: number; resetTime: number }>();
const LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // max 100 requests per minute

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  const record = ipLimits.get(ip);
  if (!record || now > record.resetTime) {
    ipLimits.set(ip, { count: 1, resetTime: now + LIMIT_WINDOW_MS });
    next();
  } else {
    record.count++;
    if (record.count > MAX_REQUESTS) {
      res.status(429).send('Too Many Requests');
    } else {
      next();
    }
  }
});

const httpServer = createServer(app);

// 4. Secure Socket.IO Setup with Production CORS
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 5. Socket.IO Rate Limiters (Connection & Packet based)
const socketLimits = new Map<string, { count: number; resetTime: number }>();
const MAX_SOCKET_PACKETS_PER_MIN = 300;

io.use((socket, next) => {
  const ip = socket.handshake.address;
  const now = Date.now();
  const record = socketLimits.get(ip);
  if (!record || now > record.resetTime) {
    socketLimits.set(ip, { count: 1, resetTime: now + LIMIT_WINDOW_MS });
    next();
  } else {
    record.count++;
    if (record.count > 10) { // max 10 socket connections per IP per minute
      return next(new Error('Rate limit exceeded: Too many socket connections'));
    }
    next();
  }
});

const PORT = process.env.PORT || 3000;

// Store connected users: userId -> Set of socketIds (for multi-device)
const connectedUsers = new Map<string, Set<string>>();

// Key Registry: userId -> KeyBundle
const keyRegistry = new Map<string, any>();

// Volatile registries for metadata defense
const volatileKeyRegistry = new Map<string, any>();
const tokenRoutingRegistry = new Map<string, string>();

io.on('connection', (socket: Socket) => {
  const userId = socket.handshake.query.userId as string;

  // Packet rate limiting to prevent spamming
  socket.use((packet, next) => {
    const now = Date.now();
    const record = socketLimits.get(socket.id) || { count: 0, resetTime: now + LIMIT_WINDOW_MS };
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + LIMIT_WINDOW_MS;
    } else {
      record.count++;
    }
    socketLimits.set(socket.id, record);
    
    if (record.count > MAX_SOCKET_PACKETS_PER_MIN) {
      console.warn(`[Rate Limit] Socket ${socket.id} (${userId}) exceeded packet rate limit! Disconnecting.`);
      socket.emit('error', 'Rate limit exceeded: Too many messages sent');
      socket.disconnect(true);
      return;
    }
    next();
  });

  if (!userId) {
    console.log(`[Connection] Rejected: No userId provided (Socket ID: ${socket.id})`);
    socket.disconnect();
    return;
  }

  console.log(`[Connection] User connected: ${userId} (Socket ID: ${socket.id})`);
  
  socket.join(userId);

  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId)!.add(socket.id);

  socket.on('disconnect', () => {
    console.log(`[Disconnect] User disconnected: ${userId} (Socket ID: ${socket.id})`);
    const sockets = connectedUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        connectedUsers.delete(userId);
      }
    }
    // Clean up active anonymous routing tokens for this socket
    for (const [token, socketId] of tokenRoutingRegistry.entries()) {
      if (socketId === socket.id) {
        tokenRoutingRegistry.delete(token);
      }
    }
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
          io.to(targetUserId).emit('replenish-keys', { remaining: bundle.preKeys.length });
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
      io.to(data.to).emit('message', { ...data, from: userId });
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
      io.to(to).emit('chat-message', {
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
          io.to(to).emit('read-receipt', {
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
      // { groupId, content, timestamp, type, mediaUri, ciphertext, messageId } = data;
      const { groupId, content, timestamp, type, mediaUri, ciphertext, messageId } = data;
      console.log(`[Groups] Message in ${groupId} from ${userId}`);
      
      // Broadcast to room excluding sender
      socket.to(groupId).emit('group-message', {
          from: userId,
          groupId,
          content,
          timestamp,
          type,
          mediaUri,
          ciphertext,
        });
  });

  // --- Anonymous Routing & Volatile Link Key Exchange ---

  // 1. Subscribe to batch of 50 anonymous routing tokens
  socket.on('subscribe-tokens-batch', (tokens: string[], ack: (res: any) => void) => {
    console.log(`[Metadata Defense] Client ${userId} subscribing to batch of ${tokens.length} anonymous tokens.`);
    tokens.forEach(tok => {
      tokenRoutingRegistry.set(tok, socket.id);
    });
    if (ack) ack({ success: true });
  });

  // 2. Relay anonymous E2EE envelopes and instantly wipe/flush routing token mapping
  socket.on('anonymous-relay', (data: any, ack: (res: any) => void) => {
    const { destinationToken, ciphertext, type, mediaUri, messageId } = data;
    if (tokenRoutingRegistry.has(destinationToken)) {
      const targetSocketId = tokenRoutingRegistry.get(destinationToken);
      io.to(targetSocketId!).emit('anonymous-receive', {
        ciphertext,
        type,
        mediaUri,
        messageId,
        destinationToken
      });
      // Flush token instantly to deny passive sizing/timing mappings
      tokenRoutingRegistry.delete(destinationToken);
      console.log(`[Metadata Defense] Securely relayed anonymous packet and flushed token: ${destinationToken.substring(0, 8)}...`);
      if (ack) ack({ success: true });
    } else {
      if (ack) ack({ success: false, error: 'Token offline or already consumed' });
    }
  });

  // 3. Register Volatile Bundle indexed by fetch token
  socket.on('register-volatile-bundle', (data: any, ack: (res: any) => void) => {
    const { linkToken, bundle } = data;
    volatileKeyRegistry.set(linkToken, bundle);
    console.log(`[Metadata Defense] Volatile bundle registered for one-time fetch link: ${linkToken.substring(0, 8)}...`);
    if (ack) ack({ success: true });
  });

  // 4. Fetch Volatile Bundle and instantly wipe/purge registry entry
  socket.on('fetch-volatile-bundle', (linkToken: string, ack: (res: any) => void) => {
    const bundle = volatileKeyRegistry.get(linkToken);
    if (bundle) {
      if (ack) ack({ success: true, bundle });
      volatileKeyRegistry.delete(linkToken);
      console.log(`[Metadata Defense] Volatile bundle delivered and permanently deleted for token: ${linkToken.substring(0, 8)}...`);
    } else {
      if (ack) ack({ success: false, error: 'Volatile link expired or already fetched.' });
    }
  });

});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Relay Server running on http://localhost:${PORT}\n`);
});
