export const DEFAULT_ROSTER_TIME_ZONE = 'Pacific/Auckland';

const numericTimeZoneParts = (date = new Date(), timeZone = DEFAULT_ROSTER_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});

  return parts;
};

export function getTimeZoneDateString(date = new Date(), timeZone = DEFAULT_ROSTER_TIME_ZONE) {
  const { year, month, day } = numericTimeZoneParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Parse a roster date as a calendar date, never as a UTC timestamp. This
// avoids the previous-day problem on devices west of New Zealand.
export function calendarDateFromIso(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function calendarDateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToIsoDate(isoDate, days) {
  const date = calendarDateFromIso(isoDate);
  date.setDate(date.getDate() + days);
  return calendarDateToIso(date);
}

export function daysBetweenIsoDates(laterDate, earlierDate) {
  const toUtc = (isoDate) => {
    const [year, month, day] = String(isoDate).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.floor((toUtc(laterDate) - toUtc(earlierDate)) / 86_400_000);
}

/** Returns the local calendar-date object for the Monday of the Auckland week. */
export function getWeekStartMonday(date = new Date(), timeZone = DEFAULT_ROSTER_TIME_ZONE) {
  const { year, month, day } = numericTimeZoneParts(date, timeZone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(year, month - 1, day);
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const timeZoneOffsetMilliseconds = (date, timeZone) => {
  const { year, month, day, hour, minute, second } = numericTimeZoneParts(date, timeZone);
  const formattedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return formattedAsUtc - date.getTime();
};

const timeZoneMidnightAsDate = (year, month, day, timeZone) => {
  const approximateUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  let result = new Date(approximateUtc.getTime() - timeZoneOffsetMilliseconds(approximateUtc, timeZone));
  // Re-read the offset at the target time to cover the daylight-saving
  // boundary. One refinement is sufficient for Auckland's offset changes.
  result = new Date(approximateUtc.getTime() - timeZoneOffsetMilliseconds(result, timeZone));
  return result;
};

/** Returns the actual instant of the next Monday midnight in the roster timezone. */
export function getNextMondayMidnight(date = new Date(), timeZone = DEFAULT_ROSTER_TIME_ZONE) {
  const weekStart = getWeekStartMonday(date, timeZone);
  weekStart.setDate(weekStart.getDate() + 7);
  return timeZoneMidnightAsDate(
    weekStart.getFullYear(),
    weekStart.getMonth() + 1,
    weekStart.getDate(),
    timeZone
  );
}
