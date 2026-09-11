"use client";

import { Icon } from "@iconify/react";
import { cn } from "../lib/utils";
import { useThemeStore } from "../store/useThemeStore";
import { EffectThumbnail } from "./EffectThumbnail";

interface EffectPreviewCardProps {
  effectId: string;
  name: string;
  icon: string;
  onClick: () => void;
  isActive: boolean;
}

export default function EffectPreviewCard({
  effectId,
  name,
  onClick,
  isActive,
}: EffectPreviewCardProps) {
  const { accentColor } = useThemeStore();

  return (
    <button
      type="button"
      className={cn("nebrel-effect-card", isActive && "nebrel-effect-card-active")}
      style={
        isActive
          ? { borderColor: `${accentColor.value}70`, boxShadow: `0 0 0 1px ${accentColor.value}40` }
          : undefined
      }
      onClick={onClick}
    >
      <span className="nebrel-effect-card-preview">
        <EffectThumbnail effectId={effectId} />
      </span>

      <span className="nebrel-effect-card-label">{name}</span>

      {isActive && (
        <span className="nebrel-effect-card-check" style={{ backgroundColor: accentColor.value }}>
          <Icon icon="ph:check-bold" className="w-3 h-3 text-black" />
        </span>
      )}
    </button>
  );
}
