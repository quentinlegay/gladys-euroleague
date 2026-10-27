// -----------------------------------------------------------------------------
// Euroleague Basketball public API client (no account, no key).
//
// The endpoints the official websites read, for one competition (E or U) and
// one season code (E2026):
//   - clubs    https://api-live.euroleague.net/v2/competitions/<c>/seasons/<s>/clubs
//              every club of the season: code, names, crest;
//   - games    https://api-live.euroleague.net/v2/competitions/<c>/seasons/<s>/games
//              the whole schedule: dates, `played`, final scores;
//   - header   https://live.euroleague.net/api/Header?gamecode=<n>&seasoncode=<s>
//              one game as it is being played: `Live`, scores, quarter, clock.
//
// The API is undocumented: it can change or throttle without notice. Every
// call has a timeout, and the caller keeps the last known data when one fails.
// `fetch` is injected so the tests never touch the network.
// -----------------------------------------------------------------------------

const API_URL = 'https://api-live.euroleague.net/v2';
const LIVE_URL = 'https://live.euroleague.net/api';
const TIMEOUT_MS = 15_000;

// The crests the API links to live on these image CDNs.
const CREST_HOSTS = /(^|\.)(incrowdsports\.com|cortextech\.io|euroleaguebasketball\.net)$/;

export class EuroleagueError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = 'EuroleagueError';
    this.status = status;
    this.url = url;
  }
}

function seasonUrl(competition, season, path) {
  return `${API_URL}/competitions/${encodeURIComponent(competition)}/seasons/${encodeURIComponent(season)}/${path}`;
}

/**
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createEuroleagueClient({ fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  async function request(url, accept) {
    let response;
    try {
      response = await fetch(url, {
        headers: { accept },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new EuroleagueError(`Euroleague API unreachable: ${err.message}`, { url });
    }
    if (!response.ok) {
      throw new EuroleagueError(`Euroleague API HTTP ${response.status}`, {
        status: response.status,
        url,
      });
    }
    return response;
  }

  async function getJson(url) {
    const response = await request(url, 'application/json');
    try {
      return await response.json();
    } catch {
      throw new EuroleagueError('Euroleague API answered something that is not JSON', { url });
    }
  }

  return {
    clubs(competition, season) {
      return getJson(seasonUrl(competition, season, 'clubs'));
    },
    games(competition, season) {
      return getJson(seasonUrl(competition, season, 'games'));
    },
    header(season, gameCode) {
      const query = new URLSearchParams({ gamecode: String(gameCode), seasoncode: season });
      return getJson(`${LIVE_URL}/Header?${query}`);
    },
    /**
     * A club crest, as a Buffer. Only the API's own image hosts are fetched:
     * the URL comes from an API answer, and the integration must not be
     * turned into a fetcher of arbitrary URLs.
     */
    async crest(url) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !CREST_HOSTS.test(parsed.hostname)) {
        throw new EuroleagueError(`Not a Euroleague image: ${parsed.hostname}`, { url });
      }
      const response = await request(parsed.href, 'image/*');
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
