// Spell Ranks: a character can only learn spells of a Rank they can memorise at
// their Level (Player's Book p78), so the Spells & Magic tab's pickers offer
// only those Ranks, say why they stop there, and note the spells and studies
// already recorded that are above them (see getLearnableSpellRanks). Adding a
// known spell by hand also offers the higher Ranks, in a group of their own, so
// that a spell a Referee grants can still be recorded.
import type { Locator, Page } from '@playwright/test';
import { rankAboveLearnableNote } from '../src/lib/character-sheet';
import { getCharacterMagicProfile, getLearnableSpellRanks } from '../src/lib/gamedata';
import { FIXTURES, openApp, openTab, TABS } from './support/app';
import { expect, test } from './support/test';

const SPELLS_TAB = TABS.find((tab) => tab.id === 'spells')!;

/** The add form's group of the Ranks above the character's: the Referee-grant escape. */
const REFEREE_GROUP = 'Above your Level (Referee grant)';

/** The labels of a picker's `optgroup`s: the Ranks it offers spells of. */
async function offeredRanks(picker: Locator): Promise<(string | null)[]> {
  return picker.locator('optgroup').evaluateAll((groups) => groups.map((group) => group.getAttribute('label')));
}

/**
 * A known spell's row. Every row whose summary card keeps clear of its controls
 * is marked `data-spell-row` — memorised and prepared spells and scrolls too —
 * so this reads the Known Spells list by the kind of row, or a memorised copy of
 * a spell would be counted twice.
 */
function knownSpellRow(page: Page, spell: string): Locator {
  return page.locator('[data-spell-row="known"]').filter({ hasText: spell });
}

/** The rows that can carry a note on a too-high Rank: a known spell's and a queued study's. */
function notedRows(page: Page): Locator {
  return page.locator('[data-spell-row="known"], [data-spell-row="study-queue"]');
}

test('a level 3 magician is offered only the spell Ranks they can learn', async ({ page }) => {
  const character = await openApp(page, FIXTURES.lowLevelMagician);
  await openTab(page, SPELLS_TAB);

  // The fixture's premise: a level 3 magician, who can memorise Ranks 1 and 2.
  const learnable = getLearnableSpellRanks(getCharacterMagicProfile(character.kindred, character.class, character.level));
  expect(learnable, 'the Ranks the fixture can learn').toEqual([1, 2]);

  // One hint in the study picker, then another under the picker that adds a
  // known spell by hand, once it's open. The tab sets "Level" and "Rank" apart
  // from their numbers with a non-breaking space, so this does too.
  const hint = 'At Level\u00a03 you can learn spells up to Rank\u00a02.';
  await expect(page.getByText(hint, { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '+ Add known spell (manual)' }).click();
  await expect(page.getByText(hint, { exact: true })).toHaveCount(2);

  const addPicker = page.getByLabel('Known spell to add');
  const studyPicker = page.getByLabel('Spell to study');

  // Adding by hand is the add form's default source, and it also offers the
  // higher Ranks, in one group of their own and after the learnable ones. A
  // study reads its spell from a book by default, so switch to the mentor
  // source, which offers every spell of a learnable Rank: it gets no such group.
  await page.getByRole('radio', { name: 'Mentor' }).check();
  await expect.poll(() => offeredRanks(studyPicker)).toEqual(['Rank 1', 'Rank 2']);
  expect(await offeredRanks(addPicker)).toEqual(['Rank 1', 'Rank 2', REFEREE_GROUP]);

  // So no spell of a higher Rank can be studied. Fireball is Rank 3 and Teleport
  // Rank 5; the mentor pool filters on Rank alone (a known spell stays in it,
  // marked "Already known"), so that filter is what leaves both out.
  for (const spell of ['Fireball', 'Teleport']) {
    await expect(studyPicker.locator('option', { hasText: spell })).toHaveCount(0);
  }
  // Rank 2's Levitate is still offered, so the study picker isn't simply empty.
  await expect(studyPicker.locator('option', { hasText: 'Levitate' })).toHaveCount(1);
});

test('a spell a Referee grants above those Ranks can still be recorded by hand', async ({ page }) => {
  const character = await openApp(page, FIXTURES.lowLevelMagician);
  await openTab(page, SPELLS_TAB);
  await page.getByRole('button', { name: '+ Add known spell (manual)' }).click();

  const addPicker = page.getByLabel('Known spell to add');
  const addButton = page.getByRole('button', { name: 'Add', exact: true });

  // Fireball (Rank 3) is one Rank above what a level 3 magician can learn, and
  // the picker offers it only under the Referee-grant group, which a player has
  // to choose deliberately. That one group spans Ranks 3 to 6, so every option
  // names its own Rank, as a study's options do.
  const refereeOptionTexts = await addPicker
    .locator(`optgroup[label="${REFEREE_GROUP}"] option`)
    .evaluateAll((options) => options.map((option) => option.textContent ?? ''));
  expect(refereeOptionTexts.length).toBeGreaterThan(0);
  for (const text of refereeOptionTexts) expect(text).toMatch(/^R\d+ · \S/);
  expect(refereeOptionTexts).toContain('R3 · Fireball');
  expect(refereeOptionTexts).toContain('R5 · Teleport');

  await addPicker.selectOption({ label: 'R3 · Fireball' });
  await addButton.click();

  // It is recorded, and marked with the same red note as any other too-high spell.
  const note = knownSpellRow(page, 'Fireball').getByText(rankAboveLearnableNote(3, character.level), { exact: true });
  await expect(note).toHaveCount(1);
  await expect(note).toHaveClass(/text-red-400/);

  // The escape belongs to the manual source alone: switching the source to
  // Mentor drops the group and clears the choice, as it does in the study form,
  // so a spell picked there can't be re-armed by switching back.
  await page.getByRole('button', { name: '+ Add known spell (manual)' }).click();
  await addPicker.selectOption({ label: 'R3 · Fireball' });
  await page.getByLabel('How was this spell learned?').selectOption({ label: 'Mentor' });
  await expect.poll(() => offeredRanks(addPicker)).toEqual(['Rank 1', 'Rank 2']);
  await expect(addPicker).toHaveValue('');
  await expect(addButton).toBeDisabled();
  await page.getByLabel('How was this spell learned?').selectOption({ label: 'Manual' });
  await expect(addPicker).toHaveValue('');
});

test('known spells and studies above those Ranks say so', async ({ page }) => {
  const character = await openApp(page, FIXTURES.lowLevelMagician);
  await openTab(page, SPELLS_TAB);

  // The Rank 5 spell the fixture has already learned, in a red note.
  const knownNote = knownSpellRow(page, 'Teleport').getByText(rankAboveLearnableNote(5, character.level), { exact: true });
  await expect(knownNote).toHaveCount(1);
  await expect(knownNote).toHaveClass(/text-red-400/);

  // The Rank 4 study in progress, and the one queued behind it.
  await expect(page.getByText(rankAboveLearnableNote(4, character.level), { exact: true })).toHaveCount(2);
  // Only two rows carry a note: the known Rank 5 spell and the queued Rank 4
  // study (the active study's is in its card, not in a row).
  await expect(notedRows(page).filter({ hasText: 'is above what you can learn' })).toHaveCount(2);
});
