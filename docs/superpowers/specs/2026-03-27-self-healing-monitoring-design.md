# Self-Healing Monitoring Loop Design

## Overview

Automated monitoring system that generates production monitors from code changes and self-tunes to reduce false positives. Two components: a post-deploy skill that generates monitoring rules, and an enhanced operations bot that evaluates those rules against live data.

## Decisions

- **Monitor generator trigger:** Separate `/generate-monitors` skill invoked after `/deploy`
- **Monitor type:** Scheduled Claude Code agent (not CloudWatch alarms) — AI judgment for triage
- **Rules storage:** Version-controlled `monitoring/rules.json` in the repo
- **Agent architecture:** Single operations bot with two phases (evaluate monitors → work issues)
- **Risk gating:** Only generate monitors for substantive changes (Lambda, infra, API, worker logic). Skip UI/styling/docs.

## Architecture

### Component 1: `/generate-monitors` skill (post-deploy)

Reads the deploy diff, assesses risk level, and generates/updates monitoring rules.

**Risk classification:**

High risk (generate monitors):
- Lambda code changes (`infra/lambda/*.py`)
- Infrastructure changes (`infra/*.tf`)
- API client changes (`src/api/*.ts`)
- Worker/simulation logic changes (`src/simulation/*.ts`)
- New dependencies added (`package.json`, `package-lock.json`)

Low risk (skip monitor generation):
- UI components, styling, CSS, layout changes
- Copy/text changes
- Docs, specs, plans (`docs/`, `*.md`)
- Version bumps
- Config files (`.gitignore`, `vite.config.ts` proxy entries)

**Flow:**
1. Read `git diff` of the deploy (commits since last `deploy_commit` in rules.json)
2. Classify changed files by risk level
3. If no high-risk changes → skip, log "low risk deploy, no monitor updates"
4. If high-risk changes → analyze the code changes with AI judgment
5. Generate rules: what metric to watch, what threshold, which Lambda/endpoint
6. Merge with existing rules (update existing, add new, remove rules for deleted code)
7. Commit updated `monitoring/rules.json`

### Component 2: Enhanced operations bot

**Phase 1 — Monitor evaluation (new):**
1. Read `monitoring/rules.json`
2. Fetch `/api/monitor` for current metrics
3. Evaluate each rule against live data
4. For violations:
   a. Attempt reproduction (hit endpoint, check logs, verify the issue is real)
   b. If reproducible → create GitHub issue with full context (rule, metric values, reproduction steps)
   c. If not reproducible → increment rule `sensitivity` (require more consecutive violations before alerting), commit updated rules.json
5. Notify on Telegram with results

**Phase 2 — Issue resolution (existing, unchanged):**
1. Check GitHub for new issues
2. Send implementation plan to Telegram for approval
3. Implement fix, deploy
4. Celebrate

### Rules file format (`monitoring/rules.json`)

```json
{
  "generated_at": "2026-03-27T09:00:00Z",
  "deploy_commit": "abc123",
  "rules": [
    {
      "id": "nve-proxy-errors",
      "name": "NVE Proxy error rate",
      "metric": "error_rate",
      "lambda": "pow-predictor-nve-proxy",
      "condition": "< 5",
      "sensitivity": 2,
      "consecutive_violations": 0,
      "source": "infra/lambda/nve_proxy.py",
      "created_by_commit": "abc123",
      "last_tuned": null
    }
  ]
}
```

**Rule fields:**
- `id` — unique identifier
- `name` — human-readable description
- `metric` — which metric from `/api/monitor` to evaluate (`error_rate`, `total_errors`, `avg_duration`, `smoke.site.ok`, etc.)
- `lambda` — which Lambda function (if applicable)
- `condition` — threshold expression (e.g. `< 5` means "should be less than 5")
- `sensitivity` — how many consecutive violations before alerting (starts at 2, increases on false positives)
- `consecutive_violations` — current streak count
- `source` — which source file this rule monitors
- `created_by_commit` — deploy commit that created this rule
- `last_tuned` — timestamp of last sensitivity adjustment

## Files changed

| File | Change |
|------|--------|
| `.claude/skills/generate-monitors/skill.md` | New skill — analyzes deploy diff, generates monitoring rules |
| `monitoring/rules.json` | Auto-generated monitoring rules (version controlled) |
| `.claude/skills/operations-bot/skill.md` | Add Phase 1: read rules, evaluate against live data, triage |

## Out of Scope

- CloudWatch alarms (may add later for instant hard-failure alerts)
- Custom metrics beyond what `/api/monitor` already provides
- Authentication on the monitor endpoint
- Historical trend analysis
