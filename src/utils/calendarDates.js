/**
 * Returns local midnight on the Monday that starts the supplied date's week.
 * The roster intentionally uses the device's local calendar day.
 */
export function getWeekStartMonday(date = new Date()) {
  const localDate = new Date(date);
  const daysSinceMonday = (localDate.getDay() + 6) % 7;
  localDate.setDate(localDate.getDate() - daysSinceMonday);
  localDate.setHours(0, 0, 0, 0);
  return localDate;
}

/** Returns the local date/time of the next Monday midnight. */
export function getNextMondayMidnight(date = new Date()) {
  const nextMonday = new Date(date);
  const daysUntilNextMonday = ((8 - date.getDay()) % 7) || 7;
  nextMonday.setDate(date.getDate() + daysUntilNextMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}
