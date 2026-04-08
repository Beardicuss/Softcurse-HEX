# Security Policy

We take the security and integrity of Softcurse H.E.X. incredibly seriously. If you have discovered a vulnerability, please follow the guidelines below to report it.

## Supported Versions

Only the most recent major and minor versions are actively supported with security patches. 

| Version | Supported |
| --- | --- |
| > 1.1.x | ✅ Yes |
| 1.0.x | ❌ No |
| < 1.0.x (Alphas) | ❌ No |

## Reporting a Vulnerability

**DO NOT** open a public GitHub issue or discussion for a security vulnerability. This risks public exploitation before a patch can be developed.

Instead, please report security vulnerabilities via **GitHub Private Vulnerability Reporting**. 
1. Navigate to the **Security** tab of the Softcurse-HEX repository.
2. Click **Report a vulnerability**.
3. Provide as much detail as possible.

### What to include in your report:
- A clear description of the vulnerability and its impact.
- Step-by-step instructions to reproduce the issue.
- Your assessment of the potential severity.
- Any proof-of-concept (PoC) code or screenshots (do not host malicious code publicly).

## Response Timeline

We strive to handle all reports with extreme urgency:
- **Acknowledgement**: You will receive a response acknowledging the receipt of your report within **48 hours**.
- **Initial Assessment**: We will assess the bug and verify its validity within **7 days**.
- **Patch/Mitigation**: A secure patch or mitigation strategy will be developed within **90 days** of confirmation, depending on the complexity of the fix.
- **Public Disclosure**: A CVE or GitHub Security Advisory will be published only *after* the patch has been tested and released into the `main` branch.

## Security Advisories

All confirmed and patched vulnerabilities will be documented via **GitHub Security Advisories** on the repository to inform existing users to upgrade.

## Out of Scope

The following items are NOT considered security vulnerabilities for this project:
- Attacks requiring physical access to the user's unlocked device.
- Social engineering (phishing, vishing, smishing) attacks against users.
- Denial of Service (DoS) attacks on local systems running the application (H.E.X. is a local client, not a public web server).
- Vulnerabilities within unsupported components or third-party web endpoints the user willingly provides API keys to.
- Issues specific to deprecated/unsupported OS versions.

## Bug Bounty

Currently, Softcurse H.E.X. operates as a free, open-source project managed by the community and **does not** offer financial bug bounties. However, researchers who report valid vulnerabilities are welcome to request public attribution in the release notes and advisory.

## Security Best Practices for Contributors

To keep the application secure, all contributors must adhere to the following rules:
- **Never commit secrets**: Automatically scan your branch for API keys, passwords, or tokens. Never commit a `.env` file containing live credentials.
- **Dependency Pinning**: Ensure NPM packages are properly locked via `package-lock.json`.
- **Review inputs**: Given H.E.X. is an Electron app dealing with local LLMs, always sanitize CLI inputs and IPC bridge communications to prevent remote code execution or privilege escalation.
