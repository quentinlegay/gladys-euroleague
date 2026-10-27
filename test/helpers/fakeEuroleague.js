// -----------------------------------------------------------------------------
// In-memory stand-in for the Euroleague client (src/euroleague/client.js):
// serves the fixtures of test/fixtures/, records every call, and can fail on
// demand. Tests never touch the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

/**
 * @param {object} [options]
 * @param {Record<string, object>} [options.clubs]   season code -> answer
 * @param {Record<string, object>} [options.games]   season code -> answer
 * @param {Record<number, object>} [options.headers] game code -> answer
 */
export function createFakeEuroleague({
  clubs = { E2026: fixture('clubs-e2026.json') },
  games = { E2026: fixture('games-e2026.json') },
  headers = { 23: fixture('header-live.json') },
} = {}) {
  const calls = [];
  const fake = {
    calls,
    clubsAnswers: clubs,
    gamesAnswers: games,
    headers,
    failing: false,

    async clubs(competition, season) {
      calls.push(['clubs', competition, season]);
      if (fake.failing) {
        throw new Error('down');
      }
      return fake.clubsAnswers[season] ?? { data: [], total: 0 };
    },
    async games(competition, season) {
      calls.push(['games', competition, season]);
      if (fake.failing) {
        throw new Error('down');
      }
      return fake.gamesAnswers[season] ?? { data: [], total: 0 };
    },
    async header(season, gameCode) {
      calls.push(['header', season, gameCode]);
      if (fake.failing || !fake.headers[gameCode]) {
        throw new Error('down');
      }
      return fake.headers[gameCode];
    },
    async crest() {
      calls.push(['crest']);
      return Buffer.from('png');
    },
    count(kind) {
      return calls.filter((call) => call[0] === kind).length;
    },
  };
  return fake;
}
