import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHeader,
  clubGames,
  findClub,
  matchFor,
  parseClubs,
  parseGames,
  parseHeader,
} from '../src/euroleague/parse.js';
import { fixture } from './helpers/fakeEuroleague.js';

const NOW = Date.parse('2026-10-27T18:00:00Z');
const clubs = parseClubs(fixture('clubs-e2026.json'));
const games = parseGames(fixture('games-e2026.json'));

test('parseClubs reads the codes, the names and the crest', () => {
  assert.equal(clubs.length, 5);
  assert.deepEqual(clubs[0], {
    code: 'PAN',
    name: 'Panathinaikos AKTOR Athens',
    shortName: 'Panathinaikos',
    tvCode: 'PAO',
    crest: 'https://media-cdn.incrowdsports.com/e3dff28a-9ec6-4faf-9d96-ecbc68f75780.png',
  });
});

test('findClub matches the code, the TV code, then the name', () => {
  assert.equal(findClub(clubs, 'pan').club.code, 'PAN');
  assert.equal(findClub(clubs, 'PAO').club.code, 'PAN');
  assert.equal(findClub(clubs, 'asvel').club.code, 'ASV');
  assert.deepEqual(findClub(clubs, 'BAR'), { error: 'not_found' });
});

test('parseGames reads the schedule, oldest first, and skips broken entries', () => {
  const parsed = parseGames({ data: [...fixture('games-e2026.json').data, { gameCode: 99 }] });
  assert.equal(parsed.length, 7);
  const first = parsed[0];
  assert.equal(first.id, 'E2026_1');
  assert.equal(first.kickoff, '2026-10-02T17:00:00.000Z');
  assert.equal(first.played, true);
  assert.equal(first.local.score, 89);
  assert.equal(first.round, 'Round 1');
  assert.equal(first.venue, 'OAKA ALTION');
  assert.deepEqual(parseGames(null), []);
});

test('matchFor sees a game from the followed club, with its result', () => {
  const away = matchFor(
    games.find((g) => g.gameCode === 11),
    'PAN',
  );
  assert.equal(away.homeAway, 'away');
  assert.equal(away.team.abbreviation, 'Panathinaikos');
  assert.equal(away.team.score, 77);
  assert.equal(away.opponent.score, 81);
  assert.equal(away.state, 'post');
  assert.equal(away.result, 'loss');
});

test('clubGames finds the ongoing, the last and the next game, and the record', () => {
  const own = clubGames(games, 'PAN', NOW);
  assert.equal(own.ongoing.gameCode, 23);
  assert.equal(own.last.gameCode, 11);
  assert.equal(own.next.gameCode, 34);
  assert.deepEqual([own.wins, own.losses], [1, 1]);

  const later = clubGames(games, 'PAN', Date.parse('2026-10-28T03:00:00Z'));
  assert.equal(later.ongoing, null, 'not live any more after the live window');
  assert.equal(later.next.gameCode, 34);
});

test('parseHeader reads the live feed, numbers as strings included', () => {
  assert.deepEqual(parseHeader(fixture('header-live.json')), {
    live: true,
    localScore: 61,
    roadScore: 58,
    period: 3,
    clock: '05:23',
  });
  assert.deepEqual(parseHeader({}), {
    live: false,
    localScore: 0,
    roadScore: 0,
    period: null,
    clock: '',
  });
});

test('applyHeader: live, over, or not started yet', () => {
  const pending = matchFor(
    games.find((g) => g.gameCode === 23),
    'PAN',
  );
  const live = applyHeader(pending, parseHeader(fixture('header-live.json')));
  assert.equal(live.state, 'in');
  assert.deepEqual([live.team.score, live.opponent.score, live.period], [61, 58, 3]);

  const over = applyHeader(pending, parseHeader(fixture('header-final.json')));
  assert.equal(over.state, 'post');
  assert.equal(over.completed, true);
  assert.equal(over.result, 'win');

  assert.equal(applyHeader(pending, parseHeader(fixture('header-pre.json'))), pending);

  // Seen from the road side, the scores swap.
  const road = applyHeader(
    matchFor(
      games.find((g) => g.gameCode === 23),
      'PAR',
    ),
    parseHeader(fixture('header-final.json')),
  );
  assert.deepEqual([road.team.score, road.opponent.score, road.result], [85, 92, 'loss']);
});

test('applyHeader never ends a game on a tie', () => {
  const pending = matchFor(
    games.find((g) => g.gameCode === 23),
    'PAN',
  );
  const tied = applyHeader(pending, { live: false, localScore: 80, roadScore: 80, period: 4 });
  assert.equal(tied.state, 'in');
});
