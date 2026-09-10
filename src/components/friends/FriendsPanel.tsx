"use client";

import { useEffect } from "react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { useFriendsStore } from "../../store/friends-store";
import { useThemeStore } from "../../store/useThemeStore";
import { FriendListItem } from "./FriendListItem";
import { FriendSkeleton } from "./FriendSkeleton";

/**
 * Friends column on the play screen. The sliding sidebar stays for chat and
 * requests; this is the always-visible list that sits where the news used to.
 */
export function FriendsPanel({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  const accentColor = useThemeStore((s) => s.accentColor);
  const { friends, isLoading, loadFriends, openSidebar } = useFriendsStore();

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // Online first, then by name, so the people you can actually play with are
  // at the top without the user having to scan.
  const sorted = [...friends].sort((a, b) => {
    const aOnline = a.state !== "OFFLINE";
    const bOnline = b.state !== "OFFLINE";
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    return a.username.localeCompare(b.username);
  });

  const onlineCount = friends.filter((f) => f.state !== "OFFLINE").length;

  return (
    <aside className={cn("nebrel-friends-panel flex flex-col", className)}>
      <header className="nebrel-friends-head">
        <Icon
          icon="ph:users-three-fill"
          className="w-5 h-5 flex-shrink-0"
          style={{ color: accentColor.value }}
        />
        <h2>{t("friends.title")}</h2>
        {friends.length > 0 && (
          <span className="nebrel-friends-count">
            {onlineCount}/{friends.length}
          </span>
        )}
        <button
          onClick={openSidebar}
          className="nebrel-friends-expand"
          aria-label={t("header.toggle_friends")}
          title={t("header.toggle_friends")}
        >
          <Icon icon="ph:arrows-out-simple-bold" className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover px-2 py-2">
        {isLoading && friends.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <FriendSkeleton key={i} accentColor={accentColor.value} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <Icon icon="ph:user-plus-duotone" className="w-9 h-9 text-white/25 mb-3" />
            <p className="font-smallcaps text-sm text-white/55">
              {t("friends.no_friends_title")}
            </p>
            <button
              onClick={openSidebar}
              className="nebrel-settings-pill mt-4 px-4 text-xs text-white/75 hover:text-white"
            >
              {t("friends.add_friend")}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {sorted.map((friend) => (
              <FriendListItem key={friend.uuid} friend={friend} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
