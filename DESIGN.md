# Mathematical IDE Design System Specification

## 1. Visual Identity & Brand Foundations

The Axine visual identity is derived directly from the settled brand mark: a deep navy letterform `A` transitioning into a topological wave spiral, coupled with a dark charcoal `X` and vibrant warm particle shapes (amber, orange, coral, teal, sage green) within the vortex.

### 1.1 Core Principles
1. **The mathematical document is the brightest object on screen**: All application chrome (toolbars, borders, tabs, gutter cards) recedes into warm neutral tones so the user's algebraic notation and visualizations command primary focus.
2. **Color carries semantic truth, never decoration**: Color in the interface chrome is strictly rationed to a single focused accent and four operational semantic states with immutable meanings (`verified`, `unknown`, `error`, `stale`). No arbitrary rainbow palette or template gradients.
3. **Navy is Brand-Only**: The deep navy tone (`#164e87`) belongs strictly to the brand mark (the header logo and favicon). It is never used in interface chrome, panel backgrounds, borders, or accents.
4. **Typography establishes mathematical credibility**: Mathematical notation is rendered in a dedicated serif face with proper italicization of variables, lining figures for numbers, upright function names, and TeXbook spacing around operators and relation anchors.

### 1.2 Brand Assets
- **Header Mark & Favicon**: Currently deployed as transparent, anti-aliased high-resolution raster assets (`public/logo-dark.png`, `public/logo-light.png`, `public/favicon.ico`, `public/favicon.png`).
- **Future Vector Conversion Note**: A flat, precision SVG vector trace of the mark is planned and wanted eventually to replace raster assets.

### 1.3 The Single Focused Accent: Amber
Axine selects **Amber** (`#f59e0b` in dark mode, `#92400e` in light mode) from the mark's warm particle spectrum as its sole interface accent:
- **Natural Warm Neutral Harmony**: Harmonizes natively with the warm dark neutral (`#181716`) and warm paper (`#faf9f5`) ground foundations.
- **Superior Legibility & Luminance Balance**: Amber achieves high WCAG contrast (**8.34 : 1** dark, **6.73 : 1** light) while avoiding excessive luminance that would compete with primary mathematical notation (`#f5f4f0`).
- **Chromatic State Separation**: Choosing Amber avoids visual collision with Semantic Verified green (`#4ade80`), keeping state indicators unambiguous.

### 1.4 Reserved Library Origin Hues
The remaining particle hues from the logo mark are explicitly held in reserve for per-module AST provenance tracking in future multi-library expressions:
- **Orange** (`#ea580c`)
- **Coral** (`#e11d48`)
- **Teal** (`#0d9488`)
- **Sage Green** (`#16a34a`)

When an expression aggregates terms from disparate imported libraries or domain models, these reserved hues serve as subtle origin indicators without invading interface chrome.

---

## 2. Token Architecture (`src/styles/tokens.css`)

All colors, typographic scales, spacing units, border radii, and animation durations are encapsulated as CSS custom properties. No literal hex values, pixel dimensions, or radii exist outside `tokens.css`.

### 2.1 Color Palettes & Themes

#### Dark Theme (Warm Neutral Foundation — Default)
- **Base Background**: `#181716` (Warm dark neutral)
- **Surface / Panel Background**: `#22201e`
- **Surface Elevated / Hover**: `#2c2927` / `#35322f`
- **Borders & Dividers**: `#3d3936` (subtle: `#2e2b28`, strong: `#544f4a`)
- **Document Text (Primary)**: `#f5f4f0`
- **Secondary / Chrome Text**: `#a8a39d`
- **Tertiary / Guides / Line Numbers**: `#8c867e`
- **Focused Accent**: `#f59e0b` (Warm Amber-500)
- **Accent Subtle / Border**: `rgba(245, 158, 11, 0.12)` / `rgba(245, 158, 11, 0.35)`

#### Light Theme (Designed Warm Paper Foundation)
- **Base Background**: `#faf9f5` (Warm cream/paper)
- **Surface / Panel Background**: `#f0eee6`
- **Surface Elevated / Hover**: `#e6e3d8` / `#dedad0`
- **Borders & Dividers**: `#d4cfc1` (subtle: `#e5e2d6`, strong: `#aba494`)
- **Document Text (Primary)**: `#1c1917`
- **Secondary / Chrome Text**: `#57534e`
- **Tertiary / Guides / Line Numbers**: `#706a64`
- **Focused Accent**: `#92400e` (Deep Amber-800)
- **Accent Subtle / Border**: `rgba(146, 64, 14, 0.08)` / `rgba(146, 64, 14, 0.3)`

---

## 3. The Four Semantic States

| Semantic State | Dark Color | Dark BG / Border | Light Color | Light BG / Border | Fixed Meaning |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Verified** | `#4ade80` (Green-400) | `rgba(74,222,128,0.08)` / `0.25` | `#15803d` (Green-700) | `rgba(21,128,61,0.08)` / `0.25` | Mathematical theorem claim or algebraic derivation proven & checked against solution-set equivalence |
| **Unknown** | `#fbbf24` (Amber-400) | `rgba(251,191,36,0.08)` / `0.25` | `#b45309` (Amber-700) | `rgba(180,83,9,0.08)` / `0.25` | Search fuel exhausted, unrepresented complex field $\mathbb{C}$, or requires unavailable theory |
| **Error** | `#f87171` (Red-400) | `rgba(248,113,113,0.08)` / `0.25` | `#b91c1c` (Red-700) | `rgba(185,28,28,0.08)` / `0.25` | Syntax error, classification rejection, or division by zero |
| **Stale** | `#9ca3af` (Muted) | `rgba(156,163,175,0.08)` / `0.25` | `#57534e` (Stone-600) | `rgba(87,83,78,0.08)` / `0.25` | Output computed from earlier source state prior to uncommitted edits |

---

## 4. Contrast Ratio Verification (WCAG AA $\ge 4.5:1$)

All foreground/background pairings have been rigorously tested against WCAG 2.1 standards:

### Dark Theme Ratios
- **Primary Text (`#f5f4f0`) on Base (`#181716`)**: **16.27 : 1** (Passes AAA)
- **Primary Text (`#f5f4f0`) on Surface (`#22201e`)**: **14.75 : 1** (Passes AAA)
- **Secondary Text (`#a8a39d`) on Base (`#181716`)**: **7.15 : 1** (Passes AAA)
- **Secondary Text (`#a8a39d`) on Surface (`#22201e`)**: **6.49 : 1** (Passes AA)
- **Tertiary Text (`#8c867e`) on Base (`#181716`)**: **4.97 : 1** (Passes AA)
- **Tertiary Text (`#8c867e`) on Surface (`#22201e`)**: **4.50 : 1** (Passes AA)
- **Accent Focus (`#f59e0b`) on Base (`#181716`)**: **8.34 : 1** (Passes AAA)
- **Accent Focus (`#f59e0b`) on Surface (`#22201e`)**: **7.56 : 1** (Passes AAA)
- **Semantic Verified (`#4ade80`) on Base (`#181716`)**: **10.27 : 1** (Passes AAA)
- **Semantic Unknown (`#fbbf24`) on Base (`#181716`)**: **10.72 : 1** (Passes AAA)
- **Semantic Error (`#f87171`) on Base (`#181716`)**: **6.47 : 1** (Passes AA)
- **Semantic Stale (`#9ca3af`) on Base (`#181716`)**: **7.05 : 1** (Passes AAA)

### Light Theme Ratios
- **Primary Text (`#1c1917`) on Base (`#faf9f5`)**: **16.60 : 1** (Passes AAA)
- **Primary Text (`#1c1917`) on Surface (`#f0eee6`)**: **15.05 : 1** (Passes AAA)
- **Secondary Text (`#57534e`) on Base (`#faf9f5`)**: **7.24 : 1** (Passes AAA)
- **Secondary Text (`#57534e`) on Surface (`#f0eee6`)**: **6.57 : 1** (Passes AA)
- **Tertiary Text (`#706a64`) on Base (`#faf9f5`)**: **5.07 : 1** (Passes AA)
- **Tertiary Text (`#706a64`) on Surface (`#f0eee6`)**: **4.59 : 1** (Passes AA)
- **Accent Focus (`#92400e`) on Base (`#faf9f5`)**: **6.73 : 1** (Passes AA)
- **Accent Focus (`#92400e`) on Surface (`#f0eee6`)**: **6.10 : 1** (Passes AA)
- **Semantic Verified (`#15803d`) on Base (`#faf9f5`)**: **4.76 : 1** (Passes AA)
- **Semantic Unknown (`#b45309`) on Base (`#faf9f5`)**: **4.77 : 1** (Passes AA)
- **Semantic Error (`#b91c1c`) on Base (`#faf9f5`)**: **6.14 : 1** (Passes AA)
- **Semantic Stale (`#57534e`) on Base (`#faf9f5`)**: **7.24 : 1** (Passes AAA)

---

## 5. Modular Typographic Scale (1.25 Ratio)

| Token | Dimension | Rem | Usage |
| :--- | :--- | :--- | :--- |
| `--font-size-2xs` | 11px | `0.6875rem` | Rule badges, timestamps, table metrics |
| `--font-size-xs` | 12px | `0.75rem` | Gutter status, line numbers, secondary labels |
| `--font-size-sm` | 14px | `0.875rem` | UI chrome, button labels, dropdown options |
| `--font-size-base`| 16px | `1.0rem` | Document editor source text, step equations |
| `--font-size-md` | 20px | `1.25rem` | Derivation root headers, equation anchors |
| `--font-size-lg` | 25px | `1.5625rem` | Section titles |
| `--font-size-xl` | 31.25px | `1.953rem` | Major document titles |

### Mathematical Spacing & Glyph Rules
- **Font Stack**: `var(--font-family-math)` (`"KaTeX_Main", "Cambria Math", "TeX Gyre Termes", "Times New Roman", serif`).
- **Variable Styling**: Italicized (, y, \theta$).
- **Functions & Operators**: Upright Roman ($\sin, \cos, \ln, \exp$).
- **Figures**: Lining numerals (`font-variant-numeric: lining-nums;`).
- **TeXbook Spacing**:
  - `\thickmuskip` (/18\text{em} \approx 0.2778\text{em}$) around relation symbols (, <, >, \le, \ge$).
  - `\medmuskip` (/18\text{em} \approx 0.2222\text{em}$) around binary additive operators ($+, -$).
  - `\thinmuskip` (/18\text{em} \approx 0.1667\text{em}$) around implicit multiplication and differential differentials (//dx$).

---

## 6. Icon Grid Specification

All UI icons are crafted on a strict **16px × 16px** coordinate grid with **1.5px** stroke width:
- Zero external font icon dependencies (FontAwesome, Material Icons, Feather).
- Zero literal emoji or Unicode symbols (`▶`, `⏹`, `📌`, `📈`, `💾`, `⭳`, `⭱`).
- Clean inline vector SVG primitives (`<polygon>`, `<polyline>`, `<path>`, `<rect>`) with `fill="none"`, `stroke="currentColor"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Build-time unit test (`src/tests/no_emoji.test.ts`) verifies zero emoji or symbol block characters exist across the entire `src/` directory.

---

## 7. Chrome Hierarchy & Density

- **Border Weight**: Single universal `1px` border thickness (`--border-width-default: 1px`).
- **Corner Radii**: Uniform small radius (`--border-radius-sm: 3px`).
- **Tabs**: Clean text with a 2px underline indicator (`border-bottom: 2px solid var(--color-accent)`) rather than filled pill containers.
- **Shadows**: Complete elimination of decorative drop shadows; flat surface hierarchy.
- **Density**: Compact `28px` gutter line heights paired with relaxed `1.7` line-height in the document editing area to support sustained reading.
