# Adapted Architecture for Ssenger: Native iOS & Android Mobile App with Local AI

## Strategic Pivot as CTO
. Native delivery ensures:
- Better performance for on-device AI (direct access to GPU/Neural Engine).
- True offline-first reliability.
- Deeper privacy controls (e.g., secure enclaves).
- App Store distribution for professional users.
- Calm, responsive UX without WebView overhead.

Your base repo (antigravity-workspace-template, optimized for agentic IDEs like Trae) remains ideal: Trae's AI agent will generate native code efficiently using your `.context/` principles.

**Recommended Framework: React Native with Expo**
- Why React Native (2025 state-of-the-art for your needs):
  - Mature ecosystem, huge community.
  - Single TypeScript codebase for iOS & Android.
  - Expo simplifies setup—no native code initially (EAS Build for production).
  - Best on-device AI support: react-native-ai (MLC LLM), ExecuTorch, llama.rn.
  - Proven for encrypted messaging apps.
- Alternatives considered:
  - Flutter: Great performance, but Dart ecosystem smaller; less flexible for local AI integrations.
  - Tauri/Capacitor: Better for web-first; native mobile support immature or WebView-based.
  - Native (Swift/Kotlin): Maximum performance/privacy, but slower development, no code share.

Expo + React Native allows vibe-coding in Trae: Prompt for screens/services → AI generates → hot reload.

## Updated File and Folder Structure
Leverage template's agentic folders; add React Native structure.

```
ssenger/
├── .antigravity/                # Keep for Trae/Antigravity compatibility
│   └── rules.md                 # Your principles as agent constraints
├── .context/                    # Critical for Trae AI consistency
│   ├── principles.md            # Full non-negotiable principles
│   ├── architecture.md          # This document
│   └── tech-stack.md            # React Native + Expo + react-native-ai etc.
├── .trae/                       # Trae-specific rules (or .rules)
│   └── rules.md                 # "Prioritize local AI, human approval, calm UX"
├── artifacts/                   # Trae-generated plans/diagrams
│   ├── mvp-plan.md
│   └── ai-integration.md
├── app/                         # Expo/React Native source
│   ├── components/              # UI components
│   │   ├── ChatThread.tsx
│   │   ├── ReplySuggestions.tsx   # Approval UI for AI drafts
│   │   ├── CommitmentsDashboard.tsx
│   │   └── SettingsPanel.tsx
│   ├── services/                # Core logic (TS modules)
│   │   ├── messaging/
│   │   │   ├── MessageRelay.ts  # WebSocket to backend
│   │   │   └── EncryptionService.ts  # Signal Protocol
│   │   ├── ai/
│   │   │   ├── AiAdvisor.ts     # react-native-ai / MLC LLM
│   │   │   ├── MemoryIndex.ts   # Local vector search (e.g., realm + embeddings)
│   │   │   └── ToneDetector.ts
│   │   ├── storage/
│   │   │   ├── LocalDb.ts       # Expo SecureStore + SQLite (encrypted)
│   │   │   └── StateManager.ts  # Zustand for reactive state
│   │   └── auth/
│   │       └── IdentityService.ts  # Local key generation
│   ├── utils/
│   │   ├── eventBus.ts          # Mitt for Pub/Sub
│   │   └── constants.ts
│   ├── screens/                 # Navigation screens
│   │   ├── HomeScreen.tsx
│   │   └── ChatScreen.tsx
│   ├── navigation/              # React Navigation setup
│   ├── App.tsx                  # Root component + providers
│   └── assets/                  # Icons, splash
├── models/                      # Bundled or downloadable GGUF/ONNX models
│   └── phi-3-mini.gguf          # Small on-device model
├── backend/                     # Separate: Minimal Node.js relay
│   ├── server.ts
│   └── package.json
├── tests/
├── app.json                     # Expo config
├── expo.json                    # If needed
├── package.json                 # RN deps
├── tsconfig.json
├── eas.json                     # EAS Build config
└── README.md
```

## What Each Part Does (Mobile-Specific Updates)
- **app/components/**: React Native components with NativeWind/Tailwind for calm, BBM-style UX (minimalist, no animations overload).
- **app/services/**:
  - **EncryptionService**: Use `@privacyresearch/libsignal-protocol-typescript` or `signal-protocol-react-native` (polyfill crypto with expo-crypto).
  - **AiAdvisor**: Primary: **react-native-ai** (MLC LLM engine) for on-device LLMs. Supports Llama-3.2, Phi-3, etc. Fallback: ExecuTorch or llama.rn for specific models.
  - **MemoryIndex**: Use Realm DB + on-device embeddings (from react-native-ai) for semantic search/knowledge graph.
  - **LocalDb**: Expo SQLite + expo-secure-store for encrypted storage. At-rest encryption via SQLCipher plugin.
- **models/**: Store small quantized models (e.g., GGUF format); download larger ones on first use.
- **backend/**: Unchanged—lean WebSocket relay (no storage/AI).

## Where State Lives and How Services Connect
- **Persistent State**:
  - Messages/conversations/knowledge graph: Encrypted SQLite (expo-sqlite + SQLCipher).
  - Keys/secrets: Expo SecureStore (hardware-backed).
  - Commitments/preferences: Same DB.
- **Transient State**: Zustand store for UI reactivity (active chat, pending suggestions).
- **AI State**: Models cached in app documents directory; inference in native threads (MLC/ExecuTorch handles offloading to GPU/NPU).
- **Connections**:
  - Event bus (Mitt) for loose coupling: e.g., new message → AI processes → publishes suggestions → UI shows approval modal.
  - Background tasks: expo-task-manager for offline queue/AI indexing.
  - Approval Flow: All AI actions (replies, nudges) require explicit user tap—never auto-send.
- **Offline-First**: Queue outgoing messages in DB; sync via WebSocket on reconnect. AI works fully offline.

## Tech Stack (2025 Optimized)
- **Core**: Expo (SDK 51+) + React Native.
- **UI**: NativeWind (Tailwind) + React Navigation.
- **State**: Zustand.
- **On-Device AI**:
  - **Primary**: react-native-ai (MLC LLM) – best integration, Vercel AI SDK compatible.
  - Alternatives: react-native-executorch (Meta), llama.rn (llama.cpp bindings).
- **Encryption**: libsignal-protocol-typescript + expo-crypto polyfills.
- **Storage**: expo-sqlite + expo-secure-store; optional Realm for vector search.
- **Networking**: Socket.io-client for relay.
- **Build/Distribution**: EAS Build (cloud builds) → TestFlight/Google Play Internal.

This stack delivers maximum privacy, performance, and human agency on native mobile. Local AI will feel instantaneous on modern devices (A17 Pro / Snapdragon 8 Gen 3+). Build iteratively—start with messaging + encryption, layer AI. Excited for your progress!

## Multi-Device Security Model & Cryptographic Revocation

PIM features a state-of-the-art **Device-to-Device (D2D) Cryptographic Co-Residency** architecture designed to sync keys securely across trusted platforms without weakening forward secrecy.

### 1. Root Identity Key Inheritance
- **Shared Identity, Isolated Ephemerals:** Trusted secondary devices share the primary's Curve25519 root identity key pair (classical) and ML-KEM-768 key pair (post-quantum) to preserve a consistent user identity and safety number footprint.
- **Independent Ratchets:** Ephemeral ratcheting and prekey pools remain fully isolated per device. Each device runs its own Signal session, preventing double-decryption failures and securing individual forward secrecy.

### 2. Active Cryptographic Revocation
- **Epoch Bumping:** When revoking a secondary device, the primary device locally increments the revocation epoch for that device and signs it with the root identity private key.
- **Signed Epoch Broadcasts:** The signed epoch update is automatically broadcasted over End-to-End Encrypted (E2EE) channels to all active contacts.
- **Verification & Filtering:** Contacts verify the broadcast signature against the primary's known public key and store the epoch. Any future messages originating from or targeted to the revoked device ID are cryptographically blocked.
- **Periodic Catch-Up Re-Broadcast:** Because contacts may be offline when a revocation occurs, PIM runs a periodic background task to re-broadcast active revocation epochs, guaranteeing eventual propagation.
- **Local Suspend Option:** Users can temporarily "suspend" a device to locally freeze synchronizations and imports on that terminal without triggering a permanent network-wide revocation.