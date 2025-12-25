### MVP Build Plan for Ssenger: Granular Step-by-Step Tasks

This plan breaks down the MVP development into ultra-small, isolated tasks, each focusing on one concern (e.g., setup, a single service method, or a UI component). Tasks are sequential to minimize dependencies, allowing incremental building and testing. Each task includes:

- **Focus**: The single concern.
- **Start**: Prerequisite or entry point.
- **End**: Deliverable artifact or state.
- **Test**: Verification steps (run via `npx expo start`, test on emulator/device).

Assume Trae IDE for code generation, but tasks are manual/LLM-executable. Begin in the cloned repo root. Total estimated tasks: ~50 for MVP; iterate as needed.

#### Phase 1: Project Setup (Environment & Skeleton)
1. **Task: Initialize Expo React Native Project**
   - **Focus**: Basic app scaffolding.
   - **Start**: Cloned repo root; install Expo CLI globally if needed (`npm install -g expo-cli`).
   - **End**: New Expo project in `/app` folder with TypeScript enabled.
   - **Test**: Run `npx expo start`; see default splash screen on emulator.

2. **Task: Install Core Dependencies**
   - **Focus**: Package installation (React Navigation, Zustand, NativeWind).
   - **Start**: After Task 1; edit `package.json`.
   - **End**: Installed packages: `@react-navigation/native`, `@react-navigation/native-stack`, `zustand`, `nativewind`, `tailwindcss`, `mitt` (event bus).
   - **Test**: Run `npm install`; verify no errors; check `package.json` lists them.

3. **Task: Configure NativeWind for Styling**
   - **Focus**: Tailwind setup for calm UX.
   - **Start**: After Task 2; create `tailwind.config.js`.
   - **End**: Configured Tailwind with monochrome palette (e.g., grays, blues); update `babel.config.js` for NativeWind.
   - **Test**: Add a test component with Tailwind class; run app; see styled element.

4. **Task: Set Up React Navigation**
   - **Focus**: Basic navigation skeleton.
   - **Start**: After Task 3; create `/app/navigation/index.tsx`.
   - **End**: Root navigator with a single "Home" screen placeholder.
   - **Test**: Run app; navigate to Home; no crashes.

5. **Task: Create App Root Component**
   - **Focus**: Wrap app with providers.
   - **Start**: After Task 4; edit `/app/App.tsx`.
   - **End**: App.tsx with NavigationContainer and Zustand provider.
   - **Test**: Run app; see navigation without errors.

#### Phase 2: Storage & State Management
6. **Task: Install Storage Dependencies**
   - **Focus**: Secure local storage libs.
   - **Start**: After Task 5.
   - **End**: Installed: `expo-secure-store`, `expo-sqlite`, `@nozbe/watermelondb` (for encrypted DB; alternative to Realm for simplicity).
   - **Test**: `npm install`; verify in `package.json`.

7. **Task: Create StateManager Skeleton**
   - **Focus**: In-memory state store.
   - **Start**: After Task 6; create `/app/services/storage/StateManager.ts`.
   - **End**: Basic Zustand store with empty state (e.g., { activeChat: null }).
   - **Test**: Import and log store in App.tsx; run app; see console output.

8. **Task: Implement LocalDb Skeleton**
   - **Focus**: Encrypted DB setup.
   - **Start**: After Task 7; create `/app/services/storage/LocalDb.ts`.
   - **End**: Initialize WatermelonDB with schema for messages (id, content, sender).
   - **Test**: Open DB connection in a test function; log success.

9. **Task: Add Encryption to LocalDb**
   - **Focus**: At-rest encryption.
   - **Start**: After Task 8; install `expo-crypto` if needed.
   - **End**: Wrap DB writes with encryption using expo-crypto (AES).
   - **Test**: Write/read a test encrypted record; verify decryption.

#### Phase 3: Authentication & Identity
10. **Task: Install Auth Dependencies**
    - **Focus**: Crypto libs for keys.
    - **Start**: After Task 9.
    - **End**: Installed: `expo-crypto`, `@privacyresearch/libsignal-protocol-typescript`.
    - **Test**: `npm install`; no errors.

11. **Task: Create IdentityService Skeleton**
    - **Focus**: Local key generation.
    - **Start**: After Task 10; create `/app/services/auth/IdentityService.ts`.
    - **End**: Method to generate identity keys (using libsignal).
    - **Test**: Call generateKeys(); log keys; store in SecureStore.

12. **Task: Persist Identity Keys**
    - **Focus**: Secure storage of keys.
    - **Start**: After Task 11.
    - **End**: Save/load keys to/from expo-secure-store.
    - **Test**: Generate, save, reload keys; assert equality.

#### Phase 4: Messaging Core (Without Encryption/AI)
13. **Task: Install Networking Dependencies**
    - **Focus**: WebSocket client.
    - **Start**: After Task 12.
    - **End**: Installed: `socket.io-client`.
    - **Test**: `npm install`.

14. **Task: Create MessageRelay Skeleton**
    - **Focus**: WebSocket connection.
    - **Start**: After Task 13; create `/app/services/messaging/MessageRelay.ts`.
    - **End**: Connect to backend URL (placeholder); emit test event.
    - **Test**: Run app; log connection success.

15. **Task: Implement Offline Queue in MessageRelay**
    - **Focus**: Queue messages when offline.
    - **Start**: After Task 14.
    - **End**: Array queue; persist to LocalDb.
    - **Test**: Simulate offline; queue message; reconnect and drain.

16. **Task: Create Basic ChatThread Component**
    - **Focus**: UI for message list.
    - **Start**: After Task 15; create `/app/components/ChatThread.tsx`.
    - **End**: FlatList rendering dummy messages.
    - **Test**: Add to navigation; run; see list.

17. **Task: Integrate StateManager with ChatThread**
    - **Focus**: Display stored messages.
    - **Start**: After Task 16.
    - **End**: Pull messages from Zustand; render in FlatList.
    - **Test**: Mock state; see updates on screen.

#### Phase 5: End-to-End Encryption
18. **Task: Create EncryptionService Skeleton**
    - **Focus**: Session management.
    - **Start**: After Task 17; create `/app/services/messaging/EncryptionService.ts`.
    - **End**: Initialize Signal store with IdentityService keys.
    - **Test**: Log initialized store.

19. **Task: Implement Message Encryption**
    - **Focus**: Encrypt outgoing text.
    - **Start**: After Task 18.
    - **End**: Method: encryptMessage(session, text) → ciphertext.
    - **Test**: Mock session; encrypt/decrypt; assert original.

20. **Task: Implement Message Decryption**
    - **Focus**: Decrypt incoming.
    - **Start**: After Task 19.
    - **End**: Method: decryptMessage(session, ciphertext) → text.
    - **Test**: Pair with encrypt; round-trip test.

21. **Task: Integrate Encryption with MessageRelay**
    - **Focus**: Encrypt before relay send.
    - **Start**: After Task 20.
    - **End**: Wrap send in encrypt; receive in decrypt.
    - **Test**: Send encrypted message; verify receipt decrypted.

#### Phase 6: Backend Relay Setup (Separate)
22. **Task: Create Backend Folder and Package.json**
    - **Focus**: Node.js server init.
    - **Start**: After Task 21; create `/backend`.
    - **End**: package.json with `express`, `socket.io`.
    - **Test**: `cd backend; npm install`.

23. **Task: Implement Basic WebSocket Server**
    - **Focus**: Relay connections.
    - **Start**: After Task 22; create `/backend/server.ts`.
    - **End**: Server listens; forwards messages by user ID.
    - **Test**: Run `node server.ts`; connect client; echo test.

24. **Task: Add Identity Verification to Backend**
    - **Focus**: Public key registry.
    - **Start**: After Task 23.
    - **End**: Socket event to register/lookup public keys.
    - **Test**: Register key; query and assert match.

#### Phase 7: AI Layer Setup
25. **Task: Install AI Dependencies**
    - **Focus**: On-device ML.
    - **Start**: After Task 24.
    - **End**: Installed: `react-native-ai` (or `mlc-llm-react-native`).
    - **Test**: `npm install`.

26. **Task: Bundle Initial AI Model**
    - **Focus**: Add small model.
    - **Start**: After Task 25; create `/models`.
    - **End**: Download/copy Phi-3 Mini GGUF to folder.
    - **Test**: Verify file exists.

27. **Task: Create AiAdvisor Skeleton**
    - **Focus**: Load model.
    - **Start**: After Task 26; create `/app/services/ai/AiAdvisor.ts`.
    - **End**: Init and load model from path.
    - **Test**: Log model loaded.

28. **Task: Implement Basic Reply Suggestion**
    - **Focus**: Generate draft reply.
    - **Start**: After Task 27.
    - **End**: Method: suggestReply(context, message) → text proposal.
    - **Test**: Input mock; get output; assert non-empty.

29. **Task: Create ToneDetector Skeleton**
    - **Focus**: Tone analysis.
    - **Start**: After Task 28; create `/app/services/ai/ToneDetector.ts`.
    - **End**: Method: detectTone(text) → {tone: 'neutral'}.
    - **Test**: Test with sample texts.

30. **Task: Create MemoryIndex Skeleton**
    - **Focus**: Local indexing.
    - **Start**: After Task 29; create `/app/services/ai/MemoryIndex.ts`.
    - **End**: Init vector store (e.g., in-memory array).
    - **Test**: Add/retrieve embedding.

31. **Task: Generate Embeddings in MemoryIndex**
    - **Focus**: Embed text.
    - **Start**: After Task 30.
    - **End**: Use AI model for feature extraction.
    - **Test**: Embed sample; search similar.

#### Phase 8: AI Integration & Advisory Features
32. **Task: Hook AI Suggestions to ChatThread**
    - **Focus**: Display reply drafts.
    - **Start**: After Task 31.
    - **End**: On new message, call suggestReply; show in UI with approve button.
    - **Test**: Simulate message; see suggestion; tap approve sends.

33. **Task: Implement Task Detection in AiAdvisor**
    - **Focus**: Extract commitments.
    - **Start**: After Task 32.
    - **End**: Parse message for tasks/deadlines.
    - **Test**: Input with "meet tomorrow"; output task object.

34. **Task: Create CommitmentsDashboard Component**
    - **Focus**: UI for tasks.
    - **Start**: After Task 33; create `/app/components/CommitmentsDashboard.tsx`.
    - **End**: List view of extracted tasks.
    - **Test**: Mock data; render list.

35. **Task: Integrate MemoryIndex with Search**
    - **Focus**: Semantic search UI.
    - **Start**: After Task 34.
    - **End**: Add search bar to dashboard; query index.
    - **Test**: Index messages; search; see results.

#### Phase 9: Additional MVP Features
36. **Task: Add Read Receipts to Messaging**
    - **Focus**: Status tracking.
    - **Start**: After Task 35.
    - **End**: Emit/read receipt events via relay.
    - **Test**: Send message; see "read" update.

37. **Task: Implement Voice Notes**
    - **Focus**: Audio recording.
    - **Start**: After Task 36; install `expo-av`.
    - **End**: Record/send audio; play in ChatThread.
    - **Test**: Record short clip; playback works.

38. **Task: Add Media Support**
    - **Focus**: Image/video send.
    - **Start**: After Task 37; install `expo-image-picker`.
    - **End**: Pick/send media; render in thread.
    - **Test**: Pick image; see in chat.

39. **Task: Implement Basic Groups**
    - **Focus**: Multi-user chats.
    - **Start**: After Task 38.
    - **End**: Group ID in messages; filter by group.
    - **Test**: Create group; send to it.

40. **Task: Add Screenshot Detection**
    - **Focus**: Privacy alert.
    - **Start**: After Task 39; use `expo-screen-capture`.
    - **End**: Listen for captures; alert user.
    - **Test**: Simulate capture; see alert.

#### Phase 10: Event Bus & Integration
41. **Task: Create EventBus Utility**
    - **Focus**: Pub/Sub setup.
    - **Start**: After Task 40; create `/app/utils/eventBus.ts`.
    - **End**: Mitt instance with emit/on.
    - **Test**: Emit event; listener logs.

42. **Task: Connect Services via EventBus**
    - **Focus**: Wire messaging to AI.
    - **Start**: After Task 41.
    - **End**: On new message event, trigger AI processing.
    - **Test**: Send message; see AI suggestion event.

#### Phase 11: Polish & Testing
43. **Task: Implement SettingsPanel**
    - **Focus**: Opt-in controls.
    - **Start**: After Task 42.
    - **End**: Toggle AI features; save to storage.
    - **Test**: Toggle; persist across restarts.

44. **Task: Add Delayed Send Prompt**
    - **Focus**: Regret protection.
    - **Start**: After Task 43.
    - **End**: Timer before send; cancel option.
    - **Test**: Queue send; cancel works.

45. **Task: Implement Self-Destruct Messages**
    - **Focus**: Timer-based delete.
    - **Start**: After Task 44.
    - **End**: Flag message; auto-delete after time.
    - **Test**: Send with timer; verify gone.

46. **Task: Create HomeScreen**
    - **Focus**: Chat list overview.
    - **Start**: After Task 45.
    - **End**: List of chats; navigate to thread.
    - **Test**: See chats; tap opens.

47. **Task: Optimize for Offline**
    - **Focus**: Full offline messaging.
    - **Start**: After Task 46.
    - **End**: All features work without net (queue syncs).
    - **Test**: Go offline; send/AI; reconnect syncs.

#### Phase 12: Final MVP Touches
48. **Task: Update App Icons and Splash**
    - **Focus**: Branding.
    - **Start**: After Task 47.
    - **End**: Custom icons in `/app/assets`.
    - **Test**: Run; see new splash.

49. **Task: Configure EAS Build**
    - **Focus**: Production build setup.
    - **Start**: After Task 48; edit `eas.json`.
    - **End**: Config for iOS/Android builds.
    - **Test**: Run `eas build --profile development`; verify.

50. **Task: End-to-End MVP Test**
    - **Focus**: Holistic verification.
    - **Start**: After Task 49.
    - **End**: Document test scenarios (e.g., send encrypted message, get AI suggestion, approve).
    - **Test**: Run full flow; log passes/fails.