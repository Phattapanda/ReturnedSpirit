from pathlib import Path

path = Path("frontend/app/kitchen.tsx")
text = path.read_text()


def replace_between(start: str, end: str, replacement: str, label: str) -> None:
    global text
    s = text.find(start)
    if s < 0:
        raise SystemExit(f"{label}: start marker not found")
    e = text.find(end, s)
    if e < 0:
        raise SystemExit(f"{label}: end marker not found")
    text = text[:s] + replacement + text[e:]


# 1) Make generic Cooking drag state-aware. Before the pot arrives, only Table↔Table
# is available. During crafting, all input slots are available. After crafting / in IDLE,
# normal items can still move between Table and Tool without re-enabling recipe crafting.
replace_between(
    '  /** Update hovered slot during cooking drag. Every Table/Craft/Tool input is valid. */\n',
    '  function onCookingDragCancelled() {\n',
    r'''  function isKitchenItemInteractionState(state: TState) {
    return state === "IDLE" ||
      state === "COOKING_UNPACK_WAIT" ||
      state === "COOKING_CRAFT_READY" ||
      state === "COOKING_SHARE_EAT" ||
      state === "COOKING_DONE";
  }

  function getCookingItemAtSlot(slot: number): BagItem | null {
    if (slot <= 11) return tableItemsRef.current[slot] ?? null;
    if (slot <= 14) return craftIngSlotsRef.current[slot - 12] ?? null;
    if (slot === 15) return craftToolRef.current;
    return null;
  }

  function showCookingItemDetails(slot: number) {
    const item = getCookingItemAtSlot(slot);
    if (item) setKitchenDetailItem({ ...item });
  }

  function handleCookingItemTap(slot: number) {
    const item = getCookingItemAtSlot(slot);
    if (!item) return;
    const cur = tsRef.current;
    const onTable = slot <= 11;

    // Herb Bag keeps its tutorial unpack behavior while ingredients are being prepared.
    // After crafting it behaves like a normal inspectable item instead of changing the tutorial.
    if (onTable && item.id === "herbbag" &&
        (cur === "COOKING_UNPACK_WAIT" || cur === "COOKING_CRAFT_READY")) {
      const remaining = item.containedQuantity ?? 0;
      if (selectedHerbbagSlot === null || selectedHerbbagSlot !== slot) {
        setSelectedHerbbagSlot(slot);
        setSelectedHerbsSlot(null);
        showCookingTooltip("Herb Bag", "Contains: " + remaining + (remaining === 1 ? " herb" : " herbs"));
      } else {
        unpackOneHerb(slot, item);
        const afterQty = remaining - 1;
        if (afterQty > 0) {
          showCookingTooltip("Herb Bag", "Contains: " + afterQty + (afterQty === 1 ? " herb" : " herbs"));
        } else {
          setTooltipVisible(false);
        }
      }
      return;
    }

    // Herbs use the same select-then-split interaction whenever they are on the Table.
    if (onTable && item.id === "herbs" && isKitchenItemInteractionState(cur)) {
      if (selectedHerbsSlot === null || selectedHerbsSlot !== slot) {
        setSelectedHerbsSlot(slot);
        setSelectedHerbbagSlot(null);
        showCookingTooltip(ITEM_CATALOG["herbs"].name, ITEM_CATALOG["herbs"].description);
      } else {
        if (item.quantity <= 1) {
          setSelectedHerbsSlot(null);
          setTooltipVisible(false);
          return;
        }
        const splitTable = tableItemsRef.current.slice();
        splitTable[slot] = { ...item, quantity: item.quantity - 1 };
        let splitPlaced = false;
        for (let si = 0; si < 12; si++) {
          if (si === slot) continue;
          if (!splitTable[si]) {
            splitTable[si] = { id: "herbs", itemType: "herbs", name: "Herbs", quantity: 1, attributes: ["ingredient"] };
            splitPlaced = true;
            break;
          }
        }
        if (!splitPlaced) { showPlayerBubble('"No free space available."'); return; }
        tableItemsRef.current = splitTable;
        setTableItems(splitTable);
        AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(splitTable)).catch(() => {});
        audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
        setSelectedHerbsSlot(null);
        setTooltipVisible(false);
        if (cur === "COOKING_UNPACK_WAIT") checkCookingProgress(splitTable);
      }
      return;
    }

    const catalogEntry = ITEM_CATALOG[item.id];
    if (item.id === "herbbag") {
      const remaining = item.containedQuantity ?? 0;
      showCookingTooltip("Herb Bag", "Contains: " + remaining + (remaining === 1 ? " herb" : " herbs"));
    } else if (catalogEntry) {
      showCookingTooltip(catalogEntry.name, catalogEntry.description);
    } else {
      showCookingTooltip(item.name, "");
    }
  }

  /** Update hovered slot during a generic kitchen item drag. */
  function updateCookingHoveredSlot(itemX: number, itemY: number) {
    const srcSlot = cookingDraggedSlotRef.current;
    const cur = tsRef.current;
    const lts = layouts.current.tableSlots;
    const lcs = layouts.current.craftSlots;
    let next: number | null = null;

    // Ingredient and Tool targets are only fully open while the recipe tutorial is active.
    if (cur === "COOKING_CRAFT_READY") {
      for (let i = 0; i < 3; i++) {
        if (12 + i === srcSlot) continue;
        if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { next = 12 + i; break; }
      }
    }
    // Once crafting is finished (and in normal Kitchen IDLE), the Tool slot remains a
    // normal movable slot, but ingredient slots do not silently re-enable crafting.
    if (next === null && cur !== "COOKING_UNPACK_WAIT" && srcSlot !== 15 &&
        lcs[3] && inRect(itemX, itemY, lcs[3]!)) {
      next = 15;
    }
    if (next === null) {
      for (let i = 0; i < lts.length; i++) {
        if (i === srcSlot) continue;
        if (lts[i] && inRect(itemX, itemY, lts[i]!)) { next = i; break; }
      }
    }
    if (next !== hoveredSlotRef.current) {
      hoveredSlotRef.current = next;
      setHoveredSlot(next);
    }
  }

  /** Begin a generic kitchen drag whose source slot is already known. */
  function onCookingDragStarted(slotIdx: number, itemId: string, absX: number, absY: number) {
    const cur = tsRef.current;
    if (!isKitchenItemInteractionState(cur)) return;
    if (cur === "COOKING_UNPACK_WAIT" && slotIdx > 11) return;

    cookingDraggedSlotRef.current = slotIdx;
    cookingDragItemIdRef.current = itemId;
    setCookingDragActiveSlot(slotIdx);
    setFlyingItemId(itemId);

    // Keep the source visible until React has committed the new overlay image.
    requestAnimationFrame(() => {
      if (cookingDraggedSlotRef.current !== slotIdx || !isKitchenItemInteractionState(tsRef.current)) return;
      setSoupDragging(true);
      soupVis.value = 1;
    });

    const slotRef = slotIdx <= 11
      ? tableSlotRefs.current[slotIdx]
      : craftSlotRefs.current[slotIdx === 15 ? 3 : slotIdx - 12];

    const applyOffset = (cx: number, cy: number) => {
      dragOffsetX.value = cx - absX;
      dragOffsetY.value = cy - absY;
      soupX.value = cx;
      soupY.value = cy;
    };

    if (slotRef) {
      slotRef.measureInWindow((x, y, w, h) => {
        if (w > 0) soupFlySize.value = w * 0.80;
        const rect = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
        if (slotIdx <= 11) layouts.current.tableSlots[slotIdx] = rect;
        else layouts.current.craftSlots[slotIdx === 15 ? 3 : slotIdx - 12] = rect;
        applyOffset(rect.cx!, rect.cy!);
      });
      return;
    }

    const cached = slotIdx <= 11
      ? layouts.current.tableSlots[slotIdx]
      : layouts.current.craftSlots[slotIdx === 15 ? 3 : slotIdx - 12];
    applyOffset(
      cached ? (cached.cx ?? cached.x + cached.w / 2) : absX,
      cached ? (cached.cy ?? cached.y + cached.h / 2) : absY,
    );
  }

''',
    "generic drag helpers",
)

# 2) Give every generic Kitchen item the same Pan + LongPress + Tap gesture.
replace_between(
    '  /**\n   * Per-item cooking pan gesture, intentionally mirroring the reliable Day-1 soup gesture:\n',
    '  /** Drop a cooking item. Source is supplied by the item\'s own GestureDetector. */\n',
    r'''  /**
   * Every generic Kitchen item uses the same interaction contract:
   * drag, long-press details, and short-tap item action/info.
   */
  function createCookingItemGesture(sourceSlot: number, itemId: string) {
    const itemTap = Gesture.Tap()
      .maxDeltaX(8).maxDeltaY(8)
      .onEnd(() => { runOnJS(handleCookingItemTap)(sourceSlot); });

    const itemLongPress = Gesture.LongPress()
      .minDuration(500)
      .onStart(() => { runOnJS(showCookingItemDetails)(sourceSlot); });

    const itemPan = Gesture.Pan()
      .minDistance(10)
      .onStart((e) => {
        cancelAnimation(soupX);
        cancelAnimation(soupY);
        cancelAnimation(soupVis);
        cancelAnimation(soupScale);
        // Keep the shared overlay hidden until JS has switched to this exact item.
        soupVis.value = 0;
        soupScale.value = 1;
        runOnJS(onCookingDragStarted)(sourceSlot, itemId, e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        const itemX = e.absoluteX + dragOffsetX.value;
        const itemY = e.absoluteY + dragOffsetY.value;
        soupX.value = itemX;
        soupY.value = itemY;
        runOnJS(updateCookingHoveredSlot)(itemX, itemY);
      })
      .onEnd((e) => {
        runOnJS(handleCookingItemDrop)(
          sourceSlot,
          e.absoluteX + dragOffsetX.value,
          e.absoluteY + dragOffsetY.value,
        );
      })
      .onFinalize((_, success) => {
        if (!success) {
          soupVis.value = withTiming(0, { duration: 100 });
          runOnJS(onCookingDragCancelled)();
        }
      });

    return Gesture.Race(itemPan, itemLongPress, itemTap);
  }

''',
    "unified item gesture",
)

# 3) Make drops state-aware rather than available only in COOKING_CRAFT_READY.
replace_between(
    '  /** Drop a cooking item. Source is supplied by the item\'s own GestureDetector. */\n',
    '  /** Called from worklet on oldpot landing. */\n',
    r'''  /** Drop a generic Kitchen item. Source is supplied by the item's own GestureDetector. */
  function handleCookingItemDrop(srcSlot: number, absX: number, absY: number) {
    cookingDraggedSlotRef.current = -1;
    cookingDragItemIdRef.current = "";
    setSoupDragging(false);
    setCookingDragActiveSlot(-1);
    setHoveredSlot(null);
    hoveredSlotRef.current = null;
    soupVis.value = withTiming(0, { duration: 100 });

    const cur = tsRef.current;
    if (!isKitchenItemInteractionState(cur)) return;
    if (cur === "COOKING_UNPACK_WAIT" && srcSlot > 11) return;

    const lcs = layouts.current.craftSlots;
    const lts = layouts.current.tableSlots;
    let destSlot = -1;

    // Only the active recipe phase opens Ingredient slots as destinations.
    if (cur === "COOKING_CRAFT_READY") {
      for (let i = 0; i < 3; i++) {
        if (lcs[i] && inRect(absX, absY, lcs[i]!)) { destSlot = 12 + i; break; }
      }
    }
    // Tool is available after Rupert introduces it, including after crafting / normal IDLE.
    if (destSlot < 0 && cur !== "COOKING_UNPACK_WAIT" && lcs[3] && inRect(absX, absY, lcs[3]!)) {
      destSlot = 15;
    }
    if (destSlot < 0) {
      for (let i = 0; i < lts.length; i++) {
        if (lts[i] && inRect(absX, absY, lts[i]!)) { destSlot = i; break; }
      }
    }

    if (destSlot < 0 || destSlot === srcSlot) return;

    const curTable = tableItemsRef.current;
    const curIng = craftIngSlotsRef.current;
    const curTool = craftToolRef.current;
    const getItem = (slot: number): BagItem | null => {
      if (slot <= 11) return curTable[slot];
      if (slot <= 14) return curIng[slot - 12];
      if (slot === 15) return curTool;
      return null;
    };

    const srcItem = getItem(srcSlot);
    if (!srcItem) return;
    const destItem = getItem(destSlot);

    const newTable = curTable.slice();
    const newIng = curIng.slice() as (BagItem | null)[];
    let newTool = curTool;

    if (srcSlot <= 11) newTable[srcSlot] = destItem;
    else if (srcSlot <= 14) newIng[srcSlot - 12] = destItem;
    else if (srcSlot === 15) newTool = destItem;

    if (destSlot <= 11) newTable[destSlot] = srcItem;
    else if (destSlot <= 14) newIng[destSlot - 12] = srcItem;
    else if (destSlot === 15) newTool = srcItem;

    tableItemsRef.current = newTable;
    craftIngSlotsRef.current = newIng;
    craftToolRef.current = newTool;

    setTableItems(newTable);
    setCraftIngSlots(newIng);
    setCraftTool(newTool);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(newIng)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(newTool)).catch(() => {});

    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    if (cur === "COOKING_CRAFT_READY") setTimeout(updateCraftResultPreview, 50);
    if (cur === "COOKING_UNPACK_WAIT") checkCookingProgress(newTable);
  }

''',
    "state-aware drop",
)

# 4) Replace the table renderer so all Cooking phases keep tap, long-press and drag.
replace_between(
    '  /** Render a non-soup item that was unpacked from the bag into this slot. */\n',
    '\n\n\n  return (\n',
    r'''  /** Render a normal Kitchen table item with consistent interactions. */
  function renderTableItemInSlot(slotIdx: number) {
    const item = tableItems[slotIdx];
    if (!item) return null;
    const imgSrc = ITEM_IMAGES[item.id] ?? null;

    const isSelectedHerbbag = selectedHerbbagSlot === slotIdx;
    const isSelectedHerbs   = selectedHerbsSlot === slotIdx && item.id === "herbs";
    const showHerbbagTapHint = (ts === "COOKING_UNPACK_WAIT" || ts === "COOKING_CRAFT_READY") &&
      item.id === "herbbag" && isSelectedHerbbag;

    // Herb Soup keeps its dedicated share/eat tutorial behavior after crafting.
    if (ts === "COOKING_SHARE_EAT" && item.id === "herbsoup") {
      const isBeingDragged = soupDragging && soupSlot === slotIdx;
      const gesture = createCookingSoupGesture(slotIdx, item.quantity);
      return (
        <GestureDetector gesture={gesture}>
          <View style={styles.soupSlotTouch}>
            {!isBeingDragged && imgSrc && (
              <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
            )}
            {!isBeingDragged && item.quantity > 1 && (
              <Text style={styles.tableItemQty}>{item.quantity}</Text>
            )}
          </View>
        </GestureDetector>
      );
    }

    if (isKitchenItemInteractionState(ts)) {
      const isBeingDragged = soupDragging && cookingDragActiveSlot === slotIdx;
      const gesture = createCookingItemGesture(slotIdx, item.id);
      return (
        <GestureDetector gesture={gesture}>
          <View
            style={[
              styles.soupSlotTouch,
              isSelectedHerbbag && { borderWidth: 2, borderColor: "#E8B84B", borderRadius: 6 },
              isSelectedHerbs   && { borderWidth: 2, borderColor: "#7EC87E", borderRadius: 6 },
            ]}
          >
            {!isBeingDragged && imgSrc && (
              <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
            )}
            {!isBeingDragged && item.quantity > 1 && (
              <Text style={styles.tableItemQty}>{item.quantity}</Text>
            )}
            {!isBeingDragged && showHerbbagTapHint && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#E8B84B", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>TAP</Text>
              </View>
            )}
            {!isBeingDragged && item.id === "herbs" && isSelectedHerbs && item.quantity > 1 && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#7EC87E", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>SPLIT</Text>
              </View>
            )}
          </View>
        </GestureDetector>
      );
    }

    // Other story states stay non-draggable, but inspection never disappears.
    return (
      <Pressable
        style={styles.soupSlotTouch}
        onPress={() => {
          const catalogEntry = ITEM_CATALOG[item.id];
          if (catalogEntry) showCookingTooltip(catalogEntry.name, catalogEntry.description);
        }}
        onLongPress={() => setKitchenDetailItem(item)}
        delayLongPress={500}
      >
        {imgSrc && (
          <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
        )}
        {item.quantity > 1 && <Text style={styles.tableItemQty}>{item.quantity}</Text>}
      </Pressable>
    );
  }
''',
    "table renderer",
)

# 5) Craft slots use the same combined gesture whenever Kitchen-item interactions are allowed.
text = text.replace(
    'ts === "COOKING_CRAFT_READY" ? (\n                          <GestureDetector gesture={createCookingItemGesture(12 + i, craftItem.id)}>',
    'isKitchenItemInteractionState(ts) ? (\n                          <GestureDetector gesture={createCookingItemGesture(12 + i, craftItem.id)}>',
    1,
)
text = text.replace(
    '{craftTool && ts === "COOKING_CRAFT_READY" ? (\n                    <GestureDetector gesture={createCookingItemGesture(15, craftTool.id)}>',
    '{craftTool && isKitchenItemInteractionState(ts) ? (\n                    <GestureDetector gesture={createCookingItemGesture(15, craftTool.id)}>',
    1,
)

# Add quantities to Tool rendering as well, for consistency if a stack is ever moved there.
old_tool_img = '''                        {!(soupDragging && cookingDragActiveSlot === 15) && ITEM_IMAGES[craftTool.id] && (\n                          <Image source={ITEM_IMAGES[craftTool.id]} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />\n                        )}'''
new_tool_img = old_tool_img + '''\n                        {!(soupDragging && cookingDragActiveSlot === 15) && craftTool.quantity > 1 && (\n                          <Text style={styles.tableItemQty}>{craftTool.quantity}</Text>\n                        )}'''
if old_tool_img not in text:
    raise SystemExit("tool quantity insertion marker not found")
text = text.replace(old_tool_img, new_tool_img, 1)

path.write_text(text)
print("kitchen item interaction consistency patch applied")
