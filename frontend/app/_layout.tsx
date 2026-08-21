import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAppFonts } from "@/src/hooks/use-app-fonts";
import { AudioProvider } from "@/src/audio/AudioProvider";
import { PlaytimeTracker } from "@/src/game/playtime-tracker";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AudioProvider>
          <PlaytimeTracker />
          <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
        </AudioProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
