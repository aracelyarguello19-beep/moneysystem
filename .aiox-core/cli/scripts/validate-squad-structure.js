#!/usr/bin/env node
/**
 * validate:squad-structure CLI wrapper
 *
 * Thin CLI entry point around the existing `SquadValidator`
 * (.aiox-core/development/scripts/squad/squad-validator.js) — validates a
 * squad's manifest, directory structure, task format, agent definitions,
 * config references, and workflows.
 *
 * Not part of the `aiox` Commander program: kept standalone so it can be
 * invoked as `npm run validate:squad-structure -- --squad <name>` without
 * requiring the (currently absent) `packages/installer` sibling package
 * that `aiox validate` depends on.
 *
 * Usage:
 *   node .aiox-core/cli/scripts/validate-squad-structure.js --squad <name>
 *   node .aiox-core/cli/scripts/validate-squad-structure.js --path squads/<name>
 *   node .aiox-core/cli/scripts/validate-squad-structure.js --squad <name> --strict --json
 *
 * @module cli/scripts/validate-squad-structure
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { SquadValidator } = require('../../development/scripts/squad/squad-validator');

function parseArgs(argv) {
  const args = { strict: false, verbose: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--squad') args.squad = argv[++i];
    else if (arg === '--path') args.path = argv[++i];
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--verbose' || arg === '-v') args.verbose = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function printUsage() {
  console.log(`
Usage: validate:squad-structure --squad <name> [options]
       validate:squad-structure --path <squad-dir> [options]

Options:
  --squad <name>   Squad id under squads/<name>
  --path <dir>     Explicit path to a squad directory (overrides --squad)
  --strict         Treat warnings as errors
  --verbose, -v    Verbose validator logging
  --json           Output the raw validation result as JSON
  --help, -h       Show this help

Examples:
  npm run validate:squad-structure -- --squad design-extractor
  npm run validate:squad-structure -- --path squads/design-extractor --strict
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.squad && !args.path)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const squadPath = args.path
    ? path.resolve(process.cwd(), args.path)
    : path.resolve(process.cwd(), 'squads', args.squad);

  if (!fs.existsSync(squadPath)) {
    console.error(`Error: squad directory not found: ${squadPath}`);
    process.exit(2);
  }

  const validator = new SquadValidator({ strict: args.strict, verbose: args.verbose });

  let result;
  try {
    result = await validator.validate(squadPath);
  } catch (error) {
    console.error(`Error: validation crashed: ${error.message}`);
    if (args.verbose) console.error(error.stack);
    process.exit(2);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(validator.formatResult(result, squadPath));
  }

  process.exit(result.valid ? 0 : 1);
}

main();
