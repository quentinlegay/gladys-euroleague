// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults,
// normalizes the received object (a form may send numbers as strings) and
// parses the list of followed teams.
// -----------------------------------------------------------------------------

import { DEFAULT_COMPETITION, parseCompetition } from './competitions.js';
import { LANGUAGES } from './format.js';

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  teams: '', // "PAN, MAD, U:BES" — see parseTeams()
  competition: DEFAULT_COMPETITION, // competition of the entries without a prefix
  language: 'en', // language of the texts published on the devices
  timezone: 'Europe/Paris', // tip-off times are written in this time zone
  reminder_minutes: 30, // "game starting soon" trigger, 0 = never
  live_refresh: 30, // seconds between two reads while a game is live
  idle_refresh: 15, // minutes between two reads when nothing is live
};

// A EuroLeague season has 20 clubs, a EuroCup one 20 more: 20 entries cover
// any realistic follow list without hammering a free API.
export const MAX_TEAMS = 20;

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function validTimezone(value) {
  const zone = String(value ?? '').trim();
  if (!zone) {
    return DEFAULT_CONFIG.timezone;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_CONFIG.timezone;
  }
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    teams: String(raw.teams ?? DEFAULT_CONFIG.teams),
    competition: parseCompetition(raw.competition)?.code ?? DEFAULT_CONFIG.competition,
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
    timezone: validTimezone(raw.timezone),
    reminder_minutes: clampNumber(raw.reminder_minutes, DEFAULT_CONFIG.reminder_minutes, 0, 1440),
    live_refresh: clampNumber(raw.live_refresh, DEFAULT_CONFIG.live_refresh, 15, 300),
    idle_refresh: clampNumber(raw.idle_refresh, DEFAULT_CONFIG.idle_refresh, 5, 120),
  };
}

/**
 * Parse the followed teams: entries separated by commas, semicolons or line
 * breaks, each a club code (PAN, MAD, ULK…), optionally prefixed by the
 * competition (`U:BES` for a EuroCup club). Without a prefix, the entry
 * belongs to `defaultCompetition`.
 *
 * @param {string} text
 * @param {string} [defaultCompetition]
 * @returns {{ teams: Array<{ entry: string, competition: string,
 *   competitionName: string, club: string }>,
 *   errors: Array<{ entry: string, reason: 'format' | 'competition' | 'duplicate' | 'limit' }> }}
 */
export function parseTeams(text, defaultCompetition = DEFAULT_COMPETITION) {
  const teams = [];
  const errors = [];
  const seen = new Set();
  for (const raw of String(text ?? '').split(/[,;\n]/)) {
    const entry = raw.trim();
    if (!entry) {
      continue;
    }
    const separator = entry.lastIndexOf(':');
    const prefix = separator >= 0 ? entry.slice(0, separator).trim() : defaultCompetition;
    const club = (separator >= 0 ? entry.slice(separator + 1) : entry).trim().toUpperCase();
    if (!/^[A-Z0-9]{2,5}$/.test(club)) {
      errors.push({ entry, reason: 'format' });
      continue;
    }
    const competition = parseCompetition(prefix);
    if (!competition) {
      errors.push({ entry, reason: 'competition' });
      continue;
    }
    const key = `${competition.code}:${club}`;
    if (seen.has(key)) {
      errors.push({ entry, reason: 'duplicate' });
      continue;
    }
    if (teams.length >= MAX_TEAMS) {
      errors.push({ entry, reason: 'limit' });
      continue;
    }
    seen.add(key);
    teams.push({
      entry,
      competition: competition.code,
      competitionName: competition.name,
      club,
    });
  }
  return { teams, errors };
}
