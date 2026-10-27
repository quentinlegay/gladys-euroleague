# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) that follows EuroLeague and EuroCup basketball
clubs through the public Euroleague Basketball API. It started from the official JavaScript
template ([GladysAssistant/integration-template-js](https://github.com/GladysAssistant/integration-template-js))
and follows the design of [prohand/gladys-teamtracker](https://github.com/prohand/gladys-teamtracker).

The user writes club codes (`PAN, MAD, U:BES`). Each club becomes a device (scores, game status,
next game, last result, wins, losses), plus four scene triggers (game soon, started, lead changed,
ended), one scene action (`get_match`) and two widgets (`team_match`, `my_teams`). Gladys 5.3+ is
required (the manifest `keywords` need it). Manifest `transports: ["cloud"]`.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/tracker.test.js            # one file
node --test --test-name-pattern "restart"   # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs `format:check`, `lint` and `test` on Node 22 and 24, and builds the Docker image:
run the three commands before pushing.

## Invariants worth knowing

- **External ids are forever.** A device is `club:<competition>.<club code>` (lowercase), never
  what the user typed: `PAN`, `pan` and `E:PAO` are the same device. Trigger, action, widget,
  feature, config and competition keys are stored by users: never rename them.
- **Three endpoints.** Clubs (daily), the season schedule (every reading, at most every 5 minutes
  while live), the live `Header` of a game under way. `parse.js` reads them all and never throws
  on a missing field. The schedule marks a game as played some time after the buzzer: the live
  header says first that it is over.
- **The season** starts on July 1st (`seasonYear`). Until the new season is published, the
  previous one is read.
- **The pace follows the games**: `live_refresh` seconds while a game is live or its tip-off has
  passed (for 4 h), else `idle_refresh` minutes, shortened to wake at the reminder and at the
  tip-off. Gladys' own polling is not used.
- **One event per transition, the first reading is a baseline.** `events.js` compares the
  previous reading of the same game; `store.js` keeps it across restarts. No per-basket trigger.
- **No event as a consequence of a scene action**: `get_match` reads the tracker's cache.
- **An outage is not "no game"**: the last game is kept, the badge turns `unreachable`, the
  connection status names the clubs not followed.
- **States only for created devices** (`gladys.devices`), deduplicated by the SDK, republished every
  6 h, all again after a reconnection or a device creation (`resetPublished()`).
- **The rootfs is read-only**: write only under `/data` (`DATA_DIR` overrides it in development).

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit `version` in
  `package.json` or the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js`
  checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`.
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects `{ "en", "fr" }`, never a plain string. The catalog
  `description` holds 10 to 100 characters per language. `test/manifest.test.js` ties the manifest
  to the code (defaults, actions, triggers, outputs, widgets, competitions): change both together.
- **User-facing text** is bilingual (English and French): action messages, widget texts, manifest
  texts, `docs/en.md` / `docs/fr.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network: add a trimmed API answer to `test/fixtures/`.
