# Progress

Claude Code keeps this file current. Read it first in every session.

## Status
Phase 0 in progress (cloud/Linux session — no Xcode; see "Verification" below).

## Verification on this machine
- Linux container, no Xcode. `xcodebuild` cannot run here.
- Swift 6.1 toolchain via Docker (`swift:6.1-noble`): `swift build` / `swift test` for `Packages/BreakZeroKit`.
- Node 22 for `tools/js-tests`.

## Phase 0 plan
1. [x] Draft `ARCHITECTURE.md`; Phase 0 plan here; `QUESTIONS.md` seeded.
2. [ ] `Packages/BreakZeroKit` skeleton (Core, LiteWeb, Shielding) builds and tests on Linux.
3. [ ] `project.yml` (XcodeGen): App + ShieldConfiguration + ShieldAction + DeviceActivityMonitor, entitlements (Family Controls Development, App Group).
4. [ ] App shell: tab bar (Instagram, YouTube, Wall), Wall tab → hidden Diagnostics.
5. [ ] Diagnostics screen: one button per spike S1–S7 + shared log view.
6. [ ] Extension skeletons that read shared state and log to it.
7. [ ] `docs/ON_DEVICE_CHECKLIST.md`: entitlement request, App Group, signing, spike runs.
8. [ ] Docs stubs: README, LICENSE (MIT), SECURITY_MODEL, PRIVACY, RECIPES, CONTRIBUTING, docs/QA.

## Done
- ARCHITECTURE.md draft.

## Next
- Phase 0 items 2–8, then Phase 1 (recipes, RuleEngine, filter.js, LiteWeb).

## Unverified (written but never compiled or run)
- (none yet)

## Blockers
- (none yet)
