# Email Verification — Reoon API (Google Apps Script)

A powerful, multi-account email verification automation built entirely in **Google Apps Script**, integrated directly into Google Sheets.

---

## 🚀 Features

### ⚡ Bulk Lead List Clean
- Splits unverified emails across **7 Reoon API accounts** in parallel for maximum speed
- Uses **Daily Credits only** to protect paid instant credits
- Fully **non-blocking** — submits tasks and hands off to background triggers (no timeout errors)
- Results written automatically every 1 minute via time-based triggers
- **Auto Recovery** — if task metadata is lost, scans the `info` tab to resume verification

### ✉️ Verify Account Emails
- Per-account individual tab verification
- Submits task and returns immediately — results appear in 1–5 minutes via trigger
- Access restricted to authorized admin only

### 🧹 Clean Decision Makers
- Filters rows to keep top decision makers per company
- Supports filtering by **Title Keywords, Seniority, Department, Industry, Country**
- Prioritizes verified emails (Safe → Role Account → Catch All)
- Outputs to a new `Cleaned — [Sheet Name]` tab

### 🤖 Company Names Cleaner (GPT-Powered)
- Uses **OpenAI GPT API** to strip legal suffixes, locations, and generic business terms
- Processes in batches of **100 rows** with auto-rescheduled triggers — no 6-minute timeout
- Skips already-cleaned rows to prevent overwrites
- Outputs to a new tab named `[user@email], the company name cleaning`

### 📊 Info Tab — Activity Log (Misuse Monitoring)
Tracks **every automation run** by every user with 11 columns:

| Column | Description |
|---|---|
| User Email | Who triggered the automation |
| Function | Which tool was used |
| Sheet | Which tab/sheet was processed |
| Task ID | Reoon API task ID |
| API Account | Which Reoon account handled it |
| Date | Timestamp of the run |
| Task Name | Descriptive name |
| Status | submitted / completed / started |
| Total | Number of emails/rows processed |
| Progress | Completion percentage |
| Action | polling / done |

---

## 📁 File Structure

| File | Purpose |
|---|---|
| `Code.gs` | Core: `verifyEmails`, credit management, menu builder, info sheet logging |
| `LeadListCleaner.gs` | Bulk lead list cleaning, aggressive polling, background trigger handler |
| `CompanyNameCleaner.gs` | GPT-powered company name cleaning in batches |
| `decision_maker.html` | Dialog UI for Decision Maker Filter |
| `GuidelineDialog.html` | In-sheet help & guideline dialog |

---

## ⚙️ Setup

1. Open your Google Sheet → **Extensions → Apps Script**
2. Copy each `.gs` file into a separate Apps Script file
3. Copy `.html` files into HTML files in the editor
4. Go to **Project Settings → Script Properties** and add:
   - `API_KEY_emailastrallc`
   - `API_KEY_emranhossain`
   - `API_KEY_alimranshourov`
   - `API_KEY_aminsohel`
   - `API_KEY_amin`
   - `API_KEY_support`
   - `API_KEY_tool`
   - `CHATGPT_API_KEY` (for Company Name Cleaner)
5. Reload the spreadsheet — the **📧 Email Verifier** menu will appear

---

## 🔒 Access Control

- **Verify Account Emails** submenu is locked for all users except the designated admin
- All activities are logged to the `info` tab for misuse monitoring

---

## 🛡️ Timeout Protection

All functions are protected against Google Apps Script's 6-minute execution limit:
- `verifyEmails` — non-blocking, uses background triggers
- `cleanLeadList` — 100-second in-script poll deadline, then trigger fallback
- `cleanCompanyNames` — 4-minute per-run limit, auto-reschedules
- `checkPendingTaskResults` — 5.5-minute deadline guard

---

## 📄 License

Private internal tool — Reachoutly / Reoon API integration.
