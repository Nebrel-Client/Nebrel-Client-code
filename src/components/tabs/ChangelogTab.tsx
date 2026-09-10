"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import { LibraryHeader } from "../ui/LibraryHeader";
import { useThemeStore } from "../../store/useThemeStore";
import { fetchChangelogReleases } from "../../services/nrc-service";
import type { ChangelogRelease } from "../../types/wordPress";
import { parseErrorMessage } from "../../utils/error-utils";

/**
 * The changelog, one card per released version, newest at the top. Entries are
 * grouped into optional named sections so a release can be a flat list or split
 * into New Features / Bugfixes without needing two layouts.
 */
export function ChangelogTab() {
  const { t } = useTranslation();
  const accentColor = useThemeStore((s) => s.accentColor);
  const [releases, setReleases] = useState<ChangelogRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setReleases(await fetchChangelogReleases());
    } catch (err) {
      console.error("[ChangelogTab] Failed to load the changelog:", err);
      setError(parseErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="nebrel-library flex flex-col h-full">
      <LibraryHeader section="changelog" />

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Icon icon="svg-spinners:ring-resize" className="w-9 h-9 text-white/40" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center text-center py-24">
            <Icon icon="ph:warning-duotone" className="w-10 h-10 text-red-400 mb-3" />
            <p className="font-smallcaps text-lg text-white/85">{t("common.error")}</p>
            <p className="font-minecraft text-xs text-white/40 mt-2 max-w-[42ch]">{error}</p>
            <button
              onClick={load}
              className="nebrel-settings-pill mt-5 px-5 text-white/80 hover:text-white"
            >
              {t("common.try_again")}
            </button>
          </div>
        ) : releases.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24">
            <span
              className="w-16 h-16 rounded-2xl grid place-items-center mb-4"
              style={{
                backgroundColor: `${accentColor.value}14`,
                border: `1px solid ${accentColor.value}2b`,
              }}
            >
              <Icon
                icon="ph:lightbulb-filament-duotone"
                className="w-8 h-8"
                style={{ color: accentColor.value }}
              />
            </span>
            <p className="font-smallcaps text-lg text-white/85">
              {t("nebrel.changelog.empty")}
            </p>
          </div>
        ) : (
          <div className="nebrel-changelog-list">
            {releases.map((release) => (
              <ReleaseCard key={release.version} release={release} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReleaseCard({ release }: Readonly<{ release: ChangelogRelease }>) {
  const date = release.date
    ? new Date(release.date).toLocaleDateString(undefined, {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <article className="nebrel-changelog-card">
      {/* Version, a rule that fills the gap, then the date hard right. */}
      <header className="nebrel-changelog-head">
        <h2>{release.version}</h2>
        <span className="nebrel-changelog-rule" aria-hidden="true" />
        {date && <time dateTime={release.date}>{date}</time>}
      </header>

      {release.sections.map((section, index) => (
        <section key={section.title ?? index} className="nebrel-changelog-section">
          {section.title && <h3>{section.title}</h3>}
          <ul>
            {section.entries.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
