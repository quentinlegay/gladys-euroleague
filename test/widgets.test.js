import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { Tracker } from '../src/tracker.js';
import {
  MY_TEAMS_WIDGET,
  TEAM_MATCH_WIDGET,
  createWidgets,
  crestKey,
  refreshWidgets,
  widgetImage,
} from '../src/widgets.js';
import { createFakeEuroleague } from './helpers/fakeEuroleague.js';

const LIVE_NOW = Date.parse('2026-10-27T18:00:00Z');

async function setup({ now = LIVE_NOW, teams = 'PAN, MAD', create = true } = {}) {
  const gladys = createFakeGladys();
  const client = createFakeEuroleague();
  const tracker = new Tracker({
    gladys,
    client,
    now: () => now,
    setTimer: () => 0,
    clearTimer: () => {},
  });
  const config = normalizeConfig({ teams });
  tracker.configure(config);
  await tracker.refresh();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
  }
  return { gladys, client, tracker, config, widgets: createWidgets(tracker) };
}

const PAN = 'ext:test-integration:club:e.pan';

test('team_match during a live game: valid content, live tiles on the device features', async () => {
  const { gladys, widgets, config } = await setup();
  const content = await widgets[TEAM_MATCH_WIDGET].get(gladys, { settings: { team: PAN }, config });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, 30);
  assert.equal(content.components[0].text, 'Panathinaikos 61 – 58 Partizan');
  const tiles = content.components.filter((c) => c.device_feature);
  assert.deepEqual(
    tiles.map((t) => t.device_feature),
    [`${PAN}:team-score`, `${PAN}:opponent-score`],
  );
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((r) => r.label.en),
    ['Live', 'Tip-off', 'Opponent', 'Last result', 'Next game', 'Season'],
  );
});

test('team_match before the devices exist, without a team, and between games', async () => {
  const { gladys, widgets, config } = await setup({ create: false });
  const content = await widgets[TEAM_MATCH_WIDGET].get(gladys, { settings: { team: PAN }, config });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.some((c) => c.type === 'value' && c.value === 61));

  const empty = await widgets[TEAM_MATCH_WIDGET].get(gladys, { settings: {}, config });
  assert.deepEqual(validateWidgetContent(empty), []);

  const idle = await setup({ now: Date.parse('2026-10-29T12:00:00Z') });
  const next = await idle.widgets[TEAM_MATCH_WIDGET].get(idle.gladys, {
    settings: { team: PAN },
    config: idle.config,
  });
  assert.deepEqual(validateWidgetContent(next), []);
  assert.equal(next.ttl_seconds, 600);
});

test('my_teams lists the live game first, with crests and badges', async () => {
  const { gladys, widgets, config } = await setup();
  const content = await widgets[MY_TEAMS_WIDGET].get(gladys, { config });
  assert.deepEqual(validateWidgetContent(content), []);
  const items = content.components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(
    items.map((i) => [i.title, i.badge.text.en, i.image]),
    [
      ['Panathinaikos AKTOR Athens', 'LIVE', 'crest-e-pan'],
      ['Real Madrid', 'NEXT', 'crest-e-mad'],
    ],
  );

  const none = await setup({ teams: '' });
  assert.deepEqual(
    validateWidgetContent(await none.widgets[MY_TEAMS_WIDGET].get(none.gladys, { config })),
    [],
  );
});

test('the refresh button reads again and answers a toast', async () => {
  const { gladys, client, widgets, config } = await setup();
  const before = client.count('header');
  const message = await widgets[MY_TEAMS_WIDGET].action(gladys, { actionKey: 'refresh', config });
  assert.deepEqual(message, { en: 'Scores refreshed', fr: 'Scores actualisés' });
  assert.equal(client.count('header'), before + 1);
  await assert.rejects(widgets[MY_TEAMS_WIDGET].action(gladys, { actionKey: 'nope', config }));
});

test('crest images are served by key, unknown keys refused', async () => {
  const { tracker, client } = await setup();
  const key = crestKey(tracker.list()[0]);
  assert.equal(await widgetImage(tracker, client, key), Buffer.from('png').toString('base64'));
  await assert.rejects(widgetImage(tracker, client, 'crest-e-xyz'));
});

test('refreshWidgets nudges every widget', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, [TEAM_MATCH_WIDGET, MY_TEAMS_WIDGET]);
  await gladys.disconnect();
});
