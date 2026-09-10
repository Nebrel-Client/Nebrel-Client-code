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

    const baseClasses = cn(
      "nebrel-nav-button font-smallcaps relative overflow-hidden transition-all duration-200",
      "w-16 rounded-[var(--border-radius)] text-white flex items-center justify-center",
      label ? "py-2" : "h-16",
      variant !== "ghost" && "border border-transparent",
      "text-shadow-sm",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1 focus-visible:ring-offset-black/20",
    );

    const activeStateClasses = cn(
      variant !== "ghost" && "border",
      "hover:brightness-110 active:brightness-95",
    );
    
    // Active navigation uses the same inset edge as the content panels.
    const activeStateStyles: React.CSSProperties = variant === "ghost" ? {} : {
      backgroundImage: `linear-gradient(90deg, ${colors.main}59 0%, ${colors.main}1a 100%)`,
      borderColor: `${colors.main}4d`,
      boxShadow: `inset 0 -3px 0 ${colors.main}, 0 3px 0 #0005`,
      color: colors.text,
    };

    const nonActiveStateClasses = cn(
      variant !== "ghost" && "hover:bg-white/5",
      "hover:brightness-110 active:brightness-95",
    );

    const nonActiveStateStyles: React.CSSProperties = {};
    if (isActive) {
      Object.assign(nonActiveStateStyles, activeStateStyles);
    } else {
      nonActiveStateStyles.color = `${colors.text}90`;
    }

    return (
      <button
        ref={ref || buttonRef}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          baseClasses,
          isActive ? activeStateClasses : nonActiveStateClasses,
          className,
        )}
        style={isActive ? activeStateStyles : { ...nonActiveStateStyles, borderColor: "transparent" }}
        {...props}
      >
        <span
          className={cn(
            "absolute inset-0 bg-gradient-radial from-white/20 via-transparent to-transparent",
            isActive
              ? "opacity-10"
              : "opacity-0 transition-opacity duration-300",
          )}
        />
        <span className="relative z-10 flex flex-col items-center justify-center gap-1">
          <span className="flex items-center justify-center w-8 h-8">{icon}</span>
          {label && (
            <span className="font-smallcaps text-xs leading-tight text-center whitespace-nowrap [text-shadow:none]">
              {label}
            </span>
          )}
        </span>
      </button>
    );
  },
);

NavButton.displayName = "NavButton";
