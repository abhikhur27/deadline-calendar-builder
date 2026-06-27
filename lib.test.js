const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCalendar,
  buildMarkdownSummary,
  parseDeadlineCsv,
} = require('./lib');

test('parseDeadlineCsv sorts deadlines and applies defaults', () => {
  const csv = [
    'title,due_date,due_time,course',
    'Second item,2026-09-19,13:30,CS 4348',
    'First item,2026-09-18,,MATH 2418',
  ].join('\n');

  const deadlines = parseDeadlineCsv(csv, { defaultDuration: 45, defaultReminder: 90 });
  assert.equal(deadlines.length, 2);
  assert.equal(deadlines[0].title, 'First item');
  assert.equal(deadlines[0].durationMinutes, 45);
  assert.equal(deadlines[0].reminderMinutes, 90);
});

test('buildCalendar emits timed and all-day events', () => {
  const deadlines = parseDeadlineCsv(
    [
      'title,due_date,due_time,course,duration_minutes,reminder_minutes',
      'Midterm,2026-09-22,14:00,CS 4348,120,1440',
      'Application,2026-09-25,,General,60,240',
    ].join('\n'),
    {}
  );

  const ics = buildCalendar(deadlines, { timezone: 'America/Chicago' });
  assert.match(ics, /DTSTART;TZID=America\/Chicago:20260922T140000/);
  assert.match(ics, /DTEND;TZID=America\/Chicago:20260922T160000/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260925/);
  assert.match(ics, /TRIGGER:-PT1440M/);
});

test('buildMarkdownSummary groups daily windows', () => {
  const deadlines = parseDeadlineCsv(
    [
      'title,due_date,due_time,course,duration_minutes',
      'Checkpoint,2026-09-18,23:59,EE 3302,45',
      'Midterm,2026-09-22,14:00,CS 4348,180',
      'Lab writeup,2026-09-22,18:00,CS 4348,90',
    ].join('\n'),
    {}
  );

  const summary = buildMarkdownSummary(deadlines, { timezone: 'America/Chicago', maxDayLoad: 240 });
  assert.match(summary, /# Deadline Review Sheet/);
  assert.match(summary, /\| 2026-09-18 23:59 \| EE 3302 \| Checkpoint/);
  assert.match(summary, /- 2026-09-22: CS 4348: Midterm \(14:00\); CS 4348: Lab writeup \(18:00\) \[270 min scheduled\]/);
  assert.match(summary, /- CS 4348: 2 item\(s\) \| 270 min planned/);
  assert.match(summary, /Overloaded days above 240 min: 2026-09-22 \(270 min\)/);
});

test('buildMarkdownSummary flags short turnaround deadlines', () => {
  const deadlines = parseDeadlineCsv(
    [
      'title,due_date,due_time,course,duration_minutes',
      'Lab writeup,2026-09-22,20:00,CS 4348,90',
      'Quiz retake,2026-09-23,08:00,CS 4348,30',
      'Project demo,2026-09-26,09:00,CS 4348,45',
    ].join('\n'),
    {}
  );

  const summary = buildMarkdownSummary(deadlines, { minGapHours: 18 });
  assert.match(summary, /Consecutive deadlines inside 18 hour\(s\):/);
  assert.match(summary, /Lab writeup \(2026-09-22 20:00\) -> CS 4348: Quiz retake \(2026-09-23 08:00\) \(12h gap\)/);
});
