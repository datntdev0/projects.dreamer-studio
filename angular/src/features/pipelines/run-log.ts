import type { Language } from '../../core/i18n/i18n.service';

export interface LogLineView {
  raw: string;
  time: string;
  level: string;
  message: string;
}

const LOG_LINE = /^(\S+) (\S+) (\S+) (\S+) (.*)$/;

export function parseLogLine(raw: string, language: Language): LogLineView {
  const match: RegExpMatchArray | null = raw.match(LOG_LINE);
  if (!match || Number.isNaN(Date.parse(match[1]))) return { raw, time: '', level: '', message: raw };
  const time: string = new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(match[1]));
  return { raw, time, level: match[2].padEnd(5), message: match[5] };
}

export function takeUnseen(lines: string[], seen: Set<string>): string[] {
  return lines.filter((line) => !seen.delete(line));
}
