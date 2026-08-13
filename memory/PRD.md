# A Returned Spirit – Tavern Crafting RPG

## Original Problem Statement
Expo/React Native RPG game mit:
- Asset-Bilder (Portraits, Items) werden in Expo Go auf Android nicht geladen
- Hauptmenü-Musik spielt nur beim Zurückkehren, nicht beim ersten Start
- Tag-2-Garden Patch: Bag Discard-Dialog, Activity Icons, Growth Points Hint, Wood/Stone Rewards
- Kitchen Unpack Bug: Items verschwanden statt in Table-Slots zu erscheinen
- Day 2 Cooking Tutorial: Vollständiger Koch-Flow von Bag-Auspacken bis Suppe teilen/essen

## Architecture
- Frontend: Expo Router + React Native (TypeScript)
- Backend: FastAPI + MongoDB
- Audio: expo-audio (AudioEngine Singleton)
- Assets: React Native Image mit resizeMethod="resize" (expo-image entfernt – OOM auf Android)
- Images: react-native Image (vom Nutzer auf Expo Go bestätigt)

## What's Been Implemented

### Session 6 (Feb 2026) – DND SLOT-REGEL PATCH
- **kitchen.tsx**: Alle Item-Typ-Beschränkungen im Kitchen DnD entfernt. Jedes Item darf in jeden Input-Slot (Table, Craft Ingredient, Tool). Atomic-Swap-Logik für alle Quell↔Ziel-Kombinationen. JSX-Umstrukturierung: GestureDetector wraps jetzt Craft+Table-Grid zusammen. Item-Whitelist aus isDraggable und Gesture-onUpdate entfernt. Result-Slot bleibt Output-only (kein Highlight, kein Drop-Ziel). Kein "Not the right place" mehr.

### Session 5 (Feb 2026) – 6 KITCHEN/STATUS/CRAFTING BUGFIXES
- **kitchen.tsx**: 6 gezielte Bugfixes:
  1. **Stamina-Balken**: `staminaMax = 100` (hardcoded) ersetzt durch `staminaMaxSV` (Shared Value). Synced via `useEffect` auf `playerStats.maximumStamina`. `onStatsUpdated` callback aktualisiert `staminaMaxSV`. Load/FocusEffect verwenden `loadedMaxStamina` statt 100.
  2. **Pulse entfernt**: `unpackAnimStyle` (useAnimatedStyle) entfernt. `Animated.View` in `renderTableItemInSlot` durch normales `View` ersetzt. `isNew` Variable entfernt.
  3. **bucketwater Tooltip**: `handleCookingTableTap()` behandelt nun ALLE Items in Koch-Phase — ITEM_CATALOG-Lookup als Fallback für Generic-Tooltip.
  4. **Herbs-Split**: `selectedHerbsSlot` State hinzugefügt. Erstes Tap: Auswahl + Tooltip + grüner Border + SPLIT-Badge. Zweites Tap: 1 Herb in freien Table-Slot auslagern.
  5. **Rezept 2:1**: `updateCraftResultPreview()` neu: `ratioValid = herbsQty === bucketwaterQty * 2`. 3 herbs + 1 bucketwater → kein Ergebnis.
  6. **Ein Stack**: `handleCraft()` erzeugt EIN herbsoup-Stack (quantity = bucketwaterCount × 2) + EIN bucket-Stack. Kein doppeltes herbsoup x1 mehr.
  - Bonus: `"COOKING_CRAFT_DONE"` zur TState Union hinzugefügt.
  - **Testing Agent Fix**: `layouts` Refs von nach-useMemo auf vor-useMemo verschoben → „Cannot access layouts before initialization" Crash behoben.

### Session 4 (Feb 2026) – COOKING TUTORIAL (Tag 2)
- **kitchen.tsx**: Vollständiges Cooking Tutorial implementiert:
  - TState: COOKING_UNPACK_WAIT, OLDPOT_FLYING, COOKING_CRAFT_READY, COOKING_SHARE_EAT, COOKING_DONE
  - SK Keys: COOKING_DONE, COOKING_STEP, CRAFT_INGREDIENTS, CRAFT_TOOL_SLOT
  - HERB_SOUP_RECIPE: 2×herbs + 1×bucketwater + oldpot → 2×herbsoup + 1×bucket
  - IMG.oldpot + ITEM_IMAGES.oldpot für neues Item
  - startCookingTutorial(): Bag pulsiert, Navigation gesperrt
  - checkCookingProgress(): Trigger wenn 2×herbs + bucketwater auf Tisch
  - flyOldpotToTable(): Rupert schmeißt oldpot per Flying-Item-Animation auf Tisch
  - unpackOneHerb(): Container-Auspacken (herbbag → herbs, 1 per Tap)
  - moveToCraftArea() / returnCraftIngToTable() / returnCraftToolToTable()
  - updateCraftResultPreview(): Rezept-Preview im Result-Slot
  - handleCraft(): Atomare Craft-Transaktion + cookingpot.mp3 + Rapid-Click-Schutz
  - onCookingShareWithRupert() / onCookingEatSoup() / finishCookingTutorial()
  - handleDrop() erweitert für COOKING_SHARE_EAT
  - renderTableItemInSlot: Herbbag-Selektion (TAP-Badge), Koch-Tap-Logik
  - Craft-Grid aktualisiert: Ingredient-Slots zeigen craftIngSlots, Tool-Slot zeigt craftTool
  - BagIconButton pulsing={bagPulseActive} – hört auf nach erstem Öffnen
  - Menü zugänglich während Koch-Tutorial
  - Save/Restore via COOKING_STEP key
- **item-system.ts**: oldpot zu ITEM_CATALOG hinzugefügt
- **save-manager.ts**: 4 neue Keys im Snapshot (COOKING_DONE, COOKING_STEP, CRAFT_INGREDIENTS, CRAFT_TOOL_SLOT)
- **PlayerBag.tsx**: Kitchen-Hint 2-zeilig: "Tap item to unpack to table.\nLong press for details."

### Session 3 (Feb 2026) – TAG-2-GARDEN PATCH + Kitchen Unpack Fix
- **PlayerBag.tsx**: Bag Discard-Dialog öffnet bei JEDEM Tap. Manueller Timer ersetzt durch Pressable.onLongPress. Einzelne `longPressDidFire`-Ref. TH-Schutz aktiv.
- **ActivityBar.tsx**: PNG Icons (well.png / wood.png / stone.png / workout2.png) statt Ionicons.
- **StatusModal.tsx**: „10 Growth Points needed." Hinweis unter Growth Points.
- **garden.tsx**: woodLocked/stoneLocked Refs verhindern Doppel-Rewards; triggerActionFlash mit plusText (grünes „+1"); wood.png/stone.png in IMG-Map.
- **kitchen.tsx**: Kitchen Unpack Bug behoben – `Animated.View` in `renderTableItemInSlot` erhielt `width:"100%", height:"100%"` → Yoga Zero-Size-Kollaps behoben. Items erscheinen korrekt in Table-Slots.

### Session 2 (Feb 2026) – Asset Fix + Audio Fix
- Hauptmenü-Musik beim ersten Start gefixt (audioManager.unlockAudio in index.tsx)
- Android OOM gefixt mit resizeMethod="resize" auf allen Image-Komponenten
- Kleinere Assets: Hintergründe als JPG, Portraits ~500 KB
- Zurück auf RN Image + Image.prefetch (vom Nutzer bestätigt)

### Session 1 (Jan 2026) – MVP
- Vollständiges RPG: Intro, Kitchen, Garden, Dormitory Screens
- AssetManager Preloading, AudioEngine, PlayerBag, GardenPlot, ActivityBar, StatusModal
- SharedResourceStorage, player-stats, activity-config

## Offene Aufgaben (Backlog)
- Growth Points Anzeige im Dormitory
- Weitere Game-Content / Tag-3+ Patches
- Day 3 Tutorial oder freies Spielen
