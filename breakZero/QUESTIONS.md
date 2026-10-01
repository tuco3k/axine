# Questions for the owner

Each entry: the question, the default Claude Code chose, and why. The owner answers in the morning.

| # | Question | Default chosen | Why |
|---|---|---|---|
| 1 | This session ran in a Linux cloud container, not on your Mac. `xcodebuild` cannot run here. | Built and tested everything platform-neutral with Swift 6.1 (Docker) and Node; marked every Apple-only file UNVERIFIED in PROGRESS.md. | CLAUDE.md's Linux rules. First thing on the Mac: `xcodegen generate` and an `xcodebuild` build/test. |
| 2 | Bundle ID prefix and Apple team? | `com.breakzero.app` (+ `.ShieldConfiguration`, `.ShieldAction`, `.DeviceActivityMonitor`), App Group `group.com.breakzero.shared`, `DEVELOPMENT_TEAM` left empty. | Placeholder that is easy to change in one place (`project.yml` settings). Change before requesting the entitlement. |
| 3 | `Core`, `LiteWeb`, `Shielding`: three separate packages, or one package with three targets? | One local package `Packages/BreakZeroKit` with three library targets. | Same module boundaries, one `swift test`. Easy to split later. |
