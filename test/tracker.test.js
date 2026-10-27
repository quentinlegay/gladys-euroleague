import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { FEATURE } from '../src/devices/team.js';
import { TRIGGERS } from '../src/events.js';
import { Tracker } from '../src/tracker.js';
import { createFakeEuroleague, fixture } from './helpers/fakeEuroleague.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LIVE_NOW = Date.parse('2026-10-27T18:00:00Z');

function setup({
  teams = 'PAN, MAD',
  now = LIVE_NOW,
  client = createFakeEuroleague(),
  store,
  config = {},
} = {}) {
  const gladys = createFakeGladys();
  const clock = { now };
  const tracker = new Tracker({
    gladys,
    client,
    store,
    now: () => clock.now,
    // No real timers in the tests: refresh() is called by hand.
    setTimer: () => 0,
    clearTimer: () => {},
  });
  tracker.configure(normalizeConfig({ teams, ...config }));
  return { gladys, client, clock, tracker };
}

/** Create every discovered device, like the user would in the Discover tab. */
async function createAll(gladys, tracker) {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
  tracker.resetPublished();
  await tracker.refresh();
}

function memoryStore() {
  let saved = {};
  return {
    async load() {
      return structuredClone(saved);
    },
    async save(teams) {
      saved = structuredClone(teams);
    },
  };
}

test('the followed clubs become devices Gladys accepts', async () => {
  const { gladys, tracker } = setup();
  await tracker.refresh();
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Panathinaikos AKTOR Athens (EuroLeague)', 'Real Madrid (EuroLeague)'],
  );
  assert.equal(devices[0].external_id, 'ext:test-integration:club:e.pan');
  assert.deepEqual(
    devices[0].features.map((f) => f.external_id.split(':').at(-1)),
    Object.values(FEATURE),
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  // No state for a device the user has not created yet.
  assert.equal(gladys.fake.states.length, 0);
});

test('a live game publishes its score, its clock and polls at the live pace', async () => {
  const { gladys, tracker } = setup();
  await tracker.refresh();
  await createAll(gladys, tracker);
  const feature = (key) => `ext:test-integration:club:e.pan:${key}`;
  assert.equal(gladys.fake.lastState(feature(FEATURE.TEAM_SCORE)), 61);
  assert.equal(gladys.fake.lastState(feature(FEATURE.OPPONENT_SCORE)), 58);
  assert.equal(
    gladys.fake.lastState(feature(FEATURE.STATUS)),
    'Live · Q3 05:23 · Panathinaikos 61 – 58 Partizan',
  );
  assert.equal(
    gladys.fake.lastState(feature(FEATURE.NEXT_GAME)),
    'Fri 30 Oct, 20:00 · at Olympiacos',
  );
  assert.equal(
    gladys.fake.lastState(feature(FEATURE.LAST_RESULT)),
    'Loss · Panathinaikos 77 – 81 ASVEL',
  );
  assert.equal(gladys.fake.lastState(feature(FEATURE.WINS)), 1);
  assert.equal(gladys.fake.lastState(feature(FEATURE.LOSSES)), 1);
  assert.equal(tracker.nextDelay(), 30_000);
  // Real Madrid is not playing: its last game is too old, the next one shows.
  assert.match(
    gladys.fake.lastState(`ext:test-integration:club:e.mad:${FEATURE.STATUS}`),
    /^Next · Wed 28 Oct, 20:45 · vs ASVEL$/,
  );
});

test('the schedule is re-read every few minutes only while live, the live feed every time', async () => {
  const { client, clock, tracker } = setup({ teams: 'PAN' });
  await tracker.refresh();
  clock.now += 30_000;
  await tracker.refresh();
  clock.now += 30_000;
  await tracker.refresh();
  assert.equal(client.count('games'), 1);
  assert.equal(client.count('header'), 3);
  clock.now += 5 * 60_000;
  await tracker.refresh();
  assert.equal(client.count('games'), 2);
  assert.equal(client.count('clubs'), 1, 'the clubs are read once a day');
});

test('the end of the game fires once, with the declared variables', async () => {
  const { gladys, client, clock, tracker } = setup({ teams: 'PAN' });
  await tracker.refresh();
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first reading is a baseline');

  clock.now += 30_000;
  client.headers[23] = fixture('header-final.json');
  await tracker.refresh();
  clock.now += 30_000;
  await tracker.refresh();

  const ended = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.GAME_ENDED);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].data.result, 'win');
  assert.equal(ended[0].data.summary, 'Final · Panathinaikos 92 – 85 Partizan · Win');
  const declared = manifest.scene_triggers.find((t) => t.key === TRIGGERS.GAME_ENDED);
  const allowed = new Set([...declared.fields, ...declared.variables].map((f) => f.key));
  for (const key of Object.keys(ended[0].data)) {
    assert.ok(allowed.has(key), `undeclared key ${key}`);
  }
  // The game counts in the record before the schedule marks it as played.
  assert.deepEqual(tracker.list()[0].record, { wins: 2, losses: 1 });
  assert.notEqual(tracker.nextDelay(), 30_000, 'back to the idle pace');
});

test('the tip-off of a game fires game_started, the reminder fires before', async () => {
  const before = Date.parse('2026-10-27T16:50:00Z');
  const { gladys, client, clock, tracker } = setup({
    teams: 'PAN',
    now: before,
    config: { idle_refresh: 60 },
  });
  await tracker.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.GAME_SOON],
  );
  assert.equal(gladys.fake.sceneEvents[0].data.minutes, 25);
  // Woken exactly at the tip-off.
  assert.equal(tracker.nextDelay(), 25 * 60_000);

  clock.now = Date.parse('2026-10-27T17:16:00Z');
  client.headers[23] = { ...fixture('header-live.json'), Quarter: '1', ScoreA: '2', ScoreB: '0' };
  await tracker.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.GAME_SOON, TRIGGERS.GAME_STARTED],
  );
});

test('a late tip-off keeps the live pace without firing anything', async () => {
  const { gladys, client, tracker } = setup({ teams: 'PAN' });
  client.headers[23] = fixture('header-pre.json');
  await tracker.refresh();
  assert.equal(tracker.list()[0].match.state, 'pre');
  assert.equal(tracker.nextDelay(), 30_000);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('an outage keeps the last game and says which clubs are not followed', async () => {
  const { gladys, client, clock, tracker } = setup();
  await tracker.refresh();
  await createAll(gladys, tracker);
  const before = tracker.list()[0].match;

  client.failing = true;
  clock.now += 6 * 60_000;
  await tracker.refresh();
  assert.deepEqual(tracker.list()[0].match, before);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /PAN, MAD/);
  assert.ok(
    gladys.fake.transports.some(
      (t) =>
        t.device_external_id === 'ext:test-integration:club:e.pan' && t.transport === 'unreachable',
    ),
  );
});

test('an unknown club is reported, the others are followed', async () => {
  const { gladys, tracker } = setup({ teams: 'PAN, BAR, Real Madrid' });
  await tracker.refresh();
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(tracker.list()[1].resolveError, 'not_found');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /Real Madrid, BAR/);
});

test('the code and the TV code of one club make a single device', async () => {
  const { gladys, tracker } = setup({ teams: 'PAN, PAO' });
  await tracker.refresh();
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(tracker.list()[1].resolveError, 'duplicate');
});

test('in the summer, the previous season is shown until the new one is published', async () => {
  // The fixtures are the 2026-27 season: nothing published yet for 2027-28.
  const client = createFakeEuroleague();
  const { tracker } = setup({ teams: 'PAN', now: Date.parse('2027-07-15T12:00:00Z'), client });
  await tracker.refresh();
  assert.deepEqual(
    client.calls.filter((c) => c[0] !== 'header').map((c) => c.join(' ')),
    ['clubs E E2027', 'clubs E E2026', 'games E E2027', 'games E E2026'],
  );
  assert.equal(tracker.list()[0].info.code, 'PAN');
  assert.equal(tracker.list()[0].last.gameCode, 11);
});

test('a restart neither replays nor misses the end of a game', async () => {
  const store = memoryStore();
  const first = setup({ teams: 'PAN', store });
  await first.tracker.load();
  await first.tracker.refresh();

  // The integration restarts while the game ends.
  const client = createFakeEuroleague({ headers: { 23: fixture('header-final.json') } });
  const second = setup({ teams: 'PAN', store, client, now: LIVE_NOW + 10 * 60_000 });
  await second.tracker.load();
  second.tracker.configure(normalizeConfig({ teams: 'PAN' }));
  await second.tracker.refresh();
  assert.deepEqual(
    second.gladys.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.GAME_ENDED],
  );
});
