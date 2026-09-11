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

export function PlayTab() {
  const { t } = useTranslation();
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
        {/* Referral Banner - Top Left */}
        <div className="absolute top-3 left-3 z-20">
          <ReferralBanner />
        </div>

        {/* Watch Ad + 3D Render Toggle - Top Right */}
        <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-3">
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

        {/* <VersionInfo
          profileId={currentDisplayProfile?.id || ""}
          className="absolute top-6 left-6 z-10"
        /> */}

        <div className="nebrel-player-stage relative z-10">
          {profilesError && !loading && (
            <ErrorMessage
              message={profilesError || "An unknown error occurred"}
            />
          )}

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

      <FriendsPanel className="nebrel-news backdrop-blur-lg overflow-hidden relative z-10" />
    </div>
  );
}
