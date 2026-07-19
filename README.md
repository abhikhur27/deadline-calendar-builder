# Deadline Calendar Builder

Node CLI that turns a deadline CSV into two artifacts:

- an `.ics` calendar you can import into Google Calendar, Outlook, or Apple Calendar
- a Markdown review sheet grouped by due date

This is meant for real workflow use, not a browser-only portfolio toy. If you already have assignments in a spreadsheet, this turns them into something schedulable in one command.

## Why It Exists

- Course platforms and team trackers often export data that is readable but not calendar-ready.
- Deadlines are easier to miss when they stay trapped in CSV or LMS tables.
- A review sheet is useful when you want one artifact for planning and another for import.

## Input Shape

Expected CSV columns:

- `title` required
- `due_date` required, format `YYYY-MM-DD`
- `due_time` optional, format `HH:MM`
- `course` optional
- `duration_minutes` optional
- `notes` optional
- `url` optional
- `location` optional
- `reminder_minutes` optional

If `due_time` is omitted, the row becomes an all-day calendar event.

## Usage

```bash
node cli.js ./example.csv --out finals.ics --summary finals.md --timezone America/Chicago --default-duration 90 --default-reminder 180 --min-gap-hours 18
```

If you want the review sheet to flag overloaded days for triage:

```bash
node cli.js ./example.csv --out finals.ics --summary finals.md --max-day-load 240
```

Or after a global install:

```bash
npm install -g .
deadline-calendar-builder ./example.csv --out finals.ics --summary finals.md
```

## Example CSV

```csv
title,due_date,due_time,course,duration_minutes,notes,url,location,reminder_minutes
Signals project checkpoint,2026-09-18,23:59,EE 3302,30,Upload the writeup,https://example.com/checkpoint,,180
Operating systems midterm,2026-09-22,14:00,CS 4348,120,Bring formula sheet,,ECSS 2.102,1440
Scholarship application,2026-09-25,,General,60,Submit before end of day,https://example.com/apply,,240
```

## Outputs

- `deadlines.ics`: calendar events with reminders
- `deadlines.md`: review sheet with one row per deadline plus grouped daily windows, course totals, overloaded-day warnings, short-turnaround alerts between close deadlines, and duplicate-looking row warnings before import

## Sanity Checks

```bash
npm run check
npm test
```

## Portfolio Positioning

- Project type: Node.js workflow utility
- Stack truth: JavaScript, Node.js, CLI, calendar-file generation
- Best use: move real deadline data from CSV into a calendar and a planning sheet without retyping it
