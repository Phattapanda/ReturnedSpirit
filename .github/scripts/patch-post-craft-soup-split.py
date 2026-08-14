from pathlib import Path

path = Path("frontend/app/kitchen.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
'''const D_CRAFT_SUCCESS: DLine[] = [
  { id: "d_craft.0", speaker: "Rupert", portrait: "laugh",  text: '\"Well done! The herb soup is ready.\"' },
  { id: "d_craft.1", speaker: "Rupert", portrait: "normal", text: '\"Take one bowl to me, and keep the other for yourself.\"' },
];''',
'''const D_CRAFT_SUCCESS: DLine[] = [
  { id: "d_craft.0", speaker: "Rupert", portrait: "laugh", text: '\"Well done! The herb soup is ready.\"' },
];''',
"craft success dialog",
)

replace_once(
'''    setTimeout(() => showDialog(D_CRAFT_SUCCESS, () => {
      setTutState("COOKING_SHARE_EAT");
      tsRef.current = "COOKING_SHARE_EAT";
      // Set first herbsoup as draggable via soupSlot
      const soup1 = newTable.findIndex(it => it?.id === "herbsoup");
      if (soup1 >= 0) { setSoupSlot(soup1); soupSlotRef.current = soup1; }
      showBubble(
        '\"Take one bowl to me.\"',
        "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_request",
      );
    }), 400);''',
'''    setTimeout(() => showDialog(D_CRAFT_SUCCESS, () => {
      setTutState("COOKING_SHARE_EAT");
      tsRef.current = "COOKING_SHARE_EAT";
      setFlyingItemId("herbsoup");
      // Track the first soup for compatibility with the existing tutorial flow.
      // In COOKING_SHARE_EAT every soup stack gets its own GestureDetector below.
      const soup1 = newTable.findIndex(it => it?.id === "herbsoup");
      if (soup1 >= 0) { setSoupSlot(soup1); soupSlotRef.current = soup1; }
      showBubble(
        '\"We made enough for two. Can you please split them into 2 bowls?\"',
        "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.split_soup_request",
      );
    }), 400);''',
"post-craft instruction",
)

marker = '''  // ── Soup tap (tooltip)\n'''
if text.count(marker) != 1:
    raise SystemExit(f"post-craft helper insertion marker: expected 1 match, found {text.count(marker)}")
helpers = r'''  /**
   * Post-craft tutorial soup interaction. This is intentionally separate from the
   * Day-1 soup gesture so the proven Day-1 behavior remains untouched.
   */
  function onCookingSoupDragBegin(sourceSlot: number, absX: number, absY: number) {
    if (tsRef.current !== "COOKING_SHARE_EAT") return;
    const item = tableItemsRef.current[sourceSlot];
    if (!item || item.id !== "herbsoup") return;

    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    setFlyingItemId("herbsoup");
    setSoupDragging(true);

    const slotRef = tableSlotRefs.current[sourceSlot];
    const applyOffset = (cx: number, cy: number) => {
      dragOffsetX.value = cx - absX;
      dragOffsetY.value = cy - absY;
      soupX.value = cx;
      soupY.value = cy;
    };

    if (slotRef) {
      slotRef.measureInWindow((x, y, w, h) => {
        if (w > 0) soupFlySize.value = w * 0.80;
        layouts.current.tableSlots[sourceSlot] = {
          x, y, w, h, cx: x + w / 2, cy: y + h / 2,
        };
        applyOffset(x + w / 2, y + h / 2);
      });
      return;
    }

    const cached = layouts.current.tableSlots[sourceSlot];
    applyOffset(
      cached ? (cached.cx ?? cached.x + cached.w / 2) : absX,
      cached ? (cached.cy ?? cached.y + cached.h / 2) : absY,
    );
  }

  function splitCookingSoupStack(sourceSlot: number) {
    if (tsRef.current !== "COOKING_SHARE_EAT") return;
    const currentTable = tableItemsRef.current;
    const stack = currentTable[sourceSlot];
    if (!stack || stack.id !== "herbsoup" || stack.quantity <= 1) return;

    const freeSlot = currentTable.findIndex((item, idx) => idx !== sourceSlot && item === null);
    if (freeSlot < 0) {
      showPlayerBubble('\"I need some room on the table.\"');
      return;
    }

    const newTable = currentTable.slice();
    newTable[sourceSlot] = { ...stack, quantity: stack.quantity - 1 };
    newTable[freeSlot] = { ...stack, quantity: 1 };
    tableItemsRef.current = newTable;
    setTableItems(newTable);
    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    setTooltipVisible(false);

    showBubble(
      '\"That smells delicious. Please pass me a bowl and dig in, too.\"',
      "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_after_split",
    );
  }

  function createCookingSoupGesture(sourceSlot: number, quantity: number) {
    const cookingSoupTap = Gesture.Tap()
      .maxDeltaX(8).maxDeltaY(8)
      .onEnd(() => { runOnJS(splitCookingSoupStack)(sourceSlot); });

    const cookingSoupLongPress = Gesture.LongPress()
      .minDuration(500)
      .onStart(() => {
        runOnJS(setKitchenDetailItem)({
          id: "herbsoup",
          itemType: "herbsoup",
          name: "Herb Soup",
          quantity,
          attributes: ["edible"],
        });
      });

    const cookingSoupPan = Gesture.Pan()
      .minDistance(10)
      .onStart((e) => {
        cancelAnimation(soupX);
        cancelAnimation(soupY);
        cancelAnimation(soupVis);
        cancelAnimation(soupScale);
        soupVis.value = 1;
        soupScale.value = 1;
        runOnJS(onCookingSoupDragBegin)(sourceSlot, e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        const itemX = e.absoluteX + dragOffsetX.value;
        const itemY = e.absoluteY + dragOffsetY.value;
        soupX.value = itemX;
        soupY.value = itemY;
        runOnJS(updateHoveredSlot)(itemX, itemY);
      })
      .onEnd((e) => {
        runOnJS(handleDrop)(
          e.absoluteX + dragOffsetX.value,
          e.absoluteY + dragOffsetY.value,
        );
      })
      .onFinalize((_, success) => {
        if (!success) {
          soupVis.value = withTiming(0, { duration: 100 });
          runOnJS(onGestureCancelled)();
        }
      });

    return Gesture.Race(cookingSoupPan, cookingSoupLongPress, cookingSoupTap);
  }

'''
text = text.replace(marker, helpers + marker, 1)

replace_once(
'''    // Cooking tutorial share/eat path
    if (tsRef.current === "COOKING_SHARE_EAT") {
      if (lr && inRect(itemX, itemY, lr)) { onCookingShareWithRupert(); return; }
      if (lp && inRect(itemX, itemY, lp)) { onCookingEatSoup(itemX, itemY); return; }
      endDragClean(); return;
    }''',
'''    // Cooking tutorial share/eat path
    if (tsRef.current === "COOKING_SHARE_EAT") {
      const curSlot = soupSlotRef.current;
      const currentSoup = curSlot !== null && curSlot < 12
        ? tableItemsRef.current[curSlot]
        : null;
      const stackedSoup = currentSoup?.id === "herbsoup" && currentSoup.quantity > 1;
      const droppedOnRupert = !!lr && inRect(itemX, itemY, lr);
      const droppedOnPlayer = !!lp && inRect(itemX, itemY, lp);

      if (stackedSoup && (droppedOnRupert || droppedOnPlayer)) {
        returnDragToSlot(itemX, itemY);
        showBubble(
          '\"We wanted to share.\"',
          "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_stack_reject",
        );
        return;
      }
      if (droppedOnRupert) { onCookingShareWithRupert(); return; }
      if (droppedOnPlayer) { onCookingEatSoup(itemX, itemY); return; }
      endDragClean(); return;
    }''',
"stacked soup rejection",
)

replace_once(
'''  function onCookingShareWithRupert() {
    endDragClean();
    cookingShareDoneRef.current = true;
    const curSlot = soupSlotRef.current;
    const newTable = tableItems.slice();
    if (curSlot !== null && curSlot < 12) newTable[curSlot] = null;
    setSoupSlot(null); soupSlotRef.current = null;
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});''',
'''  function onCookingShareWithRupert() {
    endDragClean();
    cookingShareDoneRef.current = true;
    const curSlot = soupSlotRef.current;
    const newTable = tableItemsRef.current.slice();
    if (curSlot !== null && curSlot < 12) newTable[curSlot] = null;
    tableItemsRef.current = newTable;
    setSoupSlot(null); soupSlotRef.current = null;
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});''',
"share uses current table ref",
)

replace_once(
'''  function onCookingEatSoup(absX: number, absY: number) {
    if (cookingEatDoneRef.current) { endDragClean(); return; }
    cookingEatDoneRef.current = true;
    const curSlot = soupSlotRef.current;
    const newTable = tableItems.slice();
    if (curSlot !== null && curSlot < 12) newTable[curSlot] = null;
    setSoupSlot(null); soupSlotRef.current = null;
    setSoupDragging(false);
    setTableItems(newTable);''',
'''  function onCookingEatSoup(absX: number, absY: number) {
    if (cookingEatDoneRef.current) { endDragClean(); return; }
    cookingEatDoneRef.current = true;
    const curSlot = soupSlotRef.current;
    const newTable = tableItemsRef.current.slice();
    if (curSlot !== null && curSlot < 12) newTable[curSlot] = null;
    tableItemsRef.current = newTable;
    setSoupSlot(null); soupSlotRef.current = null;
    setSoupDragging(false);
    setTableItems(newTable);''',
"eat uses current table ref",
)

replace_once(
'''  function renderSoupInSlot(slotIdx: number) {
    // Check only if this slot owns the soup — NOT !soupDragging.''',
'''  function renderSoupInSlot(slotIdx: number) {
    // Post-craft soup stacks are rendered from tableItems so every bowl can own
    // its own gesture. Keep the original renderer exclusively for the Day-1 flow.
    if (ts === "COOKING_SHARE_EAT") return null;

    // Check only if this slot owns the soup — NOT !soupDragging.''',
"keep day1 soup renderer isolated",
)

replace_once(
'''    const isCookingHerbbag  = inCookingPhase && item.id === "herbbag";

    // ── Craft-phase draggable items ─────────────────────────────────────────''',
'''    const isCookingHerbbag  = inCookingPhase && item.id === "herbbag";

    // ── Post-craft soup tutorial ─────────────────────────────────────────────
    // Every bowl/stack is independently draggable. A stack can be split with a tap.
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

    // ── Craft-phase draggable items ─────────────────────────────────────────''',
"post-craft soup renderer",
)

path.write_text(text)
print("post-craft soup split patch applied")
