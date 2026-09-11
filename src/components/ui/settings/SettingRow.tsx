"use client";

import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { SimpleTooltip } from "../Tooltip";

interface SettingRowProps {
  label: ReactNode;
  description?: ReactNode;
  tooltip?: string;
  disabled?: boolean;
  vertical?: boolean;
  searchKeywords?: string[];
  className?: string;
  children: ReactNode;
}

export function SettingRow({
  label,
  description,
  tooltip,
  disabled,
  vertical,
  className,
  children,
}: SettingRowProps) {
  const labelNode = <span className="nebrel-setting-label">{label}</span>;

  return (
    <div
      className={cn(
        "nebrel-setting-row flex gap-8 border-b border-white/[0.06] last:border-b-0 last:pb-0",
        vertical ? "flex-col gap-2.5" : "items-center justify-between",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="min-w-0">
        {tooltip ? <SimpleTooltip content={tooltip}>{labelNode}</SimpleTooltip> : labelNode}
        {description && (
          <div className="nebrel-setting-description mt-1 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <div className={cn(vertical ? "w-full" : "flex-shrink-0")}>{children}</div>
    </div>
  );
}
