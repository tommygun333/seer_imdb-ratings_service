export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel): Logger {
  const minLevel = LEVEL_ORDER[level] ?? LEVEL_ORDER.info;

  const log = (entryLevel: LogLevel, message: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[entryLevel] < minLevel) {
      return;
    }

    const payload = {
      level: entryLevel,
      message,
      ...(meta ? { meta } : {}),
      timestamp: new Date().toISOString(),
    };

    console.log(JSON.stringify(payload));
  };

  return {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
  };
}
