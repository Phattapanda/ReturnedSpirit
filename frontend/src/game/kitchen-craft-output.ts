import {
  canStack,
  type BagItem,
} from "@/src/game/item-system";

export type KitchenCraftOutputPlan = {
  tableItems: (BagItem | null)[];
  targetSlots: number[];
  flightOutputs: BagItem[];
};

/**
 * Adds crafted products to the Kitchen Table atomically. Compatible partial
 * stacks are filled before a new stack is opened, and the input table remains
 * untouched when the complete output cannot fit.
 */
export function planKitchenCraftOutputs(
  currentTable: readonly (BagItem | null)[],
  outputs: readonly BagItem[],
  maxStackQuantity: number,
  reservedSlot: number | null = null,
): KitchenCraftOutputPlan | null {
  const stackLimit = Math.max(1, Math.floor(maxStackQuantity));
  const nextTable = currentTable.map((item) => item ? { ...item } : null);
  const touchedSlots: number[] = [];
  const touchedSlotSet = new Set<number>();
  const markTouched = (slot: number) => {
    if (touchedSlotSet.has(slot)) return;
    touchedSlotSet.add(slot);
    touchedSlots.push(slot);
  };

  for (const rawOutput of outputs) {
    let remaining = Math.max(0, Math.floor(rawOutput.quantity));
    if (remaining <= 0) continue;
    const output = { ...rawOutput, quantity: remaining };
    const stackable = canStack(output, output);

    if (stackable) {
      for (let slot = 0; slot < nextTable.length && remaining > 0; slot += 1) {
        if (slot === reservedSlot) continue;
        const existing = nextTable[slot];
        if (!existing || !canStack(existing, output) || existing.quantity >= stackLimit) continue;
        const transferred = Math.min(remaining, stackLimit - existing.quantity);
        nextTable[slot] = { ...existing, quantity: existing.quantity + transferred };
        remaining -= transferred;
        markTouched(slot);
      }
    }

    while (remaining > 0) {
      const emptySlot = nextTable.findIndex((item, slot) => slot !== reservedSlot && item === null);
      if (emptySlot < 0) return null;
      const quantity = stackable ? Math.min(remaining, stackLimit) : 1;
      nextTable[emptySlot] = { ...output, quantity };
      remaining -= quantity;
      markTouched(emptySlot);
    }
  }

  return {
    tableItems: nextTable,
    targetSlots: touchedSlots,
    flightOutputs: touchedSlots.map((slot) => ({ ...nextTable[slot]! })),
  };
}
