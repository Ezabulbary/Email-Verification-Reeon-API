# 📧 Email Verification Dashboard — Reoon API (Admin + User roles)

A standalone web dashboard (Node.js + Express + SQLite) that runs the same tools as the
Google Sheets automation, without Google Sheets:

| Tool | Google Sheet menu item | Dashboard |
|---|---|---|
| ⚡ Bulk Lead List Clean (7 accounts, daily credits only) | `🚀 Lead List Clean` | List page → **Lead List Clean** |
| ✉️ Verify Account Emails (per account, admin only) | `✉️ Verify Account Emails` | List page → **Verify with this account** (admins only) |
| 🔄 Check Pending Results / 🗑️ Clear Pending Tasks | same | Overview / List page |
| 🧹 Clean Decision Makers (keywords, seniority, industry, departments, country) | `🧹 Clean Decision Makers` | **Clean Decision Makers** page |
| 🤖 Company Names Cleaner (OpenAI GPT, batches of 100) | `🔄 Start Cleaning Company Names` | **Company Name Cleaner** page |
| 📊 info tab (activity log / misuse monitoring) | `info` sheet | **Activity Log** page |
| 🔃 Refresh & Show All Credits | same | **Credits** page + header pill |
| 📖 Guideline / Help | same | **Guideline / Help** page |

Instead of sheet tabs, users **upload CSV / XLSX files** ("lists"), run the tools, and
**download** the result as CSV or XLSX.

> The original Google Apps Script code is kept **unchanged** in `google-apps-script/`
> (that folder is in `.gitignore`, so it is never committed).

---

## 👥 Roles

| | **Admin** | **User** |
|---|---|---|
| Upload own lists, run Lead List Clean / Decision Makers / Company Cleaner | ✅ | ✅ |
| Download results (CSV / XLSX) | ✅ | ✅ |
| See credit totals per account | ✅ | ✅ |
| See activity log | all users | own only |
| See lists | all users' lists | own only |
| ✉️ Verify Account Emails (per-account, uses instant credits too) | ✅ | 🔒 locked |
| Manage users (create / role / reset password / deactivate / delete) | ✅ | ❌ |
| Manage Reoon API keys + OpenAI key/model | ✅ | ❌ |
| Clear *all* pending tasks | all | own only |

---

## 🚀 Setup (5 minutes)

Requirements: **Node.js 18+** (tested on Node 22).

```bash
# 1. install dependencies
npm install

# 2. create your config
cp .env.example .env
#    edit .env → set SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
#    and (optionally) API_KEY_<account> keys + CHATGPT_API_KEY

# 3. start
npm start
#    → http://localhost:3000
```

Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. The first admin is created automatically on
first start (only when the database is empty). To create/promote an admin later:

```bash
npm run create-admin -- admin@example.com StrongPassword "Admin Name"
```

### API keys

* **Reoon accounts** — either put them in `.env` as `API_KEY_<name>=...` (same names as the
  sheet tabs: `emailastrallc`, `emranhossain`, `alimranshourov`, `aminsohel`, `amin`,
  `support`, `tool`) before the first start, **or** add/edit them any time in
  **Admin → API Keys & Settings**. Accounts can be enabled/disabled individually.
* **OpenAI** — `CHATGPT_API_KEY` in `.env` or **Admin → API Keys & Settings**. The model
  defaults to `gpt-4o-mini` (the sheet version used `gpt-3.5-turbo`; change it in Settings).

All data (users, keys, lists, activity) lives in `data/dashboard.sqlite`. Back up the
`data/` folder to keep everything.

---

## 📁 Project structure

```
server/
  index.js                 Express app, static files, error handler
  config.js                .env → config
  db.js                    SQLite schema + first-admin / API-key seeding
  auth.js                  cookie sessions, login rate-limit, requireAuth / requireAdmin
  routes/
    auth.js                login / logout / me / change password
    users.js               (admin) user management
    settings.js            (admin) Reoon accounts, OpenAI key & model
    lists.js               upload, view, download, rename, delete, clear "Pending..." rows
    verify.js              credits, Lead List Clean, Verify Account (admin), pending tasks
    tools.js               Decision Makers, Company Cleaner, Activity log
  services/
    reoon.js               Reoon API client + credit cache        (Code.gs: getCreditBalance…)
    leadListCleaner.js     Lead List Clean, Verify Emails, poller  (LeadListCleaner.gs + verifyEmails)
    decisionMaker.js       filter logic                            (Code.gs: runDecisionMakerFilter…)
    companyCleaner.js      GPT batch cleaning job                  (CompanyNameCleaner.gs)
    activityLog.js         the "info" tab                          (Code.gs: logTaskToInfoSheet…)
    lists.js               list/row storage, column helpers
    fileParser.js          CSV / XLSX import & export
    workers.js             background intervals (= time-based triggers)
  scripts/createAdmin.js
public/
  index.html, app.js, styles.css, dm-data.js (filter data from decision_maker.html)
google-apps-script/        original Sheets code — untouched, git-ignored
data/                      SQLite database (created on first run, git-ignored)
```

---

## 🛠 How the sheet behaviours were mapped

* **Sheet tab → List.** `Verification Status` and `Verification Date` columns are inserted
  right after `Email` when missing, exactly like the sheet code.
* **Time-based triggers → background intervals.** Pending Reoon tasks are polled every
  `POLL_INTERVAL_SECONDS` (default 60 s) plus a fast 10-second poll for ~100 s right after
  submission (like the in-script aggressive poll). Company cleaning runs as a background job
  in batches of 100 rows and resumes automatically after a server restart.
* **PropertiesService / CacheService → SQLite tables** (`pending_tasks`, `credit_cache`,
  `settings`, `clean_jobs`).
* **`"Pending..."` rows** are still the marker used to write results back. Orphaned
  `Pending...` rows (no active task) can be cleared from the list page.
* **Info sheet → `activity` table** with the same 11 columns.
* **Admin lock** (`ezabulb@gmail.com` hard-coded in the sheet) → the `admin` role.

---

## 🔒 Security notes

* Passwords are bcrypt-hashed; sessions are signed, `httpOnly`, `SameSite=Lax` cookies.
* Login is rate-limited (10 attempts / 15 min per IP + email).
* API keys are stored in the local SQLite database and only ever shown masked.
* Run behind HTTPS (e.g. nginx / Caddy reverse proxy) if exposed to the internet, and set a
  strong `SESSION_SECRET`.

---

## 📄 License

Private internal tool — Reachoutly / Reoon API integration.
