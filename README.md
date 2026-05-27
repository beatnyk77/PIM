# PIM: Private Intelligence Messenger

**Private Intelligence Messenger (PIM)** is a state-of-the-art, offline-first, quantum-safe end-to-end encrypted messaging application. Designed for users demanding total privacy and control, PIM combines native cryptographic security with powerful, on-device artificial intelligence. No data is stored in the cloud, no messages are parsed on third-party servers, and the central relay remains completely stateless—ensuring absolute user autonomy and confidentiality.

---

## 🛡️ Core Security Features

*   **Dual-Layer Hybrid Onion E2EE:** Direct messages are dual-encrypted nesting Curve25519 DH keys inside post-quantum **FIPS 203 ML-KEM-768** lattice ciphers, defeating Harvest-Now-Decrypt-Later (HNDL) timing attacks.
*   **SQLCipher page-level Database Encryption:** Local storage is page-encrypted via `@op-engineering/op-sqlite` using AES-256-XTS with Enclave-backed PBKDF2 derived passphrases.
*   **Metadata-Routing Token Batches:** Eliminates persistent `userId` fields from active packet headers. Messages are routed anonymously using pre-shared, single-use token queues that the server wipes instantly post-delivery.
*   **Plausible Deniability Decoy Vaults:** Dual-passphrase unlocking mounts a completely separate decoy SQLite instance (`pim-decoy-db.sqlite`) populated with benign simulated work threads, hiding your actual secure container (`pim-secured-db.sqlite`).
*   **Panic Mode Wiping Gesture:**Accelerometer face-down flips or failed passcode thresholds execute high-priority zeroization, erasing Secure Enclave key materials, binary-scrubbing SQLite databases, and hard-exiting immediately.
*   **Local-Only AI (Timing Shielded):** Quantized LLM execution (`llama.rn`) is protected by system role exploit sanitizers and random timing noise token padding to prevent CPU/GPUTiming attacks.

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

---

## ⚠️ Known Limitations (Beta V1)
1. **Background Socket Drops (iOS):** Due to aggressive iOS background task termination, long-lived WebSockets may drop when the app is backgrounded.
2. **Local AI Memory Usage:** The `llama.rn` GGUF models require 2GB+ of free RAM. Older devices may experience thermal throttling or OOM crashes.
3. **Lite Mode:** If you experience battery drain or crashes, enable **Lite Mode** in Settings. This completely disables local AI processing and uses lighter cryptographic padding.
4. **Relay Uptime:** The default relay node is stateless and best-effort. Self-hosting the relay server is highly recommended for production-critical deployments.

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
