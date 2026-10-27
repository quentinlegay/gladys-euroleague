// -----------------------------------------------------------------------------
// The tracker: reads the Euroleague API for every followed club, publishes
// the devices and their states, fires the scene events, and decides when to
// read again.
//
// One reading ("cycle") per competition and per wake-up: the season schedule
// serves every followed club of the competition at once. A game that has
// tipped off but is not marked as played yet is read from the live `Header`
// feed — one small request per game, shared by the two clubs if both are
// followed.
//
// The pace follows the games, not a fixed poll: `live_refresh` seconds while
// a game is live (or its tip-off has passed), otherwise `idle_refresh`
// minutes — shortened to wake exactly at the tip-off reminder and at the
// tip-off. While live, the (large) schedule is re-read every few minutes
// only: the live feed carries the scores. Gladys' own polling is not used:
// its frequencies are a fixed enum.
//
// Readings never overlap: a manual refresh (widget button, Test action)
// during a cycle joins it instead of starting another one.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { COMPETITIONS, seasonCode, seasonYear } from './competitions.js';
import { parseTeams } from './config.js';
import {
  LIVE_WINDOW,
  applyHeader,
  clubGames,
  findClub,
  matchFor,
  parseClubs,
  parseGames,
  parseHeader,
} from './euroleague/parse.js';
import { detectEvents, eventData, rememberLeader } from './events.js';
import { formatStatus } from './format.js';
import { buildTeamDevice, teamExternalIds, teamStates } from './devices/team.js';

const logger = createLogger({ name: 'tracker' });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// The clubs of a season are known before it starts: one read a day is plenty.
const CLUBS_TTL = 24 * HOUR;
// The schedule while a game is live (the live feed carries its score), and
// the shortest interval between two reads otherwise (manual refreshes).
const GAMES_TTL_LIVE = 5 * MINUTE;
const GAMES_TTL_MIN = MINUTE;
// A finished game stays the "current" one this long after its tip-off, so
// the evening's result is still on the dashboard the next morning.
const RECENT_RESULT = 14 * HOUR;
// Gladys marks a value older than 48 h as outdated: republish the unchanged
// ones well before.
const REPUBLISH_AFTER = 6 * HOUR;
const MIN_DELAY = 15_000;
const MAX_TRANSPORTS_PER_REQUEST = 100;

function entryKey(spec) {
  return `${spec.competition}:${spec.club}`;
}

export class Tracker {
  /**
   * @param {object} deps
   * @param {object} deps.gladys   the SDK instance (or a fake)
   * @param {object} deps.client   Euroleague client (src/euroleague/client.js)
   * @param {object} [deps.store]  persistence (src/store.js)
   * @param {() => number} [deps.now]
   * @param {(fn: Function, ms: number) => unknown} [deps.setTimer]
   * @param {(handle: unknown) => void} [deps.clearTimer]
   * @param {() => void} [deps.onChange] something shown changed (widgets)
   */
  constructor({ gladys, client, store, now, setTimer, clearTimer, onChange }) {
    this.gladys = gladys;
    this.client = client;
    this.store = store;
    this.now = now ?? Date.now;
    this.setTimer = setTimer ?? setTimeout;
    this.clearTimer = clearTimer ?? clearTimeout;
    this.onChange = onChange ?? (() => {});

    this.config = null;
    this.parseErrors = [];
    /** @type {Map<string, object>} followed clubs, keyed by entryKey() */
    this.tracked = new Map();
    /** @type {Map<string, { clubs: object[], fetchedAt: number }>} per competition */
    this.clubLists = new Map();
    /** @type {Map<string, { games: object[], fetchedAt: number }>} per competition */
    this.schedules = new Map();
    /** @type {Map<string, string>} */
    this.transports = new Map();
    this.devicesSignature = null;
    this.saved = {};
    this.inflight = null;
    this.timer = null;
    this.running = false;
  }

  /** Read what the previous run remembered. Call once, at startup. */
  async load() {
    this.saved = (await this.store?.load()) ?? {};
    // Clubs configured before the load: fill what they do not know yet.
    for (const tracked of this.tracked.values()) {
      const saved = this.saved[tracked.key];
      if (!saved) {
        continue;
      }
      tracked.info ??= saved.info ?? null;
      if (tracked.match === undefined && 'match' in saved) {
        tracked.match = saved.match;
      }
      tracked.remindedFor ??= saved.remindedFor ?? null;
    }
  }

  /** Apply a (new) configuration. The next refresh() reads with it. */
  configure(config) {
    this.config = config;
    const { teams, errors } = parseTeams(config.teams, config.competition);
    this.parseErrors = errors;
    const next = new Map();
    for (const spec of teams) {
      const key = entryKey(spec);
      const kept = this.tracked.get(key);
      const saved = this.saved[key];
      next.set(
        key,
        kept
          ? { ...kept, spec }
          : {
              key,
              spec,
              info: saved?.info ?? null,
              // `undefined` = never read: the first reading is a baseline.
              match: saved && 'match' in saved ? saved.match : undefined,
              next: null,
              last: null,
              record: null,
              remindedFor: saved?.remindedFor ?? null,
              resolveError: null,
              reachable: null,
            },
      );
    }
    this.tracked = next;
    for (const err of errors) {
      logger.warn(`Ignored team entry "${err.entry}": ${err.reason}`);
    }
  }

  /** Followed clubs, in configuration order. */
  list() {
    return [...this.tracked.values()];
  }

  /** The followed club behind a device external id, or undefined. */
  findByDevice(externalId) {
    return this.list().find((t) => t.info && this.deviceId(t) === externalId);
  }

  deviceId(tracked) {
    return teamExternalIds(this.gladys, tracked.spec.competition, tracked.info.code).device;
  }

  /** Discovery payload: the resolved clubs. */
  buildDevices() {
    return this.list()
      .filter((t) => t.info)
      .map((t) => buildTeamDevice(this.gladys, t, this.config));
  }

  start() {
    this.running = true;
    return this.refresh();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /**
   * Forget what was published: after a reconnection Gladys may have missed
   * states, and a device created meanwhile has none yet.
   */
  resetPublished() {
    this.gladys.forgetPublishedStates();
    this.transports.clear();
    this.devicesSignature = null;
  }

  /**
   * Read now, then plan the next one. A reading in progress is joined; with
   * `fresh`, another one follows it (the configuration or the created devices
   * changed while it ran, so its result is already stale).
   */
  refresh({ fresh = false } = {}) {
    if (this.inflight && fresh) {
      return this.inflight.then(() => this.refresh());
    }
    if (!this.inflight) {
      this.inflight = this.cycle()
        .catch((err) => logger.error('Reading failed', err))
        .finally(() => {
          this.inflight = null;
          this.schedule();
        });
    }
    return this.inflight;
  }

  schedule() {
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.running) {
      return;
    }
    const delay = this.nextDelay();
    logger.debug(`Next reading in ${Math.round(delay / 1000)} s`);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.refresh();
    }, delay);
  }

  /** A game of this club is live, or its tip-off has passed and it is not over. */
  isLive(tracked, now = this.now()) {
    const { match } = tracked;
    if (!match || match.state === 'post' || match.postponed) {
      return false;
    }
    const sinceKickoff = now - Date.parse(match.kickoff);
    return match.state === 'in' || (sinceKickoff >= 0 && sinceKickoff < LIVE_WINDOW);
  }

  /** Milliseconds until the next reading. */
  nextDelay() {
    const now = this.now();
    const {
      live_refresh: liveSeconds,
      idle_refresh: idleMinutes,
      reminder_minutes: reminder,
    } = this.config;
    if (this.list().some((t) => this.isLive(t, now))) {
      return Math.max(MIN_DELAY, liveSeconds * 1000);
    }
    let delay = idleMinutes * MINUTE;
    for (const tracked of this.tracked.values()) {
      for (const match of [tracked.match, tracked.next]) {
        if (!match || match.state !== 'pre' || match.postponed) {
          continue;
        }
        const untilKickoff = Date.parse(match.kickoff) - now;
        if (untilKickoff > 0) {
          delay = Math.min(delay, untilKickoff);
          const untilReminder = untilKickoff - reminder * MINUTE;
          if (reminder > 0 && untilReminder > 0) {
            delay = Math.min(delay, untilReminder);
          }
        }
      }
    }
    return Math.max(MIN_DELAY, delay);
  }

  async cycle() {
    if (!this.config) {
      return;
    }
    const before = this.snapshot();
    const byCompetition = new Map();
    for (const tracked of this.tracked.values()) {
      const key = tracked.spec.competition;
      byCompetition.set(key, [...(byCompetition.get(key) ?? []), tracked]);
    }

    const events = [];
    for (const [competition, group] of byCompetition) {
      events.push(...(await this.readCompetition(competition, group)));
    }

    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.fireEvents(events);
    await this.reportStatus();

    const after = this.snapshot();
    if (after !== before) {
      await this.save();
      this.onChange();
    }
  }

  /**
   * A season list (clubs or games) of the current season, or of the previous
   * one while the new season is not published yet (the summer).
   */
  async seasonList(competition, read, parse) {
    const year = seasonYear(this.now());
    const current = parse(await read(competition, seasonCode(competition, year)));
    if (current.length > 0) {
      return current;
    }
    return parse(await read(competition, seasonCode(competition, year - 1)));
  }

  /** The clubs of a competition (cached a day), null when unreadable. */
  async clubsList(competition) {
    const cached = this.clubLists.get(competition);
    const now = this.now();
    if (cached && now - cached.fetchedAt < CLUBS_TTL) {
      return cached.clubs;
    }
    try {
      const clubs = await this.seasonList(
        competition,
        (c, s) => this.client.clubs(c, s),
        parseClubs,
      );
      this.clubLists.set(competition, { clubs, fetchedAt: now });
      return clubs;
    } catch (err) {
      logger.warn(`${competition}: club list unavailable (${err.message})`);
      return cached?.clubs ?? null;
    }
  }

  /**
   * The season schedule of a competition: `fresh` false when the read failed
   * and the cached one is served, null when there is none.
   * @returns {Promise<{ games: object[], fresh: boolean } | null>}
   */
  async gamesList(competition, live) {
    const cached = this.schedules.get(competition);
    const now = this.now();
    const ttl = live ? GAMES_TTL_LIVE : GAMES_TTL_MIN;
    if (cached && now - cached.fetchedAt < ttl) {
      return { games: cached.games, fresh: true };
    }
    try {
      const games = await this.seasonList(
        competition,
        (c, s) => this.client.games(c, s),
        parseGames,
      );
      this.schedules.set(competition, { games, fetchedAt: now });
      return { games, fresh: true };
    } catch (err) {
      logger.warn(`${competition}: schedule unavailable (${err.message})`);
      return cached ? { games: cached.games, fresh: false } : null;
    }
  }

  async readCompetition(competition, group) {
    const competitionName = COMPETITIONS[competition].name;

    // 1) Turn what the user typed into Euroleague clubs.
    if (group.some((t) => !t.info)) {
      const clubs = await this.clubsList(competition);
      for (const tracked of group.filter((t) => !t.info)) {
        if (!clubs) {
          tracked.resolveError = 'unreachable';
          continue;
        }
        let found = findClub(clubs, tracked.spec.club);
        // "PAN, PAO": the code and the TV code of the same club, one device.
        if (found.club && group.some((t) => t !== tracked && t.info?.code === found.club.code)) {
          found = { error: 'duplicate' };
        }
        const before = tracked.resolveError;
        tracked.resolveError = found.error ?? null;
        if (found.club) {
          tracked.info = found.club;
          logger.info(`${tracked.spec.entry} is ${found.club.name} (${competitionName})`);
        } else if (found.error !== before) {
          // Once per problem, not at every reading.
          logger.warn(`${tracked.spec.entry}: club ${found.error} in ${competitionName}`);
        }
      }
    }

    const resolved = group.filter((t) => t.info);
    if (resolved.length === 0) {
      return [];
    }

    // 2) The season schedule.
    const now = this.now();
    const schedule = await this.gamesList(
      competition,
      resolved.some((t) => this.isLive(t, now)),
    );
    if (!schedule) {
      // Keep the last known game: an outage must not read as "no game".
      for (const tracked of resolved) {
        tracked.reachable = false;
      }
      return [];
    }

    // 3) The games under way, from the live feed (one request per game).
    const headers = new Map();
    const header = (game) => {
      if (!headers.has(game.id)) {
        const season = game.season || seasonCode(competition, seasonYear(now));
        headers.set(
          game.id,
          this.client.header(season, game.gameCode).then(parseHeader, (err) => {
            logger.warn(`${game.id}: live feed unavailable (${err.message})`);
            return null;
          }),
        );
      }
      return headers.get(game.id);
    };

    const events = [];
    for (const tracked of resolved) {
      const code = tracked.info.code;
      const own = clubGames(schedule.games, code, now);
      // A stale schedule still says what comes next, but the badge and the
      // connection status must show the outage.
      tracked.reachable = schedule.fresh;
      let last = own.last ? matchFor(own.last, code) : null;
      const record = { wins: own.wins, losses: own.losses };
      let current;
      if (own.ongoing) {
        current = matchFor(own.ongoing, code);
        const live = await header(own.ongoing);
        if (live) {
          current = applyHeader(current, live);
        } else {
          tracked.reachable = false;
          // Keep what the previous reading knew of this game.
          if (tracked.match?.id === current.id) {
            current = tracked.match;
          }
        }
        if (current.state === 'post') {
          // Over, not marked as played yet: it is already the last result.
          last = current;
          record[current.result === 'win' ? 'wins' : 'losses'] += 1;
        }
      } else if (last && now - Date.parse(last.kickoff) < RECENT_RESULT) {
        current = last;
      } else {
        current = own.next ? matchFor(own.next, code) : last;
      }
      tracked.next = own.next ? matchFor(own.next, code) : null;
      tracked.last = last;
      tracked.record = record;
      events.push(...this.apply(tracked, current, now));
    }
    return events;
  }

  apply(tracked, match, now) {
    const { events, remindedFor } = detectEvents({
      previous: tracked.match,
      current: match,
      remindedFor: tracked.remindedFor,
      now,
      reminderMinutes: this.config.reminder_minutes,
    });
    tracked.match = rememberLeader(tracked.match, match);
    tracked.remindedFor = remindedFor;
    // The reminder is about the next game, which is not the "current" one
    // while the previous result is still shown: check it too.
    if (tracked.next && tracked.next.id !== match?.id) {
      const reminder = detectEvents({
        previous: undefined,
        current: tracked.next,
        remindedFor: tracked.remindedFor,
        now,
        reminderMinutes: this.config.reminder_minutes,
      });
      events.push(...reminder.events);
      tracked.remindedFor = reminder.remindedFor;
    }
    return events.map((event) => ({ event, tracked }));
  }

  async publishDevices() {
    const devices = this.buildDevices();
    const signature = JSON.stringify(devices);
    if (signature === this.devicesSignature) {
      return;
    }
    await this.gladys.publishDiscoveredDevices(devices);
    this.devicesSignature = signature;
  }

  async publishAllStates() {
    // States of a device the user has not created yet are refused: only send
    // those of created devices (the list the SDK keeps up to date).
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    const states = this.list()
      .filter((t) => t.info && t.match !== undefined && created.has(this.deviceId(t)))
      .flatMap((t) => teamStates(this.gladys, t, this.config));
    // The SDK only sends what changed (plus the heartbeat) and splits the
    // batch by 100.
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: REPUBLISH_AFTER });
    } catch (err) {
      logger.error('Gladys refused the states', err);
    }
  }

  async publishTransports() {
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    const entries = this.list()
      .filter((t) => t.info && t.reachable !== null && created.has(this.deviceId(t)))
      .map((t) => ({
        external_id: this.deviceId(t),
        transport: t.reachable ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
      }))
      .filter((entry) => this.transports.get(entry.external_id) !== entry.transport);
    if (entries.length === 0) {
      return;
    }
    try {
      for (let i = 0; i < entries.length; i += MAX_TRANSPORTS_PER_REQUEST) {
        await this.gladys.publishTransports(entries.slice(i, i + MAX_TRANSPORTS_PER_REQUEST));
      }
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
    } catch (err) {
      logger.warn(`Gladys refused the transport badges: ${err.message}`);
    }
  }

  async fireEvents(events) {
    for (const { event, tracked } of events) {
      const data = eventData(
        event,
        this.deviceId(tracked),
        tracked.spec.competitionName,
        formatStatus(event.match, this.config),
      );
      logger.info(`Scene event ${event.key} <- ${tracked.spec.entry}: ${data.summary}`);
      try {
        await this.gladys.publishSceneEvent(event.key, data);
      } catch (err) {
        logger.warn(`Scene event ${event.key} refused: ${err.message}`);
      }
    }
  }

  /** The connection status of the Configuration screen. */
  async reportStatus() {
    const teams = this.list();
    const working = teams.filter((t) => t.info && t.reachable !== false);
    const problems = [
      ...this.parseErrors.map((err) => err.entry),
      ...teams.filter((t) => !t.info || t.reachable === false).map((t) => t.spec.entry),
    ];
    let message;
    if (teams.length === 0 && problems.length === 0) {
      message = {
        en: 'Add at least one club in the configuration, e.g. PAN.',
        fr: 'Ajoutez au moins un club dans la configuration, par ex. PAN.',
      };
    } else if (problems.length > 0) {
      const list = problems.join(', ');
      message = {
        en: `Not followed: ${list}. Use "Test the teams" to see why.`,
        fr: `Non suivis : ${list}. Utilisez « Tester les équipes » pour savoir pourquoi.`,
      };
    }
    try {
      await this.gladys.setConnectionStatus(working.length > 0, message);
    } catch (err) {
      logger.warn(`Cannot report the connection status: ${err.message}`);
    }
  }

  snapshot() {
    return JSON.stringify(
      this.list().map((t) => [
        t.key,
        t.info,
        t.match,
        t.next,
        t.last,
        t.record,
        t.remindedFor,
        t.reachable,
        t.resolveError,
      ]),
    );
  }

  async save() {
    if (!this.store) {
      return;
    }
    const teams = { ...this.saved };
    for (const t of this.tracked.values()) {
      teams[t.key] = {
        info: t.info,
        ...(t.match !== undefined && { match: t.match }),
        remindedFor: t.remindedFor,
      };
    }
    // Clubs no longer followed are forgotten.
    for (const key of Object.keys(teams)) {
      if (!this.tracked.has(key)) {
        delete teams[key];
      }
    }
    this.saved = teams;
    await this.store.save(teams);
  }
}
