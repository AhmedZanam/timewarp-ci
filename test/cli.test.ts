import { describe, expect, it } from "vitest";
import {
  formatJsonReport,
  formatMatrixResults,
  getHelpText,
  getVersionText,
  parseCommandString,
  parseCliArgs,
  parseConfigJson,
  runCli,
  runCommand,
  runTimezoneMatrix
} from "../src/cli.js";

describe("cli", () => {
  it("prints help with no args", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("timewarp-ci --version");
    expect(result.stdout).toContain(
      "timewarp-ci run [--config <path>] [--report <format>] [--timezone <tz>] -- <command>"
    );
  });

  it("prints help for --help", async () => {
    await expect(runCli(["--help"])).resolves.toMatchObject({
      stdout: `${getHelpText()}\n`
    });
  });

  it("prints the package version for --version", async () => {
    const result = await runCli(["--version"], "0.0.1-test");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${getVersionText("0.0.1-test")}\n`);
    expect(result.stderr).toBe("");
  });

  it("reports unknown options", async () => {
    const result = await runCli(["--timezone"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown option: --timezone");
  });

  it("parses run commands after --", () => {
    expect(parseCliArgs(["run", "--", "npm", "test"])).toEqual({
      kind: "run",
      command: "npm",
      args: ["test"],
      timezones: undefined,
      configPath: undefined,
      reportFormat: "text"
    });
  });

  it("parses run commands with custom timezones", () => {
    expect(
      parseCliArgs([
        "run",
        "--timezone",
        "Etc/UTC",
        "-t",
        "Europe/Berlin",
        "--",
        "npm",
        "test"
      ])
    ).toEqual({
      kind: "run",
      command: "npm",
      args: ["test"],
      timezones: ["Etc/UTC", "Europe/Berlin"],
      configPath: undefined,
      reportFormat: "text"
    });
  });

  it("parses run commands with config paths", () => {
    expect(
      parseCliArgs(["run", "--config", "custom.json", "--", "npm", "test"])
    ).toEqual({
      kind: "run",
      command: "npm",
      args: ["test"],
      timezones: undefined,
      configPath: "custom.json",
      reportFormat: "text"
    });
  });

  it("parses run commands with json reports", () => {
    expect(parseCliArgs(["run", "--report", "json", "--", "npm", "test"]))
      .toEqual({
        kind: "run",
        command: "npm",
        args: ["test"],
        timezones: undefined,
        configPath: undefined,
        reportFormat: "json"
      });
  });

  it("reports missing config values", async () => {
    const result = await runCli(["run", "--config", "--", "npm", "test"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing value for --config");
  });

  it("reports missing report values", async () => {
    const result = await runCli(["run", "--report", "--", "npm", "test"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing value for --report");
  });

  it("reports invalid report formats", async () => {
    const result = await runCli([
      "run",
      "--report",
      "xml",
      "--",
      "npm",
      "test"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Report format must be text or json.");
  });

  it("reports missing timezone values", async () => {
    const result = await runCli(["run", "--timezone", "--", "npm", "test"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing value for --timezone");
  });

  it("reports unknown run options", async () => {
    const result = await runCli(["run", "--unknown", "--", "npm", "test"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown run option: --unknown");
  });

  it("reports missing run commands", async () => {
    const result = await runCli(["run"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Missing command. Use: timewarp-ci run -- <command> or add timewarp-ci.config.json"
    );
  });

  it("parses config command strings", () => {
    expect(parseCommandString("npm test -- --runInBand")).toEqual({
      command: "npm",
      args: ["test", "--", "--runInBand"]
    });
  });

  it("parses valid config JSON", () => {
    expect(
      parseConfigJson(
        JSON.stringify({
          command: "npm test",
          timezones: ["Etc/UTC", "Europe/Berlin"]
        })
      )
    ).toEqual({
      command: "npm test",
      timezones: ["Etc/UTC", "Europe/Berlin"]
    });
  });

  it("reports invalid config JSON", () => {
    expect(() => parseConfigJson("{")).toThrow("Could not parse config JSON");
  });

  it("reports invalid config shapes", () => {
    expect(() =>
      parseConfigJson(JSON.stringify({ command: ["npm", "test"] }))
    ).toThrow("Config command must be a string.");
    expect(() =>
      parseConfigJson(JSON.stringify({ timezones: ["Etc/UTC", 7] }))
    ).toThrow("Config timezones must be an array of strings.");
  });

  it("runs a command for each timezone", async () => {
    const calls: string[] = [];
    const results = await runTimezoneMatrix(
      "npm",
      ["test"],
      ["Etc/UTC", "Europe/Berlin"],
      async (command, args, timezone) => {
        calls.push(`${timezone}:${command} ${args.join(" ")}`);
        return { timezone, exitCode: 0, durationMs: 0 };
      }
    );

    expect(calls).toEqual(["Etc/UTC:npm test", "Europe/Berlin:npm test"]);
    expect(results).toEqual([
      { timezone: "Etc/UTC", exitCode: 0, durationMs: 0 },
      { timezone: "Europe/Berlin", exitCode: 0, durationMs: 0 }
    ]);
  });

  it("formats timezone matrix results", () => {
    expect(
      formatMatrixResults([
        { timezone: "Etc/UTC", exitCode: 0 },
        { timezone: "America/New_York", exitCode: 1 }
      ])
    ).toBe("PASS Etc/UTC           passed\nFAIL America/New_York  failed");
  });

  it("formats JSON reports", () => {
    expect(
      JSON.parse(
        formatJsonReport("npm", ["test"], [
          { timezone: "Etc/UTC", exitCode: 0, durationMs: 12 },
          { timezone: "America/New_York", exitCode: 1, durationMs: 34 }
        ])
      )
    ).toEqual({
      command: "npm test",
      results: [
        {
          timezone: "Etc/UTC",
          status: "passed",
          exitCode: 0,
          durationMs: 12
        },
        {
          timezone: "America/New_York",
          status: "failed",
          exitCode: 1,
          durationMs: 34
        }
      ]
    });
  });

  it("returns a failing CLI exit code when any timezone fails", async () => {
    const result = await runCli(
      ["run", "--", "npm", "test"],
      "0.0.1-test",
      async (_command, _args, timezone) => ({
        timezone,
        exitCode: timezone === "America/New_York" ? 1 : 0
      })
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("PASS Etc/UTC");
    expect(result.stdout).toContain("FAIL America/New_York");
  });

  it("runs only requested timezones", async () => {
    const calls: string[] = [];
    const result = await runCli(
      ["run", "-t", "Etc/UTC", "-t", "Europe/Berlin", "--", "npm", "test"],
      "0.0.1-test",
      async (command, args, timezone) => {
        calls.push(`${timezone}:${command} ${args.join(" ")}`);
        return { timezone, exitCode: 0 };
      }
    );

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["Etc/UTC:npm test", "Europe/Berlin:npm test"]);
  });

  it("prints JSON reports", async () => {
    const result = await runCli(
      ["run", "--report", "json", "-t", "Etc/UTC", "--", "npm", "test"],
      "0.0.1-test",
      async (_command, _args, timezone) => ({
        timezone,
        exitCode: 0,
        durationMs: 7
      })
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      command: "npm test",
      results: [
        {
          timezone: "Etc/UTC",
          status: "passed",
          exitCode: 0,
          durationMs: 7
        }
      ]
    });
  });

  it("runs commands from config", async () => {
    const calls: string[] = [];
    const result = await runCli(
      ["run"],
      "0.0.1-test",
      async (command, args, timezone) => {
        calls.push(`${timezone}:${command} ${args.join(" ")}`);
        return { timezone, exitCode: 0 };
      },
      async () => ({
        command: "npm test",
        timezones: ["Etc/UTC", "Europe/Berlin"]
      })
    );

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["Etc/UTC:npm test", "Europe/Berlin:npm test"]);
  });

  it("uses config timezones with explicit commands", async () => {
    const calls: string[] = [];
    const result = await runCli(
      ["run", "--config", "timewarp-ci.config.json", "--", "npm", "test"],
      "0.0.1-test",
      async (command, args, timezone) => {
        calls.push(`${timezone}:${command} ${args.join(" ")}`);
        return { timezone, exitCode: 0 };
      },
      async () => ({
        timezones: ["Asia/Tokyo"]
      })
    );

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["Asia/Tokyo:npm test"]);
  });

  it("reports config loading errors", async () => {
    const result = await runCli(
      ["run"],
      "0.0.1-test",
      async () => ({ timezone: "Etc/UTC", exitCode: 0 }),
      async () => {
        throw new Error("Could not parse config JSON: bad JSON");
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("Could not parse config JSON: bad JSON\n");
  });

  it("runs successful child processes", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.exit(0)"],
      "Etc/UTC"
    );

    expect(result).toEqual({
      timezone: "Etc/UTC",
      exitCode: 0
    });
  });

  it("runs failing child processes", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.exit(7)"],
      "America/New_York"
    );

    expect(result).toEqual({
      timezone: "America/New_York",
      exitCode: 7
    });
  });
});
