"use client";

/**
 * ProfileLeftRailV3 — einheitliche Linke-Achsen-Navigation fuer den
 * Detail-View. Merged die frueheren Main-Tabs (content/worlds/screenshots/logs)
 * und Content-Typen (mods/resourcepacks/...) zu einer Achse mit 2 Sektionen.
 */

import type React from "react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import type { Profile } from "../../../types/profile";
import { useThemeStore } from "../../../store/useThemeStore";

export type NavKey =
  | "mods" | "resourcepacks" | "shaderpacks" | "datapacks" | "nrc"
  | "worlds" | "screenshots" | "logs";

export const CONTENT_NAV_KEYS: NavKey[] = ["mods", "resourcepacks", "shaderpacks", "datapacks", "nrc"];

interface NavItem {
  key: NavKey;
  icon: string;
  labelKey: string;
  count?: number;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

interface ProfileLeftRailV3Props {
  profile: Profile;
  activeNavItem: NavKey;
  onNavChange: (k: NavKey) => void;
}

export function ProfileLeftRailV3({ profile, activeNavItem, onNavChange }: ProfileLeftRailV3Props) {
  const { t } = useTranslation();
  const accentColor = useThemeStore((s) => s.accentColor);

  const modCount = profile.mods?.length ?? 0;

  const groups: NavGroup[] = [
    {
      labelKey: "profiles.tabs.content",
      items: [
        { key: "mods",          icon: "solar:bolt-bold-duotone",         labelKey: "profiles.content.mods",          count: modCount },
        { key: "resourcepacks", icon: "solar:gallery-bold-duotone",      labelKey: "profiles.content.resourcePacks" },
        { key: "shaderpacks",   icon: "solar:sun-bold-duotone",          labelKey: "profiles.content.shaderPacks" },
        { key: "datapacks",     icon: "solar:database-bold-duotone",     labelKey: "profiles.content.dataPacks" },
        { key: "nrc",           icon: "solar:shield-check-bold-duotone", labelKey: "profiles.content.noriskClient" },
      ],
    },
    {
      labelKey: "profiles.tabs.worlds",
      items: [
        { key: "worlds",      icon: "solar:planet-bold-duotone",      labelKey: "profiles.tabs.worlds" },
        { key: "screenshots", icon: "solar:camera-bold-duotone",      labelKey: "profiles.tabs.screenshots" },
        { key: "logs",        icon: "solar:code-square-bold-duotone", labelKey: "profiles.tabs.logs" },
      ],
    },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-l border-white/10 overflow-y-auto no-scrollbar py-4 px-2 flex flex-col">
      {groups.map((group, gi) => (
        <div key={gi} className="mb-5">
          <div className="px-2 mb-2 text-xs uppercase tracking-wider text-white/40 font-minecraft">
            {gi === 0 ? t("profiles.tabs.content") : t("profiles.v3.leftRail.world")}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = item.key === activeNavItem;
              return (
                <NavButton
                  key={item.key}
                  active={active}
                  icon={item.icon}
                  label={t(item.labelKey)}
                  count={item.count}
                  accent={accentColor.value}
                  onClick={() => onNavChange(item.key)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

interface NavButtonProps {
  icon: string;
  label: string;
  count?: number;
  active?: boolean;
  accent: string;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({ icon, label, count, active, accent, onClick }) => (
  <button
    onClick={onClick}
    className="nebrel-settings-pill w-full flex items-center gap-3 text-left"
    style={
      active
        ? { backgroundColor: `${accent}1f`, borderColor: `${accent}5c`, color: "#fff" }
        : { color: "rgba(255,255,255,.62)" }
    }
  >
    <Icon
      icon={icon}
      className="w-5 h-5 flex-shrink-0"
      style={{ color: active ? accent : undefined }}
    />
    <span className="flex-1 font-minecraft text-sm truncate">{label}</span>
    {typeof count === "number" && count > 0 && (
      <span className="text-xs font-minecraft text-white/40 tabular-nums">{count}</span>
    )}
  </button>
);
