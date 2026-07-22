import { isMarketOpen, openExchanges } from './market-hours.util';

// Helper: build a UTC instant so tests are independent of the host timezone.
const utc = (iso: string) => new Date(iso);

describe('isMarketOpen', () => {
  describe('US exchanges (America/New_York)', () => {
    // 2025-06-02 is a Monday. EDT = UTC-4 in June.
    it('is open at 10:00 ET on a weekday', () => {
      expect(isMarketOpen('NASDAQ', utc('2025-06-02T14:00:00Z'))).toBe(true);
      expect(isMarketOpen('NYSE', utc('2025-06-02T14:00:00Z'))).toBe(true);
    });

    it('is closed before the 09:30 open', () => {
      // 09:00 ET
      expect(isMarketOpen('NASDAQ', utc('2025-06-02T13:00:00Z'))).toBe(false);
    });

    it('is open exactly at the 09:30 bell', () => {
      expect(isMarketOpen('NASDAQ', utc('2025-06-02T13:30:00Z'))).toBe(true);
    });

    it('is closed well after the 16:00 close', () => {
      // 17:00 ET, beyond the post-close grace window
      expect(isMarketOpen('NASDAQ', utc('2025-06-02T21:00:00Z'))).toBe(false);
    });

    it('is closed on weekends', () => {
      // Saturday 2025-06-07, 14:00 UTC = 10:00 ET
      expect(isMarketOpen('NASDAQ', utc('2025-06-07T14:00:00Z'))).toBe(false);
    });

    it('honours daylight saving (EST in January)', () => {
      // 2025-01-06 is a Monday; EST = UTC-5, so 14:00 UTC = 09:00 ET (closed)
      expect(isMarketOpen('NASDAQ', utc('2025-01-06T14:00:00Z'))).toBe(false);
      // 15:00 UTC = 10:00 ET (open)
      expect(isMarketOpen('NASDAQ', utc('2025-01-06T15:00:00Z'))).toBe(true);
    });
  });

  describe('Indian exchanges (Asia/Kolkata, UTC+5:30)', () => {
    it('is open at 12:00 IST on a weekday', () => {
      // 06:30 UTC = 12:00 IST
      expect(isMarketOpen('NSE', utc('2025-06-02T06:30:00Z'))).toBe(true);
      expect(isMarketOpen('BSE', utc('2025-06-02T06:30:00Z'))).toBe(true);
    });

    it('is closed before the 09:15 open', () => {
      // 03:00 UTC = 08:30 IST
      expect(isMarketOpen('NSE', utc('2025-06-02T03:00:00Z'))).toBe(false);
    });

    it('is closed after the 15:30 close plus grace', () => {
      // 11:00 UTC = 16:30 IST
      expect(isMarketOpen('NSE', utc('2025-06-02T11:00:00Z'))).toBe(false);
    });

    it('is closed on weekends', () => {
      // Sunday 2025-06-08, 06:30 UTC = 12:00 IST
      expect(isMarketOpen('NSE', utc('2025-06-08T06:30:00Z'))).toBe(false);
    });
  });
});

describe('openExchanges', () => {
  it('returns only Indian venues during the IST-only window', () => {
    // Monday 06:30 UTC → 12:00 IST (open) / 02:30 ET (closed)
    expect(openExchanges(utc('2025-06-02T06:30:00Z')).sort()).toEqual([
      'BSE',
      'NSE',
    ]);
  });

  it('returns only US venues during the ET-only window', () => {
    // Monday 18:00 UTC → 14:00 ET (open) / 23:30 IST (closed)
    expect(openExchanges(utc('2025-06-02T18:00:00Z')).sort()).toEqual([
      'NASDAQ',
      'NYSE',
    ]);
  });

  it('returns nothing overnight when every market is shut', () => {
    // Monday 22:00 UTC → 18:00 ET (closed) / 03:30 IST Tue (closed)
    expect(openExchanges(utc('2025-06-02T22:00:00Z'))).toEqual([]);
  });

  it('returns nothing on a weekend', () => {
    expect(openExchanges(utc('2025-06-07T14:00:00Z'))).toEqual([]);
  });
});
