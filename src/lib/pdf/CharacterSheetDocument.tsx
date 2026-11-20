/**
 * The printable character sheet, rendered with @react-pdf/renderer.
 *
 * Only ever loaded through src/lib/pdf/download.tsx, which the "Download PDF"
 * button imports on click, so react-pdf stays out of the page's initial JS.
 *
 * Every number here comes from the same stored fields and shared helpers the
 * tabs use (gamedata.ts, character-sheet.ts). Where a tab shows a stored value
 * next to a "Sync to X" button, the sheet prints the stored value and notes
 * "calc. X". Free-form notes, the map, the journal and the calendar are left
 * out on purpose.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { Character, CharacterContainer, InventoryItem } from '@/lib/types';
import {
  ARMOUR_TABLE,
  BREGGLE_HORN_PROGRESSION,
  CLASSES,
  CLERIC_HOLY_ORDERS,
  FAIRY_RUNES,
  FIGHTER_COMBAT_TALENTS,
  GLAMOURS,
  GRIMALKIN_FORMS,
  KINDREDS,
  MAD_REVELRY_MELODIES,
  MAGICIAN_STARTING_SPELL_BOOKS,
  MOON_PHASES,
  MOSSLING_KNACKS,
  NOBLE_HOUSES,
  SYMBIOTIC_FLESH_TABLE,
  TURNING_UNDEAD_TABLE,
  calculateAC,
  calculateMagicResistance,
  calculateMeleeModifier,
  calculateMissileModifier,
  calculateXpModifier,
  canHaveMoonSign,
  formatModifier,
  getAbilityModifier,
  getAlignmentWarning,
  getArmourRestrictionWarning,
  getAvailableClasses,
  getCharacterFeatureProfile,
  getClassName,
  getCoinGpEquivalent,
  getFighterTalentCount,
  getKindredClassLabel,
  getKindredName,
  getRuneUsageFrequency,
  skillKeyToDisplayName,
} from '@/lib/gamedata';
import {
  ABILITY_SCORE_INFO,
  EQUIPPED_SLOT_LIMIT,
  FEATURE_NOTES,
  KNOWN_SPELL_SOURCE_LABELS,
  SAVE_TARGET_INFO,
  STOWED_SLOT_LIMIT,
  calculateEncumbrance,
  countPreparedByRank,
  formatXpPercent,
  getCalculatedAttackBonus,
  getContainerItems,
  getContainerLoad,
  getLanguageBreakdown,
  getMagicSections,
  getMaxFungalSymbiosisUses,
  getMaxGazeUses,
  getMaxMadRevelryUses,
  getRetainerLimits,
  getScrollItems,
  getSkillTargetLayout,
  hasAnyClassFeature,
  hasAnyKindredFeature,
  isSpellInAnyBook,
  isSpellOnScroll,
  isStartingBookApplied,
} from '@/lib/character-sheet';
import type { PdfPageSize } from './page-size';
import { pdfText as t } from './text';

// ── Design tokens ────────────────────────────────────────────

const COLOR = {
  ink: '#1f1a16',
  muted: '#6b6157',
  faint: '#9a8f84',
  gold: '#c4a35a',
  goldTint: '#f8f2e4',
  brown: '#5a3a28',
  rule: '#e4d9c3',
  zebra: '#fcfaf4',
  warn: '#9b2c0c',
};

const s = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 52,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    // No page-wide lineHeight: react-pdf turns a unitless lineHeight into points
    // using the element's own font size and children inherit those points, so
    // larger text would overflow its line box.
    color: COLOR.ink,
    backgroundColor: '#ffffff',
  },

  // Header & footer
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: COLOR.gold,
    paddingBottom: 6,
  },
  // flexBasis 0 so a long name wraps instead of running under the brand
  headerMain: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 12 },
  headerSide: { flexShrink: 0 },
  name: { fontFamily: 'Times-Roman', fontWeight: 700, fontSize: 24, lineHeight: 1.1 },
  identity: { fontSize: 10.5, color: COLOR.brown, marginTop: 3 },
  brand: {
    fontFamily: 'Times-Roman',
    fontWeight: 700,
    fontSize: 10,
    color: COLOR.brown,
    letterSpacing: 0.6,
    textAlign: 'right',
  },
  meta: { fontSize: 7.5, color: COLOR.muted, textAlign: 'right', marginTop: 2 },
  footer: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.75,
    borderTopColor: COLOR.gold,
    paddingTop: 4,
    fontSize: 7.5,
    color: COLOR.muted,
  },

  // Headings
  sectionTitle: {
    fontFamily: 'Times-Roman',
    fontWeight: 700,
    fontSize: 12.5,
    color: COLOR.brown,
    textTransform: 'uppercase',
    letterSpacing: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.gold,
    paddingBottom: 2,
    marginTop: 14,
    marginBottom: 6,
  },
  subTitle: { fontWeight: 700, fontSize: 9.5, color: COLOR.brown, marginTop: 8, marginBottom: 3 },
  subTitleNote: { fontWeight: 400, fontSize: 8, color: COLOR.muted },

  // Text
  note: { fontSize: 7.5, color: COLOR.muted, marginTop: 2 },
  italicNote: { fontSize: 7.5, color: COLOR.muted, fontStyle: 'italic', marginTop: 2 },
  warn: { fontSize: 7.5, color: COLOR.warn, marginTop: 2 },
  bold: { fontWeight: 700 },
  body: { fontSize: 8.5, marginTop: 1 },
  empty: { fontSize: 8, color: COLOR.muted, fontStyle: 'italic' },

  // Field grid (Character section)
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '33.33%', paddingRight: 8, marginBottom: 6 },
  fieldLabel: {
    fontSize: 6.5,
    fontWeight: 700,
    color: COLOR.brown,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldValue: {
    fontSize: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.rule,
    paddingBottom: 1.5,
    marginTop: 1,
  },

  // Stat boxes
  boxRow: { flexDirection: 'row', columnGap: 6 },
  box: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    borderWidth: 0.75,
    borderColor: COLOR.brown,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  boxHighlight: { backgroundColor: COLOR.goldTint, borderColor: COLOR.gold, borderWidth: 1.25 },
  boxLabel: {
    fontSize: 6.5,
    fontWeight: 700,
    color: COLOR.brown,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  // "CON · Constitution": mixed case so it fits one line in A4's narrower boxes
  abilityLabel: { fontSize: 6.5, fontWeight: 700, color: COLOR.brown, letterSpacing: 0.2, textAlign: 'center' },
  boxValue: { fontSize: 15, fontWeight: 700, marginTop: 1, textAlign: 'center' },
  boxValueSmall: { fontSize: 11, fontWeight: 700, marginTop: 1, textAlign: 'center' },
  boxSub: { fontSize: 6.5, color: COLOR.muted, textAlign: 'center', marginTop: 1 },
  abilityMod: {
    fontSize: 9.5,
    fontWeight: 700,
    color: COLOR.brown,
    borderWidth: 0.75,
    borderColor: COLOR.gold,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 0.5,
    marginTop: 1,
    textAlign: 'center',
  },
  boxCalc: { fontSize: 6.5, color: COLOR.warn, textAlign: 'center', marginTop: 1 },

  // Skills grid
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  skillCell: { width: '16.66%', padding: 2 },
  skillBox: {
    borderWidth: 0.75,
    borderColor: COLOR.brown,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 2,
    alignItems: 'center',
  },

  // Tables
  caption: { fontWeight: 700, fontSize: 9, color: COLOR.brown, marginTop: 8, marginBottom: 3 },
  captionNote: { fontWeight: 400, color: COLOR.muted, fontSize: 7.5 },
  table: { borderTopWidth: 0.75, borderTopColor: COLOR.brown },
  thead: {
    flexDirection: 'row',
    backgroundColor: COLOR.goldTint,
    borderBottomWidth: 0.75,
    borderBottomColor: COLOR.brown,
  },
  th: {
    fontSize: 6.5,
    fontWeight: 700,
    color: COLOR.brown,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
  },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: COLOR.rule },
  trAlt: { backgroundColor: COLOR.zebra },
  trDim: { color: COLOR.faint },
  td: { paddingVertical: 2.5, paddingHorizontal: 3, fontSize: 8.5 },
  cellSub: { fontSize: 7, color: COLOR.muted, marginTop: 1 },
  checkbox: {
    width: 8,
    height: 8,
    borderWidth: 0.75,
    borderColor: COLOR.brown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 6.5, fontWeight: 700, lineHeight: 1 },

  // Feature blocks
  block: { marginTop: 6 },
  blockTitle: { fontWeight: 700, fontSize: 9, color: COLOR.brown },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  chip: {
    borderWidth: 0.5,
    borderColor: COLOR.rule,
    borderRadius: 6,
    paddingVertical: 1,
    paddingHorizontal: 5,
    marginRight: 3,
    marginBottom: 3,
    fontSize: 8,
  },
  miniGrid: { flexDirection: 'row', columnGap: 3, marginTop: 3 },
  miniCell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    borderWidth: 0.5,
    borderColor: COLOR.rule,
    borderRadius: 2,
    paddingVertical: 2,
    alignItems: 'center',
  },
  miniCellActive: { borderColor: COLOR.gold, borderWidth: 1.25, backgroundColor: COLOR.goldTint },
  twoCol: { flexDirection: 'row', columnGap: 12 },
  col: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.rule,
    fontSize: 8.5,
  },
  summaryTotal: { fontWeight: 700, color: COLOR.brown },
});

// ── Small building blocks ────────────────────────────────────

const EMPTY = '—'; // em dash

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  return t(value);
}

function SectionTitle({ children, presence = 60 }: { children: string; presence?: number }) {
  return (
    <Text style={s.sectionTitle} minPresenceAhead={presence}>
      {children}
    </Text>
  );
}

function Caption({ children, note, warn }: { children: string; note?: string; warn?: string }) {
  return (
    <Text style={s.caption} minPresenceAhead={44}>
      {t(children)}
      {note ? <Text style={s.captionNote}>{`  ${t(note)}`}</Text> : null}
      {warn ? <Text style={[s.captionNote, { color: COLOR.warn, fontWeight: 700 }]}>{`  ${t(warn)}`}</Text> : null}
    </Text>
  );
}

function Field({ label, value, note, warn }: { label: string; value: string | number; note?: string; warn?: string }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{display(value)}</Text>
      {note ? <Text style={s.italicNote}>{t(note)}</Text> : null}
      {warn ? <Text style={s.warn}>{t(warn)}</Text> : null}
    </View>
  );
}

function StatBox({
  label,
  value,
  sub,
  calc,
  small,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  calc?: string;
  small?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={[s.box, highlight ? s.boxHighlight : {}]}>
      <Text style={s.boxLabel}>{label}</Text>
      <Text style={small ? s.boxValueSmall : s.boxValue}>{value === '' ? ' ' : t(value)}</Text>
      {sub ? <Text style={s.boxSub}>{t(sub)}</Text> : null}
      {calc ? <Text style={s.boxCalc}>{t(calc)}</Text> : null}
    </View>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return <View style={s.checkbox}>{checked ? <Text style={s.checkMark}>X</Text> : null}</View>;
}

interface Column<T> {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  cell: (row: T) => ReactNode;
}

/**
 * A table whose header row repeats on every page it spans (`fixed` inside a
 * wrapping View). Rows never split across pages. Empty text cells stay blank.
 */
function Table<T>({ columns, rows, rowKey, dimRow }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  dimRow?: (row: T) => boolean;
}) {
  return (
    <View style={s.table}>
      <View style={s.thead} fixed>
        {columns.map((col) => (
          <Text
            key={col.header}
            style={[s.th, { flexGrow: col.width, flexShrink: 1, flexBasis: 0, textAlign: col.align ?? 'left' }]}
          >
            {col.header}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View
          key={rowKey(row, i)}
          style={[s.tr, i % 2 === 1 ? s.trAlt : {}, dimRow?.(row) ? s.trDim : {}]}
          wrap={false}
        >
          {columns.map((col) => {
            const content = col.cell(row);
            const align = col.align ?? 'left';
            return (
              <View
                key={col.header}
                style={[
                  s.td,
                  {
                    flexGrow: col.width,
                    flexShrink: 1,
                    flexBasis: 0,
                    alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                  },
                ]}
              >
                {typeof content === 'string' || typeof content === 'number' ? (
                  <Text style={{ textAlign: align }}>{t(content)}</Text>
                ) : (
                  content
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Empty({ children }: { children: string }) {
  return <Text style={s.empty}>{t(children)}</Text>;
}

function Chips({ items }: { items: string[] }) {
  return (
    <View style={s.chipRow}>
      {items.map((item, i) => (
        <Text key={`${item}-${i}`} style={s.chip}>
          {t(item)}
        </Text>
      ))}
    </View>
  );
}

function SummaryRow({ label, value, warn, total }: { label: string; value: string; warn?: boolean; total?: boolean }) {
  return (
    <View style={s.summaryRow}>
      <Text style={total ? s.summaryTotal : {}}>{label}</Text>
      <Text style={[total ? s.summaryTotal : {}, warn ? { color: COLOR.warn, fontWeight: 700 } : {}]}>{t(value)}</Text>
    </View>
  );
}

// ── Shared display helpers ───────────────────────────────────

// An id the app doesn't know is printed as stored, as the app shows it.
function kindredName(c: Character): string {
  return getKindredName(c.kindred);
}

function className(c: Character): string {
  return getClassName(c.class);
}

function isKindredClass(c: Character): boolean {
  return !!c.kindred && c.kindred !== 'human' && !c.class;
}

/** "Level 3 Elf (kindred-class)", "Level 5 Human Fighter" (the same label as the app's header) */
export function identityLine(c: Character): string {
  return [`Level ${c.level}`, getKindredClassLabel(c)].filter(Boolean).join(' ');
}

function calcNote(stored: number, calculated: number | null, format: (n: number) => string = String): string | undefined {
  return calculated !== null && calculated !== stored ? `calc. ${format(calculated)}` : undefined;
}

// ── Sections ─────────────────────────────────────────────────

function Header({ c, exportedOn }: { c: Character; exportedOn: string }) {
  return (
    <View style={s.header} wrap={false}>
      <View style={s.headerMain}>
        <Text style={s.name}>{t(c.name || 'Unnamed')}</Text>
        <Text style={s.identity}>{t(identityLine(c))}</Text>
      </View>
      <View style={s.headerSide}>
        <Text style={s.brand}>DOLMEN SPOT</Text>
        <Text style={s.meta}>{`Dolmenwood character sheet · ${exportedOn}`}</Text>
      </View>
    </View>
  );
}

function CharacterSection({ c }: { c: Character }) {
  const kindred = KINDREDS.find((k) => k.id === c.kindred);
  const classEntry = getAvailableClasses(c.kindred).find((entry) => entry.class.id === c.class);
  // Ids the app doesn't know are printed as the Character tab's dropdowns show them.
  const knownClass = CLASSES.some((cl) => cl.id === c.class);
  const unknownKindred = !!c.kindred && !kindred;

  let classValue = className(c);
  let classNote: string | undefined;
  let classWarn: string | undefined;
  if (c.class && !knownClass) {
    classValue = `${c.class} (unknown class)`;
    classWarn = "Dolmen Spot doesn't recognise this class, so it can't calculate class-based values.";
  } else if (classEntry) {
    classNote = classEntry.class.description + (classEntry.restriction === 'rare' ? ' Unusual combination for this kindred.' : '');
  } else if (c.kindred === 'human' && !c.class) {
    classWarn = 'Humans must select a class.';
  } else if (isKindredClass(c)) {
    classValue = 'Kindred-class';
    classNote = `Playing as a ${kindredName(c)} kindred-class (see appendix).`;
  }

  const hasMoonSign = canHaveMoonSign(c.kindred);
  const phaseLabel = MOON_PHASES.find((p) => p.toLowerCase() === c.moonPhase) ?? '';
  const moonValue = hasMoonSign
    ? [c.moonSign, phaseLabel ? `(${phaseLabel})` : ''].filter(Boolean).join(' ')
    : 'N/A';

  const alignmentWarning = getAlignmentWarning(c.class, c.alignment);

  // The Character tab shows the calculated XP modifier for classed characters
  // (not for a class id it doesn't know) and offers "Sync" when the stored
  // value differs; the stored one is in effect.
  const xpCalc = calculateXpModifier(c.class, c.kindred, c.abilityScores);
  let xpNote: string | undefined;
  if (knownClass) {
    const breakdown = [`Prime ${formatXpPercent(xpCalc.primeBonus)}`];
    if (xpCalc.humanBonus > 0) breakdown.push(`Human ${formatXpPercent(xpCalc.humanBonus)}`);
    xpNote = c.xpModifier === xpCalc.total
      ? breakdown.join(' + ')
      : `Manual override; calc. ${formatXpPercent(xpCalc.total)} (${breakdown.join(' + ')})`;
  }

  return (
    <View wrap={false}>
      <SectionTitle>Character</SectionTitle>
      <View style={s.fieldGrid}>
        <Field
          label="Kindred"
          value={unknownKindred ? `${c.kindred} (unknown kindred)` : kindredName(c)}
          note={kindred?.description}
          warn={unknownKindred ? "Dolmen Spot doesn't recognise this kindred, so it can't calculate kindred-based values." : undefined}
        />
        <Field label="Class" value={classValue} note={classNote} warn={classWarn} />
        <Field label="Level" value={c.level} />
        <Field label="Background" value={c.background} />
        <Field
          label="Alignment"
          value={c.alignment}
          note={alignmentWarning?.severity === 'info' ? alignmentWarning.text : undefined}
          warn={alignmentWarning?.severity === 'warning' ? alignmentWarning.text : undefined}
        />
        <Field label="Affiliation" value={c.affiliation} />
        <Field label="Moon sign" value={moonValue} note={hasMoonSign ? undefined : 'Fairies cannot have moon signs.'} />
        <Field label="XP / Next level XP" value={`${c.xp} / ${c.xpNextLevel}`} />
        <Field label="XP modifier" value={formatXpPercent(c.xpModifier)} note={xpNote} />
      </View>
    </View>
  );
}

function AbilitiesSection({ c }: { c: Character }) {
  return (
    <View wrap={false}>
      <SectionTitle>Ability Scores</SectionTitle>
      <View style={s.boxRow}>
        {ABILITY_SCORE_INFO.map((ability) => {
          const score = c.abilityScores[ability.key];
          return (
            <View key={ability.key} style={s.box}>
              <Text style={s.abilityLabel}>{`${ability.abbr} · ${ability.label}`}</Text>
              <Text style={s.boxValue}>{score ? String(score) : ' '}</Text>
              <Text style={s.abilityMod}>{formatModifier(getAbilityModifier(score))}</Text>
              <Text style={s.boxSub}>{ability.note}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SavesSection({ c }: { c: Character }) {
  return (
    <View wrap={false}>
      <SectionTitle>Saving Throws</SectionTitle>
      <View style={s.boxRow}>
        {SAVE_TARGET_INFO.map((save) => (
          <StatBox key={save.key} label={save.label} value={c.saveTargets[save.key] ? String(c.saveTargets[save.key]) : ''} />
        ))}
      </View>
    </View>
  );
}

function CombatSection({ c }: { c: Character }) {
  const calcAC = calculateAC(c.equippedArmourName, c.hasShield, c.abilityScores.dexterity, c.kindred, c.class, c.level);
  const calcAttack = getCalculatedAttackBonus(c);
  const calcMR = calculateMagicResistance(c.abilityScores.wisdom, c.kindred);
  const melee = calculateMeleeModifier(c.attackBonus, c.abilityScores.strength);
  const missile = calculateMissileModifier(c.attackBonus, c.abilityScores.dexterity, c.class);
  const strMod = formatModifier(getAbilityModifier(c.abilityScores.strength));
  const dexMod = formatModifier(getAbilityModifier(c.abilityScores.dexterity));
  const conMod = formatModifier(getAbilityModifier(c.abilityScores.constitution));
  const { speed } = calculateEncumbrance(c);

  const armour = ARMOUR_TABLE.find((a) => a.name === (c.equippedArmourName || 'Unarmoured'));
  const armourLine = `${c.equippedArmourName || 'Unarmoured'}${armour ? ` (AC ${armour.ac})` : ''}${c.hasShield ? ' + Shield (+1)' : ''}`;
  const armourWarning = getArmourRestrictionWarning(c.class, c.equippedArmourName, c.hasShield);

  return (
    <View wrap={false}>
      <SectionTitle>Combat</SectionTitle>
      <View style={s.boxRow}>
        <StatBox label="Hit Points" value={`${c.currentHp} / ${c.maxHp}`} sub="Current / Max" highlight />
        <StatBox label="Armour Class" value={String(c.armorClass)} calc={calcNote(c.armorClass, calcAC.ac)} highlight />
        <StatBox
          label="Attack"
          value={formatModifier(c.attackBonus)}
          calc={calcNote(c.attackBonus, calcAttack, formatModifier)}
        />
        <StatBox label="Melee" value={formatModifier(melee)} sub={`ATK ${formatModifier(c.attackBonus)} + STR ${strMod}`} />
        <StatBox
          label="Missile"
          value={formatModifier(missile)}
          sub={`ATK ${formatModifier(c.attackBonus)} + DEX ${dexMod}${c.class === 'hunter' ? ' +1 Hunter' : ''}`}
        />
        <StatBox
          label="Speed"
          value={`${speed} ft`}
          sub={speed === 0 ? 'Over max load' : `By ${c.encumbranceMethod === 'slots' ? 'slots' : 'weight'}`}
        />
        <StatBox
          label="Magic Resist."
          value={formatModifier(c.magicResistance)}
          calc={calcNote(c.magicResistance, calcMR.value, formatModifier)}
        />
      </View>
      <Text style={s.body}>
        <Text style={s.bold}>Armour: </Text>
        {t(armourLine)}
        {calcAC.notes.length > 0 ? <Text style={s.note}>{`   AC ${t(calcAC.notes.join(', '))}`}</Text> : null}
      </Text>
      {armourWarning ? <Text style={s.warn}>{t(armourWarning)}</Text> : null}
      {calcMR.notes.length > 0 ? (
        <Text style={s.note}>{`Magic resistance: ${t(calcMR.notes.join(', '))}`}</Text>
      ) : null}
      <Text style={s.note}>{`CON modifier: ${conMod} applied per Hit Die`}</Text>
    </View>
  );
}

function SkillsSection({ c }: { c: Character }) {
  const { calculated, autoKeys, customKeys, outOfSyncKeys } = getSkillTargetLayout(c);
  const outOfSync = new Set(outOfSyncKeys);

  const cell = (key: string, value: number | undefined, calcValue?: number) => (
    <View key={key} style={s.skillCell}>
      <View style={s.skillBox}>
        <Text style={s.boxLabel}>{t(skillKeyToDisplayName(key))}</Text>
        <Text style={s.boxValueSmall}>{value === undefined ? EMPTY : String(value)}</Text>
        {calcValue !== undefined ? <Text style={s.boxCalc}>{`calc. ${calcValue}`}</Text> : null}
      </View>
    </View>
  );

  return (
    <View wrap={false}>
      <SectionTitle>Skill Targets</SectionTitle>
      {calculated.expertisePoints !== null ? (
        <Text style={[s.note, { marginTop: 0, marginBottom: 3 }]}>
          {`Expertise points: ${calculated.expertisePoints} (distribute among class skills)`}
        </Text>
      ) : null}
      <View style={s.skillGrid}>
        {autoKeys.map((key) =>
          cell(key, c.skillTargets[key], outOfSync.has(key) ? calculated.targets[key] : undefined),
        )}
      </View>
      {customKeys.length > 0 ? (
        <>
          <Text style={s.subTitle}>Custom skills</Text>
          <View style={s.skillGrid}>
            {customKeys.map((key) => cell(key, c.skillTargets[key] || undefined))}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ── Traits & features ────────────────────────────────────────

interface BlockSpec {
  key: string;
  title: string;
  note?: string;
  body: ReactNode;
}

/**
 * An unbreakable feature block. `lead` holds any headings that introduce it:
 * minPresenceAhead can't keep a heading with a block taller than its
 * look-ahead, so headings travel inside the first block instead.
 */
function Block({ title, note, lead, children }: { title: string; note?: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <View style={s.block} wrap={false}>
      {lead}
      <Text style={s.blockTitle}>
        {t(title)}
        {note ? <Text style={s.subTitleNote}>{`  ${t(note)}`}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function classFeatureBlocks(c: Character): BlockSpec[] {
  const profile = getCharacterFeatureProfile(c.kindred, c.class, c.level);
  const blocks: BlockSpec[] = [];

  if (profile.hasCombatTalents) {
    const talentSlots = getFighterTalentCount(c.level);
    blocks.push({
      key: 'talents',
      title: 'Combat Talents',
      note: `(${talentSlots} slots)`,
      body:
        talentSlots === 0 ? (
          <Empty>Combat talents unlock at Level 2.</Empty>
        ) : (
          Array.from({ length: talentSlots }, (_, i) => {
            const sel = c.selectedCombatTalents[i];
            const talent = FIGHTER_COMBAT_TALENTS.find((tal) => tal.id === sel?.talentId);
            const spec =
              talent && (talent.id === 'slayer' || talent.id === 'weapon-specialist') && sel?.specification
                ? ` (${sel.specification})`
                : '';
            return (
              <Text key={i} style={s.body}>
                <Text style={s.bold}>{`Slot ${i + 1}: `}</Text>
                {talent ? t(`${talent.name}${spec}`) : EMPTY}
                {talent ? <Text style={s.note}>{`  ${t(talent.description)}`}</Text> : null}
              </Text>
            );
          })
        ),
    });
  }

  if (profile.hasHolyOrder) {
    const holyOrder = CLERIC_HOLY_ORDERS.find((o) => o.id === c.holyOrder);
    blocks.push({
      key: 'holy-order',
      title: 'Holy Order',
      body:
        c.level < 2 ? (
          <Empty>Holy orders are available at Level 2+.</Empty>
        ) : holyOrder ? (
          <Text style={s.body}>
            <Text style={s.bold}>{t(`${holyOrder.name} (${holyOrder.title})`)}</Text>
            {`  ${t(holyOrder.bonus)}`}
          </Text>
        ) : (
          <Empty>No holy order chosen.</Empty>
        ),
    });
  }

  if (profile.hasTurning) {
    blocks.push({
      key: 'turning',
      title: 'Turning the Undead',
      note: `${FEATURE_NOTES.turningUndead} ${TURNING_UNDEAD_TABLE.frequency}.`,
      body: (
        <>
          <View style={s.miniGrid}>
            {TURNING_UNDEAD_TABLE.results.map((r) => (
              <View key={r.range} style={s.miniCell}>
                <Text style={s.boxLabel}>{r.range}</Text>
                <Text style={s.boxSub}>{r.effect}</Text>
              </View>
            ))}
          </View>
          <Text style={s.note}>{TURNING_UNDEAD_TABLE.levelModifier}</Text>
        </>
      ),
    });
  }

  if (profile.hasChivalricCode) {
    const liege = NOBLE_HOUSES.find((h) => h.name === c.liegeHouse);
    blocks.push({
      key: 'liege',
      title: 'Liege House',
      body: (
        <>
          <Text style={s.body}>
            {display(c.liegeHouse)}
            {liege ? <Text style={s.note}>{`  ${t(`${liege.alignment} · ${liege.head}`)}`}</Text> : null}
          </Text>
          <Text style={s.note}>{`Code of Chivalry: ${FEATURE_NOTES.chivalryVirtues}. ${FEATURE_NOTES.chivalryRules}`}</Text>
        </>
      ),
    });
  }

  if (profile.hasTrophies) {
    blocks.push({
      key: 'trophies',
      title: 'Trophies',
      note: FEATURE_NOTES.trophies,
      body: c.trophies.length > 0 ? <Chips items={c.trophies.map((tr) => tr.creatureType)} /> : <Empty>None yet.</Empty>,
    });
  }

  if (profile.hasCompanion) {
    const companion = c.animalCompanion;
    blocks.push({
      key: 'companion',
      title: 'Animal Companion',
      body: companion ? (
        <Text style={s.body}>
          <Text style={s.bold}>{display(companion.name)}</Text>
          {`  ${t(companion.type || 'Unknown type')} · HP ${companion.hp}`}
          {companion.notes ? <Text style={s.note}>{`  ${t(companion.notes)}`}</Text> : null}
        </Text>
      ) : (
        <Empty>No companion.</Empty>
      ),
    });
  }

  return blocks;
}

function kindredFeatureBlocks(c: Character): BlockSpec[] {
  const profile = getCharacterFeatureProfile(c.kindred, c.class, c.level);
  const blocks: BlockSpec[] = [];

  if (profile.hasHorns) {
    blocks.push({
      key: 'horns',
      title: 'Horn Progression',
      note: `Level ${c.level}`,
      body: (
        <View style={s.miniGrid}>
          {BREGGLE_HORN_PROGRESSION.map((h) => (
            <View key={h.level} style={[s.miniCell, h.level === c.level ? s.miniCellActive : {}]}>
              <Text style={s.boxLabel}>{`L${h.level}`}</Text>
              <Text style={s.boxSub}>{t(h.length)}</Text>
              <Text style={s.boxSub}>{h.damage}</Text>
            </View>
          ))}
        </View>
      ),
    });
  }

  if (profile.hasGaze) {
    blocks.push({
      key: 'gaze',
      title: 'Breggle Gaze',
      note: '(Level 4+)',
      body: <Text style={s.body}>{`${c.gazeUsesRemaining} / ${getMaxGazeUses(c.level)} uses remaining`}</Text>,
    });
  }

  if (profile.hasFormShift) {
    blocks.push({
      key: 'forms',
      title: 'Current Form',
      note: c.wilderUsedToday ? 'Wilder used today.' : undefined,
      body: (
        <>
          <View style={s.miniGrid}>
            {(['estray', 'chester', 'wilder'] as const).map((formId) => {
              const form = GRIMALKIN_FORMS[formId];
              const active = c.currentForm === formId;
              return (
                <View key={formId} style={[s.miniCell, { paddingHorizontal: 4 }, active ? s.miniCellActive : {}]}>
                  <Text style={s.boxLabel}>{`${form.name}${active ? ' (current)' : ''}`}</Text>
                  <Text style={s.boxSub}>{form.description}</Text>
                  {form.ac ? <Text style={s.boxSub}>{`AC ${form.ac} | Spd ${form.speed}'`}</Text> : null}
                  {form.attacks ? <Text style={s.boxSub}>{form.attacks}</Text> : null}
                </View>
              );
            })}
          </View>
          {c.currentForm === 'wilder' && 'notes' in GRIMALKIN_FORMS.wilder ? (
            <Text style={s.note}>{GRIMALKIN_FORMS.wilder.notes}</Text>
          ) : null}
        </>
      ),
    });
  }

  if (profile.hasMadRevelry) {
    const maxRevelry = getMaxMadRevelryUses(c);
    blocks.push({
      key: 'revelry',
      title: 'Mad Revelry',
      note: `${Math.min(c.madRevelryUsesRemaining, maxRevelry)}/${maxRevelry} uses`,
      body: (
        <>
          <Text style={s.note}>{FEATURE_NOTES.madRevelry}</Text>
          {MAD_REVELRY_MELODIES.map((m) => (
            <Text key={m.id} style={s.body}>
              <Text style={s.bold}>{`${m.name}: `}</Text>
              {m.effect}
            </Text>
          ))}
        </>
      ),
    });
  }

  if (profile.hasSymbioticFlesh) {
    blocks.push({
      key: 'flesh',
      title: 'Symbiotic Flesh',
      note: '(1 trait per level)',
      body:
        c.symbioticFleshTraits.length > 0 ? (
          <Chips
            items={c.symbioticFleshTraits.map(
              (roll) => `[${roll}] ${SYMBIOTIC_FLESH_TABLE.find((e) => e.roll === roll)?.trait ?? '???'}`,
            )}
          />
        ) : (
          <Empty>No traits recorded.</Empty>
        ),
    });
  }

  if (profile.hasFungalSymbiosis) {
    blocks.push({
      key: 'fungal',
      title: 'Fungal Symbiosis',
      note: '(Level 4+)',
      body: (
        <>
          <Text style={s.body}>
            {`${c.fungalSymbiosisUsesRemaining} / ${getMaxFungalSymbiosisUses(c.level)} uses remaining`}
          </Text>
          <Text style={s.note}>{FEATURE_NOTES.fungalSymbiosis}</Text>
        </>
      ),
    });
  }

  return blocks;
}

function languagesBlock(c: Character): BlockSpec {
  const { langInfo, bonusLangs } = getLanguageBreakdown(c);
  return {
    key: 'languages',
    title: 'Languages',
    body: (
      <>
        <Text style={s.body}>
          <Text style={s.bold}>Native: </Text>
          {t(langInfo.nativeLanguages.join(', ')) || EMPTY}
        </Text>
        {langInfo.classLanguages.length > 0 ? (
          <Text style={s.body}>
            <Text style={s.bold}>Class: </Text>
            {t(langInfo.classLanguages.join(', '))}
          </Text>
        ) : null}
        <Text style={s.body}>
          <Text style={s.bold}>{`Bonus (${bonusLangs.length} of ${langInfo.bonusSlots} slots used): `}</Text>
          {bonusLangs.length > 0 ? t(bonusLangs.join(', ')) : EMPTY}
        </Text>
        {langInfo.bonusSlots === 0 ? <Text style={s.note}>INT modifier does not grant bonus languages.</Text> : null}
      </>
    ),
  };
}

function RetainersTable({ c, maxRetainers }: { c: Character; maxRetainers: number }) {
  return (
    <>
      <Caption note={`(${c.retainers.length} of ${maxRetainers})`}>Retainers</Caption>
      <Table
        rows={c.retainers}
        rowKey={(r) => r.id}
        columns={[
          { header: 'Name', width: 3, cell: (r) => r.name || EMPTY },
          { header: 'Class', width: 2, cell: (r) => r.class },
          { header: 'Level', width: 1, align: 'center', cell: (r) => r.level },
          { header: 'HP', width: 1, align: 'center', cell: (r) => r.hp },
          { header: 'Loyalty', width: 1, align: 'center', cell: (r) => r.loyalty },
          { header: 'Notes', width: 4, cell: (r) => r.notes },
        ]}
      />
    </>
  );
}

function TraitsSection({ c }: { c: Character }) {
  const { maxRetainers } = getRetainerLimits(c.abilityScores.charisma);
  const profile = getCharacterFeatureProfile(c.kindred, c.class, c.level);
  const groups: { heading?: string; blocks: BlockSpec[] }[] = [
    {
      heading: `Class features${className(c) ? ` · ${className(c)}` : ''}`,
      blocks: hasAnyClassFeature(profile) ? classFeatureBlocks(c) : [],
    },
    {
      heading: `Kindred features · ${kindredName(c)}`,
      blocks: hasAnyKindredFeature(profile) ? kindredFeatureBlocks(c) : [],
    },
    { blocks: [languagesBlock(c)] },
  ];
  if (c.retainers.length === 0) {
    groups[2].blocks.push({
      key: 'retainers',
      title: 'Retainers',
      note: `(0 of ${maxRetainers})`,
      body: <Empty>No retainers hired. Max = 4 + CHA modifier (min 1).</Empty>,
    });
  }

  // The section title rides with the first block; each group heading with its group's first block.
  let first = true;
  const blocks = groups.flatMap((group) =>
    group.blocks.map((block, i) => {
      const lead = (
        <>
          {first ? <SectionTitle>Traits & Features</SectionTitle> : null}
          {i === 0 && group.heading ? <Text style={s.subTitle}>{t(group.heading)}</Text> : null}
        </>
      );
      first = false;
      return (
        <Block key={block.key} title={block.title} note={block.note} lead={lead}>
          {block.body}
        </Block>
      );
    }),
  );

  return (
    <>
      {blocks}
      {c.retainers.length > 0 ? <RetainersTable c={c} maxRetainers={maxRetainers} /> : null}
    </>
  );
}

// ── Magic ────────────────────────────────────────────────────
// Each magic block opens with an unbreakable View that carries `lead` (the
// section title and status lines, for whichever block comes first) plus its
// own heading, kept on the same page as the start of what follows.

/** Heading area that must not be stranded at the bottom of a page. */
function KeepWithNext({ children }: { children: ReactNode }) {
  return (
    <View wrap={false} minPresenceAhead={44}>
      {children}
    </View>
  );
}

function SpellcastingBlock({
  c,
  isArcane,
  spellsPerDay,
  lead,
}: {
  c: Character;
  isArcane: boolean;
  spellsPerDay: number[] | null;
  lead?: ReactNode;
}) {
  const preparedByRank = countPreparedByRank(c.spells);
  const scrolls = getScrollItems(c);
  const startingBook =
    c.class === 'magician' && !isStartingBookApplied(c) && c.startingSpellBook
      ? MAGICIAN_STARTING_SPELL_BOOKS.find((b) => b.name === c.startingSpellBook)
      : undefined;
  const known = [...c.knownSpells].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  return (
    <>
      <KeepWithNext>
        {lead}
        <Text style={s.subTitle}>{`${isArcane ? 'Arcane' : 'Holy'} Spells`}</Text>
        {spellsPerDay ? (
          <>
            <Text style={s.note}>Spells per day (prepared / max)</Text>
            <View style={[s.miniGrid, { marginBottom: 2 }]}>
              {spellsPerDay.map((max, i) => {
                const rank = i + 1;
                const prepared = preparedByRank[rank] || 0;
                return (
                  <View key={rank} style={[s.miniCell, prepared > max ? { borderColor: COLOR.warn } : {}]}>
                    <Text style={s.boxLabel}>{`Rank ${rank}`}</Text>
                    <Text style={[s.boxValueSmall, prepared > max ? { color: COLOR.warn } : {}]}>{`${prepared}/${max}`}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
        {startingBook ? (
          <Text style={s.note}>
            {t(`Starting spell book: ${startingBook.name} (${startingBook.spells.join(', ')}), not yet added to inventory`)}
          </Text>
        ) : null}
      </KeepWithNext>

      <Caption>{isArcane ? 'Available Spells' : 'Prepared Spells'}</Caption>
      {c.spells.length > 0 ? (
        <Table
          rows={c.spells}
          rowKey={(sp) => sp.id}
          dimRow={(sp) => sp.cast}
          columns={[
            { header: 'Rank', width: 0.8, align: 'center', cell: (sp) => `R${sp.rank}` },
            { header: 'Spell', width: 4, cell: (sp) => sp.name || EMPTY },
            { header: 'Prep', width: 0.8, align: 'center', cell: (sp) => <Checkbox checked={sp.prepared} /> },
            { header: 'Cast', width: 0.8, align: 'center', cell: (sp) => <Checkbox checked={sp.cast} /> },
            { header: 'Notes', width: 5, cell: (sp) => sp.notes },
          ]}
        />
      ) : null}
      {isArcane && scrolls.length > 0 ? (
        <>
          <Text style={[s.note, { marginTop: 4 }]} minPresenceAhead={30}>
            {'Scrolls in inventory · one-shot'}
          </Text>
          <Table
            rows={scrolls}
            rowKey={(sc) => sc.id}
            columns={[
              { header: 'Rank', width: 0.8, align: 'center', cell: (sc) => `R${sc.scrollSpell?.rank ?? ''}` },
              { header: 'Scroll', width: 10.6, cell: (sc) => sc.scrollSpell?.name ?? '' },
            ]}
          />
        </>
      ) : null}
      {c.spells.length === 0 && (!isArcane || scrolls.length === 0) ? (
        <Empty>
          {isArcane
            ? 'Nothing available yet. Memorise a known spell or add a scroll to your inventory.'
            : 'No spells added yet.'}
        </Empty>
      ) : null}

      {isArcane ? (
        <>
          <Caption note={`${c.knownSpells.length} learned`}>Known Spells</Caption>
          {known.length > 0 ? (
            <Table
              rows={known}
              rowKey={(k) => k.id}
              columns={[
                { header: 'Rank', width: 0.8, align: 'center', cell: (k) => `R${k.rank}` },
                { header: 'Spell', width: 4, cell: (k) => k.name || EMPTY },
                { header: 'Source', width: 1.8, cell: (k) => KNOWN_SPELL_SOURCE_LABELS[k.source] ?? k.source },
                { header: 'In a spell book', width: 2.2, cell: (k) => (isSpellInAnyBook(c, k.name) ? 'Yes' : 'No book') },
                { header: 'On a scroll', width: 1.6, cell: (k) => (isSpellOnScroll(c, k.name) ? 'Yes' : '') },
              ]}
            />
          ) : (
            <Empty>No known spells yet.</Empty>
          )}
        </>
      ) : null}
    </>
  );
}

function GlamoursBlock({ c, max, lead }: { c: Character; max: number; lead?: ReactNode }) {
  const over = c.glamours.length > max;
  return (
    <>
      <KeepWithNext>
        {lead}
        <Text style={s.subTitle}>
          Glamours
          <Text style={[s.subTitleNote, over ? { color: COLOR.warn } : {}]}>
            {`  ${c.glamours.length}/${max} glamours known${over ? ' (over maximum!)' : ''}`}
          </Text>
        </Text>
      </KeepWithNext>
      {c.glamours.length > 0 ? (
        <Table
          rows={c.glamours}
          rowKey={(g) => g.id}
          columns={[
            { header: 'Glamour', width: 2.2, cell: (g) => g.name || EMPTY },
            { header: 'Effect', width: 5, cell: (g) => GLAMOURS.find((ref) => ref.id === g.glamourId)?.description ?? '' },
            { header: 'Notes', width: 3, cell: (g) => g.notes },
          ]}
        />
      ) : (
        <Empty>No glamours known yet.</Empty>
      )}
    </>
  );
}

function RunesBlock({ c, lead }: { c: Character; lead?: ReactNode }) {
  return (
    <>
      <KeepWithNext>
        {lead}
        <Text style={s.subTitle}>Fairy Runes</Text>
      </KeepWithNext>
      {c.runes.length > 0 ? (
        <Table
          rows={c.runes}
          rowKey={(r) => r.id}
          columns={[
            { header: 'Rune', width: 2.2, cell: (r) => r.name || EMPTY },
            { header: 'Magnitude', width: 1.3, cell: (r) => r.magnitude },
            { header: 'Frequency', width: 1.3, cell: (r) => getRuneUsageFrequency(r.magnitude, c.level) },
            { header: 'Uses left', width: 1, align: 'center', cell: (r) => String(r.usesRemaining) },
            { header: 'Effect', width: 4, cell: (r) => FAIRY_RUNES.find((ref) => ref.id === r.runeId)?.description ?? '' },
            { header: 'Notes', width: 2.4, cell: (r) => r.notes },
          ]}
        />
      ) : (
        <Empty>No runes granted yet.</Empty>
      )}
    </>
  );
}

function KnackBlock({ c, lead }: { c: Character; lead?: ReactNode }) {
  const knack = c.knack;
  const ref = knack ? MOSSLING_KNACKS.find((k) => k.id === knack.knackId) : undefined;
  return (
    <View wrap={false}>
      {lead}
      <Text style={s.subTitle}>
        Mossling Knack
        {knack ? <Text style={s.subTitleNote}>{`  ${t(knack.name)}`}</Text> : null}
      </Text>
      {!knack || !ref ? (
        <Empty>No knack chosen yet.</Empty>
      ) : (
        <>
          {ref.tiers.map((tier) => {
            const active = c.level >= tier.level;
            return (
              <Text key={tier.level} style={[s.body, active ? {} : { color: COLOR.faint }]}>
                <Text style={s.bold}>{`L${tier.level}: `}</Text>
                {t(tier.description)}
                {active ? '' : `  (Level ${tier.level})`}
              </Text>
            );
          })}
          {knack.notes ? <Text style={s.note}>{t(knack.notes)}</Text> : null}
        </>
      )}
    </View>
  );
}

function MagicSection({ c }: { c: Character }) {
  const { profile, hasNoMagic, hasSpells, hasGlamours, hasRunes, hasKnacks, isBregglesPreMagic } = getMagicSections(c);
  if (hasNoMagic) return null;

  const lead = (
    <>
      <SectionTitle>Spells & Magic</SectionTitle>
      {isBregglesPreMagic ? (
        <Empty>{`Breggle arcane magic unlocks at Level 4. Current level: ${c.level}.`}</Empty>
      ) : null}
      {profile.hasDivineResistance ? (
        <Text style={s.body}>
          <Text style={s.bold}>Divine Resistance: </Text>
          {FEATURE_NOTES.divineResistance}
        </Text>
      ) : null}
    </>
  );

  // The same order as the Spells & Magic tab; the first block carries the lead.
  const blocks: ((lead?: ReactNode) => ReactNode)[] = [];
  if (hasSpells && !isBregglesPreMagic) {
    blocks.push((l) => (
      <SpellcastingBlock
        key="spells"
        c={c}
        isArcane={profile.spellType === 'arcane'}
        spellsPerDay={profile.spellsPerDay}
        lead={l}
      />
    ));
  }
  if (hasGlamours) blocks.push((l) => <GlamoursBlock key="glamours" c={c} max={profile.glamourCount} lead={l} />);
  if (hasRunes) blocks.push((l) => <RunesBlock key="runes" c={c} lead={l} />);
  if (hasKnacks) blocks.push((l) => <KnackBlock key="knack" c={c} lead={l} />);

  if (blocks.length === 0) return <View wrap={false}>{lead}</View>;
  return <>{blocks.map((render, i) => render(i === 0 ? lead : undefined))}</>;
}

// ── Inventory ────────────────────────────────────────────────

function itemName(item: InventoryItem): string {
  if (item.kind === 'scroll') {
    const spell = item.scrollSpell;
    return spell?.name ? `Scroll: ${spell.name} (R${spell.rank})` : 'Scroll (no spell chosen)';
  }
  return item.name;
}

function ItemCell({ item }: { item: InventoryItem }) {
  const contents = item.spellbookContents ?? [];
  return (
    <View>
      <Text>{display(itemName(item))}</Text>
      {item.kind === 'spellbook' ? (
        <Text style={s.cellSub}>
          {t(
            `Spell book (${contents.length}/3)${
              contents.length > 0
                ? `: ${contents.map((e) => (e.name ? `R${e.rank} ${e.name}` : EMPTY)).join(', ')}`
                : ': no spells recorded'
            }`,
          )}
        </Text>
      ) : null}
    </View>
  );
}

/** `group` heads the item column, so the header repeated on a new page says which container it is. */
function ItemsTable({ items, group }: { items: InventoryItem[]; group: string }) {
  return (
    <Table
      rows={items}
      rowKey={(item) => item.id}
      columns={[
        { header: t(group), width: 5, cell: (item) => <ItemCell item={item} /> },
        { header: 'Slots', width: 0.9, align: 'center', cell: (item) => String(item.slots) },
        { header: 'Weight', width: 1.1, align: 'center', cell: (item) => String(item.weight) },
        { header: 'Notes', width: 4, cell: (item) => item.notes },
      ]}
    />
  );
}

function ContainerGroup({ c, container }: { c: Character; container: CharacterContainer | null }) {
  const items = getContainerItems(c.stowedItems, container?.id);
  const { usedWeight, capacity, isOverCapacity } = getContainerLoad(container, c.stowedItems);
  // Like the Inventory tab, capacity is only shown with weight encumbrance.
  const weightMode = c.encumbranceMethod === 'weight';
  const name = container ? container.name || 'Container' : 'Loose Items';
  return (
    <>
      <Caption
        note={container && weightMode ? `(${usedWeight} / ${capacity}w)` : undefined}
        warn={container && weightMode && isOverCapacity ? 'Over capacity!' : undefined}
      >
        {name}
      </Caption>
      {items.length > 0 ? <ItemsTable items={items} group={name} /> : <Empty>Empty.</Empty>}
    </>
  );
}

function InventorySection({ c }: { c: Character }) {
  const enc = calculateEncumbrance(c);
  const slotsMode = c.encumbranceMethod === 'slots';
  const { coins } = c;

  return (
    <>
      <KeepWithNext>
        <SectionTitle>Inventory & Encumbrance</SectionTitle>
        <Text style={s.body}>
          <Text style={s.bold}>Encumbrance method: </Text>
          {slotsMode ? 'Slots' : 'Weight'}
        </Text>
        <Caption>Equipped Items</Caption>
      </KeepWithNext>
      {c.equippedItems.length > 0 ? (
        <ItemsTable items={c.equippedItems} group="Equipped" />
      ) : (
        <Empty>No equipped items.</Empty>
      )}

      <Text style={s.subTitle} minPresenceAhead={60}>Stowed Items</Text>
      {c.containers.map((container) => (
        <ContainerGroup key={container.id} c={c} container={container} />
      ))}
      <ContainerGroup c={c} container={null} />

      <View wrap={false}>
        <Caption>Tiny Items</Caption>
        <Text style={s.body}>{display(c.tinyItems)}</Text>
      </View>

      <View style={[s.twoCol, { marginTop: 10 }]} wrap={false}>
        <View style={s.col}>
          <Text style={s.caption}>Encumbrance Summary</Text>
          {slotsMode ? (
            <>
              <SummaryRow
                label="Equipped slots"
                value={`${enc.totalEquippedSlots} / ${EQUIPPED_SLOT_LIMIT}`}
                warn={enc.equippedSlotsOverLimit}
              />
              {enc.equippedSlotsOverLimit ? (
                <Text style={s.warn}>{`Exceeds standard equipped limit (${EQUIPPED_SLOT_LIMIT} slots)`}</Text>
              ) : null}
              <SummaryRow label="Stowed slots (items)" value={String(enc.itemStowedSlots)} />
              <SummaryRow label="Coin slots" value={`${enc.coinSlots} (${enc.totalCoinCount} coins)`} />
              <SummaryRow
                label="Total stowed slots"
                value={`${enc.totalStowedSlots} / ${STOWED_SLOT_LIMIT}`}
                warn={enc.stowedSlotsOverLimit}
              />
              {enc.stowedSlotsOverLimit ? (
                <Text style={s.warn}>{`Exceeds standard stowed limit (${STOWED_SLOT_LIMIT} slots)`}</Text>
              ) : null}
            </>
          ) : (
            <>
              <SummaryRow label="Item weight" value={String(enc.itemEquippedWeight + enc.itemStowedWeight)} />
              <SummaryRow label="Coin weight" value={`${enc.coinWeight} (${enc.totalCoinCount} coins)`} />
              <SummaryRow label="Total weight" value={String(enc.totalWeight)} warn={enc.overMaxLoad} />
            </>
          )}
          <SummaryRow label="Calculated speed" value={`${enc.speed} ft`} total warn={enc.speed === 0} />
          {enc.speed === 0 ? (
            <Text style={s.warn}>Over maximum load: can&apos;t move until items are dropped.</Text>
          ) : null}
        </View>
        <View style={s.col}>
          <Text style={s.caption}>Coins</Text>
          <SummaryRow label="Copper" value={String(coins.copper)} />
          <SummaryRow label="Silver" value={String(coins.silver)} />
          <SummaryRow label="Gold" value={String(coins.gold)} />
          <SummaryRow label="Pellucidium" value={String(coins.pellucidium)} />
          <SummaryRow
            label="Total"
            value={`${enc.totalCoinCount} coins (${getCoinGpEquivalent(coins).toFixed(1)}gp equivalent)`}
            total
          />
          <Text style={s.note}>Exchange: 1pp = 5gp = 50sp = 500cp</Text>
        </View>
      </View>
    </>
  );
}

// ── Document ─────────────────────────────────────────────────

export interface CharacterSheetDocumentProps {
  character: Character;
  pageSize: PdfPageSize;
  exportedOn: string;
}

export function CharacterSheetDocument({ character: c, pageSize, exportedOn }: CharacterSheetDocumentProps) {
  const name = c.name || 'Unnamed';
  return (
    <Document
      title={`${name} - Dolmen Spot character sheet`}
      subject="Dolmenwood character sheet"
      creator="Dolmen Spot"
      producer="Dolmen Spot"
      language="en"
    >
      <Page size={pageSize} style={s.page} wrap>
        <View style={s.footer} fixed>
          <Text>{t(`${name} · ${identityLine(c)}`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        <Header c={c} exportedOn={exportedOn} />
        <CharacterSection c={c} />
        <AbilitiesSection c={c} />
        <SavesSection c={c} />
        <CombatSection c={c} />
        <SkillsSection c={c} />
        <TraitsSection c={c} />
        <MagicSection c={c} />
        <InventorySection c={c} />
      </Page>
    </Document>
  );
}
