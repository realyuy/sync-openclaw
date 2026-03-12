# sync-openclaw Usage

## What It Does

`sync-openclaw` compares another OpenClaw instance or backup-style directory against the current one and builds a conservative sync plan.

Default behavior is intentionally cautious:

- default mode is `preview`
- `--dry-run` does not execute sync writes
- timestamped reports avoid overwriting older reports
- local/custom modules are called out explicitly

## Prerequisites

- Node.js 18+
- `HOME` must be set
- read access to the source path
- write access to the target path if you later move beyond preview
- OpenClaw CLI is useful for verification, but preview/reporting can still help without it

## Entry Points

```bash
node index.js <command> [options]
node scripts/sync.js [options]
```

## Commands

| Command | Meaning |
|---|---|
| `sync` | Main sync workflow |
| `compare` | Compare source and target |
| `plan` | Build a sync plan from comparison data |
| `verify` | Verify sync results |

## Modes

| Mode | Meaning |
|---|---|
| `preview` | Scan and plan only; default and safest |
| `selective` | Choose modules and strategies interactively |
| `full` | Include all detected differences |
| `minimal` | Only core config-style modules |

## Strategies

| Strategy | Meaning |
|---|---|
| `replace` | Replace target content |
| `merge` | Merge JSON/config-like content |
| `append` | Append where appropriate |
| `skip` | Do not sync; safest default |

## Common Commands

### Show top-level help

```bash
node index.js --help
```

### Show sync help

```bash
node scripts/sync.js --help
```

### Safe preview against the same directory

```bash
node scripts/sync.js --source ~/.openclaw --target ~/.openclaw --mode preview --dry-run
```

### Compare only

```bash
node index.js compare -s ~/.openclaw -t ~/.openclaw
```

### Build a plan

```bash
node index.js plan --help
```

### Verify results

```bash
node index.js verify --help
```

### Selective preview

```bash
node scripts/sync.js --source /path/to/source --target ~/.openclaw --mode selective --dry-run
```

## What Preview Should Show

A useful preview should include:

- source and target paths
- detected modules and whether they differ
- local/custom modules that may not belong on every machine
- recommended conservative strategies
- warnings for risky replace behavior or version mismatch concerns

## Reports And State

- Report file: `~/.openclaw/SYNC-REPORT-YYYYMMDD-HHMMSS.md`
- State file: `~/.openclaw/.sync-state.json`

Notes:

- report filenames are timestamped
- preview should not behave like a blind overwrite tool
- state is for workflow continuity, not for dry-run surprises

## Compare Behavior

The compare script scans up to depth 25 and emits lightweight progress messages so large trees do not look hung.

## Safety Notes

- Start with `preview --dry-run`
- Treat `replace` as an explicit choice, not a default habit
- Be careful with machine-specific modules such as scripts, agents, workflows, and Obsidian-linked content
- Do not assume secrets, OAuth sessions, or device-bound auth can be safely copied

## Troubleshooting

### `HOME` is empty

The script exits early and asks you to set `HOME`.

```bash
export HOME=/Users/yourname
```

### Compare looks slow

That is expected on large trees. Depth is higher now, and progress messages should appear during scanning.

### Same source and target still show modules

That is normal if the tool is reporting detected modules, even when the final status is effectively `same` or `none`.

## Suggested Test Flow

```bash
node index.js --help
node scripts/sync.js --help
node scripts/sync.js --source ~/.openclaw --target ~/.openclaw --mode preview --dry-run
node index.js compare -s ~/.openclaw -t ~/.openclaw
node index.js plan --help
node index.js verify --help
```
