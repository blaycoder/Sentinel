/**
 * Logger interface — injected into core functions so consumers control
 * where log output goes (stdout, VS Code OutputChannel, structured JSON, etc.).
 *
 * @sentinel-scan/core NEVER calls console.* directly. It always uses this interface.
 * If no logger is provided, noopLogger is used (silent).
 */

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/**
 * A no-operation logger used as the default when no logger is injected.
 * Silent by design — consumers opt in to logging.
 */
export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

/**
 * Creates a Logger that prefixes every message with a scope tag.
 * Useful for composing loggers in the runner when calling sub-systems.
 */
export function scopedLogger(logger: Logger, scope: string): Logger {
  const prefix = `[${scope}] `
  return {
    debug: (msg, meta) => {
      logger.debug(prefix + msg, meta)
    },
    info: (msg, meta) => {
      logger.info(prefix + msg, meta)
    },
    warn: (msg, meta) => {
      logger.warn(prefix + msg, meta)
    },
    error: (msg, meta) => {
      logger.error(prefix + msg, meta)
    },
  }
}
