# PIM E2EE Relay Server: Production Deployment

## Recommendation

Use Railway first for the production beta relay.

It is the path of least resistance for this repo because the relay is a single Dockerized Node.js service, Railway supports monorepo deployments from a service directory, provisions HTTPS/WSS automatically, and requires very little platform-specific config. The current relay is stateless, so it does not need a database or volume for the first production beta.

## Hosting Options

| Host | Best fit | Tradeoff |
| --- | --- | --- |
| Railway | Fastest beta deployment, simple GitHub deploys, low setup time | Usage-based billing needs limits/alerts |
| Render | Simple managed web service, predictable starter pricing, health checks | Starter tiers can be less flexible for always-on WebSockets |
| Fly.io | Multi-region low-latency relay later | More operational surface area than Railway for first launch |
| VPS | Cheapest at steady low traffic | You own patching, TLS, firewalling, restarts, and monitoring |

## Production Beta Architecture

```text
Expo app
  EXPO_PUBLIC_RELAY_URL=wss://relay.example.com
        |
        v
Managed HTTPS/WSS endpoint
        |
        v
Docker container running backend/dist/server.js
        |
        v
In-memory socket rooms, prekey bundles, volatile invite bundles, anonymous routing tokens
```

The relay should remain stateless for the first beta. Add durable offline queues only after deciding what metadata retention policy is acceptable.

## Required Environment Variables

```bash
PORT=3000
ALLOWED_ORIGINS=https://app.pim-protocol.org,https://pim-client.netlify.app
```

For native mobile clients, Socket.IO connections often arrive without a browser `Origin`; the server intentionally allows missing origins while restricting browser origins.

## Railway Deployment Steps

1. Create a new Railway project from the GitHub repo.
2. Set the service root directory to `backend`.
3. Let Railway build from `backend/Dockerfile`.
4. Add `ALLOWED_ORIGINS` in Railway variables.
5. Generate or attach a custom domain, for example `relay.pim-protocol.net`.
6. Confirm Railway serves TLS, then use the `wss://` custom domain in the mobile app.
7. Set the app build variable:

```bash
EXPO_PUBLIC_RELAY_URL=wss://relay.pim-protocol.net
```

8. Rebuild the app binary with EAS after setting the relay URL.

## Release Checks

Run these before every relay release:

```bash
cd backend
npm ci
npm audit --omit=dev
npm run build
npm start
curl -f http://localhost:3000/health
```

Expected health response:

```json
{
  "status": "ok",
  "uptimeSeconds": 12,
  "connectedUsers": 0,
  "registeredKeyBundles": 0,
  "activeRoutingTokens": 0
}
```

## Operational Defaults

Start with one always-on instance. Do not horizontally scale the current relay yet because socket rooms, key bundles, volatile invite bundles, and routing tokens are in memory. Multiple instances will require sticky sessions plus a shared adapter such as Redis, or a redesign around distributed ephemeral state.

Use platform-level alerts for:

- Container restart loops
- Memory steadily rising over time
- 5xx responses on `/health`
- Sustained packet rate-limit disconnects
- Unexpected traffic spikes

## Hard Launch Gates

Do not call the relay production-ready until these are true:

- `npm audit --omit=dev` is clean for the backend.
- `/health` is reachable over HTTPS on the production domain.
- A real-device app build connects with `EXPO_PUBLIC_RELAY_URL=wss://...`.
- Two physical devices can register keys, establish a session, and exchange encrypted messages.
- Offline behavior is explicitly accepted as "drop while offline" or a metadata-reviewed queue is implemented.
- Logs do not contain plaintext message content, full tokens, private keys, or stable user metadata beyond the current beta policy.
