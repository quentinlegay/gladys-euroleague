import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock,
  formatKickoff,
  formatLast,
  formatNext,
  formatStatus,
  multilingual,
} from '../src/format.js';

const en = { language: 'en', timezone: 'Europe/Paris' };
const fr = { language: 'fr', timezone: 'Europe/Paris' };

const base = {
  id: 'E2026_23',
  kickoff: '2026-10-30T19:00:00.000Z',
  state: 'pre',
  completed: false,
  postponed: false,
  homeAway: 'away',
  team: { abbreviation: 'Panathinaikos', score: 0 },
  opponent: { abbreviation: 'Olympiacos', score: 0 },
  result: null,
  period: null,
  clock: '',
};

test('a game to come shows its tip-off in the configured time zone', () => {
  assert.equal(formatKickoff(base.kickoff, 'en', 'Europe/Paris'), 'Fri 30 Oct, 20:00');
  assert.equal(formatStatus(base, en), 'Next · Fri 30 Oct, 20:00 · at Olympiacos');
  assert.equal(formatStatus(base, fr), 'Prochain match · ven. 30 oct., 20:00 · à Olympiacos');
  assert.equal(formatNext(base, fr), 'ven. 30 oct., 20:00 · à Olympiacos');
});

test('a live game shows the clock and the score, the followed club first', () => {
  const live = {
    ...base,
    state: 'in',
    period: 3,
    clock: '05:23',
    team: { abbreviation: 'Panathinaikos', score: 61 },
    opponent: { abbreviation: 'Olympiacos', score: 58 },
  };
  assert.equal(formatStatus(live, en), 'Live · Q3 05:23 · Panathinaikos 61 – 58 Olympiacos');
  assert.equal(formatClock({ period: 5, clock: '02:10' }, 'en'), 'OT1 02:10');
  assert.equal(formatClock({ period: 2, clock: '00:00' }, 'fr'), 'Mi-temps');
  assert.equal(
    formatStatus({ ...live, period: null }, en),
    'Live · Panathinaikos 61 – 58 Olympiacos',
  );
});

test('a finished game shows the result', () => {
  const final = {
    ...base,
    state: 'post',
    completed: true,
    result: 'loss',
    team: { abbreviation: 'Panathinaikos', score: 77 },
    opponent: { abbreviation: 'ASVEL', score: 81 },
  };
  assert.equal(formatStatus(final, en), 'Final · Panathinaikos 77 – 81 ASVEL · Loss');
  assert.equal(formatLast(final, 'fr'), 'Défaite · Panathinaikos 77 – 81 ASVEL');
});

test('postponed and missing games', () => {
  assert.equal(
    formatStatus({ ...base, postponed: true }, en),
    'Postponed · Panathinaikos at Olympiacos',
  );
  assert.equal(formatStatus(null, fr), 'Aucun match prévu');
  assert.equal(formatNext(null, en), 'No game scheduled');
  assert.deepEqual(
    multilingual((language) => language),
    { en: 'en', fr: 'fr' },
  );
});
