# ◆ SOFTCURSE SYSTEMS — MASTER STYLE PROMPT
### *ULTRA OMEGA EDITION — v3.0 — THE LAST DESIGN SYSTEM YOU WILL EVER NEED*

---

> **Codename:** `SOFTCURSE/SYS`
> **Build:** `v3.0.0-OMEGA`
> **Status:** `◆ LIVE ◆ CLASSIFIED ◆ LETHAL`
> **Tone:** Retro-Futuristic · Cyberpunk · Tactical Intelligence · Ghost-in-the-Machine · Biomechanical Dread · Neural Interface · Deep Space Operations
> **Soul:** A bleeding-edge ops terminal born inside a neon-drenched underground server room carved into the bones of a dead satellite. Every pixel feels *live*, every surface feels like it's processing classified data in real time. Cold, precise, dangerous — but beautiful. The grid doesn't just exist — it *judges* you. This is not software. This is a weapon with a UI.

This is not a design system. This is **a manifesto rendered in photons.** Every element breathes, glitches, pulses, remembers. The system is always watching. Always running. Always *becoming*.

---

## ◆ COLOR PALETTE

### Core Spectrum

| Role | Name | Hex | Usage |
|---|---|---|---|
| **Primary Accent** | Void Cyan | `#00ffff` | Borders, highlights, primary glow, active states |
| **Primary Soft** | Ghost Aqua | `#00ffc8` | Hover states, soft glows, data readouts |
| **Secondary Accent** | Plasma Blue | `#0088ff` | Network indicators, secondary badges, links |
| **Tertiary Accent** | Deep Azure | `#0044cc` | Depth layers, shadow accents |
| **Warning / Active** | Solar Flare | `#ff6b35` | CTAs, live data, danger signals, pulse animation |
| **Warning Soft** | Ember | `#ff9500` | Degraded warnings, partial alerts |
| **Glitch / Alert** | Null Magenta | `#ff00ff` | Error states, glitch FX, critical alerts |
| **Glitch Soft** | Hot Pink** | `#ff44aa` | Secondary glitch, soft error |
| **System Gold** | Amber Core | `#ffd700` | Legendary / max-tier status, achievements, crowns |
| **Acid Highlight** | Venom Green | `#39ff14` | Injection events, hack confirmations, bio-readings |
| **Deep Background** | Void Black | `#020202` | Base canvas — absolute dark — the abyss |
| **Surface 01** | Abyss Glass | `rgba(5, 8, 16, 0.85)` | Cards, modals, panels |
| **Surface 02** | Deep Glass | `rgba(8, 14, 28, 0.75)` | Nested panels, sub-surfaces |
| **Surface 03** | Raised Glass | `rgba(12, 20, 40, 0.60)` | Hover surfaces, active cards |
| **Grid Overlay** | Ghost Cyan | `rgba(0, 255, 255, 0.03)` | Background grid (40px × 40px) |
| **Grid Strong** | Signal Cyan | `rgba(0, 255, 255, 0.06)` | Hero zone grid emphasis |
| **Text Primary** | Ice White | `#e8f4f8` | Body copy, readable content |
| **Text Secondary** | Arctic | `rgba(232, 244, 248, 0.72)` | Secondary copy, descriptions |
| **Text Muted** | Dim Aqua | `rgba(0, 255, 255, 0.45)` | Labels, metadata |
| **Text Ghost** | Whisper | `rgba(232, 244, 248, 0.28)` | Placeholders, disabled |
| **Text Data** | Cyan Live | `#00ffcc` | Live values, stats, terminal |
| **Radial Glow** | Deep Teal | `rgba(0, 255, 200, 0.04)` | Bloom behind focal content |
| **Scanline** | CRT Ghost | `rgba(255, 255, 255, 0.015)` | CRT scanline overlay |
| **Noise** | Static | `rgba(255, 255, 255, 0.022)` | Film grain overlay |
| **Chromatic R** | Red Shift | `rgba(255, 0, 80, 0.25)` | Chromatic aberration — red channel |
| **Chromatic B** | Blue Shift | `rgba(0, 200, 255, 0.25)` | Chromatic aberration — blue channel |

### Palette Rules — Non-Negotiable

- **NEVER** use `#fff`, `#999`, `#ccc` for anything — always intentional tonal variants
- Borders live in the **cyan family** only — `rgba(0,255,255,N)`
- Glows are **cyan**, **orange**, or **magenta** — nothing else glows
- Background is absolute void — **no gradients on the base canvas**
- Translucency values are sacred: `0.03` ghost · `0.06` faint · `0.12` subtle · `0.25` visible · `0.4` hover · `0.6` active · `0.85` surface
- **System Gold** is reserved for maximum significance only — overuse destroys its power
- **Venom Green** fires only on injection/confirmation events — never decorative

---

## ◆ TYPOGRAPHY

### Font Stack — UPGRADED

```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Chakra+Petch:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&display=swap');
```

| Role | Font | Style | Usage |
|---|---|---|---|
| **Hero / Display** | `Orbitron` | 700–900 · UPPERCASE · ultra-wide tracking | Page titles, hero text, system names, master headers |
| **Sub-Display / Tactical** | `Rajdhani` | 600–700 · UPPERCASE · condensed | Section headers, card titles, UI chrome, navigation |
| **Monospace / Data** | `JetBrains Mono` | 400–700 · regular + italic | Stats, code, terminal, IDs, coordinates, timestamps, all data |
| **Body / Narration** | `Chakra Petch` | 300–500 · sentence case | Descriptions, paragraphs, tooltips, flavor text |

### Why These Fonts Are Superior

- **Orbitron:** Geometric, angular, made for screens that live in the future. Exudes classified ops energy. Every letterform is a threat.
- **Rajdhani:** Indian-influenced condensed precision. Aggressive x-height. Perfect for tight tactical labels that mean business.
- **JetBrains Mono:** The most humanist monospace ever engineered. Ligatures built for reading velocity. Data deserves the best.
- **Chakra Petch:** Thai-geometric hybrid. Sci-fi texture in body text. Even a paragraph of description feels like a classified briefing.

### Typography Scale

```css
--font-display:  'Orbitron', 'Rajdhani', sans-serif;
--font-tactical: 'Rajdhani', sans-serif;
--font-mono:     'JetBrains Mono', monospace;
--font-body:     'Chakra Petch', sans-serif;

/* ── DISPLAY ── */
--text-hero:     clamp(72px, 12vw, 160px);
--text-h1:       clamp(48px, 7vw, 96px);
--text-h2:       clamp(32px, 5vw, 64px);
--text-h3:       clamp(22px, 3.5vw, 40px);
--text-h4:       clamp(16px, 2.5vw, 28px);

/* ── MONO / DATA ── */
--text-data-xxl: 72px;
--text-data-xl:  48px;
--text-data-lg:  32px;
--text-data-md:  20px;
--text-data-sm:  14px;
--text-label:    11px;
--text-micro:    9px;

/* ── BODY ── */
--text-body-lg:  17px;
--text-body:     15px;
--text-small:    13px;
--text-caption:  11px;

/* ── TRACKING ── */
--tracking-hero:    0.12em;
--tracking-display: 0.08em;
--tracking-label:   0.25em;
--tracking-tactical:0.06em;
--tracking-mono:    0.02em;
```

### Typography Rules

- **Orbitron display:** Always `UPPERCASE`, `letter-spacing: 0.12em`, cyan glow text-shadow, weight 800+
- **Rajdhani tactical:** UPPERCASE for labels, title-case for headers, weight 600+
- **All labels:** `Rajdhani` or `JetBrains Mono` · UPPERCASE · `letter-spacing: 0.25em` · `opacity: 0.45`
- **Live data values:** Oversized `JetBrains Mono` · color-coded (see Data Color Coding) · `font-variant-numeric: tabular-nums`
- **Body text:** `Chakra Petch` · `line-height: 1.75` · `color: rgba(232, 244, 248, 0.82)`
- **Italic `JetBrains Mono`** for inline code, short data snippets embedded in prose
- **NEVER** mix `Orbitron` into body copy — strict role separation — this is law

### Data Color Coding

```
Cyan    (#00ffcc)  →  Default / General / Clean data
Orange  (#ff6b35)  →  Active / Warning / CTA / Elevated
Magenta (#ff00ff)  →  Error / Glitch / Critical / Breach
Blue    (#0088ff)  →  Network / Remote / Connectivity
Gold    (#ffd700)  →  Elite / Max Tier / Achievement
Green   (#39ff14)  →  Confirmed / Injected / Bio / Live OK
```

---

## ◆ BACKGROUND & ATMOSPHERE

### Base Canvas

```css
body {
  background-color: #020202;
  background-image:
    /* Primary cyan grid */
    linear-gradient(rgba(0,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,255,255,0.03) 1px, transparent 1px),
    /* CRT scanline texture */
    repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px
    );
  background-size: 40px 40px, 40px 40px, 100% 4px;
}
```

### Noise / Film Grain Overlay

```css
/* Apply to ::after of body or a fixed overlay element */
.noise-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.022;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  mix-blend-mode: overlay;
}
```

### Atmospheric Layers (stack order — bottom to top)

1. `#020202` — base void — the silence before signal
2. Cyan grid `0.03` — structural skeleton of the world
3. CRT scanline `0.015` — the ghost of old machines
4. Radial glow blooms — warm zones behind content
5. Noise grain `0.022` — analog texture on digital surfaces
6. Panel surfaces — glassmorphism architecture
7. Content — the living data
8. Scan sweep overlay — the line that never stops moving
9. Glitch overlays — reality failing at the seams
10. Critical alerts — maximum urgency

### Ambient Glow Blooms

```css
/* Behind hero content, stat displays, key panels */
.glow-bloom {
  background: radial-gradient(ellipse 60% 40% at 50% 50%,
    rgba(0, 255, 200, 0.06), rgba(0, 136, 255, 0.03), transparent 70%
  );
  pointer-events: none;
  position: absolute;
  inset: -20%;
  z-index: 0;
}

/* Variant: Orange ops zone */
.glow-bloom--orange {
  background: radial-gradient(ellipse 50% 35% at 50% 50%,
    rgba(255, 107, 53, 0.08), rgba(255, 149, 0, 0.03), transparent 70%
  );
}

/* Variant: Magenta breach zone */
.glow-bloom--magenta {
  background: radial-gradient(ellipse 55% 40% at 50% 50%,
    rgba(255, 0, 255, 0.07), rgba(255, 68, 170, 0.03), transparent 70%
  );
}

/* Variant: Gold legendary zone */
.glow-bloom--gold {
  background: radial-gradient(ellipse 45% 30% at 50% 50%,
    rgba(255, 215, 0, 0.06), rgba(255, 149, 0, 0.03), transparent 70%
  );
}
```

---

## ◆ PANELS & SURFACES

### Base Panel (Glassmorphism — Maximum Precision)

```css
.panel {
  background: rgba(5, 8, 16, 0.85);
  border: 1px solid rgba(0, 255, 255, 0.12);
  backdrop-filter: blur(20px) saturate(180%) brightness(1.05);
  -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.05);
  border-radius: 0; /* Sharp edges — softness is for other systems */
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

/* Corner bracket marks — tactical signature */
.panel::before,
.panel::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-color: rgba(0, 255, 255, 0.6);
  border-style: solid;
  z-index: 1;
  pointer-events: none;
}
.panel::before { top: 0; left: 0; border-width: 1px 0 0 1px; }
.panel::after  { bottom: 0; right: 0; border-width: 0 1px 1px 0; }
```

### Panel Hover State

```css
.panel:hover {
  border-color: rgba(0, 255, 255, 0.4);
  box-shadow:
    0 0 12px rgba(0, 255, 255, 0.2),
    0 0 40px rgba(0, 255, 255, 0.06),
    inset 0 0 20px rgba(0, 255, 255, 0.03);
  transition: var(--transition);
}
```

### All Panel Variants

| Variant | Border | Glow | Use |
|---|---|---|---|
| **Default** | `rgba(0,255,255,0.12)` | None | Standard content |
| **Active** | `rgba(0,255,255,0.4)` | Cyan `0.2` | Selected / focused |
| **Alert** | `rgba(255,107,53,0.4)` | Orange `0.2` | Warning / live ops |
| **Critical** | `rgba(255,0,255,0.4)` | Magenta `0.2` | Error / breach |
| **Network** | `rgba(0,136,255,0.35)` | Blue `0.15` | Connectivity |
| **Gold** | `rgba(255,215,0,0.4)` | Gold `0.15` | Elite / legendary |
| **Bio** | `rgba(57,255,20,0.35)` | Green `0.15` | Live bio / confirmed |
| **Ghost** | `rgba(0,255,255,0.04)` | None | Background reference |
| **Inset** | `rgba(0,255,255,0.06)` | None | Nested sub-panel |

### Panel Inset Header

```css
.panel__header {
  padding: 12px 20px;
  border-bottom: 1px solid rgba(0, 255, 255, 0.1);
  background: rgba(0, 255, 255, 0.03);
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel__title {
  font-family: var(--font-tactical);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: rgba(0, 255, 255, 0.8);
}
```

---

## ◆ BUTTONS

```css
/* Base */
.btn {
  font-family: var(--font-tactical);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: #020202;
  background: #00ffff;
  border: none;
  border-radius: 0;
  padding: 12px 32px;
  cursor: pointer;
  position: relative;
  clip-path: polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%);
  transition: var(--transition);
  outline: none;
  user-select: none;
}

.btn:hover {
  background: #00ffc8;
  box-shadow: 0 0 20px rgba(0,255,200,0.5), 0 0 60px rgba(0,255,200,0.15);
  transform: translateY(-1px);
}

.btn:active { transform: translateY(0); }

/* CTA / Active */
.btn--active {
  background: #ff6b35;
  color: #020202;
  animation: pulse-orange 1.5s ease-in-out infinite;
}

/* Danger */
.btn--danger {
  background: #ff00ff;
  color: #020202;
  animation: pulse-magenta 1.5s ease-in-out infinite;
}

/* Gold / Elite */
.btn--gold {
  background: linear-gradient(135deg, #ffd700, #ff9500);
  color: #020202;
  box-shadow: 0 0 20px rgba(255,215,0,0.3);
}

/* Ghost */
.btn--ghost {
  background: transparent;
  color: #00ffff;
  border: 1px solid rgba(0,255,255,0.35);
  clip-path: none;
}
.btn--ghost:hover {
  background: rgba(0,255,255,0.08);
  border-color: rgba(0,255,255,0.7);
  box-shadow: 0 0 16px rgba(0,255,255,0.15);
}

/* Ghost Orange */
.btn--ghost-orange {
  background: transparent;
  color: #ff6b35;
  border: 1px solid rgba(255,107,53,0.4);
  clip-path: none;
}

/* Icon button */
.btn--icon {
  padding: 10px;
  clip-path: none;
  background: rgba(0,255,255,0.08);
  border: 1px solid rgba(0,255,255,0.2);
  color: #00ffff;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Small */
.btn--sm {
  font-size: 11px;
  padding: 8px 20px;
  clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
}

/* Large */
.btn--lg {
  font-size: 16px;
  padding: 16px 48px;
  letter-spacing: 0.3em;
  clip-path: polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%);
}
```

---

## ◆ INPUTS & FORM ELEMENTS

```css
/* Text Input */
.input {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--c-text);
  background: rgba(5, 8, 16, 0.9);
  border: 1px solid rgba(0, 255, 255, 0.15);
  border-radius: 0;
  padding: 10px 16px;
  width: 100%;
  outline: none;
  transition: var(--transition);
  caret-color: #00ffff;
}

.input::placeholder { color: rgba(0,255,255,0.25); font-style: italic; }

.input:focus {
  border-color: rgba(0,255,255,0.6);
  box-shadow: 0 0 0 1px rgba(0,255,255,0.2), 0 0 20px rgba(0,255,255,0.08);
  background: rgba(0, 255, 255, 0.03);
}

.input:focus + .input-label {
  color: rgba(0,255,255,0.8);
  transform: translateY(-20px) scale(0.85);
}

/* Input label (floating) */
.input-label {
  font-family: var(--font-tactical);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: rgba(0,255,255,0.45);
  transition: var(--transition);
  pointer-events: none;
}

/* Input — Error state */
.input--error {
  border-color: rgba(255,0,255,0.5);
  box-shadow: 0 0 0 1px rgba(255,0,255,0.2), 0 0 16px rgba(255,0,255,0.06);
}

/* Input — Success state */
.input--success {
  border-color: rgba(57,255,20,0.4);
  box-shadow: 0 0 0 1px rgba(57,255,20,0.15);
}

/* Textarea */
.textarea {
  resize: vertical;
  min-height: 120px;
  line-height: 1.7;
}

/* Select */
.select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2300ffff' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 40px;
  cursor: pointer;
}

/* Toggle / Switch */
.toggle {
  width: 48px;
  height: 24px;
  background: rgba(0,255,255,0.1);
  border: 1px solid rgba(0,255,255,0.2);
  border-radius: 0;
  position: relative;
  cursor: pointer;
  transition: var(--transition);
  clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
}

.toggle::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  background: rgba(0,255,255,0.5);
  top: 4px;
  left: 4px;
  transition: var(--transition);
}

.toggle--on {
  background: rgba(0,255,255,0.15);
  border-color: rgba(0,255,255,0.6);
  box-shadow: 0 0 12px rgba(0,255,255,0.2);
}

.toggle--on::after {
  background: #00ffff;
  transform: translateX(24px);
  box-shadow: 0 0 8px rgba(0,255,255,0.8);
}

/* Checkbox */
.checkbox {
  width: 16px;
  height: 16px;
  background: transparent;
  border: 1px solid rgba(0,255,255,0.3);
  border-radius: 0;
  appearance: none;
  cursor: pointer;
  transition: var(--transition);
  position: relative;
}

.checkbox:checked {
  background: rgba(0,255,255,0.15);
  border-color: rgba(0,255,255,0.7);
  box-shadow: 0 0 8px rgba(0,255,255,0.3);
}

.checkbox:checked::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00ffff;
  font-size: 10px;
  font-family: var(--font-mono);
}

/* Range slider */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 2px;
  background: rgba(0,255,255,0.15);
  outline: none;
  border-radius: 0;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #00ffff;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  cursor: pointer;
  box-shadow: 0 0 8px rgba(0,255,255,0.6);
}
```

---

## ◆ ANIMATIONS & EFFECTS — COMPLETE LIBRARY

### Keyframes

```css
/* ── GLOW PULSES ── */
@keyframes pulse-cyan {
  0%, 100% { box-shadow: 0 0 8px rgba(0,255,255,0.3); }
  50%       { box-shadow: 0 0 24px rgba(0,255,255,0.7), 0 0 60px rgba(0,255,255,0.2); }
}

@keyframes pulse-orange {
  0%, 100% { box-shadow: 0 0 8px rgba(255,107,53,0.4); }
  50%       { box-shadow: 0 0 28px rgba(255,107,53,0.85), 0 0 70px rgba(255,107,53,0.25); }
}

@keyframes pulse-magenta {
  0%, 100% { box-shadow: 0 0 8px rgba(255,0,255,0.4); }
  50%       { box-shadow: 0 0 28px rgba(255,0,255,0.85), 0 0 70px rgba(255,0,255,0.25); }
}

@keyframes pulse-gold {
  0%, 100% { box-shadow: 0 0 10px rgba(255,215,0,0.4); }
  50%       { box-shadow: 0 0 30px rgba(255,215,0,0.8), 0 0 80px rgba(255,215,0,0.2); }
}

@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 8px rgba(57,255,20,0.4); }
  50%       { box-shadow: 0 0 24px rgba(57,255,20,0.8), 0 0 60px rgba(57,255,20,0.2); }
}

/* ── TEXT GLOWS ── */
@keyframes text-glow-cyan {
  0%, 100% { text-shadow: 0 0 10px rgba(0,255,255,0.4); }
  50%       { text-shadow: 0 0 20px rgba(0,255,255,0.9), 0 0 60px rgba(0,255,255,0.3); }
}

@keyframes text-glow-orange {
  0%, 100% { text-shadow: 0 0 10px rgba(255,107,53,0.5); }
  50%       { text-shadow: 0 0 25px rgba(255,107,53,0.9), 0 0 70px rgba(255,107,53,0.3); }
}

/* ── GLITCH ── */
@keyframes glitch {
  0%, 90%, 100% {
    text-shadow: 2px 0 #ff00ff, -2px 0 #00ffff;
    transform: skew(0deg);
    clip-path: none;
  }
  91% { clip-path: inset(10% 0 60% 0); transform: skew(-2deg) translateX(2px); text-shadow: -3px 0 #ff00ff, 3px 0 #00ffff; }
  93% { clip-path: inset(40% 0 20% 0); transform: skew(1deg) translateX(-2px); }
  95% { clip-path: inset(60% 0 5% 0); transform: skew(-0.5deg); }
  97% { clip-path: none; transform: skew(0.5deg); }
}

/* Glitch block — for containers */
@keyframes glitch-block {
  0%, 88%, 100% { transform: translate(0); }
  89% { transform: translate(-2px, 1px); filter: hue-rotate(90deg); }
  91% { transform: translate(2px, -1px); filter: hue-rotate(-90deg); }
  93% { transform: translate(0, 2px); }
  95% { transform: translate(-1px, 0); filter: hue-rotate(0deg); }
}

/* Chromatic aberration glitch */
@keyframes chromatic {
  0%, 95%, 100% { filter: none; }
  96% { filter: drop-shadow(2px 0 0 rgba(255,0,80,0.8)) drop-shadow(-2px 0 0 rgba(0,200,255,0.8)); }
  98% { filter: drop-shadow(-2px 0 0 rgba(255,0,80,0.6)) drop-shadow(2px 0 0 rgba(0,200,255,0.6)); }
}

/* ── SCAN EFFECTS ── */
@keyframes scan {
  0%   { transform: translateY(-100%); opacity: 0; }
  5%   { opacity: 1; }
  95%  { opacity: 1; }
  100% { transform: translateY(100vh); opacity: 0; }
}

@keyframes scan-h {
  0%   { transform: translateX(-100%); opacity: 0; }
  5%   { opacity: 0.4; }
  95%  { opacity: 0.4; }
  100% { transform: translateX(100vw); opacity: 0; }
}

/* ── CURSOR / TERMINAL ── */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

@keyframes typewriter {
  from { width: 0; }
  to   { width: 100%; }
}

/* ── FLICKER ── */
@keyframes flicker {
  0%, 19.9%, 22%, 62.9%, 64%, 64.9%, 70%, 100% { opacity: 1; }
  20%, 21.9%, 63%, 63.9%, 65%, 69.9%            { opacity: 0.15; }
}

/* ── BORDER TRACE ── */
@keyframes border-trace {
  0%   { clip-path: inset(0 100% 100% 0); }
  25%  { clip-path: inset(0 0 100% 0); }
  50%  { clip-path: inset(0 0 0% 0); }
  100% { clip-path: inset(0 0 0 0); }
}

/* ── ENTRANCE ANIMATIONS ── */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in-right {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes reveal-clip {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0% 0 0); }
}

/* ── ROTATION ── */
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes spin-reverse {
  from { transform: rotate(360deg); }
  to   { transform: rotate(0deg); }
}

/* ── HOLOGRAPHIC SHIMMER ── */
@keyframes holographic {
  0%   { background-position: 0% 50%; filter: hue-rotate(0deg); }
  50%  { background-position: 100% 50%; filter: hue-rotate(30deg); }
  100% { background-position: 0% 50%; filter: hue-rotate(0deg); }
}

/* ── DATA COUNTER ── */
@keyframes count-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── WARP ── */
@keyframes warp {
  0%, 100% { transform: perspective(800px) rotateX(0deg); }
  50%       { transform: perspective(800px) rotateX(2deg); }
}
```

### Animation Usage Table

| Effect | Animation | Duration | Trigger |
|---|---|---|---|
| Active panel border | `pulse-cyan` | 2s infinite | `.panel--active` |
| CTA button | `pulse-orange` | 1.5s infinite | `.btn--active` |
| Error button | `pulse-magenta` | 1.5s infinite | `.btn--danger` |
| Gold badge | `pulse-gold` | 2s infinite | `.badge--gold` |
| Live bio dot | `pulse-green` | 2s infinite | `.dot--bio` |
| Error text | `glitch` | 4s infinite | `.text--error` |
| Error container | `glitch-block` | 4s infinite | `.panel--critical` |
| Chromatic FX | `chromatic` | 5s infinite | `.fx--chromatic` |
| Holographic element | `holographic` | 4s ease infinite | `.fx--holo` |
| Live dot | `flicker` | 3s infinite | `.dot--live` |
| Data sweep | `scan` | 6s linear infinite | Background overlay |
| H-scan line | `scan-h` | 8s linear infinite | Background overlay |
| Terminal cursor | `blink` | 0.8s step-end infinite | `::after` cursor |
| Typewriter text | `typewriter` | 1.5s steps(40) | `.text--type` |
| Panel entrance | `fade-up` | 0.4s ease | On mount |
| Staggered list | `fade-up` + `delay` | 0.4s + 0.05s/item | List items |
| Text reveal | `reveal-clip` | 0.6s ease | Headlines |
| Radar ring | `spin-slow` | 8s linear infinite | `.radar__ring` |
| Counter ring | `spin-reverse` | 12s linear infinite | `.gauge__track` |

---

## ◆ TEXT & LABEL SYSTEM

```css
/* Section labels */
.label {
  font-family: var(--font-tactical);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: rgba(0, 255, 255, 0.45);
}

/* Section title — Orbitron hero */
.section-title {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 800;
  letter-spacing: var(--tracking-display);
  text-transform: uppercase;
  color: #00ffff;
  text-shadow: 0 0 20px rgba(0,255,255,0.5), 0 0 60px rgba(0,255,255,0.15);
}

/* Tactical sub-header — Rajdhani */
.tactical-title {
  font-family: var(--font-tactical);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: var(--tracking-tactical);
  text-transform: uppercase;
  color: rgba(0,255,255,0.85);
}

/* Live data value */
.data-value {
  font-family: var(--font-mono);
  font-size: 48px;
  font-weight: 700;
  color: #00ffcc;
  text-shadow: 0 0 15px rgba(0,255,200,0.6);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'zero' 1;
  letter-spacing: var(--tracking-mono);
}

/* Glitch text */
.text--glitch {
  position: relative;
  animation: glitch 4s infinite;
}
.text--glitch::before,
.text--glitch::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
}
.text--glitch::before {
  color: #ff00ff;
  animation: glitch 4s infinite reverse;
  clip-path: inset(0 0 50% 0);
  transform: translateX(-2px);
}
.text--glitch::after {
  color: #00ffff;
  animation: glitch 4s 0.1s infinite;
  clip-path: inset(50% 0 0 0);
  transform: translateX(2px);
}

/* Typewriter text */
.text--type {
  font-family: var(--font-mono);
  overflow: hidden;
  white-space: nowrap;
  border-right: 2px solid #00ffff;
  width: 0;
  animation: typewriter 2s steps(40, end) forwards, blink 0.8s step-end infinite;
}

/* Terminal cursor */
.cursor::after {
  content: '█';
  animation: blink 0.8s step-end infinite;
  color: #00ffff;
  margin-left: 2px;
  font-size: 0.9em;
}

/* Holographic text */
.text--holo {
  background: linear-gradient(135deg, #00ffff, #ff00ff, #0088ff, #00ffc8, #ff6b35);
  background-size: 400% 400%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: holographic 4s ease infinite;
}

/* Gold text */
.text--gold {
  background: linear-gradient(135deg, #ffd700, #ff9500, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 8px rgba(255,215,0,0.4));
}
```

---

## ◆ DECORATIVE ELEMENTS

### Signature Mark

All section titles prefixed with `◆` at 45° — the signature rune of SOFTCURSE/SYS.

```css
.decorator {
  display: inline-block;
  color: rgba(0,255,255,0.6);
  transform: rotate(45deg) scale(0.75);
  margin-right: 8px;
  transition: var(--transition);
}

.section-title:hover .decorator {
  color: rgba(0,255,255,1);
  filter: drop-shadow(0 0 6px rgba(0,255,255,0.8));
}
```

### Dividers

```css
.divider {
  height: 1px;
  background: linear-gradient(90deg,
    transparent, rgba(0,255,255,0.3) 20%, rgba(0,255,255,0.5) 50%,
    rgba(0,255,255,0.3) 80%, transparent
  );
  margin: 24px 0;
  position: relative;
}

.divider::before {
  content: '◆';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) rotate(45deg);
  color: rgba(0,255,255,0.5);
  font-size: 8px;
  background: #020202;
  padding: 0 8px;
}

/* Thick hero divider */
.divider--hero {
  height: 2px;
  background: linear-gradient(90deg,
    transparent, rgba(0,255,255,0.6) 20%, #00ffff 50%,
    rgba(0,255,255,0.6) 80%, transparent
  );
  box-shadow: 0 0 12px rgba(0,255,255,0.4);
}

/* Orange alert divider */
.divider--alert {
  background: linear-gradient(90deg,
    transparent, rgba(255,107,53,0.4) 20%, rgba(255,107,53,0.6) 50%,
    rgba(255,107,53,0.4) 80%, transparent
  );
}
```

### Status Dots

```css
.dot-live {
  width: 8px; height: 8px;
  background: #00ffcc;
  border-radius: 50%;
  animation: pulse-cyan 2s ease-in-out infinite, flicker 5s infinite;
  box-shadow: 0 0 8px rgba(0,255,200,0.8);
}

.dot-alert  { background: #ff6b35; animation: pulse-orange  1.5s ease-in-out infinite; box-shadow: 0 0 8px rgba(255,107,53,0.8); }
.dot-error  { background: #ff00ff; animation: pulse-magenta 1.5s ease-in-out infinite; box-shadow: 0 0 8px rgba(255,0,255,0.8); }
.dot-gold   { background: #ffd700; animation: pulse-gold    2s ease-in-out infinite; box-shadow: 0 0 8px rgba(255,215,0,0.8); }
.dot-bio    { background: #39ff14; animation: pulse-green   2s ease-in-out infinite; box-shadow: 0 0 8px rgba(57,255,20,0.8); }
.dot-offline{ background: rgba(232,244,248,0.15); border-radius: 50%; }
```

### Tags & Badges

```css
/* Tag — angled */
.tag {
  font-family: var(--font-tactical);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  padding: 3px 12px;
  border: 1px solid rgba(0,255,255,0.3);
  color: rgba(0,255,255,0.7);
  background: rgba(0,255,255,0.05);
  clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tag--orange  { border-color: rgba(255,107,53,0.4); color: rgba(255,107,53,0.85); background: rgba(255,107,53,0.06); }
.tag--magenta { border-color: rgba(255,0,255,0.4);  color: rgba(255,0,255,0.85);  background: rgba(255,0,255,0.06); }
.tag--gold    { border-color: rgba(255,215,0,0.4);  color: rgba(255,215,0,0.85);  background: rgba(255,215,0,0.06); }
.tag--green   { border-color: rgba(57,255,20,0.4);  color: rgba(57,255,20,0.85);  background: rgba(57,255,20,0.06); }

/* Badge — rounded (the ONE exception to no-radius, reserved for status indicators) */
.badge {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 2px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.badge--live    { background: rgba(0,255,200,0.15);  color: #00ffcc;  border: 1px solid rgba(0,255,200,0.3); }
.badge--alert   { background: rgba(255,107,53,0.15); color: #ff6b35;  border: 1px solid rgba(255,107,53,0.3); animation: pulse-orange 2s infinite; }
.badge--error   { background: rgba(255,0,255,0.15);  color: #ff00ff;  border: 1px solid rgba(255,0,255,0.3); animation: flicker 1s infinite; }
.badge--gold    { background: rgba(255,215,0,0.12);  color: #ffd700;  border: 1px solid rgba(255,215,0,0.3); }
```

---

## ◆ PROGRESS & LOADING

```css
/* Progress Bar */
.progress {
  height: 3px;
  background: rgba(0,255,255,0.08);
  position: relative;
  overflow: hidden;
  border: none;
}

.progress__fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(0,255,255,0.6), #00ffff);
  box-shadow: 0 0 8px rgba(0,255,255,0.5);
  position: relative;
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.progress__fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: -1px;
  width: 3px;
  height: 5px;
  background: #fff;
  box-shadow: 0 0 6px rgba(0,255,255,1);
}

/* Thick progress bar (for XP, health, etc.) */
.progress--thick {
  height: 8px;
  clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
}

/* Progress variants */
.progress--orange .progress__fill { background: linear-gradient(90deg, rgba(255,107,53,0.6), #ff6b35); box-shadow: 0 0 8px rgba(255,107,53,0.5); }
.progress--magenta .progress__fill{ background: linear-gradient(90deg, rgba(255,0,255,0.6), #ff00ff);  box-shadow: 0 0 8px rgba(255,0,255,0.5); }
.progress--gold .progress__fill   { background: linear-gradient(90deg, rgba(255,215,0,0.6), #ffd700);  box-shadow: 0 0 8px rgba(255,215,0,0.5); }

/* Indeterminate / loading bar */
@keyframes progress-indeterminate {
  0%   { left: -35%; width: 35%; }
  60%  { left: 100%; width: 100%; }
  100% { left: 100%; width: 35%; }
}

.progress--loading .progress__fill {
  width: 35% !important;
  position: absolute;
  animation: progress-indeterminate 1.6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}

/* Skeleton Loader */
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(0,255,255,0.04) 25%,
    rgba(0,255,255,0.10) 50%,
    rgba(0,255,255,0.04) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

/* Spinner */
@keyframes spinner-rotate {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(0,255,255,0.15);
  border-top-color: #00ffff;
  border-radius: 50%;
  animation: spinner-rotate 0.8s linear infinite;
  box-shadow: 0 0 8px rgba(0,255,255,0.3);
}
```

---

## ◆ DATA TABLES

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 13px;
}

.table thead tr {
  border-bottom: 1px solid rgba(0,255,255,0.2);
}

.table th {
  font-family: var(--font-tactical);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: rgba(0,255,255,0.45);
  padding: 10px 16px;
  text-align: left;
}

.table td {
  padding: 12px 16px;
  color: var(--c-text);
  border-bottom: 1px solid rgba(0,255,255,0.06);
  transition: var(--transition);
}

.table tbody tr:hover td {
  background: rgba(0,255,255,0.03);
  color: #e8f4f8;
}

.table tbody tr:hover td:first-child {
  border-left: 2px solid rgba(0,255,255,0.5);
  padding-left: 14px;
}

/* Active row */
.table tr--active td {
  background: rgba(0,255,255,0.06);
  border-bottom-color: rgba(0,255,255,0.15);
}

/* Alert row */
.table tr--alert td {
  background: rgba(255,107,53,0.04);
  border-bottom-color: rgba(255,107,53,0.1);
}

/* Critical row */
.table tr--critical td {
  background: rgba(255,0,255,0.04);
  border-bottom-color: rgba(255,0,255,0.1);
  animation: flicker 4s infinite;
}
```

---

## ◆ TOOLTIPS

```css
.tooltip {
  position: relative;
  display: inline-block;
}

.tooltip__content {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(5, 8, 16, 0.95);
  border: 1px solid rgba(0,255,255,0.2);
  backdrop-filter: blur(20px);
  padding: 8px 12px;
  white-space: nowrap;
  font-family: var(--font-tactical);
  font-size: 12px;
  color: rgba(0,255,255,0.85);
  letter-spacing: 0.05em;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 100;
  box-shadow: 0 0 20px rgba(0,255,255,0.1);
}

.tooltip__content::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: rgba(0,255,255,0.2);
}

.tooltip:hover .tooltip__content { opacity: 1; }
```

---

## ◆ NOTIFICATIONS / TOAST SYSTEM

```css
.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(5, 8, 16, 0.95);
  border: 1px solid rgba(0,255,255,0.2);
  border-left: 3px solid #00ffff;
  backdrop-filter: blur(20px);
  min-width: 280px;
  max-width: 400px;
  box-shadow: 0 0 30px rgba(0,0,0,0.5), 0 0 20px rgba(0,255,255,0.08);
  animation: fade-in-right 0.3s ease;
}

.toast--warning {
  border-left-color: #ff6b35;
  box-shadow: 0 0 30px rgba(0,0,0,0.5), 0 0 20px rgba(255,107,53,0.08);
}

.toast--critical {
  border-left-color: #ff00ff;
  animation: fade-in-right 0.3s ease, glitch-block 4s infinite;
}

.toast--success {
  border-left-color: #39ff14;
  box-shadow: 0 0 30px rgba(0,0,0,0.5), 0 0 20px rgba(57,255,20,0.08);
}

.toast__title {
  font-family: var(--font-tactical);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #e8f4f8;
  margin-bottom: 3px;
}

.toast__body {
  font-family: var(--font-body);
  font-size: 13px;
  color: rgba(232,244,248,0.65);
  line-height: 1.5;
}
```

---

## ◆ MODAL / OVERLAY

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 2, 2, 0.8);
  backdrop-filter: blur(4px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fade-up 0.2s ease;
}

.modal {
  background: rgba(5, 8, 16, 0.97);
  border: 1px solid rgba(0,255,255,0.2);
  box-shadow:
    0 0 60px rgba(0,255,255,0.08),
    0 40px 80px rgba(0,0,0,0.6),
    inset 0 0 40px rgba(0,255,255,0.02);
  max-width: 640px;
  width: 90%;
  position: relative;
  animation: fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Corner marks inherited from .panel */
.modal__header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(0,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal__body {
  padding: 24px;
}

.modal__footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(0,255,255,0.08);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
```

---

## ◆ TERMINAL / CODE DISPLAY

```css
.terminal {
  background: rgba(2, 4, 8, 0.95);
  border: 1px solid rgba(0,255,255,0.12);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 20px;
  position: relative;
  overflow: hidden;
  line-height: 1.8;
}

/* Scan sweep inside terminal */
.terminal::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0,255,255,0.015) 50%,
    transparent 100%
  );
  background-size: 100% 8px;
  pointer-events: none;
  animation: scan 8s linear infinite;
}

.terminal__line { color: rgba(0,255,200,0.85); margin: 0; }
.terminal__prompt { color: rgba(0,255,255,0.4); }
.terminal__error { color: #ff00ff; }
.terminal__warning { color: #ff6b35; }
.terminal__success { color: #39ff14; }
.terminal__comment { color: rgba(0,255,255,0.25); font-style: italic; }

.code-block {
  background: rgba(3, 6, 12, 0.9);
  border: 1px solid rgba(0,255,255,0.1);
  border-left: 3px solid rgba(0,255,255,0.4);
  padding: 16px 20px;
  font-family: var(--font-mono);
  font-size: 13px;
  overflow-x: auto;
  line-height: 1.7;
  color: rgba(0,255,200,0.85);
  tab-size: 2;
}
```

---

## ◆ NAVIGATION / HEADER

```css
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 60px;
  background: rgba(2, 2, 2, 0.9);
  border-bottom: 1px solid rgba(0,255,255,0.08);
  backdrop-filter: blur(30px) saturate(200%);
  display: flex;
  align-items: center;
  padding: 0 32px;
  gap: 32px;
}

.nav__logo {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: var(--tracking-display);
  text-transform: uppercase;
  color: #00ffff;
  text-shadow: 0 0 20px rgba(0,255,255,0.4);
}

.nav__link {
  font-family: var(--font-tactical);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: rgba(0,255,255,0.45);
  text-decoration: none;
  transition: var(--transition);
  position: relative;
  padding-bottom: 2px;
}

.nav__link::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 1px;
  background: #00ffff;
  transition: var(--transition);
}

.nav__link:hover { color: rgba(0,255,255,0.9); }
.nav__link:hover::after { width: 100%; }

.nav__link--active {
  color: #00ffff;
}
.nav__link--active::after { width: 100%; }
```

---

## ◆ GLOBAL POLISH

### Custom Cursor

```css
* { cursor: none; }

.cursor-dot {
  width: 6px;
  height: 6px;
  background: #00ffff;
  border-radius: 50%;
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  transition: transform 0.05s ease, background 0.2s ease;
  box-shadow: 0 0 8px rgba(0,255,255,0.8);
  mix-blend-mode: screen;
}

.cursor-ring {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(0,255,255,0.4);
  border-radius: 50%;
  position: fixed;
  pointer-events: none;
  z-index: 9998;
  transform: translate(-50%, -50%);
  transition: all 0.15s ease, opacity 0.2s ease;
}

body:hover .cursor-ring { opacity: 1; }
a:hover ~ .cursor-ring, button:hover ~ .cursor-ring {
  width: 48px;
  height: 48px;
  border-color: rgba(0,255,255,0.7);
}
```

### Scrollbars

```css
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(0,255,255,0.15);
  border-radius: 0;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(0,255,255,0.4);
  box-shadow: 0 0 6px rgba(0,255,255,0.5);
}
```

### Selection Color

```css
::selection {
  background: rgba(0, 255, 255, 0.2);
  color: #00ffff;
}
```

### Focus Ring (Accessibility)

```css
:focus-visible {
  outline: 1px solid rgba(0,255,255,0.6);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(0,255,255,0.15);
}
```

---

## ◆ CSS CUSTOM PROPERTIES — COMPLETE TOKEN SHEET

```css
:root {
  /* ═══ COLORS ═══ */
  --c-bg:             #020202;
  --c-surface-01:     rgba(5, 8, 16, 0.85);
  --c-surface-02:     rgba(8, 14, 28, 0.75);
  --c-surface-03:     rgba(12, 20, 40, 0.60);
  --c-cyan:           #00ffff;
  --c-cyan-soft:      #00ffc8;
  --c-cyan-dim:       rgba(0, 255, 255, 0.45);
  --c-blue:           #0088ff;
  --c-blue-deep:      #0044cc;
  --c-orange:         #ff6b35;
  --c-orange-soft:    #ff9500;
  --c-magenta:        #ff00ff;
  --c-magenta-soft:   #ff44aa;
  --c-gold:           #ffd700;
  --c-green:          #39ff14;
  --c-text:           #e8f4f8;
  --c-text-secondary: rgba(232, 244, 248, 0.72);
  --c-text-muted:     rgba(232, 244, 248, 0.45);
  --c-text-ghost:     rgba(232, 244, 248, 0.28);
  --c-border:         rgba(0, 255, 255, 0.12);
  --c-border-hover:   rgba(0, 255, 255, 0.40);
  --c-border-active:  rgba(0, 255, 255, 0.70);
  --c-grid:           rgba(0, 255, 255, 0.03);
  --c-grid-strong:    rgba(0, 255, 255, 0.06);

  /* ═══ TYPOGRAPHY ═══ */
  --font-display:     'Orbitron', sans-serif;
  --font-tactical:    'Rajdhani', sans-serif;
  --font-mono:        'JetBrains Mono', monospace;
  --font-body:        'Chakra Petch', sans-serif;

  /* ═══ SPACING (40px base grid) ═══ */
  --space-xs:   4px;
  --space-sm:   8px;
  --space-md:   16px;
  --space-lg:   24px;
  --space-xl:   40px;
  --space-2xl:  64px;
  --space-3xl:  96px;
  --space-4xl:  128px;

  /* ═══ SHADOWS / GLOWS ═══ */
  --glow-cyan:    0 0 12px rgba(0,255,255,0.3),  0 0 40px rgba(0,255,255,0.08);
  --glow-cyan-lg: 0 0 24px rgba(0,255,255,0.5),  0 0 80px rgba(0,255,255,0.15);
  --glow-orange:  0 0 12px rgba(255,107,53,0.4),  0 0 40px rgba(255,107,53,0.1);
  --glow-magenta: 0 0 12px rgba(255,0,255,0.4),   0 0 40px rgba(255,0,255,0.1);
  --glow-gold:    0 0 16px rgba(255,215,0,0.4),   0 0 50px rgba(255,215,0,0.1);
  --glow-green:   0 0 12px rgba(57,255,20,0.4),   0 0 40px rgba(57,255,20,0.1);

  /* ═══ EFFECTS ═══ */
  --blur-glass:    blur(20px) saturate(180%) brightness(1.05);
  --blur-heavy:    blur(40px) saturate(200%);
  --transition:    all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  --transition-sm: all 0.12s cubic-bezier(0.16, 1, 0.3, 1);
  --transition-lg: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);

  /* ═══ LAYOUT ═══ */
  --grid-size:     40px;
  --max-width:     1440px;
  --nav-height:    60px;
  --panel-radius:  0; /* Sharp. Always. */
}
```

---

## ◆ LAYOUT PRINCIPLES

- **Grid:** `40px` base unit — all spacing must be multiples
- **Breakpoints:** `480 / 768 / 1024 / 1440 / 1920px`
- **Max content width:** `1440px`, centered
- **Panels:** Always `border-radius: 0` — softness is surrender
- **Alignment:** Asymmetric editorial layouts — content offset from grid creates operational tension
- **Geometry:** Prefer angled `clip-path` cuts on interactive elements — nothing in this system is orthogonally passive
- **Density:** Information density is a feature, not a bug — pack it with intent
- **Z-layers:**

| Z-Index | Layer |
|---|---|
| `0` | Base (grid, void) |
| `10` | Glow blooms |
| `20` | Structural panels |
| `30` | Content |
| `40` | Floating overlays, tooltips |
| `50` | Modals |
| `80` | Scan overlays, FX |
| `90` | Notifications, toasts |
| `100` | Navigation |
| `9998` | Cursor ring |
| `9999` | Cursor dot, noise overlay |

---

## ◆ COMPONENT CHECKLIST — COMPLETE

When building any component in this system, verify:

**Foundation**
- [ ] Background is `#020202` — not grey, not dark navy
- [ ] Grid overlay applied on canvas
- [ ] Noise overlay at `0.022` opacity
- [ ] No default `border-radius` on interactive elements

**Color & Borders**
- [ ] All borders are `rgba(0,255,255,N)` — zero exceptions
- [ ] Border translucency respects the 6-step scale
- [ ] System Gold used sparingly — maximum 1–2 elements per screen
- [ ] Venom Green only for confirmation/injection events

**Typography**
- [ ] Hero text: Orbitron, UPPERCASE, weight 800+
- [ ] Section headers: Rajdhani or Orbitron
- [ ] Data/code: JetBrains Mono with tabular numerals
- [ ] Body text: Chakra Petch, line-height 1.75
- [ ] All labels: UPPERCASE, letter-spaced, dimmed

**Interaction**
- [ ] All hover states upgrade border opacity + add glow
- [ ] All transitions use `cubic-bezier(0.16, 1, 0.3, 1)` — never `linear` or `ease`
- [ ] Click/active states have tactile feedback (transform or glow snap)
- [ ] Focus rings use `rgba(0,255,255,0.6)` outline

**Motion**
- [ ] Something always moves at system level (scan sweep, dot flicker, or pulse)
- [ ] Glitch effects reserved for errors/alerts ONLY
- [ ] Page entrance: staggered `fade-up` with `0.05s` delay per element
- [ ] Holographic text reserved for maximum tier elements only

**Details**
- [ ] Scrollbars: 4px, cyan thumb, no radius
- [ ] Selection: `rgba(0,255,255,0.2)` bg, `#00ffff` text
- [ ] Custom cursor: dot + ring
- [ ] Section titles have `◆` prefix mark
- [ ] Glow blooms behind all hero content
- [ ] Terminal cursor `█` blinks at 0.8s step-end

---

## ◆ THE PHILOSOPHY — EXPANDED

> *"Precision is the only aesthetic. The grid never lies. Cyan is the color of truth in the dark."*
> *"Every pixel has a purpose. Every glow is earned. Every silence is loaded."*
> *"The interface doesn't serve the user. It recruits them."*

This design system exists in a world where:

- Every interface is a **tactical instrument**, not a brochure
- **Data is sacred** — never hidden, never soft, never apologetic
- **Glass and light** reveal depth without decoration
- The machine is always **partially alive** — something always moves, blinks, pulses, breathes
- **Silence is charged** — negative space is loaded with latent potential, not emptiness
- **Fonts are weapons** — Orbitron says *classified*. Rajdhani says *efficient*. JetBrains Mono says *precise*. Chakra Petch says *I know things you don't*
- **Glitch is not a flaw** — it is honesty. The system showing its seams. Reality at the edges of control.
- **Gold is ceremony** — use it the way a military uses medals. Rarely. With weight.
- **Sharp edges are a position** — roundness is comfort. This system does not comfort. It *activates*.

Every pixel is **intentional**. Every glow is **earned**. Every cut corner is a **statement**.

---

## ◆ FORBIDDEN LIST

**Never do these things:**

- `border-radius` on interactive or structural elements (only 2px badge radius is permitted)
- `#fff` or `#000` as primary text or background
- `Arial`, `Inter`, `Roboto`, `system-ui` — wrong century
- Gradients on the base canvas background
- `transition: all 0.3s ease` — always cubic-bezier
- Using Gold or Venom Green for decoration — they are signals, not palette colors
- Glitch effects on non-error UI elements
- Rounded panels, rounded modals, rounded anything large
- Light mode (there is no light mode. light mode does not exist in this system)
- Box shadows without the matching glow (they look weak alone)
- Generic loading spinners without adapting to the `pulse-cyan` vocabulary
- `opacity: 0.5` on text — use the exact translucency values from the scale

---

*— SOFTCURSE/SYS · STYLE ENGINE v3.0 · OMEGA ULTRA SUPREME EDITION —*
*— BUILD THE FUTURE OR GET PROCESSED BY IT —*
