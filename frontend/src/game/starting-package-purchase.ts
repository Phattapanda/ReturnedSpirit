import AsyncStorage from "@react-native-async-storage/async-storage";

import { activatePurchasedStartingPackage, activatePurchasedHarvestPackage } from "@/src/game/mailbox-system";

export const STARTING_PACKAGE_PRODUCT_ID = "startingpackage7days";
// Enable explicitly when the Google Play release and store products are ready.
export const IN_APP_PURCHASES_ENABLED = false;
export const STARTING_PACKAGE_ENTITLEMENT_KEY = "@iap:starting-package-7-days-owned";

export async function ownsStartingPackage(): Promise<boolean> {
  return await AsyncStorage.getItem(STARTING_PACKAGE_ENTITLEMENT_KEY) === "true";
}

export async function grantStartingPackageEntitlement(): Promise<void> {
  await AsyncStorage.setItem(STARTING_PACKAGE_ENTITLEMENT_KEY, "true");
}

/** Grants this permanent purchase once in each save slot and each new run. */
let deliveryQueue: Promise<unknown> = Promise.resolve();
export function ensureStartingPackageForCurrentRun(): Promise<boolean> {
  const delivery = deliveryQueue.then(async () => {
    const starting = await ownsStartingPackage();
    const harvest = await ownsHarvestPackage();
    if (starting) await activatePurchasedStartingPackage();
    if (harvest) await activatePurchasedHarvestPackage();
    return starting || harvest;
  });
  deliveryQueue = delivery.catch(() => {});
  return delivery;
}

export const HARVEST_PACKAGE_PRODUCT_ID = "harvestsun";
export const HARVEST_PACKAGE_ENTITLEMENT_KEY = "@iap:harvest-sun-owned";
export async function ownsHarvestPackage(): Promise<boolean> {
  return await AsyncStorage.getItem(HARVEST_PACKAGE_ENTITLEMENT_KEY) === "true";
}
export async function grantHarvestPackageEntitlement(): Promise<void> {
  await AsyncStorage.setItem(HARVEST_PACKAGE_ENTITLEMENT_KEY, "true");
}
