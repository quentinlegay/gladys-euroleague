import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS, detectEvents, eventData, rememberLeader } from '../src/events.js';

const NOW = Date.parse('2026-10-27T17:00:00Z');

function match(overrides = {}) {
  return {
    id: 'E2026_23',
    kickoff: '2026-10-27T17:15:00.000Z',
    state: 'pre',
    completed: false,
    postponed: false,
    homeAway: 'home',
    team: { code: 'PAN', name: 'Panathinaikos', abbreviation: 'Panathinaikos', score: 0 },
    opponent: { code: 'PAR', name: 'Partizan', abbreviation: 'Partizan', score: 0 },
    result: null,
    round: 'Round 3',
    ...overrides,
  };
}

const keys = (result) => result.events.map((e) => e.key);
const score = (team, opponent, extra = {}) =>
  match({
    state: 'in',
    team: { ...match().team, score: team },
    opponent: { ...match().opponent, score: opponent },
    ...extra,
  });

test('the first reading is a baseline, but the reminder still fires', () => {
  const result = detectEvents({
    previous: undefined,
    current: match(),
    now: NOW,
    reminderMinutes: 30,
  });
  assert.deepEqual(keys(result), [TRIGGERS.GAME_SOON]);
  assert.equal(result.events[0].minutes, 15);
  assert.equal(result.remindedFor, 'E2026_23');
  // Sent once.
  const again = detectEvents({
    previous: match(),
    current: match(),
    remindedFor: 'E2026_23',
    now: NOW,
    reminderMinutes: 30,
  });
  assert.deepEqual(keys(again), []);
});

test('no reminder when disabled, too early, or for a postponed game', () => {
  for (const [current, minutes] of [
    [match(), 0],
    [match(), 10],
    [match({ postponed: true }), 30],
  ]) {
    assert.deepEqual(
      keys(detectEvents({ previous: undefined, current, now: NOW, reminderMinutes: minutes })),
      [],
    );
  }
});

test('tip-off and end are one event each', () => {
  assert.deepEqual(
    keys(detectEvents({ previous: match(), current: score(2, 0), now: NOW, reminderMinutes: 0 })),
    [TRIGGERS.GAME_STARTED],
  );
  const final = match({ ...score(92, 85), state: 'post', completed: true, result: 'win' });
  assert.deepEqual(
    keys(detectEvents({ previous: score(90, 85), current: final, now: NOW, reminderMinutes: 0 })),
    [TRIGGERS.GAME_ENDED],
  );
  assert.deepEqual(
    keys(detectEvents({ previous: final, current: final, now: NOW, reminderMinutes: 0 })),
    [],
  );
});

test('a game seen under way for the first time still started', () => {
  const previous = match({ id: 'E2026_11', state: 'post', completed: true });
  assert.deepEqual(
    keys(detectEvents({ previous, current: score(10, 8), now: NOW, reminderMinutes: 0 })),
    [TRIGGERS.GAME_STARTED],
  );
});

test('a lead change fires once, a tie in between is no change', () => {
  const step = (previous, current) => {
    const result = detectEvents({ previous, current, now: NOW, reminderMinutes: 0 });
    return { keys: keys(result), remembered: rememberLeader(previous, current) };
  };
  // The first basket after 0-0 takes a lead nobody had.
  let state = step(rememberLeader(undefined, score(0, 0)), score(2, 0));
  assert.deepEqual(state.keys, []);
  // Tied, then the team leads again: no change.
  state = step(state.remembered, score(2, 2));
  assert.deepEqual(state.keys, []);
  state = step(state.remembered, score(4, 2));
  assert.deepEqual(state.keys, []);
  // Through a tie to the opponent: one change.
  state = step(state.remembered, score(4, 4));
  state = step(state.remembered, score(4, 7));
  assert.deepEqual(state.keys, [TRIGGERS.LEAD_CHANGED]);
  state = step(state.remembered, score(6, 9));
  assert.deepEqual(state.keys, []);
});

test('eventData holds only the declared keys of each trigger', () => {
  const data = eventData(
    { key: TRIGGERS.LEAD_CHANGED, match: score(4, 7) },
    'ext:test:club:e.pan',
    'EuroLeague',
    'Live · 4 – 7',
  );
  assert.deepEqual(data, {
    team: 'ext:test:club:e.pan',
    team_name: 'Panathinaikos',
    opponent: 'Partizan',
    home_away: 'home',
    competition: 'EuroLeague',
    round: 'Round 3',
    team_score: 4,
    opponent_score: 7,
    summary: 'Live · 4 – 7',
    leading: 'opponent',
  });
});
