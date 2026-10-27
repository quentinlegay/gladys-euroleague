# EuroLeague for Gladys Assistant

Follow your EuroLeague and EuroCup basketball clubs in Gladys: live score, next game, last
result, season record, and scenes when a game starts, when the lead changes or when it ends.

Scores come from the public API of Euroleague Basketball, the one its official websites use: no
account, no API key.

## Setup

1. Install the integration from the Gladys catalog.
2. In **Configuration**, write the clubs to follow in the **Teams** field, as their code,
   separated by commas: `PAN, MAD, ASV`.
3. Not sure of a code? Click **Find a team**, pick the competition, type part of the name (e.g.
   `Paris`), and copy the code shown.
4. Click **Test the teams**: each club is listed with its current or next game.
5. Open the **Discover** tab and create the devices.

## Club codes

A club is written with its Euroleague code, the one in the club's page address on
euroleaguebasketball.net. The TV code shown on the scoreboard and the short name work too.

| Code | Club (2026-27 season examples) |
| ---- | ------------------------------ |
| ASV  | LDLC ASVEL Villeurbanne        |
| PAR  | Partizan Mozzart Bet Belgrade  |
| MCO  | AS Monaco                      |
| PRS  | Paris Basketball               |
| PAN  | Panathinaikos AKTOR Athens     |
| OLY  | Olympiacos Piraeus             |
| MAD  | Real Madrid                    |
| BAR  | FC Barcelona                   |

The list changes every season: **Find a team** always shows the clubs of the current season.

### EuroCup clubs

Entries without a prefix belong to the **Default competition** of the configuration (EuroLeague
unless you change it). Prefix a club of the other competition: `U:` for EuroCup, `E:` for
EuroLeague. Example: `ASV, U:BES` follows ASVEL in EuroLeague and Beşiktaş in EuroCup.

## The devices

Each club becomes one device with these features:

| Feature        | Content                                                 |
| -------------- | ------------------------------------------------------- |
| Score          | The club's score in the current game (0 before tip-off) |
| Opponent score | The opponent's score                                    |
| Game           | `Live · Q3 05:23 · Panathinaikos 61 – 58 Partizan`      |
| Next game      | `Fri 30 Oct, 20:00 · at Olympiacos`                     |
| Last result    | `Win · Panathinaikos 85 – 78 Real Madrid`               |
| Wins / Losses  | The club's record in the competition this season        |

After a game, the result stays the "current" game until the next morning, then the next game
takes its place.

## Scenes

Triggers, each filtered by club and by home or away:

- **Game starting soon** — the configured number of minutes before tip-off (30 by default).
- **Game started** — the tip-off.
- **Lead changed** — the lead switched sides (filter on who now leads). A tie in between is not a
  change, and the first basket of the game neither.
- **Game ended** — with the result (filter on win or loss).

Their variables (`{{triggerEvent.data.summary}}`, `team_score`, `opponent_score`, `opponent`,
`round`…) can be used in the following actions, e.g. a notification
`{{triggerEvent.data.summary}}`.

Action **Get the game of a team** gives the following actions the state of the game (`pre`, `in`,
`post`), the scores, the result, the season record and the next game.

## Dashboard

- **Team game** — one club: live score, clock, tip-off, opponent, last result, next game, record.
- **My teams** — every followed club with its crest: live games first, then the next tip-offs.

## Refresh pace

- During a game: every **Refresh during a game** seconds (30 by default).
- Otherwise: every **Refresh between games** minutes (15 by default), and exactly at the tip-off
  reminder and at the tip-off.

## Troubleshooting

- **"Not followed: XYZ"** in the connection status: click **Test the teams**, it says why (unknown
  code, competition, API not answering).
- **Unreachable badge** on a device: the Euroleague API did not answer; the last known game is kept
  and the integration tries again at the next reading.
- In July and August, before the new schedule is published, the devices show the end of the
  previous season.

The Euroleague API is public but undocumented: Euroleague Basketball can change it without notice.
This integration is not affiliated with or endorsed by Euroleague Basketball.
