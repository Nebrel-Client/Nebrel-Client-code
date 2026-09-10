"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import { LibraryHeader } from "../ui/LibraryHeader";
import { useThemeStore } from "../../store/useThemeStore";
import { fetchNewsAndChangelogs } from "../../services/nrc-service";
import { openExternalUrl } from "../../services/tauri-service";
import type { BlogPost } from "../../types/wordPress";
import { parseErrorMessage } from "../../utils/error-utils";

/** Category ids the feed uses, matching the ones in news.json. */
const CATEGORY = { news: 21, changelog: 2 } as const;

interface FeedTabProps {
  /** Which half of the feed to show. */
  section: keyof typeof CATEGORY;
}

/**
 * Full-page view of the news feed. News and changelog are the same source
 * filtered by category, so they share this component rather than duplicating
 * the fetch, the empty state and the card.
 */
export function FeedTab({ section }: FeedTabProps) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const all = await fetchNewsAndChangelogs();
      setPosts(all.filter((post) => post.categories?.includes(CATEGORY[section])));
    } catch (err) {
      console.error("[FeedTab] Failed to load the feed:", err);
      setError(parseErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [section]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="nebrel-library flex flex-col h-full">
      <LibraryHeader section={section} />

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Icon icon="svg-spinners:ring-resize" className="w-9 h-9 text-white/40" />
          </div>
        ) : error ? (
          <FeedMessage
            icon="ph:warning-duotone"
            title={t("common.error")}
            body={error}
            action={{ label: t("common.try_again"), onClick: load }}
          />
        ) : posts.length === 0 ? (
          <FeedMessage
            icon="ph:newspaper-duotone"
            title={t("news.no_news_available")}
            body={t(`nebrel.${section}.empty`)}
          />
        ) : (
          <>
            {/* Newest entry gets the full width, the rest tile below it. */}
            <FeedCard post={posts[0]} featured />
            {posts.length > 1 && (
              <div className="nebrel-feed-grid mt-4">
                {posts.slice(1).map((post) => (
                  <FeedCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FeedCard({ post, featured = false }: Readonly<{ post: BlogPost; featured?: boolean }>) {
  const { t } = useTranslation();
  const accentColor = useThemeStore((s) => s.accentColor);
  const seo = post.yoast_head_json;

  // Blog titles carry a site suffix that is noise once the page says "News".
  const title = (seo?.title ?? t("news.item")).replace(/\s+-\s+Nebrel Blog$/, "");
  const summary = seo?.description || seo?.og_description || "";
  const image = seo?.og_image?.[0]?.url ?? null;
  const url = seo?.og_url ?? null;

  const date = post.date
    ? new Date(post.date).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  const open = () => {
    if (url) openExternalUrl(url).catch(console.error);
  };

  return (
    <article
      className={featured ? "nebrel-feed-card nebrel-feed-card-featured" : "nebrel-feed-card"}
      role={url ? "button" : undefined}
      tabIndex={url ? 0 : undefined}
      onClick={url ? open : undefined}
      onKeyDown={url ? (e) => (e.key === "Enter" || e.key === " ") && open() : undefined}
    >
      <div className="nebrel-feed-thumb">
        {image ? (
          <img src={image} alt="" loading="lazy" />
        ) : (
          // No image is normal for a changelog entry, so show the accent mark
          // rather than a broken frame.
          <span className="nebrel-feed-thumb-fallback" style={{ color: accentColor.value }}>
            <Icon icon="ph:newspaper-duotone" />
          </span>
        )}
      </div>

      <div className="nebrel-feed-body">
        {date && <span className="nebrel-feed-date">{date}</span>}
        <h2 title={title}>{title}</h2>
        {summary && <p>{summary}</p>}
        {url && (
          <span className="nebrel-feed-link" style={{ color: accentColor.value }}>
            {t("news.read_more")}
            <Icon icon="ph:arrow-right-bold" className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </article>
  );
}

function FeedMessage({
  icon,
  title,
  body,
  action,
}: Readonly<{
  icon: string;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}>) {
  const accentColor = useThemeStore((s) => s.accentColor);

  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <span
        className="w-16 h-16 rounded-2xl grid place-items-center mb-4"
        style={{
          backgroundColor: `${accentColor.value}14`,
          border: `1px solid ${accentColor.value}2b`,
        }}
      >
        <Icon icon={icon} className="w-8 h-8" style={{ color: accentColor.value }} />
      </span>
      <p className="font-smallcaps text-lg text-white/85">{title}</p>
      {body && <p className="font-minecraft text-xs text-white/40 mt-2 max-w-[38ch]">{body}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="nebrel-settings-pill mt-5 px-5 text-white/80 hover:text-white"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
