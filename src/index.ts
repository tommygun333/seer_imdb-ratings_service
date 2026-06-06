import { createServer } from './server';
import { createLogger, LogLevel } from './logger';
import { FlatFileRatingsStore } from './fetchers/flatfile';
import { RatingsService } from './ratings';

function parseIntWithDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main(): Promise<void> {
  const port = parseIntWithDefault(process.env.PORT, 3001);
  const dataPath = process.env.DATA_PATH ?? './data';
  const cacheMaxAgeHours = parseIntWithDefault(process.env.FLAT_FILE_CACHE_MAX_AGE_HOURS, 24);
  const responseCacheTtlSeconds = parseIntWithDefault(process.env.RESPONSE_CACHE_TTL_SECONDS, 3600);
  const logLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info';

  const logger = createLogger(logLevel);

  const flatFileStore = new FlatFileRatingsStore({
    dataPath,
    cacheMaxAgeHours,
    logger,
  });

  await flatFileStore.initialize();
  flatFileStore.startScheduledRefresh(cacheMaxAgeHours);

  const ratingsService = new RatingsService({
    flatFileStore,
    responseCacheTtlSeconds,
    logger,
  });

  const server = createServer(ratingsService);
  server.listen(port, () => {
    logger.info('IMDb sidecar service listening', { port });
  });
}

void main();
