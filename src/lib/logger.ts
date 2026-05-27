type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
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

  console.log(payload);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
