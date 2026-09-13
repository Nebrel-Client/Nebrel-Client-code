"use client";

import { useEffect } from "react";
import { FriendsPanel } from "../friends/FriendsPanel";
import { ErrorMessage } from "../ui/ErrorMessage";
import { useMinecraftAuthStore } from "../../store/minecraft-auth-store";
import { useProfileStore } from "../../store/profile-store";
import { PlayerActionsDisplay } from "../launcher/PlayerActionsDisplay";
// DISABLED: Snow effect (seasonal feature)
// import { SnowEffectToggle } from "../ui/SnowEffectToggle";
import { ReferralBanner } from "../ui/ReferralBanner";
import { ApplixirAdButton } from "../ui/ApplixirAdButton";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useQualitySettingsStore } from "../../store/quality-settings-store";
import { setDiscordState } from "../../utils/discordRpc";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";

export function PlayTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    profiles,
    selectedProfile: storeSelectedProfile,
    loading,
    error: profilesError,
    setSelectedProfile,
  } = useProfileStore();

  const { activeAccount } = useMinecraftAuthStore();
  const { cosmeticRenderer3d, setCosmeticRenderer3d } = useQualitySettingsStore();

  useEffect(() => { setDiscordState("Idling"); }, []);

  useEffect(() => {
    if (!storeSelectedProfile && profiles.length > 0) {
      setSelectedProfile(profiles[0]);
    }
  }, [storeSelectedProfile, profiles, setSelectedProfile]);

  const handleVersionChange = (versionId: string) => {
    const profileToSelect = profiles.find((p) => p.id === versionId) || null;
    setSelectedProfile(profileToSelect);
  };

  const currentDisplayProfile =
    storeSelectedProfile || (profiles.length > 0 ? profiles[0] : null);

  const versions = profiles.map((profile) => ({
    id: profile.id,
    label: `${profile.name}`,
    icon: profile.loader === "vanilla" ? undefined : profile.loader,
    isCustom: profile.loader !== "vanilla",
    profileId: profile.id,
  }));

  // promo-outline shader settings for the 3D player preview
  const outline = { strength: 4, thickness: 3, sensitivity: 0.1 };

  return (
    <div className="nebrel-play flex h-full relative">
      <div className="nebrel-play-stage flex-grow flex flex-col items-center justify-center p-8 relative z-15">
        <div className="nebrel-play-grid absolute inset-0 pointer-events-none" aria-hidden="true" />

        <div className="nebrel-play-toolbar absolute top-6 left-7 right-7 z-20 flex items-center justify-between gap-4">
          <div className="nebrel-play-kicker">
            <span className="nebrel-play-kicker-mark">
              <img
                src="/nebrel_badge.png"
                alt=""
                className="h-6 w-6 object-contain"
              />
            </span>
            <div>
              <span className="nebrel-play-eyebrow">NEBREL / PLAYSPACE</span>
              <span className="nebrel-play-caption">{t("nav.play")}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="nebrel-play-online-status">
              <span className="nebrel-play-status-dot" />
              <span>ONLINE</span>
            </div>
            <ReferralBanner />
          </div>
        </div>

        <div className="absolute top-24 right-7 z-20 flex items-center gap-3">
          <ApplixirAdButton />
          <div className="nebrel-play-toggle">
            <span>{t("settings.background.skin_animation")}</span>
            <ToggleSwitch
              checked={cosmeticRenderer3d}
              onChange={() => setCosmeticRenderer3d(!cosmeticRenderer3d)}
              size="sm"
            />
          </div>
        </div>

        <div className="nebrel-play-hero relative z-10">
          {profilesError && !loading && (
            <ErrorMessage
              message={profilesError || "An unknown error occurred"}
            />
          )}

          <div className="nebrel-player-stage relative z-10">
            <PlayerActionsDisplay
              displayMode="playerName"
              playerName={
                activeAccount?.minecraft_username || activeAccount?.username
              }
              launchButtonDefaultVersion={
                storeSelectedProfile?.id || versions[0]?.id || ""
              }
              onLaunchVersionChange={handleVersionChange}
              launchButtonVersions={versions}
              className=""
              outline={outline}
            />
          </div>
        </div>

        <div className="nebrel-play-quick-actions absolute bottom-7 left-7 right-7 z-20">
          <button
            type="button"
            className="nebrel-play-action-card"
            onClick={() => navigate("/profiles")}
          >
            <span className="nebrel-play-action-icon">
              <Icon icon="ph:cube-duotone" className="w-5 h-5" />
            </span>
            <span className="min-w-0 text-left">
              <strong>PROFILE LIBRARY</strong>
              <small>{profiles.length} available profile{profiles.length === 1 ? "" : "s"}</small>
            </span>
            <Icon icon="ph:arrow-up-right-bold" className="w-4 h-4 ml-auto opacity-50" />
          </button>
          <button
            type="button"
            className="nebrel-play-action-card"
            onClick={() => navigate("/mods")}
          >
            <span className="nebrel-play-action-icon">
              <Icon icon="ph:puzzle-piece-duotone" className="w-5 h-5" />
            </span>
            <span className="min-w-0 text-left">
              <strong>MOD WORKSHOP</strong>
              <small>Shape your next session</small>
            </span>
            <Icon icon="ph:arrow-up-right-bold" className="w-4 h-4 ml-auto opacity-50" />
          </button>
          <div className="nebrel-play-session-card">
            <span className="nebrel-play-session-icon">
              <Icon icon="ph:sparkle-duotone" className="w-5 h-5" />
            </span>
            <span className="min-w-0 text-left">
              <strong>READY WHEN YOU ARE</strong>
              <small>{currentDisplayProfile?.loader || "Select a profile"} · Nebrel client</small>
            </span>
          </div>
        </div>
      </div>

      <FriendsPanel className="nebrel-news backdrop-blur-lg overflow-hidden relative z-10" />
    </div>
  );
}
