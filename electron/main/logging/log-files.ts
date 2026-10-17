import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dayMs: number = 24 * 60 * 60 * 1000;

function pad(value: number, length: number = 2): string {
  return String(value).padStart(length, '0');
}

function localDay(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / dayMs);
}

export function datedLogFile(dir: string, prefix: string, date: Date): string {
  return join(dir, `${prefix}-${localDay(date)}.log`);
}

export function deleteOldLogs(dir: string, prefix: string, now: Date, keepDays: number): void {
  if (!existsSync(dir)) {
    return;
  }
  const pattern: RegExp = new RegExp(String.raw`^${prefix}-(\d{4})-(\d{2})-(\d{2})\.log$`);
  const today: number = dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
  for (const name of readdirSync(dir)) {
    const match: RegExpMatchArray | null = pattern.exec(name);
    if (match && today - dayNumber(Number(match[1]), Number(match[2]), Number(match[3])) >= keepDays) {
      try {
        rmSync(join(dir, name), { force: true });
      } catch {
        continue;
      }
    }
  }
}
