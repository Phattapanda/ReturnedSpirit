import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAppFonts } from "@/src/hooks/use-app-fonts";
import { AudioProvider } from "@/src/audio/AudioProvider";
import { HapticsProvider } from "@/src/feedback/haptics-provider";
import { PlaytimeTracker } from "@/src/game/playtime-tracker";
import GameplayBackGuard from "@/src/components/gameplay-back-guard";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

const GAME_BACKGROUND = "#0A0500";

export default function RootLayout() {
  const [iconsLoaded, iconError] = useIconFonts();
  const [appFontsLoaded] = useAppFonts();

  useEffect(() => {
    if ((iconsLoaded || iconError) && appFontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [iconsLoaded, iconError, appFontsLoaded]);

  if ((!iconsLoaded && !iconError) || !appFontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: GAME_BACKGROUND }}>
      <SafeAreaProvider>
        <AudioProvider>
          <HapticsProvider>
            <PlaytimeTracker />
            <Stack
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
          </HapticsProvider>
        </AudioProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
