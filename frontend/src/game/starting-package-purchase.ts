import AsyncStorage from "@react-native-async-storage/async-storage";

import { activatePurchasedStartingPackage } from "@/src/game/mailbox-system";

export const STARTING_PACKAGE_PRODUCT_ID = "startingpackage7days";
export const STARTING_PACKAGE_ENTITLEMENT_KEY = "@iap:starting-package-7-days-owned";

export async function ownsStartingPackage(): Promise<boolean> {
  return await AsyncStorage.getItem(STARTING_PACKAGE_ENTITLEMENT_KEY) === "true";
}

export async function grantStartingPackageEntitlement(): Promise<void> {
  await AsyncStorage.setItem(STARTING_PACKAGE_ENTITLEMENT_KEY, "true");
}

/** Grants this permanent purchase once in each save slot and each new run. */
export async function ensureStartingPackageForCurrentRun(): Promise<boolean> {
  if (!await ownsStartingPackage()) return false;
  await activatePurchasedStartingPackage();
  return true;
}
