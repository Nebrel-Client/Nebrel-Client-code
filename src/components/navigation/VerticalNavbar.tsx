"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Icon } from "@iconify/react";
import { cn } from "../../lib/utils";
import { NavButton } from "../ui/nav/NavButton";
import { NavTooltip } from "../ui/nav/NavTooltip";
import * as ConfigService from "../../services/launcher-config-service";
import { useThemeStore } from "../../store/useThemeStore";
import { createPortal } from "react-dom";

interface NavItem {
  id: string;
  icon: string;
  label: string;
  action?: () => void;
  isAction?: boolean;
}

interface VerticalNavbarProps {
  className?: string;
  items: NavItem[];
  activeItem?: string;
  onItemClick?: (id: string) => void;
  version?: string;
}

export function VerticalNavbar({
  className,
  items,
  activeItem,
  onItemClick,
  version = "v0.5.22",
}: VerticalNavbarProps) {  const [active, setActive] = useState(activeItem || items[0]?.id);
  const navRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const accentColor = useThemeStore((state) => state.accentColor);
  const showNavLabels = useThemeStore((state) => state.showNavLabels);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (activeItem) {
      setActive(activeItem);
    }
  }, [activeItem]);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const fetchedVersion = await ConfigService.getAppVersion();
        setAppVersion(`v${fetchedVersion}`);
      } catch (error) {
        console.error("Failed to fetch app version:", error);
        setAppVersion("v?.?.?");
      }
    };
    fetchVersion();
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".nav-item", { opacity: 0, x: -20 });

      gsap.to(".nav-item", {
        opacity: 1,
        x: 0,
        stagger: 0.05,
        duration: 0.4,
        ease: "power2.out",
        onComplete: () => {
          gsap.set(".nav-item", { clearProps: "all" });
        },
      });
    }, navRef);

    return () => ctx.revert();
  }, []);

  const handleItemClick = (id: string, isAction?: boolean) => {
    if (!isAction) setActive(id);
    if (onItemClick) {
      onItemClick(id);
    }
  };

  const handleMouseEnter = (id: string) => {
    const buttonElement = buttonRefs.current[id];
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 12,
      });
    }

    setShowTooltip(id);
    if (tooltipRef.current) {
      gsap.fromTo(
        tooltipRef.current,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" },
      );
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(null);
  };

  const renderItem = (item: NavItem) => (
    <div
      key={item.id}
      className="relative group nav-item flex flex-col items-center"
      ref={(el) => (buttonRefs.current[item.id] = el)}
    >
      <NavButton
        icon={<Icon icon={item.icon} className="w-8 h-8" />}
        label={showNavLabels ? item.label : undefined}
        isActive={active === item.id}
        onClick={() => handleItemClick(item.id, item.isAction)}
        onMouseEnter={() => !showNavLabels && handleMouseEnter(item.id)}
        onMouseLeave={handleMouseLeave}
        aria-label={item.label}
      />
    </div>
  );

  return (
    <>
      <div
        ref={navRef}
        className={cn(
          "nebrel-sidebar flex flex-col py-6 backdrop-blur-lg",
          showNavLabels ? "nebrel-sidebar-expanded" : "nebrel-sidebar-compact",
          className,
        )}
        style={{
          // A dark glass column lit from the top, with a single hairline edge.
          backgroundImage: `linear-gradient(180deg, ${accentColor.value}2e 0%, ${accentColor.value}0d 38%, transparent 100%)`,
          backgroundColor: "rgba(10, 3, 9, 0.55)",
          borderRight: `1px solid ${accentColor.value}2b`,
        }}
      >
        <div className="nebrel-nav-primary flex-1 flex flex-col items-center space-y-2 min-h-0 w-full">
          {items.filter((item) => !item.isAction).map(renderItem)}
        </div>

        {items.some((item) => item.isAction) && (
          <div className="nebrel-nav-utilities flex flex-col items-center space-y-2 mt-4 w-full">
            {items.filter((item) => item.isAction).map(renderItem)}
          </div>
        )}
      </div>      {isMounted &&
        showTooltip &&
        document.body &&
        createPortal(
          <div
            className="fixed pointer-events-none"
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              zIndex: 9999,
              transform: "translateY(-50%)",
            }}
          >
            <NavTooltip ref={tooltipRef}>
              {items.find((item) => item.id === showTooltip)?.label}
            </NavTooltip>
          </div>,
          document.body,
        )}
    </>
  );
}
