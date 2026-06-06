import express from 'express';
import { RatingsService } from './ratings';

const IMDB_ID_REGEX = /^tt\d+$/;

export function createServer(ratingsService: RatingsService): express.Express {
  const app = express();

  const handler = (type: 'movie' | 'tv') => async (
    req: express.Request,
    res: express.Response
  ): Promise<void> => {
    const rawImdbId = req.params.imdbId;
    const imdbId = Array.isArray(rawImdbId) ? rawImdbId[0] : rawImdbId;

    if (!IMDB_ID_REGEX.test(imdbId)) {
      res.status(400).json({ error: 'Invalid IMDB ID' });
      return;
    }

    try {
      const rating = await ratingsService.getRating(type, imdbId);
      if (!rating) {
        res.status(404).json({ error: 'Rating not found' });
        return;
      }

      res.status(200).json(rating);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  };

  app.get('/api/ratings/movie/:imdbId', handler('movie'));
  app.get('/api/ratings/tv/:imdbId', handler('tv'));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}
