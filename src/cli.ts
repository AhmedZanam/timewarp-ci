#!/usr/bin/env node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

type PackageJson = {
  version: string;
};

type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as PackageJson;

export function getHelpText(): string {
  return [
    "timewarp-ci",
    "",
    "Usage:",
    "  timewarp-ci [--help]",
    "  timewarp-ci --version",
    "",
    "Options:",
    "  --help       Show this help message.",
    "  --version    Show the installed version.",
    "",
    "Timezone matrix running is planned for v0.1.0."
  ].join("\n");
}

export function getVersionText(version = packageJson.version): string {
  return version;
}

export function runCli(args: string[], version = packageJson.version): CliResult {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return {
      stdout: `${getHelpText()}\n`,
      stderr: "",
      exitCode: 0
    };
  }

  if (args.includes("--version") || args.includes("-v")) {
    return {
      stdout: `${getVersionText(version)}\n`,
      stderr: "",
      exitCode: 0
    };
  }

  return {
    stdout: "",
    stderr: `Unknown option: ${args[0]}\n\n${getHelpText()}\n`,
    exitCode: 1
  };
}

export function main(argv = process.argv): void {
  const result = runCli(argv.slice(2));

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.exitCode;
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entrypoint) {
  main();
}
