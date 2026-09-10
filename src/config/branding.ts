/**
 * Central branding definition for the Nebrel Client.
 *
 * Everything user-visible that names the product lives here, so a future
 * rename or a white-label build only has to touch this file. Endpoints are
 * kept alongside the names because they carry the brand in their host names.
 */

export const BRAND = {
  /** Short product name, used in headings and window titles. */
  name: "Nebrel",
  /** Full product name, used where the word "launcher" adds clarity. */
  fullName: "Nebrel Client",
  /** Launcher window title. */
  launcherTitle: "Nebrel Launcher",
  /** Reverse-DNS application identifier. */
  identifier: "gg.nebrel.NebrelClient",
  /** File extension of an exported profile pack. */
  packExtension: ".nebrelpack",
} as const;

export type Brand = typeof BRAND;
