import { useEffect, useRef } from "react";
import { isUserCancelledError, useIAP } from "expo-iap";

import {
  ensureStartingPackageForCurrentRun,
  grantStartingPackageEntitlement,
  STARTING_PACKAGE_PRODUCT_ID,
  HARVEST_PACKAGE_PRODUCT_ID,
  grantHarvestPackageEntitlement,
} from "@/src/game/starting-package-purchase";

type Props = {
  productId?: string;
  purchaseRequest: number;
  onStatus: (status: { connected: boolean; displayPrice?: string }) => void;
  onOwned: () => void;
  onError: (message: string) => void;
};

export default function StartingPackageStoreBridge({ productId = STARTING_PACKAGE_PRODUCT_ID, purchaseRequest, onStatus, onOwned, onError }: Props) {
  const grantEntitlement = productId === HARVEST_PACKAGE_PRODUCT_ID ? grantHarvestPackageEntitlement : grantStartingPackageEntitlement;
  const handledRequest = useRef(0);
  const { connected, products, availablePurchases, fetchProducts, getAvailablePurchases, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: (purchase) => {
      if (purchase.productId !== productId) return;
      void (async () => {
        await grantEntitlement();
        await ensureStartingPackageForCurrentRun();
        await finishTransaction({ purchase, isConsumable: false });
        onOwned();
      })().catch((error) => onError(error instanceof Error ? error.message : "The purchase could not be completed."));
    },
    onPurchaseError: (error) => {
      onError(isUserCancelledError(error) ? "" : error.message);
    },
    onError: (error) => onError(error.message),
  });

  useEffect(() => {
    onStatus({
      connected,
      displayPrice: products.find((product) => product.id === productId)?.displayPrice,
    });
  }, [connected, onStatus, products, productId]);

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: [productId], type: "in-app" });
    void getAvailablePurchases();
  }, [connected, fetchProducts, getAvailablePurchases, productId]);

  useEffect(() => {
    if (!availablePurchases.some((purchase) => purchase.productId === productId)) return;
    void grantEntitlement()
      .then(ensureStartingPackageForCurrentRun)
      .then(() => onOwned())
      .catch((error) => onError(error instanceof Error ? error.message : "The purchase could not be restored."));
  }, [availablePurchases, onError, onOwned, productId, grantEntitlement]);

  useEffect(() => {
    if (!purchaseRequest || purchaseRequest === handledRequest.current) return;
    handledRequest.current = purchaseRequest;
    if (!connected) {
      onError("The store is not available yet. Please try again shortly.");
      return;
    }
    void requestPurchase({
      request: {
        apple: { sku: productId },
        google: { skus: [productId] },
      },
      type: "in-app",
    }).catch((error) => {
      onError(isUserCancelledError(error) ? "" : error instanceof Error ? error.message : "The purchase could not be started.");
    });
  }, [connected, onError, purchaseRequest, requestPurchase, productId]);

  return null;
}
