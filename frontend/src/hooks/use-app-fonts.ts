// App font loader – follows the same CDN strategy as use-icon-fonts.ts.
//
// WHY:
//   On Android in Expo Go (StoreClient), Metro's asset resolver returns
//   a 0-byte file for bundled .ttf assets, which causes expo-font /
//   useFonts to hang indefinitely.  Loading from a CDN URL completely
//   bypasses that asset-resolution path.
//
// STRATEGY:
//   • Expo Go (ExecutionEnvironment.StoreClient):
//       Oldenburg is fetched from the jsDelivr Fontsource CDN – same CDN
//       that use-icon-fonts.ts already uses for Ionicons etc.
//   • Native dev / production build:
//       Oldenburg is loaded from the bundled require() asset as usual.
//
// FALLBACK:
//   A 6-second timeout guarantees the app always starts even if the CDN
//   is unreachable or expo-font hangs.  The app will simply render with the
//   system font until Oldenburg becomes available (or for the whole session
//   if it never loads).
//
// Usage:
//   const [fontsReady] = useAppFonts();

import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";
import { useEffect, useRef, useState } from "react";

/** jsDelivr Fontsource CDN — stable URL, same CDN as use-icon-fonts.ts */
const OLDENBURG_CDN =
  "https://cdn.jsdelivr.net/fontsource/fonts/oldenburg@latest/latin-400-normal.ttf";

// Evaluate both maps at module scope so useFonts always receives a
// referentially-stable object (prevents unnecessary reloads on re-renders).
const FONT_MAP_CDN = { Oldenburg: OLDENBURG_CDN } as const;
const FONT_MAP_LOCAL = {
  Oldenburg: require("../../assets/fonts/Oldenburg-Regular.ttf") as number,
} as const;

/** Resolved once at module init – StoreClient → CDN, everything else → require */
const ACTIVE_FONT_MAP =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? FONT_MAP_CDN
    : FONT_MAP_LOCAL;

/**
 * Loads the Oldenburg typeface and returns [ready, error].
 * `ready` is `true` as soon as the font is loaded, an error occurs,
 * or the 6-second fallback timeout expires.
 */
export function useAppFonts(): readonly [boolean, Error | null] {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loaded, error] = useFonts(ACTIVE_FONT_MAP);

  useEffect(() => {
    // Font already settled (loaded, error, or prior timeout) – clear any
    // pending timer and skip starting a new one.
    if (loaded || error || timedOut) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start the fallback timer.  If it fires, the app proceeds with the
    // system font instead of Oldenburg.
    timerRef.current = setTimeout(() => {
      setTimedOut(true);
    }, 6000);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [loaded, error, timedOut]);

  // fontReady = true as soon as any of: loaded / timed-out / error
  return [loaded || timedOut || !!error, error ?? null] as const;
}
