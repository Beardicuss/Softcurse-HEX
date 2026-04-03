# Contributing to Softcurse H.E.X.

First off, thank you for considering contributing to H.E.X.! It's people like you that make the open-source community such a great place to learn, inspire, and create.

## 🚀 Development Setup

1. **Prerequisites**: Ensure you have Node.js (v18 or higher) and native C++ build tools installed on your operating system.
2. **Clone the Repo**: 
   ```bash
   git clone https://github.com/Softcurse-Lab/softcurse-hex.git
   cd softcurse-hex
   ```
3. **Install Dependencies**:
   ```bash
   npm install
   ```
4. **Run Locally**:
   ```bash
   npm start
   ```

## 🛠️ How to Contribute

### 1. Find an Issue
Look for open issues tagged with `good first issue` or `help wanted`. If you want to work on something specific, open an issue first to discuss it with the maintainers.

### 2. Create a Branch
Branch off the `main` branch. Use a descriptive name for your branch:
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 3. Make Changes
Write your code, add comments where necessary, and ensure that your logic aligns with our modular architecture (`src/js/` for renderer logic, `main.js` and `ipc-butler.js` for main process routing).

### 4. Commit Meaningful Messages
Follow conventional commit standards:
- `feat: add new OS automation hook for MacOS`
- `fix: resolve crash when API rate limited`
- `docs: update setup instructions`

### 5. Submit a Pull Request
Push your branch to your fork and submit a Pull Request to the `main` branch of this repository. Please use the provided Pull Request template to describe your changes.

## 🛡️ Best Practices
- **Security:** Do not commit hardcoded API keys or personal data.
- **Native Modules:** If modifying Native Module invocations, ensure cross-platform compatibility where possible, or clearly document OS-specific boundaries.
