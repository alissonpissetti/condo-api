import {
  formatDateOnlyYmdUtc,
  normalizeYmdFilterParam,
  parseDateOnlyFromApi,
} from './date-only.util';

describe('date-only.util', () => {
  describe('normalizeYmdFilterParam', () => {
    it('aceita YYYY-MM-DD', () => {
      expect(normalizeYmdFilterParam('2026-06-01')).toBe('2026-06-01');
      expect(normalizeYmdFilterParam(' 2026-06-30 ')).toBe('2026-06-30');
    });

    it('rejeita valores inválidos', () => {
      expect(normalizeYmdFilterParam('')).toBeUndefined();
      expect(normalizeYmdFilterParam('jun/2026')).toBeUndefined();
    });
  });

  describe('parseDateOnlyFromApi', () => {
    it('usa meio-dia UTC no dia civil', () => {
      const d = parseDateOnlyFromApi('2026-06-01');
      expect(d.toISOString()).toBe('2026-06-01T12:00:00.000Z');
      expect(formatDateOnlyYmdUtc(d)).toBe('2026-06-01');
    });
  });
});
