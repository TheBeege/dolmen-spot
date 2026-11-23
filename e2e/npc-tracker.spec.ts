// The NPCs tab: the people the character has met, where they are, the quests
// they've given them, and the notes written about them. A note is a journal
// entry that names the NPC (JournalEntry.npcIds), so it shows in the Journal
// tab too, and the two deletes are one. Deleting an NPC leaves their notes
// behind.
//
// The fixture that has NPCs is kitchen-sink: Sister Ysolde (a hex, two quests,
// one done), Old Mother Brindle (no affiliation, no hex, no quests) and the
// Queen's librarian (in Fairy, one note written there), with one note about
// Ysolde and Brindle together.
import type { Locator, Page } from '@playwright/test';
import { formatCalendarDate } from '../src/lib/gamedata';
import type { Character } from '../src/lib/types';
import { FIXTURES, openApp, openTab, settle, TABS } from './support/app';
import { findA11yProblems } from './support/a11y';
import { findLayoutProblems } from './support/layout';
import { newProblems } from './known-issues';
import { expect, test, viewportAt } from './support/test';

const NPCS_TAB = TABS.find((tab) => tab.id === 'npcs')!;
const JOURNAL_TAB = TABS.find((tab) => tab.id === 'journal')!;

/** The widths this spec checks the tab's layout and accessibility at, besides the suite's own. */
const CHECK_WIDTHS = [320, 375, 1280] as const;

/** An NPC's card, by the name at the top of it. */
function card(page: Page, name: string): Locator {
  return page.getByRole('article', { name });
}

/** The form for a new NPC, or for the one being edited. */
function form(page: Page, name: string): Locator {
  return page.getByRole('form', { name });
}

/** The text of every journal entry on the Journal tab, as its cards hold it. */
async function journalTexts(page: Page): Promise<string[]> {
  return page
    .locator('main textarea')
    .evaluateAll((areas) => areas.map((area) => (area as HTMLTextAreaElement).value));
}

/** What the NPCs tab has kept of what was typed, outside the saved data (src/lib/npc-drafts.ts). */
interface KeptDrafts {
  notes: Record<string, string>;
  editing: unknown;
  form: unknown;
}

async function keptDrafts(page: Page, character: Character): Promise<KeptDrafts | null> {
  return page.evaluate(
    (id) => JSON.parse(sessionStorage.getItem(`dolmenwood-npc-drafts:${id}`) ?? 'null'),
    character.id,
  );
}

/** The NPCs tab's live region: what it last said. */
function status(page: Page): Locator {
  return page.locator('main').getByRole('status');
}

/** The problems on the NPCs tab that no known issue covers, at this window. */
async function expectNoProblems(page: Page, width: number, fontSize: number) {
  await settle(page);
  const where = { tab: 'npcs', width, fontSize } as const;
  expect(newProblems(await findLayoutProblems(page), where), `layout problems at ${width}px`).toEqual([]);
  expect(newProblems(await findA11yProblems(page), where), `accessibility problems at ${width}px`).toEqual([]);
}

test('the list shows each NPC, their quests and their notes', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  // By name: Old Mother Brindle, Sister Ysolde, the Queen's librarian.
  await expect(page.locator('main article h3')).toHaveText([
    'Old Mother Brindle',
    'Sister Ysolde',
    "The Queen's librarian",
  ]);
  await expect(page.getByText('3 NPCs', { exact: true })).toBeVisible();

  // Where they are, and their hex when it's on the map.
  const ysolde = card(page, 'Sister Ysolde');
  await expect(ysolde.getByText('The Church of Lankshorn', { exact: true })).toBeVisible();
  await expect(ysolde.getByText('Hex 1106', { exact: true })).toBeVisible();
  await expect(ysolde.getByText('Find the lost reliquary before the Drune do.', { exact: false })).toBeVisible();

  // How far their quests have got.
  await expect(ysolde.getByText('1 of 2 quests done', { exact: true })).toBeVisible();
  await expect(card(page, 'Old Mother Brindle').getByText('No quests yet', { exact: true })).toBeVisible();
  await expect(card(page, "The Queen's librarian").getByText('0 of 1 quest done', { exact: true })).toBeVisible();

  // The quests themselves, a done one ticked.
  await expect(ysolde.getByRole('checkbox', { name: 'Find the lost reliquary' })).not.toBeChecked();
  await expect(ysolde.getByRole('checkbox', { name: 'Bring her holy water to the barrow' })).toBeChecked();

  // The notes are the journal entries that name them: dated, and where they
  // were written. The entry about two of them is one of each one's notes.
  const shared = 'Wrote to Sister Ysolde about the reliquary';
  await expect(ysolde.getByText(shared, { exact: false })).toBeVisible();
  await expect(card(page, 'Old Mother Brindle').getByText(shared, { exact: false })).toBeVisible();
  // This one was written in Fairy, so it's dated by the visit.
  const librarian = card(page, "The Queen's librarian");
  await expect(librarian.getByText(/^Fairy visit 1, day 3 \(entered /)).toBeVisible();
  const librarianNote = librarian.locator('li').filter({ hasText: 'The librarian taught me Fireball' });
  await expect(librarianNote.getByText('The Court of the Hidden Moon', { exact: true })).toBeVisible();
});

test('an NPC can be added, edited, given a quest and a note, and deleted', async ({ page }) => {
  const character = await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  // ── Add ──
  await page.getByRole('button', { name: 'New NPC' }).click();
  const newForm = form(page, 'New NPC');
  await newForm.getByLabel('Name').fill('Hob the Carter');
  await newForm.getByLabel('Affiliation').fill('Prigwort');
  await newForm.getByLabel('Where they are').fill('The Prigwort road');
  await newForm.getByLabel('Map hex').fill('1309');
  await newForm.getByLabel('Goals').fill('To be paid what he is owed.');
  await newForm.getByRole('button', { name: 'Add NPC' }).click();

  const hob = card(page, 'Hob the Carter');
  await expect(hob).toBeVisible();
  await expect(status(page)).toHaveText('Hob the Carter added.');
  await expect(hob.getByText('Hex 1309', { exact: true })).toBeVisible();
  await expect(hob.getByText('No quests yet', { exact: true })).toBeVisible();
  await expect(page.getByText('4 NPCs', { exact: true })).toBeVisible();

  // It was saved as the app saves characters: the NPC is in the saved
  // character, with its own id and no hex it was never given.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('dolmenwood-characters') ?? '[]');
        return saved[0]?.npcs?.find((npc: { name: string }) => npc.name === 'Hob the Carter');
      }),
    )
    .toMatchObject({ affiliation: 'Prigwort', location: 'The Prigwort road', hex: '1309', quests: [] });

  // ── Edit ──
  await hob.getByRole('button', { name: 'Edit' }).click();
  const editForm = form(page, 'Edit Hob the Carter');
  await editForm.getByLabel('Affiliation').fill('Prigwort, and owed 4gp');
  await editForm.getByLabel('Map hex').fill('');
  await editForm.getByLabel('Goals').fill('To be paid, and to stop being asked about it.');
  await editForm.getByRole('button', { name: 'Save' }).click();

  await expect(card(page, 'Hob the Carter').getByText('Prigwort, and owed 4gp', { exact: true })).toBeVisible();
  await expect(card(page, 'Hob the Carter').getByText('Hex 1309', { exact: true })).toHaveCount(0);
  // A hex that isn't on the map is refused, with the reason, and nothing saved.
  await card(page, 'Hob the Carter').getByRole('button', { name: 'Edit' }).click();
  await form(page, 'Edit Hob the Carter').getByLabel('Map hex').fill('9999');
  await form(page, 'Edit Hob the Carter').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('No hex "9999" on the map.')).toBeVisible();
  await expect(form(page, 'Edit Hob the Carter')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(form(page, 'Edit Hob the Carter')).toHaveCount(0);

  // ── A quest ──
  const questInput = page.getByLabel('New quest for Hob the Carter');
  await questInput.fill('Carry the crate to Prigwort');
  await hob.getByRole('button', { name: 'Add quest' }).click();
  await expect(questInput).toHaveValue('');
  // The button disables itself as the field empties, so focus goes back to
  // the field rather than falling out of the tab.
  await expect(questInput).toBeFocused();
  const quest = hob.getByRole('checkbox', { name: 'Carry the crate to Prigwort' });
  await expect(quest).not.toBeChecked();
  await expect(hob.getByText('0 of 1 quest done', { exact: true })).toBeVisible();
  await quest.check();
  await expect(quest).toBeChecked();
  await expect(hob.getByText('1 of 1 quest done', { exact: true })).toBeVisible();

  // ── A note ──
  // It's a journal entry dated where and when the character is, and it shows
  // in the Journal tab, because that is what it is.
  const today = formatCalendarDate(character.currentDate);
  const noteText = 'Hob carried the crate, and asked about his four silver.';
  await hob.getByLabel('Write a note for Hob the Carter').fill(noteText);
  await hob.getByRole('button', { name: 'Add note' }).click();
  await expect(hob.getByText(noteText, { exact: true })).toBeVisible();
  // A textarea can't be submitted with Enter, so without this every note a
  // keyboard user adds would throw them out of the tab.
  await expect(hob.getByLabel('Write a note for Hob the Carter')).toBeFocused();
  await expect(hob.getByText(today, { exact: true })).toBeVisible();
  await expect(hob.getByLabel('Write a note for Hob the Carter')).toHaveValue('');
  await openTab(page, JOURNAL_TAB);
  expect(await journalTexts(page)).toContain(noteText);

  // ── Delete ──
  // The NPC goes; their notes stay in the journal.
  await openTab(page, NPCS_TAB);
  await hob.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Delete Hob the Carter?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete NPC' }).click();
  await expect(card(page, 'Hob the Carter')).toHaveCount(0);
  await expect(status(page)).toHaveText('Hob the Carter deleted. Their notes stay in the Journal.');
  await expect(page.getByText('3 NPCs', { exact: true })).toBeVisible();
  await openTab(page, JOURNAL_TAB);
  expect(await journalTexts(page), 'the note outlives the NPC').toContain(noteText);
});

test('a note is deleted once, from either tab', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  // The one note about Ysolde and Brindle together.
  const shared = 'Wrote to Sister Ysolde about the reliquary, and asked whether Mother Brindle might know where it went.';
  const ysoldeNote = card(page, 'Sister Ysolde').locator('li').filter({ hasText: shared });
  await ysoldeNote.getByRole('button', { name: /^Delete note \d+ of / }).click();
  // It was on two cards, so the tab says so: the other NPC's card loses it too.
  await expect(status(page)).toHaveText(
    "Sister Ysolde: note deleted. It was on 2 NPCs' cards and in the Journal.",
  );
  await expect(card(page, 'Sister Ysolde').getByText(shared, { exact: false })).toHaveCount(0);
  // It was one of Brindle's notes too, and one of the journal's entries.
  await expect(card(page, 'Old Mother Brindle').getByText(shared, { exact: false })).toHaveCount(0);
  await openTab(page, JOURNAL_TAB);
  expect(await journalTexts(page)).not.toContain(shared);

  // And a note deleted in the Journal is gone from the NPC's card.
  const librarianNote = 'The librarian taught me Fireball. The ink on my hands will not wash off.';
  const journalEntry = page.getByRole('textbox', { name: /^Entry for Fairy visit 1, day 3/ });
  await expect(journalEntry).toHaveValue(librarianNote);
  await page.getByRole('article').filter({ has: journalEntry }).getByRole('button', { name: 'Delete' }).click();
  await openTab(page, NPCS_TAB);
  await expect(card(page, "The Queen's librarian").getByText(librarianNote, { exact: false })).toHaveCount(0);
  await expect(card(page, "The Queen's librarian").getByText('No notes yet.', { exact: true })).toBeVisible();
});

test('the search finds an NPC by anything the card shows', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.fill('barrow');
  await expect(page.locator('main article h3')).toHaveText(['Sister Ysolde']);
  await expect(page.getByText('1 of 3 NPCs match “barrow”', { exact: true })).toBeVisible();

  // A hex, and a phrase in quotes, as the Journal's search takes them.
  await search.fill('"locks of hair"');
  await expect(page.locator('main article h3')).toHaveText(['Old Mother Brindle']);
  await search.fill('1106');
  await expect(page.locator('main article h3')).toHaveText(['Sister Ysolde']);

  // Nothing matches, so the list says so and offers the way back. ("Nobody"
  // would find Mother Brindle: her goals say nobody knows why she collects hair.)
  await search.fill('wossname');
  await expect(page.getByText('0 of 3 NPCs match “wossname”', { exact: true })).toBeVisible();
  await expect(page.getByText('No NPCs match.', { exact: false })).toBeVisible();
  await search.fill('');
  await expect(page.locator('main article h3')).toHaveCount(3);
});

test('the Journal says which NPCs an entry is about', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, JOURNAL_TAB);

  // Three of the fixture's entries name an NPC, and those three cards say who;
  // the entries about no one say nothing.
  await expect(page.getByText(/^About: /)).toHaveCount(3);
  await expect(page.getByText('About: Sister Ysolde, Old Mother Brindle', { exact: true })).toBeVisible();
  await expect(page.getByText('About: Old Mother Brindle', { exact: true })).toBeVisible();
  await expect(page.getByText("About: The Queen's librarian", { exact: true })).toBeVisible();

  // The Journal is found by the NPCs an entry is about, the same association
  // the NPCs tab searches from the other end, and the name is marked.
  await page.getByRole('searchbox', { name: 'Search' }).fill('brindle');
  await expect(page.getByText(/^About: /)).toHaveCount(2);
  await expect(page.locator('main p').filter({ hasText: /^About: / }).locator('mark')).toHaveCount(2);
});

test('a note and a form being written survive a switch to another tab', async ({ page }) => {
  const character = await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  // Half a note, and half of a new NPC's form.
  const halfWritten = 'Half a note about the reliquary';
  await card(page, 'Sister Ysolde').getByLabel('Write a note for Sister Ysolde').fill(halfWritten);
  await page.getByRole('button', { name: 'New NPC' }).click();
  await form(page, 'New NPC').getByLabel('Name').fill('Hob the Carter');

  // Looking at another tab unmounts this one, so both must have been kept:
  // coming back, they are as they were left.
  await openTab(page, JOURNAL_TAB);
  await openTab(page, NPCS_TAB);
  await expect(card(page, 'Sister Ysolde').getByLabel('Write a note for Sister Ysolde')).toHaveValue(halfWritten);
  const restored = form(page, 'New NPC');
  await expect(restored.getByLabel('Name')).toHaveValue('Hob the Carter');

  // Saving the form ends it, so it doesn't open again the next time.
  await restored.getByRole('button', { name: 'Add NPC' }).click();
  await expect(card(page, 'Hob the Carter')).toBeVisible();
  await openTab(page, JOURNAL_TAB);
  await openTab(page, NPCS_TAB);
  await expect(form(page, 'New NPC')).toHaveCount(0);

  // Cancelling a form throws away what was kept of it, so it doesn't open
  // again with what was typed.
  await page.getByRole('button', { name: 'New NPC' }).click();
  await form(page, 'New NPC').getByLabel('Name').fill('Nobody In Particular');
  await form(page, 'New NPC').getByRole('button', { name: 'Cancel' }).click();
  await openTab(page, JOURNAL_TAB);
  await openTab(page, NPCS_TAB);
  await expect(form(page, 'New NPC')).toHaveCount(0);
  await expect(page.getByText('Nobody In Particular')).toHaveCount(0);

  // And what's kept no longer holds it: a form draft without the form to open
  // it is invisible on screen, so this is read where it lives. The note draft
  // is still there, which is what keeps the key alive.
  const kept = await keptDrafts(page, character);
  expect(kept?.form).toBeNull();
  expect(kept?.editing).toBeNull();
  expect(kept?.notes[character.npcs[0].id]).toBe(halfWritten);

  // Adding the note clears what was kept of it, so the box is empty again.
  await card(page, 'Sister Ysolde').getByRole('button', { name: 'Add note' }).click();
  await expect(card(page, 'Sister Ysolde').getByText(halfWritten, { exact: true })).toBeVisible();
  await openTab(page, JOURNAL_TAB);
  await openTab(page, NPCS_TAB);
  await expect(card(page, 'Sister Ysolde').getByLabel('Write a note for Sister Ysolde')).toHaveValue('');
});

test('cancelling puts the focus back where it came from', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  // An edit cancelled by its button, then by Escape: the card is focused, and
  // the form it opened has gone.
  const ysolde = card(page, 'Sister Ysolde');
  await ysolde.getByRole('button', { name: 'Edit' }).click();
  await form(page, 'Edit Sister Ysolde').getByRole('button', { name: 'Cancel' }).click();
  await expect(form(page, 'Edit Sister Ysolde')).toHaveCount(0);
  await expect(ysolde).toBeFocused();
  await ysolde.getByRole('button', { name: 'Edit' }).click();
  await form(page, 'Edit Sister Ysolde').getByLabel('Name').press('Escape');
  await expect(form(page, 'Edit Sister Ysolde')).toHaveCount(0);
  await expect(ysolde).toBeFocused();

  // A new NPC's form cancelled: the button that opens it.
  await page.getByRole('button', { name: 'New NPC' }).click();
  await form(page, 'New NPC').getByRole('button', { name: 'Cancel' }).click();
  await expect(form(page, 'New NPC')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New NPC' })).toBeFocused();

  // A delete that isn't confirmed: the card whose delete it was.
  const brindle = card(page, 'Old Mother Brindle');
  await brindle.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Delete Old Mother Brindle?')).toHaveCount(0);
  await expect(brindle).toBeFocused();
});

test('deleting a quest or a note leaves the focus on the card', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  // The quest's Delete goes with the quest.
  const ysolde = card(page, 'Sister Ysolde');
  await ysolde.getByRole('button', { name: 'Delete quest Find the lost reliquary for Sister Ysolde' }).click();
  await expect(ysolde.getByRole('checkbox', { name: 'Find the lost reliquary' })).toHaveCount(0);
  await expect(ysolde).toBeFocused();

  // And a note's with the note.
  const brindle = card(page, 'Old Mother Brindle');
  await brindle.getByRole('button', { name: /^Delete note \d+ of .* for Old Mother Brindle: Old Mother Brindle taught me Glyph/ }).click();
  await expect(brindle.getByText('Glyph of Locking', { exact: false })).toHaveCount(0);
  await expect(brindle).toBeFocused();
});

test('the focus goes to the heading when the saved NPC leaves the list', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  const search = page.getByRole('searchbox', { name: 'Search' });
  // One NPC, by a phrase only her affiliation has: the librarian's quest has
  // "Lankshorn" in it, and the notes are searched too.
  await search.fill('"Church of Lankshorn"');
  await expect(page.locator('main article h3')).toHaveText(['Sister Ysolde']);

  // Saving her out of the search takes the card with it: focus falls back to
  // the heading rather than out of the tab.
  await card(page, 'Sister Ysolde').getByRole('button', { name: 'Edit' }).click();
  const editForm = form(page, 'Edit Sister Ysolde');
  await editForm.getByLabel('Affiliation').fill('The Church of Prigwort');
  await editForm.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('0 of 3 NPCs match', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'NPCs' })).toBeFocused();

  // The same when an edit is cancelled under a search that no longer includes
  // the NPC: the card was kept for the form, and goes with it.
  await search.fill('');
  await card(page, 'Old Mother Brindle').getByRole('button', { name: 'Edit' }).click();
  await search.fill('"holy water"');
  // Her card stays while her form is open, though the search leaves her out.
  await expect(card(page, 'Old Mother Brindle')).toBeVisible();
  await expect(card(page, 'Sister Ysolde')).toBeVisible();
  await form(page, 'Edit Old Mother Brindle').getByRole('button', { name: 'Cancel' }).click();
  await expect(card(page, 'Old Mother Brindle')).toHaveCount(0);
  await expect(card(page, 'Sister Ysolde')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'NPCs' })).toBeFocused();
});

test('clearing the search keeps the focus in the tab', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  const search = page.getByRole('searchbox', { name: 'Search' });

  // The ✕ goes with the search it clears: focus goes back to the field.
  await search.fill('ysolde');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  // Escape never leaves the field, so it stays there.
  await search.fill('ysolde');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  // The no-match panel's own button goes with the panel.
  await search.fill('wossname');
  const panel = page.getByText('No NPCs match.', { exact: false });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Clear search' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('main article h3')).toHaveCount(3);
  await expect(search).toBeFocused();
});

test('the search box stays while it is still filtering, and goes once it is not', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  const search = page.getByRole('searchbox', { name: 'Search' });
  await expect(search).toBeVisible();

  // A search all three match, then two of them deleted: one NPC is left, and
  // the box has to stay, because it is what the list is being filtered by.
  await search.fill('the');
  await expect(page.locator('main article h3')).toHaveCount(3);
  for (const name of ['Old Mother Brindle', "The Queen's librarian"]) {
    await card(page, name).getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete NPC' }).click();
    await expect(card(page, name)).toHaveCount(0);
  }
  await expect(page.locator('main article h3')).toHaveText(['Sister Ysolde']);
  await expect(search).toBeVisible();

  // Cleared, with one NPC left, there is nothing to search: the box goes, and
  // focus falls back to the heading rather than out of the tab.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'NPCs' })).toBeFocused();
});

test('a new NPC with nothing typed into it saves nothing', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, NPCS_TAB);

  await page.getByRole('button', { name: 'New NPC' }).click();
  const newForm = form(page, 'New NPC');
  const submit = newForm.getByRole('button', { name: 'Add NPC' });

  // Nothing typed, nothing to add: as "Add note" and "Add quest" behave.
  await expect(submit).toBeDisabled();
  await expect(page.getByText('3 NPCs', { exact: true })).toBeVisible();
  await newForm.getByLabel('Name').fill('Hob the Carter');
  await expect(submit).toBeEnabled();
  // A name typed and taken away again leaves nothing to save either.
  await newForm.getByLabel('Name').fill('');
  await expect(submit).toBeDisabled();
  await expect(page.getByText('3 NPCs', { exact: true })).toBeVisible();
});

for (const width of CHECK_WIDTHS) {
  test(`the tab fits and passes axe at ${width}px`, async ({ page, defaultFontSize }) => {
    await page.setViewportSize(viewportAt(width));
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, NPCS_TAB);

    // As it opens.
    await expectNoProblems(page, width, defaultFontSize);

    // With an NPC's form open, and the new NPC's form, which aren't open when
    // the suite's own layout and accessibility tests open the tab.
    await card(page, 'Sister Ysolde').getByRole('button', { name: 'Edit' }).click();
    await expectNoProblems(page, width, defaultFontSize);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'New NPC' }).click();
    await expectNoProblems(page, width, defaultFontSize);
    await page.getByRole('button', { name: 'Cancel' }).click();

    // And with a delete waiting to be confirmed.
    await card(page, 'Old Mother Brindle').getByRole('button', { name: 'Delete', exact: true }).click();
    await expectNoProblems(page, width, defaultFontSize);
  });
}
