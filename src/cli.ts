#!/usr/bin/env node
import { spawn } from "node:child_process";
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

type ParsedCommand =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "run"; command: string; args: string[] }
  | { kind: "error"; message: string };

export type CommandRunResult = {
  timezone: string;
  exitCode: number;
};

type CommandRunner = (
  command: string,
  args: string[],
  timezone: string
) => Promise<CommandRunResult>;

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as PackageJson;
const defaultTimezones = [
  "Etc/UTC",
  "America/New_York",
  "Europe/Berlin",
  "Asia/Tokyo"
];

export function getHelpText(): string {
  return [
    "timewarp-ci",
    "",
    "Usage:",
    "  timewarp-ci [--help]",
    "  timewarp-ci --version",
    "  timewarp-ci run -- <command>",
    "",
    "Options:",
    "  --help       Show this help message.",
    "  --version    Show the installed version.",
    "",
    "Examples:",
    "  timewarp-ci run -- npm test"
  ].join("\n");
}

export function getVersionText(version = packageJson.version): string {
  return version;
}

export function parseCliArgs(args: string[]): ParsedCommand {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { kind: "help" };
  }

  if (args.includes("--version") || args.includes("-v")) {
    return { kind: "version" };
  }

  if (args[0] === "run") {
    if (args[1] !== "--" || args.length < 3) {
      return {
        kind: "error",
        message: "Missing command. Use: timewarp-ci run -- <command>"
      };
    }

    const [command, ...commandArgs] = args.slice(2);

    return {
      kind: "run",
      command,
      args: commandArgs
    };
  }

  return {
    kind: "error",
    message: `Unknown option: ${args[0]}`
  };
}

export function runCommand(
  command: string,
  args: string[],
  timezone: string
): Promise<CommandRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        TZ: timezone
      },
      stdio: "ignore"
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        timezone,
        exitCode: exitCode ?? 1
      });
    });
  });
}

export async function runTimezoneMatrix(
  command: string,
  args: string[],
  timezones = defaultTimezones,
  commandRunner: CommandRunner = runCommand
): Promise<CommandRunResult[]> {
  const results: CommandRunResult[] = [];

  for (const timezone of timezones) {
    results.push(await commandRunner(command, args, timezone));
  }

  return results;
}

export function formatMatrixResults(results: CommandRunResult[]): string {
  const longestTimezone = Math.max(
    ...results.map((result) => result.timezone.length)
  );

  return results
    .map((result) => {
      const icon = result.exitCode === 0 ? "✓" : "✗";
      const status = result.exitCode === 0 ? "passed" : "failed";
      return `${icon} ${result.timezone.padEnd(longestTimezone)}  ${status}`;
    })
    .join("\n");
}

export async function runCli(
  args: string[],
  version = packageJson.version,
  commandRunner: CommandRunner = runCommand
): Promise<CliResult> {
  const parsed = parseCliArgs(args);

  if (parsed.kind === "help") {
    return {
      stdout: `${getHelpText()}\n`,
      stderr: "",
      exitCode: 0
    };
  }

  if (parsed.kind === "version") {
    return {
      stdout: `${getVersionText(version)}\n`,
      stderr: "",
      exitCode: 0
    };
  }

  if (parsed.kind === "error") {
    return {
      stdout: "",
      stderr: `${parsed.message}\n\n${getHelpText()}\n`,
      exitCode: 1
    };
  }

  const results = await runTimezoneMatrix(
    parsed.command,
    parsed.args,
    defaultTimezones,
    commandRunner
  );
  const hasFailure = results.some((result) => result.exitCode !== 0);

  return {
    stdout: `${formatMatrixResults(results)}\n`,
    stderr: "",
    exitCode: hasFailure ? 1 : 0
  };
}

export async function main(argv = process.argv): Promise<void> {
  const result = await runCli(argv.slice(2));

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
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
