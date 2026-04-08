<div align="center">
  <br />
  <h1 align="center">Softcurse H.E.X.</h1>
  <p align="center">
    <strong>A tactical, high-precision cyberpunk-inspired desktop AI assistant and command center.</strong>
  </p>
  <p align="center">
    <img alt="Version" src="https://img.shields.io/badge/version-1.1.0-cyan?style=for-the-badge&logo=electron">
    <a href="https://github.com/Beardicuss/Softcurse-HEX/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-cyan.svg?style=for-the-badge"></a>
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-cyan?style=for-the-badge&logo=windows">
    <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18.0.0-cyan?style=for-the-badge&logo=node.js">
  </p>
  <br />
</div>

## 📑 Table of Contents
- [Overview](#-overview)
- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Architecture](#-architecture)
- [Contributing](#-contributing)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🔎 Overview

**Softcurse H.E.X.** is not your standard desktop assistant. It is a strictly tactical, cyberpunk-inspired command center designed for power users who demand precision, immersion, and localized intelligence. Discarding soft UI conventions, H.E.X. employs strict geometric structures, deep void-black aesthetics, and reactive elements to create an interface that feels like military-grade software from the future. 

Whether you need a copilot for your workflow or a specialized utility hub, H.E.X. integrates into your desktop with zero compromises.

---

## ✨ Features

- **Cyberpunk UI Architecture:** "SOFTCURSE/SYS v3.0 OMEGA" design language powered by pure vanilla CSS glassmorphism, eliminating all generic rounded corners for rigid tactical brackets.
- **Local Intelligence:** Seamlessly hooks into local AI infrastructure (like Ollama or custom endpoints) for zero-latency, private responses.
- **Multimodal Inputs:** Built-in support for voice recognition (`#mic-btn`) and vision capabilities (`#vision-btn`).
- **Reactive Atmosphere:** Custom Pulsar cursor targeting system, CRT scanline overlays, dynamic film grain, and 25+ systemic keyframe animations (glitches, radar pulses).
- **Vitals Telemetry:** Real-time system monitoring strip updating critical host metrics via terminal outputs.
- **Pure Desktop Immersion:** Electron-powered framed app optimized specifically for Windows environments.

---

## 📦 Installation

To deploy H.E.X. on your local machine, ensure you have Node.js (v18+) and npm installed.

```bash
# Clone the repository
git clone https://github.com/Beardicuss/Softcurse-HEX.git

# Navigate to the directory
cd Softcurse-HEX

# Install dependencies
npm install
```

---

## 🚀 Quick Start

Launch the tactical interface:

```bash
npm start
```

Upon launch, the void-black console will initialize. The AI (represented by the interactive core orb) will await your input. Use the bottom terminal input field to send commands, or click the mic button to engage voice protocols.

---

## 🔧 Configuration

While H.E.X. runs out of the box, power users can configure their AI endpoints and UI behaviors.

1. Click the **SETTINGS** text in the top-right console to open the modal overlay.
2. Edit system prompt instructions, adjust text generation boundaries (temperature), or configure speech options.
3. Your settings are saved locally and persist between deployments.

Alternatively, environment and API keys (if using external providers instead of local LLMs) can be configured within the source prior to packaging. 

---

## 🏗️ Architecture

H.E.X. is built on a streamlined modern stack:
- **Framework:** Electron (providing the desktop shell and system deep-links)
- **Frontend:** Vanilla HTML/CSS/JS (no heavy framework overhead to ensure instant startup and animation fluidty)
- **Design System:** Custom CSS tokens (`:root`) driven by a strict 4-color military palette (Cyan, Orange, Magenta, Blue on Void Black).
- **Typography Matrix:** Orbitron (Hero), Rajdhani (Tactical), JetBrains Mono (Data), Chakra Petch (Body).

---

## 🤝 Contributing

We welcome structural engineers and code tacticians. Read our [Contributing Guide](.github/CONTRIBUTING.md) to understand our workflow, branch conventions, and design philosophy before submitting a pull request.

Please review the [Code of Conduct](.github/CODE_OF_CONDUCT.md) before participating in the community.

---

## 🛣️ Roadmap

- [ ] Complete local LLM dynamic port discovery.
- [ ] Implement multi-monitor HUD widget modes.
- [ ] Real-time hardware telemetry integration (GPU/CPU usage bars).
- [ ] Expanded audio feedback for UI clicks and alerts.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for complete details. 

You are permitted to freely use, modify, and distribute this software, provided you retain the copyright notice.

---

## 💬 Support

If you encounter unexpected anomalies or system crashes, please submit a report via the [GitHub Issues](https://github.com/Beardicuss/Softcurse-HEX/issues) tracker.

*Shape your computer beautifully, and rule the grid.*
