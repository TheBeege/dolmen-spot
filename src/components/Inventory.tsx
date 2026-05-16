'use client';

import { useState, useEffect } from 'react';
import { Character, InventoryItem, Coins, CharacterContainer, SpellbookEntry } from '@/lib/types';
import {
  getSpeedBySlots,
  getSpeedByWeight,
  getCoinWeight,
  getCoinSlots,
  getTotalCoinCount,
  getCoinGpEquivalent,
  EQUIPMENT_CATALOG,
  EQUIPMENT_CATEGORIES,
  ARMOUR_TABLE,
  WEAPONS_TABLE,
  ARCANE_SPELLS,
  findArcaneSpell,
  EquipmentEntry,
} from '@/lib/gamedata';

interface InventoryProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

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
  const coinWeight = getCoinWeight(coins);
  const coinSlots = getCoinSlots(coins);
  const totalCoinCount = getTotalCoinCount(coins);

  const itemEquippedWeight = equippedItems.reduce((sum, item) => sum + item.weight, 0);
  const itemStowedWeight = stowedItems.reduce((sum, item) => sum + item.weight, 0);
  const totalWeight = itemEquippedWeight + itemStowedWeight + coinWeight;

  const totalEquippedSlots = equippedItems.reduce((sum, item) => sum + item.slots, 0);
  const itemStowedSlots = stowedItems.reduce((sum, item) => sum + item.slots, 0);
  const totalStowedSlots = itemStowedSlots + coinSlots;

  const calculatedSpeed =
    encumbranceMethod === 'slots'
      ? getSpeedBySlots(totalEquippedSlots, totalStowedSlots)
      : getSpeedByWeight(totalWeight);

  // ── Item handlers ──
  const handleAddItem = (equipped: boolean, containerId?: string) => {
    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
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

  const handleAddFromCatalog = (entry: EquipmentEntry | { name: string; weight: number; slots: number; notes?: string }) => {
    // Auto-detect blank spell books from the catalog so they get the spellbook UI.
    // Anchored to the start of the name so unrelated items containing "spellbook"
    // (e.g. a hypothetical "Anti-Spellbook Ward") aren't misclassified.
    const isSpellbook = /^spell\s*book/i.test(entry.name);
    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      name: entry.name,
      slots: entry.slots,
      weight: entry.weight,
      notes: ('notes' in entry && entry.notes) || '',
      equipped: catalogTarget.section === 'equipped',
      ...(catalogTarget.section === 'stowed' && catalogTarget.containerId
        ? { containerId: catalogTarget.containerId }
        : {}),
      ...(isSpellbook ? { kind: 'spellbook' as const, spellbookContents: [] } : {}),
    };

    if (catalogTarget.section === 'equipped') {
      onChange({ equippedItems: [...equippedItems, newItem] });
    } else {
      onChange({ stowedItems: [...stowedItems, newItem] });
    }
  };

  const handleAddSpellbook = (equipped: boolean, containerId?: string) => {
    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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

  const updateInventoryItem = (equipped: boolean, itemId: string, mutator: (item: InventoryItem) => InventoryItem) => {
    const items = equipped ? equippedItems : stowedItems;
    const updated = items.map((item) => (item.id === itemId ? mutator(item) : item));
    if (equipped) onChange({ equippedItems: updated });
    else onChange({ stowedItems: updated });
  };

  const handleSpellbookAddEntry = (equipped: boolean, itemId: string) => {
    updateInventoryItem(equipped, itemId, (item) => {
      const contents = item.spellbookContents ?? [];
      if (contents.length >= 3) return item;
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
      id: crypto.randomUUID(),
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

  // ── Container weight helpers ──
  const getContainerUsedWeight = (containerId: string) =>
    stowedItems
      .filter((item) => item.containerId === containerId)
      .reduce((sum, item) => sum + item.weight, 0);

  // ── Catalog data ──
  const containerCatalogEntries = EQUIPMENT_CATALOG.filter((e) => e.category === 'container' && e.capacity && e.capacity > 0);

  const getFilteredCatalog = () => {
    const allItems: { name: string; cost: number; costUnit?: string; weight: number; slots: number; notes?: string; source: string }[] = [];

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
      allItems.push({ name: e.name, cost: e.cost, costUnit: e.costUnit, weight: e.weight, slots: e.slots, notes: e.notes, source: e.category });
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

  // ── Render helpers ──
  const renderSpellbookItem = (item: InventoryItem, equipped: boolean) => {
    const contents = item.spellbookContents ?? [];
    const isCollapsed = collapsedSpellbooks.has(item.id);
    const isFull = contents.length >= 3;
    return (
      <div key={item.id} className="bg-[#1a1a2e] border border-[#5a3a28]/60 rounded mb-1">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 p-2">
          <button
            type="button"
            onClick={() => toggleSpellbookCollapse(item.id)}
            className="text-[#c4a35a] text-xs shrink-0 w-4"
            title={isCollapsed ? 'Expand spell book' : 'Collapse spell book'}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
          <span className="text-[#c4a35a] text-sm shrink-0" title="Spell book">📕</span>
          <input
            type="text"
            value={item.name}
            onChange={(e) => handleUpdateItem(equipped, item.id, 'name', e.target.value)}
            placeholder="Spell book title"
            className={`${inputClasses} flex-1 min-w-[120px]`}
          />
          <span className="text-[#f5e6c8]/50 text-xs shrink-0">
            {contents.length}/3
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={item.slots}
              onChange={(e) => handleUpdateItem(equipped, item.id, 'slots', parseInt(e.target.value) || 0)}
              min={0}
              title="Slots"
              className={`${inputClasses} w-16 text-center`}
            />
            <input
              type="number"
              value={item.weight}
              onChange={(e) => handleUpdateItem(equipped, item.id, 'weight', parseInt(e.target.value) || 0)}
              min={0}
              title="Weight"
              className={`${inputClasses} w-20 text-center`}
            />
            {!equipped && containers.length > 0 && (
              <select
                value={item.containerId ?? ''}
                onChange={(e) => handleMoveToContainer(item.id, e.target.value || undefined)}
                className={`${inputClasses} w-10 text-xs p-0.5`}
                title="Move to container"
              >
                <option value="">Loose</option>
                {containers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => handleDeleteItem(equipped, item.id)}
              className="text-[#8b2500] hover:text-[#b33a1a] font-bold text-lg shrink-0 px-1"
              title="Delete spell book"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Spell list */}
        {!isCollapsed && (
          <div className="border-t border-[#5a3a28]/40 px-3 py-2 space-y-1">
            {contents.length === 0 && (
              <div className="text-[#f5e6c8]/40 text-xs italic">No spells recorded. Up to 3.</div>
            )}
            {contents.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
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
                  className={`${inputClasses} flex-1 min-w-[160px] text-sm`}
                >
                  <option value="">-- Select spell --</option>
                  {[1, 2, 3, 4, 5, 6].map((rank) => (
                    <optgroup key={rank} label={`Rank ${rank}`}>
                      {ARCANE_SPELLS.filter((s) => s.rank === rank).map((s) => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {entry.name && (
                  <span className="text-[#c4a35a] text-xs shrink-0">R{entry.rank}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleSpellbookRemoveEntry(equipped, item.id, index)}
                  className="text-[#8b2500] hover:text-[#b33a1a] text-sm shrink-0 px-1"
                  title="Remove spell"
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleSpellbookAddEntry(equipped, item.id)}
              disabled={isFull}
              className={`text-xs px-2 py-0.5 rounded mt-1 ${
                isFull
                  ? 'bg-[#1a1a2e] text-[#f5e6c8]/30 border border-[#5a3a28]/40 cursor-not-allowed'
                  : 'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8]'
              }`}
            >
              {isFull ? 'Full (3/3)' : '+ Add spell'}
            </button>
            <textarea
              value={item.notes}
              onChange={(e) => handleUpdateItem(equipped, item.id, 'notes', e.target.value)}
              placeholder="Notes (language, source, etc.)"
              rows={1}
              className={`${inputClasses} w-full mt-1 text-xs resize-y`}
            />
          </div>
        )}
      </div>
    );
  };

  const renderScrollItem = (item: InventoryItem, equipped: boolean) => {
    const scroll = item.scrollSpell ?? { name: '', rank: 1 };
    return (
      <div key={item.id} className="flex flex-wrap items-center gap-2 bg-[#1a1a2e] border border-[#5a3a28]/60 p-2 rounded mb-1">
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
          className={`${inputClasses} flex-1 min-w-[160px] text-sm`}
        >
          <option value="">-- Select spell --</option>
          {[1, 2, 3, 4, 5, 6].map((rank) => (
            <optgroup key={rank} label={`Rank ${rank}`}>
              {ARCANE_SPELLS.filter((s) => s.rank === rank).map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {scroll.name && (
          <span className="text-[#c4a35a] text-xs shrink-0">R{scroll.rank}</span>
        )}
        <input
          type="number"
          value={item.weight}
          onChange={(e) => handleUpdateItem(equipped, item.id, 'weight', parseInt(e.target.value) || 0)}
          min={0}
          title="Weight"
          className={`${inputClasses} w-20 text-center text-sm`}
        />
        {!equipped && containers.length > 0 && (
          <select
            value={item.containerId ?? ''}
            onChange={(e) => handleMoveToContainer(item.id, e.target.value || undefined)}
            className={`${inputClasses} w-10 text-xs p-0.5`}
            title="Move to container"
          >
            <option value="">Loose</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Use the ${scroll.name || 'scroll'}? It will be consumed.`)) {
              handleDeleteItem(equipped, item.id);
            }
          }}
          className="bg-[#5a3a28] hover:bg-[#6b4a35] text-[#f5e6c8] text-xs font-semibold px-2 py-1 rounded shrink-0"
          title="Use scroll (consumes it)"
        >
          Use
        </button>
        <button
          type="button"
          onClick={() => handleDeleteItem(equipped, item.id)}
          className="text-[#8b2500] hover:text-[#b33a1a] font-bold text-lg shrink-0 px-1"
          title="Delete scroll"
        >
          &times;
        </button>
      </div>
    );
  };

  const renderInventoryItem = (item: InventoryItem, equipped: boolean) => {
    if (item.kind === 'spellbook') return renderSpellbookItem(item, equipped);
    if (item.kind === 'scroll') return renderScrollItem(item, equipped);
    return equipped ? renderItemRow(item, true) : renderStowedItemRow(item);
  };

  const renderMagicalDropdown = (dropdownKey: string, equipped: boolean, containerId?: string) => {
    const isOpen = magicalDropdownFor === dropdownKey;
    return (
      <div className="relative" data-magical-dropdown={dropdownKey}>
        <button
          type="button"
          onClick={() => setMagicalDropdownFor(isOpen ? null : dropdownKey)}
          className="bg-[#3a2a4e] hover:bg-[#4a3a6e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
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
              className="block w-full text-left px-3 py-2 text-sm text-[#f5e6c8] hover:bg-[#3a3a5e]"
            >
              📜 Scroll
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderItemRow = (item: InventoryItem, equipped: boolean) => (
    <div key={item.id} className="flex flex-wrap items-center gap-2 bg-[#1a1a2e] p-2 rounded mb-1">
      <input
        type="text"
        value={item.name}
        onChange={(e) => handleUpdateItem(equipped, item.id, 'name', e.target.value)}
        placeholder="Item name"
        className={`${inputClasses} flex-1 min-w-[120px]`}
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={item.slots}
          onChange={(e) =>
            handleUpdateItem(equipped, item.id, 'slots', parseInt(e.target.value) || 0)
          }
          min={0}
          title="Slots"
          placeholder="Sl"
          className={`${inputClasses} w-16 text-center`}
        />
        <input
          type="number"
          value={item.weight}
          onChange={(e) =>
            handleUpdateItem(equipped, item.id, 'weight', parseInt(e.target.value) || 0)
          }
          min={0}
          title="Weight"
          placeholder="Wt"
          className={`${inputClasses} w-20 text-center`}
        />
        <input
          type="text"
          value={item.notes}
          onChange={(e) => handleUpdateItem(equipped, item.id, 'notes', e.target.value)}
          placeholder="Notes"
          className={`${inputClasses} w-32 min-w-0`}
        />
        {!equipped && containers.length > 0 && (
          <select
            value={item.containerId ?? ''}
            onChange={(e) =>
              handleMoveToContainer(item.id, e.target.value || undefined)
            }
            className={`${inputClasses} w-10 text-xs p-0.5`}
            title="Move to container"
          >
            <option value="">Loose</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => handleDeleteItem(equipped, item.id)}
          className="text-[#8b2500] hover:text-[#b33a1a] font-bold text-lg shrink-0 px-1"
          title="Delete item"
        >
          &times;
        </button>
      </div>
    </div>
  );

  const renderStowedItemRow = (item: InventoryItem) => renderItemRow(item, false);

  const renderContainerGroup = (container: CharacterContainer | null) => {
    const containerId = container?.id;
    const containerItems = stowedItems.filter((item) =>
      containerId ? item.containerId === containerId : !item.containerId
    );
    const isCollapsed = containerId ? collapsedContainers.has(containerId) : false;

    const usedWeight = containerId ? getContainerUsedWeight(containerId) : 0;
    const capacity = container?.capacity ?? 0;
    const fillPercent = capacity > 0 ? Math.min(100, (usedWeight / capacity) * 100) : 0;
    const isOverCapacity = capacity > 0 && usedWeight > capacity;

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
            {container ? container.name : 'Loose Items'}
          </span>
          {container && encumbranceMethod === 'weight' && (
            <span className={`text-xs ${isOverCapacity ? 'text-[#b33a1a]' : 'text-[#f5e6c8]/50'}`}>
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
              className="text-[#8b2500] hover:text-[#b33a1a] text-xs ml-auto px-1"
              title="Remove container"
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
              <p className="text-[#b33a1a] text-xs mt-0.5">Over capacity!</p>
            )}
          </div>
        )}

        {/* Items in this container */}
        {!isCollapsed && (
          <>
            {containerItems.length > 0 && (
              <div className="ml-4">
                {/* Column headers (hidden on mobile) */}
                <div className="hidden sm:flex items-center gap-2 text-[#f5e6c8]/50 text-xs mb-1 px-2">
                  <span className="flex-1">Name</span>
                  <span className="w-16 text-center">Slots</span>
                  <span className="w-20 text-center">Weight</span>
                  <span className="w-32">Notes</span>
                  <span className="w-6" />
                </div>
                {containerItems.map((item) => renderInventoryItem(item, false))}
              </div>
            )}

            {/* Add buttons */}
            <div className="flex flex-wrap gap-2 ml-4 mt-1">
              <button
                type="button"
                onClick={() => handleAddItem(false, containerId)}
                className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
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
              >
                + From Catalog
              </button>
              {renderMagicalDropdown(`stowed-${containerId ?? 'loose'}`, false, containerId)}
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
              className="text-[#8b2500] hover:text-[#b33a1a] font-bold text-lg px-2"
            >
              &times;
            </button>
          </div>

          {/* Controls */}
          <div className="p-4 pb-0 shrink-0">
            <div className="flex items-center gap-2 text-xs mb-2">
              <span className="text-[#f5e6c8]/50">Adding to:</span>
              <select
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
                  <option key={c.id} value={c.id}>Stowed - {c.name}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search items..."
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
                    <td colSpan={5} className="text-center py-4 text-[#f5e6c8]/40">
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

  return (
    <>
    <div className="space-y-4">
      {/* Encumbrance Method Toggle */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Inventory &amp; Encumbrance
        </h2>

        <div className="flex items-center gap-4 mb-3">
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
        <div className="hidden sm:flex items-center gap-2 text-[#f5e6c8]/50 text-xs mb-1 px-2">
          <span className="flex-1">Name</span>
          <span className="w-16 text-center">Slots</span>
          <span className="w-20 text-center">Weight</span>
          <span className="w-32">Notes</span>
          <span className="w-6" />
        </div>

        {equippedItems.map((item) => renderInventoryItem(item, true))}

        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={() => handleAddItem(true)}
            className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm"
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
          >
            + From Catalog
          </button>
          {renderMagicalDropdown('equipped', true)}
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
                    <span className="text-[#f5e6c8]/50 text-xs ml-2">
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
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Tiny Items</h3>
        <textarea
          value={tinyItems}
          onChange={(e) => onChange({ tinyItems: e.target.value })}
          placeholder="Miscellaneous small items..."
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
                  className={totalEquippedSlots > 10 ? 'text-[#b33a1a] font-bold' : ''}
                >
                  {totalEquippedSlots} / 10
                </span>
              </div>
              {totalEquippedSlots > 10 && (
                <p className="text-[#b33a1a] text-xs italic text-right">Exceeds standard equipped limit (10 slots)</p>
              )}
            </div>
            <div className="flex justify-between">
              <span>Stowed Slots (items):</span>
              <span>{itemStowedSlots}</span>
            </div>
            <div className="flex justify-between">
              <span>Coin Slots:</span>
              <span className="text-[#f5e6c8]/70">
                {coinSlots} ({totalCoinCount} coins)
              </span>
            </div>
            <div>
              <div className="flex justify-between">
                <span>Total Stowed Slots:</span>
                <span
                  className={totalStowedSlots > 16 ? 'text-[#b33a1a] font-bold' : ''}
                >
                  {totalStowedSlots} / 16
                </span>
              </div>
              {totalStowedSlots > 16 && (
                <p className="text-[#b33a1a] text-xs italic text-right">Exceeds standard stowed limit (16 slots)</p>
              )}
            </div>
            <div className="flex justify-between border-t border-[#5a3a28] pt-2 mt-2">
              <span className="font-semibold">Calculated Speed:</span>
              <span className="font-bold text-[#c4a35a]">{calculatedSpeed} ft</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-[#f5e6c8]">
            <div className="flex justify-between">
              <span>Item Weight:</span>
              <span>{itemEquippedWeight + itemStowedWeight}</span>
            </div>
            <div className="flex justify-between">
              <span>Coin Weight:</span>
              <span className="text-[#f5e6c8]/70">{coinWeight} ({totalCoinCount} coins)</span>
            </div>
            <div className="flex justify-between">
              <span>Total Weight:</span>
              <span
                className={totalWeight > 1600 ? 'text-[#b33a1a] font-bold' : ''}
              >
                {totalWeight}
              </span>
            </div>
            <div className="flex justify-between border-t border-[#5a3a28] pt-2 mt-2">
              <span className="font-semibold">Calculated Speed:</span>
              <span className="font-bold text-[#c4a35a]">{calculatedSpeed} ft</span>
            </div>
          </div>
        )}
      </div>

      {/* Coins */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Coins</h3>

        <div className="flex flex-wrap gap-4">
          {/* Copper */}
          <div className="flex flex-col items-center">
            <label className="text-sm font-semibold mb-1" style={{ color: '#b87333' }}>
              Copper
            </label>
            <input
              type="number"
              min={0}
              value={coins.copper}
              onChange={(e) => handleCoinChange('copper', parseInt(e.target.value) || 0)}
              className={`${inputClasses} w-20 text-center`}
            />
          </div>

          {/* Silver */}
          <div className="flex flex-col items-center">
            <label className="text-sm font-semibold mb-1" style={{ color: '#c0c0c0' }}>
              Silver
            </label>
            <input
              type="number"
              min={0}
              value={coins.silver}
              onChange={(e) => handleCoinChange('silver', parseInt(e.target.value) || 0)}
              className={`${inputClasses} w-20 text-center`}
            />
          </div>

          {/* Gold */}
          <div className="flex flex-col items-center">
            <label className="text-sm font-semibold mb-1" style={{ color: '#c4a35a' }}>
              Gold
            </label>
            <input
              type="number"
              min={0}
              value={coins.gold}
              onChange={(e) => handleCoinChange('gold', parseInt(e.target.value) || 0)}
              className={`${inputClasses} w-20 text-center`}
            />
          </div>

          {/* Pellucidium */}
          <div className="flex flex-col items-center">
            <label className="text-sm font-semibold mb-1" style={{ color: '#8b6aab' }}>
              Pellucidium
            </label>
            <input
              type="number"
              min={0}
              value={coins.pellucidium}
              onChange={(e) =>
                handleCoinChange('pellucidium', parseInt(e.target.value) || 0)
              }
              className={`${inputClasses} w-20 text-center`}
            />
          </div>
        </div>

        {/* Coin summary & exchange reference */}
        <div className="mt-3 text-xs text-[#f5e6c8]/60 space-y-1">
          <p>Exchange: 1pp = 5gp = 50sp = 500cp</p>
          <p>
            Total: {totalCoinCount} coins ({getCoinGpEquivalent(coins).toFixed(1)}gp equivalent)
          </p>
        </div>
      </div>

    </div>

    {/* Equipment Catalog Modal */}
    {renderCatalogBrowser()}

    </>
  );
}
