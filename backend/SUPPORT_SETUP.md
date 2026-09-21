# Emergent support email setup

The existing FastAPI app exposes `POST /api/support`. Messages go from and to
`arcades.soijanda@gmail.com`. The optional player email becomes Reply-To only.
No player account, email address or email app is required.

## Required deployment configuration

1. Install backend requirements and restart the backend.
2. Enable Google 2-Step Verification and create a Gmail app password if available
   for this account: https://support.google.com/accounts/answer/185833
3. Store it as `SUPPORT_GMAIL_APP_PASSWORD` in Emergent's **backend secrets**.
   Never put it in an EXPO_PUBLIC variable, Git, the frontend or a chat message.
4. Set frontend `EXPO_PUBLIC_BACKEND_URL` to the actual HTTPS Emergent backend
   origin (no trailing `/api`). Restart/rebuild Expo after changing this value.
5. Confirm the hosting service permits outbound TLS SMTP to smtp.gmail.com:465.
   If blocked, use a separately approved email API provider; do not disable TLS.
6. Configure ingress request limits (maximum body 5 MB, short request timeouts,
   rate limiting). The relay has a conservative 10-attempt/hour **per-process**
   quota. Multiple workers need a shared gateway quota before public rollout.

## Privacy and verification

The application does not persist submissions or IP addresses. Screenshots are
validated and re-encoded, stripping EXIF/GPS and original filenames. They can
still contain personal information in visible pixels. Gmail retains delivered
messages. Review Emergent/proxy access-log retention and publish an appropriate
privacy notice; omission of a contact address is not a guarantee of anonymity.

The client keeps its draft on failure and never retries automatically. SMTP
acceptance is not a delivery/read receipt. A lost response can occur after mail
was accepted, so manually retrying can produce a duplicate.

Test on the deployed service with and without reply address, with a screenshot,
cancelled picker, invalid email, oversize/invalid image, absent SMTP secret,
offline mode and quota exceeded. Confirm inbox delivery and Reply-To manually.
No live message was sent during local development.
