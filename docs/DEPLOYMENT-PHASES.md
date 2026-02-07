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

## Phase 3: Combat & Derived Stats

**Goal**: Auto-calculate combat-relevant values from character data.

**Rule docs**: `07-combat.md`, `03-classes.md`, `08-adventuring.md`

- [ ] AC calculation: base 10 + armour + shield + DEX mod + kindred bonuses (Breggle fur +1, Small +2 vs Large) + class bonuses (Friar Armour of Faith)
- [ ] Attack bonus from class advancement table (auto-lookup by class + level)
- [ ] All 5 save targets from class advancement table (auto-lookup by class + level)
- [ ] Magic Resistance display (WIS mod + kindred MR: Elf +2, Grimalkin +2)
- [ ] Speed calculation from encumbrance method (weight-based or slot-based)
- [ ] Travel Points display (Speed / 5)
- [ ] Melee attack modifier display (Attack bonus + STR mod)
- [ ] Missile attack modifier display (Attack bonus + DEX mod + Hunter +1)
- [ ] XP to next level from advancement table

---

## Phase 4: Skills System

**Goal**: Display and track skill targets with class-specific progression.

**Rule docs**: `03-classes.md`, `02-kindreds.md`, `04-kindred-classes.md`

- [ ] Base skills: Listen (default 6), Search (default 6), Survival (default 6)
- [ ] Kindred skill overrides: Elf Listen 5/Search 5, Grimalkin Listen 5, Mossling Survival 5, Woodgrue Listen 5
- [ ] Class skill tables with level progression:
  - Bard: Decipher, Listen, Monster Lore, Legerdemain
  - Cleric: Exorcism (turning undead)
  - Enchanter: Detect Magic
  - Fighter: none extra
  - Friar: Survival (foraging) 5
  - Hunter: Alertness, Stalking, Survival, Tracking
  - Knight: none extra
  - Magician: Detect Magic
  - Thief: Climb Wall, Decipher, Disarm Mechanism, Legerdemain, Listen, Pick Lock, Search, Stealth
- [ ] Kindred-class unique skills: Elf Detect Magic, Grimalkin Pick Lock, Woodgrue Stealth
- [ ] Expertise points tracking (where applicable)

---

## Phase 5: Magic System

**Goal**: Track spell slots, memorization, glamours, runes, and knacks.

**Rule docs**: `05-magic.md`, `03-classes.md`, `04-kindred-classes.md`

- [ ] Spells per day tracking by class and level (Cleric R1-5, Friar R1-5, Magician R1-6, Breggle R1-5)
- [ ] Spell memorization slots display
- [ ] Spell list reference (72 arcane, 34 holy -- names and ranks)
- [ ] Glamour tracking: count by class/kindred level, randomly determined
- [ ] Glamour list reference (20 glamours with descriptions)
- [ ] Fairy Rune tracking: lesser/greater/mighty with usage frequency by level range
- [ ] Rune list reference (18 runes across 3 magnitudes)
- [ ] Mossling Knack system: 1 knack, 4 advancement tiers at L1/3/5/7
- [ ] Holy spell saint associations (for reference)
- [ ] Magician starting spell book selection (6 options, 3 Rank 1 spells each)
- [ ] Enchanter/Elf resistance to divine aid (2-in-6 flag)

---

## Phase 6: Inventory & Encumbrance

**Goal**: Full equipment management with dual encumbrance systems.

**Rule docs**: `06-equipment.md`, `08-adventuring.md`

- [ ] Full equipment catalog with prices and weights (from `06-equipment.md`)
- [ ] Dual encumbrance system toggle (Weight-based vs Slot-based)
- [ ] Weight system: auto-calculate total coins weight, Speed lookup
- [ ] Slot system: equipped slots (max 10) vs stowed slots (max 16), Speed lookup
- [ ] Coin management (4 types with conversion rates: 1pp=5gp=50sp=500cp)
- [ ] Container capacity tracking (backpack 400 coins, sack 600 coins, belt pouch 50 coins)
- [ ] Auto-calculate Speed from encumbrance
- [ ] Auto-calculate Travel Points from Speed

---

## Phase 7: Adventuring Features

**Goal**: Travel, camping, and survival tracking.

**Rule docs**: `08-adventuring.md`

- [ ] Travel Point calculator (Speed-based, terrain cost lookup)
- [ ] Camping system (fire + bedding + season = sleep difficulty matrix)
- [ ] Rest and healing tracker (1 HP/good rest, 1d3 HP/full day in settlement)
- [ ] Exhaustion counter (cumulative -1 to -4)
- [ ] Ration tracking (fresh vs preserved, duration by conditions)
- [ ] Light source duration tracking (torch 1hr, lantern 4hr/flask, candle 1hr)
- [ ] Hunger/thirst day counter with effect lookup

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
