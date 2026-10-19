import type { Language } from './i18n/i18n.service';

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDuration(seconds: number): string {
  return `${pad(Math.floor(seconds / MINUTE_SECONDS))}:${pad(seconds % MINUTE_SECONDS)}`;
}

export function formatRelative(iso: string, language: Language, now: number = Date.now()): string {
  const relativeFormat = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const seconds: number = Math.round((Date.parse(iso) - now) / 1000);
  const abs: number = Math.abs(seconds);
  if (abs < MINUTE_SECONDS) return relativeFormat.format(0, 'second');
  if (abs < HOUR_SECONDS) return relativeFormat.format(Math.round(seconds / MINUTE_SECONDS), 'minute');
  if (abs < DAY_SECONDS) return relativeFormat.format(Math.round(seconds / HOUR_SECONDS), 'hour');
  return relativeFormat.format(Math.round(seconds / DAY_SECONDS), 'day');
}

export function formatDateTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
