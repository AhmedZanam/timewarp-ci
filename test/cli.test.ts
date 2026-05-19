import { describe, expect, it } from "vitest";
import { getHelpText, getVersionText, runCli } from "../src/cli.js";

describe("cli", () => {
  it("prints help with no args", () => {
    const result = runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("timewarp-ci --version");
  });

  it("prints help for --help", () => {
    expect(runCli(["--help"]).stdout).toBe(`${getHelpText()}\n`);
  });

  it("prints the package version for --version", () => {
    const result = runCli(["--version"], "0.0.1-test");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${getVersionText("0.0.1-test")}\n`);
    expect(result.stderr).toBe("");
  });

  it("reports unknown options", () => {
    const result = runCli(["--timezone"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown option: --timezone");
  });
});
