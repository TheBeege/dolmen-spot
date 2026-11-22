// Spell Ranks: a character can only learn spells of a Rank they can memorise at
// their Level (Player's Book p78), so the Spells & Magic tab's pickers offer
// only those Ranks, say why they stop there, and note the spells and studies
// already recorded that are above them (see getLearnableSpellRanks).
import type { Locator, Page } from '@playwright/test';
import { rankAboveLearnableNote } from '../src/lib/character-sheet';
import { getCharacterMagicProfile, getLearnableSpellRanks } from '../src/lib/gamedata';
import { FIXTURES, openApp, openTab, TABS } from './support/app';
import { expect, test } from './support/test';

const SPELLS_TAB = TABS.find((tab) => tab.id === 'spells')!;

/** The labels of a picker's `optgroup`s: the Ranks it offers spells of. */
async function offeredRanks(picker: Locator): Promise<(string | null)[]> {
  return picker.locator('optgroup').evaluateAll((groups) => groups.map((group) => group.getAttribute('label')));
}

/** A spell row, as the tab marks one whose summary can show: known spells and queued studies. */
function spellRow(page: Page, spell: string): Locator {
  return page.locator('[data-spell-row]').filter({ hasText: spell });
}

test('a level 3 magician is offered only the spell Ranks they can learn', async ({ page }) => {
  const character = await openApp(page, FIXTURES.lowLevelMagician);
  await openTab(page, SPELLS_TAB);

  // The fixture's premise: a level 3 magician, who can memorise Ranks 1 and 2.
  const learnable = getLearnableSpellRanks(getCharacterMagicProfile(character.kindred, character.class, character.level));
  expect(learnable, 'the Ranks the fixture can learn').toEqual([1, 2]);

  // One hint in the study picker, then another under the picker that adds a
  // known spell by hand, once it's open.
  const hint = 'At Level 3 you can learn spells up to Rank 2.';
  await expect(page.getByText(hint, { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '+ Add known spell (manual)' }).click();
  await expect(page.getByText(hint, { exact: true })).toHaveCount(2);

  // Both pickers group their spells by Rank, offering the learnable Ranks. A
  // study reads its spell from a book by default, so switch to the mentor
  // source, which offers every spell of a learnable Rank.
  await page.getByRole('radio', { name: 'Mentor' }).check();
  await expect.poll(() => offeredRanks(page.getByLabel('Spell to study'))).toEqual(['Rank 1', 'Rank 2']);
  expect(await offeredRanks(page.getByLabel('Known spell to add'))).toEqual(['Rank 1', 'Rank 2']);

  // So no spell of a higher Rank can be picked. Fireball is Rank 3, Teleport
  // Rank 5 (and Teleport is already known, which a study must not offer).
  const addPicker = page.getByLabel('Known spell to add');
  const studyPicker = page.getByLabel('Spell to study');
  for (const picker of [addPicker, studyPicker]) {
    await expect(picker.locator('option', { hasText: 'Fireball' })).toHaveCount(0);
    await expect(picker.locator('option', { hasText: 'Teleport' })).toHaveCount(0);
  }
  // Rank 2's Levitate is still offered, so the pickers aren't simply empty.
  await expect(studyPicker.locator('option', { hasText: 'Levitate' })).toHaveCount(1);
});

test('known spells and studies above those Ranks say so', async ({ page }) => {
  const character = await openApp(page, FIXTURES.lowLevelMagician);
  await openTab(page, SPELLS_TAB);

  // The Rank 5 spell the fixture has already learned, in a red note.
  const knownNote = spellRow(page, 'Teleport').getByText(rankAboveLearnableNote(5, character.level), { exact: true });
  await expect(knownNote).toHaveCount(1);
  await expect(knownNote).toHaveClass(/text-red-400/);

  // The Rank 4 study in progress, and the one queued behind it.
  await expect(page.getByText(rankAboveLearnableNote(4, character.level), { exact: true })).toHaveCount(2);
  // Only two rows carry a note: the known Rank 5 spell and the queued Rank 4
  // study (the active study's is in its card, not in a row).
  await expect(page.locator('[data-spell-row]').filter({ hasText: 'is above what you can learn' })).toHaveCount(2);
});
