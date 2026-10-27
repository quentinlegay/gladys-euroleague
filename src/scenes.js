// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// `get_match` gives a scene the game of a followed club as outputs, for the
// following actions: "say the score", "if my team leads, turn the lights
// green", a notification with `{{summary}}` or `{{next_game}}`.
//
// It reads what the tracker already knows and never calls the API: a
// reading could fire a scene event (the end of a game) as a consequence of
// the action, and a scene bound to that event would loop through the
// integration. The tracker reads every `live_refresh` seconds during a game,
// so the cache is fresh.
//
// The scene TRIGGERS (game_soon, game_started, lead_changed, game_ended)
// need no handler: the tracker fires them, see src/events.js.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { formatNext, formatStatus } from './format.js';

const logger = createLogger({ name: 'scenes' });

export const GET_MATCH = 'get_match';

/**
 * Outputs of `get_match`, every key the manifest declares, always present.
 * @param {object | undefined} tracked
 */
export function matchOutputs(tracked, config) {
  const match = tracked?.match ?? null;
  const started = match && match.state !== 'pre';
  return {
    state: match ? match.state : 'none',
    is_live: match?.state === 'in',
    team_score: started ? match.team.score : 0,
    opponent_score: started ? match.opponent.score : 0,
    opponent: match ? match.opponent.name : '',
    kickoff: match ? match.kickoff : '',
    result: match?.result ?? '',
    wins: tracked?.record?.wins ?? 0,
    losses: tracked?.record?.losses ?? 0,
    summary: formatStatus(match, config),
    next_game: formatNext(tracked?.next ?? null, config),
  };
}

export function createSceneActions(tracker) {
  return {
    async [GET_MATCH](_gladys, { fields, config }) {
      logger.info(`Scene action get_match <- ${fields.team}`);
      const tracked = tracker.findByDevice(fields.team);
      if (!tracked) {
        // A device removed from the followed clubs: an error the scene logs,
        // the following actions still run.
        throw new Error(`${fields.team} is not a followed club any more`);
      }
      return matchOutputs(tracked, config);
    },
  };
}
