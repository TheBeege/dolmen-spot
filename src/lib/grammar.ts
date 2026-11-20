/**
 * Small English helpers for text the tabs and the PDF build from data, so a
 * sheet never says "a Elf" or "1 slots".
 */

/**
 * "an Elf", "a Breggle". Picks the article from the first letter, which suits
 * the game's kindred and class names (it would get "a unicorn" or "an hour" wrong).
 */
export function withIndefiniteArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/**
 * "1 slot", "2 slots", "0 slots". With `grouping`, the count gets thousands
 * separators: "1,058 days".
 */
export function pluralize(count: number, singular: string, { grouping = false }: { grouping?: boolean } = {}): string {
  return `${grouping ? count.toLocaleString('en-US') : count} ${count === 1 ? singular : `${singular}s`}`;
}
