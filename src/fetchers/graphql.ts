import { RatingData } from '../types';

const GRAPHQL_ENDPOINT = 'https://caching.graphql.imdb.com/';

const RATING_QUERY = `query GetTitle($id: ID!) {
  title(id: $id) {
    ratingsSummary {
      aggregateRating
      voteCount
    }
  }
}`;

interface GraphqlResponse {
  data?: {
    title?: {
      ratingsSummary?: {
        aggregateRating?: number;
        voteCount?: number;
      };
    };
  };
}

export async function fetchGraphqlRating(
  imdbId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RatingData | null> {
  try {
    const response = await fetchImpl(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/graphql+json, application/json',
        'accept-language': 'en-US,en;q=0.9',
        origin: 'https://www.imdb.com',
        'user-agent':
          'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: RATING_QUERY,
        operationName: 'GetTitle',
        variables: { id: imdbId },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as GraphqlResponse;
    const summary = result.data?.title?.ratingsSummary;

    if (
      typeof summary?.aggregateRating !== 'number' ||
      !Number.isFinite(summary.aggregateRating) ||
      typeof summary.voteCount !== 'number' ||
      !Number.isFinite(summary.voteCount)
    ) {
      return null;
    }

    return {
      rating: summary.aggregateRating,
      votes: summary.voteCount,
    };
  } catch {
    return null;
  }
}
