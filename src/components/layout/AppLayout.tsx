"use client";

import type React from "react";
import { type ReactNode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Icon } from "@iconify/react";

import { VerticalNavbar } from ".././navigation/VerticalNavbar";
import { UserProfileBar } from ".././header/UserProfileBar";
import { NavigationHistory } from "../ui/NavigationHistory";
import { useThemeStore } from "../../store/useThemeStore";
import { useBackgroundEffectStore } from "../../store/background-effect-store";
import CustomMediaBackground from "../effects/CustomMediaBackground";
import { Snowfall } from "../../features/snow-effect/Snowfall";
import { useSnowEffectStore } from "../../store/snow-effect-store";
import * as ConfigService from "../../services/launcher-config-service";
import { FriendsSidebar } from "../friends/FriendsSidebar";
import { useFriendsWebSocket } from "../../hooks/useFriendsWebSocket";
import { useFriendsStore } from "../../store/friends-store";
import { useChatStore } from "../../store/chat-store";
import { checkUpdateAvailable, downloadAndInstallUpdate } from "../../services/nrc-service";
import type { UpdateInfo } from "../../types/updater";
const ProfileWizardV2Modal = lazy(() => import("../modals/ProfileWizardV2Modal").then((m) => ({ default: m.ProfileWizardV2Modal })));
const ProfileSettingsModal = lazy(() => import("../modals/ProfileSettingsModal").then((m) => ({ default: m.ProfileSettingsModal })));
const SettingsModal = lazy(() => import("../modals/SettingsModal").then((m) => ({ default: m.SettingsModal })));
const ProfileDuplicateModal = lazy(() => import("../modals/ProfileDuplicateModal").then((m) => ({ default: m.ProfileDuplicateModal })));
import { exit, relaunch } from '@tauri-apps/plugin-process';
import { Tooltip } from "../ui/Tooltip";
import { HeaderInfoCarousel } from "../header/HeaderInfoCarousel";
import { toast } from 'react-hot-toast';
import { useTranslation } from "react-i18next";
import { parseErrorMessage } from "../../utils/error-utils";

const appConfig = {
  version: "v0.5.22",
};

interface AppLayoutProps {
  children: ReactNode;
  activeTab: string;
  onNavChange: (tabId: string) => void;
}

export function AppLayout({
  children,
  activeTab,
  onNavChange,
}: AppLayoutProps) {
  const { t } = useTranslation();
  const launcherRef = useRef<HTMLDivElement>(null);
  const backgroundPatternRef = useRef<HTMLDivElement>(null);
  const minimizeRef = useRef<HTMLDivElement>(null);
  const maximizeRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const { customMediaUrl, customMediaOnlyOnPlay, customMediaHideEffects } = useBackgroundEffectStore();
  const isCustomMediaVisible = Boolean(customMediaUrl) && (!customMediaOnlyOnPlay || activeTab === 'play');
  const shouldShowEffects = !(isCustomMediaVisible && customMediaHideEffects);

  const navItems = [
    { id: "play", icon: "ph:game-controller-fill", label: t("nav.play") },
    { id: "server-hosting", icon: "ph:hard-drives-fill", label: "Server-Hosting" },
    { id: "profiles", icon: "ph:cube-fill", label: t("nav.profiles") },
    { id: "changelog", icon: "ph:lightbulb-filament-fill", label: t("nav.changelog") },
    { id: "news", icon: "ph:newspaper-fill", label: t("nav.news") },
    { id: "mods", icon: "ph:puzzle-piece-fill", label: t("nav.mods") },
    { id: "skins", icon: "ph:users-fill", label: t("nav.skins") },
    { id: "capes", icon: "ph:storefront-fill", label: t("nav.capes") },
    // DISABLED: Advent Calendar (seasonal feature)
    // { id: "advent-calendar", icon: "solar:gift-bold", label: t("nav.advent") },
    { id: "settings", icon: "ph:gear-fill", label: t("nav.settings"), isAction: true },
  ];
  const { isBackgroundAnimationEnabled, accentColor: themeAccentColor, accentColor } = useThemeStore();
  const { isEnabled: isSnowEnabled } = useSnowEffectStore();
  const { connectWebSocket, loadCurrentUser, loadFriends } = useFriendsStore();
  const { loadChats } = useChatStore();

  useFriendsWebSocket();

  const getComplementaryBackground = () => {
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: Number.parseInt(result[1], 16),
            g: Number.parseInt(result[2], 16),
            b: Number.parseInt(result[3], 16),
          }
        : { r: 34, g: 34, b: 34 };
    };

    const rgb = hexToRgb(themeAccentColor.value);

    const darkR = Math.floor(rgb.r * 0.1);
    const darkG = Math.floor(rgb.g * 0.1);
    const darkB = Math.floor(rgb.b * 0.1);

    const finalR = Math.min(darkR, 30);
    const finalG = Math.min(darkG, 30);
    const finalB = Math.min(darkB, 30);

    return `rgb(${finalR}, ${finalG}, ${finalB})`;
  };

  const getComplementaryBackgroundWithAlpha = (alpha: number) => {
    const rgb = getComplementaryBackground();
    return rgb.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  };

  const backgroundColor = getComplementaryBackground();

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(launcherRef.current, {
        opacity: 0,
        scale: 0.95,
        duration: 0.8,
        ease: "power3.out",
      });

      if (backgroundPatternRef.current) {
        gsap.to(backgroundPatternRef.current, {
          backgroundPosition: "100% 100%",
          duration: 120,
          repeat: -1,
          ease: "none",
        });
      }
    });

    const setupWindowControls = async () => {
      try {
        const tauriModule = await import("@tauri-apps/api/window").catch(
          () => null,
        );

        if (tauriModule) {
          const { Window } = tauriModule;
          const currentWindow = Window.getCurrent();

          if (minimizeRef.current) {
            minimizeRef.current.addEventListener("click", () =>
              currentWindow.minimize(),
            );
          }

          if (maximizeRef.current) {
            maximizeRef.current.addEventListener("click", () =>
              currentWindow.toggleMaximize(),
            );
          }

          if (closeRef.current) {
            closeRef.current.addEventListener("click", () =>
              exit(0),
            );
          }
        } else {
          console.log(
            "Tauri API not available, window controls will be decorative only",
          );
        }
      } catch (error) {
        console.error("Failed to initialize window controls:", error);
      }
    };

    setupWindowControls();

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={launcherRef}
      className="nebrel-shell h-screen w-full bg-black/50 backdrop-blur-lg border overflow-hidden relative flex shadow-[0_0_25px_rgba(0,0,0,0.4)]"
      style={{
        backgroundColor: backgroundColor,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundImage: isCustomMediaVisible 
          ? `linear-gradient(to bottom right, ${getComplementaryBackgroundWithAlpha(0.3)}, rgba(0,0,0,0.5))`
          : `linear-gradient(to bottom right, ${backgroundColor}, rgba(0,0,0,0.9))`,
        borderColor: `${themeAccentColor.value}30`,
        boxShadow: `0 0 15px ${themeAccentColor.value}30, inset 0 0 10px ${themeAccentColor.value}20`,
      }}
    >
      {/* The shell uses a quiet hairline frame. */}

      <VerticalNavbar
        items={navItems}
        activeItem={activeTab}
        onItemClick={onNavChange}
        className="h-full z-10"
        version={appConfig.version}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <HeaderBar
          minimizeRef={minimizeRef}
          maximizeRef={maximizeRef}
          closeRef={closeRef}
        />

        <div className="flex-1 relative overflow-hidden">
          <CustomMediaBackground activeTab={activeTab} />
          {/* Snow overlay - independent of theme/background */}
          {shouldShowEffects && isSnowEnabled && <Snowfall />}

          <div className="relative z-10 h-full overflow-hidden custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
      {/* Global Modals Portal */}
      <Suspense fallback={null}>
        <ProfileWizardV2Modal />
        <ProfileSettingsModal />
        <SettingsModal />
        <ProfileDuplicateModal />
      </Suspense>
      <FriendsSidebar />
    </div>
  );
}

function BorderGlowEffects({ accentColor }: { accentColor: string }) {
  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(to right, transparent, ${accentColor}70, transparent)`,
        }}
      ></div>
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(to right, transparent, ${accentColor}70, transparent)`,
        }}
      ></div>
      <div
        className="absolute top-0 bottom-0 left-0 w-[2px]"
        style={{
          background: `linear-gradient(to bottom, transparent, ${accentColor}70, transparent)`,
        }}
      ></div>
      <div
        className="absolute top-0 bottom-0 right-0 w-[2px]"
        style={{
          background: `linear-gradient(to bottom, transparent, ${accentColor}70, transparent)`,
        }}
      ></div>
    </>
  );
}

interface HeaderBarProps {
  minimizeRef: React.RefObject<HTMLDivElement>;
  maximizeRef: React.RefObject<HTMLDivElement>;
  closeRef: React.RefObject<HTMLDivElement>;
}

function HeaderBar({ minimizeRef, maximizeRef, closeRef }: HeaderBarProps) {
  const { t } = useTranslation();
  const accentColor = useThemeStore((state) => state.accentColor);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateClick = async () => {
    if (isUpdating) return; // Prevent multiple simultaneous downloads

    setIsUpdating(true);
    try {
      await toast.promise(
        downloadAndInstallUpdate(),
        {
          loading: t('header.update.downloading'),
          success: t('header.update.success'),
          error: (err) => t('header.update.failed', { error: parseErrorMessage(err) }),
        }
      );
    } catch (error) {
      console.error("Failed to download and install update:", error);
      // Toast error is already handled by the promise toast
    } finally {
      setIsUpdating(false);
    }
  };

  // Calculate complementary/update highlight color based on current accent
  const getUpdateHighlightColor = () => {
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: Number.parseInt(result[1], 16),
            g: Number.parseInt(result[2], 16),
            b: Number.parseInt(result[3], 16),
          }
        : { r: 245, g: 158, b: 11 }; // fallback to amber
    };

    const rgb = hexToRgb(accentColor.value);

    // Calculate a complementary warning color
    // Mix current accent with amber/yellow for good visibility
    const accentWeight = 0.4; // How much of the accent color to include
    const warningWeight = 0.9; // How much of the warning color (amber)

    const warningRgb = { r: 245, g: 158, b: 100 }; // Amber base

    const mixedR = Math.round(rgb.r * accentWeight + warningRgb.r * warningWeight);
    const mixedG = Math.round(rgb.g * accentWeight + warningRgb.g * warningWeight);
    const mixedB = Math.round(rgb.b * accentWeight + warningRgb.b * warningWeight);

    return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
  };

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const fetchedVersion = await ConfigService.getAppVersion();
        setAppVersion(fetchedVersion);
      } catch (error) {
        console.error("Failed to fetch app version:", error);
        setAppVersion("?.?.?");
      }
    };

  const checkForUpdates = async () => {
    try {
      const updateInfo = await checkUpdateAvailable();
      if (updateInfo) {
        console.log("Update available:", updateInfo);
        setAvailableUpdate(updateInfo);
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      // Don't show error to user, just silently fail
    }
  };

    fetchVersion();
    checkForUpdates();

    // Check for updates every 4 hours (4 * 60 * 60 * 1000 = 14,400,000 ms)
    const updateCheckInterval = setInterval(() => {
      console.log("Performing scheduled update check...");
      checkForUpdates();
    }, 4 * 60 * 60 * 1000);

    return () => {
      clearInterval(updateCheckInterval);
    };
  }, []);

  return (
    <div
      className="nebrel-titlebar h-16 flex-shrink-0 border-b backdrop-blur-lg flex items-center justify-between px-8 z-10"
      style={{
        borderColor: `${accentColor.value}26`,
        // A wash that fades out to the right, rather than a flat tinted bar.
        backgroundImage: `linear-gradient(105deg, ${accentColor.value}1f 0%, transparent 55%)`,
      }}
      data-tauri-drag-region
    >
      <div className="flex items-center gap-4" data-tauri-drag-region>
        <NavigationHistory />

        <div className="flex flex-col items-start">
          <div className="flex items-center gap-3">
            <h1
              className="font-smallcaps text-2xl font-bold text-shadow"
              style={{ letterSpacing: "0.34em" }}
              data-tauri-drag-region
            >
              NEBREL
            </h1>
            {availableUpdate && (
              <Tooltip content={isUpdating ? t('header.update.tooltip_updating') : t('header.update.tooltip_available', { version: availableUpdate.version })}>
                <div
                  className={isUpdating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                  onClick={handleUpdateClick}
                >
                  <Icon
                    icon={isUpdating ? "solar:download-minimalistic-bold" : "solar:download-minimalistic-bold"}
                    className={`w-6 h-6 transition-colors ${isUpdating ? 'animate-pulse' : ''}`}
                    style={{
                      color: accentColor.value,
                    }}
                  />
                </div>
              </Tooltip>
            )}
          </div>
          <HeaderInfoCarousel version={appVersion} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <UserProfileBar />

        <WindowControls
          minimizeRef={minimizeRef}
          maximizeRef={maximizeRef}
          closeRef={closeRef}
        />
      </div>
    </div>
  );
}

interface WindowControlsProps {
  minimizeRef: React.RefObject<HTMLDivElement>;
  maximizeRef: React.RefObject<HTMLDivElement>;
  closeRef: React.RefObject<HTMLDivElement>;
}

function WindowControls({
  minimizeRef,
  maximizeRef,
  closeRef,
}: WindowControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 ml-4">
      <div
        ref={minimizeRef}
        className="titlebar-button-borderless w-5 h-5 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
        title={t('window.minimize')}
      >
        <Icon icon="ph:minus-bold" className="w-4 h-4" />
      </div>
      <div
        ref={maximizeRef}
        className="titlebar-button-borderless w-5 h-5 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
        title={t('window.maximize')}
      >
        <Icon icon="ph:corners-out-bold" className="w-4 h-4" />
      </div>
      <div
        ref={closeRef}
        className="titlebar-button-borderless w-5 h-5 flex items-center justify-center text-white/60 hover:text-red-500 transition-colors cursor-pointer"
        title={t('window.close')}
      >
        <Icon icon="ph:x-bold" className="w-4 h-4" />
      </div>
    </div>
  );
}
