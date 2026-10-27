// -----------------------------------------------------------------------------
// The competitions the integration follows, and their seasons.
//
// Euroleague Basketball runs two competitions on the same API, told apart by
// a one-letter code: E (Turkish Airlines EuroLeague) and U (BKT EuroCup). A
// season is named after the year it starts: the 2026-27 season is "E2026".
//
// The codes are stored by users (in the Teams field, in the external ids of
// the devices): never rename them.
// -----------------------------------------------------------------------------

export const COMPETITIONS = {
  E: { code: 'E', name: 'EuroLeague' },
  U: { code: 'U', name: 'EuroCup' },
};

export const DEFAULT_COMPETITION = 'E';

/** The competition behind a code ("E", "u", "EuroCup"…), or null. */
export function parseCompetition(text) {
  const value = String(text ?? '')
    .trim()
    .toUpperCase();
  if (COMPETITIONS[value]) {
    return COMPETITIONS[value];
  }
  return Object.values(COMPETITIONS).find((c) => c.name.toUpperCase() === value) ?? null;
}

// A season starts on July 1st (the `startDate` the API gives every season):
// the summer belongs to the coming season, whose schedule is published in
// August.
const SEASON_START_MONTH = 6; // July, 0-based

/** Start year of the season running at `now` (ms). */
export function seasonYear(now) {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= SEASON_START_MONTH ? year : year - 1;
}

/** "E2026" */
export function seasonCode(competition, year) {
  return `${competition}${year}`;
}
