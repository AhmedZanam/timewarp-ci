<p align="center">
  <img src="./assets/logo.svg" alt="timewarp-ci logo" width="180" />
</p>

<h1 align="center">timewarp-ci</h1>

<p align="center">
  Run your tests through time.
</p>

<p align="center">
  Catch timezone, DST, leap-day, month-end, and year-end bugs before production.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/timewarp-ci"><img alt="npm" src="https://img.shields.io/npm/v/timewarp-ci"></a>
  <img alt="CI" src="https://img.shields.io/badge/CI-planned-lightgrey">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-ready-blue">
</p>

<p align="center">
  <img src="./assets/hero.svg" alt="timewarp-ci demo" width="720" />
</p>

## Why Time Bugs Escape

Date bugs often pass on one laptop and fail somewhere else: a CI runner in UTC,
a customer in New York, a deploy near month-end, or code that quietly treats a
date-only string as local time.

timewarp-ci is an open-source TypeScript CLI for finding those failures earlier.
The current `v0.1.0` scope runs your test command across a timezone matrix by
setting `TZ` environment variables. It does not claim to globally change system
time.

## Quick Start

Current local development commands:

```sh
npm install
npm run dev -- --help
npm run dev -- --version
npm run dev -- run -- npm test
```

After building, you can run the compiled CLI directly:

```sh
npm run build
node dist/cli.js --help
```

Package usage is intended to support `npx timewarp-ci` once the package is
published.

## Demo Output

The timezone matrix runner uses `TZ` environment variables for each child
process.

<p align="center">
  <img src="./assets/terminal-demo.svg" alt="timewarp-ci terminal output" width="720" />
</p>

```txt
timewarp-ci run -- npm test

✓ Etc/UTC             passed
✓ Europe/Berlin       passed
✗ America/New_York    failed
✓ Asia/Tokyo          passed

Likely issue:
Date-only string parsed as local time.
```

## Why This Exists

Most test suites run in one timezone. Production does not.

timewarp-ci is meant to make timezone and calendar-sensitive testing boring:
simple commands, deterministic output, CI-friendly failures, and no hidden
telemetry. The project starts small so every release can be useful and honest.

## Features

| Status | Feature |
| --- | --- |
| Available in `v0.0.1` | TypeScript CLI package seed |
| Available in `v0.0.1` | `timewarp-ci --help` |
| Available in `v0.0.1` | `timewarp-ci --version` |
| Available in `v0.1.0` | Run a test command across a timezone matrix using `TZ` |
| Planned | Config files, reports, diagnostics, static date-risk scanning, fixed-date mode, and ecosystem adapters |

## GitHub Actions

GitHub Actions support is planned for `v0.3.0`. The runner can still be used in
a standard Node workflow once the package is published:

```yaml
name: timewarp-ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  timezone-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx timewarp-ci run -- npm test
```

## Configuration

Configuration is planned for `v0.2.0`. The expected direction is a small config
file that keeps commands explicit:

```json
{
  "timezones": [
    "Etc/UTC",
    "America/New_York",
    "Europe/Berlin",
    "Asia/Tokyo"
  ],
  "command": "npm test"
}
```

<details>
<summary>Current CLI help</summary>

```txt
timewarp-ci

Usage:
  timewarp-ci [--help]
  timewarp-ci --version

Options:
  --help       Show this help message.
  --version    Show the installed version.
  run -- <command>

Examples:
  timewarp-ci run -- npm test
```

</details>

## Supported Ecosystems

| Ecosystem | Status | Notes |
| --- | --- | --- |
| JavaScript / TypeScript / Node | Initial runner | First target ecosystem |
| GitHub Actions | Planned | Dedicated support planned for `v0.3.0` |
| Playwright | Planned | Adapter planned after fixed-date mode |
| Python / pytest | Planned | Beta later in the roadmap |
| JVM / Go | Planned | Beta later in the roadmap |

## Roadmap

See the full [ROADMAP.md](./ROADMAP.md).

Near-term milestones:

- `v0.0.1`: project seed
- `v0.1.0`: timezone matrix runner
- `v0.2.0`: config and reports
- `v0.3.0`: GitHub Action support

## Limitations

- `v0.1.0` uses timezone matrix testing through `TZ` environment variables.
- timewarp-ci does not globally change system time.
- Fixed-date mode is not implemented yet; it is on the roadmap.
- No telemetry is included.

## Contributing

Contributions should keep the project small, deterministic, and easy to run
locally. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), and keep README
examples accurate when behavior changes.

## License

[MIT](./LICENSE)
