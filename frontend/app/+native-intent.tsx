/**
 * Expo Go may reopen the native URL that was active during the previous
 * session. Rewrite only that initial URL to the title screen. Navigation
 * performed after startup remains untouched.
 */
export function redirectSystemPath({ path, initial }: { path: string | null; initial: boolean }): string {
  return initial ? "/" : path ?? "/";
}
