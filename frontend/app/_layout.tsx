import { Stack, usePathname, useRootNavigationState, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAppFonts } from "@/src/hooks/use-app-fonts";
import { AudioProvider } from "@/src/audio/AudioProvider";
import { HapticsProvider } from "@/src/feedback/haptics-provider";
import { PlaytimeTracker } from "@/src/game/playtime-tracker";
import GameplayBackGuard from "@/src/components/gameplay-back-guard";
import FavorChangeOverlay from "@/src/components/favor-change-overlay";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

const GAME_BACKGROUND = "#0A0500";

export const unstable_settings = {
  anchor: "index",
  initialRouteName: "index",
};

const STARTUP_ROUTE_SETTLE_MS = 1500;

export default function RootLayout() {
  const [iconsLoaded, iconError] = useIconFonts();
  const [appFontsLoaded] = useAppFonts();
  const [startupRouteReady, setStartupRouteReady] = useState(false);
  const rootNavigationState = useRootNavigationState();
  const pathname = usePathname();
  const router = useRouter();

  // Expo Router can restore the route that was open when Expo Go last reloaded.
  // A fresh app session must always begin at the title screen; saved games are
  // entered explicitly through Load Game.
  useEffect(() => {
    if (!rootNavigationState?.key || startupRouteReady) return;
    if (pathname !== "/") {
      if (router.canGoBack()) router.dismissAll();
      router.replace("/");
      return;
    }

    // Keep the splash screen up until the native route has remained on the
    // title screen. Expo Go can publish its restored route a moment after the
    // root navigator first reports that it is ready.
    const settleTimer = setTimeout(() => setStartupRouteReady(true), STARTUP_ROUTE_SETTLE_MS);
    return () => clearTimeout(settleTimer);
  }, [pathname, rootNavigationState?.key, router, startupRouteReady]);

  useEffect(() => {
    if ((iconsLoaded || iconError) && appFontsLoaded && startupRouteReady) {
      SplashScreen.hideAsync();
    }
  }, [iconsLoaded, iconError, appFontsLoaded, startupRouteReady]);

  if ((!iconsLoaded && !iconError) || !appFontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: GAME_BACKGROUND }}>
      <SafeAreaProvider>
        <AudioProvider>
          <HapticsProvider>
            <PlaytimeTracker />
            <Stack
              initialRouteName="index"
              screenOptions={{
                headerShown: false,
                animation: "fade",
                contentStyle: { backgroundColor: GAME_BACKGROUND },
              }}
            >
              {(["kitchen", "garden", "dining", "dormitory", "mail", "outside-tavern"] as const).map((name) => (
                <Stack.Screen
                  key={name}
                  name={name}
                  options={{ animation: "slide_from_right", animationDuration: 300, animationTypeForReplace: "push" }}
                />
              ))}
            </Stack>
            <GameplayBackGuard />
            <FavorChangeOverlay />
          </HapticsProvider>
        </AudioProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
