import React, { forwardRef } from "react";
import { Text as NativeText, type TextProps } from "react-native";
import { useLanguage } from "./use-language";

/** Opt-in display boundary: never changes persisted strings or game logic. */
export const Text = forwardRef<React.ElementRef<typeof NativeText>, TextProps & { translate?: boolean }>(
  function LocalizedText({ children, translate = true, accessibilityLabel, ...props }, ref) {
    const { t } = useLanguage();
    const localize = (value: React.ReactNode): React.ReactNode => {
      if (typeof value === "string") return t(value);
      if (Array.isArray(value)) {
        // Translate interpolated plain text as a whole, keeping styled elements intact.
        if (value.every(child => typeof child === "string" || typeof child === "number")) return t(value.join(""));
        return value.map(localize);
      }
      return value;
    };
    return <NativeText ref={ref} {...props} accessibilityLabel={translate && accessibilityLabel ? t(accessibilityLabel) : accessibilityLabel}>
      {translate ? localize(children) : children}
    </NativeText>;
  },
);
