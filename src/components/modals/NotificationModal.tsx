"use client";

import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/buttons/Button";
import { IconButton } from "../ui/buttons/IconButton";
import { useThemeStore } from "../../store/useThemeStore";
import { useNotificationStore, useUnreadCount } from "../../store/notification-store";
import { getNotificationMessage, UserNotification } from "../../types/notification";
import { timeAgo } from "../../utils/time-utils";

export function NotificationModal() {
  const { t } = useTranslation();
  const { notifications, isModalOpen, closeModal, markAllAsRead, isLoading } = useNotificationStore();
  const unreadCount = useUnreadCount();
  const accentColor = useThemeStore((state) => state.accentColor);

  if (!isModalOpen) return null;

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  return (
    <Modal
      title={t("notification_modal.title")}
      titleIcon={<Icon icon="ph:bell-ringing-duotone" className="w-6 h-6" />}
      titleSubtitle={
        unreadCount > 0 ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-sans"
            style={{ color: accentColor.value }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: accentColor.value }}
            />
            {unreadCount}
          </span>
        ) : undefined
      }
      onClose={closeModal}
      width="md"
      headerActions={
        unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            icon={<Icon icon="ph:checks-bold" />}
          >
            {t("notification_modal.mark_all_read")}
          </Button>
        ) : undefined
      }
    >
      <div className="px-5 py-4 space-y-2 min-h-[220px] max-h-[60vh] overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Icon icon="svg-spinners:ring-resize" className="w-8 h-8 text-white/40" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState />
        ) : (
          notifications.map((notification) => (
            <NotificationItem key={notification._id} notification={notification} />
          ))
        )}
      </div>
    </Modal>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  const accentColor = useThemeStore((state) => state.accentColor);

  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div
        className="w-16 h-16 rounded-2xl grid place-items-center mb-4"
        style={{
          backgroundColor: `${accentColor.value}14`,
          border: `1px solid ${accentColor.value}2b`,
        }}
      >
        <Icon
          icon="ph:bell-slash-duotone"
          className="w-8 h-8"
          style={{ color: accentColor.value }}
        />
      </div>
      <p className="font-smallcaps text-base text-white/85">
        {t("notification_modal.no_notifications")}
      </p>
      <p className="text-xs font-sans text-white/40 mt-1.5 max-w-[16rem]">
        {t("notification_modal.no_notifications_hint")}
      </p>
    </div>
  );
}

function NotificationItem({ notification }: Readonly<{ notification: UserNotification }>) {
  const { t } = useTranslation();
  const accentColor = useThemeStore((state) => state.accentColor);
  const message = getNotificationMessage(notification.notification);
  const createdAt = notification.notification.createdAt;
  const relativeTime = createdAt ? timeAgo(new Date(createdAt).getTime()) : "";
  const isUnread = !notification.seen;

  const handleMarkSingleRead = async () => {
    await useNotificationStore.getState().markAsRead(notification._id);
  };

  return (
    <div
      className="group flex items-start gap-3 rounded-xl px-4 py-3 transition-colors"
      style={{
        backgroundColor: isUnread ? `${accentColor.value}12` : "rgba(255,255,255,0.03)",
        border: `1px solid ${isUnread ? `${accentColor.value}33` : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <span
        className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
        style={{
          backgroundColor: isUnread ? accentColor.value : "transparent",
          boxShadow: isUnread ? `0 0 6px ${accentColor.value}` : undefined,
        }}
      />

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-sans leading-snug break-words ${
            isUnread ? "text-white" : "text-white/60"
          }`}
        >
          {message}
        </p>
        <p className="text-xs font-sans text-white/35 mt-1">{relativeTime}</p>
      </div>

      {isUnread && (
        <IconButton
          icon={<Icon icon="ph:check-bold" className="w-4 h-4" />}
          onClick={handleMarkSingleRead}
          variant="ghost"
          size="xs"
          aria-label={t("notification_modal.mark_read")}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0"
        />
      )}
    </div>
  );
}
