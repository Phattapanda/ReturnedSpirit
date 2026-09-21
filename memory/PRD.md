# PRD — A Returned Spirit

## Original problem statement
User asked to copy their GitHub repo (Phattapanda/ReturnedSpirit) into the
Emergent workspace without changing it, then keep it in sync with their GitHub
updates. Subsequently: enable the in-app Support screen to actually send
support-request emails.

## App overview
"A Returned Spirit" — an Expo / React Native tavern crafting RPG with a FastAPI +
MongoDB backend. Client-side game systems (cooking, garden, dungeon, city,
merchant, quests, mailbox, progression). Local save via async storage.

## Architecture
- Frontend: Expo Router (file-based routes under frontend/app), game logic under
  frontend/src/game, screens/components under frontend/src.
- Backend: FastAPI (backend/server.py) with routers; MongoDB via motor.
- Email: Emergent managed email service (Resend proxy) for support requests.

## Environment adaptation (only change vs upstream repo)
- Removed `"packageManager": "npm@11.17.0"` from frontend/package.json so the
  preview (which launches via Yarn) can start Metro. Re-applied after every
  `git reset --hard origin/main` sync. App code otherwise identical to GitHub.

## Implemented (with dates)
- 2026-09-16: Cloned repo into workspace, verified it runs in preview (commit fee4301).
- 2026-09-19/21: Synced to latest GitHub commits (0ea9702, then 328b2b2).
- 2026-09-21: Support email feature — converted `POST /api/support` from Gmail
  SMTP to Emergent managed email. Sends support request to fixed owner address
  (arcades.soijanda@gmail.com) and an automatic confirmation to the player when
  an email is provided. Guardrail gate on every send; 10/hour quota (counted only
  on valid requests). Tested: backend 7/7, frontend 2/2 (testing_agent iteration 41).

## Core requirements (static)
- Keep workspace app runnable in preview.
- Support screen must send emails reliably without user-provided secrets.

## Backlog / remaining
- P1: Custom sender domain for support emails (currently managed default sender).
- P2: Screenshot forwarding in support emails (managed service has no attachments).
- P2: Shared gateway rate limit for public multi-worker deployment.

## Next tasks
- On future GitHub updates: fetch origin/main, reset --hard, re-remove
  packageManager line, reinstall, restart expo.
