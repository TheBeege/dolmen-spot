'use client';

import { useState } from 'react';
import { ARMOUR_TABLE, WEAPONS_TABLE, ADVENTURING_GEAR, COMMON_LANGUAGES, OBSCURE_LANGUAGES } from '@/lib/gamedata';

type RefTab = 'armour' | 'weapons' | 'gear' | 'languages';

export default function ReferencePanel() {
  const [tab, setTab] = useState<RefTab>('armour');

  const tabs: { id: RefTab; label: string }[] = [
    { id: 'armour', label: 'Armour' },
    { id: 'weapons', label: 'Weapons' },
    { id: 'gear', label: 'Gear' },
    { id: 'languages', label: 'Languages' },
  ];

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-lg font-bold text-[#c4a35a] mb-3 border-b border-[#5a3a28] pb-1">
        Quick Reference
      </h2>

      <div className="flex gap-1 mb-3 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-[#c4a35a] text-[#1a1a2e]'
                : 'bg-[#1a1a2e] text-[#f5e6c8] hover:bg-[#3a3a5e]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'armour' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-[#f5e6c8]">
            <thead>
              <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                <th className="text-left py-1 pr-2">Armour</th>
                <th className="text-center py-1 px-1">AC</th>
                <th className="text-center py-1 px-1">Cost</th>
                <th className="text-center py-1 px-1">Slots</th>
                <th className="text-left py-1 px-1">Bulk</th>
              </tr>
            </thead>
            <tbody>
              {ARMOUR_TABLE.map(a => (
                <tr key={a.name} className="border-b border-[#5a3a28]/30">
                  <td className="py-1 pr-2">{a.name}</td>
                  <td className="text-center py-1 px-1">{a.name === 'Shield' ? '+1' : a.ac}</td>
                  <td className="text-center py-1 px-1">{a.cost}gp</td>
                  <td className="text-center py-1 px-1">{a.slots}</td>
                  <td className="py-1 px-1">{a.bulk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'weapons' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-[#f5e6c8]">
            <thead>
              <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                <th className="text-left py-1 pr-2">Weapon</th>
                <th className="text-center py-1 px-1">Dmg</th>
                <th className="text-center py-1 px-1">Cost</th>
                <th className="text-center py-1 px-1">Size</th>
              </tr>
            </thead>
            <tbody>
              {WEAPONS_TABLE.map(w => (
                <tr key={w.name} className="border-b border-[#5a3a28]/30">
                  <td className="py-1 pr-2">{w.name}</td>
                  <td className="text-center py-1 px-1">{w.damage}</td>
                  <td className="text-center py-1 px-1">{w.cost}gp</td>
                  <td className="text-center py-1 px-1">{w.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'gear' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-[#f5e6c8]">
            <thead>
              <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                <th className="text-left py-1 pr-2">Item</th>
                <th className="text-center py-1 px-1">Cost</th>
              </tr>
            </thead>
            <tbody>
              {ADVENTURING_GEAR.map(g => (
                <tr key={g.name} className="border-b border-[#5a3a28]/30">
                  <td className="py-1 pr-2">{g.name}</td>
                  <td className="text-center py-1 px-1">{g.cost}gp</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'languages' && (
        <div className="text-sm text-[#f5e6c8]">
          <h3 className="text-[#c4a35a] font-semibold mb-1">Common Languages</h3>
          <ul className="mb-3 space-y-0.5">
            {COMMON_LANGUAGES.map(l => (
              <li key={l} className="pl-2">{l}</li>
            ))}
          </ul>
          <h3 className="text-[#c4a35a] font-semibold mb-1">Obscure Languages</h3>
          <ul className="space-y-0.5">
            {OBSCURE_LANGUAGES.map(l => (
              <li key={l} className="pl-2">{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
