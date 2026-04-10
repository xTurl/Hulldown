# Changelog

## v1.8.0

**New Features**

- **Multi-player switcher** — If Hulldown detects multiple players in your replays folder, your name in the sidebar now shows a dropdown. Switch between players instantly — no manual reconfiguration needed.
- **Updates / Patches view** — New "Updates" page in the sidebar. Shows recent WoT patch notes, hotfixes, and micropatches pulled from the official feed, with filter tabs so you can find what you need fast.
- **Manual stats entry for incomplete battles** — Abandoned or bugged replays no longer have to sit as blank entries. Hit the pencil button on any incomplete battle to enter damage, frags, assist, and result manually — WN8/WNX recalculates immediately.

**Improvements**

- **Theme-aware error messages** — Error banners in the dashboard now correctly follow your light/dark theme instead of being stuck in dark mode styling.

**Fixes**

- **Replay filtering by player** — Hulldown now skips replays that belong to other players who shared the same folder. Only your battles are imported. Fully backwards-compatible with older replays.

---

## v1.7.0

- Dashboard two-column layout
- WNX promoted to primary stat row in SessionCard
- Net credits in SessionCard (replay-based sessions)
- Recent battles wrap responsively on narrow windows

## v1.6.0

- Tank type icons (WoT-style PNG) and nation flag emojis in Tanks tab, Recent Battles, and Tank Detail
- Tank Detail Maps tab auto-loads on switch
- Analytics: tooltip clarifying abandoned battles are excluded

## v1.5.1

- Fix: incomplete replay handling edge cases

## v1.5.0

- Track abandoned battles, filter from all analytics queries

## v1.4.4

- Analytics Maps tab period filter + Avg spotted column

## v1.4.3

- Fix: rebuild better-sqlite3 against Electron headers

## v1.4.2

- Fix: folder picker in Setup + force rebuild of better-sqlite3

## v1.4.1

- Fix: updater pointing to correct Hulldown-releases repo

## v1.4.0

- Auto-updater (checks GitHub releases)
- Multi-player detection from replays folder
- Economy chart in Analytics (ECharts)
- Net credits column in Recent Battles
