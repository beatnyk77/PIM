# PIM Security & Cryptographic Specifications

This document outlines the security parameters, cryptographic primitives, threat boundaries, and vulnerability disclosure policies for the **Private Intelligence Messenger (PIM)**.

---

## 1. Cryptographic Primitives & Parameters

PIM implements a defense-in-depth, hybrid post-quantum end-to-end encryption pipeline to ensure absolute data confidentiality and integrity.

### Direct Messaging (1:1 Chat)
* **Classical Layer:** Signal Protocol (Double Ratchet, X3DH) utilizing **Curve25519** for key agreements and signatures.
* **Post-Quantum Layer:** FIPS 203 **ML-KEM-768** (Lattice-Based Key Encapsulation Mechanism) nested outer wrapper, derived via **HKDF-SHA256**.
* **Symmetric Encryption:** AES-GCM (256-bit) as the inner layer and AES-CBC with HMAC-SHA256 (256-bit) as the outer KEM wrapper.

### Group Messaging
* **Cryptographic Architecture:** **Sender Keys (O(1) Broadcast)**.
* **Symmetric Ciphers:** AES-256-CBC with HMAC-SHA256, ratcheted forward after every broadcast.

### Local Database Encryption
* **Database Driver:** `@op-engineering/op-sqlite` JSI native wrapper.
* **Encryption Standard:** **SQLCipher page-level AES-256-XTS database encryption** with enclaved passphrase derivation.
* **Key Derivation:** Hardware-backed Keychain/Keystore salt + user passphrase passed through **PBKDF2** (20,000 iterations of HMAC-SHA256).

---

## 2. Threat Boundaries & Scope

### In-Scope Threats
* **Harvest-Now-Decrypt-Later (HNDL):** Network SIGINT recorders logging historical E2EE packets with intent to decrypt retrospectively using quantum computers. (Mitigated via nested ML-KEM-768 outer ciphers).
* **Network Metadata Tracking:** Relayers correlating active chats via timing and sizing analysis. (Mitigated via pre-shared ephemeral token batches, dynamic padding buckets, and delayed traffic shaping).
* **Local Device Coercion / Duress:** Physical seizure of unlocked devices. (Mitigated via Decoy SQLite vault passphrases and Face-down gesture Panic zeroization).

### Out-of-Scope Threats
* **Active Native OS Compromise:** Zero-day kernel escalation attacks exploiting the phone's kernel to inject spyware (e.g. Pegasus). Operating system security is a prerequisite.
* **Analog Hole Exploitations:** A rogue contact physically photographing the screen with an external camera.

---

## 3. Vulnerability Disclosure Policy

If you discover a security vulnerability in PIM, please report it immediately via a secure, encrypted channel rather than filing a public issue.

### Responsible Disclosure Guidelines
1. Email your finding to `security@pim.private` (please encrypt your message using our public PGP key).
2. Allow up to 48 hours for our core security engineering team to triage the vulnerability.
3. Allow up to 30 days for patch deployment before publishing details of the vulnerability.

### PGP Key Fingerprint
```text
F5D8 E9A2 B39F 4721 820C  678D E8E8 9F1A 4BC9 2C7A
```
