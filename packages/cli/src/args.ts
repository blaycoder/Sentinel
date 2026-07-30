/**
 * args.ts — hand-rolled argv parser.
 *
 * WHY hand-rolled instead of commander/yargs:
 *   - Sentinel's CLI surface is small and well-defined
 *   - Zero runtime dependency for argument parsing
 *   - Full control over error messages and help text
 *
 * This parser handles:
 *   - Sub-commands (scan, init)
 *   - Flags with values (--format json, --output file.sarif)
 *   - Boolean flags (--verbose, --no-color)
 *   - Positional arguments
 *   - Short aliases (-f json, -o file.sarif, -v)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutputFormat = 'text' | 'json' | 'sarif'

export interface GlobalFlags {
  verbose: boolean
  noColor: boolean
  help: boolean
  version: boolean
}

export interface ScanFlags extends GlobalFlags {
  format: OutputFormat
  output: string | undefined // Output file path (undefined = stdout)
  config: string | undefined // Custom config file path
  rootDir: string | undefined // Override rootDir
  maxWarnings: number // Exit code 1 if warning count exceeds this (-1 = disabled)
}

export interface InitFlags extends GlobalFlags {
  force: boolean // Overwrite existing config
}

export type ParsedArgs =
  | { command: 'scan'; positionals: string[]; flags: ScanFlags }
  | { command: 'init'; positionals: string[]; flags: InitFlags }
  | { command: 'help'; positionals: string[]; flags: GlobalFlags }
  | { command: 'version'; positionals: string[]; flags: GlobalFlags }

export class ArgParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArgParseError'
  }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_GLOBAL_FLAGS: GlobalFlags = {
  verbose: false,
  noColor: false,
  help: false,
  version: false,
}

const DEFAULT_SCAN_FLAGS: ScanFlags = {
  ...DEFAULT_GLOBAL_FLAGS,
  format: 'text',
  output: undefined,
  config: undefined,
  rootDir: undefined,
  maxWarnings: -1,
}

const DEFAULT_INIT_FLAGS: InitFlags = {
  ...DEFAULT_GLOBAL_FLAGS,
  force: false,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse process.argv into a typed ParsedArgs object.
 *
 * @param argv  The raw argv array (usually process.argv.slice(2))
 * @throws      ArgParseError for invalid flags or missing values
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const tokens = [...argv]

  // No args → show help
  if (tokens.length === 0) {
    return { command: 'help', positionals: [], flags: DEFAULT_GLOBAL_FLAGS }
  }

  const first = tokens[0]
  if (first === undefined) {
    return { command: 'help', positionals: [], flags: DEFAULT_GLOBAL_FLAGS }
  }

  if (first === '--help' || first === '-h') {
    return { command: 'help', positionals: [], flags: DEFAULT_GLOBAL_FLAGS }
  }

  if (first === '--version' || first === '-V') {
    return { command: 'version', positionals: [], flags: DEFAULT_GLOBAL_FLAGS }
  }

  switch (first) {
    case 'scan':
      return parseScanCommand(tokens.slice(1))
    case 'init':
      return parseInitCommand(tokens.slice(1))
    case 'help':
      return { command: 'help', positionals: tokens.slice(1), flags: DEFAULT_GLOBAL_FLAGS }
    case 'version':
      return { command: 'version', positionals: [], flags: DEFAULT_GLOBAL_FLAGS }
    default:
      // Treat unknown first token as a directory path passed to scan
      return parseScanCommand(tokens)
  }
}

// ─── Command Parsers ──────────────────────────────────────────────────────────

function parseScanCommand(tokens: string[]): ParsedArgs {
  const flags: ScanFlags = { ...DEFAULT_SCAN_FLAGS }
  const positionals: string[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]
    if (token === undefined) break

    switch (token) {
      case '--verbose':
      case '-v':
        flags.verbose = true
        break

      case '--no-color':
        flags.noColor = true
        break

      case '--help':
      case '-h':
        flags.help = true
        break

      case '--format':
      case '-f': {
        const value = tokens[++i]
        if (value === undefined)
          throw new ArgParseError(`--format requires a value (text|json|sarif)`)
        if (!isOutputFormat(value)) {
          throw new ArgParseError(`Invalid format '${value}'. Expected: text, json, sarif`)
        }
        flags.format = value
        break
      }

      case '--output':
      case '-o': {
        const value = tokens[++i]
        if (value === undefined) throw new ArgParseError(`--output requires a file path`)
        flags.output = value
        break
      }

      case '--config':
      case '-c': {
        const value = tokens[++i]
        if (value === undefined) throw new ArgParseError(`--config requires a file path`)
        flags.config = value
        break
      }

      case '--root-dir': {
        const value = tokens[++i]
        if (value === undefined) throw new ArgParseError(`--root-dir requires a directory path`)
        flags.rootDir = value
        break
      }

      case '--max-warnings': {
        const value = tokens[++i]
        if (value === undefined) throw new ArgParseError(`--max-warnings requires a number`)
        const parsed = parseInt(value, 10)
        if (isNaN(parsed))
          throw new ArgParseError(`--max-warnings must be a number, got '${value}'`)
        flags.maxWarnings = parsed
        break
      }

      default:
        if (token.startsWith('-')) {
          throw new ArgParseError(`Unknown flag: ${token}. Run 'sentinel scan --help' for usage.`)
        }
        positionals.push(token)
    }

    i++
  }

  return { command: 'scan', positionals, flags }
}

function parseInitCommand(tokens: string[]): ParsedArgs {
  const flags: InitFlags = { ...DEFAULT_INIT_FLAGS }
  const positionals: string[] = []

  for (const token of tokens) {
    switch (token) {
      case '--force':
      case '-f':
        flags.force = true
        break
      case '--verbose':
      case '-v':
        flags.verbose = true
        break
      case '--help':
      case '-h':
        flags.help = true
        break
      default:
        if (token.startsWith('-')) {
          throw new ArgParseError(`Unknown flag: ${token}. Run 'sentinel init --help' for usage.`)
        }
        positionals.push(token)
    }
  }

  return { command: 'init', positionals, flags }
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function isOutputFormat(value: string): value is OutputFormat {
  return value === 'text' || value === 'json' || value === 'sarif'
}
