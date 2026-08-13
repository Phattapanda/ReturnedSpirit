#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK
#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# ==================== AGENT UPDATE ====================
# BUGFIX-ITERATION 20: Slot-Regeln im Kitchen DnD System
# GEÄNDERTE DATEIEN: frontend/app/kitchen.tsx
#
# 1. craftSlots Array von Array(3) auf Array(4) initialisiert (Tool-Slot korrekt belegt)
# 2. craftIngSlotsRef + craftToolRef Refs hinzugefügt (stabile Gesture liest immer aktuelle Werte)
# 3. Sync-Effects: craftIngSlotsRef ← craftIngSlots, craftToolRef ← craftTool
# 4. cookingTablePanGesture.onUpdate: Quell-Slot-Erkennung auf Craft (12-14) + Tool (15) erweitert;
#    Item-Typ-Whitelist ["herbs","bucketwater","oldpot"] ENTFERNT
# 5. onCookingDragStarted: Layout-Lookup auf craftSlots[i-12] und craftSlots[3] erweitert
# 6. updateCookingHoveredSlot: srcSlot wird jetzt auch aus Craft/Tool-Slot-Checks ausgeschlossen
# 7. handleCookingItemDrop KOMPLETT NEU: Swap-Logik für alle Quell↔Ziel-Kombinationen
#    (Table↔Craft, Craft↔Tool, Table↔Tool, Craft↔Craft, Table↔Table)
#    Kein "No free space" mehr für besetzte Slots – Items werden geswappt.
#    Kein "Not the right place" – alle Input-Slots akzeptieren jedes Item.
#    Result-Slot (16) ist kein gültiges Drop-Ziel (nicht in lcs-Array).
# 8. isDraggable in renderTableItemInSlot: ts === "COOKING_CRAFT_READY" (keine Whitelist mehr)
# 9. JSX-Umstrukturierung: Craft-Grid + Table-Grid beide in GestureDetector wenn COOKING_CRAFT_READY
#    (IIFE-Pattern: craftGrid + tableGrid in gemeinsamer View unter GestureDetector).
#    Craft-Items werden während Drag ausgeblendet (cookingDragActiveSlot).
# STATUS: Lint clean, Expo restarted
# ==================== AGENT UPDATE ====================
# BUGFIX-ITERATION 19: 6 Kitchen/Status/Crafting Bugs
# GEÄNDERTE DATEIEN: frontend/app/kitchen.tsx
#
# Bug 1 (Stamina-Balken): staminaMax = 100 (hardcoded) → staminaMaxSV (Shared Value,
#   initial = DEFAULT_PLAYER_STATS.maximumStamina). Synced via useEffect when
#   playerStats.maximumStamina changes. onStatsUpdated callback also updates staminaMaxSV.
#   Text display: {staminaDisplay}/{playerStats.maximumStamina}. Load/focusEffect now
#   use loadedMaxStamina variable instead of hardcoded 100.
#
# Bug 2 (Pulse entfernt): unpackAnimStyle removed entirely (was useAnimatedStyle).
#   Animated.View in renderTableItemInSlot replaced with plain View. isNew variable removed.
#
# Bug 3 (bucketwater Tooltip): handleCookingTableTap() now handles ALL items in cooking
#   phase (not just herbbag). Falls through to ITEM_CATALOG lookup for generic tooltip.
#
# Bug 4 (Herbs splitting): Added selectedHerbsSlot state. First tap: select + tooltip.
#   Second tap: split 1 herb from stack into free table slot. SPLIT badge shown on selected
#   herbs. Green highlight border (#7EC87E). audioManager.playSoundEffect('moveitem').
#
# Bug 5 (Rezept 2:1): updateCraftResultPreview() rewritten. Only accepts
#   herbsQty === bucketwaterQty * 2 (e.g. 2:1, 4:2). 3 herbs + 1 bucketwater rejected.
#   craftResult.quantity = herbsQty (= bucketwaterQty * 2).
#
# Bug 6 (Ein Stack): handleCraft() rewritten. ONE herbsoup stack (quantity=herbsoupQty),
#   ONE bucket stack (quantity=bucketwaterCount). No more two separate herbsoup x1 stacks.
#   Added "COOKING_CRAFT_DONE" to TState union.
# STATUS: Lint clean, Expo restarted
# ==================== AGENT UPDATE ====================
# BUGFIX: Cooking Tutorial startet nicht ohne Bag-Öffnen im Garten
# CHANGES:
#   kitchen.tsx:
#     - useFocusEffect: Fallback-Inventar-Erkennung hinzugefügt
#       Wenn CRAFTING_READY nicht gesetzt ist, wird direkt aus AsyncStorage geprüft:
#       hasHarvested + hasFetchedWater + herbbag + bucketwater in Bag
#       → CRAFTING_READY wird automatisch gesetzt (unabhängig von Bag-Open-Event)
#     - Initialer useEffect: Gleiche Prüfung beim App-Start / Save-Load
#       Damit startet das Tutorial auch nach App-Neustart ohne erneutes Garten-Navigieren
# GETESTETE SZENARIOS:
#   - Player hat herbbag+bucketwater, kommt via Android-Zurück-Button → Tutorial startet
#   - Player öffnet App neu, lädt Save mit den Items → Tutorial startet
#   - Player kommt normal über Kitchen-Button im Garten → wie bisher
# STATUS: Lint-geprüft, Expo neugestartet, User-Verifizierung ausstehend

# ==================== AGENT UPDATE ====================
# COOKING TUTORIAL (Tag 2)
# CHANGES:
#   kitchen.tsx:
#     - New TState values: COOKING_UNPACK_WAIT, OLDPOT_FLYING, COOKING_CRAFT_READY,
#       COOKING_SHARE_EAT, COOKING_DONE
#     - New SK keys: COOKING_DONE, COOKING_STEP, CRAFT_INGREDIENTS, CRAFT_TOOL_SLOT
#     - HERB_SOUP_RECIPE constant: 2×herbs + 1×bucketwater + oldpot → 2×herbsoup + 1×bucket
#     - IMG.oldpot + ITEM_IMAGES.oldpot added
#     - Cooking tutorial state variables: craftIngSlots, craftTool, craftResult, etc.
#     - startCookingTutorial(), checkCookingProgress() functions
#     - flyOldpotToTable() / onOldpotLanded() / placeOldpotOnTable() functions
#     - unpackOneHerb() for container-unpack from herbbag on table
#     - moveToCraftArea() / returnCraftIngToTable() / returnCraftToolToTable()
#     - updateCraftResultPreview() - computed from craft slot contents
#     - handleCraft() - atomic craft with cookingpot.mp3 SFX + rapid-click protection
#     - onCookingShareWithRupert() / onCookingEatSoup() / finishCookingTutorial()
#     - handleDrop() updated for COOKING_SHARE_EAT state
#     - tutInteractable now includes COOKING_SHARE_EAT
#     - renderTableItemInSlot updated with cooking tap logic + herbbag selection highlight
#     - BagIconButton pulsing={bagPulseActive} during COOKING_UNPACK_WAIT
#     - Craft grid updated: ingredient slots / tool slot / result preview / CRAFT button
#     - Flying item uses flyingItemId (herbsoup or oldpot)
#     - Menu accessible during cooking tutorial states
#   item-system.ts: Added oldpot to ITEM_CATALOG
#   save-manager.ts: Added COOKING_DONE, COOKING_STEP, CRAFT_INGREDIENTS, CRAFT_TOOL_SLOT keys
#   PlayerBag.tsx: Kitchen hint now 2 lines including "Long press for details."
# ======================================================

user_problem_statement: |
  BUGFIX-PATCH: SHOULDER BAG, ITEMINFORMATION, AUSPACKEN UND ITEMATTRIBUTE
  1. BAG → "SHOULDER BAG" umbenennen (nur Display, interne IDs bag1/playerBag bleiben)
  2. Long Press: Detailinformation PERSISTENT — schließt NICHT beim Loslassen, nur durch neuen Tap
  3. Kurze Beschreibung (Kitchen Tap auf Table Slot) vs. Detailinformation (Long Press überall)
  4. Context-Tap im Bag: Kitchen=Auspacken, Garden=Wegwerf-Abfrage, Dormitory=Storage
  5. Kitchen Unpack: Bag-Item → Table Slots (kompatible Stacks zuerst, dann freie Slots)
  6. Bounce-Animation beim Auspacken
  7. Garden Wegwerfschutz bis TH (dayIdx ≤ 3): "We still need it." Thought Bubble
  8. Item Attribute: herbsoup=edible, herbs=ingredient, bucket=vessel, bucketwater=ingredient
  9. Attribute in Detailinfo-Modal anzeigen
  10. @kitchen:table_items in Save-Manager-Snapshot

frontend:
  - task: "Shoulder Bag rename (display only)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/PlayerBag.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "Long press persistent modal (fix: doesn't close on release)"
    implemented: true
    working: "NA"
    file: "frontend/src/components/PlayerBag.tsx"
    stuck_count: 0
    priority: "critical"
    needs_retesting: true

  - task: "Item attributes in ITEM_CATALOG + BagItem type"
    implemented: true
    working: "NA"
    file: "frontend/src/game/item-system.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "Attributes shown in detail modal"
    implemented: true
    working: "NA"
    file: "frontend/src/components/PlayerBag.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "Kitchen unpack: bag tap → tableItems state + AsyncStorage"
    implemented: true
    working: "NA"
    file: "frontend/app/kitchen.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "Kitchen table item bounce animation on unpack"
    implemented: true
    working: "NA"
    file: "frontend/app/kitchen.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true

  - task: "Long press on kitchen table items → detail modal"
    implemented: true
    working: "NA"
    file: "frontend/app/kitchen.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true

  - task: "Garden discard dialog (tap bag item in garden) – every tap must open dialog"
    implemented: true
    working: "needs_testing"
    file: "frontend/src/components/PlayerBag.tsx"
    stuck_count: 0
    priority: "critical"
    needs_retesting: true

  - task: "ActivityBar icons: PNG images (well/wood/stone/workout2)"
    implemented: true
    working: "needs_testing"
    file: "frontend/src/components/ActivityBar.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "StatusModal: 10 Growth Points needed hint"
    implemented: true
    working: "needs_testing"
    file: "frontend/src/components/StatusModal.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true

  - task: "Collect Wood/Stone: single-action lock, wood.png/stone.png +1 float reward"
    implemented: true
    working: "needs_testing"
    file: "frontend/app/garden.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "@kitchen:table_items in save-manager snapshot"
    implemented: true
    working: "NA"
    file: "frontend/src/game/save-manager.ts"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true

metadata:
  created_by: "main_agent"
  version: "3.0"
  test_sequence: 18
  run_ui: true

agent_communication:
  - agent: "main"
    message: |
      Iteration 18 – Shoulder Bag / Item Attributes / Kitchen Unpack / Garden Discard.

      GEÄNDERTE DATEIEN:
      - item-system.ts: attributes-Feld in BagItem-Typ; ITEM_CATALOG mit attributes; herbsoup+herbs hinzugefügt; KITCHEN_TABLE_KEY exportiert
      - PlayerBag.tsx: komplett neu geschrieben — "Shoulder Bag" Titel; longPressTriggered-Ref verhindert Close beim Release; Attribute in Detail-Modal; Discard-Dialog für garden/none Context; onDiscardItem + onShowThoughtBubble Props; discardLocked (dayIdx ≤ 3)
      - kitchen.tsx: tableItems-State; handleBagToTable(); renderTableItemInSlot(); unpackScale Bounce-Animation; soupLongPress-Geste; ITEM_IMAGES-Map; kitchenDetailItem-Modal; detailPanel-Styles; tableItemQty-Style; withSpring Import
      - garden.tsx: dayIdx + onDiscardItem + onShowThoughtBubble Props an PlayerBag übergeben
      - save-manager.ts: @kitchen:table_items in ALL_SNAPSHOT_KEYS

      TEST 1 – "Shoulder Bag" Titel:
      Bag öffnen → Fenstertitel lautet "Shoulder Bag". Interne IDs bag1/playerBag unverändert.

      TEST 2 – Long Press Persistenz:
      Item im Bag 500ms gedrückt halten → Detailmodal öffnet sich.
      Finger loslassen → Modal bleibt offen.
      Neuer Tap → Modal schließt sich.

      TEST 3 – Attribute in Detailinfo:
      Long Press auf herbsoup → Modal zeigt "Attributes: Edible".
      Long Press auf herbs → "Attributes: Ingredient".
      Long Press auf bucket → "Attributes: Vessel".
      Long Press auf bucketwater → "Attributes: Ingredient".

      TEST 4 – Kitchen Tap Auspacken:
      Bag-Item in Kitchen antippen → Item wird aus Bag entfernt und in freiem Table Slot platziert (Bounce-Animation). Kompatible Stacks werden zuerst aufgefüllt. Kein Platz → "No free space available."

      TEST 5 – Garden Discard Dialog:
      Bag-Item im Garden antippen → "You can't unpack anything here. Do you want to throw it away?"
      "No" → Dialog schließt, nichts geändert.
      "Yes" während TH-Schutz (dayIdx ≤ 3) → "We still need it." Thought Bubble; Item bleibt.
      "Yes" nach TH → Item wird aus Bag entfernt.

      TEST 6 – Long Press Kitchen Table:
      Auf herbsoup im Table Slot 500ms halten → Detailmodal erscheint.
      Tap schließt Modal.

      TEST 7 – App startet ohne Absturz auf localhost:3000.

  1. SAVE-SYSTEM: Gameplay-State nur bei 2 Triggern persistieren:
     a) saveAfterDayTransition() — nach vollständigem Schlaf/Tageswechsel
     b) saveManuallyFromMenu()  — in kitchen, garden, dormitory
     c) Kein Autosave bei Garden-Aktionen, Navigation, Dialog, Transfer, Leave/Reload
     d) Beim Laden: restoreFromSnapshot() stellt letzten Checkpoint wieder her
     e) "Main Menu" — discardRuntimeAndRestore() vor Navigation
     f) Dev-Logs: SAVE TRIGGER: DAY TRANSITION / MANUAL MENU SAVE / LOAD SAVE SLOT / DISCARD UNSAVED RUNTIME STATE
  
  2. HERBBAG-ANIMATION: Sichtbare Fluganimation beim Ernten
     a) useEffect-basierter Start NACH React-Re-Render (verhindert unsichtbaren Start)
     b) Animated.View immer gerendert (kein conditional render)
     c) Crop shrink → herbbag erscheint → fliegt zum Bag → shrink/fade → commit
  
  3. SOUP-DEMO-FLAG pro Save-Slot (nicht global)
     a) @kitchen:soup_demo_seen in Snapshot aufgenommen
     b) neuer Slot: false → Demo einmal sichtbar
     c) reload desselben Slots: flag aus Snapshot → keine erneute Demo
     d) Flag wird erst NACH Layout-Check gesetzt (nicht bei abgebrochenem Render)
  
  4. FLOATING-EFFEKTE verlangsamt:
     durationMs: 2200, riseDistancePx: 32, fadeInMs: 200, fadeOutMs: 400
     Betrifft: Regen +X/Life, Stamina-Kosten, No-free-space, Garden-Floats

backend:
  - task: "FastAPI backend"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false

frontend:
  - task: "Save-System: createSnapshot / restoreFromSnapshot / discardRuntimeAndRestore"
    implemented: true
    working: "NA"
    file: "frontend/src/game/save-manager.ts, frontend/app/load-game.tsx, frontend/app/new-game.tsx"
    stuck_count: 0
    priority: "critical"
    needs_retesting: true

  - task: "Day-Transition-Save (processDayAndWake → createSnapshot)"
    implemented: true
    working: "NA"
    file: "frontend/app/dormitory.tsx"
    stuck_count: 0
    priority: "critical"
    needs_retesting: true

  - task: "Manual Save in all rooms (createSnapshot)"
    implemented: true
    working: "NA"
    file: "frontend/app/kitchen.tsx, frontend/app/garden.tsx, frontend/app/dormitory.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "Main Menu → discardRuntimeAndRestore"
    implemented: true
    working: "NA"
    file: "frontend/app/kitchen.tsx, frontend/app/garden.tsx, frontend/app/dormitory.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "Herbbag-Animation fix (useEffect + always-render Animated.View)"
    implemented: true
    working: "NA"
    file: "frontend/app/garden.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true

  - task: "Soup-Demo-Flag per Slot (snapshot + layout-check guard)"
    implemented: true
    working: "NA"
    file: "frontend/app/kitchen.tsx, frontend/src/game/save-manager.ts"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true

  - task: "Floating-Effekte verlangsamt (2200ms, rise 32px)"
    implemented: true
    working: "NA"
    file: "frontend/app/garden.tsx, frontend/app/kitchen.tsx, frontend/app/dormitory.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 17
  run_ui: true

test_plan:
  current_focus:
    - "Save-Checkpoint: Garden-Aktion ohne Save → Reload → Aktion weg"
    - "Manual Save → nach unsaved Änderung Reload → Snapshot korrekt"
    - "Sleep → neuer Morgen nach Reload"
    - "Herbbag-Animation sichtbar"
    - "Soup-Demo-Flag pro neuen Slot"
    - "Floating-Effekte langsamer/länger"
    - "Main Menu discard runtime"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Iteration 17 – CRITICAL BUGFIX PATCH: Save-Checkpoints, Herbbag-Animation, Floating-Effekte.

      NEUE DATEIEN:
      - /app/frontend/src/game/save-manager.ts — Zentrale Snapshot-Logik

      GEÄNDERTE DATEIEN:
      - load-game.tsx: handleLoad() ruft restoreFromSnapshot() auf; handleDelete() räumt Snapshot auf
      - new-game.tsx: multiRemove inkl. @kitchen:soup_demo_seen + @game:logbook; danach createSnapshot("new_game")
      - dormitory.tsx: processDayAndWake → createSnapshot("day_transition") nach updateSaveSlot; handleManualSave → createSnapshot("manual"); handleMainMenu → discardRuntimeAndRestore; Regen-Floats: 2200ms/32px
      - kitchen.tsx: handleManualSave → createSnapshot("manual"); handleMainMenu → discardRuntimeAndRestore; Soup-Demo-Flag: erst nach Layout-Check gesetzt; FLOAT_MS: 2200ms
      - garden.tsx: handleManualSave → createSnapshot("manual"); handleMainMenu → discardRuntimeAndRestore; startFlyAnim: useEffect-basiert + always-render Animated.View; FLOAT_MS: 2200ms

      TEST 1 – Save-Checkpoint:
      Neue Partie starten, Garden betreten, "Water" drücken, direkt zur Hauptseite gehen
      ("Main Menu" im Menü), Slot erneut laden → Bewässerung sollte weg sein.
      
      TEST 2 – Manual-Save-Checkpoint:
      Starten, Kitchen "Save" drücken, dann Garden betreten, "Water" drücken,
      "Main Menu" → Slot laden → Garten soll ungewässert sein (letzter manueller Save war vor dem Garten).

      TEST 3 – Day-Transition-Save:
      Bewässern, schlafen, Slot laden → Bewässerung und neuer Tag persistent.

      TEST 4 – Herbbag-Animation:
      Bis Tutorial-Ernte-Schritt spielen: Ernte drücken → sichtbare Fluganimation
      (Herbbag-Bild fliegt von der Pflanze zum Bag-Icon).

      TEST 5 – Soup-Demo pro Slot:
      Slot 1 auf Day 2 spielen (Suppe demonstriert) → Slot 2 neu starten →
      Soup-Demo erscheint wieder für Slot 2. Slot 1 laden → keine Demo.

      TEST 6 – Floating langsamer:
      Garden-Aktion: Kosten-Float ca. 2,2 Sekunden sichtbar.
      Regen nach Schlafen: +X-Float langsamer.

      TEST 7 – Main Menu discard:
      Garden-Aktion ohne Save → "Main Menu" → sofort Slot laden →
      Aktion wurde nicht gespeichert (Snapshot-Restore hat runtime verworfen).
