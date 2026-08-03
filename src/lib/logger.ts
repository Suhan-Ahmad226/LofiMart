type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getMinimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return configured;
  }

  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (priorities[level] < priorities[getMinimumLevel()]) {
    return;
  }

  const entry = {
    level,
    message,
    ts: new Date().toISOString(),
    ...(context ? { context } : {}),
  };

  const payload = JSON.stringify(entry);

  if (level === 'error') {
    console.error(payload);
    return;
  }

  if (level === 'warn') {
    console.warn(payload);
    return;
  }

  console.warn(payload);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
