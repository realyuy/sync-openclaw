# sync-openclaw

A conservative incremental sync helper for OpenClaw installations.

It compares a **source** OpenClaw tree (another machine, a restored backup folder, etc.) against a **target** OpenClaw tree and produces a cautious plan.

Safe defaults:

- default mode is `preview`
- `--dry-run` does **not** execute destructive writes
- reports are timestamped (won’t overwrite older ones)
- machine-specific modules are flagged

## What it’s for

Use `sync-openclaw` when you need to:

- compare two OpenClaw directories and understand differences
- generate a module-level plan with strategies (skip/merge/append/replace)
- run verification checks after a sync

## Directory layout

```
sync-openclaw/
  SKILL.md
  USAGE.md
  README.md
  index.js
  package.json
  references/
    sync-checklist.md
  scripts/
    sync.js
    compare.js
    plan.js
    verify.js
    config.json
```

## Install

Copy this folder into your OpenClaw workspace skills directory:

```bash
cp -R sync-openclaw ~/.openclaw/workspace/skills/
```

## Quick start

### Help

```bash
node index.js --help
node scripts/sync.js --help
```

### Safest preview (source == target)

```bash
node scripts/sync.js --source ~/.openclaw --target ~/.openclaw --mode preview --dry-run
```

### Compare only

```bash
node index.js compare -s ~/.openclaw -t ~/.openclaw
```

### Plan / Verify

```bash
node index.js plan --help
node index.js verify --help
```

## Minimal smoke test

```bash
node index.js --help
node scripts/sync.js --help
node scripts/sync.js --source ~/.openclaw --target ~/.openclaw --mode preview --dry-run
node index.js compare -s ~/.openclaw -t ~/.openclaw
node index.js plan --help
node index.js verify --help
```

## Output files

- Report: `~/.openclaw/SYNC-REPORT-YYYYMMDD-HHMMSS.md`
- Workflow state: `~/.openclaw/.sync-state.json`

## Notes

- `compare.js` scans up to depth 25 and prints throttled progress hints so large trees don’t look hung.
- If `HOME` is not set, the script exits early with a clear error.

## More details

See `USAGE.md` for full parameter list and examples.
