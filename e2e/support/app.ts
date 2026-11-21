import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { Character } from '../../src/lib/types';
import { expect } from './test';

// The keys the app saves characters under (src/lib/storage.ts).
const CHARACTERS_KEY = 'dolmenwood-characters';
const ACTIVE_CHARACTER_KEY = 'dolmenwood-active-character';

/**
 * The characters in e2e/fixtures/. To add one, export a character from the
 * app (Save / Load > Export Character), save it there and add its name here.
 */
export const FIXTURES = {
  /** What the app makes for a new player. */
  default: 'default',
  /** A level 12 Magician with a bit of everything: a full day of spells, study, spell books and scrolls, containers, a long journal, map data, a past Fairy visit, retainers, light sources. */
  kitchenSink: 'kitchen-sink',
  /** An Elf (kindred-class) with glamours and runes, in Fairy now. */
  elf: 'elf',
  /** A Mossling (kindred-class) with a knack, symbiotic flesh and weight-based encumbrance. */
  mossling: 'mossling',
} as const;

export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];

export const ALL_FIXTURES: FixtureName[] = Object.values(FIXTURES);

export function loadFixture(name: FixtureName): Character {
  return JSON.parse(readFileSync(path.join(__dirname, '..', 'fixtures', `${name}.json`), 'utf8'));
}

/** The app's tabs, in order, as the header's tab bar shows them. */
export const TABS = [
  { id: 'character', label: 'Character' },
  { id: 'abilities', label: 'Abilities & Saves' },
  { id: 'combat', label: 'Combat' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'spells', label: 'Spells & Magic' },
  { id: 'traits', label: 'Traits & Notes' },
  { id: 'calendar', label: 'Adventuring' },
  { id: 'journal', label: 'Journal' },
  { id: 'map', label: 'Map' },
  { id: 'reference', label: 'Reference' },
] as const;

export type Tab = (typeof TABS)[number];
export type TabId = Tab['id'];

/**
 * Save these characters where the app keeps them before it starts, as if the
 * player had made them, with the first one open. It happens on the first
 * load only, so the test can reload and see what the app saved.
 */
export async function seedCharacters(page: Page, characters: Character[]): Promise<void> {
  await page.addInitScript(
    ([keys, list, activeId]) => {
      if (sessionStorage.getItem('e2e-seeded')) return;
      localStorage.setItem(keys[0], list);
      localStorage.setItem(keys[1], activeId);
      sessionStorage.setItem('e2e-seeded', '1');
    },
    [[CHARACTERS_KEY, ACTIVE_CHARACTER_KEY], JSON.stringify(characters), characters[0].id] as const,
  );
}

/** The characters the app has saved, and the open one's id. */
export async function savedCharacters(page: Page): Promise<{ characters: Character[]; activeId: string | null }> {
  return page.evaluate(([charactersKey, activeKey]) => ({
    characters: JSON.parse(localStorage.getItem(charactersKey) ?? '[]'),
    activeId: localStorage.getItem(activeKey),
  }), [CHARACTERS_KEY, ACTIVE_CHARACTER_KEY] as const);
}

/**
 * Open the app and wait for the sheet: with `fixture` saved as the only
 * character (which it returns), or as on a first visit.
 */
export async function openApp(page: Page): Promise<void>;
export async function openApp(page: Page, fixture: FixtureName): Promise<Character>;
export async function openApp(page: Page, fixture?: FixtureName): Promise<Character | void> {
  const character = fixture ? loadFixture(fixture) : undefined;
  if (character) await seedCharacters(page, [character]);
  await page.goto('/');
  await expect(tabBar(page)).toBeVisible();
  return character;
}

export function tabBar(page: Page) {
  return page.getByRole('tablist', { name: 'Character sheet sections' });
}

/** Open a tab by clicking it, and wait until it's showing. */
export async function openTab(page: Page, tab: Tab): Promise<void> {
  const index = TABS.findIndex((t) => t.id === tab.id);
  // The bar shows a short label on narrow screens, so find the tab by position.
  await tabBar(page).getByRole('tab').nth(index).click();
  await expect(page.locator('main h1')).toHaveText(tab.label);
  await settle(page);
}

/** Wait for fonts and two frames, so layout has caught up with the last change. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
