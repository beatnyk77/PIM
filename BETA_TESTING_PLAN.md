# PIM Beta Testing Plan

## Recruitment & Distribution
For the initial public beta, we are bypassing traditional app stores (TestFlight/Google Play) to maintain total independence from telemetry hooks and store review delays.
* **Distribution:** Direct APK (Android) and IPA (iOS) releases hosted exclusively on our GitHub Releases page.
* **Target Audience:** Privacy advocates, security researchers, and journalists needing high-assurance communications.

## Beta Focus Areas (v0.9.0-beta.2)
* **Group Messaging Finalization & Security:**
  * **Role Constraints:** Ensure that only members marked as `Admin` can revoke users or execute E2EE group message deletions.
  * **Key Rotation & Ephemeral Links:** Test that when an admin revokes a member, key rotation immediately engages and generates distinct UI system notifications. Additionally, test the toggle for One-Time Ephemeral links in group creation.
  * **Scannable QR & Burn-on-Use:** Generate an invite link with "Burn-on-use" enabled in Group Details. Render the custom visual QR and copy it. Test pasting the link in the "Join Group" overlay, verifying the successful E2EE transition. Paste the same link again to verify the cryptographic "already burned" block.
  * **Invite Expiry & Password Protection:** Generate a time-limited invite link (expires in 10 minutes) and/or toggle Password Protection. Try to join using an expired link to verify the strict block and alert. Try to join a password-protected group using an incorrect PIN/password to verify the E2EE client-side decryption block. Finally, join using the correct PIN to verify the successful join.
  * **Local Encrypted Security Audit Log:** Revoke a member or delete a message as an admin. Navigate to Group Details and verify that the Local Security Audit Log timeline appends and displays the decrypted security action in real-time.
  * **MLS-Aligned E2EE Media Attachments:** Attach an image and send it inside an active group chat. Verify that the image is encrypted symmetrically on-device, relayed via a formatted E2EE envelope inside MLS-aligned sessions, and decrypted and rendered successfully on receiving clients.
  * **Verified E2EE Admin Deletions:** Acting as group admin, long-press a message and select "Delete for Everyone". Verify that the message instantly disappears locally and that receiving clients in the room verify the admin signature and delete it in their views.
  * **Local AI-Powered Search Summaries:** Search for a term in the group search header. Tap "✨ AI Summary" and verify that a beautiful, single-sentence summary of the results is generated completely locally within seconds without network activity.
* **Multi-Device Sync & Revocation:** Test linking multiple devices. Verify that offline/online revocation via signed epoch broadcasts properly propagates to contacts and cuts off compromised devices.
* **Safety Check Wizard:** Validate that the first-launch wizard successfully authenticates the secure database mount and local key enclave.
* **Lite Mode:** Verify stability improvements and battery savings on older devices when Lite Mode is toggled.

## Post-Launch Monitoring & Feedback
To maintain absolute privacy, we strictly avoid crashlytics, sentry, or embedded telemetry. 
* **Security & Vulnerability Reports:** Email `security@pim.private` encrypted via our public PGP key.
* **Bug Reports & Feature Requests:** Submit anonymous GitHub Issues. Please redact any personal metadata from device logs before uploading.
* **Community Monitoring:** Keep an eye on community Matrix channels or dedicated privacy forums for organic feedback. Monitor GitHub discussions for unhandled edge-cases in the multi-device sync flow.

## ⚠️ Known Limitations & Known Issues (Private Beta v0.9.0-beta.2)

For beta testing purposes, researchers and testers should evaluate behaviors with the following design boundaries and early software issues in mind:

### 🛡️ Architectural Limitations (Decentralized & Zero-Knowledge by Design)
1. **Stateless Relay Message Queueing:**
   * **Limitation:** The default production relay server operates as a completely stateless, amnesiac router and retains no persistent database buffers.
   * **Consequence:** If a peer is completely disconnected when a message is dispatched, the packet is instantly dropped.
   * **Test Case:** Test message exchange with a recipient online, and then with a recipient manually disconnected. Observe that offline envelopes are dropped unless utilizing a private self-hosted relay with active caching enabled.
2. **Decoy Partition Cryptographic Isolation:**
   * **Limitation:** The Plausible Deniability Decoy Vault runs an independent database container (`pim-decoy-db.sqlite`) derived from a separate PBKDF2 passphrase chain.
   * **Consequence:** Real database profiles, contacts, and keys do not sync to the decoy partition. This isolation is mathematically required to guarantee absolute deniability under coercion.

### 🐛 Known Issues (Active Beta Resolution Path)
1. **Aggressive Background Socket Drops (iOS):**
   * **Issue:** WebSocket connections are frequently terminated by the iOS daemon if the client remains backgrounded for more than 30–60 seconds.
   * **Workaround/Status:** Opening the app triggers an instant secure reconnection and forward-secret key-exchange handshake. Silent APNs background wake sweeps are scheduled for the next release (`v0.9.0-beta.3`).
2. **Local AI Memory & Thermal Demands:**
   * **Issue:** The quantized local `phi-3-mini` GGUF model via `llama.rn` requires a minimum of 2.2GB of continuous resident RAM. Legacy mobile hardware may experience minor thermal spikes or out-of-memory app crashes during intensive token generation.
   * **Workaround/Status:** Toggle **Lite Mode** in settings on legacy devices to bypass local LLM initialization, substituting AI search features with timing-shielded noise padding sweeps.


