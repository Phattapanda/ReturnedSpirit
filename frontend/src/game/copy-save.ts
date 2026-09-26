import AsyncStorage from "@react-native-async-storage/async-storage";

let copying = false;

/** Copies the saved checkpoint, never the current runtime or account purchases. */
export async function copySave(source: number, target: number): Promise<void> {
  if (copying) throw new Error("A copy is already in progress.");
  if (![1, 2, 3].includes(source) || ![1, 2, 3].includes(target) || source === target) {
    throw new Error("Choose a different save slot.");
  }
  copying = true;
  try {
    const rawSlots = await AsyncStorage.getItem("game_slots");
    const slots = JSON.parse(rawSlots ?? "[]") as { slot: number; occupied: boolean; [key: string]: unknown }[];
    const original = slots.find(slot => slot.slot === source);
    const destination = slots.find(slot => slot.slot === target);
    if (!original?.occupied || !destination) throw new Error("Save slot not found.");
    if (destination.occupied) throw new Error("Choose an empty slot. Existing saves will not be overwritten.");
    const snapshot = await AsyncStorage.getItem(`@slot_snapshot:${source}`);
    if (!snapshot) throw new Error("This slot has no saved checkpoint to copy.");
    const parsed: unknown = JSON.parse(snapshot);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        !Object.values(parsed).every(value => value === null || typeof value === "string")) {
      throw new Error("The saved checkpoint is invalid.");
    }
    // Publish the slot only after its checkpoint has been successfully written.
    await AsyncStorage.setItem(`@slot_snapshot:${target}`, snapshot);
    await AsyncStorage.setItem("game_slots", JSON.stringify(slots.map(slot =>
      slot.slot === target ? { ...original, slot: target } : slot)));
  } finally {
    copying = false;
  }
}
