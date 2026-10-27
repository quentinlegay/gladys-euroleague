// -----------------------------------------------------------------------------
// Human texts about a game, in English or French.
//
// A device `text` feature holds ONE string, so the texts published on the
// devices follow the `language` of the configuration. The widgets and the
// action messages are multi-language objects ({ en, fr }) the core picks from
// (English when the reader's language is neither).
// -----------------------------------------------------------------------------

/** Every language this integration writes, English first (the fallback). */
export const LANGUAGES = ['en', 'fr'];

const LOCALES = { en: 'en-GB', fr: 'fr-FR' };

const WORDS = {
  en: {
    live: 'Live',
    final: 'Final',
    next: 'Next',
    postponed: 'Postponed',
    noGame: 'No game scheduled',
    vs: 'vs',
    at: 'at',
    win: 'Win',
    loss: 'Loss',
    quarter: 'Q',
    overtime: 'OT',
    halftime: 'Halftime',
  },
  fr: {
    live: 'En direct',
    final: 'Terminé',
    next: 'Prochain match',
    postponed: 'Reporté',
    noGame: 'Aucun match prévu',
    vs: 'contre',
    at: 'à',
    win: 'Victoire',
    loss: 'Défaite',
    quarter: 'QT',
    overtime: 'Prol.',
    halftime: 'Mi-temps',
  },
};

export function words(language) {
  return WORDS[language] ?? WORDS.en;
}

/** "Thu 30 Oct, 20:45" / "jeu. 30 oct., 20:45", in the configured time zone. */
export function formatKickoff(iso, language, timezone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

/** "Panathinaikos 85 – 78 Real Madrid", always the followed club first. */
export function formatScore(match) {
  return `${match.team.abbreviation} ${match.team.score} – ${match.opponent.score} ${match.opponent.abbreviation}`;
}

/** "vs Real Madrid" at home, "at Real Madrid" away. */
export function formatOpponent(match, language) {
  const w = words(language);
  return `${match.homeAway === 'away' ? w.at : w.vs} ${match.opponent.abbreviation}`;
}

/** The live clock: "Q3 05:23", "OT1 02:10", "Halftime"; empty when unknown. */
export function formatClock(match, language) {
  const w = words(language);
  const { period, clock } = match;
  if (!period) {
    return '';
  }
  if (period === 2 && clock === '00:00') {
    return w.halftime;
  }
  const label = period > 4 ? `${w.overtime}${period - 4}` : `${w.quarter}${period}`;
  return clock ? `${label} ${clock}` : label;
}

export function formatResult(result, language) {
  return result ? words(language)[result] : '';
}

/**
 * One line telling where the club stands in a game: the status text of the
 * device, the summary of the scene events and of the `get_match` action.
 */
export function formatStatus(match, { language, timezone }) {
  const w = words(language);
  if (!match) {
    return w.noGame;
  }
  if (match.state === 'in') {
    const clock = formatClock(match, language);
    return [w.live, clock, formatScore(match)].filter(Boolean).join(' · ');
  }
  if (match.state === 'post') {
    return `${w.final} · ${formatScore(match)} · ${formatResult(match.result, language)}`;
  }
  if (match.postponed) {
    return `${w.postponed} · ${match.team.abbreviation} ${formatOpponent(match, language)}`;
  }
  return `${w.next} · ${formatKickoff(match.kickoff, language, timezone)} · ${formatOpponent(match, language)}`;
}

/** The "next game" line: kickoff and opponent, or "No game scheduled". */
export function formatNext(match, { language, timezone }) {
  if (!match) {
    return words(language).noGame;
  }
  const when = match.postponed
    ? words(language).postponed
    : formatKickoff(match.kickoff, language, timezone);
  return `${when} · ${formatOpponent(match, language)}`;
}

/** The "last result" line: "Win · Panathinaikos 85 – 78 Real Madrid". */
export function formatLast(match, language) {
  if (!match) {
    return words(language).noGame;
  }
  return `${formatResult(match.result, language)} · ${formatScore(match)}`;
}

/** Every language at once, for the widgets and the action messages. */
export function multilingual(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}
