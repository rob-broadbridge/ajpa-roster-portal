import { calendarDateToIso, DEFAULT_ROSTER_TIME_ZONE, getWeekStartMonday } from './calendarDates.js';

const WEEKDAY_SORT_ORDER = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

export const compareRecurringSlots = (firstSlot, secondSlot) => {
  const dayDifference = (WEEKDAY_SORT_ORDER[firstSlot.dayOfWeek] ?? 99) - (WEEKDAY_SORT_ORDER[secondSlot.dayOfWeek] ?? 99);
  if (dayDifference !== 0) return dayDifference;
  const startDifference = (firstSlot.startTime || '').localeCompare(secondSlot.startTime || '');
  if (startDifference !== 0) return startDifference;
  const endDifference = (firstSlot.endTime || '').localeCompare(secondSlot.endTime || '');
  if (endDifference !== 0) return endDifference;
  return (firstSlot.id || '').localeCompare(secondSlot.id || '');
};

export const calculateJpDuties = (hoursWorked) => {
  const hours = Number(hoursWorked);
  return Number.isFinite(hours) && hours > 0 ? Math.ceil(hours / 2) : 0;
};

const escapeIcsText = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const foldIcsLine = (line) => {
  const encoder = new TextEncoder();
  const foldedLines = [];
  let currentLine = '';

  for (const character of line) {
    if (currentLine && encoder.encode(`${currentLine}${character}`).length > 73) {
      foldedLines.push(currentLine);
      currentLine = ` ${character}`;
    } else {
      currentLine += character;
    }
  }

  foldedLines.push(currentLine);
  return foldedLines.join('\r\n');
};

const localDateTimeToUtcIcs = (date, time, timeZone) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const expectedUtcMilliseconds = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(expectedUtcMilliseconds);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  for (let pass = 0; pass < 2; pass += 1) {
    const parts = formatter.formatToParts(candidate).reduce((values, part) => {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
      return values;
    }, {});
    const actualAsUtcMilliseconds = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate = new Date(candidate.getTime() + expectedUtcMilliseconds - actualAsUtcMilliseconds);
  }

  return candidate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

export const buildCalendarFile = ({ profileId, slotId, date, startTime, endTime, deskName, deskAddress, timeZone = DEFAULT_ROSTER_TIME_ZONE }) => {
  const location = `${deskName}, ${deskAddress}`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const appointmentTimes = [
    `DTSTART:${localDateTimeToUtcIcs(date, startTime, timeZone)}`,
    `DTEND:${localDateTimeToUtcIcs(date, endTime, timeZone)}`
  ];
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AJPA//Service Desk Management Platform//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:ajpa-duty-${profileId}-${slotId}-${date}@contact.broadbridge.co.nz`, `DTSTAMP:${stamp}`,
    ...appointmentTimes,
    `SUMMARY:${escapeIcsText(`JP duty - ${deskName}`)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(`Confirmed JP duty at ${deskName}.\nAddress: ${deskAddress}\nMap: ${mapLink}`)}`,
    'STATUS:CONFIRMED', 'SEQUENCE:0', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR',
  ];

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
};

const getRosterTimestamp = (date = new Date(), timeZone = DEFAULT_ROSTER_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((values, part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
    return values;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
};

export const hasShiftEnded = (occurrence, now = new Date()) => {
  if (!occurrence?.date || !occurrence?.endTime) return false;
  return getRosterTimestamp(now, occurrence.timeZone || DEFAULT_ROSTER_TIME_ZONE) > `${occurrence.date}T${occurrence.endTime}:00`;
};

export const getOperationalRosterWindow = (date = new Date()) => {
  const monday = getWeekStartMonday(date);
  const start = new Date(monday);
  const end = new Date(monday);
  start.setDate(start.getDate() - 120);
  end.setDate(end.getDate() + 365);
  return {
    operationalStartDate: calendarDateToIso(start),
    operationalEndDate: calendarDateToIso(end)
  };
};
