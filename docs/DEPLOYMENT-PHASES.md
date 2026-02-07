# Deployment Phases

Phased feature plan for the Dolmenwood Character Sheet, ordered by dependency chains.

---

## Phase 1: Core Data Corrections ✓

**Goal**: Fix existing bugs and ensure all game data matches the rulebook exactly.

**Rule docs**: `03-classes.md`, `04-kindred-classes.md`, `02-kindreds.md`

**Status**: Completed in commit `0b61ac3`

- [x] Add Thief class advancement table to `gamedata.ts` (XP, HP, Attack, all 5 saves for L1-15)
- [x] Add Thief skill targets table (8 skills x 15 levels)
- [x] Verify ALL 9 class advancement tables match rulebook (XP thresholds, HP dice, Attack bonuses, Save targets)
- [x] Add all 5 kindred-class advancement tables to `gamedata.ts` (Breggle, Elf, Grimalkin, Mossling, Woodgrue)
- [x] Verify kindred trait data (Breggle horn damage progression, Gaze uses/day, Grimalkin forms, etc.)
- [x] Add class-specific skill targets for all classes (Bard 4 skills, Hunter 4 skills, Thief 8 skills, etc.)
- [x] Add Enchanter and Magician Detect Magic skill progression
- [x] Fix skill default values -- base Listen/Search/Survival should be 6, not 5 (improved by class/kindred)
- [x] Add Friar AC bonus progression to advancement data
- [x] Add Fighter combat talent progression (levels 2, 6, 10, 14)
- [x] Add Enchanter glamour count progression

---

## Phase 2: Character Creation Accuracy ✓

**Goal**: Correct all character creation mechanics.

**Rule docs**: `01-character-creation.md`, `02-kindreds.md`, `03-classes.md`

**Status**: Completed

- [x] Verify ability score modifier table (3→-3, 4-5→-2, 6-8→-1, 9-12→0, 13-15→+1, 16-17→+2, 18→+3)
- [x] Implement Prime Ability XP bonus calculation (lowest prime ability score: 3-5→-20%, 6-8→-10%, 9-12→0, 13-15→+5%, 16-18→+10%)
- [x] Human +10% XP stacking with prime ability bonus
- [x] Add class-specific starting equipment tables (with d6 roll tables and small-kindred notes)
- [x] Language system: native languages per kindred + INT bonus languages (common and obscure lists)
- [x] Class languages: Clerics/Friars speak Liturgic, Thieves know Thieves' Cant
- [x] Alignment restrictions: Cleric/Friar must be Lawful/Neutral, Knight matches liege alignment
- [x] Moon sign restriction for fairies (Elf, Grimalkin cannot have moon signs)

---

## Phase 3: Combat & Derived Stats ✓

**Goal**: Auto-calculate combat-relevant values from character data.

**Rule docs**: `07-combat.md`, `03-classes.md`, `08-adventuring.md`

**Status**: Completed

- [x] AC calculation: base 10 + armour + shield + DEX mod + kindred bonuses (Breggle fur +1, Small +2 vs Large) + class bonuses (Friar Armour of Faith)
- [x] Attack bonus from class advancement table (auto-lookup by class + level)
- [x] All 5 save targets from class advancement table (auto-lookup by class + level)
- [x] Magic Resistance display (WIS mod + kindred MR: Elf +2, Grimalkin +2)
- [x] Speed calculation from encumbrance method (weight-based or slot-based) — fixed slot-based bug (now uses slower of equipped vs stowed)
- [x] Travel Points display (Speed / 5)
- [x] Melee attack modifier display (Attack bonus + STR mod)
- [x] Missile attack modifier display (Attack bonus + DEX mod + Hunter +1)
- [x] XP to next level from advancement table
- [x] Armour picker dropdown with class restriction warnings
- [x] Sync pattern for all auto-calculated stats (AC, attack bonus, saves, magic resistance, speed, XP-to-next)
- [x] XP progress bar
- [x] Schema migration v2→v3 for new equippedArmourName/hasShield fields

---

## Phase 4: Skills System ✓

**Goal**: Display and track skill targets with class-specific progression.

**Rule docs**: `03-classes.md`, `02-kindreds.md`, `04-kindred-classes.md`

**Status**: Completed

- [x] Base skills: Listen (default 6), Search (default 6), Survival (default 6)
- [x] Kindred skill overrides: Elf Listen 5/Search 5, Grimalkin Listen 5, Mossling Survival 5, Woodgrue Listen 5
- [x] Class skill tables with level progression:
  - Bard: Decipher, Listen, Monster Lore, Legerdemain
  - Enchanter: Detect Magic
  - Fighter: none extra
  - Friar: Survival (foraging) 5
  - Hunter: Alertness, Stalking, Survival, Tracking
  - Knight: none extra
  - Magician: Detect Magic
  - Thief: Climb Wall, Decipher, Disarm Mechanism, Legerdemain, Listen, Pick Lock, Search, Stealth
- [x] Kindred-class unique skills: Elf Detect Magic, Grimalkin Pick Lock, Woodgrue Stealth
- [x] Expertise points tracking (Bard, Hunter, Thief)
- [x] Sync pattern for auto-calculated skills (matching CombatStats pattern)
- [x] Custom skill add/remove preserved
- **Note**: Cleric Exorcism (turning undead) is a 2d6 ability, not a skill target -- deferred to Phase 9

---

## Phase 5: Magic System ✓

**Goal**: Track spell slots, memorization, glamours, runes, and knacks.

**Rule docs**: `05-magic.md`, `03-classes.md`, `04-kindred-classes.md`

**Status**: Completed

- [x] Spells per day tracking by class and level (Cleric R1-5, Friar R1-5, Magician R1-6, Breggle R1-5)
- [x] Spell memorization slots display with prepared/cast tracking and "Reset All Cast" button
- [x] Spell list reference (72 arcane, 34 holy -- collapsible panels with names, ranks, and saint associations)
- [x] Glamour tracking: count by class/kindred level, add/remove from filtered dropdown, over-max warning
- [x] Glamour list reference (20 glamours with descriptions, collapsible panel)
- [x] Fairy Rune tracking: lesser/greater/mighty with usage frequency by level range, +/- uses counter
- [x] Rune list reference (18 runes across 3 magnitudes, collapsible panel with roll table and modifiers)
- [x] Mossling Knack system: 1 knack picker, 4 advancement tiers at L1/3/5/7 with active/dimmed display
- [x] Holy spell saint associations (shown in reference panel)
- [x] Magician starting spell book selection (6 options, 3 Rank 1 spells each)
- [x] Enchanter/Elf divine resistance flag display
- [x] Context-aware Spells & Magic tab via `getCharacterMagicProfile()` helper
- [x] Breggle L1-3 "arcane magic unlocks at Level 4" message
- [x] Knacks 4-6 (Thread Whistling, Wood Kenning, Yeast Master) data completed in rules doc
- [x] Schema migration v3→v4 for new glamours/runes/knack/startingSpellBook fields

---

## Phase 6: Inventory & Encumbrance ✓

**Goal**: Full equipment management with dual encumbrance systems.

**Rule docs**: `06-equipment.md`, `08-adventuring.md`

**Status**: Completed

- [x] Full equipment catalog (`EQUIPMENT_CATALOG`) with ~70 items across 8 categories (containers, light, camping, tools, clothing, holy, ammunition, herbs) with weight, slots, capacity, and notes
- [x] Equipment catalog browser in Inventory tab with search and category filter pills (includes armour, weapons, and all gear)
- [x] Dual encumbrance system toggle (Weight-based vs Slot-based) — already existed, now with coin fix
- [x] Bug fix: coin weight/slots now included in encumbrance calculations (both Inventory and CombatStats)
- [x] Weight system: item weight + coin weight = total weight, Speed lookup
- [x] Slot system: equipped slots (max 10) vs stowed slots + coin slots (max 16), Speed lookup
- [x] Coin management with exchange reference (1pp = 5gp = 50sp = 500cp) and gp-equivalent summary
- [x] Container tracking UI: add containers from catalog dropdown, capacity bars (weight mode), over-capacity warnings
- [x] Stowed items grouped by container with collapsible groups and move-between-containers dropdown
- [x] "Add from Catalog" buttons on equipped items and per-container stowed sections
- [x] Slots added to `WEAPONS_TABLE` (1-handed=1, 2-handed=2)
- [x] Weight column added to armour and weapons reference tables
- [x] Reference panel gear tab updated with category-grouped tables showing weight, slots, and container capacity
- [x] Data corrections: Rope 50' (1gp→50gp), Holy symbol wooden (5gp→10gp)
- [x] Schema migration v4→v5 for `containers: []` field
- **Deferred**: Interactive coin exchange (convert between denominations) — exchange rates shown as reference only
- **Deferred**: Horses, hounds, vehicles, services — reference data for a later phase

---

## Phase 7: Adventuring Features ✓

**Goal**: Travel, camping, and survival tracking.

**Rule docs**: `08-adventuring.md`

**Status**: Completed

- [x] Calendar tab renamed to Adventuring tab (Calendar.tsx -> Adventuring.tsx)
- [x] Condition trackers: Exhaustion (0-4, shows -N Attack & Damage), Hunger Days, Thirst Days, Travel Days w/o Rest (0-6 with warning and Rest Day button)
- [x] Hunger/thirst effects auto-lookup by creature type (Mortal/Demi-Fey vs Fairy tables)
- [x] Ration tracking: Fresh and Preserved counters with season-aware foraging yield reference
- [x] Travel Point tracker: +/- counter with Reset button, forced march toggle (1.5x TP), collapsible terrain cost reference table (8 terrain types)
- [x] Light source tracking: Add Torch (60min)/Lantern (240min)/Candle (60min), per-source timer with -10/-1/+1/+10 controls, burned-out sources highlighted in red
- [x] Camping calculator: ephemeral fire/bedding radio buttons, auto-calculated sleep difficulty from 24-combo matrix (2 fire x 3 bedding x 4 season), color-coded result (green/yellow/orange/red), camp activities reference, collapsible full sleep matrix
- [x] Reference tables: collapsible healing rates (7 methods) and hunger/thirst effect tables (mortal + fairy)
- [x] Schema migration v5→v6 for 8 new Character fields (exhaustionLevel, hungerDays, thirstDays, rations, activeLightSources, travelDaysWithoutRest, forcedMarchActive, travelPointsRemaining)
- **Design decisions**: No auto-advancing (manual counters match HP/spell slot pattern), no dice roller (reference only), camping state ephemeral (not persisted)

---

## Phase 8: Reference & Flavor

**Goal**: In-app reference panels for game world information.

**Rule docs**: `09-appendices.md`, `06-equipment.md`

- [ ] Calendar display with month names, festivals, moon phases, and Wysenday tracking
- [ ] Noble houses reference (for Knights -- alignment, seat, head)
- [ ] Religion reference (4 faiths with brief descriptions)
- [ ] Beverage catalog with effects and prices
- [ ] Herb/fungi catalog with effects, prices, and availability
- [ ] Pipeleaf catalog with effects and prices
- [ ] Food menu reference (poor/common/fancy)

---

## Phase 9: Advanced Features

**Goal**: Complex class/kindred-specific mechanics.

**Rule docs**: `02-kindreds.md`, `03-classes.md`, `04-kindred-classes.md`

- [ ] Retainer management (max from CHA, Loyalty tracking, morale, hiring reactions)
- [ ] Breggle horn progression display and Gaze tracking (uses/day)
- [ ] Grimalkin form-shifting state tracking (estray/chester/wilder, wilder 1x/day)
- [ ] Woodgrue Mad Revelry melody selection and usage tracking (1x/day/level)
- [ ] Hunter Trophy system (creature type bonuses)
- [ ] Hunter Animal Companion tracking
- [ ] Knight Chivalric Code reference and Liege/House selection
- [ ] Fighter Combat Talent selection (at levels 2, 6, 10, 14)
- [ ] Cleric Holy Order selection and bonuses (St Faxis, St Sedge, St Signis)
- [ ] Mossling Symbiotic Flesh trait accumulation (d20 per level)
- [ ] Mossling Fungal Symbiosis tracking (Level 4+)
- [ ] Turning the Undead calculator (Clerics and Friars)

---

## Cross-Reference: Phase to Rule Doc

| Phase | Primary Rule Docs |
|-------|------------------|
| 1 | `03-classes.md`, `04-kindred-classes.md` |
| 2 | `01-character-creation.md`, `02-kindreds.md` |
| 3 | `07-combat.md`, `03-classes.md`, `08-adventuring.md` |
| 4 | `03-classes.md`, `02-kindreds.md`, `04-kindred-classes.md` |
| 5 | `05-magic.md`, `03-classes.md` |
| 6 | `06-equipment.md`, `08-adventuring.md` |
| 7 | `08-adventuring.md` |
| 8 | `09-appendices.md`, `06-equipment.md` |
| 9 | `02-kindreds.md`, `03-classes.md`, `04-kindred-classes.md` |
