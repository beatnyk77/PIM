# PIM Beta Testing Plan

## Recruitment & Distribution
For the initial public beta, we are bypassing traditional app stores (TestFlight/Google Play) to maintain total independence from telemetry hooks and store review delays.
* **Distribution:** Direct APK (Android) and IPA (iOS) releases hosted exclusively on our GitHub Releases page.
* **Target Audience:** Privacy advocates, security researchers, and journalists needing high-assurance communications.

## Feedback Channels
To maintain absolute privacy, we avoid crashlytics or embedded telemetry.
* **Security & Vulnerability Reports:** Email `security@pim.private` encrypted via our public PGP key.
* **Bug Reports & Feature Requests:** Submit anonymous GitHub Issues. Please redact any personal metadata from device logs before uploading.

## Known Limitations (Beta V1)
1. **Background Socket Drops (iOS):** Due to aggressive iOS background task termination, long-lived WebSockets may drop when the app is backgrounded.
2. **Local AI Memory Usage:** The `llama.rn` GGUF models require 2GB+ of free RAM. Older devices may experience thermal throttling or OOM crashes. (Use **Lite Mode** if this occurs).
3. **Relay Uptime:** The default relay node is stateless and best-effort. Self-hosting the relay server is highly recommended for production-critical deployments.
