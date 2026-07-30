#!/usr/bin/env node
/**
 * @sentinel/cli — bin entry point.
 *
 * This is the ONLY file in the codebase that:
 *   1. Reads process.argv
 *   2. Writes to process.stdout / process.stderr directly
 *   3. Calls process.exit()
 *
 * All business logic is delegated to commands/ and the core engine.
 * This file is the single top-level error boundary for the CLI.
 */

import { parseArgs, ArgParseError } from './args.js'
import { initCommand } from './commands/init.js'
import { scanCommand } from './commands/scan.js'
import { getRootHelp, getScanHelp, getInitHelp, SENTINEL_VERSION } from './help.js'

function main(): void {
  const argv = process.argv.slice(2)

  let parsed
  try {
    parsed = parseArgs(argv)
  } catch (error) {
    if (error instanceof ArgParseError) {
      process.stderr.write(`sentinel: ${error.message}\n`)
      process.stderr.write(`Run 'sentinel --help' for usage.\n`)
      process.exit(2)
    }
    throw error
  }

  // --help flag on any command
  if (parsed.flags.help) {
    const helpText =
      parsed.command === 'scan'
        ? getScanHelp()
        : parsed.command === 'init'
          ? getInitHelp()
          : getRootHelp()
    process.stdout.write(helpText + '\n')
    return
  }

  switch (parsed.command) {
    case 'help':
      process.stdout.write(getRootHelp() + '\n')
      return

    case 'version':
      process.stdout.write(`sentinel ${SENTINEL_VERSION}\n`)
      return

    case 'scan': {
      const result = scanCommand(parsed.positionals, parsed.flags)
      process.exit(result.exitCode)
      break
    }

    case 'init': {
      let result
      try {
        result = initCommand(parsed.positionals, parsed.flags)
      } catch (error) {
        process.stderr.write(
          `sentinel init failed: ${error instanceof Error ? error.message : String(error)}\n`,
        )
        process.exit(2)
      }

      if (result.output) {
        process.stdout.write(result.output + '\n')
      }
      process.exit(result.exitCode)
    }
  }
}

try {
  main()
} catch (error: unknown) {
  process.stderr.write(`\nsentinel: unexpected error\n`)
  if (error instanceof Error) {
    process.stderr.write(`${error.stack ?? error.message}\n`)
  } else {
    process.stderr.write(`${String(error)}\n`)
  }
  process.stderr.write(
    `\nIf this is a bug, please report it at https://github.com/your-org/sentinel/issues\n`,
  )
  process.exit(2)
}
