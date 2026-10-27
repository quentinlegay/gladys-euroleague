// -----------------------------------------------------------------------------
// Device type: FOLLOWED CLUB
//
// One Gladys device per followed club, read-only features:
//   - team-score      the club's score in the current (or last) game;
//   - opponent-score  the opponent's score;
//   - status          one line: "Live · Q3 05:23 · Panathinaikos 61 – 58 Real Madrid";
//   - next-game       "Thu 30 Oct, 20:45 · vs Real Madrid";
//   - last-result     "Win · Panathinaikos 85 – 78 Real Madrid";
//   - wins / losses   the club's record in the competition this season.
//
// Scores and records are `counter-sensor` integers, so scene conditions can
// compare them ("if my team leads"). The texts are `text` features: Gladys
// shows them as they are and never marks them as outdated.
//
// The external id is built from the competition and the Euroleague club
// code (PAN, MAD…), never from what the user typed: "PAN" and "E:pan" are the
// same device.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { formatLast, formatNext, formatStatus } from '../format.js';

export const DEVICE_TYPE = 'club';

export const FEATURE = {
  TEAM_SCORE: 'team-score',
  OPPONENT_SCORE: 'opponent-score',
  STATUS: 'status',
  NEXT_GAME: 'next-game',
  LAST_RESULT: 'last-result',
  WINS: 'wins',
  LOSSES: 'losses',
};

const FEATURE_NAMES = {
  en: {
    [FEATURE.TEAM_SCORE]: 'Score',
    [FEATURE.OPPONENT_SCORE]: 'Opponent score',
    [FEATURE.STATUS]: 'Game',
    [FEATURE.NEXT_GAME]: 'Next game',
    [FEATURE.LAST_RESULT]: 'Last result',
    [FEATURE.WINS]: 'Wins',
    [FEATURE.LOSSES]: 'Losses',
  },
  fr: {
    [FEATURE.TEAM_SCORE]: 'Score',
    [FEATURE.OPPONENT_SCORE]: 'Score adverse',
    [FEATURE.STATUS]: 'Match',
    [FEATURE.NEXT_GAME]: 'Prochain match',
    [FEATURE.LAST_RESULT]: 'Dernier résultat',
    [FEATURE.WINS]: 'Victoires',
    [FEATURE.LOSSES]: 'Défaites',
  },
};

// Highest value a counter accepts: no basketball score nor season record
// comes near it.
const MAX_COUNTER = 999;

/**
 * Ids of a followed club's device and features.
 * @param {string} competition E or U
 * @param {string} clubCode Euroleague club code
 */
export function teamExternalIds(gladys, competition, clubCode) {
  return gladys.externalIds(DEVICE_TYPE, `${competition}.${clubCode}`.toLowerCase());
}

/**
 * Discovery payload of a followed club.
 * @param {{ spec: object, info: { code: string, name: string } }} tracked
 */
export function buildTeamDevice(gladys, tracked, config) {
  const ids = teamExternalIds(gladys, tracked.spec.competition, tracked.info.code);
  const names = FEATURE_NAMES[config.language] ?? FEATURE_NAMES.en;
  const counter = (key, keepHistory) => ({
    name: names[key],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    min: 0,
    max: MAX_COUNTER,
    read_only: true,
    has_feedback: false,
    keep_history: keepHistory,
  });
  const textFeature = (key) => ({
    name: names[key],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    // Gladys stores min/max as NOT NULL, text features included.
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  });
  return {
    name: `${tracked.info.name} (${tracked.spec.competitionName})`,
    external_id: ids.device,
    features: [
      counter(FEATURE.TEAM_SCORE, true),
      counter(FEATURE.OPPONENT_SCORE, true),
      textFeature(FEATURE.STATUS),
      textFeature(FEATURE.NEXT_GAME),
      textFeature(FEATURE.LAST_RESULT),
      counter(FEATURE.WINS, false),
      counter(FEATURE.LOSSES, false),
    ],
  };
}

/**
 * States of a followed club, in the `publishStates` shape. Before a game
 * (`pre`) the scores read 0: a condition "my team leads" must not hold on the
 * score of the previous game.
 */
export function teamStates(gladys, tracked, config) {
  const ids = teamExternalIds(gladys, tracked.spec.competition, tracked.info.code);
  const { match, next, last, record } = tracked;
  const states = [];
  if (match) {
    const started = match.state !== 'pre';
    states.push(
      {
        device_feature_external_id: ids.feature(FEATURE.TEAM_SCORE),
        state: started ? match.team.score : 0,
      },
      {
        device_feature_external_id: ids.feature(FEATURE.OPPONENT_SCORE),
        state: started ? match.opponent.score : 0,
      },
    );
  }
  states.push(
    {
      device_feature_external_id: ids.feature(FEATURE.STATUS),
      text: formatStatus(match ?? null, config),
    },
    {
      device_feature_external_id: ids.feature(FEATURE.NEXT_GAME),
      text: formatNext(next ?? null, config),
    },
    {
      device_feature_external_id: ids.feature(FEATURE.LAST_RESULT),
      text: formatLast(last ?? null, config.language),
    },
  );
  if (record) {
    states.push(
      { device_feature_external_id: ids.feature(FEATURE.WINS), state: record.wins },
      { device_feature_external_id: ids.feature(FEATURE.LOSSES), state: record.losses },
    );
  }
  return states;
}
