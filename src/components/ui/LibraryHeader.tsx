import { useTranslation } from "react-i18next";
import { Shirt, Sparkles, Layers, Lightbulb, Newspaper } from "lucide-react";

const icons = {
  mods: Layers,
  skins: Shirt,
  capes: Sparkles,
  profiles: Layers,
  changelog: Lightbulb,
  news: Newspaper,
};

/** Shared introduction for Nebrel's content libraries. */
export function LibraryHeader({ section }: { section: keyof typeof icons }) {
  const { t } = useTranslation();
  const SectionIcon = icons[section];
  return (
    <header className="nebrel-library-header">
      <div className="nebrel-library-heading">
        <div className="nebrel-eyebrow">NEBREL <span>/</span> {t("nebrel.library")} <b>DISCOVER</b></div>
        <h1>{t(`nebrel.${section}.title`)}</h1>
        <p>{t(`nebrel.${section}.description`)}</p>
      </div>
      <div className="nebrel-library-symbol" aria-hidden="true">
        {section === "mods" ? (
          <img src="/nebrel_badge.png" alt="" />
        ) : (
          <SectionIcon size={34} strokeWidth={1.3} />
        )}
      </div>
      <div className="nebrel-library-header-note">
        <span className="nebrel-library-live-dot" />
        <span>CURATED FOR YOUR NEXT SESSION</span>
      </div>
    </header>
  );
}
