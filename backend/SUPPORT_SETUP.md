# Support email setup (Emergent managed email)

The FastAPI app exposes `POST /api/support`. A player submits a message and an
optional reply address. The support request is emailed to the fixed owner
address `arcades.soijanda@gmail.com`. When the player supplies an email address,
an automatic confirmation is sent back to them.

Email is sent through **Emergent's managed email service** — no Gmail account,
SMTP server or app password is required.

## Configuration (already set in backend/.env)

- `EMERGENT_EMAIL_KEY` — provisioned by the platform (do not expose to frontend).
- `EMAIL_FROM_NAME="A Returned Spirit"` — the visible sender display name.
- `EMAIL_REPLY_TO` (optional) — an owner inbox used as Reply-To.

The sender email address itself is managed by the platform and cannot be changed.
To send from your own domain later, verify a domain and update the integration.

## Behaviour & privacy

- Recipient (owner) and email bodies are fixed server-side — the client can never
  choose them (not an open relay).
- The player's message and optional reply address are included only in the email
  to the owner. The confirmation email to the player uses a fixed template and
  does not echo the player's message.
- Screenshots selected in the app are **not** forwarded: the managed email
  service does not support attachments. The owner email notes that a screenshot
  was attached in-app.
- A conservative process-wide quota of 10 valid requests/hour limits abuse. For a
  public multi-worker deployment, add a shared gateway rate limit.
- The app does not persist submissions or IP addresses.

## Testing

Use `delivered@resend.dev` as the reply address to test without emailing a real
inbox. A successful call returns `{"accepted": true}` (HTTP 200); the managed
proxy returns `202 Accepted` per send.
