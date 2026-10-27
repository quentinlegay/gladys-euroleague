# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.1] - 2026-10-27

### Added

- Follow EuroLeague and EuroCup clubs by their code (`PAN, MAD, U:BES`): one device per club with
  the score, the opponent's score, the game status, the next game, the last result and the
  season record (wins, losses).
- Live scores during a game (quarter and clock), read at the pace of the games: every 30 s while
  live, every 15 min otherwise, woken at the tip-off reminder and at the tip-off.
- Scene triggers: game starting soon, game started, lead changed, game ended (win or loss).
- Scene action "Get the game of a team", with the score, the result, the record and the next game.
- Dashboard widgets "Team game" and "My teams", with the club crests.
- Configuration buttons "Test the teams" and "Find a team".

[Unreleased]: https://github.com/quentinlegay/gladys-euroleague/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/quentinlegay/gladys-euroleague/releases/tag/v1.0.1
