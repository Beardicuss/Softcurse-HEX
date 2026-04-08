# Contributing to Softcurse H.E.X.

First off, welcome and thank you for taking the time to contribute to Softcurse H.E.X.! 

The goal of this project is to create the ultimate tactical desktop assistant. Whether you're optimizing electron IPC bridges, expanding our 25+ custom CSS animations, or fixing a typo, your help is incredibly valuable.

Please take a moment to review our [Code of Conduct](CODE_OF_CONDUCT.md) before participating in the community. By participating, you agree to uphold its standards.

---

## 🛠️ Ways to Contribute

You don't need to be a senior architect to help out! We welcome contributions in many forms:
- Reporting bugs or undocumented quirks.
- Suggesting new tactical features.
- Improving documentation and code comments.
- Submitting code for bug fixes or features.
- Reviewing pull requests and testing.

---

## 🐛 Reporting Bugs

A great bug report helps us squash issues faster. Before reporting, please search the [issue tracker](https://github.com/Beardicuss/Softcurse-HEX/issues) to ensure it hasn't already been addressed.

When creating an issue, use the **Bug Report** template and include:
- A clear, concise title.
- Exact steps to reproduce the issue.
- What you expected to happen vs what actually happened.
- Your OS version, Node version, and H.E.X. build.
- Logs or screenshots (especially for UI glitches).

---

## 💡 Suggesting Features

We want H.E.X. to evolve. If you have an idea:
1. Open an issue using the **Feature Request** template.
2. Clearly explain the *problem* the feature solves.
3. Detail your proposed solution and how it fits the application's cyberpunk aesthetic and architecture.

*Note: For massive architectural changes, please open an issue to discuss it before dedicating hours to writing code.*

---

## ⚙️ Development Setup

Ready to write some code? Here's how to spin up your local grid:

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/Softcurse-HEX.git
   cd Softcurse-HEX
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

*(If you are modifying the electron-builder setup or packaging the app, run `npm run build` after your changes to verify it compiles correctly.)*

---

## ⌨️ Making Changes

### Branch Naming Convention
Create a branch specifically for your work. Please use the following convention:
- `feat/feature-name` (for new features)
- `fix/bug-description` (for bug fixes)
- `docs/what-changed` (for documentation)
- `style/what-changed` (for UI/CSS upgrades)

```bash
git checkout -b feat/add-cpu-telemetry
```

### Commit Message Convention
We adhere to **Conventional Commits** for clean history and changelog generation:
- `feat:` A new feature.
- `fix:` A bug fix.
- `docs:` Documentation only changes.
- `style:` Changes to CSS, formatting, missing semi-colons (no code logic changes).
- `refactor:` Code changes that neither fix a bug nor add a feature.
- `test:` Adding missing tests or correcting existing ones.
- `chore:` Updating build tasks, package manager configs, etc.

*Example:* `feat: integrate GPU telemetry into vitals strip`

### Linting and Formatting
Keep the codebase clean. Ensure your vanilla JS matches existing conventions, and any CSS modifications adhere to the established `:root` variables (e.g., using `var(--cyan)` instead of hard-coding hex values).

Always fetch the latest from the `main` upstream before committing to avoid merge conflicts!

---

## 🚀 Submitting a Pull Request

When you're ready to share your work:

1. Ensure your branch is up to date with the latest `main`.
2. Push your branch to your fork.
3. Open a Pull Request in the main repository.
4. Fill out the **Pull Request Template** completely.
5. Link any relevant issues (`Fixes #123`).

### What to expect during review:
- Maintainers will review your PR as swiftly as possible.
- You may receive feedback or requests for adjustments.
- Be receptive! We want the code to be as robust and clean as possible.
- Once approved, a maintainer will merge your PR.

---

## 📦 Release Process

Maintainers cut releases periodically. When releasing a new version, package versions are bumped, changelogs are generated based on commit history, and binaries are compiled for distribution via GitHub Releases.

---

## ❓ Getting Help

If you get stuck, don't suffer in silence. Ask questions inside the issue you are working on.

*Thank you for helping us shape the grid!*
