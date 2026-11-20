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

/** "1 slot", "2 slots", "0 slots". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
