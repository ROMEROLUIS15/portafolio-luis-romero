# Cronix Live Stats — Setup Guide

This document explains how to connect the Cronix repo to the portfolio
so `cronix-stats.json` updates automatically on every push.

---

## How it works

```
push to Cronix main
  → GitHub Action in Cronix fires
    → dispatches event to portafolio_lerh repo
      → GitHub Action in portfolio updates cronix-stats.json
        → Vercel redeploys portfolio
          → live stats visible on site
```

---

## Step 1 — Create a Personal Access Token (PAT)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a token with access to **portafolio_lerh** repo only
3. Permissions needed: **Contents → Read and Write**
4. Copy the token value

---

## Step 2 — Add the PAT as a secret in the Cronix repo

1. Go to the **Cronix repo** → Settings → Secrets and variables → Actions
2. Add a new secret named: `PORTFOLIO_PAT`
3. Paste the token value

---

## Step 3 — Add this workflow to the Cronix repo

Create the file `.github/workflows/notify-portfolio.yml` in the **Cronix repo**:

```yaml
name: Notify Portfolio Stats

on:
  push:
    branches: [main]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Cronix
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Get commit info
        id: info
        run: |
          MSG=$(git log -1 --pretty=%s)
          TYPE=$(echo "$MSG" | grep -oP '^(feat|fix|perf|refactor|security|chore|docs|test)' || echo "feat")
          VERSION=$(cat package.json | jq -r '.version // "1.0.0"')
          echo "msg=$MSG"        >> $GITHUB_OUTPUT
          echo "type=$TYPE"      >> $GITHUB_OUTPUT
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      # ---- Update these numbers manually or read from your DB/files ----
      - name: Dispatch to portfolio
        run: |
          curl -s -X POST \
            -H "Authorization: Bearer ${{ secrets.PORTFOLIO_PAT }}" \
            -H "Accept: application/vnd.github.v3+json" \
            https://api.github.com/repos/ROMEROLUIS15/portafolio_lerh/dispatches \
            -d '{
              "event_type": "cronix-stats-update",
              "client_payload": {
                "appointments_total":    251,
                "appointments_this_month": 38,
                "active_tenants":        4,
                "tests_total":           1600,
                "version":               "${{ steps.info.outputs.version }}",
                "last_commit_msg":       "${{ steps.info.outputs.msg }}",
                "commit_type":           "${{ steps.info.outputs.type }}"
              }
            }'
```

> **Note:** Update `appointments_total`, `appointments_this_month`, `active_tenants`
> and `tests_total` with real values each time, or read them from a file in your repo.
> When you implement Option A (public endpoint), this workflow will fetch them automatically.

---

## Step 4 — Verify the portfolio workflow

The portfolio already has `.github/workflows/update-cronix-stats.yml`.
It listens for the `cronix-stats-update` dispatch event and updates `cronix-stats.json`.

To test manually:
1. Go to portafolio_lerh → Actions → "Update Cronix Stats"
2. Click "Run workflow"
3. Fill in the values and run

---

## Updating stats manually (without Cronix push)

Just edit `cronix-stats.json` directly in the portfolio repo and commit.
The GitHub Action only automates what you could do manually.

## Fields in cronix-stats.json

| Field | Description |
|---|---|
| `appointments_total` | All-time appointments managed autonomously |
| `appointments_this_month` | Appointments in current calendar month |
| `active_tenants` | Businesses using Cronix right now |
| `uptime_pct` | Service uptime percentage |
| `tests_total` | Total tests in the test suite |
| `rls_policies` | PostgreSQL RLS policies |
| `rls_tables` | Tables protected by RLS |
| `edge_functions` | Deno Edge Functions deployed |
| `anti_hallucination_layers` | AI architecture layers (currently 6) |
| `anti_hallucination_mechanisms` | Total mechanisms (~13) |
| `ci_checks` | pgTAP assertions in CI |
| `version` | Cronix version |
| `last_updated` | ISO timestamp of last update |
| `last_commit_msg` | Last commit message from Cronix |
| `changelog` | Array of last 9 updates (date, type, msg) |
