"use client";

import type React from "react";
import { forwardRef, useRef } from "react";
import { cn } from "../../../lib/utils";
import { useThemeStore } from "../../../store/useThemeStore";

interface NavButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  isActive?: boolean;
  variant?: "default" | "secondary" | "ghost";
  label?: React.ReactNode;
}

export const NavButton = forwardRef<HTMLButtonElement, NavButtonProps>(
  (
    { className, icon, isActive = false, variant = "default", label, ...props },
    ref,
  ) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const accentColor = useThemeStore((state) => state.accentColor);

    const getVariantColors = () => {
      switch (variant) {
        case "secondary":
          return {
            main: "#6b7280",
            light: "#9ca3af",
            dark: "#4b5563",
            text: "#f3f4f6",
          };
        case "ghost":
          return {
            main: "transparent",
            light: "transparent",
            dark: "transparent",
            text: "#ffffff",
          };
        default:
          return {
            main: accentColor.value,
            light: accentColor.hoverValue,
            dark: accentColor.value,
            text: "#ffffff",
          };
      }
    };

    const colors = getVariantColors();

    // The icon sits in its own tile and the label underneath it, so the active
    // state is carried by the tile rather than by a band across the whole row.
    return (
      <button
        ref={ref || buttonRef}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "nebrel-nav-button group flex w-full flex-col items-center gap-1.5 bg-transparent",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:rounded-[var(--border-radius)]",
          className,
        )}
        {...props}
      >
        <span
          className="nebrel-nav-tile"
          style={
            isActive && variant !== "ghost"
              ? { borderColor: `${colors.main}47`, color: colors.main }
              : undefined
          }
        >
          {icon}
        </span>
        {label && (
          <span className="nebrel-nav-label" title={typeof label === "string" ? label : undefined}>
            {label}
          </span>
        )}
      </button>
    );
  },
);

NavButton.displayName = "NavButton";
