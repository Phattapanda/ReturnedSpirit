import { useEffect, useRef } from "react";
import { isUserCancelledError, useIAP } from "expo-iap";

import {
  ensureStartingPackageForCurrentRun,
  grantStartingPackageEntitlement,
  STARTING_PACKAGE_PRODUCT_ID,
} from "@/src/game/starting-package-purchase";

type Props = {
  purchaseRequest: number;
  onStatus: (status: { connected: boolean; displayPrice?: string }) => void;
  onOwned: () => void;
  onError: (message: string) => void;
};

export default function StartingPackageStoreBridge({ purchaseRequest, onStatus, onOwned, onError }: Props) {
  const handledRequest = useRef(0);
  const { connected, products, availablePurchases, fetchProducts, getAvailablePurchases, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: (purchase) => {
      if (purchase.productId !== STARTING_PACKAGE_PRODUCT_ID) return;
      void (async () => {
        await grantStartingPackageEntitlement();
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
      displayPrice: products.find((product) => product.id === STARTING_PACKAGE_PRODUCT_ID)?.displayPrice,
    });
  }, [connected, onStatus, products]);

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: [STARTING_PACKAGE_PRODUCT_ID], type: "in-app" });
    void getAvailablePurchases();
  }, [connected, fetchProducts, getAvailablePurchases]);

  useEffect(() => {
    if (!availablePurchases.some((purchase) => purchase.productId === STARTING_PACKAGE_PRODUCT_ID)) return;
    void grantStartingPackageEntitlement()
      .then(ensureStartingPackageForCurrentRun)
      .then(() => onOwned())
      .catch((error) => onError(error instanceof Error ? error.message : "The purchase could not be restored."));
  }, [availablePurchases, onError, onOwned]);

  useEffect(() => {
    if (!purchaseRequest || purchaseRequest === handledRequest.current) return;
    handledRequest.current = purchaseRequest;
    if (!connected) {
      onError("The store is not available yet. Please try again shortly.");
      return;
    }
    void requestPurchase({
      request: {
        apple: { sku: STARTING_PACKAGE_PRODUCT_ID },
        google: { skus: [STARTING_PACKAGE_PRODUCT_ID] },
      },
      type: "in-app",
    }).catch((error) => {
      onError(isUserCancelledError(error) ? "" : error instanceof Error ? error.message : "The purchase could not be started.");
    });
  }, [connected, onError, purchaseRequest, requestPurchase]);

  return null;
}
