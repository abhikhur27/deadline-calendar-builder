const os = require('node:os');

function parseOptions(args) {
  const options = {
    timezone: 'America/Chicago',
    defaultDuration: 60,
    defaultReminder: 120,
    maxDayLoad: 240,
  };

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`);
    }
    if (value === undefined) {
      throw new Error(`Missing value for ${key}`);
    }

    if (key === '--out') options.out = value;
    else if (key === '--summary') options.summary = value;
    else if (key === '--timezone') options.timezone = value;
    else if (key === '--default-duration') options.defaultDuration = toPositiveInt(value, key);
    else if (key === '--default-reminder') options.defaultReminder = toPositiveInt(value, key);
    else if (key === '--max-day-load') options.maxDayLoad = toPositiveInt(value, key);
    else throw new Error(`Unknown option: ${key}`);

    index += 1;
  }

  return options;
}

function toPositiveInt(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseDeadlineCsv(text, options = {}) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const headers = rows[0].map((value) => normalizeHeader(value));
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row, index) => buildDeadlineRecord(headers, row, index + 2, options))
    .filter(Boolean)
    .sort(compareDeadlines);
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function buildDeadlineRecord(headers, row, lineNumber, options) {
  const record = {};
  headers.forEach((header, index) => {
    record[header] = String(row[index] || '').trim();
  });

  if (!record.title || !record.due_date) {
    throw new Error(`Row ${lineNumber} is missing required title or due_date.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.due_date)) {
    throw new Error(`Row ${lineNumber} has invalid due_date: ${record.due_date}`);
  }
  if (record.due_time && !/^\d{2}:\d{2}$/.test(record.due_time)) {
    throw new Error(`Row ${lineNumber} has invalid due_time: ${record.due_time}`);
  }

  const durationMinutes = record.duration_minutes
    ? toPositiveInt(record.duration_minutes, `Row ${lineNumber} duration_minutes`)
    : options.defaultDuration || 60;
  const reminderMinutes = record.reminder_minutes
    ? toPositiveInt(record.reminder_minutes, `Row ${lineNumber} reminder_minutes`)
    : options.defaultReminder || 120;

  return {
    title: record.title,
    course: record.course || 'General',
    dueDate: record.due_date,
    dueTime: record.due_time || '',
    durationMinutes,
    notes: record.notes || '',
    url: record.url || '',
    location: record.location || '',
    reminderMinutes,
  };
}

function compareDeadlines(left, right) {
  const leftKey = `${left.dueDate} ${left.dueTime || '23:59'} ${left.title}`;
  const rightKey = `${right.dueDate} ${right.dueTime || '23:59'} ${right.title}`;
  return leftKey.localeCompare(rightKey);
}

function parseCsvRows(text) {
  const rows = [];
  let currentCell = '';
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length || currentRow.length) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function buildCalendar(deadlines, options = {}) {
  const timezone = options.timezone || 'America/Chicago';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Abhi Khurana//Deadline Calendar Builder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...deadlines.flatMap((deadline, index) => buildEvent(deadline, index, timezone)),
    'END:VCALENDAR',
    '',
  ];
  return lines.join('\r\n');
}

function buildEvent(deadline, index, timezone) {
  const uidBase = `${slugify(deadline.course)}-${slugify(deadline.title)}-${deadline.dueDate}-${index + 1}@deadline-calendar-builder`;
  const timestamp = formatUtcStamp(new Date());
  const description = [deadline.notes, deadline.url].filter(Boolean).join('\\n');

  if (!deadline.dueTime) {
    const nextDay = shiftDate(deadline.dueDate, 1);
    return [
      'BEGIN:VEVENT',
      `UID:${uidBase}`,
      `DTSTAMP:${timestamp}`,
      `SUMMARY:${escapeIcsText(`${deadline.course}: ${deadline.title}`)}`,
      `DTSTART;VALUE=DATE:${deadline.dueDate.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${nextDay.replace(/-/g, '')}`,
      `DESCRIPTION:${escapeIcsText(description || 'All-day deadline')}`,
      deadline.location ? `LOCATION:${escapeIcsText(deadline.location)}` : '',
      'END:VEVENT',
    ].filter(Boolean);
  }

  const startDateTime = `${deadline.dueDate.replace(/-/g, '')}T${deadline.dueTime.replace(':', '')}00`;
  const endDateTime = addMinutes(deadline.dueDate, deadline.dueTime, deadline.durationMinutes);
  return [
    'BEGIN:VEVENT',
    `UID:${uidBase}`,
    `DTSTAMP:${timestamp}`,
    `SUMMARY:${escapeIcsText(`${deadline.course}: ${deadline.title}`)}`,
    `DTSTART;TZID=${timezone}:${startDateTime}`,
    `DTEND;TZID=${timezone}:${endDateTime}`,
    `DESCRIPTION:${escapeIcsText(description || 'Timed deadline block')}`,
    deadline.location ? `LOCATION:${escapeIcsText(deadline.location)}` : '',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Upcoming deadline: ${deadline.title}`)}`,
    `TRIGGER:-PT${deadline.reminderMinutes}M`,
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean);
}

function buildMarkdownSummary(deadlines, options = {}) {
  const timezone = options.timezone || 'America/Chicago';
  const dayGroups = groupDeadlinesByDay(deadlines, options);
  const courseGroups = groupDeadlinesByCourse(deadlines);
  const overloadedDays = dayGroups.filter((group) => group.totalMinutes > (options.maxDayLoad || 240));
  const lines = [
    '# Deadline Review Sheet',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Timezone: ${timezone}`,
    '',
    '| Due | Course | Title | Reminder | Notes |',
    '| --- | --- | --- | --- | --- |',
    ...deadlines.map((deadline) => {
      const dueLabel = deadline.dueTime ? `${deadline.dueDate} ${deadline.dueTime}` : `${deadline.dueDate} (all day)`;
      const noteBits = [deadline.location, deadline.url, deadline.notes].filter(Boolean).join(' | ') || '-';
      return `| ${dueLabel} | ${escapePipes(deadline.course)} | ${escapePipes(deadline.title)} | ${deadline.reminderMinutes} min | ${escapePipes(noteBits)} |`;
    }),
    '',
    '## Upcoming Windows',
    ...dayGroups.map((group) => `- ${group.date}: ${group.items.join('; ')} [${group.totalMinutes} min scheduled]`),
    '',
    '## Load By Course',
    ...courseGroups.map((group) => `- ${group.course}: ${group.items} item(s) | ${group.totalMinutes} min planned`),
    '',
    '## Load Warnings',
    overloadedDays.length
      ? `- Overloaded days above ${options.maxDayLoad || 240} min: ${overloadedDays.map((group) => `${group.date} (${group.totalMinutes} min)`).join('; ')}`
      : `- No day exceeds the ${options.maxDayLoad || 240} minute load threshold.`,
    '',
  ];

  return lines.join(os.EOL);
}

function groupDeadlinesByDay(deadlines) {
  const groups = new Map();
  deadlines.forEach((deadline) => {
    const label = deadline.dueTime ? `${deadline.title} (${deadline.dueTime})` : `${deadline.title} (all day)`;
    if (!groups.has(deadline.dueDate)) {
      groups.set(deadline.dueDate, { items: [], totalMinutes: 0 });
    }
    const group = groups.get(deadline.dueDate);
    group.items.push(`${deadline.course}: ${label}`);
    group.totalMinutes += deadline.durationMinutes;
  });
  return [...groups.entries()].map(([date, value]) => ({ date, items: value.items, totalMinutes: value.totalMinutes }));
}

function groupDeadlinesByCourse(deadlines) {
  const groups = new Map();
  deadlines.forEach((deadline) => {
    if (!groups.has(deadline.course)) {
      groups.set(deadline.course, { totalMinutes: 0, items: 0 });
    }
    const group = groups.get(deadline.course);
    group.totalMinutes += deadline.durationMinutes;
    group.items += 1;
  });

  return [...groups.entries()]
    .map(([course, value]) => ({ course, totalMinutes: value.totalMinutes, items: value.items }))
    .sort((left, right) => right.totalMinutes - left.totalMinutes || left.course.localeCompare(right.course));
}

function shiftDate(dateText, deltaDays) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function addMinutes(dateText, timeText, minutesToAdd) {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hours, minutes] = timeText.split(':').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes + minutesToAdd));
  return [
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`,
    `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}00`,
  ].join('T');
}

function formatUtcStamp(date) {
  return [
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`,
    `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}Z`,
  ].join('T');
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

module.exports = {
  buildCalendar,
  buildMarkdownSummary,
  parseDeadlineCsv,
  parseOptions,
};
