// -----------------------------------------------------------------------------
// Euroleague API JSON -> the shapes the integration works with.
//
//   Club   { code, name, shortName, tvCode, crest }
//   Game   one entry of the season schedule, both sides (local / road)
//   Match  one game seen from a followed club: its side first, the state
//          (pre, in, post), the result once played
//
// The API is undocumented and its fields come and go: every reader here
// tolerates a missing field and never throws on a partial answer.
// -----------------------------------------------------------------------------

// A game not marked as played this long after its tip-off is late, postponed
// or not updated: it is not "live" any more.
export const LIVE_WINDOW = 4 * 60 * 60 * 1000;

function list(json) {
  if (Array.isArray(json)) {
    return json;
  }
  return Array.isArray(json?.data) ? json.data : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function score(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function parseClub(raw) {
  const code = text(raw?.code).toUpperCase();
  if (!code) {
    return null;
  }
  const name = text(raw.name) || code;
  return {
    code,
    name,
    // "Olympiacos", "Efes", "Real Madrid": what a fan calls the club.
    shortName: text(raw.editorialName) || text(raw.abbreviatedName) || name,
    tvCode: text(raw.tvCode).toUpperCase() || code,
    crest: text(raw.images?.crest) || null,
  };
}

/** Clubs of a season (the `clubs` endpoint). */
export function parseClubs(json) {
  return list(json)
    .map(parseClub)
    .filter((club) => club && club.code);
}

/**
 * The club the user means: its code (PAN), else its TV code (PAO), else its
 * short or full name.
 * @returns {{ club?: object, error?: 'not_found' }}
 */
export function findClub(clubs, entry) {
  const wanted = String(entry ?? '')
    .trim()
    .toUpperCase();
  const club =
    clubs.find((c) => c.code === wanted) ??
    clubs.find((c) => c.tvCode === wanted) ??
    clubs.find((c) => c.shortName.toUpperCase() === wanted || c.name.toUpperCase() === wanted);
  return club ? { club } : { error: 'not_found' };
}

function parseSide(raw) {
  const club = parseClub(raw?.club);
  if (!club) {
    return null;
  }
  return { ...club, score: score(raw.score) };
}

function kickoffOf(raw) {
  // `utcDate` carries the zone; `date` is the local time of the arena.
  for (const value of [raw.utcDate, raw.date]) {
    const iso = text(value);
    if (iso && !Number.isNaN(Date.parse(iso))) {
      return new Date(iso).toISOString();
    }
  }
  return null;
}

/** Games of a season (the `games` endpoint), oldest first. */
export function parseGames(json) {
  return list(json)
    .map((raw) => {
      const local = parseSide(raw?.local);
      const road = parseSide(raw?.road);
      const kickoff = kickoffOf(raw ?? {});
      const gameCode = Number(raw?.gameCode);
      if (!local || !road || !kickoff || !Number.isInteger(gameCode)) {
        return null;
      }
      const season = text(raw.season?.code);
      return {
        id: text(raw.identifier) || `${season}_${gameCode}`,
        season,
        gameCode,
        kickoff,
        played: raw.played === true,
        status: text(raw.gameStatus),
        round: text(raw.roundAlias) || (raw.round ? `Round ${raw.round}` : ''),
        phase: text(raw.phaseType?.name),
        venue: text(raw.venue?.name),
        local,
        road,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

function isPostponed(game) {
  return /POSTPON|CANCEL|SUSPEND|DELAY/i.test(game.status);
}

function sideView({ code, name, shortName, score: points }) {
  return { code, name, abbreviation: shortName, score: points };
}

function resultOf(match) {
  return match.team.score > match.opponent.score ? 'win' : 'loss';
}

/**
 * A game seen from the club `clubCode`.
 * @returns {Match}
 *
 * @typedef {object} Match
 * @property {string} id
 * @property {number} gameCode
 * @property {string} season
 * @property {string} kickoff ISO date
 * @property {'pre' | 'in' | 'post'} state
 * @property {boolean} completed played to the end (a result exists)
 * @property {boolean} postponed
 * @property {'home' | 'away'} homeAway
 * @property {{ code: string, name: string, abbreviation: string, score: number }} team
 * @property {{ code: string, name: string, abbreviation: string, score: number }} opponent
 * @property {'win' | 'loss' | null} result basketball has no draw
 * @property {number | null} period 1-4, 5+ for overtimes, while live
 * @property {string} clock remaining time of the period while live, "05:23"
 * @property {string} round
 * @property {string} phase
 * @property {string} venue
 */
export function matchFor(game, clubCode) {
  const home = game.local.code === clubCode;
  const match = {
    id: game.id,
    gameCode: game.gameCode,
    season: game.season,
    kickoff: game.kickoff,
    state: game.played ? 'post' : 'pre',
    completed: game.played,
    postponed: !game.played && isPostponed(game),
    homeAway: home ? 'home' : 'away',
    team: sideView(home ? game.local : game.road),
    opponent: sideView(home ? game.road : game.local),
    result: null,
    period: null,
    clock: '',
    round: game.round,
    phase: game.phase,
    venue: game.venue,
  };
  if (match.completed) {
    match.result = resultOf(match);
  }
  return match;
}

/**
 * The games of a club that matter now.
 * @returns {{ ongoing: Game | null, last: Game | null, next: Game | null,
 *   wins: number, losses: number }}
 *   ongoing: tipped off, not marked as played yet (live, or just over);
 *   last: the latest played game; next: the first game still to come.
 */
export function clubGames(games, clubCode, now) {
  const own = games.filter((g) => g.local.code === clubCode || g.road.code === clubCode);
  let last = null;
  let ongoing = null;
  let next = null;
  let wins = 0;
  let losses = 0;
  for (const game of own) {
    const since = now - Date.parse(game.kickoff);
    if (game.played) {
      last = game;
      const match = matchFor(game, clubCode);
      if (match.result === 'win') {
        wins += 1;
      } else {
        losses += 1;
      }
    } else if (since >= 0 && since < LIVE_WINDOW && !isPostponed(game)) {
      ongoing ??= game;
    } else if (since < 0) {
      next ??= game;
    }
  }
  return { ongoing, last, next, wins, losses };
}

/**
 * The live `Header` feed of one game.
 * @returns {{ live: boolean, localScore: number, roadScore: number,
 *   period: number | null, clock: string }}
 */
export function parseHeader(json) {
  const period = Number(json?.Quarter ?? json?.quarter);
  const clock = text(json?.RemainingPartialTime ?? json?.remainingPartialTime);
  return {
    live: json?.Live === true || json?.live === true,
    localScore: score(json?.ScoreA ?? json?.scoreA),
    roadScore: score(json?.ScoreB ?? json?.scoreB),
    period: Number.isInteger(period) && period > 0 ? period : null,
    clock: /^\d{1,2}:\d{2}$/.test(clock) ? clock : '',
  };
}

/**
 * The match of an ongoing game, updated with its live header: `in` while the
 * feed says live, `post` once it stopped with points on the board (the
 * schedule marks a game as played some time after the final buzzer), `pre`
 * otherwise (a late tip-off).
 */
export function applyHeader(match, header) {
  const home = match.homeAway === 'home';
  const team = home ? header.localScore : header.roadScore;
  const opponent = home ? header.roadScore : header.localScore;
  const scored = team + opponent > 0;
  if (!header.live && !scored) {
    return match;
  }
  const updated = {
    ...match,
    team: { ...match.team, score: team },
    opponent: { ...match.opponent, score: opponent },
  };
  // A basketball game never ends tied: a stopped feed on a tied score is a
  // break (or a stale feed), the game is still on.
  if (header.live || team === opponent) {
    return { ...updated, state: 'in', period: header.period, clock: header.clock };
  }
  const done = { ...updated, state: 'post', completed: true, period: null, clock: '' };
  return { ...done, result: resultOf(done) };
}
