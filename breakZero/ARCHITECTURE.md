# breakZero architecture (draft, Phase 0)

Status: **draft**. The Phase 0 spikes (BRIEF.md §6) decide several things here.
Each open item is marked `[S#]` with the spike that settles it. Update this
file when the owner reports results.

## Shape

```
breakzero/
├── project.yml                  XcodeGen spec. The .xcodeproj is generated, never committed.
├── App/                         SwiftUI app target (breakZero)
│   ├── Sources/                 Shell, tabs, Wall tab, Diagnostics (S1–S7)
│   ├── Resources/               Info.plist, asset catalog
│   └── breakZero.entitlements   family-controls (Development), App Group
├── Extensions/
│   ├── ShieldConfiguration/     Custom shield look ("X is behind the wall")
│   ├── ShieldAction/            Shield buttons → local notification → deep link, then .close
│   └── DeviceActivityMonitor/   Re-shields when a pass ends; applies due ratchet changes
├── Packages/BreakZeroKit/       One local Swift package, three library targets
│   ├── Sources/Core/            Recipe models + bundled recipes, RuleEngine,
│   │                            ContentRuleCompiler, NetworkPolicy, SharedStore (App Group JSON)
│   ├── Sources/LiteWeb/         WKWebView controller, navigation policy, bundled filter.js
│   └── Sources/Shielding/       Protocols over ManagedSettings/DeviceActivity/FamilyControls,
│                                real implementations behind #if canImport, fakes for tests
├── tools/js-tests/              Node tests for filter.js against HTML fixtures (dev only)
└── docs/                        ON_DEVICE_CHECKLIST.md, QA.md
```

### Why one package with three targets
The brief asks for `Core`, `LiteWeb` and `Shielding` as Swift packages. One
local package with three library products gives the same module boundaries,
one `Package.swift`, and one `swift test`. Splitting into three packages later
is mechanical if needed.

### Linux-testable core
Everything in `Core` uses Foundation only. `LiteWeb` and `Shielding` put
WebKit / UIKit / FamilyControls / ManagedSettings / DeviceActivity code behind
`#if canImport(...)`, so their pure parts (content-rule compilation, script
assembly, pass/re-shield planning) build and test on Linux too. CryptoKit
(recipe signatures, Phase 4) goes behind `#if canImport(CryptoKit)`.

## Lite views (Phase 1)

Each platform tab owns one persistent, warm `WKWebView`. Filtering happens in
five layers (BRIEF.md §7). All five are driven by one recipe JSON per platform.

| # | Layer | Where | Runs in allow zones? |
|---|---|---|---|
| 1 | `WKContentRuleList` compiled from `block` routes | `ContentRuleCompiler` (Core) → `WKContentRuleListStore` (LiteWeb) | yes (URL-only) |
| 2 | Navigation policy for full loads | `RuleEngine` (Core) via `WKNavigationDelegate` (LiteWeb) | yes (URL-only) |
| 2b | SPA route guard: hooks `pushState` / `replaceState` / `popstate` | `filter.js` | yes (URL-only) |
| 3 | CSS hide sheet, injected at `documentStart` | `filter.js` | **no** |
| 4 | `MutationObserver` heuristics (href / ARIA / structure), rAF-throttled | `filter.js` | **no** |
| 5 | Canaries: forbidden thing still present → blur + "filter needs an update" | `filter.js` | **no** |

**Allow zones** (DMs, compose, settings, login, checkpoints) get only the
URL-level layers. Our DOM code never touches them, so a bug in a heuristic
cannot break a DM thread.

**One decision table, two implementations.** URL decisions are made in Swift
(full loads) and in JS (SPA navigation). Both are tested against the same
hand-written table, `Packages/BreakZeroKit/Tests/Fixtures/route-cases.json`,
so they cannot drift apart silently.

**Script injection.** `filter.js` is bundled code. The recipe is passed to it as
JSON data (`window.__bz_recipe` set by a tiny generated prelude). Remote recipe
updates (Phase 4) are data only — never JS (App Store guideline 2.5.2).

**Fail safe, scoped.** Each layer-3/4/5 operation is wrapped so an exception
in one rule logs and moves on. Canaries cover a region when they cannot
confirm a forbidden surface is gone. Canaries only run outside allow zones.

**Language-independent.** Recipes may only select by URL, `href`, ARIA role,
attributes and structure. `RecipeValidator` rejects selectors that use
`:contains`-style text matching, and the JS has no text matching.

### Navigation outcomes

`RuleEngine.decide(url:context:state:)` returns one of:

- `allow` — load it (and whether it is in an allow zone)
- `redirect(to)` — load another URL instead (e.g. YouTube `/` → `/feed/subscriptions`)
- `rewrite(to)` — same idea, built from capture groups (`/shorts/ID` → `/watch?v=ID`)
- `block(fallback)` — stay out; go to the landing page
- `bounce(to)` — leave a one-off reel and return to the DM thread it came from
- `external` — not this platform: open in `SFSafariViewController`

`allowOnce` (IG reel sent in a DM) keeps a tiny `RouteState`: the thread URL it
came from and the one reel ID allowed. Any other reel ID bounces back.

## Native networking — one choke point

`NetworkPolicy` is the only place native code may make a request.
`PolicedHTTPClient` wraps `URLSession` and asks `NetworkPolicy` first. A unit
test scans every Swift source file and fails if `URLSession` appears anywhere
else. Allowed native requests:

1. The optional, user-toggled recipe-update URL (Phase 4).
2. `[S2]` Possibly public YouTube channel RSS (`/feeds/videos.xml`) if the
   no-login YouTube fallback is chosen.

Web view page loads are the platform's own traffic and are not routed through
this client; nothing our scripts read from a page is ever sent anywhere.

## Shared state (App Group)

`SharedStore` reads and writes Codable JSON files in the App Group container
with `NSFileCoordinator`, so the app and all three extensions see one truth.
Files: `wall-policy.json`, `lock-state.json`, `pass-log.json`,
`recipe-overrides.json`. Writes are atomic (temp file + replace).

## Shielding (Phase 2+)

Named `ManagedSettingsStore`s keep concerns apart so one can't clobber another:

| Store | Holds |
|---|---|
| `wall.base` | Shields for every picked app/category/domain; `denyAppRemoval` |
| `wall.pass` | Nothing by default. A pass removes one app from `wall.base` for N minutes — `[S7]` how exactly (clear-and-reapply vs. a separate store) depends on how stores combine on device |
| `wall.schedule` | Reserved for schedules/sleep mode (Phase 5) |

`Shielding` exposes protocols (`ShieldApplying`, `ActivityScheduling`,
`AuthorizationChecking`) so pass and re-shield logic is unit-tested with fakes.

Re-shielding lives in the DeviceActivityMonitor extension (`intervalDidEnd`) so
it fires with the app killed. Belt and braces: the app re-applies the base wall
on every launch, and every extension callback re-applies it too.

`[S7]` DeviceActivity reportedly needs intervals ≥ 15 min. For a 5-minute pass
the planned workaround is a 15-minute interval whose start is backdated by 10
minutes; the fallback is a `DeviceActivityEvent` threshold. Decided on device.

`[S1]` If shielding the native Instagram/YouTube app also blocks
instagram.com/youtube.com inside our own `WKWebView`, the Lite approach needs a
workaround or stops — the whole product depends on this answer.

## The Wall (Phase 3)

`WallPolicy` (every restriction) and `LockState` (mode, pending changes, pass
log, last-verified marks) are plain Codable values in Core. The ratchet is a
pure function: `apply(change, to: policy, at: clock) -> .appliedNow | .queued(until)`.
Tightening applies now; loosening queues for the cooldown; Hard Lock refuses
loosening. Clock tampering is checked with uptime + boot-time cross-checks
(injected clock in tests).

## Open decisions (see QUESTIONS.md)

- `[S1]` Does shielding the native app block our web view? Decides whether Lite works at all.
- `[S2]` YouTube login: default UA vs. Safari UA vs. no-login RSS fallback.
- `[S3]` Instagram user agent and session persistence.
- `[S4]` Notifications: Option A (disclose) is the default.
- `[S7]` How a short pass is scheduled.
