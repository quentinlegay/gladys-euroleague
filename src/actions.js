// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
//
//   - test_teams  read the API now and say, club by club, what is followed
//                 and why an entry is not;
//   - find_team   list the clubs of a competition with the exact code to
//                 paste in the Teams field, filtered by a search word.
//
// The resolved message (multi-language object) is shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { COMPETITIONS, DEFAULT_COMPETITION, parseCompetition } from './competitions.js';
import { formatLast, formatNext, formatStatus, multilingual } from './format.js';

const logger = createLogger({ name: 'actions' });

// A message under a button stays readable up to a few dozen lines.
const MAX_FOUND = 40;

const REASONS = {
  format: {
    en: 'write the club code, e.g. PAN, or U:BES for a EuroCup club',
    fr: 'écrivez le code du club, par ex. PAN, ou U:BES pour un club d’EuroCup',
  },
  competition: {
    en: 'unknown competition: E (EuroLeague) or U (EuroCup)',
    fr: 'compétition inconnue : E (EuroLeague) ou U (EuroCup)',
  },
  duplicate: {
    en: 'written twice',
    fr: 'écrite deux fois',
  },
  limit: {
    en: 'too many clubs (20 at most)',
    fr: 'trop de clubs (20 au plus)',
  },
  not_found: {
    en: 'no such club this season, use "Find a team"',
    fr: 'club absent de cette saison, utilisez « Trouver une équipe »',
  },
  unreachable: {
    en: 'the Euroleague API did not answer, try again later',
    fr: 'l’API Euroleague n’a pas répondu, réessayez plus tard',
  },
};

const FOUND = {
  en: (count, competition) => `${count} club(s) in ${competition}, code to copy into Teams:`,
  fr: (count, competition) =>
    `${count} club(s) en ${competition}, code à copier dans le champ Équipes :`,
};

const MORE = {
  en: (more) => `… and ${more} more, narrow the search.`,
  fr: (more) => `… et ${more} autres, affinez la recherche.`,
};

const RECORD = {
  en: (record) => `${record.wins} W – ${record.losses} L`,
  fr: (record) => `${record.wins} V – ${record.losses} D`,
};

function describeTeam(tracked, config, language) {
  const { spec } = tracked;
  if (!tracked.info) {
    const reason = REASONS[tracked.resolveError ?? 'unreachable'][language];
    return `${spec.entry}: ${reason}`;
  }
  const head = `${tracked.info.name} (${spec.competitionName})`;
  if (tracked.reachable === false) {
    return `${head}: ${REASONS.unreachable[language]}`;
  }
  const settings = { ...config, language };
  return [
    `${head}: ${formatStatus(tracked.match ?? null, settings)}`,
    ...(tracked.record ? [`  ${RECORD[language](tracked.record)}`] : []),
    ...(tracked.last && tracked.last.id !== tracked.match?.id
      ? [`  ${formatLast(tracked.last, language)}`]
      : []),
    ...(tracked.next && tracked.next.id !== tracked.match?.id
      ? [`  ${formatNext(tracked.next, settings)}`]
      : []),
  ].join('\n');
}

/** Handler of `test_teams`. */
export async function testTeams(tracker) {
  logger.info('Action test_teams -> reading the Euroleague API now');
  await tracker.refresh();
  const teams = tracker.list();
  if (teams.length === 0 && tracker.parseErrors.length === 0) {
    return {
      en: 'No club to follow yet: write one in the Teams field, e.g. PAN, MAD.',
      fr: 'Aucun club à suivre : écrivez-en un dans le champ Équipes, par ex. PAN, MAD.',
    };
  }
  const build = (language) =>
    [
      ...teams.map((t) => describeTeam(t, tracker.config, language)),
      ...tracker.parseErrors.map((err) => `${err.entry}: ${REASONS[err.reason][language]}`),
    ].join('\n');
  return multilingual(build);
}

function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Handler of `find_team`. */
export async function findTeams(tracker, fields) {
  const competition = parseCompetition(fields.competition ?? DEFAULT_COMPETITION);
  if (!competition) {
    const known = Object.keys(COMPETITIONS).join(', ');
    return {
      en: `Unknown competition "${fields.competition}". Known codes: ${known}.`,
      fr: `Compétition « ${fields.competition} » inconnue. Codes connus : ${known}.`,
    };
  }
  logger.info(`Action find_team <- ${competition.code} "${fields.search ?? ''}"`);
  const clubs = await tracker.clubsList(competition.code);
  if (!clubs) {
    return { ...REASONS.unreachable };
  }
  const search = normalize(fields.search).trim();
  const found = clubs
    .filter(
      (club) =>
        !search ||
        [club.name, club.shortName, club.code, club.tvCode].some((value) =>
          normalize(value).includes(search),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (found.length === 0) {
    return {
      en: `No club of ${competition.name} matches "${fields.search}".`,
      fr: `Aucun club de ${competition.name} ne correspond à « ${fields.search} ».`,
    };
  }
  // A EuroCup club needs its prefix, unless EuroCup is the default competition.
  const prefix =
    competition.code === (tracker.config?.competition ?? DEFAULT_COMPETITION)
      ? ''
      : `${competition.code}:`;
  const lines = found.slice(0, MAX_FOUND).map((club) => `${prefix}${club.code} — ${club.name}`);
  const more = found.length - lines.length;
  return multilingual((language) =>
    [
      FOUND[language](found.length, competition.name),
      ...lines,
      ...(more > 0 ? [MORE[language](more)] : []),
    ].join('\n'),
  );
}
