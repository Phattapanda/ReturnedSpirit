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
'''    setCookingDragActiveSlot(slotIdx);
    setFlyingItemId(itemId);
    setSoupDragging(true);

    const slotRef = slotIdx <= 11''',
'''    setCookingDragActiveSlot(slotIdx);
    setFlyingItemId(itemId);

    // Keep the source visible until React has committed the new overlay image.
    // Showing the Reanimated overlay before setFlyingItemId() renders causes a
    // one-frame flash of the previously dragged item.
    requestAnimationFrame(() => {
      if (cookingDraggedSlotRef.current !== slotIdx || tsRef.current !== "COOKING_CRAFT_READY") return;
      setSoupDragging(true);
      soupVis.value = 1;
    });

    const slotRef = slotIdx <= 11''',
"defer cooking overlay visibility",
)

replace_once(
'''        soupVis.value = 1;
        soupScale.value = 1;
        runOnJS(onCookingDragStarted)(sourceSlot, itemId, e.absoluteX, e.absoluteY);''',
'''        // Keep the shared overlay hidden until JS has switched the React image
        // to this exact item. onCookingDragStarted reveals it next frame.
        soupVis.value = 0;
        soupScale.value = 1;
        runOnJS(onCookingDragStarted)(sourceSlot, itemId, e.absoluteX, e.absoluteY);''',
"hide cooking overlay before item switch",
)

replace_once(
'''    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    setFlyingItemId("herbsoup");
    setSoupDragging(true);

    const slotRef = tableSlotRefs.current[sourceSlot];''',
'''    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    setFlyingItemId("herbsoup");

    // Same anti-flicker handoff as the generic Cooking drag: leave the source
    // bowl visible until the Herb Soup overlay image has been committed.
    requestAnimationFrame(() => {
      if (soupSlotRef.current !== sourceSlot || tsRef.current !== "COOKING_SHARE_EAT") return;
      setSoupDragging(true);
      soupVis.value = 1;
    });

    const slotRef = tableSlotRefs.current[sourceSlot];''',
"defer post-craft soup overlay visibility",
)

replace_once(
'''        soupVis.value = 1;
        soupScale.value = 1;
        runOnJS(onCookingSoupDragBegin)(sourceSlot, e.absoluteX, e.absoluteY);''',
'''        // Do not reveal the shared overlay with the previous item's React source.
        // onCookingSoupDragBegin switches it to Herb Soup, then reveals next frame.
        soupVis.value = 0;
        soupScale.value = 1;
        runOnJS(onCookingSoupDragBegin)(sourceSlot, e.absoluteX, e.absoluteY);''',
"hide post-craft soup overlay before image switch",
)

path.write_text(text)
print("drag overlay flicker patch applied")
