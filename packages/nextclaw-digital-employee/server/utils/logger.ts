type LogFn = (message: string, ...args: unknown[]) => void;

export type Logger = {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
};

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    info: (msg, ...args) => console.info(prefix, msg, ...args),
    warn: (msg, ...args) => console.warn(prefix, msg, ...args),
    error: (msg, ...args) => console.error(prefix, msg, ...args),
    debug: (msg, ...args) => console.debug(prefix, msg, ...args),
  };
}
