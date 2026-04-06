# Security Policy

## Supported Versions

Currently, only the latest release of Softcurse H.E.X. receives active security patches.

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1   | :x:                |

## Reporting a Vulnerability

Because H.E.X. integrates highly-privileged local Operating System controls (UAC bypasses, Registry modifications, and PowerShell invocations), we take security vulnerabilities extremely seriously.

**As of v1.1.0, H.E.X. processes highly sensitive local vectors:**
- **Biometric Security Data:** Perceptual RGB face hashes are stored securely and locally in `userData/config.json`. This data is completely air-gapped and NEVER transmitted to the cloud.
- **Plugin Sandbox Escapes:** Our `PluginLoader` runs `vm.createContext` specifically relaxing `fs`, `https`, and `child_process`. Plugins are meant to be robust.

If you discover a security vulnerability within H.E.X. (such as a flaw in the Biometric visual pipeline, malicious prompt injection, or a sandbox escape exploit that affects the host OS without user knowledge), please do NOT report it by opening a public GitHub issue.

**Instead, report it via:**
1. Direct communication to Softcurse Studios.
2. If applicable, using the "Draft Security Advisory" feature privately on GitHub.

We will review reports within 48 hours and work with you to patch any Critical or High-severity vectors before public disclosure.
