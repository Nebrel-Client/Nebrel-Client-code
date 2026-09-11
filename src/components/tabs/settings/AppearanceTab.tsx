"use client";

import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { SnowEffectToggle } from "../../ui/SnowEffectToggle";
import { RangeSlider } from "../../ui/RangeSlider";
import { SettingsSection } from "../../ui/settings/SettingsSection";
import { SettingRow } from "../../ui/settings/SettingRow";
import { FontSelector } from "../../FontSelector";
import { useThemeStore } from "../../../store/useThemeStore";
import { useBackgroundEffectStore } from "../../../store/background-effect-store";
import { useQualitySettingsStore } from "../../../store/quality-settings-store";
import { useSettingsConfig, useSettingsKeywords } from "./settings-context";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "../../ui/buttons/Button";
import { Icon } from "@iconify/react";

const QUALITY_LEVELS = ["low", "medium", "high"] as const;
type QualityLevel = (typeof QUALITY_LEVELS)[number];

export function AppearanceTab() {
  const { t } = useTranslation();
  const kw = useSettingsKeywords();
  const { saving } = useSettingsConfig();
  const { staticBackground, toggleStaticBackground, toggleBackgroundAnimation, showNavLabels, toggleNavLabels } =
    useThemeStore();
  const {
    customMediaUrl, customMediaOpacity, customMediaBlur, customMediaQuality, customMediaOnlyOnPlay, customMediaHideEffects,
    setCustomMedia, setCustomMediaOpacity, setCustomMediaBlur, setCustomMediaQuality, setCustomMediaOnlyOnPlay, setCustomMediaHideEffects
  } = useBackgroundEffectStore();
  const { qualityLevel, setQualityLevel, cosmeticRenderer3d, setCosmeticRenderer3d } =
    useQualitySettingsStore();

  return (
    <div className="space-y-6">
      <SettingsSection
        id="settings-section-font"
        title={t("settings.font.title")}
        icon="ph:text-aa-duotone"
        keywords={kw("settings.font.title", "font", "schrift", "schriftart", "typography", "typografie", "text")}
        description={t("settings.font.description")}
      >
        <div className="py-3">
          <FontSelector disabled={saving} />
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-section-background"
        title={t("settings.background.title")}
        icon="ph:sparkle-duotone"
        keywords={kw("settings.background.title", "color", "colour", "farbe", "hintergrund", "background", "effekt", "effect", "animation", "animationen")}
        description={t("settings.background.description")}
      >
        <SettingRow label={t("settings.background.animations")} searchKeywords={kw("settings.background.animations", "animation", "animationen", "motion")} disabled={saving}>
          <ToggleSwitch
            checked={!staticBackground}
            onChange={() => {
              toggleStaticBackground();
              toggleBackgroundAnimation();
            }}
            disabled={saving}
            size="md"
          />
        </SettingRow>
        <SettingRow label={t("settings.background.skin_animation")} searchKeywords={kw("settings.background.skin_animation", "skin", "animation", "cape", "3d")} disabled={saving}>
          <ToggleSwitch
            checked={cosmeticRenderer3d}
            onChange={() => setCosmeticRenderer3d(!cosmeticRenderer3d)}
            disabled={saving}
            size="md"
          />
        </SettingRow>
        <SettingRow label={t("settings.nav_labels")} description={t("settings.nav_labels.tooltip")} searchKeywords={kw("settings.nav_labels", "sidebar", "labels", "text", "beschriftung", "navigation", "nav", "icons")}>
          <ToggleSwitch checked={showNavLabels} onChange={toggleNavLabels} size="md" />
        </SettingRow>
        <SettingRow label={t("settings.background.snow")} searchKeywords={kw("settings.background.snow", "snow", "schnee", "winter")} disabled={saving}>
          <SnowEffectToggle showLabel={false} size="md" disabled={saving} />
        </SettingRow>
        <SettingRow
          label={t("settings.background.quality")}
          searchKeywords={kw("settings.background.quality", "quality", "qualität", "performance", "leistung", "fps")}
          disabled={saving}
          vertical
        >
          <RangeSlider
            value={QUALITY_LEVELS.indexOf(qualityLevel as QualityLevel)}
            onChange={(v) => setQualityLevel(QUALITY_LEVELS[v] ?? "medium")}
            min={0}
            max={2}
            step={1}
            disabled={saving}
            variant="flat"
            size="sm"
            showValue={false}
            minLabel={t("settings.background.quality_low")}
            maxLabel={t("settings.background.quality_high")}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        id="settings-section-custom-background"
        title={t("settings.custom_background.title")}
        icon="ph:images-duotone"
        keywords={kw("settings.custom_background.title", "custom", "background", "video", "image", "bild", "hintergrund", "mp4", "gif")}
        description={t("settings.custom_background.description")}
      >
        {customMediaUrl && (
          <div className="nebrel-settings-preview relative w-full aspect-[16/6] mb-3">
            {customMediaUrl.match(/\.(mp4|webm)$/i) ? (
              <video
                key={customMediaUrl}
                src={convertFileSrc(customMediaUrl)}
                className="w-full h-full object-cover"
                style={{ opacity: customMediaOpacity, filter: `blur(${customMediaBlur}px)` }}
                autoPlay muted loop playsInline
              />
            ) : (
              <img
                src={convertFileSrc(customMediaUrl)}
                alt=""
                className="w-full h-full object-cover"
                style={{ opacity: customMediaOpacity, filter: `blur(${customMediaBlur}px)` }}
              />
            )}
          </div>
        )}

        <SettingRow label={t("settings.custom_background.select")} searchKeywords={kw("settings.custom_background.select", "select", "auswählen", "datei")}>
          <div className="flex items-center gap-2">
            {customMediaUrl && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCustomMedia(null, null)}
                icon={<Icon icon="ph:trash-duotone" />}
              >
                {t("settings.custom_background.clear")}
              </Button>
            )}
            <Button
              variant="flat"
              size="sm"
              onClick={async () => {
                const selected = await open({
                  multiple: false,
                  filters: [{
                    name: 'Media',
                    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm']
                  }]
                });
                if (selected && typeof selected === 'string') {
                  const ext = selected.split('.').pop()?.toLowerCase();
                  const type = ext === 'mp4' || ext === 'webm' ? 'video' : 'image';
                  setCustomMedia(selected, type);
                }
              }}
              icon={<Icon icon="ph:folder-open-duotone" />}
            >
              {customMediaUrl ? t("settings.custom_background.change") : t("settings.custom_background.select")}
            </Button>
          </div>
        </SettingRow>
        
        {customMediaUrl && (
          <>
            <SettingRow label={t("settings.custom_background.opacity")} searchKeywords={kw("settings.custom_background.opacity", "opacity", "transparenz", "sichtbarkeit")} vertical>
              <RangeSlider
                value={Math.round(customMediaOpacity * 100)}
                onChange={(v) => setCustomMediaOpacity(v / 100)}
                min={0}
                max={100}
                step={1}
                variant="flat"
                size="sm"
                unit="%"
              />
            </SettingRow>

            <SettingRow label={t("settings.custom_background.blur")} searchKeywords={kw("settings.custom_background.blur", "blur", "unscharf", "weichzeichnen")} vertical>
              <RangeSlider
                value={customMediaBlur}
                onChange={setCustomMediaBlur}
                min={0}
                max={20}
                step={1}
                variant="flat"
                size="sm"
                minLabel="0"
                maxLabel="20"
              />
            </SettingRow>

            <SettingRow label={t("settings.background.quality")} searchKeywords={kw("settings.background.quality", "quality", "qualität", "performance", "leistung", "fps")} vertical>
              <RangeSlider
                value={QUALITY_LEVELS.indexOf(customMediaQuality as QualityLevel)}
                onChange={(v) => setCustomMediaQuality(QUALITY_LEVELS[v] ?? "medium")}
                min={0}
                max={2}
                step={1}
                variant="flat"
                size="sm"
                showValue={false}
                minLabel={t("settings.background.quality_low")}
                maxLabel={t("settings.background.quality_high")}
              />
            </SettingRow>

            <SettingRow label={t("settings.custom_background.only_on_play")} searchKeywords={kw("settings.custom_background.only_on_play", "play", "tab", "only")}>
              <ToggleSwitch checked={customMediaOnlyOnPlay} onChange={() => setCustomMediaOnlyOnPlay(!customMediaOnlyOnPlay)} size="md" />
            </SettingRow>

            <SettingRow label={t("settings.custom_background.hide_effects")} searchKeywords={kw("settings.custom_background.hide_effects", "hide", "effects", "effekte")}>
              <ToggleSwitch checked={customMediaHideEffects} onChange={() => setCustomMediaHideEffects(!customMediaHideEffects)} size="md" />
            </SettingRow>
          </>
        )}
      </SettingsSection>
    </div>
  );
}
