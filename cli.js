#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {
  buildCalendar,
  buildMarkdownSummary,
  parseDeadlineCsv,
  parseOptions,
} = require('./lib');

function printHelp() {
  console.log(`deadline-calendar-builder

Usage:
  deadline-calendar-builder <input.csv> [--out deadlines.ics] [--summary deadlines.md]
    [--timezone America/Chicago] [--default-duration 60] [--default-reminder 120]
    [--max-day-load 240]

Expected CSV columns:
  title,due_date,due_time,course,duration_minutes,notes,url,location,reminder_minutes

Notes:
  - due_date accepts YYYY-MM-DD
  - due_time is optional; omit it for all-day deadline entries
  - duration_minutes and reminder_minutes are optional numeric columns
  - max-day-load flags overloaded calendar days in the review sheet
`);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const options = parseOptions(args.slice(1));
  const csvText = fs.readFileSync(inputPath, 'utf8');
  const deadlines = parseDeadlineCsv(csvText, options);
  if (!deadlines.length) {
    throw new Error('No valid deadline rows were found in the CSV.');
  }

  const icsText = buildCalendar(deadlines, options);
  const summaryText = buildMarkdownSummary(deadlines, options);
  const outputPath = path.resolve(options.out || 'deadlines.ics');
  const summaryPath = path.resolve(options.summary || 'deadlines.md');

  fs.writeFileSync(outputPath, icsText, 'utf8');
  fs.writeFileSync(summaryPath, summaryText, 'utf8');

  console.log(`Wrote ${deadlines.length} calendar item(s) to ${outputPath}`);
  console.log(`Wrote review summary to ${summaryPath}`);
}

try {
  main();
} catch (error) {
  console.error(`deadline-calendar-builder: ${error.message}`);
  process.exitCode = 1;
}
