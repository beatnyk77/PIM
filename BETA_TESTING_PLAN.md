# PIM Beta Testing Plan

## Recruitment & Distribution
For the initial public beta, we are bypassing traditional app stores (TestFlight/Google Play) to maintain total independence from telemetry hooks and store review delays.
* **Distribution:** Direct APK (Android) and IPA (iOS) releases hosted exclusively on our GitHub Releases page.
* **Target Audience:** Privacy advocates, security researchers, and journalists needing high-assurance communications.

## Beta Focus Areas (v0.9.0-beta.1)
* **Multi-Device Sync & Revocation:** Test linking multiple devices. Verify that offline/online revocation via signed epoch broadcasts properly propagates to contacts and cuts off compromised devices.
* **Safety Check Wizard:** Validate that the first-launch wizard successfully authenticates the secure database mount and local key enclave.
* **Lite Mode:** Verify stability improvements and battery savings on older devices when Lite Mode is toggled.

## Post-Launch Monitoring & Feedback
To maintain absolute privacy, we strictly avoid crashlytics, sentry, or embedded telemetry. 
* **Security & Vulnerability Reports:** Email `security@pim.private` encrypted via our public PGP key.
* **Bug Reports & Feature Requests:** Submit anonymous GitHub Issues. Please redact any personal metadata from device logs before uploading.
* **Community Monitoring:** Keep an eye on community Matrix channels or dedicated privacy forums for organic feedback. Monitor GitHub discussions for unhandled edge-cases in the multi-device sync flow.

## Known Limitations (Beta V1)
1. **Background Socket Drops (iOS):** Due to aggressive iOS background task termination, long-lived WebSockets may drop when the app is backgrounded.
2. **Local AI Memory Usage:** The `llama.rn` GGUF models require 2GB+ of free RAM. Older devices may experience thermal throttling or OOM crashes. (Use **Lite Mode** if this occurs).
3. **Relay Uptime:** The default relay node is stateless and best-effort. Self-hosting the relay server is highly recommended for production-critical deployments.

