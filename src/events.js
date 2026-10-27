// -----------------------------------------------------------------------------
// From two readings of a club's game to the scene events they mean.
//
// Pure functions: the tracker reads the API, keeps the previous reading of
// every club (persisted in /data, so a restart neither replays nor misses an
// event) and asks this module what happened in between.
//
// One event per transition, never one per reading: the tip-off is `pre`
// turning into `in`, the end is a completed `post`, a lead change is the
// sign of the score margin flipping during the game. The very first reading
// of a club is a baseline and fires nothing (a fresh install during a game
// must not announce its start).
//
// No "team scored" trigger: a basketball game has a hundred baskets, a scene
// per basket would be noise.
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  GAME_SOON: 'game_soon',
  GAME_STARTED: 'game_started',
  LEAD_CHANGED: 'lead_changed',
  GAME_ENDED: 'game_ended',
};

/**
 * The `data` of a scene event: flat scalars only, the keys the manifest
 * declares in the trigger's `fields` (`team`, `home_away`, `result`,
 * `leading`) and `variables`.
 * @param {{ key: string, match: object, minutes?: number }} event
 * @param {string} deviceExternalId the followed club's device (the `team` filter)
 * @param {string} competitionName
 * @param {string} summary formatted status line
 */
export function eventData(event, deviceExternalId, competitionName, summary) {
  const { match } = event;
  const data = {
    team: deviceExternalId,
    team_name: match.team.name,
    opponent: match.opponent.name,
    home_away: match.homeAway,
    competition: competitionName,
    round: match.round,
    team_score: match.team.score,
    opponent_score: match.opponent.score,
    summary,
  };
  if (event.key === TRIGGERS.GAME_SOON) {
    data.kickoff = match.kickoff;
    data.minutes = event.minutes;
  }
  if (event.key === TRIGGERS.LEAD_CHANGED) {
    data.leading = leaderOf(match);
  }
  if (event.key === TRIGGERS.GAME_ENDED) {
    data.result = match.result;
  }
  return data;
}

// A tip-off reminder older than this is not sent any more (the integration
// was down when it was due).
const REMINDER_GRACE_MS = 5 * 60 * 1000;

/** 'team', 'opponent' or 'tied'. */
export function leaderOf(match) {
  const margin = match.team.score - match.opponent.score;
  return margin > 0 ? 'team' : margin < 0 ? 'opponent' : 'tied';
}

/**
 * @param {object} args
 * @param {import('./euroleague/parse.js').Match | null | undefined} args.previous last reading (undefined: never read)
 * @param {import('./euroleague/parse.js').Match | null} args.current
 * @param {string | null} args.remindedFor id of the game the reminder was already sent for
 * @param {number} args.now
 * @param {number} args.reminderMinutes 0 disables the reminder
 * @returns {{ events: Array<{ key: string, match: object, minutes?: number }>,
 *   remindedFor: string | null }}
 */
export function detectEvents({ previous, current, remindedFor = null, now, reminderMinutes }) {
  const events = [];
  let reminded = remindedFor;
  if (!current) {
    return { events, remindedFor: reminded };
  }

  if (
    current.state === 'pre' &&
    !current.postponed &&
    reminderMinutes > 0 &&
    reminded !== current.id
  ) {
    const untilKickoff = Date.parse(current.kickoff) - now;
    if (untilKickoff <= reminderMinutes * 60_000 && untilKickoff > -REMINDER_GRACE_MS) {
      events.push({
        key: TRIGGERS.GAME_SOON,
        match: current,
        minutes: Math.max(0, Math.round(untilKickoff / 60_000)),
      });
      reminded = current.id;
    }
  }

  // Baseline: nothing to compare with.
  if (previous === undefined) {
    return { events, remindedFor: reminded };
  }

  const sameGame = previous !== null && previous.id === current.id;

  if (!sameGame) {
    // Another game took the place of the previous one. Seen already under
    // way, it still started; seen already finished, it is not news.
    if (current.state === 'in') {
      events.push({ key: TRIGGERS.GAME_STARTED, match: current });
    }
    return { events, remindedFor: reminded };
  }

  if (previous.state === 'pre' && current.state === 'in') {
    events.push({ key: TRIGGERS.GAME_STARTED, match: current });
  }

  // A lead change: one side was ahead, now the other one is. Going through a
  // tie is not a change of leader yet, and the first basket after 0-0 takes
  // a lead nobody had: not a change either.
  if (previous.state === 'in' && current.state === 'in') {
    const before = previous.lastLeader ?? lastAhead(previous);
    const after = leaderOf(current);
    if (before && after !== 'tied' && after !== before) {
      events.push({ key: TRIGGERS.LEAD_CHANGED, match: current });
    }
  }

  if (previous.state !== 'post' && current.state === 'post' && current.completed) {
    events.push({ key: TRIGGERS.GAME_ENDED, match: current });
  }

  return { events, remindedFor: reminded };
}

function lastAhead(match) {
  const leader = leaderOf(match);
  return leader === 'tied' ? null : leader;
}

/**
 * The reading to remember, with the last side that was ahead (`lastLeader`),
 * so that "team leads, tie, team leads again" is no lead change.
 */
export function rememberLeader(previous, current) {
  if (!current || current.state !== 'in') {
    return current;
  }
  const sameGame = previous && previous.id === current.id;
  const lastLeader = lastAhead(current) ?? (sameGame ? (previous.lastLeader ?? null) : null);
  return { ...current, lastLeader };
}
