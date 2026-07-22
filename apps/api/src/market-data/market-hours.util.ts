import { Exchange } from '@prisma/client';

interface Session {
  timeZone: string;
  /** Minutes from local midnight. */
  openMinute: number;
  closeMinute: number;
}

/**
 * Regular trading sessions, expressed in each venue's own timezone so that
 * daylight-saving transitions are handled by the Intl API rather than by
 * hard-coded UTC offsets.
 */
const SESSIONS: Record<Exchange, Session> = {
  // 09:30–16:00 America/New_York
  NYSE: { timeZone: 'America/New_York', openMinute: 9 * 60 + 30, closeMinute: 16 * 60 },
  NASDAQ: { timeZone: 'America/New_York', openMinute: 9 * 60 + 30, closeMinute: 16 * 60 },
  // 09:15–15:30 Asia/Kolkata
  NSE: { timeZone: 'Asia/Kolkata', openMinute: 9 * 60 + 15, closeMinute: 15 * 60 + 30 },
  BSE: { timeZone: 'Asia/Kolkata', openMinute: 9 * 60 + 15, closeMinute: 15 * 60 + 30 },
};

/**
 * Quotes can lag the closing auction slightly, so keep evaluating for a short
 * period after the bell rather than cutting off at exactly the closing minute.
 */
const POST_CLOSE_GRACE_MINUTES = 15;

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    weekday: get('weekday'),
    // 'hour' can render as "24" at midnight under hour12:false
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  };
}

/**
 * Whether an exchange is inside its regular trading session.
 *
 * Note: exchange holidays are not modelled. On a holiday this returns true
 * during normal hours, which only costs a redundant (cached) quote lookup —
 * prices do not move, so no alert can fire incorrectly.
 */
export function isMarketOpen(exchange: Exchange, now: Date = new Date()): boolean {
  const session = SESSIONS[exchange];
  if (!session) return true;

  const { weekday, minutes } = localParts(now, session.timeZone);
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  return (
    minutes >= session.openMinute &&
    minutes <= session.closeMinute + POST_CLOSE_GRACE_MINUTES
  );
}

/** Exchanges currently trading; empty when every supported market is shut. */
export function openExchanges(now: Date = new Date()): Exchange[] {
  return (Object.keys(SESSIONS) as Exchange[]).filter((e) =>
    isMarketOpen(e, now),
  );
}
