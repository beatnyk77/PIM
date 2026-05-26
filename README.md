# PIM: Private Intelligence Messenger

**Private Intelligence Messenger (PIM)** is a state-of-the-art, offline-first, quantum-safe end-to-end encrypted messaging application. Designed for users demanding total privacy and control, PIM combines native cryptographic security with powerful, on-device artificial intelligence. No data is stored in the cloud, no messages are parsed on third-party servers, and the central relay remains completely stateless—ensuring absolute user autonomy and confidentiality.

---

## 🛡️ Core Principles

*   **End-to-End Encryption (E2EE):** Secured via an industrial-strength implementation of the Signal Protocol (Double Ratchet, PreKeys, and Diffie-Hellman handshakes) protecting every direct message.
*   **Local-Only AI (Zero Leakage):** On-device language model execution using native bindings (`llama.rn`). Features like tone detection, commitment extraction, and smart reply suggestions are processed fully offline on the device's Neural Engine/GPU—leaking zero conversation data.
*   **Offline-First Autonomy:** Outgoing messages and notifications are placed in an encrypted local queue and synced sequentially upon connection, while all local databases are heavily encrypted at rest.
*   **Calm & Manual Agency:** Clean, focused UX without notification or animation overload. AI suggestions are strictly opt-in, placing drafts in the input field rather than auto-sending, preserving user intention.
*   **Quantum-Safe Roadmap:** Engineered with modular crypto structures prepared to integrate post-quantum algorithms (ML-KEM/Kyber) to future-proof communication against future quantum threats.

---

## 💻 Tech Stack Summary

### Native Client (Mobile App)
*   **Framework:** React Native + Expo (TypeScript-first)
*   **Database:** WatermelonDB (SQLite Adapter via JSI) with field-level at-rest encryption
*   **Key Storage:** Expo SecureStore (hardware-backed Keychain/Keystore)
*   **On-Device AI:** `llama.rn` (quantized GGUF models, currentlyPhi-3 Mini)
*   **E2EE Engine:** `@privacyresearch/libsignal-protocol-typescript`
*   **Styling & UI:** Tailwind CSS (via NativeWind v4)

### Minimal Relay (Backend Server)
*   **Runtime:** Node.js (TypeScript)
*   **Framework:** Express
*   **Realtime Network:** Socket.io (WebSocket protocol)
*   **Storage:** Stateless (No message store; simple in-memory public key directory)

---

## 🚀 How to Run Locally

### Prerequisite
Ensure you have Node.js (v18+) and your package manager (`npm` or `yarn`) installed.

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
From the Expo interactive prompt, you can press **`i`** to launch the iOS Simulator, or **`a`** to launch the Android Emulator.

*Note: For the Android Emulator to connect to the local relay, ensure `serverUrl` in `MessageRelay.ts` is pointed to the emulator bridge `http://10.0.2.2:3000` instead of `http://localhost:3000`.*

---

## 🗺️ Current Status & Roadmap

PIM's core messaging flow, E2EE identity generation, at-rest database encryption, event-driven architecture, local AI advisor hooks, and backend relays are fully implemented. 

For the comprehensive, step-by-step roadmap detailing completed milestones and upcoming phases (such as native SQLCipher integration, secure media transfers, and group-key distribution), please consult:
👉 **[tasks.md](tasks.md)**
