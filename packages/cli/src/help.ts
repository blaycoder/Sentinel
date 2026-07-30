/**
 * help.ts — CLI help text.
 *
 * Hand-rolled (no commander). Returns strings, doesn't print.
 * The caller decides whether to write to stdout or stderr.
 */

export const SENTINEL_VERSION = '0.1.0'

export function getRootHelp(): string {
  return `
sentinel — static analysis for API integration confidence

Usage:
  sentinel <command> [options] [path]

Commands:
  scan [path]   Scan a directory for API integration issues (default: cwd)
  init [path]   Create a sentinel.config.ts in a directory (default: cwd)
  help          Show this help message
  version       Show the version number

Options:
  -h, --help      Show help
  -V, --version   Show version

Run 'sentinel <command> --help' for command-specific options.

Examples:
  sentinel scan
  sentinel scan ./src
  sentinel init
`.trimStart()
}

export function getScanHelp(): string {
  return `
sentinel scan — extract and analyse API calls in a codebase

Usage:
  sentinel scan [path] [options]

Arguments:
  path          Directory to scan (default: current directory)

Options:
  -v, --verbose     Enable verbose debug logging
      --no-color    Disable color output
  -h, --help        Show this help

Examples:
  sentinel scan
  sentinel scan ./src
`.trimStart()
}

export function getInitHelp(): string {
  return `
sentinel init — create a sentinel.config.ts in your project

Usage:
  sentinel init [path] [options]

Arguments:
  path          Directory to create the config in (default: current directory)

Options:
  -f, --force   Overwrite existing config
  -h, --help    Show this help

Example:
  sentinel init
  sentinel init ./packages/frontend
`.trimStart()
}
