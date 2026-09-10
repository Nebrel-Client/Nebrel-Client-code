"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import { Button } from ".././ui/buttons/Button";
import type { LauncherConfig } from "../../types/launcherConfig";
import * as ConfigService from "../../services/launcher-config-service";
import { useThemeStore } from "../../store/useThemeStore";
import { cn } from "../../lib/utils";
import { toast } from "react-hot-toast";
import { ActionButton } from ".././ui/ActionButton";
import { Modal } from ".././ui/Modal";
import { SearchWithFilters } from ".././ui/SearchWithFilters";
import { SettingsSearchContext } from ".././ui/settings/SettingsSearchContext";
import { openLauncherDirectory } from "../../services/tauri-service";
import { DebugSection, getDebugTabs } from "./DebugSection";
import { GeneralTab } from "./settings/GeneralTab";
import { AppearanceTab } from "./settings/AppearanceTab";
import { AdvancedTab } from "./settings/AdvancedTab";
import { SettingsConfigProvider } from "./settings/settings-context";
import { useTranslation } from "react-i18next";
import { setDiscordState } from "../../utils/discordRpc";
import { parseErrorMessage } from "../../utils/error-utils";

type SettingsTabId = "general" | "appearance" | "advanced" | "debug";

interface SettingsTabProps {
  onClose: () => void;
}

export function SettingsTab({ onClose }: SettingsTabProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<LauncherConfig | null>(null);
  const [tempConfig, setTempConfig] = useState<LauncherConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false); const [activeTab, setActiveTab] = useState<SettingsTabId>(
    "general",
  );

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(sidebarSearch), 150);
    return () => clearTimeout(id);
  }, [sidebarSearch]);
  const sidebarQuery = debouncedSearch.trim().toLowerCase();

  useEffect(() => { setDiscordState("Configuring Settings"); }, []);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab, sidebarQuery]);

  const sectionDefs: Record<SettingsTabId, { id: string; label: string }[]> = {
    general: [
      { id: "language", label: t("settings.language") },
      { id: "accent", label: t("settings.accent_color.title") },
      { id: "behaviour", label: t("settings.sections.behaviour") },
      { id: "interface", label: t("settings.sections.interface") },
    ],
    appearance: [
      { id: "font", label: t("settings.font.title") },
      { id: "background", label: t("settings.background.title") },
      { id: "custom-background", label: t("settings.custom_background.title") },
    ],
    advanced: [
      { id: "login_cache", label: t("settings.sections.login_cache") },
      { id: "gamedir", label: t("settings.game_data_dir.title") },
      { id: "hooks", label: t("settings.hooks.title") },
      { id: "licenses", label: t("settings.licenses.title") },
    ],
    debug: getDebugTabs(t),
  };

  const tabConfig: {
    id: SettingsTabId;
    label: string;
    icon: string;
    children?: { id: string; label: string }[];
  }[] = [
    { id: "general", label: t("settings.tabs.general"), icon: "ph:sliders-horizontal-duotone", children: sectionDefs.general },
    { id: "appearance", label: t("settings.tabs.appearance"), icon: "ph:paint-brush-broad-duotone", children: sectionDefs.appearance },
    { id: "advanced", label: t("settings.tabs.advanced"), icon: "ph:wrench-duotone", children: sectionDefs.advanced },
    { id: "debug", label: t("settings.tabs.debug"), icon: "ph:bug-duotone", children: sectionDefs.debug },
  ];

  const selectTab = (id: SettingsTabId) => {
    setSidebarSearch("");
    setActiveTab(id);
  };
  const contentRef = useRef<HTMLDivElement>(null);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!activeSection) return;
    const el = sidebarListRef.current?.querySelector(`[data-section-id="${activeSection}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeSection]);

  const spySuppressRef = useRef(false);
  const spyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`settings-section-${id}`);
    if (!el) return;
    spySuppressRef.current = true;
    setActiveSection(id);
    if (spyTimeoutRef.current) clearTimeout(spyTimeoutRef.current);
    spyTimeoutRef.current = setTimeout(() => {
      spySuppressRef.current = false;
    }, 500);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (sidebarQuery) return;
    const root = contentRef.current;
    const defs = sectionDefs[activeTab];
    if (!root || !defs) {
      setActiveSection(null);
      return;
    }
    const onScroll = () => {
      if (spySuppressRef.current) return;
      const rootTop = root.getBoundingClientRect().top;
      const line = 80;
      let current = defs[0].id;
      for (const d of defs) {
        const el = document.getElementById(`settings-section-${d.id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top - rootTop <= line) current = d.id;
      }
      setActiveSection(current);
    };
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sidebarQuery, config, tempConfig]);

  const isResettingRef = useRef<boolean>(false);
  const { accentColor } = useThemeStore();

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null); try {
      const loadedConfig = await ConfigService.getLauncherConfig();
      const configWithHooks = {
        ...loadedConfig,
        hooks: loadedConfig.hooks || {
          pre_launch: null,
          wrapper: null,
          post_exit: null,
        },
      };
      setConfig(configWithHooks);
      setTempConfig({ ...configWithHooks });
    } catch (err) {
      console.error("Failed to load launcher config:", err);
      setError(parseErrorMessage(err));
      setConfig(null);
      setTempConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const autoSaveConfig = useCallback(async (configToSave: LauncherConfig) => {
    if (isResettingRef.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const updatedConfig =
          await ConfigService.setLauncherConfig(configToSave);
        setConfig(updatedConfig);
        toast.success(t("settings.toast.auto_saved"), {
          duration: 2000,
          position: "bottom-right",
        });
      } catch (err) {
        console.error("Failed to auto-save configuration:", err);
        const errorMessage = parseErrorMessage(err);
        toast.error(t("settings.toast.auto_save_failed", { error: errorMessage }));
      } finally {
        setSaving(false);
      }
    }, 500);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (
      tempConfig &&
      config &&
      JSON.stringify(config) !== JSON.stringify(tempConfig)
    ) {
      autoSaveConfig(tempConfig);
    }
  }, [tempConfig, config, autoSaveConfig]);

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Icon
              icon="svg-spinners:ring-resize"
              className="w-10 h-10 text-white/70 mx-auto mb-4"
            />
            <p className="text-base text-white/70 font-smallcaps">
              {t("settings.loading")}
            </p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-900/30 border-2 border-red-700/50 rounded-lg p-6 my-4">
          <div className="flex items-start gap-3">
            <Icon
              icon="solar:danger-triangle-bold"
              className="w-8 h-8 text-red-400 flex-shrink-0 mt-1"
            />
            <div>
              <h3 className="text-base text-red-300 font-smallcaps mb-2">
                {t("settings.error.title")}
              </h3>
              <p className="text-sm text-red-200/80 font-smallcaps mb-4">
                {error}
              </p>
              <Button
                onClick={loadConfig}
                variant="secondary"
                size="sm"
                icon={<Icon icon="solar:refresh-bold" className="w-5 h-5" />}
              >
                {t("common.try_again")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (!config || !tempConfig) {
      return (
        <div className="text-center p-8">
          <p className="text-base text-white/70 font-smallcaps">
            {t("settings.error.no_config")}
          </p>
        </div>
      );
    }

    const bodyOf: Partial<Record<SettingsTabId, ReactNode>> = {
      general: <GeneralTab />,
      appearance: <AppearanceTab />,
      advanced: <AdvancedTab />,
    };

    if (sidebarQuery) {
      const order: SettingsTabId[] = ["general", "appearance", "advanced"];
      const ordered = [activeTab, ...order.filter((id) => id !== activeTab)].filter(
        (id) => bodyOf[id],
      ) as SettingsTabId[];
      return (
        <div className="space-y-6">
          {ordered.map((id) => (
            <Fragment key={id}>{bodyOf[id]}</Fragment>
          ))}
        </div>
      );
    }

    if (activeTab === "debug") return <DebugSection />;
    return bodyOf[activeTab] ?? null;
  };


  return (
    <Modal
      title={t("nav.settings")}
      titleIcon={<Icon icon="ph:gear-six-duotone" className="w-8 h-8" />}
      titleSubtitle={
        <span className="font-minecraft text-xs text-white/45">
          {t("settings.subtitle")}
        </span>
      }
      onClose={onClose}
      width="xl"
      className="nebrel-settings !max-w-6xl h-[88vh] min-h-0 flex flex-col"
      headerActions={
        <ActionButton
          id="open-directory"
          label={t("settings.open_directory")}
          icon="solar:folder-bold"
          variant="highlight"
          tooltip={t("settings.open_directory.tooltip")}
          size="sm"
          onClick={async () => {
            try {
              await openLauncherDirectory();
            } catch (err) {
              console.error("Failed to open launcher directory:", err);
              toast.error(t("settings.open_directory.error", { error: parseErrorMessage(err) }));
            }
          }}
        />
      }
    >
      <div className="nebrel-settings-layout flex h-full p-5 gap-5">
        <div className="nebrel-settings-nav w-64 flex flex-col flex-shrink-0">
          <div className="px-1 pb-4">
            <h2 className="font-smallcaps text-xl text-white leading-none">
              {t("nav.settings")}
            </h2>
            <p className="font-minecraft text-xs text-white/40 mt-2 leading-relaxed">
              {t("settings.nav_hint")}
            </p>
          </div>
          <div className="px-1 pb-4">
            <SearchWithFilters
              placeholder={t("settings.search_placeholder")}
              searchValue={sidebarSearch}
              onSearchChange={setSidebarSearch}
              showSort={false}
              showFilter={false}
              compact
              className="w-full"
            />
          </div>
          <div ref={sidebarListRef} className="space-y-0 flex-1 overflow-y-auto custom-scrollbar">
            {tabConfig.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <div key={tab.id} className="mb-2">
                  <button
                    className={cn(
                      "nebrel-settings-pill w-full text-left flex items-center gap-3",
                      isActive
                        ? "text-white"
                        : "text-white/55 hover:text-white/90",
                    )}
                    style={
                      isActive
                        ? {
                            backgroundColor: `${accentColor.value}1f`,
                            borderColor: `${accentColor.value}5c`,
                          }
                        : undefined
                    }
                    onClick={() => selectTab(tab.id)}
                  >
                    <Icon
                      icon={tab.icon}
                      className="w-5 h-5 flex-shrink-0 transition-colors duration-200"
                      style={{ color: isActive ? accentColor.value : undefined }}
                    />
                    <span
                      className={cn(
                        "font-smallcaps text-lg transition-colors duration-200",
                        isActive && "font-medium",
                      )}
                    >
                      {tab.label}
                    </span>
                  </button>

                  {isActive && !sidebarQuery && tab.children && (
                    <div className="flex flex-col mt-2 mb-1 ml-7 border-l border-white/10">
                      {tab.children.map((child) => {
                        const childActive = activeSection === child.id;
                        return (
                          <button
                            key={child.id}
                            data-section-id={child.id}
                            className={cn(
                              "w-full text-left pl-4 pr-2 py-1.5 -ml-px border-l-2 outline-none font-smallcaps text-base transition-[color,border-color] duration-150",
                              childActive
                                ? "text-white"
                                : "border-transparent text-white/40 hover:text-white/75",
                            )}
                            style={childActive ? { borderColor: accentColor.value } : undefined}
                            onClick={() => scrollToSection(child.id)}
                          >
                            {child.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div
            ref={contentRef}
            className="flex-1 py-3 px-6 overflow-y-auto overflow-x-hidden custom-scrollbar min-w-0"
          >
            <SettingsConfigProvider value={{ config, tempConfig, setTempConfig, saving }}>
              <SettingsSearchContext.Provider value={sidebarQuery}>
                {renderTabContent()}
              </SettingsSearchContext.Provider>
            </SettingsConfigProvider>
          </div>
        </div>
      </div>
    </Modal>
  );
}