# Sup! to SkillLane Timesheet Automation

Local automation for turning daily Sup! stand-up updates into a monthly SkillLane Excel timesheet.

## What It Does

- Reads your Sup! response from Slack Web with your existing browser session.
- Stores one JSON record per report date in a cloud-synced folder.
- Generates the `Timesheet - Standard Hours` sheet from the official SkillLane `.xlsx` template.
- Preserves your raw Sup! wording, including tags such as `[Meeting]`, `[Testing]`, and `[Develop]`.
- Keeps Slack login/session data local in `auth/slack-profile/`.

## Setup

```powershell
pnpm install
Copy-Item config/config.example.json config/config.local.json
```

Edit `config/config.local.json`:

- `slack.workspaceUrl`
- `slack.channelUrl`
- `slack.displayName`
- `storage.rootDirectory`
- staff/template information if needed

Put the official SkillLane workbook in:

```text
templates/7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx
```

or pass it explicitly:

```powershell
pnpm template:inspect --template "D:\Downloads\7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx"
```

## Commands

```powershell
pnpm slack:login
pnpm collect --date 2026-07-10
pnpm generate --month 2026-07 --template "templates/7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx"
pnpm validate --month 2026-07 --workbook "data/output/2026/07/Skilllane - TimeSheet 202607 - Nattachai Satitchai.xlsx"
```

## Google SSO Login

If Google says `This browser or app may not be secure`, do not try to bypass it. Use your normal Chrome session instead:

1. Start Chrome with remote debugging:

```powershell
pnpm chrome:debug
```

2. Login to Slack/Google in that Chrome window normally.

This uses a separate local browser profile under `auth/chrome-debug-profile`, so it will not disturb your everyday Chrome profile.

4. Add this to `config/config.local.json`:

```json
"browser": {
  "headless": false,
  "profileDirectory": "./auth/slack-profile",
  "channel": "chrome",
  "cdpUrl": "http://127.0.0.1:9222"
}
```

5. Run collection while that Chrome window is still open:

```powershell
pnpm collect --date 2026-07-10
```

For Excel-only development with fixture data:

```powershell
pnpm generate --month 2026-07 --template "templates/7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx" --data tests/fixtures/july-2026.json
```

## Sup! Detail Format

Write tags directly in Sup! when you want categorized output:

```text
Yesterday
[Meeting]
Sprint planning
[Testing]
Regression New Feature 3.5

Today
[Develop]
Pre-enrollment test script
```

The automation preserves these lines. It does not summarize or rewrite your work.

## Security Notes

- Do not commit `auth/`, `logs/`, `.env`, `*.local.json`, or `output/`.
- Do not place `auth/slack-profile/` in OneDrive, Google Drive, or Git.
- Use company-approved cloud storage for `storage.rootDirectory` because it contains internal work details.

## Current Limitations

- MVP fills `Timesheet - Standard Hours` automatically.
- `Timesheet - Overtime Hours` is optional and is filled only when overtime entries exist for that month.
- Slack collection uses browser automation and may need selector tuning for your workspace.
- Excel generation depends on the official `.xlsx` template, not the PDF export.
- PDF export uses Microsoft Excel on Windows and writes `Skilllane - TimeSheet YYYYMM - Staff Name.pdf`.

## Overtime Hours (Optional)

If you worked overtime, create a month file at:

```text
data/overtime/2026/07/overtime.json
```

Example:

```json
{
  "schemaVersion": 1,
  "month": "2026-07",
  "entries": [
    {
      "date": "2026-07-09",
      "timeIn": "18:00",
      "timeOut": "20:00",
      "includedLunchTime": "NO",
      "detail": "[Testing]\nRegression overtime"
    }
  ]
}
```

During `pnpm generate` or Desktop **Generate Timesheet**:

- If `overtime.json` is missing or `entries` is empty, the Overtime sheet is removed from the generated workbook.
- If the template has no `Timesheet - Overtime Hours` sheet, it is skipped safely.
- Default overtime time settings live in `config/config.local.json` under `timesheet`.

## Desktop App / Installer

Build and run the desktop app locally:

```powershell
pnpm desktop
```

Build the Windows installer:

```powershell
pnpm desktop:dist
```

The installer is written to:

```text
release/Sup Timesheet Automation Setup 0.2.3.exe
```

The app stores user settings per Windows user and writes daily JSON files to the configured cloud data folder. This makes it suitable for multiple computers as long as each installation points to the same OneDrive/Google Drive/company-synced folder.

First-run behavior:

- Creates a default data folder under `Documents/SupTimesheetAutomation`.
- Copies the bundled SkillLane template into `Documents/SupTimesheetAutomation/templates`.
- Stores per-machine settings in the Windows app data folder.
- Starts with Windows if enabled in Settings.

Recommended multi-machine setup:

1. Install the app on each computer.
2. On first launch, choose **Use Google Drive** if Google Drive for Desktop is installed.
3. The app creates `SupTimesheetAutomation` inside your Google Drive sync folder and stores a copy of `settings.json` there.
4. On another PC, install Google Drive, sign in with the same account, then open the app and choose **Use Google Drive** again.

If Google Drive is not installed, the app shows a download link and you can use **Use this PC only** until Drive is ready.

Settings panel:

- **Use Google Drive** — auto-detects the sync folder and sets `{Drive}/SupTimesheetAutomation`.
- **Cloud data folder** — override manually if needed.
- **Template folder** — defaults to `{data folder}/templates` and copies the bundled SkillLane workbook on first use.

Per-machine app settings still live in `%APPDATA%`, but profile fields (name, site, working days, holidays) sync via `{Cloud data folder}/settings.json`.
