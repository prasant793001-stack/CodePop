# CodePop

Source: <https://github.com/prasant793001-stack/CodePop>

A kid-friendly web app (and installable Android app) for learning **C++** and **HTML**: live line-by-line explanations, 8 themes, 4 spoken languages, plus an **Arena** with level challenges, groups and duels, a Top 10, and hidden-code detection of AI-copied answers.

Two ways to run it:

| | What you get | Needs |
|---|---|---|
| `dist/index.html` | The **demo**: one file, open it anywhere. The Arena runs against a built-in practice backend (practice friends, local data). | nothing |
| **The server** (this repo) | Real Google sign-in, shared leaderboard, groups between real people, server-side judging, secured reviewer console, installable PWA. | Node 20+, HTTPS host, a Google client ID |

## 1. Run it locally (2 minutes)

```bash
npm run install:server          # installs the server's 4 dependencies
npm run dev                     # http://localhost:3000, with a "dev login" instead of Google
```

Open http://localhost:3000, tap **🏆 Arena**, enter a name, play. To rebuild the web app after editing `src/`: `npm run build` (downloads the font packages once).

## 2. Google sign-in (one-time, about 10 minutes)

1. Go to <https://console.cloud.google.com>, create a project.
2. **APIs & Services > OAuth consent screen**: user type *External*, app name *CodePop*, add your email. Publish it ("In production") so any Google account can sign in.
3. **Credentials > Create credentials > OAuth client ID > Web application**.
   - *Authorized JavaScript origins*: `https://your-domain` (and `http://localhost:3000` for local tests).
   - No redirect URI and no client secret are needed (the app verifies Google ID tokens on the server).
4. Copy the **Client ID** into `GOOGLE_CLIENT_ID`.

## 3. Deploy

Any host that runs Node or Docker works. HTTPS is required for Google sign-in and for the Android install.

- **Render**: *New > Blueprint*, pick this GitHub repo (uses `render.yaml`: Docker, 1 GB disk, generated `MARKER_SECRET`). Add `GOOGLE_CLIENT_ID` and `ADMIN_EMAILS` in the dashboard. The Dockerfile builds the web app itself, so a fresh clone deploys with no pre-built files.
- **Docker anywhere**: `docker build -t codepop . && docker run -p 3000:3000 -v codepop-data:/data -e MARKER_SECRET=$(openssl rand -hex 32) -e GOOGLE_CLIENT_ID=... -e ADMIN_EMAILS=you@gmail.com -e TRUST_PROXY=1 codepop`
- **A plain VPS**: copy `.env.example` to `.env`, fill it in, `npm run build && npm run install:server && npm start` behind nginx/Caddy for HTTPS (`dist/` is build output and is not committed).

Environment variables are listed in `.env.example`. In production the server refuses to start without `MARKER_SECRET`. Keep `MARKER_SECRET` stable, and back up `DATA_DIR` (one SQLite file).

### Android install

Open the deployed site in Chrome on Android: the **📲 Install** button appears in the header (and *⋮ > Install app* works too). It installs as a full-screen app with its own icon and works offline for free coding. iPhone: Share > *Add to Home Screen*. To list it on Google Play, wrap the same URL with [PWABuilder](https://www.pwabuilder.com) (Trusted Web Activity).

## 4. How the challenges are scored

Score = **correctness** (hidden tests, re-run on the server) + **technique bonus** (the skill each challenge teaches, up to ~20%) + **speed bonus** (up to 10%), minus **errors** (3% each), **auto-fixes** (8% each), **solutions viewed** (3% each) and **tips used** (2% each). 16 challenges in 4 levels (100 / 200 / 350 / 500 points) for C++ and HTML; solving one challenge opens the next level. The Top 10 and group standings use each player's best verified score per challenge.

## 5. Spotting AI-copied answers

Every challenge carries **3 hidden codes in 3 places**, unique to the player and the challenge (HMAC of `MARKER_SECRET`, player, challenge, slot):

1. invisible characters inside the title,
2. invisible characters plus a visually hidden instruction in the task text,
3. invisible characters plus a visually hidden instruction in the examples block.

If a player copies the task into an AI, the hidden parts travel with it and the AI tends to follow them (name a variable, add a first-line comment). When that code comes back in the submission, the attempt is flagged and **held for review**. Detection also combines softer signals: copy-then-paste telemetry, mostly-pasted code, impossible typing speed, impossibly fast solves.

Be honest with yourself about the limits:

- It only fires if the AI echoes the hidden parts. A screenshot, retyping, or deleting a stray comment defeats it.
- A flag means *under review*, never *guilty*. Flagged attempts earn nothing until a reviewer clears them (one tap), and the player is told why without ever seeing the codes.
- Treat the Arena as fair-play friction for a kids' app, not exam-grade proctoring.

## 6. The hidden reviewer console

Normal players never see it, and its API answers `404` to everyone else.

- Set `ADMIN_EMAILS` to the Google emails that may review. The email must be **verified by Google**.
- Optional: `ADMIN_IPS` restricts it to given IP addresses.
- Reviewer actions need a sign-in newer than 8 hours (the API replies `reauth` otherwise).
- The **🛡️ Review** tab then appears in the Arena: a queue of held attempts (code, reasons, typing telemetry), clear/reject, and a player search to open a player's **saved projects**.
- **Every reviewer read is written to the `audit` table and shown to the player** under *Me > Who looked at my projects*. Reviewers cannot look quietly.

## 7. Security notes

Sessions: random 256-bit id in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie, stored hashed. CSRF: custom header plus same-origin check on every write. Google ID tokens verified server-side (audience-checked). Helmet CSP, HSTS, no framing. Per-IP and per-user rate limits. Submissions are judged in worker threads with time and memory limits. Nicknames are sanitised; avatars are emoji; Google photos are never shown; public names are first name + last initial. Players can export or delete everything (*Me > Account*).

"Fully secured" cannot be promised by software alone: before real users arrive, get an independent security review, run the host behind HTTPS with automatic updates, and back up `DATA_DIR`.

## 8. Kids and privacy

The server keeps: Google account id, email (reviewer matching only), name (reduced to a nickname), code the player submits or saves, and scores. No ads, no trackers, no third-party analytics. If players under 13 (or under your country's age of digital consent) will sign in, you need a privacy notice and **parental consent** under the rules that apply to you (COPPA, GDPR-K, India's DPDP Act and similar). This repo does not do that for you.

## 9. Tests

`npm run build && npm test` runs 550 checks: the C++ interpreter (50), HTML linter (34), shared core and scoring (74), UI (62), Arena and layout in a browser DOM including a run against the real server (100), Push to GitHub against a fake GitHub API (87), and the server API end to end (142).

## 10. Push to GitHub (for players)

Players can send their code to a GitHub repo they own: tap the **🐙** button in the editor toolbar, or **Arena > Me > My projects** (current code, or any saved project). The code lands as `<project-name>/index.html` or `<project-name>/main.cpp` (editable) in a normal commit.

How it works, and why it is built this way:

- The browser talks **straight to `api.github.com`** with the player's **own fine-grained token**. The token never reaches the CodePop server, is never written to `localStorage`, state, or the data export, and lives in memory (or in `sessionStorage` until the tab closes, only if the player ticks the box). The server's CSP allows `https://api.github.com` in `connect-src` and nowhere else.
- The dialog links to a prefilled GitHub token page: *Contents: Read and write*, 30-day expiry. The player picks **Only select repositories** and chooses one repo, so a leaked token can touch only that repo for a month.
- Repo, branch and file path are validated locally before anything is sent. Existing files are updated (the file's `sha` is looked up first); an empty repo gets its first commit.
- It is blocked while a challenge is running. Challenge code is only pushed if the player does it after finishing.
- If GitHub cannot be reached (offline, or a locked-down page such as the demo preview), the dialog offers **Download file** and **Copy code** instead.

Limits to be honest about:

- One file per push, and it does not create repos or sign anyone in. A token pasted into any web page is only as safe as that page; short expiry and single-repo tokens are the mitigation. "Sign in with GitHub" would need a GitHub OAuth app and a server-side secret, and can be added later.
- GitHub accounts are for ages 13 and up. Pushing to a **public** repo publishes the code to everyone; the dialog nudges toward private repos.
- The browser-to-GitHub CORS preflight was not exercised against the live GitHub API in development (tests use a fake API); GitHub documents CORS support for its REST API.

## Layout

```
src/            app (engines, explainer, editor, UI parts in src/app/), style.css, template.html
shared/core.js  challenges, hidden codes, judge, scoring, integrity assessment (used by browser AND server)
server/         Express API, SQLite, Google verification, worker judge
public/         manifest, service worker, icons (copied to dist/web)
build/          bundler (dist/index.html demo, dist/web server build), icon generator
test/           all test suites
```
