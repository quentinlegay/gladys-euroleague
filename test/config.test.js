import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, MAX_TEAMS, normalizeConfig, parseTeams } from '../src/config.js';
import { parseCompetition, seasonCode, seasonYear } from '../src/competitions.js';

test('normalizeConfig fills the defaults and clamps the numbers', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  const config = normalizeConfig({
    live_refresh: '5',
    idle_refresh: 'abc',
    reminder_minutes: 99999,
    language: 'de',
    timezone: 'Not/AZone',
    competition: 'u',
  });
  assert.equal(config.live_refresh, 15);
  assert.equal(config.idle_refresh, DEFAULT_CONFIG.idle_refresh);
  assert.equal(config.reminder_minutes, 1440);
  assert.equal(config.language, 'en');
  assert.equal(config.timezone, 'Europe/Paris');
  assert.equal(config.competition, 'U');
});

test('parseTeams reads codes, competition prefixes, and reports the bad entries', () => {
  const { teams, errors } = parseTeams('PAN, mad ; U:BES\nE:pan, X:ABC, Real Madrid, ,');
  assert.deepEqual(
    teams.map((t) => [t.competition, t.club, t.competitionName]),
    [
      ['E', 'PAN', 'EuroLeague'],
      ['E', 'MAD', 'EuroLeague'],
      ['U', 'BES', 'EuroCup'],
    ],
  );
  assert.deepEqual(errors, [
    { entry: 'E:pan', reason: 'duplicate' },
    { entry: 'X:ABC', reason: 'competition' },
    { entry: 'Real Madrid', reason: 'format' },
  ]);
});

test('parseTeams puts the entries without prefix in the default competition', () => {
  const { teams } = parseTeams('BES, E:PAN', 'U');
  assert.deepEqual(
    teams.map((t) => `${t.competition}:${t.club}`),
    ['U:BES', 'E:PAN'],
  );
});

test('parseTeams stops at the limit', () => {
  const codes = Array.from({ length: MAX_TEAMS + 2 }, (_, i) => `C${i}`).join(',');
  const { teams, errors } = parseTeams(codes);
  assert.equal(teams.length, MAX_TEAMS);
  assert.deepEqual(
    errors.map((e) => e.reason),
    ['limit', 'limit'],
  );
});

test('the season starts in July', () => {
  assert.equal(seasonYear(Date.parse('2026-10-27T18:00:00Z')), 2026);
  assert.equal(seasonYear(Date.parse('2027-05-20T18:00:00Z')), 2026);
  assert.equal(seasonYear(Date.parse('2027-07-01T00:00:00Z')), 2027);
  assert.equal(seasonCode('E', 2026), 'E2026');
});

test('parseCompetition accepts the codes and the names', () => {
  assert.equal(parseCompetition('e').code, 'E');
  assert.equal(parseCompetition('EuroCup').code, 'U');
  assert.equal(parseCompetition('NBA'), null);
});
