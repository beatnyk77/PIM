# PIM Privacy Statement

**Private Intelligence Messenger (PIM)** is engineered on a foundation of absolute user autonomy and complete metadata resistance. Our system is designed so that we physically cannot harvest, track, parse, or store your private data.

---

## 1. Zero-Cloud Data Policy
* **Absolute Local Storage:** Every conversation, contact list, cryptographic key, and metadata index is kept strictly on your physical device. There are zero cloud databases, backup synchronization hosts, or remote diagnostic trace platforms.
* **Page-Level Encryption:** Local files are secured under SQLCipher AES-256-XTS page-level hardware-backed enclaves.

---

## 2. Stateless Metadata-Resistant Relay
* **Stateless Servers:** Our backend Node.js relay server maintains zero logging databases and completely lacks message store capabilities. Message envelopes are relayed in-memory and deleted instantly upon socket delivery.
* **Anonymous Routing Tokens:** PIM completely eliminates persistent client `userId` fields from active transit packets. Conversations route anonymously through pre-shared, single-use, dynamically rotating token batches. The server discards routing token associations the absolute millisecond a packet is forwarded.
* **Dummy Packet Background Noise:** Clients emit periodic, encrypted dummy packets to disrupt timing analysis, preventing carriers or networks from correlating typing activity or connection patterns.

---

## 3. Local-Only Offline AI Isolation
* **Zero Remote Inference:** All conversational AI features (such as draft generation, tone auditing, and task extraction) run locally on your device's Neural Engine/GPU using local GGUF models. 
* **Zero Network Requests:** PIM's AI assistant functions fully offline. No text prompts, conversational data, or contextual metadata are ever transmitted to third-party language APIs, guaranteeing complete prompt isolation.
* **Exploit & Timing Shielding:** Local prompts are subjected to strict tag sanitization (blocking prompt injection vectors) and random timing token padding, defeating processor-level timing correlation side-channel attacks.

---

## 4. Third-Party Services & Analytics
PIM contains **zero analytics libraries, crash tracking SDKs, commercial ad trackers, or third-party telemetry hooks**. You are completely autonomous and invisible.
