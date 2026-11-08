/**
 * Date/time primitives.
 *
 * The database stores naive local wall-clock values as `YYYY-MM-DD HH:MM:SS`
 * (upstream MySQL `timestamp` semantics). `parseDb` maps such a value onto a
 * proleptic UTC instant so formatting never shifts the wall clock; only
 * `nowDb`/`strftime` interpret an actual instant in the configured timezone.
 */

const DB_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/;

export const MONTHS_SHORT_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const MONTHS_LONG_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const WEEKDAYS_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAYS_LONG_EN = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export function isValidDbDateTime(value: string): boolean {
  const match = DB_PATTERN.exec(value);
  if (!match) return false;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/** Parses a DB wall-clock value onto a UTC instant that carries the same fields. */
export function parseDb(value: string | Date): Date {
  if (value instanceof Date) return value;
  const match = DB_PATTERN.exec(value);
  if (!match) {
    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) {
      throw new Error(`Invalid database datetime: ${value}`);
    }
    return fallback;
  }
  if (!isValidDbDateTime(value)) {
    throw new Error(`Invalid database datetime: ${value}`);
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
  );
}

/** Formats an instant (or DB wall-clock value) as `YYYY-MM-DD HH:MM:SS`. */
export function toDb(value: Date = new Date()): string {
  return formatDb(value, "Y-m-d H:i:s");
}

/** Current time in `timeZone` as a DB string. */
export function nowDb(timeZone?: string): string {
  return formatInstant(new Date(), timeZone ?? "UTC", "Y-m-d H:i:s");
}

function zonedParts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

/** Formats an actual instant in `timeZone` using PHP `date()` tokens. */
export function formatInstant(date: Date, timeZone: string, phpFormat: string): string {
  const p = zonedParts(date, timeZone);
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  const second = Number(p.second);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const utcPseudo = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return renderPhpDate(phpFormat, {
    year, month, day, hour, minute, second, weekday,
    date: utcPseudo,
    timeZone,
    epochSeconds: Math.floor(date.getTime() / 1000),
  });
}

/** Formats a DB wall-clock value (or Date treated as wall clock) using PHP tokens. */
export function formatDb(value: string | Date, phpFormat: string): string {
  const date = parseDb(value);
  return renderPhpDate(phpFormat, {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    weekday: date.getUTCDay(),
    date,
    timeZone: "UTC",
    epochSeconds: Math.floor(date.getTime() / 1000),
  });
}

interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  date: Date;
  timeZone: string;
  epochSeconds: number;
}

function isoWeekInfo(date: Date): { week: number; year: number } {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: target.getUTCFullYear() };
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function renderPhpDate(format: string, f: DateFields): string {
  const daysInMonth = new Date(Date.UTC(f.year, f.month, 0)).getUTCDate();
  const iso = isoWeekInfo(f.date);
  const leap = (f.year % 4 === 0 && f.year % 100 !== 0) || f.year % 400 === 0;
  const offsetMinutes = (() => {
    if (f.timeZone === "UTC") return 0;
    try {
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: f.timeZone,
        timeZoneName: "longOffset",
      });
      const part = dtf.formatToParts(f.date).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
      const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
      if (!match) return 0;
      const sign = match[1] === "-" ? -1 : 1;
      return sign * (Number(match[2]) * 60 + Number(match[3]));
    } catch {
      return 0;
    }
  })();

  let result = "";
  for (let i = 0; i < format.length; i++) {
    const token = format[i];
    if (token === "\\") {
      if (i + 1 < format.length) result += format[++i];
      continue;
    }
    switch (token) {
      case "d": result += pad2(f.day); break;
      case "D": result += WEEKDAYS_SHORT_EN[f.weekday]; break;
      case "j": result += String(f.day); break;
      case "l": result += WEEKDAYS_LONG_EN[f.weekday]; break;
      case "N": result += String(f.weekday === 0 ? 7 : f.weekday); break;
      case "S": result += ordinalSuffix(f.day); break;
      case "w": result += String(f.weekday); break;
      case "z": {
        const start = Date.UTC(f.year, 0, 1);
        const current = Date.UTC(f.year, f.month - 1, f.day);
        result += String(Math.floor((current - start) / 86400000));
        break;
      }
      case "W": result += pad2(iso.week); break;
      case "F": result += MONTHS_LONG_EN[f.month - 1]; break;
      case "m": result += pad2(f.month); break;
      case "M": result += MONTHS_SHORT_EN[f.month - 1]; break;
      case "n": result += String(f.month); break;
      case "t": result += String(daysInMonth); break;
      case "L": result += leap ? "1" : "0"; break;
      case "o": result += String(iso.year); break;
      case "Y": result += String(f.year); break;
      case "y": result += pad2(f.year % 100); break;
      case "a": result += f.hour < 12 ? "am" : "pm"; break;
      case "A": result += f.hour < 12 ? "AM" : "PM"; break;
      case "B": {
        const utcSeconds = f.hour * 3600 + f.minute * 60 + f.second;
        const bmt = ((utcSeconds / 86400 + 1) % 1) * 1000;
        result += pad2(Math.floor(bmt));
        break;
      }
      case "g": result += String(f.hour % 12 === 0 ? 12 : f.hour % 12); break;
      case "G": result += String(f.hour); break;
      case "h": result += pad2(f.hour % 12 === 0 ? 12 : f.hour % 12); break;
      case "H": result += pad2(f.hour); break;
      case "i": result += pad2(f.minute); break;
      case "s": result += pad2(f.second); break;
      case "u": result += "000000"; break;
      case "v": result += "000"; break;
      case "e": result += f.timeZone; break;
      case "T": {
        try {
          const part = new Intl.DateTimeFormat("en-US", {
            timeZone: f.timeZone,
            timeZoneName: "short",
          }).formatToParts(f.date).find((p) => p.type === "timeZoneName")?.value;
          result += part ?? "UTC";
        } catch {
          result += "UTC";
        }
        break;
      }
      case "I": result += "0"; break;
      case "O": {
        const sign = offsetMinutes < 0 ? "-" : "+";
        const abs = Math.abs(offsetMinutes);
        result += `${sign}${pad2(Math.trunc(abs / 60))}${pad2(abs % 60)}`;
        break;
      }
      case "P": {
        const sign = offsetMinutes < 0 ? "-" : "+";
        const abs = Math.abs(offsetMinutes);
        result += `${sign}${pad2(Math.trunc(abs / 60))}:${pad2(abs % 60)}`;
        break;
      }
      case "Z": result += String(offsetMinutes * 60); break;
      case "c": {
        const sign = offsetMinutes < 0 ? "-" : "+";
        const abs = Math.abs(offsetMinutes);
        result += `${f.year}-${pad2(f.month)}-${pad2(f.day)}T${pad2(f.hour)}:${pad2(f.minute)}:${pad2(f.second)}${sign}${pad2(Math.trunc(abs / 60))}:${pad2(abs % 60)}`;
        break;
      }
      case "r": {
        const name = WEEKDAYS_SHORT_EN[f.weekday];
        const month = MONTHS_SHORT_EN[f.month - 1];
        const sign = offsetMinutes < 0 ? "-" : "+";
        const abs = Math.abs(offsetMinutes);
        result += `${name}, ${pad2(f.day)} ${month} ${f.year} ${pad2(f.hour)}:${pad2(f.minute)}:${pad2(f.second)} ${sign}${pad2(Math.trunc(abs / 60))}${pad2(abs % 60)}`;
        break;
      }
      case "U": result += String(f.epochSeconds); break;
      default: result += token;
    }
  }
  return result;

}

function localeWeekInfo(locale: string): { firstDay: number; minimalDays: number } {
  try {
    const intlLocale = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number; minimalDays: number };
    };
    const info = intlLocale.getWeekInfo?.();
    if (info) return { firstDay: info.firstDay, minimalDays: info.minimalDays };
  } catch {
    // fall through to the en-US default
  }
  return { firstDay: 7, minimalDays: 1 };
}

function localizedNumber(value: number, locale: string, minDigits = 1): string {
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumIntegerDigits: minDigits,
  }).format(value);
}

function weekOfYear(
  year: number,
  month: number,
  day: number,
  firstDay: number,
  minimalDays: number,
): number {
  const jan1 = Date.UTC(year, 0, 1);
  const jan1Weekday = new Date(jan1).getUTCDay();
  const fd = firstDay % 7;
  const daysSinceWeekStart = (jan1Weekday - fd + 7) % 7;
  let weekStart = jan1 - daysSinceWeekStart * 86400000;
  const daysInFirstWeek = 7 - daysSinceWeekStart;
  if (daysInFirstWeek < minimalDays) {
    weekStart += 7 * 86400000;
  }
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - weekStart) / (7 * 86400000)) + 1;
}

interface StftimeOptions {
  now?: Date;
  timeZone?: string;
  locale?: string;
}

const STRFTIME_PATTERN: Record<string, string> = {
  a: "EEE", A: "EEEE", b: "MMM", B: "MMMM", d: "dd", D: "MM/dd/yy",
  e: "d", F: "yyyy-MM-dd", h: "MMM", j: "D", m: "MM", U: "w", V: "ww",
  W: "ww", y: "yy", Y: "yyyy", H: "HH", I: "hh", l: "h", M: "mm",
  p: "a", P: "a", r: "hh:mm:ss a", R: "HH:mm", S: "ss", T: "HH:mm:ss",
  X: "HH:mm:ss", z: "ZZZZZ", Z: "z", g: "yy", G: "yyyy", u: "e", w: "c",
};

const VALID_STRFTIME = new Set(Object.keys(STRFTIME_PATTERN));

/**
 * Expands `%` date directives exactly like `Token_lib::applyDateFormats`.
 * Unknown directives and `%l` remain literal; `%c`/`%x` are fixed ISO patterns.
 */
export function strftime(text: string, options: StftimeOptions = {}): string {
  if (!text.includes("%")) return text;
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "UTC";
  const locale = options.locale ?? new Intl.DateTimeFormat().resolvedOptions().locale;
  const parts = zonedParts(now, timeZone);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const { firstDay, minimalDays } = localeWeekInfo(locale);
  const weekdayIso = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const fd = firstDay % 7;
  const localDay = ((weekdayIso - fd + 7) % 7) + 1;
  const jsDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return text.replace(/%([a-zA-Z%])/g, (match, raw: string) => {
    if (raw === "%") return "%";
    if (raw === "n") return "\n";
    if (raw === "t") return "\t";
    if (raw === "C") return localizedNumber(Math.trunc(year / 100), locale, 2);
    if (raw === "c" || raw === "x") {
      const y = localizedNumber(year, locale, 4);
      const m = localizedNumber(month, locale, 2);
      const d = localizedNumber(day, locale, 2);
      if (raw === "x") return `${y}-${m}-${d}`;
      const h = localizedNumber(hour, locale, 2);
      const mi = localizedNumber(minute, locale, 2);
      const s = localizedNumber(second, locale, 2);
      return `${y}-${m}-${d} ${h}:${mi}:${s}`;
    }
    if (!VALID_STRFTIME.has(raw)) return match;

    const monthName = (style: "short" | "long") =>
      new Intl.DateTimeFormat(locale, { timeZone, month: style, calendar: "gregory" })
        .format(now);
    const weekdayName = (style: "short" | "long") =>
      new Intl.DateTimeFormat(locale, { timeZone, weekday: style, calendar: "gregory" })
        .format(now);
    const num = (value: number, min = 1) => localizedNumber(value, locale, min);
    const dayPeriod = () => {
      const p = new Intl.DateTimeFormat(locale, {
        timeZone,
        hour: "numeric",
        hour12: true,
        calendar: "gregory",
      }).formatToParts(now).find((part) => part.type === "dayPeriod")?.value;
      return p ?? (hour < 12 ? "AM" : "PM");
    };

    switch (raw) {
      case "a": return weekdayName("short");
      case "A": return weekdayName("long");
      case "b":
      case "h": return monthName("short");
      case "B": return monthName("long");
      case "d": return num(day, 2);
      case "D": return `${num(month, 2)}/${num(day, 2)}/${num(year % 100, 2)}`;
      case "e": return num(day);
      case "m": return num(month, 2);
      case "F": return `${num(year, 4)}-${num(month, 2)}-${num(day, 2)}`;
      case "g": return num(year % 100, 2);
      case "G": return num(year, 4);
      case "y": return num(year % 100, 2);
      case "Y": return num(year, 4);
      case "H": return num(hour, 2);
      case "I": return num(hour % 12 === 0 ? 12 : hour % 12, 2);
      case "M": return num(minute, 2);
      case "S": return num(second, 2);
      case "j": {
        const start = Date.UTC(year, 0, 1);
        return num(Math.floor((jsDate.getTime() - start) / 86400000) + 1);
      }
      case "U":
      case "V":
      case "W": {
        const week = weekOfYear(year, month, day, firstDay, minimalDays);
        return num(week, raw === "V" ? 2 : 1);
      }
      case "u":
      case "w": return num(localDay);
      case "p":
      case "P": return dayPeriod();
      case "r": {
        const h = num(hour % 12 === 0 ? 12 : hour % 12, 2);
        return `${h}:${num(minute, 2)}:${num(second, 2)} ${dayPeriod()}`;
      }
      case "R": return `${num(hour, 2)}:${num(minute, 2)}`;
      case "T":
      case "X": return `${num(hour, 2)}:${num(minute, 2)}:${num(second, 2)}`;
      case "z": {
        const offsetPart = new Intl.DateTimeFormat("en-US", {
          timeZone,
          timeZoneName: "longOffset",
        }).formatToParts(now).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
        return offsetPart.replace(/^GMT/, "") || "+00:00";
      }
      case "Z": {
        return new Intl.DateTimeFormat(locale, {
          timeZone,
          timeZoneName: "shortOffset",
        }).formatToParts(now).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
      }
      default: return match;
    }
  });
}

/** Port of `isValidDate()` for the configured PHP date format. */
export function isValidDate(candidate: string, phpFormat: string): boolean {
  let regex = "";
  const order: string[] = [];
  for (let i = 0; i < phpFormat.length; i++) {
    const ch = phpFormat[i];
    if (ch === "\\") {
      if (i + 1 < phpFormat.length) {
        const literal = phpFormat[++i];
        regex += literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      continue;
    }
    if (ch === "Y") {
      regex += "(\\d{4})";
      order.push(ch);
    } else if (ch === "y") {
      regex += "(\\d{2})";
      order.push(ch);
    } else if ("djmYn".includes(ch)) {
      regex += "(\\d{1,2})";
      order.push(ch);
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  const match = new RegExp(`^${regex}$`).exec(candidate);
  if (!match) return false;
  const values: Record<string, number> = {};
  order.forEach((token, index) => {
    values[token] = Number(match[index + 1]);
  });
  const year = values.Y ?? (values.y !== undefined ? 2000 + values.y : 1970);
  const month = values.m ?? values.n ?? 1;
  const day = values.d ?? values.j ?? 1;
  if (month < 1 || month > 12 || day < 1) return false;
  const maxDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > maxDays) return false;
  return formatDb(
    new Date(Date.UTC(year, month - 1, day, 0, 0, 0)),
    phpFormat,
  ) === candidate;
}
