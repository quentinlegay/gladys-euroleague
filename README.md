# EuroLeague — Gladys Assistant integration

A [Gladys Assistant](https://gladysassistant.com) **external integration** that follows your
**EuroLeague** and **EuroCup** basketball clubs: live score, next game, last result, season
record, scene triggers and dashboard widgets.

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js),
after the example of [gladys-teamtracker](https://github.com/prohand/gladys-teamtracker) (which
follows ESPN leagues, EuroLeague not included). Data comes from the public, undocumented API of
Euroleague Basketball — no account, no key.

User documentation: [English](docs/en.md) · [Français](docs/fr.md).

## What it does

The user writes the clubs to follow as their Euroleague code (`PAN, MAD, ASV`, `U:BES` for a
EuroCup club). Each club becomes a device:

| Feature          | Type                     | Example                                            |
| ---------------- | ------------------------ | -------------------------------------------------- |
| `team-score`     | counter-sensor (integer) | `61`                                               |
| `opponent-score` | counter-sensor (integer) | `58`                                               |
| `status`         | text                     | `Live · Q3 05:23 · Panathinaikos 61 – 58 Partizan` |
| `next-game`      | text                     | `Fri 30 Oct, 20:00 · at Olympiacos`                |
| `last-result`    | text                     | `Win · Panathinaikos 85 – 78 Real Madrid`          |
| `wins`, `losses` | counter-sensor (integer) | `5`, `2`                                           |

| Capability            | Manifest key                                              |
| --------------------- | --------------------------------------------------------- |
| Scene triggers        | `game_soon`, `game_started`, `lead_changed`, `game_ended` |
| Scene action          | `get_match`                                               |
| Dashboard widgets     | `team_match`, `my_teams`                                  |
| Configuration buttons | `test_teams`, `find_team`                                 |

Gladys **5.3+** is required (the manifest `keywords` need it).

## Data source

| Endpoint                                                              | Used for                       |
| --------------------------------------------------------------------- | ------------------------------ |
| `api-live.euroleague.net/v2/competitions/{E,U}/seasons/{E2026}/clubs` | resolve codes, names, crests   |
| `api-live.euroleague.net/v2/competitions/{E,U}/seasons/{E2026}/games` | schedule, final scores, record |
| `live.euroleague.net/api/Header?gamecode=…&seasoncode=…`              | live score, quarter, clock     |

One schedule request per competition per reading (every 5 minutes at most while a game is live),
one small live-feed request per game under way, the club list once a day.

## Project structure

```
index.js                SDK wiring only: handlers registered before connect(), tracker start/stop
src/config.js           DEFAULT_CONFIG (mirrors the manifest defaults), normalization, parseTeams()
src/competitions.js     E / U competitions, season of a date
src/euroleague/client.js the three API endpoints + crests (fetch injected, timeouts)
src/euroleague/parse.js API JSON -> Club, Game, Match; live header
src/events.js           two readings -> the scene events between them (pure)
src/format.js           status lines and dates, English and French
src/tracker.js          the loop: read the API, publish devices/states/badges, fire events, pace
src/store.js            last reading per club, in /data (restart-safe events)
src/devices/team.js     the device of a followed club (external ids, features, states)
src/actions.js          Configuration buttons: test_teams, find_team
src/scenes.js           scene action get_match (reads the cache, never the API)
src/widgets.js          widgets team_match and my_teams, crest images
test/                   node --test, against the SDK's fake Gladys and API fixtures
```

## Develop

```bash
npm install
npm test               # node --test, never touches the network
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a local Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="euroleague" \
DATA_DIR=./data LOG_LEVEL=debug \
npm start
```

## Publish

1. Add the GitHub topic `gladys-assistant-integration` to the repository.
2. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
3. **Actions → Release → Run workflow** (`patch`, `minor` or `major`): it bumps the versions,
   tags, builds the multi-arch image to `ghcr.io/quentinlegay/gladys-euroleague` and publishes the
   GitHub Release. Make the package public on ghcr.io after the first release.
4. Replace `cover.png` (800×534 px, ≤150 KB) with a cover of your own: the bundled one is the
   template's placeholder.

Not affiliated with or endorsed by Euroleague Basketball.

## License

Apache-2.0
