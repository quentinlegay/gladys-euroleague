// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
//   - team_match  one followed club, chosen in the widget settings: the score
//                 (live tiles bound to the device features), the clock, the
//                 tip-off, the next game, the season record and a Refresh
//                 button;
//   - my_teams    every followed club in one list, with its crest and a badge
//                 (LIVE, the result, or NEXT).
//
// The content is declarative, rendered by the core with its own theme. The
// tracker nudges both widgets (requestWidgetRefresh) whenever something shown
// changed; the TTL is only a safety net.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  formatClock,
  formatKickoff,
  formatLast,
  formatNext,
  formatResult,
  formatStatus,
  multilingual,
} from './format.js';
import { FEATURE, teamExternalIds } from './devices/team.js';

const logger = createLogger({ name: 'widgets' });

export const TEAM_MATCH_WIDGET = 'team_match';
export const MY_TEAMS_WIDGET = 'my_teams';
export const WIDGET_KEYS = [TEAM_MATCH_WIDGET, MY_TEAMS_WIDGET];

const REFRESH_ACTION = 'refresh';
const LIVE_TTL = 30;
const IDLE_TTL = 600;
// A `list` card-list shows 8 rows at most.
const MAX_LIST_ITEMS = 8;
// The core refuses a widget image above this size.
const MAX_IMAGE_BYTES = 300 * 1024;

// "(home)" / "(away)" after the opponent's name.
const HOME_AWAY = {
  en: { home: 'home', away: 'away' },
  fr: { home: 'domicile', away: 'extérieur' },
};

// Image keys: `^[a-z0-9][a-z0-9-]{0,63}$`. The club code is the variable
// part; the competition keeps a EuroLeague and a EuroCup crest apart.
export function crestKey(tracked) {
  const raw = `crest-${tracked.spec.competition}-${tracked.info.code}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 64);
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function both(build, max) {
  return Object.fromEntries(
    Object.entries(multilingual(build)).map(([language, text]) => [language, clip(text, max)]),
  );
}

function badge(match) {
  if (!match) {
    return undefined;
  }
  if (match.state === 'in') {
    return { text: { en: 'LIVE', fr: 'DIRECT' }, color: WIDGET_COLORS.DANGER };
  }
  if (match.state === 'post' && match.completed) {
    const color = match.result === 'win' ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER;
    return { text: multilingual((language) => formatResult(match.result, language)), color };
  }
  if (match.state === 'pre') {
    return { text: { en: 'NEXT', fr: 'À VENIR' }, color: WIDGET_COLORS.INFO };
  }
  return undefined;
}

function stateRow(match) {
  if (match.state === 'in') {
    return {
      label: { en: 'Live', fr: 'En direct' },
      icon: 'activity',
      value: both((language) => formatClock(match, language) || '—', 40),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (match.state === 'post') {
    return {
      label: { en: 'Result', fr: 'Résultat' },
      icon: 'flag',
      value: both((language) => formatResult(match.result, language), 40),
      color: badge(match)?.color ?? WIDGET_COLORS.NEUTRAL,
    };
  }
  return {
    label: { en: 'Status', fr: 'Statut' },
    icon: 'clock',
    value: match.postponed
      ? { en: 'Postponed', fr: 'Reporté' }
      : { en: 'Scheduled', fr: 'Programmé' },
    color: match.postponed ? WIDGET_COLORS.WARNING : WIDGET_COLORS.INFO,
  };
}

function refreshButton() {
  return {
    type: 'button',
    label: { en: 'Refresh', fr: 'Actualiser' },
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: REFRESH_ACTION },
  };
}

function recordRow(record) {
  return {
    label: { en: 'Season', fr: 'Saison' },
    icon: 'bar-chart-2',
    value: {
      en: `${record.wins} W – ${record.losses} L`,
      fr: `${record.wins} V – ${record.losses} D`,
    },
    color: WIDGET_COLORS.NEUTRAL,
  };
}

function teamMatchContent(gladys, tracked, config) {
  const { match, next, last, record } = tracked;
  const name = tracked.info.name;
  if (!match) {
    return {
      ttl_seconds: IDLE_TTL,
      components: [
        { type: 'text', variant: 'heading', text: clip(name, 40) },
        {
          type: 'status',
          items: [
            {
              label: { en: 'Status', fr: 'Statut' },
              icon: 'calendar',
              value: { en: 'No game scheduled', fr: 'Aucun match prévu' },
              color: WIDGET_COLORS.NEUTRAL,
            },
            ...(record ? [recordRow(record)] : []),
          ],
        },
        refreshButton(),
      ],
    };
  }

  const ids = teamExternalIds(gladys, tracked.spec.competition, tracked.info.code);
  const created = (gladys.devices ?? []).some((device) => device.external_id === ids.device);
  const started = match.state !== 'pre';
  const heading = started
    ? `${match.team.abbreviation} ${match.team.score} – ${match.opponent.score} ${match.opponent.abbreviation}`
    : `${match.team.abbreviation} – ${match.opponent.abbreviation}`;
  const caption = [tracked.spec.competitionName, match.round, match.venue]
    .filter(Boolean)
    .join(' · ');

  // Live tiles follow the published states in real time, but only exist once
  // the user created the device; before that, the scores are plain values.
  const tile = (feature, label, score) =>
    created
      ? {
          type: 'value',
          label: clip(label, 24),
          icon: 'award',
          device_feature: ids.feature(feature),
        }
      : { type: 'value', label: clip(label, 24), icon: 'award', value: score };

  const items = [
    stateRow(match),
    {
      label: { en: 'Tip-off', fr: 'Coup d’envoi' },
      icon: 'calendar',
      value: both((language) => formatKickoff(match.kickoff, language, config.timezone), 40),
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      label: { en: 'Opponent', fr: 'Adversaire' },
      icon: match.homeAway === 'home' ? 'home' : 'navigation',
      value: both(
        (language) =>
          `${match.opponent.name} (${HOME_AWAY[language][match.homeAway === 'home' ? 'home' : 'away']})`,
        40,
      ),
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (last && last.id !== match.id) {
    items.push({
      label: { en: 'Last result', fr: 'Dernier résultat' },
      icon: 'flag',
      value: both((language) => formatLast(last, language), 40),
      color: last.result === 'win' ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    });
  }
  if (next && next.id !== match.id) {
    items.push({
      label: { en: 'Next game', fr: 'Prochain match' },
      icon: 'clock',
      value: both((language) => formatNext(next, { ...config, language }), 40),
      color: WIDGET_COLORS.INFO,
    });
  }
  if (record) {
    items.push(recordRow(record));
  }

  return {
    ttl_seconds: match.state === 'in' ? LIVE_TTL : IDLE_TTL,
    components: [
      { type: 'text', variant: 'heading', text: clip(heading, 40) },
      ...(caption ? [{ type: 'text', variant: 'caption', text: clip(caption, 80) }] : []),
      ...(started
        ? [
            tile(FEATURE.TEAM_SCORE, match.team.abbreviation || name, match.team.score),
            tile(FEATURE.OPPONENT_SCORE, match.opponent.abbreviation, match.opponent.score),
          ]
        : []),
      { type: 'status', items },
      refreshButton(),
    ],
  };
}

function myTeamsContent(tracker, config) {
  const teams = tracker.list().filter((t) => t.info);
  if (teams.length === 0) {
    return {
      ttl_seconds: IDLE_TTL,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'No club followed yet: add some in the integration configuration.',
            fr: 'Aucun club suivi : ajoutez-en dans la configuration de l’intégration.',
          },
        },
      ],
    };
  }
  // What matters now first: live games, then the next tip-offs.
  const rank = (t) => (t.match?.state === 'in' ? 0 : t.match?.state === 'pre' ? 1 : 2);
  const sorted = [...teams].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Date.parse(a.match?.kickoff ?? 0) - Date.parse(b.match?.kickoff ?? 0) ||
      a.info.name.localeCompare(b.info.name),
  );
  const live = teams.some((t) => t.match?.state === 'in');
  return {
    ttl_seconds: live ? LIVE_TTL : IDLE_TTL,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: sorted.slice(0, MAX_LIST_ITEMS).map((t) => {
          const item = {
            title: clip(t.info.name, 60),
            subtitle: both(
              (language) => formatStatus(t.match ?? null, { ...config, language }),
              60,
            ),
          };
          if (t.info.crest) {
            item.image = crestKey(t);
          }
          const mark = badge(t.match);
          if (mark) {
            item.badge = mark;
          }
          return item;
        }),
      },
      refreshButton(),
    ],
  };
}

/**
 * The widget handlers, keyed by the manifest `widgets` keys. Each exposes
 * get(gladys, { settings, language, units, config }) and
 * action(gladys, { actionKey, params, settings, config }).
 */
export function createWidgets(tracker) {
  async function refreshAction(actionKey) {
    if (actionKey !== REFRESH_ACTION) {
      // Throwing acks the action as failed: the message reaches the user.
      throw new Error(`Unknown widget action: ${actionKey}`);
    }
    await tracker.refresh();
    return { en: 'Scores refreshed', fr: 'Scores actualisés' };
  }

  return {
    [TEAM_MATCH_WIDGET]: {
      async get(gladys, { settings, config }) {
        logger.debug(`onWidgetGet <- ${TEAM_MATCH_WIDGET} ${settings?.team}`);
        const tracked = tracker.findByDevice(settings?.team);
        if (!tracked) {
          return {
            ttl_seconds: IDLE_TTL,
            components: [
              {
                type: 'text',
                variant: 'body',
                text: {
                  en: 'Pick a followed club in the settings of this widget.',
                  fr: 'Choisissez un club suivi dans les réglages de ce widget.',
                },
              },
            ],
          };
        }
        return teamMatchContent(gladys, tracked, config);
      },
      action: (_gladys, { actionKey }) => refreshAction(actionKey),
    },
    [MY_TEAMS_WIDGET]: {
      async get(_gladys, { config }) {
        logger.debug(`onWidgetGet <- ${MY_TEAMS_WIDGET}`);
        return myTeamsContent(tracker, config);
      },
      action: (_gladys, { actionKey }) => refreshAction(actionKey),
    },
  };
}

/**
 * The crest behind an image key of the `my_teams` list, as raw base64 (the
 * core caches it one hour by key).
 */
export async function widgetImage(tracker, client, imageKey) {
  const tracked = tracker.list().find((t) => t.info?.crest && crestKey(t) === imageKey);
  if (!tracked) {
    throw new Error(`Unknown image ${imageKey}`);
  }
  const image = await client.crest(tracked.info.crest);
  if (image.length > MAX_IMAGE_BYTES) {
    throw new Error(`Crest of ${tracked.info.name} too large (${image.length} bytes)`);
  }
  return image.toString('base64');
}

/**
 * Freshness nudge: ask the core to re-pull every widget NOW. Rate-limited
 * core-side (1 per 10 s per widget) and dropped while disconnected, so it is
 * also sent after every (re)connection.
 */
export function refreshWidgets(gladys) {
  for (const key of WIDGET_KEYS) {
    gladys.requestWidgetRefresh(key);
  }
}
