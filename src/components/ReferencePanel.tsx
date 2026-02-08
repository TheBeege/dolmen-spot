'use client';

import { useState } from 'react';
import {
  ARMOUR_TABLE,
  WEAPONS_TABLE,
  EQUIPMENT_CATALOG,
  EQUIPMENT_CATEGORIES,
  COMMON_LANGUAGES,
  OBSCURE_LANGUAGES,
  MONTHS,
  FESTIVALS,
  FESTIVAL_DESCRIPTIONS,
  CELESTIAL_EVENTS,
  NOBLE_HOUSES,
  RELIGIONS,
  BEVERAGE_RARITY,
  INEBRIATION_LEVELS,
  HERBS_CATALOG,
  PIPELEAF,
  PIPES,
  FOOD_MENU,
} from '@/lib/gamedata';

type RefTab = 'armour' | 'weapons' | 'gear' | 'calendar' | 'world' | 'consumables' | 'languages';

export default function ReferencePanel() {
  const [tab, setTab] = useState<RefTab>('armour');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const tabs: { id: RefTab; label: string }[] = [
    { id: 'armour', label: 'Armour' },
    { id: 'weapons', label: 'Weapons' },
    { id: 'gear', label: 'Gear' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'world', label: 'World' },
    { id: 'consumables', label: 'Consumables' },
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
                <th className="text-center py-1 px-1">Wt</th>
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
                  <td className="text-center py-1 px-1">{a.weight}</td>
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
                <th className="text-center py-1 px-1">Wt</th>
                <th className="text-center py-1 px-1">Slots</th>
                <th className="text-center py-1 px-1">Size</th>
              </tr>
            </thead>
            <tbody>
              {WEAPONS_TABLE.map(w => (
                <tr key={w.name} className="border-b border-[#5a3a28]/30">
                  <td className="py-1 pr-2">{w.name}</td>
                  <td className="text-center py-1 px-1">{w.damage}</td>
                  <td className="text-center py-1 px-1">{w.cost}gp</td>
                  <td className="text-center py-1 px-1">{w.weight}</td>
                  <td className="text-center py-1 px-1">{w.slots}</td>
                  <td className="text-center py-1 px-1">{w.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'gear' && (
        <div className="overflow-x-auto">
          {EQUIPMENT_CATEGORIES.map(cat => {
            const items = EQUIPMENT_CATALOG.filter(e => e.category === cat.id);
            if (items.length === 0) return null;
            return (
              <div key={cat.id} className="mb-3">
                <h3 className="text-[#c4a35a] text-xs font-semibold mb-1 uppercase tracking-wider">
                  {cat.label}
                </h3>
                <table className="w-full text-xs text-[#f5e6c8] mb-2">
                  <thead>
                    <tr className="text-[#c4a35a]/70 border-b border-[#5a3a28]">
                      <th className="text-left py-1 pr-2">Item</th>
                      <th className="text-center py-1 px-1">Cost</th>
                      <th className="text-center py-1 px-1">Wt</th>
                      <th className="text-center py-1 px-1">Slots</th>
                      {cat.id === 'container' && (
                        <th className="text-center py-1 px-1">Cap</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(g => (
                      <tr key={g.name} className="border-b border-[#5a3a28]/30">
                        <td className="py-1 pr-2">
                          {g.name}
                          {g.notes && (
                            <span className="text-[#f5e6c8]/40 ml-1">({g.notes})</span>
                          )}
                        </td>
                        <td className="text-center py-1 px-1">
                          {g.costUnit === 'free' ? 'Free' : `${g.cost}${g.costUnit === 'cp' ? 'cp' : 'gp'}`}
                        </td>
                        <td className="text-center py-1 px-1">{g.weight}</td>
                        <td className="text-center py-1 px-1">{g.slots}</td>
                        {cat.id === 'container' && (
                          <td className="text-center py-1 px-1">{g.capacity ?? '-'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'calendar' && (
        <div className="space-y-4">
          {/* Year overview */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-[#f5e6c8]">
              <thead>
                <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left py-1 pr-2">Month</th>
                  <th className="text-left py-1 pr-2">Season</th>
                  <th className="text-center py-1 px-1">Days</th>
                  <th className="text-left py-1 px-1">Moon</th>
                  <th className="text-left py-1 px-1">Wysendays</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((m, i) => (
                  <tr key={m.name} className="border-b border-[#5a3a28]/30">
                    <td className="py-1 pr-2 text-[#f5e6c8]/40">{i + 1}</td>
                    <td className="py-1 pr-2 font-semibold">{m.name}</td>
                    <td className="py-1 pr-2 text-[#f5e6c8]/60">{m.season}</td>
                    <td className="text-center py-1 px-1">{m.days}</td>
                    <td className="py-1 px-1 text-[#f5e6c8]/60">{m.moonName}</td>
                    <td className="py-1 px-1 text-[#f5e6c8]/60">
                      {m.wysendays.length > 0 ? m.wysendays.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Festivals */}
          <div>
            <button
              onClick={() => toggleSection('festivals')}
              className="text-[#c4a35a] text-sm font-semibold hover:underline"
            >
              {expandedSections['festivals'] ? 'Hide' : 'Show'} All Festivals
            </button>
            {expandedSections['festivals'] && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs text-[#f5e6c8]">
                  <thead>
                    <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                      <th className="text-left py-1 pr-2">Day</th>
                      <th className="text-left py-1 pr-2">Month</th>
                      <th className="text-left py-1">Festival</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(FESTIVALS.festivals || []), ...CELESTIAL_EVENTS]
                      .sort((a, b) => a.month !== b.month ? a.month - b.month : a.day - b.day)
                      .map((f) => (
                        <tr key={`${f.month}-${f.day}-${f.name}`} className="border-b border-[#5a3a28]/30">
                          <td className="py-1 pr-2">{f.day}</td>
                          <td className="py-1 pr-2">{MONTHS[f.month].name}</td>
                          <td className="py-1">{f.name}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Notable festival descriptions */}
          <div>
            <button
              onClick={() => toggleSection('festivalDescs')}
              className="text-[#c4a35a] text-sm font-semibold hover:underline"
            >
              {expandedSections['festivalDescs'] ? 'Hide' : 'Show'} Notable Festivals
            </button>
            {expandedSections['festivalDescs'] && (
              <div className="mt-2 space-y-2">
                {Object.entries(FESTIVAL_DESCRIPTIONS).map(([name, desc]) => (
                  <div key={name} className="bg-[#1a1a2e] rounded p-2">
                    <div className="text-[#c4a35a] text-sm font-semibold">{name}</div>
                    <div className="text-[#f5e6c8]/70 text-xs mt-1">{desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Moon phase rules */}
          <div className="bg-[#1a1a2e] rounded p-3 text-xs text-[#f5e6c8]/70">
            <div className="text-[#c4a35a] text-sm font-semibold mb-1">Moon Phases</div>
            <div>Lunar cycle: 29&#x2153; days (12 lunar months per year)</div>
            <div>Three phases: Waxing (13 days), Full (3 days), Waning (13 days)</div>
          </div>
        </div>
      )}

      {tab === 'world' && (
        <div className="space-y-4">
          {/* Noble Houses */}
          <div>
            <h3 className="text-[#c4a35a] text-sm font-semibold mb-2">Noble Houses of Dolmenwood</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-[#f5e6c8]">
                <thead>
                  <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                    <th className="text-left py-1 pr-2">House</th>
                    <th className="text-center py-1 px-1">Align</th>
                    <th className="text-left py-1 px-1">Head</th>
                    <th className="text-left py-1 px-1">Seat</th>
                    <th className="text-left py-1 px-1">Character</th>
                  </tr>
                </thead>
                <tbody>
                  {NOBLE_HOUSES.map((h) => (
                    <tr
                      key={h.name}
                      className={`border-b border-[#5a3a28]/30 ${h.ruling ? 'bg-[#c4a35a]/10' : ''}`}
                    >
                      <td className="py-1 pr-2 font-semibold">
                        {h.name}
                        {h.ruling && <span className="text-[#c4a35a] ml-1 text-[10px]">(Ruling)</span>}
                      </td>
                      <td className="text-center py-1 px-1">{h.alignment[0]}</td>
                      <td className="py-1 px-1">{h.head}</td>
                      <td className="py-1 px-1">{h.seat}</td>
                      <td className="py-1 px-1 text-[#f5e6c8]/60">{h.character}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Religions */}
          <div>
            <h3 className="text-[#c4a35a] text-sm font-semibold mb-2">Religions</h3>
            <div className="space-y-2">
              {RELIGIONS.map((r) => (
                <div key={r.name}>
                  <button
                    onClick={() => toggleSection(`religion-${r.name}`)}
                    className="w-full text-left"
                  >
                    <div className="bg-[#1a1a2e] rounded p-2 hover:bg-[#1a1a2e]/80 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[#c4a35a] text-sm font-semibold">{r.name}</span>
                        <span className="text-[#f5e6c8]/40 text-xs">
                          {expandedSections[`religion-${r.name}`] ? '\u25B2' : '\u25BC'}
                        </span>
                      </div>
                      <div className="text-[#f5e6c8]/50 text-xs">{r.type}</div>
                    </div>
                  </button>
                  {expandedSections[`religion-${r.name}`] && (
                    <div className="bg-[#1a1a2e]/50 rounded-b px-3 py-2 text-xs text-[#f5e6c8]/70 space-y-1 -mt-1 border-t border-[#5a3a28]/30">
                      <div><span className="text-[#c4a35a]">Deity:</span> {r.deity}</div>
                      <div><span className="text-[#c4a35a]">Holy Symbol:</span> {r.holySymbol}</div>
                      <div><span className="text-[#c4a35a]">Holy Text:</span> {r.holyText}</div>
                      <div className="text-[#f5e6c8]/50 mt-1">{r.notes}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'consumables' && (
        <div className="space-y-4">
          {/* Beverages */}
          <div>
            <h3 className="text-[#c4a35a] text-sm font-semibold mb-2">Beverages</h3>
            {(['common', 'uncommon', 'rare'] as const).map((rarity) => (
              <div key={rarity} className="mb-3">
                <button
                  onClick={() => toggleSection(`bev-${rarity}`)}
                  className="text-[#c4a35a]/80 text-xs font-semibold uppercase tracking-wider hover:underline"
                >
                  {expandedSections[`bev-${rarity}`] ? '\u25B2' : '\u25BC'} {rarity} ({BEVERAGE_RARITY[rarity].length})
                </button>
                {expandedSections[`bev-${rarity}`] && (
                  <table className="w-full text-xs text-[#f5e6c8] mt-1">
                    <thead>
                      <tr className="text-[#c4a35a]/70 border-b border-[#5a3a28]">
                        <th className="text-left py-1 pr-2">Name</th>
                        <th className="text-center py-1 px-1">Type</th>
                        <th className="text-center py-1 px-1">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BEVERAGE_RARITY[rarity].map((b) => (
                        <tr key={b.name} className="border-b border-[#5a3a28]/30">
                          <td className="py-1 pr-2">{b.name}</td>
                          <td className="text-center py-1 px-1">{b.type}</td>
                          <td className="text-center py-1 px-1">{b.cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}

            {/* Inebriation rules */}
            <button
              onClick={() => toggleSection('inebriation')}
              className="text-[#c4a35a] text-xs hover:underline"
            >
              {expandedSections['inebriation'] ? 'Hide' : 'Show'} Inebriation Rules
            </button>
            {expandedSections['inebriation'] && (
              <div className="mt-2 bg-[#1a1a2e] rounded p-2">
                <div className="text-[#f5e6c8]/60 text-xs mb-2">
                  Each alcoholic drink: CON check. Failure = next level. Sober up: lose 1 level per 2 hours.
                </div>
                <table className="w-full text-xs text-[#f5e6c8]">
                  <tbody>
                    {INEBRIATION_LEVELS.map((l) => (
                      <tr key={l.level} className="border-b border-[#5a3a28]/30">
                        <td className="py-1 pr-2 text-[#c4a35a] font-semibold">{l.level}</td>
                        <td className="py-1">{l.effect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Herbs & Fungi */}
          <div>
            <button
              onClick={() => toggleSection('herbs')}
              className="text-[#c4a35a] text-sm font-semibold hover:underline"
            >
              {expandedSections['herbs'] ? 'Hide' : 'Show'} Herbs & Fungi ({HERBS_CATALOG.length})
            </button>
            {expandedSections['herbs'] && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs text-[#f5e6c8]">
                  <thead>
                    <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                      <th className="text-left py-1 pr-2">Name</th>
                      <th className="text-center py-1 px-1">Type</th>
                      <th className="text-center py-1 px-1">Cost</th>
                      <th className="text-left py-1 px-1">Effect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {HERBS_CATALOG.map((h) => (
                      <tr key={h.name} className="border-b border-[#5a3a28]/30">
                        <td className="py-1 pr-2 font-semibold">{h.name}</td>
                        <td className="text-center py-1 px-1 text-[#f5e6c8]/60">{h.type}</td>
                        <td className="text-center py-1 px-1">{h.cost}</td>
                        <td className="py-1 px-1 text-[#f5e6c8]/60">{h.effect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pipeleaf */}
          <div>
            <button
              onClick={() => toggleSection('pipeleaf')}
              className="text-[#c4a35a] text-sm font-semibold hover:underline"
            >
              {expandedSections['pipeleaf'] ? 'Hide' : 'Show'} Pipeleaf ({PIPELEAF.length})
            </button>
            {expandedSections['pipeleaf'] && (
              <div className="mt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-[#f5e6c8]">
                    <thead>
                      <tr className="text-[#c4a35a] border-b border-[#5a3a28]">
                        <th className="text-left py-1 pr-2">Name</th>
                        <th className="text-center py-1 px-1">Cost</th>
                        <th className="text-center py-1 px-1">Avail.</th>
                        <th className="text-left py-1 px-1">Effect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PIPELEAF.map((p) => (
                        <tr key={p.name} className="border-b border-[#5a3a28]/30">
                          <td className="py-1 pr-2">{p.name}</td>
                          <td className="text-center py-1 px-1">{p.cost}</td>
                          <td className="text-center py-1 px-1 text-[#f5e6c8]/60">{p.availability}</td>
                          <td className="py-1 px-1 text-[#f5e6c8]/60">{p.effect}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-[#f5e6c8]/50">
                  Each smoke weighs 1 coin. Quiet Contemplation: 1 hour smoking, INT check (+1 per 2 companions, max +2). Success = Referee gives a clue.
                </div>
                <div className="mt-2">
                  <div className="text-[#c4a35a] text-xs font-semibold mb-1">Pipes</div>
                  <div className="flex flex-wrap gap-2">
                    {PIPES.map((p) => (
                      <span key={p.name} className="text-xs text-[#f5e6c8]/60">
                        {p.name} ({p.cost})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Food & Lodgings */}
          <div>
            <button
              onClick={() => toggleSection('food')}
              className="text-[#c4a35a] text-sm font-semibold hover:underline"
            >
              {expandedSections['food'] ? 'Hide' : 'Show'} Food & Lodgings
            </button>
            {expandedSections['food'] && (
              <div className="mt-2 space-y-3">
                {FOOD_MENU.map((tier) => (
                  <div key={tier.tier}>
                    <div className="text-[#c4a35a] text-xs font-semibold mb-1">
                      {tier.tier} <span className="text-[#f5e6c8]/40 font-normal">({tier.dailyAvailability})</span>
                    </div>
                    <table className="w-full text-xs text-[#f5e6c8] mb-1">
                      <tbody>
                        {(['main', 'side', 'dessert', 'lodging', 'service'] as const).map((cat) => {
                          const items = tier.items.filter((i) => i.category === cat);
                          if (items.length === 0) return null;
                          return items.map((item, idx) => (
                            <tr key={item.name} className="border-b border-[#5a3a28]/20">
                              {idx === 0 && (
                                <td
                                  className="py-0.5 pr-2 text-[#c4a35a]/60 capitalize align-top"
                                  rowSpan={items.length}
                                >
                                  {cat}
                                </td>
                              )}
                              <td className="py-0.5 pr-2">{item.name}</td>
                              <td className="py-0.5 text-right text-[#f5e6c8]/60">{item.cost}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
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
