import assert from 'node:assert/strict';
import test from 'node:test';
import { RatingsService } from './ratings';
import { createLogger } from './logger';
import { createServer } from './server';
import request from 'supertest';

test('RatingsService falls back to flat file and caches by content type', async () => {
  let graphqlCalls = 0;
  let flatfileCalls = 0;

  const service = new RatingsService({
    responseCacheTtlSeconds: 60,
    logger: createLogger('error'),
    graphqlFetcher: async () => {
      graphqlCalls += 1;
      return null;
    },
    flatFileStore: {
      getRating: async () => {
        flatfileCalls += 1;
        return { rating: 8.5, votes: 1200 };
      },
    },
  });

  const movieFirst = await service.getRating('movie', 'tt12345');
  const movieSecond = await service.getRating('movie', 'tt12345');
  const tvFirst = await service.getRating('tv', 'tt12345');

  assert.equal(movieFirst?.criticsScore, 8.5);
  assert.equal(movieSecond?.criticsScoreCount, 1200);
  assert.equal(tvFirst?.url, 'https://www.imdb.com/title/tt12345');

  assert.equal(graphqlCalls, 2);
  assert.equal(flatfileCalls, 2);
});

test('Server returns 400 for invalid imdb id before calling service', async () => {
  let calls = 0;

  const app = createServer({
    getRating: async () => {
      calls += 1;
      return null;
    },
  } as unknown as RatingsService);

  const response = await request(app).get('/api/ratings/movie/not-valid-id');

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid IMDB ID' });
  assert.equal(calls, 0);
});
