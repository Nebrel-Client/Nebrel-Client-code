"use client";

import { Fragment, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
const DebugSection = lazy(() => import("./DebugSection").then((m) => ({ default: m.DebugSection })));
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

  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchValue), 150);
    return () => clearTimeout(id);
  }, [searchValue]);
  const sidebarQuery = debouncedSearch.trim().toLowerCase();

  useEffect(() => { setDiscordState("Configuring Settings"); }, []);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab, sidebarQuery]);

  const tabConfig: { id: SettingsTabId; label: string; icon: string }[] = [
    { id: "general", label: t("settings.tabs.general"), icon: "ph:sliders-horizontal-duotone" },
    { id: "appearance", label: t("settings.tabs.appearance"), icon: "ph:paint-brush-broad-duotone" },
    { id: "advanced", label: t("settings.tabs.advanced"), icon: "ph:wrench-duotone" },
    { id: "debug", label: t("settings.tabs.debug"), icon: "ph:bug-duotone" },
  ];

  const selectTab = (id: SettingsTabId) => {
    setSearchValue("");
    setActiveTab(id);
  };
  const contentRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    if (activeTab === "debug") {
      return (
        <Suspense fallback={<Icon icon="svg-spinners:ring-resize" className="w-8 h-8 text-white/50 mx-auto my-12" />}>
          <DebugSection />
        </Suspense>
      );
    }
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
      headerClassName="nebrel-settings-header"
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
      <div className="nebrel-settings-layout flex flex-col h-full min-h-0">
        <div className="nebrel-settings-toolbar flex items-center gap-4 flex-wrap flex-shrink-0">
          <div className="nebrel-settings-tabstrip flex items-center gap-1 flex-wrap">
            <div className="nebrel-settings-nav-label">LAUNCHER CONFIG</div>
            {tabConfig.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={cn(
                    "nebrel-settings-pill flex items-center gap-2",
                    isActive ? "is-active text-white" : "is-inactive text-white/55 hover:text-white/90",
                  )}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => selectTab(tab.id)}
                >
                  <Icon
                    icon={tab.icon}
                    className="w-4 h-4 flex-shrink-0 transition-colors duration-200"
                    style={{ color: isActive ? accentColor.value : undefined }}
                  />
                  <span className="font-smallcaps text-base transition-colors duration-200">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto w-full sm:w-72">
            <SearchWithFilters
              placeholder={t("settings.search_placeholder")}
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              showSort={false}
              showFilter={false}
              compact
              className="w-full"
            />
          </div>
        </div>

        <div
          ref={contentRef}
          className="nebrel-settings-content flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar"
        >
          <div className="nebrel-settings-workspace">
            <div className="nebrel-settings-workspace-kicker">
              <span>{tabConfig.find((tab) => tab.id === activeTab)?.label}</span>
              <span className="nebrel-settings-save-state">{saving ? "SAVING..." : "LOCAL SETTINGS"}</span>
            </div>
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