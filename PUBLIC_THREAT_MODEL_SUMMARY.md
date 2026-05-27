# PIM: How We Keep You Safe (Public Threat Model)

At **Private Intelligence Messenger (PIM)**, we built a system that fundamentally cannot betray you. Here is a simple explanation of what we protect against.

## 1. "Harvest Now, Decrypt Later"
**The Threat:** Supercomputers and future quantum computers could record encrypted internet traffic today and crack it years later.
**Our Defense:** We use bleeding-edge "Post-Quantum" math (FIPS 203 ML-KEM-768) alongside traditional encryption. Even if a nation-state records your packets, they won't be able to read them—not now, and not in 50 years.

## 2. Who is talking to whom? (Metadata)
**The Threat:** Even if a server can't read your messages, knowing *who* you talk to and *when* can be just as dangerous.
**Our Defense:** Our relay server is stateless and amnesiac. Messages are wrapped in anonymous, single-use digital envelopes. The server doesn't know who is sending the message, and it forgets the delivery route the exact millisecond the packet is handed off. We also send invisible "dummy" messages in the background so spies can't guess when you're actually typing.

## 3. Physical Device Seizure (Coercion)
**The Threat:** Someone physically takes your unlocked phone and forces you to open the app.
**Our Defense:**
* **Decoy Vaults:** If coerced, type your "Decoy Password". The app will open a completely fake, benign database. Your real chats remain cryptographically hidden.
* **Panic Flip:** If you are about to be searched, simply flip your phone face-down on a table. The accelerometer detects this and instantly permanently deletes all your encryption keys, turning the app into useless static.

## 4. Spying AI
**The Threat:** Cloud-based AI assistants (like ChatGPT) send your private chats to corporate servers to generate replies or summaries.
**Our Defense:** PIM's AI runs 100% locally on your phone's processor. It works in airplane mode. Your data never leaves your device.

## 5. Companion Device Theft
**The Threat:** You lose a linked iPad or laptop, or someone steals it, potentially allowing them to read future incoming messages.
**Our Defense:**
* **Cryptographic Blocklisting (Revocation):** From your primary phone, you can instantly revoke any companion device. PIM signs a "revocation notice" using your private identity key and automatically broadcasts it to all your contacts.
* **Immediate Lock-Out:** Your contacts' apps verify the digital signature and instantly block the stolen device. It is cryptographically barred from receiving or decrypting any future messages.
* **Offline Catch-Up:** Even if your contacts are offline when you revoke the device, PIM's background synchronization will update them the absolute second they reconnect.
* **Temporary Suspension:** Not sure if you just misplaced your companion device? "Suspend" it locally with a single tap to freeze its sync capabilities until you find it.

## 6. Secure Group Risks (Link Hijacking & Rogue Moderation)
**The Threat:** An attacker hijacks an invite link to gain entry, a rogue user tries to censor chats by spoofing message deletions, or cloud AI summarizing tools leak group discussions.
**Our Defense:**
* **Link-Hijacking & Replays:** PIM invite links are scannable, **burn-on-use** transient tokens. The inviter's local secure database registers the unique token and instantly voids ("burns") it upon the first consumption. Any subsequent reuse of the link is blocked automatically.
* **Rogue Deletion Injection:** Message deletion commands are dual-encrypted to the group's active roster. Receiving clients verify the sender's identity and cross-reference their cryptographic keys with their role in the roster. If the sender is not verified as an `admin`, the deletion command is flagged and immediately dropped.
* **Local Group Summarization:** Search histories and conversational summarizations are computed 100% on-device by the quantized LLM. Search patterns never traverse a server or network, eliminating any cloud leak threat.

