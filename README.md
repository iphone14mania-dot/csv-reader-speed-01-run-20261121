# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/iphone14mania-dot/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/iphone14mania-dot/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for make.fun's csv-reader 1.0.0: reads broken CSV files exactly as csv-reader does — the same `{columns, rows, errors}` on every case, including stray CRs, quote junk, unterminated quotes, short and long rows, BOMs and CRLF — but about 5x faster on the practice set. One left-to-right pass, no caching between cases: each unquoted field is found with a short index scan and taken with one slice instead of a character at a time, and each quoted field is found with `indexOf('"')` and taken with one slice, collapsing `""` and converting CR/CRLF inside quotes only when present.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

The harness runs `node main.ts` with the cases at `/input/cases.json`; it answers each with `run` from `solve.js` and writes `/output/answers.json`. Outside a container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`.

## Verification (measured locally, Node 24, practice set of 6 cases, 10.2 MB)

- Practice set: **6/6 cases identical** to csv-reader 1.0.0 (canonical JSON comparison against the kit's `practice/reference/expected.json`).
- Differential fuzzing against the reference: **5,000 random cases + 3,000 longer random cases + 82 targeted edge cases, 0 mismatches**.
- Speed (CPU time for `run` over all 6 cases, interleaved A/B, 11 rounds each): **median 129 ms vs 657 ms for the house baseline — 5.1x faster**. The house numbers in the rules (csv-reader 1.38 s, papaparse 0.78 s, d3-dsv 0.73 s, csv-parser 0.72 s per set under gVisor) are the reference points; this entry answers identically where those public tools do not.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fcek93em&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
