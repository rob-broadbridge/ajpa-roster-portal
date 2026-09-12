// IANA time zone names are the global standard used by browsers, operating
// systems, Supabase and calendar applications. The browser's built-in list is
// derived from its IANA/ICU time-zone data and is updated with normal browser
// and operating-system updates. The fallback keeps the Region form usable on
// older browsers that do not yet implement Intl.supportedValuesOf().
// Authoritative reference: https://www.iana.org/time-zones

const FALLBACK_IANA_TIME_ZONES = [
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Guam',
  'Pacific/Honolulu',
  'Pacific/Pago_Pago',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Africa/Johannesburg',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto'
];

const browserTimeZones = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : FALLBACK_IANA_TIME_ZONES;

export const IANA_TIME_ZONES = [...new Set([
  'Pacific/Auckland',
  ...browserTimeZones,
  ...FALLBACK_IANA_TIME_ZONES
])].sort((first, second) => {
  if (first === 'Pacific/Auckland') return -1;
  if (second === 'Pacific/Auckland') return 1;
  return first.localeCompare(second);
});
