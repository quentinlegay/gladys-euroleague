import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { findTeams, testTeams } from '../src/actions.js';
import { normalizeConfig } from '../src/config.js';
import { GET_MATCH, createSceneActions } from '../src/scenes.js';
import { Tracker } from '../src/tracker.js';
import { createFakeEuroleague } from './helpers/fakeEuroleague.js';

function setup(teams = 'PAN, BAR, X:Y') {
  const gladys = createFakeGladys();
  const client = createFakeEuroleague();
  const tracker = new Tracker({
    gladys,
    client,
    now: () => Date.parse('2026-10-27T18:00:00Z'),
    setTimer: () => 0,
    clearTimer: () => {},
  });
  tracker.configure(normalizeConfig({ teams }));
  return { gladys, client, tracker };
}

test('test_teams reads now and explains every entry', async () => {
  const { tracker } = setup();
  const message = await testTeams(tracker);
  assert.equal(
    message.en,
    [
      'Panathinaikos AKTOR Athens (EuroLeague): Live · Q3 05:23 · Panathinaikos 61 – 58 Partizan',
      '  1 W – 1 L',
      '  Loss · Panathinaikos 77 – 81 ASVEL',
      '  Fri 30 Oct, 20:00 · at Olympiacos',
      'BAR: no such club this season, use "Find a team"',
      'X:Y: write the club code, e.g. PAN, or U:BES for a EuroCup club',
    ].join('\n'),
  );
  assert.ok(message.fr.startsWith('Panathinaikos AKTOR Athens (EuroLeague): En direct'));
});

test('test_teams without any club asks for one', async () => {
  const { tracker } = setup('');
  assert.match((await testTeams(tracker)).en, /No club to follow yet/);
});

test('find_team lists the codes to paste, filtered by the search', async () => {
  const { tracker } = setup();
  const all = await findTeams(tracker, { competition: 'E' });
  assert.equal(all.en.split('\n')[0], '5 club(s) in EuroLeague, code to copy into Teams:');
  assert.ok(all.en.includes('ASV — LDLC ASVEL Villeurbanne'));

  const found = await findTeams(tracker, { competition: 'E', search: 'athens' });
  assert.deepEqual(found.en.split('\n').slice(1), ['PAN — Panathinaikos AKTOR Athens']);

  // A EuroCup club needs its prefix when EuroLeague is the default.
  const eurocup = await findTeams(tracker, { competition: 'U', search: 'pan' });
  assert.ok(eurocup.en.includes('No club of EuroCup'), 'no EuroCup fixture: nothing found');

  assert.match((await findTeams(tracker, { competition: 'NBA' })).en, /Unknown competition/);
});

test('get_match reads the cache and never the API', async () => {
  const { gladys, client, tracker } = setup('PAN');
  await tracker.refresh();
  const calls = client.calls.length;
  const actions = createSceneActions(tracker);
  const outputs = await actions[GET_MATCH](gladys, {
    fields: { team: 'ext:test-integration:club:e.pan' },
    config: tracker.config,
  });
  assert.equal(client.calls.length, calls);
  assert.deepEqual(outputs, {
    state: 'in',
    is_live: true,
    team_score: 61,
    opponent_score: 58,
    opponent: 'Partizan Mozzart Bet Belgrade',
    kickoff: '2026-10-27T17:15:00.000Z',
    result: '',
    wins: 1,
    losses: 1,
    summary: 'Live · Q3 05:23 · Panathinaikos 61 – 58 Partizan',
    next_game: 'Fri 30 Oct, 20:00 · at Olympiacos',
  });
  await assert.rejects(
    actions[GET_MATCH](gladys, { fields: { team: 'ext:test-integration:club:e.zzz' } }),
  );
});
