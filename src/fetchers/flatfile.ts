import { createGunzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import readline from 'readline';
import { Logger } from '../logger';
import { RatingData } from '../types';

const RATINGS_DATASET_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';
const EXPECTED_HEADER = 'tconst\taverageRating\tnumVotes';
const MIN_EXPECTED_ROWS = 500_000;
const MAX_PARSE_ERROR_RATIO = 0.01;

export interface FlatFileConfig {
  dataPath: string;
  cacheMaxAgeHours: number;
  logger: Logger;
}

export class FlatFileRatingsStore {
  private readonly cacheFilePath: string;
  private readonly cacheMaxAgeMs: number;
  private readonly logger: Logger;
  private readonly ratings = new Map<string, RatingData>();
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(config: FlatFileConfig) {
    this.cacheFilePath = path.join(config.dataPath, 'cache', 'title.ratings.tsv');
    this.cacheMaxAgeMs = config.cacheMaxAgeHours * 60 * 60 * 1000;
    this.logger = config.logger;
  }

  public async initialize(): Promise<void> {
    try {
      await this.refreshIfNeeded();
    } catch (error) {
      this.logger.warn('Failed to initialize flat file ratings cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public startScheduledRefresh(intervalHours = 24): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      void this.refreshIfNeeded().catch((error) => {
        this.logger.warn('Background flat file refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, intervalHours * 60 * 60 * 1000);
  }

  public stopScheduledRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  public async getRating(imdbId: string): Promise<RatingData | null> {
    const cached = this.ratings.get(imdbId);
    if (cached) {
      return cached;
    }

    if (this.ratings.size === 0) {
      try {
        await this.refreshIfNeeded(true);
      } catch (error) {
        this.logger.warn('Flat file lookup skipped because refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    return this.ratings.get(imdbId) ?? null;
  }

  private async refreshIfNeeded(forceWhenMissing = false): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = (async () => {
      const cacheExists = await this.fileExists(this.cacheFilePath);
      const fresh = cacheExists ? await this.isCacheFresh() : false;

      if (!cacheExists && !forceWhenMissing) {
        return;
      }

      if (!cacheExists || !fresh) {
        await this.downloadAndDecompress();
      }

      await this.loadIntoMemory();
    })();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async isCacheFresh(): Promise<boolean> {
    const stat = await fs.stat(this.cacheFilePath);
    return Date.now() - stat.mtimeMs < this.cacheMaxAgeMs;
  }

  private async downloadAndDecompress(): Promise<void> {
    this.logger.info('Downloading IMDb ratings flat file');

    const directory = path.dirname(this.cacheFilePath);
    await fs.mkdir(directory, { recursive: true });

    const response = await fetch(RATINGS_DATASET_URL);
    if (!response.ok || !response.body) {
      throw new Error(`IMDb dataset download failed with status ${response.status}`);
    }

    const tempPath = `${this.cacheFilePath}.tmp`;

    try {
      await pipeline(Readable.fromWeb(response.body as any), createGunzip(), createWriteStream(tempPath));

      await fs.rename(tempPath, this.cacheFilePath);
      this.logger.info('IMDb ratings flat file downloaded', { path: this.cacheFilePath });
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  private async loadIntoMemory(): Promise<void> {
    if (!(await this.fileExists(this.cacheFilePath))) {
      return;
    }

    const map = new Map<string, RatingData>();
    const stream = createReadStream(this.cacheFilePath, { encoding: 'utf8' });
    const lineReader = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let rowNumber = 0;
    let validRows = 0;
    let parseErrors = 0;
    let headerSeen = false;

    for await (const line of lineReader) {
      if (!headerSeen) {
        if (line !== EXPECTED_HEADER) {
          throw new Error('IMDb ratings file has invalid or missing header');
        }
        headerSeen = true;
        continue;
      }

      rowNumber += 1;

      const [tconst, averageRating, numVotes] = line.split('\t');
      if (!tconst || !averageRating || !numVotes) {
        parseErrors += 1;
        continue;
      }

      const rating = Number(averageRating);
      const votes = Number(numVotes);

      if (!Number.isFinite(rating) || !Number.isInteger(votes)) {
        parseErrors += 1;
        continue;
      }

      validRows += 1;
      map.set(tconst, { rating, votes });
    }

    if (!headerSeen) {
      throw new Error('IMDb ratings file has invalid or missing header');
    }

    if (validRows <= MIN_EXPECTED_ROWS) {
      throw new Error(
        `IMDb ratings file appears truncated: ${validRows} valid rows (minimum ${MIN_EXPECTED_ROWS + 1})`
      );
    }

    if (rowNumber > 0 && parseErrors / rowNumber >= MAX_PARSE_ERROR_RATIO) {
      throw new Error('IMDb ratings file appears corrupt due to parse error ratio');
    }

    this.ratings.clear();
    for (const [id, value] of map) {
      this.ratings.set(id, value);
    }

    this.logger.info('IMDb flat file loaded into memory', {
      rows: validRows,
      parseErrors,
    });
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
