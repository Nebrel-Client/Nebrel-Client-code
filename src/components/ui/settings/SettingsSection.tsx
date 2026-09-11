"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import { cn } from "../../../lib/utils";
import { useThemeStore } from "../../../store/useThemeStore";
import { fuzzyMatch, useSettingsSearch } from "./SettingsSearchContext";

interface SettingsSectionProps {
  id?: string;
  title: string;
  description?: ReactNode;
  icon?: string;
  headerActions?: ReactNode;
  keywords?: string[];
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SettingsSection({
  id,
  title,
  description,
  icon,
  headerActions,
  keywords,
  children,
  className,
  bodyClassName,
}: SettingsSectionProps) {
  const accentColor = useThemeStore((s) => s.accentColor);
  const query = useSettingsSearch();

  let body: ReactNode = children;

  if (query) {
    const sectionHay = [title, ...(keywords ?? [])].join(" ");
    const sectionMatch = fuzzyMatch(sectionHay, query);

    if (!sectionMatch) {
      const kept = Children.toArray(children).filter((child) => {
        if (!isValidElement(child)) return false;
        const p = child.props as { label?: unknown; searchKeywords?: string[] };
        if (typeof p.label !== "string" && !p.searchKeywords) return false;
        const hay = [
          typeof p.label === "string" ? p.label : "",
          ...(p.searchKeywords ?? []),
        ].join(" ");
        return fuzzyMatch(hay, query);
      });
      if (kept.length === 0) return null;
      body = kept;
    }
  }

  return (
    <section id={id} className={cn("nebrel-settings-section scroll-mt-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-smallcaps text-lg leading-none tracking-wide text-white">
            {icon && (
              <Icon
                icon={icon}
                className="w-4 h-4 flex-shrink-0"
                style={{ color: accentColor.value }}
              />
            )}
            {title}
          </h3>
          {description && (
            <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {headerActions && <div className="flex-shrink-0">{headerActions}</div>}
      </div>

      <div className={cn("nebrel-settings-section-body", bodyClassName)}>{body}</div>
    </section>
  );
}
