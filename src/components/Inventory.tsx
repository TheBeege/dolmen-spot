'use client';

import { useState, useEffect } from 'react';
import { Character, CharacterUpdater, InventoryItem, Coins, CharacterContainer, SpellbookEntry, ShardState, RationFreshness } from '@/lib/types';
import {
  getCoinGpEquivalent,
  EQUIPMENT_CATALOG,
  EQUIPMENT_CATEGORIES,
  ARMOUR_TABLE,
  WEAPONS_TABLE,
  ARCANE_SPELLS,
  findArcaneSpell,
  getSpellSummary,
  EquipmentEntry,
  EQUIPPED_SLOT_LIMIT,
  SPELLBOOK_CAPACITY,
  STOWED_SLOT_LIMIT,
  RATION_FRESHNESS,
} from '@/lib/gamedata';
import GrowingTextarea from './GrowingTextarea';
import {
  SPELL_PANEL_CLASSES,
  SpellInfo,
  SpellSummaryPanel,
  spellRowContexts,
  useSpellDisclosures,
  type SpellDisclosure,
} from '@/components/SpellInfo';
import {
  calculateEncumbrance,
  getOverloadNote,
  getContainerItems,
  getContainerLoad,
} from '@/lib/character-sheet';
import {
  describeRationShelfLife,
  describeRationSpoilage,
  getRationSpoilage,
  rationFreshnessLabel,
  rationItemFields,
  todayLivedDay,
} from '@/lib/rations';
import { pluralize } from '@/lib/grammar';
import { newId } from '@/lib/ids';
import {
  castsLabel,
  newShardState,
  shardLeyLineLabel,
  spendCast,
  withCastsPerCharge,
  SHARD_LINE_DELETED,
} from '@/lib/shards';

interface InventoryProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a] placeholder:text-[#9c948b]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

// The height of a one-line field (py-1, a 1.5rem line and the border), so a
// smaller control can be centred on the first line of a field that has grown.
const ONE_LINE_FIELD_HEIGHT = 'h-[calc(2rem+2px)]';

// The Name column from sm up: a quarter of the row, but never so narrow that
// most catalog names wrap. Rows and column headers both use it.
const NAME_COLUMN = 'sm:flex-none sm:w-1/4 sm:min-w-44';
const NAME_HEADER = 'w-1/4 min-w-44';

// Spell book and scroll rows have a 1px border, so their padding is 1px less
// than an item row's to keep their fields on the same columns.
const BORDERED_ROW_PADDING = 'py-2 px-[calc(0.5rem-1px)]';

// On phones a name shares its line with the move select and × until that would
// make it narrower than this; then they wrap below it. In rem, so it grows with
// the default font size (6rem is 96px at 16px, 144px at 24px), but never wider
// than the row. A spell book's title cell adds room for its toggle and icon
// (3rem); a cell that holds an icon beside its field (a scroll's spell, a
// shard's name) adds room for that icon (1.5rem).
const NAME_MIN_WIDTH = 'min-w-[min(6rem,100%)]';
const SPELL_BOOK_TITLE_MIN_WIDTH = 'min-w-[min(9rem,100%)]';
const ICON_CELL_MIN_WIDTH = 'min-w-[min(7.5rem,100%)]';

/**
 * A whole-number field that keeps the text the player is typing until they
 * leave it. Bound straight to a clamped value, `<input type="number">` fights
 * them: clearing it to type a new number snaps back to the least allowed, so
 * choosing 3 gives 13. Enter leaves the field, so the keyboard can move on.
 */
function WholeNumberField({
  value,
  onCommit,
  ariaLabel,
  title,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
  title: string;
  className: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      value={text ?? String(value)}
      min={1}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null) onCommit(text.trim() === '' ? 0 : Number(text));
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      title={title}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

// What goes in brackets after each info button's name, so a screen reader can
// tell one spell's button from another's: where that spell is (see
// spellRowContexts).
const SPELL_BOOK_CONTEXT = 'in a spell book';
const SCROLL_CONTEXT = 'scroll';
const SHARD_CONTEXT = 'on a Dwemer shard';

// A spell book's list of spells is marked data-spell-list, so the summary card
// keeps off the spells in that book. A scroll's or a shard's row has no list to
// mark: its row sits among ordinary items in the equipped or stowed list, so
// there's no element holding the scrolls or shards alone. Its own row is marked
// data-spell-row instead, which keeps the card off that row's picker and
// controls.

// The name a spell book's row goes by in the disclosure state. Its spells have
// no ids of their own, so it's the book's id and the spell's place in it.
const bookSpellKey = (itemId: string, index: number) => `${itemId}-${index}`;

// Whether the app can say what the spell named here does (it can't for a name
// it doesn't know), and so whether the row gets an info button.
const hasSpellSummary = (name: string) => getSpellSummary('arcane', name) !== undefined;

/**
 * The info button for the spell a row's picker names, or nothing while it
 * names none or one the app doesn't know. Only the button shows the summary
 * card: a card over the picker would get in the way of choosing the spell.
 * Its panel is the SpellSummaryPanel beside it.
 */
function SpellPickerInfo({ name, context, info }: { name: string; context: string; info: SpellDisclosure }) {
  if (!name || !hasSpellSummary(name)) return null;
  return (
    <SpellInfo spellType="arcane" name={name} context={context} {...info} className="w-6 h-6 shrink-0" />
  );
}

type CatalogTarget = { section: 'equipped' } | { section: 'stowed'; containerId?: string };

export default function Inventory({ character, onChange }: InventoryProps) {
  const { equippedItems, stowedItems, containers, tinyItems, coins, encumbranceMethod } = character;

  // Catalog browser state
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<string>('all');
  const [catalogTarget, setCatalogTarget] = useState<CatalogTarget>({ section: 'equipped' });

  // Container add dropdown
  const [containerDropdownOpen, setContainerDropdownOpen] = useState(false);

  // Collapsed container state
  const [collapsedContainers, setCollapsedContainers] = useState<Set<string>>(new Set());

  // Collapsed spellbook state (spellbook items default to expanded)
  const [collapsedSpellbooks, setCollapsedSpellbooks] = useState<Set<string>>(new Set());

  // Magical-item dropdown ("+ Spellbook" / "+ Scroll") per add-context
  const [magicalDropdownFor, setMagicalDropdownFor] = useState<string | null>(null);

  // A spell book's spells and a scroll's spell are picked in a <select>, whose
  // options can't hold an info button or a summary, so each of those rows has
  // the button (SpellInfo) beside its picker instead. One set of disclosures
  // for the books' spells and one for the scrolls.
  const bookSpellInfo = useSpellDisclosures();
  const scrollSpellInfo = useSpellDisclosures();
  const shardSpellInfo = useSpellDisclosures();
  // The rows the page shows, in the order it shows them: the equipped items,
  // then the stowed ones container by container, then the loose ones. A
  // collapsed container's items are left out, since it hides them.
  const stowedInRowOrder = [
    ...containers.flatMap((container) =>
      collapsedContainers.has(container.id) ? [] : getContainerItems(stowedItems, container.id),
    ),
    ...getContainerItems(stowedItems, undefined),
  ];
  const rowsInRowOrder = [...equippedItems, ...stowedInRowOrder];
  // The spell book rows those items show, a collapsed book's left out: one per
  // spell in a book, named or not yet, since a spell picked there takes its
  // place among them.
  const bookSpellRows = rowsInRowOrder.flatMap((item) =>
    item.kind === 'spellbook' && !collapsedSpellbooks.has(item.id)
      ? (item.spellbookContents ?? []).map((entry, index) => ({
          key: bookSpellKey(item.id, index),
          name: entry.name,
        }))
      : [],
  );
  // What each button's name says about which copy it is: a spell held in more
  // than one book is numbered down the page ("in a spell book, 2 of 2") against
  // the rows above, never against one the player can't see; and without the
  // numbering, two books holding one spell would have two buttons with a
  // single name.
  const bookContextByKey = new Map<string, string>(
    spellRowContexts('arcane', bookSpellRows.map((row) => row.name), SPELL_BOOK_CONTEXT).map(
      (context, i): [string, string] => [bookSpellRows[i].key, context],
    ),
  );
  const scrollRows = rowsInRowOrder.filter((item) => item.kind === 'scroll');
  const scrollContextById = new Map<string, string>(
    spellRowContexts('arcane', scrollRows.map((item) => item.scrollSpell?.name ?? ''), SCROLL_CONTEXT).map(
      (context, i): [string, string] => [scrollRows[i].id, context],
    ),
  );
  const shardRows = rowsInRowOrder.filter((item) => item.kind === 'shard');
  const shardContextById = new Map<string, string>(
    spellRowContexts('arcane', shardRows.map((item) => item.shard?.spell?.name ?? ''), SHARD_CONTEXT).map(
      (context, i): [string, string] => [shardRows[i].id, context],
    ),
  );

  // Escape key + body scroll lock for catalog modal
  useEffect(() => {
    if (!catalogOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCatalogOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [catalogOpen]);

  // Dismiss the "+ Magical ▾" dropdown on outside click. Each invocation
  // tags itself with [data-magical-dropdown="<key>"]; we close when a
  // click lands outside the currently-open dropdown.
  useEffect(() => {
    if (!magicalDropdownFor) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest(`[data-magical-dropdown="${magicalDropdownFor}"]`)) {
        setMagicalDropdownFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [magicalDropdownFor]);

  // Close the container-catalog dropdown on outside click too.
  useEffect(() => {
    if (!containerDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest('[data-container-dropdown]')) {
        setContainerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [containerDropdownOpen]);

  // ── Encumbrance calculations (with coins) ──
  // Rations are ordinary items, so their slots and weight are already in these
  // totals (calculateEncumbrance, src/lib/character-sheet.ts): a day's rations is
  // 1 slot and 20 coins, fresh or preserved.
  const encumbrance = calculateEncumbrance(character);
  const {
    coinWeight,
    coinSlots,
    totalCoinCount,
    itemEquippedWeight,
    itemStowedWeight,
    totalWeight,
    totalEquippedSlots,
    itemStowedSlots,
    totalStowedSlots,
    speed: calculatedSpeed,
    equippedSlotsOverLimit,
    stowedSlotsOverLimit,
    overMaxLoad,
  } = encumbrance;
  const overloadNote = getOverloadNote(encumbrance, encumbranceMethod);

  // ── Item handlers ──
  const handleAddItem = (equipped: boolean, containerId?: string) => {
    const newItem: InventoryItem = {
      id: newId(),
      name: '',
      slots: 1,
      weight: 10,
      notes: '',
      equipped,
      ...(equipped ? {} : { containerId }),
    };

    if (equipped) {
      onChange({ equippedItems: [...equippedItems, newItem] });
    } else {
      onChange({ stowedItems: [...stowedItems, newItem] });
    }
  };

  const handleAddFromCatalog = (entry: EquipmentEntry | {
    name: string; weight: number; slots: number; notes?: string; ration?: RationFreshness;
  }) => {
    // Auto-detect blank spell books from the catalog so they get the spellbook UI.
    // Anchored to the start of the name so unrelated items containing "spellbook"
    // (e.g. a hypothetical "Anti-Spellbook Ward") aren't misclassified.
    const isSpellbook = /^spell\s*book/i.test(entry.name);
    // A ration from the catalog becomes a ration item, so the sheet knows its
    // kind and when it was acquired. Its slots and weight are the rules' own
    // (RATIONS), stamped from the kind rather than taken from the catalog line.
    const ration = entry.ration ?? null;
    const { slots, weight } = ration ? rationItemFields(ration) : { slots: entry.slots, weight: entry.weight };
    const newItem: InventoryItem = {
      id: newId(),
      name: entry.name,
      slots,
      weight,
      notes: ('notes' in entry && entry.notes) || '',
      equipped: catalogTarget.section === 'equipped',
      ...(catalogTarget.section === 'stowed' && catalogTarget.containerId
        ? { containerId: catalogTarget.containerId }
        : {}),
      ...(isSpellbook ? { kind: 'spellbook' as const, spellbookContents: [] } : {}),
      ...(ration
        ? { kind: 'ration' as const, ration: { freshness: ration, acquiredLivedDay: todayLivedDay(character) } }
        : {}),
    };

    if (catalogTarget.section === 'equipped') {
      onChange({ equippedItems: [...equippedItems, newItem] });
    } else {
      onChange({ stowedItems: [...stowedItems, newItem] });
    }
  };

  const handleAddSpellbook = (equipped: boolean, containerId?: string) => {
    const newItem: InventoryItem = {
      id: newId(),
      name: 'Spell Book',
      slots: 1,
      weight: 10,
      notes: '',
      equipped,
      kind: 'spellbook',
      spellbookContents: [],
      ...(equipped ? {} : { containerId }),
    };
    if (equipped) onChange({ equippedItems: [...equippedItems, newItem] });
    else onChange({ stowedItems: [...stowedItems, newItem] });
    setMagicalDropdownFor(null);
  };

  const handleAddScroll = (equipped: boolean, containerId?: string) => {
    const newItem: InventoryItem = {
      id: newId(),
      name: 'Scroll',
      slots: 0,
      weight: 1,
      notes: '',
      equipped,
      kind: 'scroll',
      scrollSpell: { name: '', rank: 1 },
      ...(equipped ? {} : { containerId }),
    };
    if (equipped) onChange({ equippedItems: [...equippedItems, newItem] });
    else onChange({ stowedItems: [...stowedItems, newItem] });
    setMagicalDropdownFor(null);
  };

  // A Dwemer shard is a house feature, so it arrives uncharged and holding no
  // known spell (see lib/shards.ts): the player sets the spell and the line
  // it was charged on, or charges it on the map.
  const handleAddShard = (equipped: boolean, containerId?: string) => {
    const newItem: InventoryItem = {
      id: newId(),
      name: 'Dwemer shard',
      slots: 0,
      weight: 1,
      notes: '',
      equipped,
      kind: 'shard',
      shard: newShardState(),
      ...(equipped ? {} : { containerId }),
    };
    if (equipped) onChange({ equippedItems: [...equippedItems, newItem] });
    else onChange({ stowedItems: [...stowedItems, newItem] });
    setMagicalDropdownFor(null);
  };

  const updateInventoryItem = (equipped: boolean, itemId: string, mutator: (item: InventoryItem) => InventoryItem) => {
    const items = equipped ? equippedItems : stowedItems;
    const updated = items.map((item) => (item.id === itemId ? mutator(item) : item));
    if (equipped) onChange({ equippedItems: updated });
    else onChange({ stowedItems: updated });
  };

  // Through the functional form of onChange, like the map's own writes: several
  // shard writes in one event tick (a cast and a change of charge) compose
  // rather than the last one winning from a stale list.
  const handleShardUpdate = (
    equipped: boolean,
    itemId: string,
    updater: (shard: ShardState) => ShardState,
  ) => {
    onChange((prev) => {
      const items = (equipped ? prev.equippedItems : prev.stowedItems) ?? [];
      const updated = items.map((item) =>
        item.id === itemId ? { ...item, shard: updater(item.shard ?? newShardState()) } : item,
      );
      return equipped ? { equippedItems: updated } : { stowedItems: updated };
    });
  };

  const handleSpellbookAddEntry = (equipped: boolean, itemId: string) => {
    updateInventoryItem(equipped, itemId, (item) => {
      const contents = item.spellbookContents ?? [];
      if (contents.length >= SPELLBOOK_CAPACITY) return item;
      return { ...item, spellbookContents: [...contents, { name: '', rank: 1 }] };
    });
  };

  const handleSpellbookUpdateEntry = (
    equipped: boolean,
    itemId: string,
    index: number,
    updates: Partial<SpellbookEntry>,
  ) => {
    updateInventoryItem(equipped, itemId, (item) => {
      const contents = item.spellbookContents ?? [];
      return {
        ...item,
        spellbookContents: contents.map((e, i) => (i === index ? { ...e, ...updates } : e)),
      };
    });
  };

  const handleSpellbookRemoveEntry = (equipped: boolean, itemId: string, index: number) => {
    updateInventoryItem(equipped, itemId, (item) => ({
      ...item,
      spellbookContents: (item.spellbookContents ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleScrollUpdate = (
    equipped: boolean,
    itemId: string,
    updates: Partial<SpellbookEntry>,
  ) => {
    updateInventoryItem(equipped, itemId, (item) => ({
      ...item,
      scrollSpell: { name: '', rank: 1, ...item.scrollSpell, ...updates },
    }));
  };

  // Changing a ration's kind restamps the name, slots and weight the rules give
  // it, so the shelf life and the totals follow (both kinds take 1 slot). It
  // keeps the day it was acquired on.
  const handleRationFreshness = (equipped: boolean, itemId: string, freshness: RationFreshness) => {
    updateInventoryItem(equipped, itemId, (item) => ({
      ...item,
      ...rationItemFields(freshness),
      ration: {
        freshness,
        acquiredLivedDay: item.ration?.acquiredLivedDay ?? todayLivedDay(character),
      },
    }));
  };

  const toggleSpellbookCollapse = (id: string) => {
    setCollapsedSpellbooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleUpdateItem = (
    equipped: boolean,
    itemId: string,
    field: keyof InventoryItem,
    value: string | number | boolean
  ) => {
    const items = equipped ? equippedItems : stowedItems;
    const updated = items.map((item) =>
      item.id === itemId ? { ...item, [field]: value } : item
    );

    if (equipped) {
      onChange({ equippedItems: updated });
    } else {
      onChange({ stowedItems: updated });
    }
  };

  const handleDeleteItem = (equipped: boolean, itemId: string) => {
    if (equipped) {
      onChange({ equippedItems: equippedItems.filter((item) => item.id !== itemId) });
    } else {
      onChange({ stowedItems: stowedItems.filter((item) => item.id !== itemId) });
    }
  };

  const handleMoveToContainer = (itemId: string, containerId: string | undefined) => {
    const updated = stowedItems.map((item) =>
      item.id === itemId ? { ...item, containerId } : item
    );
    onChange({ stowedItems: updated });
  };

  const handleCoinChange = (coin: keyof Coins, value: number) => {
    onChange({ coins: { ...coins, [coin]: value } });
  };

  // ── Container handlers ──
  const handleAddContainer = (entry: EquipmentEntry) => {
    const newContainer: CharacterContainer = {
      id: newId(),
      name: entry.name,
      capacity: entry.capacity ?? 0,
    };
    onChange({ containers: [...containers, newContainer] });
    setContainerDropdownOpen(false);
  };

  const handleDeleteContainer = (containerId: string) => {
    // Move items from deleted container to "Loose"
    const updatedItems = stowedItems.map((item) =>
      item.containerId === containerId ? { ...item, containerId: undefined } : item
    );
    onChange({
      containers: containers.filter((c) => c.id !== containerId),
      stowedItems: updatedItems,
    });
  };

  const toggleContainerCollapse = (id: string) => {
    setCollapsedContainers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Catalog data ──
  const containerCatalogEntries = EQUIPMENT_CATALOG.filter((e) => e.category === 'container' && e.capacity && e.capacity > 0);

  const getFilteredCatalog = () => {
    // `ration` is carried through for the two ration lines: adding one of those
    // makes a ration item (with its kind and acquisition day) rather than a
    // plain item, so dropping it here would lose the whole point of the entry.
    const allItems: {
      name: string; cost: number; costUnit?: string; weight: number; slots: number;
      notes?: string; source: string; ration?: RationFreshness;
    }[] = [];

    // Add armour entries
    ARMOUR_TABLE.filter(a => a.name !== 'Unarmoured').forEach((a) => {
      allItems.push({ name: a.name, cost: a.cost, weight: a.weight, slots: a.slots, source: 'Armour' });
    });

    // Add weapon entries
    WEAPONS_TABLE.forEach((w) => {
      allItems.push({ name: w.name, cost: w.cost, weight: w.weight, slots: w.slots, source: 'Weapons' });
    });

    // Add equipment catalog entries
    EQUIPMENT_CATALOG.forEach((e) => {
      allItems.push({
        name: e.name,
        cost: e.cost,
        costUnit: e.costUnit,
        weight: e.weight,
        slots: e.slots,
        notes: e.notes,
        source: e.category,
        ...(e.ration ? { ration: e.ration } : {}),
      });
    });

    let filtered = allItems;

    if (catalogCategory !== 'all') {
      if (catalogCategory === 'armour') {
        filtered = filtered.filter((i) => i.source === 'Armour');
      } else if (catalogCategory === 'weapons') {
        filtered = filtered.filter((i) => i.source === 'Weapons');
      } else {
        filtered = filtered.filter((i) => i.source === catalogCategory);
      }
    }

    if (catalogSearch) {
      const search = catalogSearch.toLowerCase();
      filtered = filtered.filter((i) => i.name.toLowerCase().includes(search));
    }

    return filtered;
  };

  // A label for a control that sits off the columns, so has no column header
  // above it: shown at every width. `aria-hidden`, as the control names itself.
  const stateLabel = (text: string) => (
    <span aria-hidden="true" className="text-[10px] uppercase tracking-wide text-[#f5e6c8]/70">
      {text}
    </span>
  );

  // ── Render helpers ──
  // Phones hide the column headers, so each field gets a short visible label there.
  const phoneLabel = (text: string) => (
    <span aria-hidden="true" className="sm:hidden text-[10px] uppercase tracking-wide text-[#f5e6c8]/70">
      {text}
    </span>
  );

  // Enter in a name field moves on to the item's Slots field.
  const slotsFieldId = (itemId: string) => `inventory-${itemId}-slots`;
  const focusSlots = (itemId: string) => () => document.getElementById(slotsFieldId(itemId))?.focus();

  // Two containers can share a name ("Backpack"), so one that does says which
  // it is - its place among the containers - wherever a player picks one or is
  // told which one they mean.
  const containerLabel = (container: CharacterContainer) => {
    const name = container.name || 'container';
    const shared = containers.filter((c) => (c.name || 'container') === name).length > 1;
    return shared ? `${name} ${containers.findIndex((c) => c.id === container.id) + 1}` : name;
  };

  // A row's move select (stowed items, when there are containers) and its ×.
  // Every row renders each twice: on phones together after the name
  // (phoneControlsFor), and from sm up at the end of the row, with the other
  // copy hidden (display: none), so the keyboard order always matches what's on
  // screen. Each is one field line tall, so it sits centred on the first line of
  // a field that has grown.
  const moveSelectFor = (item: InventoryItem, equipped: boolean, label: string, layoutClass: string) =>
    !equipped && containers.length > 0 ? (
      <div className={`${ONE_LINE_FIELD_HEIGHT} shrink-0 items-center ${layoutClass}`}>
        <select
          value={item.containerId ?? ''}
          onChange={(e) => handleMoveToContainer(item.id, e.target.value || undefined)}
          className={`${inputClasses} w-10 text-xs p-0.5`}
          title="Move to container"
          aria-label={`Move ${label} to a container`}
        >
          <option value="">Loose</option>
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {containerLabel(c)}
            </option>
          ))}
        </select>
      </div>
    ) : null;
  const removeButtonFor = (item: InventoryItem, equipped: boolean, label: string, layoutClass: string) => (
    <button
      type="button"
      onClick={() => handleDeleteItem(equipped, item.id)}
      className={`text-[#ff6b4a] hover:text-[#f5e6c8] font-bold text-lg shrink-0 w-6 ${ONE_LINE_FIELD_HEIGHT} ${layoutClass}`}
      title={`Remove ${label}`}
      aria-label={`Remove ${label}`}
    >
      &times;
    </button>
  );
  // The phone copies of both, as one group: when there's no room beside the
  // name they wrap below it together, rather than the × on its own.
  const phoneControlsFor = (item: InventoryItem, equipped: boolean, label: string) => (
    <div className="flex shrink-0 items-start gap-2 sm:hidden">
      {moveSelectFor(item, equipped, label, 'flex')}
      {removeButtonFor(item, equipped, label, '')}
    </div>
  );

  // The arcane spells, grouped by rank: the options a spell book's entry, a
  // scroll's spell and a shard's spell all choose from.
  const spellOptions = () =>
    [1, 2, 3, 4, 5, 6].map((rank) => (
      <optgroup key={rank} label={`Rank ${rank}`}>
        {ARCANE_SPELLS.filter((s) => s.rank === rank).map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
      </optgroup>
    ));

  const renderSpellbookItem = (item: InventoryItem, equipped: boolean, position: string) => {
    const contents = item.spellbookContents ?? [];
    const bookName = item.name.trim() || 'spell book';
    const bookLabel = `${bookName} (${position})`;
    const isCollapsed = collapsedSpellbooks.has(item.id);
    const isFull = contents.length >= SPELLBOOK_CAPACITY;
    return (
      <div key={item.id} className="bg-[#1a1a2e] border border-[#5a3a28]/60 rounded mb-1">
        {/* Header, laid out like an item row: from sm up on the columns, with
            the spell count at the start of the Notes column; on phones the
            title, move select and × on the first line and labelled Slots and
            Weight on the second. A long title wraps, so everything lines up
            along the top, with the smaller controls centred on its first line. */}
        <div className={`flex flex-wrap items-start gap-2 ${BORDERED_ROW_PADDING}`}>
          <span className={`flex flex-1 ${SPELL_BOOK_TITLE_MIN_WIDTH} items-start gap-2 ${NAME_COLUMN}`}>
            <button
              type="button"
              onClick={() => toggleSpellbookCollapse(item.id)}
              className={`text-[#c4a35a] text-xs shrink-0 w-4 ${ONE_LINE_FIELD_HEIGHT} flex items-center justify-center`}
              title={isCollapsed ? 'Expand spell book' : 'Collapse spell book'}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${bookLabel}`}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
            <span className={`text-[#c4a35a] text-sm shrink-0 ${ONE_LINE_FIELD_HEIGHT} flex items-center`} title="Spell book">📕</span>
            <GrowingTextarea
              value={item.name}
              onValueChange={(name) => handleUpdateItem(equipped, item.id, 'name', name)}
              singleLine
              onEnter={focusSlots(item.id)}
              enterKeyHint="next"
              placeholder="Spell book title"
              aria-label={`Name of ${position}`}
              className="flex-1 min-w-0"
              fieldClassName={inputClasses}
            />
          </span>
          {phoneControlsFor(item, equipped, bookLabel)}
          <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-0 sm:flex-nowrap sm:items-start">
            <label className="flex flex-col gap-0.5">
              {phoneLabel('Slots')}
              <input
                id={slotsFieldId(item.id)}
                type="number"
                value={item.slots}
                onChange={(e) => handleUpdateItem(equipped, item.id, 'slots', parseInt(e.target.value) || 0)}
                min={0}
                title="Slots"
                aria-label={`${bookLabel} slots`}
                className={`${inputClasses} w-16 text-center`}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              {phoneLabel('Weight')}
              <input
                type="number"
                value={item.weight}
                onChange={(e) => handleUpdateItem(equipped, item.id, 'weight', parseInt(e.target.value) || 0)}
                min={0}
                title="Weight"
                aria-label={`${bookLabel} weight`}
                className={`${inputClasses} w-20 text-center`}
              />
            </label>
            <span className={`text-[#a1988f] text-xs shrink-0 ${ONE_LINE_FIELD_HEIGHT} flex items-center`}>
              {contents.length}/{SPELLBOOK_CAPACITY}
            </span>
            {/* The rest of the Notes column */}
            <span className="flex-1" />
            {moveSelectFor(item, equipped, bookLabel, 'hidden sm:flex')}
          </div>
          {removeButtonFor(item, equipped, bookLabel, 'hidden sm:block')}
        </div>

        {/* Spell list */}
        {!isCollapsed && (
          <div className="border-t border-[#5a3a28]/40 px-3 py-2 space-y-1" data-spell-list="">
            {contents.length === 0 && (
              <div className="text-[#9c948b] text-xs italic">No spells recorded. Up to 3.</div>
            )}
            {contents.map((entry, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2" data-spell-row="spell-book">
                <select
                  value={entry.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    const matched = findArcaneSpell(value);
                    handleSpellbookUpdateEntry(equipped, item.id, index, {
                      name: value,
                      rank: matched?.rank ?? entry.rank,
                    });
                  }}
                  aria-label={`Spell ${index + 1} in ${bookLabel}`}
                  className={`${inputClasses} flex-1 min-w-[160px] text-sm`}
                >
                  <option value="">-- Select spell --</option>
                  {spellOptions()}
                </select>
                <SpellPickerInfo
                  name={entry.name}
                  context={bookContextByKey.get(bookSpellKey(item.id, index)) ?? SPELL_BOOK_CONTEXT}
                  info={bookSpellInfo(bookSpellKey(item.id, index))}
                />
                <SpellSummaryPanel
                  spellType="arcane"
                  name={entry.name}
                  {...bookSpellInfo(bookSpellKey(item.id, index))}
                  className={SPELL_PANEL_CLASSES}
                />
                {entry.name && (
                  <span className="text-[#c4a35a] text-xs shrink-0">R{entry.rank}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleSpellbookRemoveEntry(equipped, item.id, index)}
                  className="text-[#ff6b4a] hover:text-[#f5e6c8] text-sm shrink-0 px-1"
                  title={`Remove ${entry.name || `spell ${index + 1}`} from ${bookLabel}`}
                  aria-label={`Remove ${entry.name || `spell ${index + 1}`} from ${bookLabel}`}
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleSpellbookAddEntry(equipped, item.id)}
              disabled={isFull}
              aria-label={
                isFull
                  ? `Full (${SPELLBOOK_CAPACITY}/${SPELLBOOK_CAPACITY}): ${bookLabel}`
                  : `Add spell to ${bookLabel}`
              }
              className={`text-xs px-2 py-0.5 rounded mt-1 ${
                isFull
                  ? 'bg-[#1a1a2e] text-[#9c948b] border border-dashed border-[#5a3a28]/70 cursor-not-allowed'
                  : 'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8]'
              }`}
            >
              {isFull ? `Full (${SPELLBOOK_CAPACITY}/${SPELLBOOK_CAPACITY})` : '+ Add spell'}
            </button>
            <GrowingTextarea
              value={item.notes}
              onValueChange={(notes) => handleUpdateItem(equipped, item.id, 'notes', notes)}
              placeholder="Notes (language, source, etc.)"
              aria-label={`${bookLabel} notes`}
              className="mt-1"
              fieldClassName={`${inputClasses} text-xs`}
            />
          </div>
        )}
      </div>
    );
  };

  // Laid out like an item row: from sm up on the columns, with the spell in the
  // Name column, an empty Slots cell (scrolls take no slots), Weight, and the
  // rank and Use button at the start of the Notes column; on phones the spell,
  // move select and × on the first line and the labelled Weight, rank and Use
  // button on the second.
  const renderScrollItem = (item: InventoryItem, equipped: boolean, position: string) => {
    const scroll = item.scrollSpell ?? { name: '', rank: 1 };
    const scrollName = scroll.name ? `scroll of ${scroll.name}` : 'scroll';
    const scrollLabel = `${scrollName} (${position})`;
    return (
      <div key={item.id} data-spell-row="scroll" className={`flex flex-wrap items-start gap-2 bg-[#1a1a2e] border border-[#5a3a28]/60 rounded mb-1 ${BORDERED_ROW_PADDING}`}>
        <span className={`flex flex-1 ${ICON_CELL_MIN_WIDTH} items-center gap-2 ${ONE_LINE_FIELD_HEIGHT} ${NAME_COLUMN}`}>
          <span className="text-[#c4a35a] text-sm shrink-0" title="Scroll">📜</span>
          <select
            value={scroll.name}
            onChange={(e) => {
              const value = e.target.value;
              const matched = findArcaneSpell(value);
              handleScrollUpdate(equipped, item.id, {
                name: value,
                rank: matched?.rank ?? scroll.rank,
              });
            }}
            aria-label={`Spell on ${position}`}
            className={`${inputClasses} flex-1 min-w-0 text-sm`}
          >
            <option value="">-- Select spell --</option>
            {spellOptions()}
          </select>
          <SpellPickerInfo
            name={scroll.name}
            context={scrollContextById.get(item.id) ?? SCROLL_CONTEXT}
            info={scrollSpellInfo(item.id)}
          />
        </span>
        <SpellSummaryPanel
          spellType="arcane"
          name={scroll.name}
          {...scrollSpellInfo(item.id)}
          className={SPELL_PANEL_CLASSES}
        />
        {phoneControlsFor(item, equipped, scrollLabel)}
        <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-0 sm:flex-nowrap sm:items-start">
          <span className="hidden sm:block w-16 shrink-0" />
          <label className="flex flex-col gap-0.5">
            {phoneLabel('Weight')}
            <input
              type="number"
              value={item.weight}
              onChange={(e) => handleUpdateItem(equipped, item.id, 'weight', parseInt(e.target.value) || 0)}
              min={0}
              title="Weight"
              aria-label={`${scrollLabel} weight`}
              className={`${inputClasses} w-20 text-center`}
            />
          </label>
          <span className={`flex flex-1 items-center gap-2 ${ONE_LINE_FIELD_HEIGHT}`}>
            {scroll.name && (
              <span className="text-[#c4a35a] text-xs shrink-0">R{scroll.rank}</span>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm(`Use the ${scroll.name || 'scroll'}? It will be consumed.`)) {
                  handleDeleteItem(equipped, item.id);
                }
              }}
              className="bg-[#5a3a28] hover:bg-[#4a2f20] text-[#f5e6c8] text-xs font-semibold px-2 py-1 rounded shrink-0"
              title="Use scroll (consumes it)"
              aria-label={`Use ${scrollLabel}`}
            >
              Use
            </button>
          </span>
          {moveSelectFor(item, equipped, scrollLabel, 'hidden sm:flex')}
        </div>
        {removeButtonFor(item, equipped, scrollLabel, 'hidden sm:block')}
      </div>
    );
  };

  // The lines a shard's row can name: the character's own, so a line deleted
  // since still reads as deleted rather than as nothing.
  const leyLines = character.mapData?.leyLines ?? [];

  // The Dwemer shard (a house feature, not the Player's Book's). Its own
  // fields — name, Slots, Weight — are laid out like any item row's; the spell
  // it holds and everything about charging it are on a line of their own
  // beneath, where they have room to wrap on a phone.
  const renderShardItem = (item: InventoryItem, equipped: boolean, position: string) => {
    const shard = item.shard ?? newShardState();
    const shardName = item.name.trim() || 'Dwemer shard';
    const shardLabel = `${shardName} (${position})`;
    const spellName = shard.spell?.name ?? '';
    const lineLabel = shardLeyLineLabel(shard, leyLines);
    const spent = shard.castsLeft <= 0;
    return (
      <div
        key={item.id}
        role="group"
        aria-label={shardLabel}
        data-spell-row="shard"
        className="bg-[#1a1a2e] border border-[#5a3a28]/60 rounded mb-1"
      >
        <div className={`flex flex-wrap items-start gap-2 ${BORDERED_ROW_PADDING}`}>
          <span className={`flex flex-1 ${ICON_CELL_MIN_WIDTH} items-center gap-2 ${ONE_LINE_FIELD_HEIGHT} ${NAME_COLUMN}`}>
            <span className="text-[#c4a35a] text-sm shrink-0" title="Dwemer shard">💎</span>
            <GrowingTextarea
              value={item.name}
              onValueChange={(name) => handleUpdateItem(equipped, item.id, 'name', name)}
              singleLine
              onEnter={focusSlots(item.id)}
              enterKeyHint="next"
              placeholder="Dwemer shard"
              aria-label={`Name of ${position}`}
              className="flex-1 min-w-0"
              fieldClassName={inputClasses}
            />
          </span>
          {phoneControlsFor(item, equipped, shardLabel)}
          <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-0 sm:flex-nowrap sm:items-start">
            <label className="flex flex-col gap-0.5">
              {phoneLabel('Slots')}
              <input
                id={slotsFieldId(item.id)}
                type="number"
                value={item.slots}
                onChange={(e) => handleUpdateItem(equipped, item.id, 'slots', parseInt(e.target.value) || 0)}
                min={0}
                title="Slots"
                aria-label={`${shardLabel} slots`}
                className={`${inputClasses} w-16 text-center`}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              {phoneLabel('Weight')}
              <input
                type="number"
                value={item.weight}
                onChange={(e) => handleUpdateItem(equipped, item.id, 'weight', parseInt(e.target.value) || 0)}
                min={0}
                title="Weight"
                aria-label={`${shardLabel} weight`}
                className={`${inputClasses} w-20 text-center`}
              />
            </label>
            {moveSelectFor(item, equipped, shardLabel, 'hidden sm:flex')}
          </div>
          {removeButtonFor(item, equipped, shardLabel, 'hidden sm:block')}
        </div>

        {/* The shard itself: the spell it holds, how many casts are left and
            spending one, what a charge gives, and the line it was last
            charged on. */}
        <div className="border-t border-[#5a3a28]/40 px-3 py-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex flex-col gap-0.5 flex-1 basis-40 min-w-0">
            {stateLabel('Spell')}
            <span className="flex items-center gap-1 min-w-0">
              <select
                value={spellName}
                onChange={(e) => {
                  const value = e.target.value;
                  const matched = findArcaneSpell(value);
                  handleShardUpdate(equipped, item.id, (s) => {
                    if (!value) {
                      // Leaving the spell unset drops it: the type has it absent
                      // until the player learns which spell the shard holds.
                      const { spell: _drop, ...rest } = s;
                      return rest;
                    }
                    return { ...s, spell: { name: value, rank: matched?.rank ?? s.spell?.rank ?? 1 } };
                  });
                }}
                aria-label={`Spell held by ${shardLabel}`}
                className={`${inputClasses} min-w-0 flex-1 text-sm`}
              >
                <option value="">-- No spell --</option>
                {/* A spell the arcane list does not hold (a divine spell, a
                    glamour, a name from an imported save) still shows as the
                    value rather than being drawn as "-- No spell --". */}
                {spellName && !ARCANE_SPELLS.some((s) => s.name === spellName) && (
                  <option value={spellName}>{spellName}</option>
                )}
                {spellOptions()}
              </select>
              <SpellPickerInfo
                name={spellName}
                context={shardContextById.get(item.id) ?? SHARD_CONTEXT}
                info={shardSpellInfo(item.id)}
              />
            </span>
          </div>
          <SpellSummaryPanel
            spellType="arcane"
            name={spellName}
            {...shardSpellInfo(item.id)}
            className={SPELL_PANEL_CLASSES}
          />
          <div className="flex flex-wrap items-center gap-2">
            {stateLabel('Casts')}
            {/* Announced when a cast is spent, since the button keeps focus. The
                shard's name is inside the region rather than in an aria-label:
                a label that changes is not announced, and "2 of 3" says nothing
                about what is being counted. */}
            <span aria-live="polite" className="text-[#f5e6c8] text-sm tabular-nums">
              <span className="sr-only">{`Casts left on ${shardLabel}: `}</span>
              {castsLabel(shard)}
            </span>
            <button
              type="button"
              onClick={() => handleShardUpdate(equipped, item.id, spendCast)}
              disabled={spent}
              aria-label={
                spent ? `Cast the spell from ${shardLabel}: no casts left` : `Cast the spell from ${shardLabel}`
              }
              title={spent ? 'No casts left: charge it on a ley line' : 'Cast the spell, spending one cast'}
              className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${
                spent
                  ? 'bg-[#1a1a2e] text-[#9c948b] border border-dashed border-[#5a3a28]/70 cursor-not-allowed'
                  : 'bg-[#5a3a28] hover:bg-[#4a2f20] text-[#f5e6c8]'
              }`}
            >
              Cast
            </button>
          </div>
          <label className="flex flex-col gap-0.5">
            {stateLabel('Per charge')}
            <WholeNumberField
              value={shard.castsPerCharge}
              onCommit={(castsPerCharge) =>
                handleShardUpdate(equipped, item.id, (s) => withCastsPerCharge(s, castsPerCharge))
              }
              ariaLabel={`Casts per charge for ${shardLabel}`}
              title="Casts one charge gives"
              className={`${inputClasses} w-20 text-center`}
            />
          </label>
          {/* min-w-0 and break-words: a line's name is the player's own text and
              can be one word wider than the row. */}
          <span className="min-w-0 break-words text-[#a1988f] text-xs">
            {lineLabel === null ? (
              'Not charged on a ley line yet'
            ) : (
              <>
                Charged on{' '}
                <span className={lineLabel === SHARD_LINE_DELETED ? 'italic' : 'text-[#f5e6c8]'}>{lineLabel}</span>
              </>
            )}
          </span>
          <GrowingTextarea
            value={item.notes}
            onValueChange={(notes) => handleUpdateItem(equipped, item.id, 'notes', notes)}
            placeholder="Notes"
            aria-label={`${shardLabel} notes`}
            className="w-full"
            fieldClassName={`${inputClasses} text-xs`}
          />
        </div>
      </div>
    );
  };

  // A day's rations (src/lib/rations.ts). Its slots and weight come from the
  // rules, so they're shown rather than edited, and the kind is the player's to
  // choose. The line under the row says how long it has left and never takes it
  // away: a spoiled ration stays until the player removes or eats it.
  const renderRationItem = (item: InventoryItem, equipped: boolean, position: string) => {
    const freshness: RationFreshness = item.ration?.freshness === 'preserved' ? 'preserved' : 'fresh';
    const spoilage = getRationSpoilage(character, item);
    const rowLabel = `${rationFreshnessLabel(freshness)} rations (${position})`;
    // Laid out like an item row, from sm up on the columns: the kind where the
    // name goes, then the rules' Slots and Weight, then the Notes. On phones
    // each value keeps its little label, as the fields do.
    const derived = (label: string, width: string, value: number) => (
      <span className="flex flex-col gap-0.5 shrink-0">
        {phoneLabel(label)}
        <span
          title={label}
          className={`text-[#f5e6c8] text-sm text-center ${ONE_LINE_FIELD_HEIGHT} flex items-center justify-center ${width}`}
        >
          {/* The column headers are hidden on phones, and no field names these
              values, so each says what it is to a screen reader. */}
          <span className="sr-only">{`${label}: `}</span>
          {value}
        </span>
      </span>
    );
    return (
      <div key={item.id} className="bg-[#1a1a2e] border border-[#5a3a28]/60 rounded mb-1">
        <div className={`flex flex-wrap items-start gap-2 ${BORDERED_ROW_PADDING}`}>
          <span className={`flex flex-1 ${NAME_MIN_WIDTH} items-center gap-2 ${NAME_COLUMN}`}>
            <span className="text-[#c4a35a] text-sm shrink-0" title="Rations">&#127838;</span>
            <select
              value={freshness}
              onChange={(e) => handleRationFreshness(equipped, item.id, e.target.value as RationFreshness)}
              aria-label={`Kind of ${position}`}
              title={`${rationFreshnessLabel(freshness)} rations`}
              className={`${inputClasses} flex-1 min-w-0 text-sm`}
            >
              {RATION_FRESHNESS.map((option) => (
                <option key={option} value={option}>{`${rationFreshnessLabel(option)} rations`}</option>
              ))}
            </select>
          </span>
          {phoneControlsFor(item, equipped, rowLabel)}
          <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-0 sm:flex-nowrap sm:items-start">
            {derived('Slots', 'w-16', item.slots)}
            {derived('Weight', 'w-20', item.weight)}
            <label className="flex flex-col gap-0.5 grow basis-full min-w-0 sm:basis-0">
              {phoneLabel('Notes')}
              <GrowingTextarea
                value={item.notes}
                onValueChange={(notes) => handleUpdateItem(equipped, item.id, 'notes', notes)}
                placeholder="Notes"
                aria-label={`${rowLabel} notes`}
                fieldClassName={inputClasses}
              />
            </label>
            {moveSelectFor(item, equipped, rowLabel, 'hidden sm:flex')}
          </div>
          {removeButtonFor(item, equipped, rowLabel, 'hidden sm:block')}
        </div>
        <div className="flex flex-wrap gap-x-2 border-t border-[#5a3a28]/40 px-3 py-1.5 text-xs">
          <span className={spoilage?.spoiled ? 'text-[#ff6b4a] font-semibold' : 'text-[#a1988f]'}>
            {spoilage ? describeRationSpoilage(spoilage) : 'No acquisition day recorded'}
          </span>
          {spoilage && (
            <span className="text-[#9c948b]">
              &middot; keeps {describeRationShelfLife(spoilage)}
              {spoilage.dank ? ' in dank conditions' : ''}
            </span>
          )}
        </div>
      </div>
    );
  };

  // `position` says where the item is ("equipped item 2", "item 1 in Backpack"),
  // and every renderer puts it in its controls' names for screen readers: two
  // items can share a name, and so can two spell books or two untitled scrolls.
  const renderInventoryItem = (item: InventoryItem, equipped: boolean, position: string) => {
    if (item.kind === 'spellbook') return renderSpellbookItem(item, equipped, position);
    if (item.kind === 'scroll') return renderScrollItem(item, equipped, position);
    if (item.kind === 'shard') return renderShardItem(item, equipped, position);
    if (item.kind === 'ration') return renderRationItem(item, equipped, position);
    return renderItemRow(item, equipped, position);
  };

  // `destination` names the list the item goes into ("Backpack"), so each
  // list's add buttons have names of their own for screen readers.
  const renderMagicalDropdown = (dropdownKey: string, destination: string, equipped: boolean, containerId?: string) => {
    const isOpen = magicalDropdownFor === dropdownKey;
    return (
      <div className="relative" data-magical-dropdown={dropdownKey}>
        <button
          type="button"
          onClick={() => setMagicalDropdownFor(isOpen ? null : dropdownKey)}
          className="bg-[#3a2a4e] hover:bg-[#4a3a6e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
          aria-label={`Add magical item to ${destination}`}
        >
          + Magical ▾
        </button>
        {isOpen && (
          <div className="absolute left-0 top-full mt-1 bg-[#2a2a3e] border border-[#5a3a28] rounded shadow-lg z-50 min-w-40">
            <button
              type="button"
              onClick={() => handleAddSpellbook(equipped, containerId)}
              className="block w-full text-left px-3 py-2 text-sm text-[#f5e6c8] hover:bg-[#3a3a5e] border-b border-[#5a3a28]/30"
            >
              📕 Spell Book
            </button>
            <button
              type="button"
              onClick={() => handleAddScroll(equipped, containerId)}
              className="block w-full text-left px-3 py-2 text-sm text-[#f5e6c8] hover:bg-[#3a3a5e] border-b border-[#5a3a28]/30"
            >
              📜 Scroll
            </button>
            <button
              type="button"
              onClick={() => handleAddShard(equipped, containerId)}
              className="block w-full text-left px-3 py-2 text-sm text-[#f5e6c8] hover:bg-[#3a3a5e]"
            >
              💎 Dwemer Shard
            </button>
          </div>
        )}
      </div>
    );
  };

  // From sm up: one line per item, under the column headers (which leave room for
  // the move select when there are containers), with NAME_COLUMN for the name
  // and the rest after Slots and Weight for the notes. On phones: the name, move
  // select and × on the first line, labelled Slots and Weight on the second, and
  // Notes across the whole third. Long names wrap and notes can have several
  // lines, so a row can grow taller: its controls line up along the top, with
  // the move select and × centred on the first line.
  const renderItemRow = (item: InventoryItem, equipped: boolean, position: string) => {
    const itemName = item.name.trim() || 'item';
    const rowLabel = `${itemName} (${position})`;

    return (
      <div key={item.id} className="flex flex-wrap items-start gap-2 bg-[#1a1a2e] p-2 rounded mb-1">
        <GrowingTextarea
          value={item.name}
          onValueChange={(name) => handleUpdateItem(equipped, item.id, 'name', name)}
          singleLine
          onEnter={focusSlots(item.id)}
          enterKeyHint="next"
          placeholder="Item name"
          aria-label={`Name of ${position}`}
          className={`flex-1 ${NAME_MIN_WIDTH} ${NAME_COLUMN}`}
          fieldClassName={inputClasses}
        />
        {phoneControlsFor(item, equipped, rowLabel)}
        <div className="flex flex-wrap items-start gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-0 sm:flex-nowrap">
          <label className="flex flex-col gap-0.5">
            {phoneLabel('Slots')}
            <input
              id={slotsFieldId(item.id)}
              type="number"
              value={item.slots}
              onChange={(e) =>
                handleUpdateItem(equipped, item.id, 'slots', parseInt(e.target.value) || 0)
              }
              min={0}
              title="Slots"
              placeholder="Sl"
              aria-label={`${itemName} slots (${position})`}
              className={`${inputClasses} w-16 text-center`}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            {phoneLabel('Weight')}
            <input
              type="number"
              value={item.weight}
              onChange={(e) =>
                handleUpdateItem(equipped, item.id, 'weight', parseInt(e.target.value) || 0)
              }
              min={0}
              title="Weight"
              placeholder="Wt"
              aria-label={`${itemName} weight (${position})`}
              className={`${inputClasses} w-20 text-center`}
            />
          </label>
          <label className="flex flex-col gap-0.5 grow basis-full min-w-0 sm:basis-0">
            {phoneLabel('Notes')}
            <GrowingTextarea
              value={item.notes}
              onValueChange={(notes) => handleUpdateItem(equipped, item.id, 'notes', notes)}
              placeholder="Notes"
              aria-label={`${itemName} notes (${position})`}
              fieldClassName={inputClasses}
            />
          </label>
          {moveSelectFor(item, equipped, rowLabel, 'hidden sm:flex')}
        </div>
        {removeButtonFor(item, equipped, rowLabel, 'hidden sm:block')}
      </div>
    );
  };

  const renderContainerGroup = (container: CharacterContainer | null) => {
    const containerId = container?.id;
    const containerItems = getContainerItems(stowedItems, containerId);
    const isCollapsed = containerId ? collapsedContainers.has(containerId) : false;

    const { usedWeight, capacity, fillPercent, isOverCapacity } = getContainerLoad(container, stowedItems);
    const destination = container ? containerLabel(container) : 'Loose Items';

    return (
      <div key={containerId ?? 'loose'} className="mb-3">
        {/* Container header */}
        <div
          className="flex items-center gap-2 cursor-pointer mb-1"
          onClick={() => containerId && toggleContainerCollapse(containerId)}
        >
          <span className="text-[#f5e6c8]/60 text-xs">
            {containerId ? (isCollapsed ? '\u25B6' : '\u25BC') : '\u25BC'}
          </span>
          <span className="text-[#c4a35a] text-sm font-semibold">
            {container ? containerLabel(container) : 'Loose Items'}
          </span>
          {container && encumbranceMethod === 'weight' && (
            <span className={`text-xs ${isOverCapacity ? 'text-[#ff6b4a]' : 'text-[#a1988f]'}`}>
              ({usedWeight} / {capacity}w)
            </span>
          )}
          {container && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteContainer(container.id);
              }}
              className="text-[#ff6b4a] hover:text-[#f5e6c8] text-xs ml-auto px-1"
              title={`Remove ${destination}`}
              aria-label={`Remove ${destination}`}
            >
              &times;
            </button>
          )}
        </div>

        {/* Capacity bar (weight mode only, containers only) */}
        {container && encumbranceMethod === 'weight' && capacity > 0 && (
          <div className="mb-2 mx-4">
            <div className="bg-[#1a1a2e] rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isOverCapacity ? 'bg-[#b33a1a]' : 'bg-[#c4a35a]'
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            {isOverCapacity && (
              <p className="text-[#ff6b4a] text-xs mt-0.5">Over capacity!</p>
            )}
          </div>
        )}

        {/* Items in this container */}
        {!isCollapsed && (
          <>
            {containerItems.length > 0 && (
              <div className="ml-4">
                {/* Column headers (hidden on mobile) */}
                <div className="hidden sm:flex items-center gap-2 text-[#a1988f] text-xs mb-1 px-2">
                  <span className={NAME_HEADER}>Name</span>
                  <span className="w-16 text-center">Slots</span>
                  <span className="w-20 text-center">Weight</span>
                  <span className="flex-1">Notes</span>
                  {/* Stowed rows have a move-to-container select when there are containers */}
                  {containers.length > 0 && <span className="w-10" />}
                  <span className="w-6" />
                </div>
                {containerItems.map((item, i) =>
                  renderInventoryItem(item, false, container ? `item ${i + 1} in ${destination}` : `loose item ${i + 1}`),
                )}
              </div>
            )}

            {/* Add buttons */}
            <div className="flex flex-wrap gap-2 ml-4 mt-1">
              <button
                type="button"
                onClick={() => handleAddItem(false, containerId)}
                className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
                aria-label={`Add item to ${destination}`}
              >
                + Add Item
              </button>
              <button
                type="button"
                onClick={() => {
                  setCatalogTarget({ section: 'stowed', containerId });
                  setCatalogOpen(true);
                }}
                className="bg-[#3a2a4e] hover:bg-[#4a3a6e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
                aria-label={`Add item from catalog to ${destination}`}
              >
                + From Catalog
              </button>
              {renderMagicalDropdown(`stowed-${containerId ?? 'loose'}`, destination, false, containerId)}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderCatalogBrowser = () => {
    if (!catalogOpen) return null;

    const filtered = getFilteredCatalog();

    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Equipment Catalog"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60"
          onClick={() => setCatalogOpen(false)}
        />

        {/* Modal panel */}
        <div className="relative bg-[#2a2a3e] rounded-lg border border-[#c4a35a]/30 w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#5a3a28] shrink-0">
            <h3 className="text-[#c4a35a] text-lg font-bold">Equipment Catalog</h3>
            <button
              type="button"
              onClick={() => setCatalogOpen(false)}
              className="text-[#ff6b4a] hover:text-[#f5e6c8] font-bold text-lg px-2"
              title="Close equipment catalog"
              aria-label="Close equipment catalog"
            >
              &times;
            </button>
          </div>

          {/* Controls */}
          <div className="p-4 pb-0 shrink-0">
            <div className="flex items-center gap-2 text-xs mb-2">
              <span id="catalog-target-label" className="text-[#a1988f]">Adding to:</span>
              <select
                aria-labelledby="catalog-target-label"
                value={catalogTarget.section === 'equipped' ? 'equipped' : (catalogTarget.containerId ?? 'loose')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'equipped') {
                    setCatalogTarget({ section: 'equipped' });
                  } else if (val === 'loose') {
                    setCatalogTarget({ section: 'stowed' });
                  } else {
                    setCatalogTarget({ section: 'stowed', containerId: val });
                  }
                }}
                className={`${inputClasses} text-xs`}
              >
                <option value="equipped">Equipped Items</option>
                <option value="loose">Stowed - Loose Items</option>
                {containers.map((c) => (
                  <option key={c.id} value={c.id}>Stowed - {containerLabel(c)}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search items..."
              aria-label="Search items"
              autoFocus
              className={`${inputClasses} w-full mb-2`}
            />

            {/* Category filter pills */}
            <div className="flex gap-1 mb-3 flex-wrap">
              {[{ id: 'all', label: 'All' }, { id: 'armour', label: 'Armour' }, { id: 'weapons', label: 'Weapons' }, ...EQUIPMENT_CATEGORIES].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCatalogCategory(cat.id)}
                  className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                    catalogCategory === cat.id
                      ? 'bg-[#c4a35a] text-[#1a1a2e]'
                      : 'bg-[#1a1a2e] text-[#f5e6c8] hover:bg-[#3a3a5e]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item table */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
            <table className="w-full text-xs text-[#f5e6c8] min-w-[320px]">
              <thead className="sticky top-0 bg-[#2a2a3e]">
                <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                  <th className="text-left py-1 pr-2">Item</th>
                  <th className="text-center py-1 px-1">Cost</th>
                  <th className="text-center py-1 px-1">Wt</th>
                  <th className="text-center py-1 px-1">Sl</th>
                  <th className="text-center py-1 px-1" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.name + item.source} className="border-b border-[#5a3a28]/30">
                    <td className="py-1 pr-2">{item.name}</td>
                    <td className="text-center py-1 px-1">
                      {item.costUnit === 'free' ? 'Free' : `${item.cost}${item.costUnit === 'cp' ? 'cp' : 'gp'}`}
                    </td>
                    <td className="text-center py-1 px-1">{item.weight}</td>
                    <td className="text-center py-1 px-1">{item.slots}</td>
                    <td className="text-center py-1 px-1">
                      <button
                        type="button"
                        onClick={() => handleAddFromCatalog(item)}
                        className="text-[#c4a35a] hover:text-[#f5e6c8] font-bold"
                        title="Add to inventory"
                      >
                        +
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-[#9c948b]">
                      No items found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Speed is 0 over the maximum load (by either method): the character can't move.
  const speedSummary = (
    <div className="border-t border-[#5a3a28] pt-2 mt-2">
      <div className="flex justify-between">
        <span className="font-semibold">Calculated Speed:</span>
        <span className={`font-bold ${calculatedSpeed === 0 ? 'text-[#ff6b4a]' : 'text-[#c4a35a]'}`}>{calculatedSpeed} ft</span>
      </div>
      {overloadNote && (
        <p className="text-[#ff6b4a] text-xs italic text-right">{overloadNote}</p>
      )}
    </div>
  );

  return (
    <>
    <div className="space-y-4">
      {/* Encumbrance Method Toggle */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Inventory &amp; Encumbrance
        </h2>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
          <span className={labelClasses}>Encumbrance Method:</span>
          <label className="flex items-center gap-1 text-[#f5e6c8] cursor-pointer">
            <input
              type="radio"
              name="encumbranceMethod"
              value="weight"
              checked={encumbranceMethod === 'weight'}
              onChange={() => onChange({ encumbranceMethod: 'weight' })}
              className="accent-[#c4a35a]"
            />
            Weight
          </label>
          <label className="flex items-center gap-1 text-[#f5e6c8] cursor-pointer">
            <input
              type="radio"
              name="encumbranceMethod"
              value="slots"
              checked={encumbranceMethod === 'slots'}
              onChange={() => onChange({ encumbranceMethod: 'slots' })}
              className="accent-[#c4a35a]"
            />
            Slots
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setCatalogTarget({ section: 'equipped' });
            setCatalogOpen(true);
          }}
          className="w-full border-2 border-[#c4a35a] text-[#c4a35a] hover:bg-[#c4a35a]/10 rounded-lg px-4 py-2 font-semibold transition-colors"
        >
          Browse Equipment Catalog
        </button>
      </div>

      {/* Equipped Items */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Equipped Items</h3>

        {/* Column headers (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-2 text-[#a1988f] text-xs mb-1 px-2">
          <span className={NAME_HEADER}>Name</span>
          <span className="w-16 text-center">Slots</span>
          <span className="w-20 text-center">Weight</span>
          <span className="flex-1">Notes</span>
          <span className="w-6" />
        </div>

        {equippedItems.map((item, i) => renderInventoryItem(item, true, `equipped item ${i + 1}`))}

        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={() => handleAddItem(true)}
            className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
            aria-label="Add item to Equipped Items"
          >
            + Add Item
          </button>
          <button
            type="button"
            onClick={() => {
              setCatalogTarget({ section: 'equipped' });
              setCatalogOpen(true);
            }}
            className="bg-[#3a2a4e] hover:bg-[#4a3a6e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
            aria-label="Add item from catalog to Equipped Items"
          >
            + From Catalog
          </button>
          {renderMagicalDropdown('equipped', 'Equipped Items', true)}
        </div>
      </div>

      {/* Stowed Items with Containers */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[#c4a35a] text-lg font-bold">Stowed Items</h3>

          {/* Add Container dropdown */}
          <div className="relative" data-container-dropdown>
            <button
              type="button"
              onClick={() => setContainerDropdownOpen(!containerDropdownOpen)}
              className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
            >
              + Add Container
            </button>
            {containerDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 bg-[#2a2a3e] border border-[#5a3a28] rounded shadow-lg z-50 min-w-48">
                {containerCatalogEntries.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => handleAddContainer(entry)}
                    className="block w-full text-left px-3 py-2 text-sm text-[#f5e6c8] hover:bg-[#3a3a5e] border-b border-[#5a3a28]/30 last:border-b-0"
                  >
                    {entry.name}
                    <span className="text-[#f5e6c8]/70 text-xs ml-2">
                      ({entry.capacity}w capacity)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Container groups */}
        {containers.map((container) => renderContainerGroup(container))}

        {/* Loose items (no container) */}
        {renderContainerGroup(null)}
      </div>

      {/* Tiny Items */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 id="tiny-items-heading" className="text-[#c4a35a] text-lg font-bold mb-3">Tiny Items</h3>
        <textarea
          value={tinyItems}
          onChange={(e) => onChange({ tinyItems: e.target.value })}
          placeholder="Miscellaneous small items..."
          aria-labelledby="tiny-items-heading"
          rows={3}
          className={`${inputClasses} w-full resize-y`}
        />
      </div>

      {/* Encumbrance Summary */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Encumbrance Summary</h3>

        {encumbranceMethod === 'slots' ? (
          <div className="space-y-2 text-[#f5e6c8]">
            <div>
              <div className="flex justify-between">
                <span>Equipped Slots:</span>
                <span
                  className={equippedSlotsOverLimit ? 'text-[#ff6b4a] font-bold' : ''}
                >
                  {totalEquippedSlots} / {EQUIPPED_SLOT_LIMIT}
                </span>
              </div>
              {equippedSlotsOverLimit && (
                <p className="text-[#ff6b4a] text-xs italic text-right">Over the maximum of {EQUIPPED_SLOT_LIMIT} equipped slots</p>
              )}
            </div>
            <div className="flex justify-between">
              <span>Stowed Slots (items):</span>
              <span>{itemStowedSlots}</span>
            </div>
            <div className="flex justify-between">
              <span>Coin Slots:</span>
              <span className="text-[#f5e6c8]/70">
                {coinSlots} ({pluralize(totalCoinCount, 'coin')})
              </span>
            </div>
            <div>
              <div className="flex justify-between">
                <span>Total Stowed Slots:</span>
                <span
                  className={stowedSlotsOverLimit ? 'text-[#ff6b4a] font-bold' : ''}
                >
                  {totalStowedSlots} / {STOWED_SLOT_LIMIT}
                </span>
              </div>
              {stowedSlotsOverLimit && (
                <p className="text-[#ff6b4a] text-xs italic text-right">Over the maximum of {STOWED_SLOT_LIMIT} stowed slots</p>
              )}
            </div>
            {speedSummary}
          </div>
        ) : (
          <div className="space-y-2 text-[#f5e6c8]">
            <div className="flex justify-between">
              <span>Item Weight:</span>
              <span>{itemEquippedWeight + itemStowedWeight}</span>
            </div>
            <div className="flex justify-between">
              <span>Coin Weight:</span>
              <span className="text-[#f5e6c8]/70">{coinWeight} ({pluralize(totalCoinCount, 'coin')})</span>
            </div>
            <div className="flex justify-between">
              <span>Total Weight:</span>
              <span
                className={overMaxLoad ? 'text-[#ff6b4a] font-bold' : ''}
              >
                {totalWeight}
              </span>
            </div>
            {speedSummary}
          </div>
        )}
      </div>

      {/* Coins */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Coins</h3>

        <div className="flex flex-wrap gap-4">
          {/* Copper */}
          <label className="flex flex-col items-center">
            <span className="text-sm font-semibold mb-1" style={{ color: '#d9924f' }}>
              Copper
            </span>
            <input
              type="number"
              min={0}
              value={coins.copper}
              onChange={(e) => handleCoinChange('copper', parseInt(e.target.value) || 0)}
              aria-label="Copper pieces"
              className={`${inputClasses} w-20 text-center`}
            />
          </label>

          {/* Silver */}
          <label className="flex flex-col items-center">
            <span className="text-sm font-semibold mb-1" style={{ color: '#c0c0c0' }}>
              Silver
            </span>
            <input
              type="number"
              min={0}
              value={coins.silver}
              onChange={(e) => handleCoinChange('silver', parseInt(e.target.value) || 0)}
              aria-label="Silver pieces"
              className={`${inputClasses} w-20 text-center`}
            />
          </label>

          {/* Gold */}
          <label className="flex flex-col items-center">
            <span className="text-sm font-semibold mb-1" style={{ color: '#c4a35a' }}>
              Gold
            </span>
            <input
              type="number"
              min={0}
              value={coins.gold}
              onChange={(e) => handleCoinChange('gold', parseInt(e.target.value) || 0)}
              aria-label="Gold pieces"
              className={`${inputClasses} w-20 text-center`}
            />
          </label>

          {/* Pellucidium */}
          <label className="flex flex-col items-center">
            <span className="text-sm font-semibold mb-1" style={{ color: '#b58fd0' }}>
              Pellucidium
            </span>
            <input
              type="number"
              min={0}
              value={coins.pellucidium}
              onChange={(e) =>
                handleCoinChange('pellucidium', parseInt(e.target.value) || 0)
              }
              aria-label="Pellucidium pieces"
              className={`${inputClasses} w-20 text-center`}
            />
          </label>
        </div>

        {/* Coin summary & exchange reference */}
        <div className="mt-3 text-xs text-[#f5e6c8]/60 space-y-1">
          <p>Exchange: 1pp = 5gp = 50sp = 500cp</p>
          <p>
            Total: {pluralize(totalCoinCount, 'coin')} ({getCoinGpEquivalent(coins).toFixed(1)}gp equivalent)
          </p>
        </div>
      </div>

    </div>

    {/* Equipment Catalog Modal */}
    {renderCatalogBrowser()}

    </>
  );
}
