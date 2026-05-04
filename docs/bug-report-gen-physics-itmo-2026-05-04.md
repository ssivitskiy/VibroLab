# Bug Report — `gen.physics.itmo.ru` VibroLab Deployment

**Audit date:** 2026-05-04  
**Audited target:** `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/`  
**Repository state at audit time:** `main @ 5cd42d6`

## Summary

The public deployment on `gen.physics.itmo.ru` is not aligned with the current repository state. As of 2026-05-04, the live instance still exhibits issues that are already fixed in `main`, including broken subpath API routing, a non-dismissible onboarding overlay, and stale frontend asset versions.

The deployment should be treated as a separate environment that has not yet been updated to the current application version.

## Repository Baseline

Current `main` already contains the relevant fixes:

- `b1ca9c9` — `fix: support subpath api and static routing`
- `9938964` — `fix: restore onboarding close behavior`
- `5cd42d6` — `chore: bust frontend cache for subpath fix`

These commits together cover:

- subpath-aware frontend API base resolution
- backend support for `/demonstrations/vibrolab/app/*`
- fixed onboarding close behavior
- asset version bumps for `style.css`, `config.js`, and `app.js`

## Current Public State

Observed on the live site on 2026-05-04:

- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/api/health` returns `404 Not Found`
- the public site still loads old frontend assets such as `js/app.js?v=20260419-ux-pass-2`
- the onboarding dialog remains visible after clicking the `×` close button
- the legacy offline/server-unavailable state is still present in the deployed UI
- query-driven routes such as `?page=profile` and `?page=diag&demo=normal` did not resolve to the expected application states during the audit session

## Findings

### 1. Critical — Prefixed API endpoint is not deployed

**URL**

- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/api/health`

**Expected**

- `200 OK`
- health JSON payload from the VibroLab backend

**Actual**

- `404 Not Found`
- response body identifies `nginx/1.24.0 (Ubuntu)`

**Impact**

- all server-backed features are effectively unavailable
- profile, save/history, monitoring, and report-related flows cannot work correctly

### 2. High — Public deployment is stale relative to `main`

**Evidence**

- the live page still loads `js/app.js?v=20260419-ux-pass-2`
- current repository `main` already contains newer fixes and cache-busted asset references
- bugs fixed in `9938964` and `5cd42d6` are still visible on the public deployment

**Impact**

- the public instance does not reflect the current application state
- debugging by repository content alone is misleading until this deployment is updated

### 3. High — Onboarding overlay cannot be dismissed

**Reproduction**

1. Open `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/`
2. Wait for the first-run onboarding overlay
3. Click the `×` close button

**Expected**

- the onboarding dialog closes
- the user can access the underlying page

**Actual**

- the dialog remains visible
- the close button receives focus, but the overlay is not hidden

**Known root cause**

This matches the CSS bug fixed in commit `9938964`, where the overlay backdrop had a hard `display:flex` rule that overrode the `hidden` attribute.

### 4. High — Query-based routes are not honored reliably on the public deployment

**Observed routes**

- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/?page=profile`
- `https://gen.physics.itmo.ru/demonstrations/vibrolab/app/?page=diag&demo=normal`

**Expected**

- `?page=profile` should open the profile view
- `?page=diag&demo=normal` should open the analysis page with the demo case applied

**Actual during audit**

- the home/landing view remained visible
- onboarding still appeared on top
- expected target states were not surfaced reliably

**Impact**

- deep links and shared entry points are unreliable
- guided flows and support/debug links are harder to trust

### 5. High — Legacy backend-offline state is still visible in production

**Observed**

- the deployed UI still contains the legacy offline/server-unavailable messaging

**Impact**

- production users still see a degraded state that should already be resolved by the current repository version
- this reinforces that the environment is not running the current build

## Likely Cause

The `gen.physics.itmo.ru` deployment appears to be a separate environment that has not been updated to the current repository `main`.

Possible contributing causes:

- the environment still serves older frontend static assets
- backend code has not been updated to the subpath-aware version
- reverse proxy does not route `/demonstrations/vibrolab/app/api/*` to the VibroLab backend
- browser/proxy/CDN cache may still be holding older asset versions

## Required Update

The target environment should be updated to `main @ 5cd42d6` or newer.

Minimum required changes:

- deploy updated backend from `python/backend/`
- deploy updated frontend static files from `web/`
- set `VIBROLAB_PUBLIC_BASE_PATH=/demonstrations/vibrolab/app`
- rebuild/restart the VibroLab app service
- ensure reverse proxy forwards the application subpath correctly
- purge or bypass stale cache for updated frontend assets

## Acceptance Criteria

The bug is resolved only when all of the following are true:

- `GET /demonstrations/vibrolab/app/api/health` returns `200`
- the onboarding dialog closes via `×`, `Escape`, and backdrop click
- `?page=profile` opens the profile page reliably
- `?page=diag&demo=normal` opens the analysis flow reliably
- the public deployment no longer serves stale `20260419-*` frontend asset versions
- profile/save/history/monitoring features no longer fail due to missing backend routing

## Suggested Follow-up

- update the separate `gen.physics.itmo.ru` deployment from current `main`
- verify reverse proxy configuration for the application subpath
- perform a cache purge after deployment
- re-run browser smoke tests on the production URL after rollout
