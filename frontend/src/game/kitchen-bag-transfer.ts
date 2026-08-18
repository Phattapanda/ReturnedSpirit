import {
  planContainerItemToBag,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";

export type KitchenTransferState = {
  tableItems: (BagItem | null)[];
  craftIngredients: (BagItem | null)[];
  craftTool: BagItem | null;
};

export type KitchenToBagResult = KitchenTransferState & {
  bag: PlayerBagData;
  canTransfer: boolean;
  transferQty: number;
  remainderQty: number;
};

function unchanged(
  bag: PlayerBagData,
  state: KitchenTransferState,
  remainderQty = 0,
): KitchenToBagResult {
  return {
    tableItems: state.tableItems.map(item => item ? { ...item } : null),
    craftIngredients: state.craftIngredients.map(item => item ? { ...item } : null),
    craftTool: state.craftTool ? { ...state.craftTool } : null,
    bag: {
      ...bag,
      slots: bag.slots.map(item => item ? { ...item } : null),
    },
    canTransfer: false,
    transferQty: 0,
    remainderQty,
  };
}

/**
 * Kitchen slot map used by KitchenScreen:
 *   0..11  table
 *   12..14 craft ingredients
 *   15     craft tool
 *
 * This adapter deliberately contains no tutorial/guest locks. It only translates
 * Kitchen slot addressing to the shared container-to-Bag transfer rules.
 */
export function planKitchenItemToBag(
  sourceSlot: number,
  bag: PlayerBagData,
  state: KitchenTransferState,
): KitchenToBagResult {
  if (sourceSlot < 0 || sourceSlot > 15) {
    return unchanged(bag, state);
  }

  if (sourceSlot <= 11) {
    const plan = planContainerItemToBag(state.tableItems, sourceSlot, bag);
    return {
      tableItems: plan.updatedSourceSlots,
      craftIngredients: state.craftIngredients.map(item => item ? { ...item } : null),
      craftTool: state.craftTool ? { ...state.craftTool } : null,
      bag: plan.updatedBag,
      canTransfer: plan.canTransfer,
      transferQty: plan.transferQty,
      remainderQty: plan.remainderQty,
    };
  }

  if (sourceSlot <= 14) {
    const sourceIdx = sourceSlot - 12;
    const plan = planContainerItemToBag(state.craftIngredients, sourceIdx, bag);
    return {
      tableItems: state.tableItems.map(item => item ? { ...item } : null),
      craftIngredients: plan.updatedSourceSlots,
      craftTool: state.craftTool ? { ...state.craftTool } : null,
      bag: plan.updatedBag,
      canTransfer: plan.canTransfer,
      transferQty: plan.transferQty,
      remainderQty: plan.remainderQty,
    };
  }

  const plan = planContainerItemToBag([state.craftTool], 0, bag);
  return {
    tableItems: state.tableItems.map(item => item ? { ...item } : null),
    craftIngredients: state.craftIngredients.map(item => item ? { ...item } : null),
    craftTool: plan.updatedSourceSlots[0] ?? null,
    bag: plan.updatedBag,
    canTransfer: plan.canTransfer,
    transferQty: plan.transferQty,
    remainderQty: plan.remainderQty,
  };
}
