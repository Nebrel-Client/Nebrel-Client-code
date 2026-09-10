import { useTranslation } from "react-i18next";
import { Compass, Shirt, Sparkles, Layers } from "lucide-react";

const icons = { mods: Compass, skins: Shirt, capes: Sparkles, profiles: Layers };

/** Shared introduction for Nebrel's content libraries. */
export function LibraryHeader({ section }: { section: keyof typeof icons }) {
  const { t } = useTranslation();
  const SectionIcon = icons[section];
  return (
    <header className="nebrel-library-header">
      <div className="nebrel-library-heading">
        <div className="nebrel-eyebrow">NEBREL <span>/</span> {t("nebrel.library")}</div>
        <h1>{t(`nebrel.${section}.title`)}</h1>
        <p>{t(`nebrel.${section}.description`)}</p>
      </div>
      <div className="nebrel-library-symbol" aria-hidden="true"><SectionIcon size={34} strokeWidth={1.3} /></div>
    </header>
  );
}
