import { describe, expect, it } from "vitest";
import {
  formatMatrixResults,
  getHelpText,
  getVersionText,
  parseCliArgs,
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
      "timewarp-ci run [--timezone <tz>] -- <command>"
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
      timezones: ["Etc/UTC", "America/New_York", "Europe/Berlin", "Asia/Tokyo"]
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
      timezones: ["Etc/UTC", "Europe/Berlin"]
    });
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
      "Missing command. Use: timewarp-ci run -- <command>"
    );
  });

  it("runs a command for each timezone", async () => {
    const calls: string[] = [];
    const results = await runTimezoneMatrix(
      "npm",
      ["test"],
      ["Etc/UTC", "Europe/Berlin"],
      async (command, args, timezone) => {
        calls.push(`${timezone}:${command} ${args.join(" ")}`);
        return { timezone, exitCode: 0 };
      }
    );

    expect(calls).toEqual(["Etc/UTC:npm test", "Europe/Berlin:npm test"]);
    expect(results).toEqual([
      { timezone: "Etc/UTC", exitCode: 0 },
      { timezone: "Europe/Berlin", exitCode: 0 }
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
