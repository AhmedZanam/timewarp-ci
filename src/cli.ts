#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
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
  | {
      kind: "run";
      command?: string;
      args: string[];
      timezones?: string[];
      configPath?: string;
      reportFormat: ReportFormat;
    }
  | { kind: "error"; message: string };

export type CommandRunResult = {
  timezone: string;
  exitCode: number;
  durationMs?: number;
};

export type TimewarpConfig = {
  command?: string;
  timezones?: string[];
};

type ReportFormat = "text" | "json";

type CommandRunner = (
  command: string,
  args: string[],
  timezone: string
) => Promise<CommandRunResult>;

type ConfigLoader = (configPath?: string) => Promise<TimewarpConfig | null>;

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
    "  timewarp-ci run [--config <path>] [--report <format>] [--timezone <tz>] -- <command>",
    "  timewarp-ci run [--config <path>]",
    "",
    "Options:",
    "  --help             Show this help message.",
    "  --version          Show the installed version.",
    "  -c, --config       Use a config file.",
    "  --report           Output format: text or json.",
    "  -t, --timezone     Add a timezone to the run matrix.",
    "",
    "Examples:",
    "  timewarp-ci run -- npm test",
    "  timewarp-ci run --config timewarp-ci.config.json",
    "  timewarp-ci run -t Etc/UTC -t Europe/Berlin -- npm test"
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
    const timezones: string[] = [];
    let configPath: string | undefined;
    let reportFormat: ReportFormat = "text";
    let commandStartIndex = -1;

    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index];

      if (arg === "--") {
        commandStartIndex = index + 1;
        break;
      }

      if (arg === "--timezone" || arg === "-t") {
        const timezone = args[index + 1];

        if (!timezone || timezone === "--") {
          return {
            kind: "error",
            message: `Missing value for ${arg}`
          };
        }

        timezones.push(timezone);
        index += 1;
        continue;
      }

      if (arg === "--config" || arg === "-c") {
        const nextConfigPath = args[index + 1];

        if (!nextConfigPath || nextConfigPath === "--") {
          return {
            kind: "error",
            message: `Missing value for ${arg}`
          };
        }

        configPath = nextConfigPath;
        index += 1;
        continue;
      }

      if (arg === "--report") {
        const nextReportFormat = args[index + 1];

        if (!nextReportFormat || nextReportFormat === "--") {
          return {
            kind: "error",
            message: "Missing value for --report"
          };
        }

        if (nextReportFormat !== "text" && nextReportFormat !== "json") {
          return {
            kind: "error",
            message: "Report format must be text or json."
          };
        }

        reportFormat = nextReportFormat;
        index += 1;
        continue;
      }

      return {
        kind: "error",
        message: `Unknown run option: ${arg}`
      };
    }

    if (commandStartIndex === -1) {
      return {
        kind: "run",
        args: [],
        timezones: timezones.length > 0 ? timezones : undefined,
        configPath,
        reportFormat
      };
    }

    if (commandStartIndex >= args.length) {
      return {
        kind: "error",
        message:
          "Missing command. Use: timewarp-ci run -- <command> or add timewarp-ci.config.json"
      };
    }

    const [command, ...commandArgs] = args.slice(commandStartIndex);

    return {
      kind: "run",
      command,
      args: commandArgs,
      timezones: timezones.length > 0 ? timezones : undefined,
      configPath,
      reportFormat
    };
  }

  return {
    kind: "error",
    message: `Unknown option: ${args[0]}`
  };
}

export function parseCommandString(commandText: string): {
  command: string;
  args: string[];
} {
  const parts = commandText.trim().split(/\s+/).filter(Boolean);
  const [command, ...args] = parts;

  if (!command) {
    throw new Error("Config command must not be empty.");
  }

  return { command, args };
}

export function parseConfigJson(contents: string): TimewarpConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse config JSON: ${message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Config must be a JSON object.");
  }

  const config = parsed as Record<string, unknown>;
  const result: TimewarpConfig = {};

  if ("command" in config) {
    if (typeof config.command !== "string") {
      throw new Error("Config command must be a string.");
    }

    result.command = config.command;
  }

  if ("timezones" in config) {
    if (
      !Array.isArray(config.timezones) ||
      config.timezones.some((timezone) => typeof timezone !== "string")
    ) {
      throw new Error("Config timezones must be an array of strings.");
    }

    result.timezones = config.timezones;
  }

  return result;
}

export async function loadConfig(
  configPath = "timewarp-ci.config.json"
): Promise<TimewarpConfig | null> {
  const resolvedConfigPath = isAbsolute(configPath)
    ? configPath
    : resolve(process.cwd(), configPath);

  try {
    return parseConfigJson(await readFile(resolvedConfigPath, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
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
    const startedAt = Date.now();
    const result = await commandRunner(command, args, timezone);
    results.push({
      ...result,
      durationMs: result.durationMs ?? Date.now() - startedAt
    });
  }

  return results;
}

export function formatJsonReport(
  command: string,
  args: string[],
  results: CommandRunResult[]
): string {
  return JSON.stringify(
    {
      command: [command, ...args].join(" "),
      results: results.map((result) => ({
        timezone: result.timezone,
        status: result.exitCode === 0 ? "passed" : "failed",
        exitCode: result.exitCode,
        durationMs: result.durationMs ?? 0
      }))
    },
    null,
    2
  );
}

export function formatMatrixResults(results: CommandRunResult[]): string {
  const longestTimezone = Math.max(
    ...results.map((result) => result.timezone.length)
  );

  return results
    .map((result) => {
      const icon = result.exitCode === 0 ? "PASS" : "FAIL";
      const status = result.exitCode === 0 ? "passed" : "failed";
      return `${icon} ${result.timezone.padEnd(longestTimezone)}  ${status}`;
    })
    .join("\n");
}

export async function runCli(
  args: string[],
  version = packageJson.version,
  commandRunner: CommandRunner = runCommand,
  configLoader: ConfigLoader = loadConfig
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

  let config: TimewarpConfig | null = null;

  try {
    config =
      parsed.configPath || !parsed.command
        ? await configLoader(parsed.configPath)
        : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      stdout: "",
      stderr: `${message}\n`,
      exitCode: 1
    };
  }

  const commandText = parsed.command ?? config?.command;

  if (!commandText) {
    return {
      stdout: "",
      stderr:
        "Missing command. Use: timewarp-ci run -- <command> or add timewarp-ci.config.json\n",
      exitCode: 1
    };
  }

  let command = parsed.command;
  let commandArgs = parsed.args;

  if (!command) {
    const parsedCommand = parseCommandString(commandText);
    command = parsedCommand.command;
    commandArgs = parsedCommand.args;
  }

  const timezones = parsed.timezones ?? config?.timezones ?? defaultTimezones;
  const results = await runTimezoneMatrix(
    command,
    commandArgs,
    timezones,
    commandRunner
  );
  const hasFailure = results.some((result) => result.exitCode !== 0);

  return {
    stdout:
      parsed.reportFormat === "json"
        ? `${formatJsonReport(command, commandArgs, results)}\n`
        : `${formatMatrixResults(results)}\n`,
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
