export type PdfPageSize = 'LETTER' | 'A4';

// Territories whose default paper is US Letter, per the Unicode CLDR
// supplemental data (<paperSize type="US-Letter">). Everywhere else uses A4.
const LETTER_TERRITORIES = new Set([
  'BZ', 'CA', 'CL', 'CO', 'CR', 'GT', 'MX', 'NI', 'PA', 'PH', 'PR', 'SV', 'US', 'VE',
]);

function regionOf(locale: string): string | undefined {
  try {
    const parsed = new Intl.Locale(locale);
    // "en" alone maximizes to "en-Latn-US"; "fr" to "fr-Latn-FR".
    return parsed.region ?? parsed.maximize().region;
  } catch {
    return /[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(locale)?.[1]?.toUpperCase();
  }
}

/** Letter for the US, Canada and the other Letter-paper regions; A4 elsewhere. */
export function pageSizeForLocale(locale: string | undefined): PdfPageSize {
  if (!locale) return 'A4';
  const region = regionOf(locale);
  return region && LETTER_TERRITORIES.has(region.toUpperCase()) ? 'LETTER' : 'A4';
}

/** The page size for this browser's preferred language. */
export function browserPageSize(): PdfPageSize {
  if (typeof navigator === 'undefined') return 'A4';
  return pageSizeForLocale(navigator.languages?.[0] ?? navigator.language);
}
