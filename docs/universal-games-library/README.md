# Universal Games Library — isolated feature branch

Source: `freeworld`. This branch is not a deployment or production activation.

## Scope
Build one reusable game registry and playable practice experiences, then connect supported games to Free World, Paid World and Impossible Challenges using each world's existing competition and payout rules.

## Priority game implementations
Maze Escape; Spot the Difference; Ball Sort; Liquid Sort & Fill; Tower of Hanoi (Three Poles); Path Connect.

## Further candidates
Sliding Puzzle; Nonogram; Box Push; Pipe Connect; Word Search; Laser Mirrors; Number Hunt; Pattern Recall; Color Rush; Odd One Out; Block Puzzle; Shape Rotation; Circuit Connect; Gravity Puzzle; Tile Merge Challenge; Logic Grid; Hidden Objects; Bridge Builder; Gear Connect; Sequence Recall; Hexagon Puzzle; Parking Escape; Balance Challenge; Reaction Challenge.

## Non-negotiable integration boundaries
- Existing Free World scheduler and Champion extension controls remain authoritative.
- No live schedule editing in GC Competition Settings.
- All previews use isolated practice state and no real wallet or leaderboard writes.
- Paid World and Impossible Challenges retain their existing entry, eligibility, prizes and settlement logic.
- Existing games must be inventoried and deduplicated before replacement.
- Server validation is mandatory before a game is enabled for prize-bearing competitions.
- Game difficulty, game mode, puzzle seed/version and scoring method must be recorded per competition.
- Player sound preferences and in-game mute controls must stay synchronized.
- No merge, deployment or production data changes from this branch without explicit approval.

## Delivery stages
1. Inventory existing games and current integration points.
2. Add shared registry, capability flags, and preview routing.
3. Deliver six priority games with complete mechanics and responsive 2D/3D-appropriate UI.
4. Add remaining games in tested batches.
5. Integrate game selection independently into all three worlds, with compatibility guards.
6. Add server-authoritative competitive attempts, anti-tamper validation, and regression tests.
7. Run isolated QA, accessibility, mobile performance and security checks.

**Status:** Branch scaffolding only. This document does not imply any game is implemented or tested.
