import { describe, expect, it } from "vitest";
import {
  collectDiagnostics,
  formatDiagnosticsJson,
  formatDiagnosticsText,
  formatGitHubReport,
  formatJsonReport,
  formatMatrixResults,
  getHelpText,
  getVersionText,
  isTimeZoneSupported,
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
    expect(result.stdout).toContain("timewarp-ci doctor [--json]");
    expect(result.stdout).toContain(
      "timewarp-ci run [--config <path>] [--report <format>] [--timezone <tz>] -- <command>"
    );
    expect(result.stdout).toContain("Output format: text, json, or github.");
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

  it("parses doctor commands", () => {
    expect(parseCliArgs(["doctor"])).toEqual({
      kind: "doctor",
      reportFormat: "text"
    });
    expect(parseCliArgs(["doctor", "--json"])).toEqual({
      kind: "doctor",
      reportFormat: "json"
    });
  });

  it("reports unknown doctor options", async () => {
    const result = await runCli(["doctor", "--bad"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown doctor option: --bad");
  });

  it("parses run commands with GitHub reports", () => {
    expect(parseCliArgs(["run", "--report", "github", "--", "npm", "test"]))
      .toEqual({
        kind: "run",
        command: "npm",
        args: ["test"],
        timezones: undefined,
        configPath: undefined,
        reportFormat: "github"
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
    expect(result.stderr).toContain(
      "Report format must be text, json, or github."
    );
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

  it("detects supported timezones", () => {
    expect(isTimeZoneSupported("Etc/UTC")).toBe(true);
    expect(isTimeZoneSupported("Not/A_Timezone")).toBe(false);
  });

  it("collects diagnostics", () => {
    const diagnostics = collectDiagnostics({ TZ: "Etc/UTC" });

    expect(diagnostics.nodeVersion).toBe(process.version);
    expect(diagnostics.platform).toBe(process.platform);
    expect(diagnostics.arch).toBe(process.arch);
    expect(diagnostics.tzEnv).toBe("Etc/UTC");
    expect(diagnostics.defaultTimezones).toContainEqual({
      timezone: "Etc/UTC",
      supported: true
    });
  });

  it("formats diagnostics text", () => {
    expect(
      formatDiagnosticsText({
        nodeVersion: "v20.0.0",
        platform: "linux",
        arch: "x64",
        tzEnv: null,
        resolvedTimeZone: "UTC",
        defaultTimezones: [{ timezone: "Etc/UTC", supported: true }],
        warnings: ["TZ is not set in the current environment."]
      })
    ).toContain("TZ env: (not set)");
  });

  it("formats diagnostics JSON", () => {
    expect(
      JSON.parse(
        formatDiagnosticsJson({
          nodeVersion: "v20.0.0",
          platform: "linux",
          arch: "x64",
          tzEnv: "Etc/UTC",
          resolvedTimeZone: "UTC",
          defaultTimezones: [{ timezone: "Etc/UTC", supported: true }],
          warnings: []
        })
      )
    ).toEqual({
      nodeVersion: "v20.0.0",
      platform: "linux",
      arch: "x64",
      tzEnv: "Etc/UTC",
      resolvedTimeZone: "UTC",
      defaultTimezones: [{ timezone: "Etc/UTC", supported: true }],
      warnings: []
    });
  });

  it("formats GitHub reports with failure annotations", () => {
    expect(
      formatGitHubReport([
        { timezone: "Etc/UTC", exitCode: 0 },
        { timezone: "America/New_York", exitCode: 1 }
      ])
    ).toBe(
      "::error title=timewarp-ci America/New_York failed::Timezone America/New_York failed with exit code 1.\nPASS Etc/UTC           passed\nFAIL America/New_York  failed"
    );
  });

  it("escapes GitHub report annotation values", () => {
    expect(
      formatGitHubReport([{ timezone: "Test:Zone,Percent%", exitCode: 2 }])
    ).toBe(
      "::error title=timewarp-ci Test%3AZone%2CPercent%25 failed::Timezone Test:Zone,Percent%25 failed with exit code 2.\nFAIL Test:Zone,Percent%  failed"
    );
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

  it("prints doctor diagnostics", async () => {
    const result = await runCli(["doctor"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("timewarp-ci diagnostics");
    expect(result.stdout).toContain(`Node: ${process.version}`);
  });

  it("prints doctor diagnostics as JSON", async () => {
    const result = await runCli(["doctor", "--json"]);
    const diagnostics = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(diagnostics.nodeVersion).toBe(process.version);
    expect(diagnostics.defaultTimezones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          timezone: "Etc/UTC",
          supported: true
        })
      ])
    );
  });

  it("prints GitHub reports", async () => {
    const result = await runCli(
      ["run", "--report", "github", "-t", "Etc/UTC", "--", "npm", "test"],
      "0.0.1-test",
      async (_command, _args, timezone) => ({
        timezone,
        exitCode: 1,
        durationMs: 7
      })
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "::error title=timewarp-ci Etc/UTC failed::Timezone Etc/UTC failed with exit code 1."
    );
    expect(result.stdout).toContain("FAIL Etc/UTC  failed");
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
