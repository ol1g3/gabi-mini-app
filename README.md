# Kiosk Survey

A small iPad-friendly survey kiosk. A respondent taps a **product size**
(100 ml / 250 ml) and a **price** (€2,49 / €2,99 / €3,49) and submits. Every
response is saved and shown in a **results dashboard**, and can also be emailed
to you.

```
  index/kiosk.*   →  the survey screen (open this on the iPad)
  /dashboard      →  results dashboard
  server.js       →  Express server + JSON storage + optional email
```

## 1. Setup

```bash
npm install
```

(Optional) copy `cp .env.example .env` only if you want to change the port or
enable email — no other setup is needed.

## 2. Run on the laptop

Start the server:

```bash
npm start
```

On the laptop itself you can open it at `http://localhost:3000/`.

## 3. Open it on the iPad

The iPad can't use `localhost` (that points to the iPad itself) — it has to use
the **laptop's Wi-Fi IP**. Both devices must be on the **same Wi-Fi**.

Run this on the laptop to print the exact URL to type on the iPad:

```bash
echo "http://$(ipconfig getifaddr en0):3000/"
```

It prints something like `http://192.168.1.42:3000/`. Then:

1. On the iPad, open **Safari** and go to that URL.
2. Tap the **Share** button → **Add to Home Screen** to launch it full-screen,
   like an app, with no browser bars. Great for a kiosk.

> If `en0` returns nothing, you're probably on a different interface — try
> `ipconfig getifaddr en1`, or run `ifconfig | grep "inet "` and use the
> `192.168.x.x` / `10.x.x.x` address.

After each submission a brief "Thank you! Saved ✓" confirmation appears and the
form immediately reloads for the next person.

## 4. The dashboard

Tap **View dashboard** (top-right of the survey page) or go to
`http://<computer-ip>:3000/dashboard`. No password — you get:

- Total responses + the most-chosen size and price
- Bar charts for each question
- A **size × price** cross-tab heatmap
- A full table of every response
- **Export CSV** button

## 5. Email (optional — currently off)

Email is wired up but disabled until you add SMTP credentials. Responses are
always saved to the dashboard either way. To also receive an email per response,
fill in the `SMTP_*` and `EMAIL_TO` values in `.env` (there's a ready-made Gmail
example in `.env.example`) and restart. The startup log will then say
`Email: ENABLED`.

## 6. Changing the questions

Edit the `SURVEY` object near the top of `server.js`. The kiosk and dashboard
both read from it, so adding/renaming options updates everything.

## Where data lives

Every submission is written to two files at the repo root (created on first
submit, both **tracked in git**):

- `responses.jsonl` — one JSON object per line (for the dashboard / data).
- `responses.txt` — a plain-text, human-readable log you can just open and read,
  e.g.

  ```
  [6/24/2026, 7:42:56 PM]  Which size would you buy? 250 ml  |  What feels like the right price? €2,99
  ```

Each new response is a single added line in both, so you can commit them as a
backup:

```bash
git add responses.jsonl responses.txt && git commit -m "Add survey responses"
```

You can still grab a spreadsheet-friendly copy anytime via the dashboard's
**Export CSV** button.

## Deploying later

To run it somewhere with a public URL (so the iPad works anywhere, not just on
local Wi-Fi), deploy to any Node host (Render, Railway, Fly.io). Set the same
environment variables there. The app listens on `process.env.PORT`.
