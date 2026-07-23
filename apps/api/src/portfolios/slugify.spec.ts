import { slugify } from './portfolios.service';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Long Term US')).toBe('long-term-us');
  });

  it('strips special characters', () => {
    expect(slugify('Tech & Growth!')).toBe('tech-growth');
    expect(slugify('My Portfolio (2024)')).toBe('my-portfolio-2024');
  });

  it('collapses runs of separators and trims edges', () => {
    expect(slugify('  --Dividends___Income--  ')).toBe('dividends-income');
  });

  it('removes accents', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume');
  });

  it('keeps digits', () => {
    expect(slugify('2025 Goals')).toBe('2025-goals');
  });

  it('falls back when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('portfolio');
    expect(slugify('   ')).toBe('portfolio');
    expect(slugify('日本語')).toBe('portfolio');
  });

  it('caps length at 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(60);
  });
});
