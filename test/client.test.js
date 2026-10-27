import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EuroleagueError, createEuroleagueClient } from '../src/euroleague/client.js';

function fakeFetch(answer = { ok: true, json: async () => ({ data: [] }) }) {
  const urls = [];
  const fetch = async (url, options) => {
    urls.push({ url: String(url), accept: options.headers.accept });
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  };
  return { fetch, urls };
}

test('the endpoints the official websites read', async () => {
  const { fetch, urls } = fakeFetch();
  const client = createEuroleagueClient({ fetch });
  await client.clubs('E', 'E2026');
  await client.games('U', 'U2026');
  await client.header('E2026', 23);
  assert.deepEqual(
    urls.map((u) => u.url),
    [
      'https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/clubs',
      'https://api-live.euroleague.net/v2/competitions/U/seasons/U2026/games',
      'https://live.euroleague.net/api/Header?gamecode=23&seasoncode=E2026',
    ],
  );
  assert.equal(urls[0].accept, 'application/json');
});

test('HTTP errors, network errors and non-JSON answers are EuroleagueErrors', async () => {
  const http = createEuroleagueClient(fakeFetch({ ok: false, status: 503 }));
  await assert.rejects(http.games('E', 'E2026'), (err) => {
    assert.ok(err instanceof EuroleagueError);
    assert.equal(err.status, 503);
    return true;
  });
  const down = createEuroleagueClient(fakeFetch(new Error('ECONNRESET')));
  await assert.rejects(down.clubs('E', 'E2026'), /unreachable: ECONNRESET/);
  const html = createEuroleagueClient(
    fakeFetch({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }),
  );
  await assert.rejects(html.clubs('E', 'E2026'), /not JSON/);
});

test('crests are only fetched from the Euroleague image hosts', async () => {
  const { fetch, urls } = fakeFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(3) });
  const client = createEuroleagueClient({ fetch });
  const png = await client.crest('https://media-cdn.incrowdsports.com/abc.png');
  assert.equal(png.length, 3);
  await client.crest('https://media-cdn.cortextech.io/abc.png');
  assert.equal(urls.length, 2);
  await assert.rejects(client.crest('https://evil.example.com/abc.png'), /Not a Euroleague image/);
  await assert.rejects(client.crest('http://media-cdn.incrowdsports.com/abc.png'));
  assert.equal(urls.length, 2);
});
