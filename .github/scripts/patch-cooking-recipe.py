from pathlib import Path
import re

path = Path("frontend/app/kitchen.tsx")
text = path.read_text()

new_preview = '''  function updateCraftResultPreview() {
    // Need current refs - use immediate state via functional setter
    setCraftIngSlots(prevIng => {
      setCraftTool(prevTool => {
        // Herb Soup is an exact recipe: 2 herbs + 1 bucket of water + 1 old pot.
        // Any additional ingredient item makes the recipe invalid.
        let herbsQty = 0;
        let bucketwaterQty = 0;
        let hasUnexpectedIngredient = false;
        for (const slot of prevIng) {
          if (!slot) continue;
          if (slot.id === "herbs") herbsQty += slot.quantity;
          else if (slot.id === "bucketwater") bucketwaterQty += slot.quantity;
          else hasUnexpectedIngredient = true;
        }
        const toolMet = prevTool?.id === HERB_SOUP_RECIPE.tool && prevTool.quantity === 1;
        const ingredientsMet = !hasUnexpectedIngredient && herbsQty === 2 && bucketwaterQty === 1;
        setCraftResult(
          (toolMet && ingredientsMet)
            ? { id: "herbsoup", itemType: "herbsoup", name: "Herb Soup", quantity: 2, attributes: ["edible"] }
            : null,
        );
        return prevTool;
      });
      return prevIng;
    });
  }'''

new_craft = '''  function handleCraft() {
    if (craftingLocked.current) return;
    if (!craftResult) return;
    craftingLocked.current = true;

    // Defensive execution-time validation so a stale preview can never consume
    // unrelated items or craft a recipe that is no longer exact.
    let herbsQty = 0;
    let bucketwaterCount = 0;
    let hasUnexpectedIngredient = false;
    for (const slot of craftIngSlots) {
      if (!slot) continue;
      if (slot.id === "herbs") herbsQty += slot.quantity;
      else if (slot.id === "bucketwater") bucketwaterCount += slot.quantity;
      else hasUnexpectedIngredient = true;
    }
    const exactRecipe =
      !hasUnexpectedIngredient &&
      herbsQty === 2 &&
      bucketwaterCount === 1 &&
      craftTool?.id === HERB_SOUP_RECIPE.tool &&
      craftTool.quantity === 1;
    if (!exactRecipe) {
      craftingLocked.current = false;
      setCraftResult(null);
      showPlayerBubble('"There is no recipe for that."');
      return;
    }

    audioManager.playSoundEffect('cookingpot', { maxDurationMs: 6000 });

    // Output: 2 herb soups + the emptied bucket. The old pot is reusable and stays.
    const outputs: BagItem[] = [
      { id: "herbsoup", itemType: "herbsoup", name: "Herb Soup", quantity: 2, attributes: ["edible"] },
      { id: "bucket",   itemType: "bucket",   name: "Empty Bucket", quantity: 1, attributes: ["vessel"] },
    ];
    const newTable = tableItems.slice();
    let placed = 0;
    for (let i = 0; i < 12 && placed < outputs.length; i++) {
      if (!newTable[i] && soupSlotRef.current !== i) {
        newTable[i] = outputs[placed++];
      }
    }
    if (placed < outputs.length) {
      craftingLocked.current = false;
      showPlayerBubble('"No free space available."');
      return;
    }

    // Consume only recipe ingredients. Never blanket-clear input slots.
    let herbsToConsume = 2;
    let waterToConsume = 1;
    const newIng = craftIngSlots.map((slot): BagItem | null => {
      if (!slot) return null;
      if (slot.id === "herbs" && herbsToConsume > 0) {
        const consumed = Math.min(slot.quantity, herbsToConsume);
        herbsToConsume -= consumed;
        const remaining = slot.quantity - consumed;
        return remaining > 0 ? { ...slot, quantity: remaining } : null;
      }
      if (slot.id === "bucketwater" && waterToConsume > 0) {
        const consumed = Math.min(slot.quantity, waterToConsume);
        waterToConsume -= consumed;
        const remaining = slot.quantity - consumed;
        return remaining > 0 ? { ...slot, quantity: remaining } : null;
      }
      return slot;
    });

    if (herbsToConsume !== 0 || waterToConsume !== 0) {
      craftingLocked.current = false;
      showPlayerBubble('"There is no recipe for that."');
      return;
    }

    // Keep refs synchronous with state so the next interaction sees the new contents.
    tableItemsRef.current = newTable;
    craftIngSlotsRef.current = newIng;
    craftToolRef.current = craftTool;

    setCraftIngSlots(newIng);
    setCraftResult(null);
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(newIng)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(craftTool)).catch(() => {});
    AsyncStorage.setItem(SK.COOKING_STEP, "3").catch(() => {});

    setTutState("COOKING_CRAFT_DONE");
    tsRef.current = "COOKING_CRAFT_DONE";
    setTimeout(() => showDialog(D_CRAFT_SUCCESS, () => {
      setTutState("COOKING_SHARE_EAT");
      tsRef.current = "COOKING_SHARE_EAT";
      // Set first herbsoup as draggable via soupSlot
      const soup1 = newTable.findIndex(it => it?.id === "herbsoup");
      if (soup1 >= 0) { setSoupSlot(soup1); soupSlotRef.current = soup1; }
      showBubble(
        '"Take one bowl to me."',
        "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_request",
      );
    }), 400);
    setTimeout(() => { craftingLocked.current = false; }, 2000);
  }'''

text, preview_count = re.subn(
    r"  function updateCraftResultPreview\(\) \{.*?\n  \}\n\n  function handleCraft\(\) \{",
    new_preview + "\n\n  function handleCraft() {",
    text,
    count=1,
    flags=re.S,
)
if preview_count != 1:
    raise SystemExit(f"Expected one preview replacement, got {preview_count}")

text, craft_count = re.subn(
    r"  function handleCraft\(\) \{.*?\n  \}\n\n  function onCookingShareWithRupert\(\) \{",
    new_craft + "\n\n  function onCookingShareWithRupert() {",
    text,
    count=1,
    flags=re.S,
)
if craft_count != 1:
    raise SystemExit(f"Expected one handleCraft replacement, got {craft_count}")

path.write_text(text)
