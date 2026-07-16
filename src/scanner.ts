import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

export type ScanFinding = {
  file: string;
  line: number;
  column: number;
  rule: ScanRule;
  message: string;
};

export type ScanRule =
  | "system-clock"
  | "date-string"
  | "local-time";

type RiskPattern = {
  rule: ScanRule;
  pattern: RegExp;
  message: string;
};

const sourceExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts"
]);
const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules"
]);
const riskPatterns: RiskPattern[] = [
  {
    rule: "system-clock",
    pattern: /\bDate\.now\s*\(\s*\)|\bnew\s+Date\s*\(\s*\)/g,
    message: "System-clock access can make date-sensitive tests nondeterministic."
  },
  {
    rule: "date-string",
    pattern:
      /\b(?:new\s+Date|Date\.parse)\s*\(\s*(["'`])[^\r\n]*?\1\s*\)/g,
    message: "String-based date parsing can vary by format or timezone."
  },
  {
    rule: "local-time",
    pattern:
      /\.(?:get|set)(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\s*\(/g,
    message: "Local-time access depends on the process timezone."
  }
];

export function scanSource(source: string, file: string): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const { rule, pattern, message } of riskPatterns) {
    pattern.lastIndex = 0;

    for (const match of source.matchAll(pattern)) {
      const index = match.index;
      const beforeMatch = source.slice(0, index);
      const line = beforeMatch.split("\n").length;
      const lastNewline = beforeMatch.lastIndexOf("\n");

      findings.push({
        file,
        line,
        column: index - lastNewline,
        rule,
        message
      });
    }
  }

  return findings.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.rule.localeCompare(right.rule)
  );
}

async function collectSourceFiles(path: string): Promise<string[]> {
  const pathStat = await stat(path);

  if (pathStat.isFile()) {
    return sourceExtensions.has(extname(path)) ? [path] : [];
  }

  if (!pathStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    if (entry.isDirectory() || sourceExtensions.has(extname(entry.name))) {
      files.push(...(await collectSourceFiles(resolve(path, entry.name))));
    }
  }

  return files;
}

export async function scanPath(
  inputPath = ".",
  cwd = process.cwd()
): Promise<ScanFinding[]> {
  const root = resolve(cwd, inputPath);
  const files = await collectSourceFiles(root);
  const findings: ScanFinding[] = [];

  for (const file of files) {
    const displayPath = relative(cwd, file).replace(/\\/g, "/") || inputPath;
    findings.push(...scanSource(await readFile(file, "utf8"), displayPath));
  }

  return findings;
}

export function formatScanText(findings: ScanFinding[]): string {
  if (findings.length === 0) {
    return "No date risks found.";
  }

  const lines = findings.map(
    (finding) =>
      `${finding.file}:${finding.line}:${finding.column}  ${finding.rule}  ${finding.message}`
  );

  return [
    ...lines,
    "",
    `${findings.length} date risk${findings.length === 1 ? "" : "s"} found.`
  ].join("\n");
}

export function formatScanJson(findings: ScanFinding[]): string {
  return JSON.stringify({ findings }, null, 2);
}
