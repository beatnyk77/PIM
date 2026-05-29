# PIM: Private Intelligence Messenger

**Private Intelligence Messenger (PIM)** is a state-of-the-art, offline-first, quantum-safe end-to-end encrypted messaging application. Designed for users demanding total privacy and control, PIM combines native cryptographic security with powerful, on-device artificial intelligence. No data is stored in the cloud, no messages are parsed on third-party servers, and the central relay remains completely stateless—ensuring absolute user autonomy and confidentiality.

---

## 🛡️ Core Security Features

*   **Dual-Layer Hybrid Onion E2EE:** Direct messages are dual-encrypted nesting Curve25519 DH keys inside post-quantum **FIPS 203 ML-KEM-768** lattice ciphers, defeating Harvest-Now-Decrypt-Later (HNDL) timing attacks.
*   **SQLCipher page-level Database Encryption:** Local storage is page-encrypted via `@op-engineering/op-sqlite` using AES-256-XTS with Enclave-backed PBKDF2 derived passphrases.
*   **Metadata-Routing Token Batches:** Eliminates persistent `userId` fields from active packet headers. Messages are routed anonymously using pre-shared, single-use token queues that the server wipes instantly post-delivery.
*   **Plausible Deniability Decoy Vaults:** Dual-passphrase unlocking mounts a completely separate decoy SQLite instance (`pim-decoy-db.sqlite`) populated with benign simulated work threads, hiding your actual secure container (`pim-secured-db.sqlite`).
*   **Panic Mode Wiping Gesture:** Accelerometer face-down flips or failed passcode thresholds execute high-priority zeroization, erasing Secure Enclave key materials, binary-scrubbing SQLite databases, and hard-exiting immediately.
*   **Local-Only AI (Timing Shielded):** Quantized LLM execution (`llama.rn`) is protected by system role exploit sanitizers and random timing noise token padding to prevent CPU/GPUTiming attacks.
*   **Cryptographic Multi-Device Sync:** Seamlessly link multiple devices with forward secrecy preserved across all endpoints. Device revocation broadcasts signed epoch blocks to instantly purge compromised instances from contact networks.
*   **MLS-Aligned Secure Group Messaging:** Employs decentralized Group Sender Keys with MLS-style security epoch rotations. Features include scannable burn-on-use QR invite links with optional password protection and 10-minute expiry validation, local page-encrypted security audit logs for tracking administrative actions, verified cryptographic admin message deletion (moderation), private on-device AI search results summarization, and symmetrically encrypted media attachments (images) broadcast within secure MLS group sessions.

---

## 💻 Tech Stack Summary

### Native Client (Mobile App)
*   **Framework:** React Native + Expo (TypeScript-first)
*   **Database:** WatermelonDB page-encrypted via `@op-engineering/op-sqlite` (SQLCipher AES-256-XTS)
*   **Key Storage:** expo-secure-store (Hardware enclave Keychain/Keystore)
*   **On-Device AI:** `llama.rn` (quantized GGUF models, lock-memory `use_mlock`)
*   **E2EE Engine:** `@privacyresearch/libsignal-protocol-typescript` + `mlkem`
*   **Styling & UI:** Tailwind CSS (via NativeWind v4)

### Minimal Stateless Relay (Backend Server)
*   **Runtime:** Node.js (TypeScript) + Express + Socket.io
*   **Storage:** Stateless (No DB storage; in-memory transient volatile directories only)

---

## 🚀 How to Run Locally

### 1. Run the Backend Relay Server
Open a terminal at the project root and navigate to the backend directory:
```bash
cd backend
npm install
npm run start
```
The relay server will start and listen on `http://localhost:3000`.

### 2. Run the Expo Client (Mobile App)
Open a new terminal window at the project root and navigate to the app directory:
```bash
cd app
npm install
npx expo start
```

### 3. Public Beta Installation
For the initial public beta, we bypass traditional app stores to maintain independence from telemetry and review delays.
1. Download the latest APK (Android) or IPA (iOS) from our GitHub Releases page.
2. Install the application manually on your device.
3. Upon first launch, the **Safety Check Wizard** will validate your cryptographic enclave and secure database mount.

## ⚠️ Known Limitations & Known Issues (Private Beta v0.9.0-beta.2)

PIM is currently in an active **Controlled Private Beta** development phase under version `v0.9.0-beta.2`. While our core cryptographic envelopes (Dual-Layer ML-KEM + Signal) and local database encryption layers (SQLCipher AES-256-XTS) are mathematically hardened, the system exhibits several design boundaries and early-stage software limitations:

### 🛡️ Architectural Limitations (Decentralized & Zero-Knowledge by Design)
1. **Stateless Relay Amnesia:**
   * **Limitation:** To ensure absolute zero-telemetry and metadata shielding, the default relay server is completely state-free and zero-knowledge. It operates without a persistent database and retains no message queue queues.
   * **Consequence:** If a recipient is completely offline at the exact millisecond a direct or group message is transmitted, the server drops the packet instantly.
   * **Mitigation:** For critical, high-availability deployments, self-hosting a private relay with a transient PostgreSQL cache is recommended. See [`backend/PRODUCTION_DEPLOYMENT.md`](backend/PRODUCTION_DEPLOYMENT.md) for the first production relay runbook.
2. **Decoy Partition Cryptographic Isolation:**
   * **Limitation:** The Plausible Deniability Decoy Vault runs an independent SQLite database container (`pim-decoy-db.sqlite`) derived from a separate PBKDF2 passphrase chain.
   * **Consequence:** Real contacts, secure keys, and messaging histories never cross over or synchronize with the decoy partition. This isolation is a strict cryptographic requirement; any data bridge would leave structural traces, instantly defeating plausible deniability under inspection.

### 🐛 Known Issues (Active Beta Resolution Path)
1. **Aggressive Background Socket Drops (iOS):**
   * **Issue:** Due to aggressive iOS operating system background process daemon controls, idle WebSockets are systematically severed within 30–60 seconds of client backgrounding.
   * **Status:** Under active engineering. The app instantly executes a secure reconnect and forward-secret key-exchange handshaking sequence the moment it is brought back to the foreground. APNs (Apple Push Notification service) silent background wake support is scheduled for `v0.9.0-beta.3`.
2. **Local AI Memory Allocations & Thermals:**
   * **Issue:** Loading and running the quantized `phi-3-mini` GGUF model via the `llama.rn` engine requires at least 2.2GB of continuous resident RAM. This can lead to heavy battery consumption, minor thermal throttling, or out-of-memory (OOM) app crashes on legacy mobile devices.
   * **Status:** Mitigated. Users on resource-constrained hardware can toggle **Lite Mode** in settings to completely bypass local LLM initialization, substituting AI search features with high-speed timing-shielded noise padding sweeps.

---

## 🌐 Deployment (Monorepo Production Relay)

PIM is structured as a monorepo containing the native client in `/app` and the stateless E2EE relay server in `/backend`. Deploying the relay is simplified using our root-level scripts, robust Docker configurations, and support for monorepo-friendly cloud platforms.

### 1. Root-Level Script Orchestration
You can manage the monorepo from the root directory using standard npm commands:
*   **Install Backend Dependencies:** `npm run install:backend`
*   **Build Backend Server:** `npm run build:backend`
*   **Start Backend Relay:** `npm run start:backend`
*   **Run Backend in Development:** `npm run dev:backend`
*   **Check Mobile App TypeScript Compilation:** `npm run tsc:app`

---

### 2. Platform Deployment Configurations

#### 🚄 Railway (Recommended - Easiest Setup)
Railway provides native support for monorepos by specifying a service sub-root:
1. Create a new Railway project and link it to your GitHub repository.
2. Under service settings, set the **Root Directory** to `backend`.
3. Railway will automatically detect the `backend/Dockerfile` and compile the multi-stage container.
4. Set the required **Environment Variables**:
   *   `PORT=3000` (or leave default, bound dynamically)
   *   `ALLOWED_ORIGINS=https://app.pim-protocol.org,https://pim-client.netlify.app`
5. Generate a public domain (e.g., `relay.pim-protocol.net`), providing automatic SSL (`https`/`wss`).
6. Point your client EAS build configuration to this URL: `EXPO_PUBLIC_RELAY_URL=wss://your-relay-domain.net`.

#### 🎈 Fly.io
To deploy on Fly.io, manage the deployment from the `/backend` subdirectory:
1. Make sure you have the Fly CLI installed and are authenticated (`fly auth login`).
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Initialize the application config (creates `fly.toml`):
   ```bash
   fly launch --dockerfile Dockerfile
   ```
4. Define your environment variables in `fly.toml` or set them via CLI:
   ```bash
   fly secrets set ALLOWED_ORIGINS="https://app.pim-protocol.org,https://pim-client.netlify.app"
   ```
5. Deploy the application:
   ```bash
   fly deploy
   ```

#### 🐳 Docker Standalone (VPS / Custom Cloud Host)
To compile and execute the secure multi-stage Docker container locally or on a standard Linux virtual private server:

*   **Option A: Build from Repository Root (Standard Monorepo Context)**
    Execute the build specifying the backend path as a build argument:
    ```bash
    docker build -t pim-backend --build-arg CONTEXT_DIR=backend -f backend/Dockerfile .
    ```
    
*   **Option B: Build inside the Backend Subdirectory**
    Navigate to the directory and run a standard docker build:
    ```bash
    cd backend
    docker build -t pim-backend .
    ```

*   **Running the Container**
    Run the production container, mapping port `3000` and defining environment limits:
    ```bash
    docker run -d \
      -p 3000:3000 \
      -e PORT=3000 \
      -e NODE_ENV=production \
      -e ALLOWED_ORIGINS="https://app.pim-protocol.org,https://pim-client.netlify.app" \
      --name pim-relay-server \
      pim-backend
    ```

---

## 🧪 Running Security & Integration Tests

PIM features an automated cryptographic audit and security threat validation test suite.

### 1. Execute TypeScript Compiler Check
To ensure 100% type safety and syntax validation inside both client and backend layers:
```bash
# Verify client compilation
cd app && npx -p typescript tsc --noEmit

# Verify backend compilation
cd backend && npx -p typescript tsc --noEmit
```

### 2. Run Integrated Cryptographic Threat Tests
Our integrated test runner validates the entire security threat matrix programmatically. In your runtime setup, calling `FullFlowTest` handles:
* `run()` - Basic identity establishment, offline databases persistence, and AI events.
* `runNetworkStressTest()` - SQLite queuing resiliency under rapid socket link flickering.
* `runMetadataHardeningTest()` - Standard bucket sizing (256/1024/4096), token registries, and volatile one-time prekey fetch-wipes.
* `runDuressAndSideChannelTest()` - Decoy partition separation, Panic zeroizations, prompt exploit shields, and timing timing noise.
