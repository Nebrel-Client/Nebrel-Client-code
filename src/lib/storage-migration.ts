/**
 * Moves persisted state off the inherited `norisk-*` localStorage keys onto
 * `nebrel-*` ones.
 *
 * This has to run before any store module is imported, because zustand's
 * persist middleware reads localStorage the moment the store is created. It is
 * therefore imported at the very top of the entry points, right after the
 * polyfills.
 *
 * Renaming without this would silently reset everyone's accent colour, pinned
 * profiles, cape favourites and so on.
 */

/** Old key -> new key. Both halves are literal so a typo cannot go unnoticed. */
const RENAMES: ReadonlyArray<readonly [string, string]> = [
  ["norisk-theme-storage", "nebrel-theme-storage"],
  ["norisk-background-effect-storage", "nebrel-background-effect-storage"],
  ["norisk-font-storage", "nebrel-font-storage"],
  ["norisk-quality-settings-storage", "nebrel-quality-settings-storage"],
  ["norisk-snow-effect-storage", "nebrel-snow-effect-storage"],
  ["norisk-cape-favorites", "nebrel-cape-favorites"],
  ["norisk-mod-search", "nebrel-mod-search"],
  ["norisk-pinned-profiles", "nebrel-pinned-profiles"],
  ["norisk-profile-icon-library", "nebrel-profile-icon-library"],
  ["norisk-vanilla-capes", "nebrel-vanilla-capes"],
];

export function migrateLegacyStorageKeys(): void {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    // Private mode or blocked site data: nothing to migrate, and nothing to
    // report either.
    return;
  }

  for (const [from, to] of RENAMES) {
    try {
      const legacy = storage.getItem(from);
      if (legacy === null) continue;

      // A value already under the new key wins: the user has used this build
      // before and the old entry is a leftover.
      if (storage.getItem(to) === null) {
        storage.setItem(to, legacy);
      }
      storage.removeItem(from);
    } catch (error) {
      // One unreadable key must not stop the rest from moving over.
      console.warn(`[storage] Could not migrate ${from}:`, error);
    }
  }
}

migrateLegacyStorageKeys();
