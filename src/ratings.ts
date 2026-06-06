import NodeCache from 'node-cache';
import { fetchGraphqlRating } from './fetchers/graphql';
import { FlatFileRatingsStore } from './fetchers/flatfile';
import { Logger } from './logger';
import { IMDBRating, RatingData } from './types';

export type ContentType = 'movie' | 'tv';

export interface RatingsServiceConfig {
  flatFileStore: Pick<FlatFileRatingsStore, 'getRating'>;
  responseCacheTtlSeconds: number;
  logger: Logger;
  graphqlFetcher?: (imdbId: string) => Promise<RatingData | null>;
}

export class RatingsService {
  private readonly responseCache: NodeCache;
  private readonly flatFileStore: Pick<FlatFileRatingsStore, 'getRating'>;
  private readonly logger: Logger;
  private readonly graphqlFetcher: (imdbId: string) => Promise<RatingData | null>;

  constructor(config: RatingsServiceConfig) {
    this.flatFileStore = config.flatFileStore;
    this.logger = config.logger;
    this.graphqlFetcher = config.graphqlFetcher ?? fetchGraphqlRating;
    this.responseCache = new NodeCache({ stdTTL: config.responseCacheTtlSeconds });
  }

  public async getRating(type: ContentType, imdbId: string): Promise<IMDBRating | null> {
    const cacheKey = `${type}:${imdbId}`;
    const cached = this.responseCache.get<IMDBRating>(cacheKey);
    if (cached) {
      this.logger.debug('Ratings response cache hit', { cacheKey });
      return cached;
    }

    const graphql = await this.graphqlFetcher(imdbId);
    if (graphql) {
      this.logger.debug('Ratings strategy succeeded', { strategy: 'graphql', type, imdbId });
      const rating = this.toImdbRating(imdbId, graphql);
      this.responseCache.set(cacheKey, rating);
      return rating;
    }

    const flatFile = await this.flatFileStore.getRating(imdbId);
    if (flatFile) {
      this.logger.debug('Ratings strategy succeeded', { strategy: 'flatfile', type, imdbId });
      const rating = this.toImdbRating(imdbId, flatFile);
      this.responseCache.set(cacheKey, rating);
      return rating;
    }

    return null;
  }

  private toImdbRating(imdbId: string, ratingData: RatingData): IMDBRating {
    return {
      title: imdbId,
      url: `https://www.imdb.com/title/${imdbId}`,
      criticsScore: ratingData.rating,
      criticsScoreCount: ratingData.votes,
    };
  }
}
