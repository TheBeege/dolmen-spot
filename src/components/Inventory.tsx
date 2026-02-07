'use client';

import { Character, InventoryItem, Coins } from '@/lib/types';
import { getSpeedBySlots, getSpeedByWeight } from '@/lib/gamedata';

interface InventoryProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

export default function Inventory({ character, onChange }: InventoryProps) {
  const { equippedItems, stowedItems, tinyItems, coins, encumbranceMethod } = character;

  const totalEquippedSlots = equippedItems.reduce((sum, item) => sum + item.slots, 0);
  const totalStowedSlots = stowedItems.reduce((sum, item) => sum + item.slots, 0);
  const totalWeight =
    equippedItems.reduce((sum, item) => sum + item.weight, 0) +
    stowedItems.reduce((sum, item) => sum + item.weight, 0);

  const calculatedSpeed =
    encumbranceMethod === 'slots'
      ? getSpeedBySlots(totalEquippedSlots, totalStowedSlots)
      : getSpeedByWeight(totalWeight);

  const handleAddItem = (equipped: boolean) => {
    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      name: '',
      slots: 1,
      weight: 10,
      notes: '',
      equipped,
    };

    if (equipped) {
      onChange({ equippedItems: [...equippedItems, newItem] });
    } else {
      onChange({ stowedItems: [...stowedItems, newItem] });
    }
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

  const handleCoinChange = (coin: keyof Coins, value: number) => {
    onChange({ coins: { ...coins, [coin]: value } });
  };

  const renderItemRow = (item: InventoryItem, equipped: boolean) => (
    <div key={item.id} className="flex items-center gap-2 bg-[#1a1a2e] p-2 rounded mb-1">
      <input
        type="text"
        value={item.name}
        onChange={(e) => handleUpdateItem(equipped, item.id, 'name', e.target.value)}
        placeholder="Item name"
        className={`${inputClasses} flex-1 min-w-0`}
      />
      <input
        type="number"
        value={item.slots}
        onChange={(e) =>
          handleUpdateItem(equipped, item.id, 'slots', parseInt(e.target.value) || 0)
        }
        min={0}
        title="Slots"
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
        className={`${inputClasses} w-20 text-center`}
      />
      <input
        type="text"
        value={item.notes}
        onChange={(e) => handleUpdateItem(equipped, item.id, 'notes', e.target.value)}
        placeholder="Notes"
        className={`${inputClasses} w-32 min-w-0`}
      />
      <button
        type="button"
        onClick={() => handleDeleteItem(equipped, item.id)}
        className="text-[#8b2500] hover:text-[#b33a1a] font-bold text-lg shrink-0 px-1"
        title="Delete item"
      >
        &times;
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Encumbrance Method Toggle */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Inventory &amp; Encumbrance
        </h2>

        <div className="flex items-center gap-4 mb-2">
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
      </div>

      {/* Equipped Items */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Equipped Items</h3>

        {/* Column headers */}
        <div className="flex items-center gap-2 text-[#f5e6c8]/50 text-xs mb-1 px-2">
          <span className="flex-1">Name</span>
          <span className="w-16 text-center">Slots</span>
          <span className="w-20 text-center">Weight</span>
          <span className="w-32">Notes</span>
          <span className="w-6" />
        </div>

        {equippedItems.map((item) => renderItemRow(item, true))}

        <button
          type="button"
          onClick={() => handleAddItem(true)}
          className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 mt-2 text-sm"
        >
          Add Item
        </button>
      </div>

      {/* Stowed Items */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Stowed Items</h3>

        {/* Column headers */}
        <div className="flex items-center gap-2 text-[#f5e6c8]/50 text-xs mb-1 px-2">
          <span className="flex-1">Name</span>
          <span className="w-16 text-center">Slots</span>
          <span className="w-20 text-center">Weight</span>
          <span className="w-32">Notes</span>
          <span className="w-6" />
        </div>

        {stowedItems.map((item) => renderItemRow(item, false))}

        <button
          type="button"
          onClick={() => handleAddItem(false)}
          className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 mt-2 text-sm"
        >
          Add Item
        </button>
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
            <div className="flex justify-between">
              <span>Equipped Slots:</span>
              <span
                className={totalEquippedSlots > 10 ? 'text-[#b33a1a] font-bold' : ''}
              >
                {totalEquippedSlots} / 10
              </span>
            </div>
            <div className="flex justify-between">
              <span>Stowed Slots:</span>
              <span
                className={totalStowedSlots > 16 ? 'text-[#b33a1a] font-bold' : ''}
              >
                {totalStowedSlots} / 16
              </span>
            </div>
            <div className="flex justify-between border-t border-[#5a3a28] pt-2 mt-2">
              <span className="font-semibold">Calculated Speed:</span>
              <span className="font-bold text-[#c4a35a]">{calculatedSpeed} ft</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-[#f5e6c8]">
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
      </div>
    </div>
  );
}
