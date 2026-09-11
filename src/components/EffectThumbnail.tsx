"use client";

/**
 * Self-contained mini previews for the background-effect picker.
 *
 * The full-page effect components (MatrixRainEffect, NebulaWaves, ...) size
 * their particles and geometry for a full viewport. Reused inside a ~140px
 * card they either render almost nothing (a handful of sparse dots) or need
 * an expensive canvas/WebGL context per card, times ten cards on screen at
 * once. These are deliberately not that: plain CSS/SVG, sized in percentages
 * so they always fill the card, and cheap enough to animate ten of at a time.
 */

import { BACKGROUND_EFFECTS } from "../store/background-effect-store";

export function EffectThumbnail({ effectId }: { effectId: string }) {
  switch (effectId) {
    case BACKGROUND_EFFECTS.MATRIX_RAIN:
      return <MatrixRainThumb />;
    case BACKGROUND_EFFECTS.ENCHANTMENT_PARTICLES:
      return <EnchantmentThumb />;
    case BACKGROUND_EFFECTS.NEBULA_WAVES:
      return <WavesThumb />;
    case BACKGROUND_EFFECTS.NEBULA_PARTICLES:
      return <StarfieldThumb />;
    case BACKGROUND_EFFECTS.NEBULA_GRID:
      return <GridThumb />;
    case BACKGROUND_EFFECTS.NEBULA_VOXELS:
      return <VoxelsThumb />;
    case BACKGROUND_EFFECTS.NEBULA_LIGHTNING:
      return <LightningThumb />;
    case BACKGROUND_EFFECTS.NEBULA_LIQUID_CHROME:
      return <ChromeThumb />;
    case BACKGROUND_EFFECTS.RETRO_GRID:
      return <RetroGridThumb />;
    case BACKGROUND_EFFECTS.PLAIN_BACKGROUND:
      return <PlainThumb />;
    default:
      return null;
  }
}

function MatrixRainThumb() {
  // Five columns of falling characters, each on its own delay/duration so
  // they don't visibly sync up.
  const columns = [
    { left: "8%", chars: "01アカ", delay: "0s", duration: "3.2s" },
    { left: "26%", chars: "1ナ0ミ", delay: "1.1s", duration: "2.6s" },
    { left: "44%", chars: "ラ10ケ", delay: "0.4s", duration: "3.6s" },
    { left: "62%", chars: "0サ1ト", delay: "1.8s", duration: "2.9s" },
    { left: "82%", chars: "ヨ01セ", delay: "0.8s", duration: "3.1s" },
  ];
  return (
    <div className="nebrel-thumb-matrix">
      {columns.map((c, i) => (
        <span
          key={i}
          className="nebrel-thumb-matrix-col"
          style={{ left: c.left, animationDelay: c.delay, animationDuration: c.duration }}
        >
          {c.chars.split("").map((ch, j) => (
            <i key={j}>{ch}</i>
          ))}
        </span>
      ))}
    </div>
  );
}

function EnchantmentThumb() {
  const dots = [
    { left: "20%", delay: "0s" },
    { left: "38%", delay: "0.6s" },
    { left: "55%", delay: "1.2s" },
    { left: "70%", delay: "0.3s" },
    { left: "85%", delay: "0.9s" },
  ];
  return (
    <div className="nebrel-thumb-enchant">
      {dots.map((d, i) => (
        <span key={i} className="nebrel-thumb-enchant-dot" style={{ left: d.left, animationDelay: d.delay }} />
      ))}
    </div>
  );
}

function WavesThumb() {
  return (
    <svg className="nebrel-thumb-waves" viewBox="0 0 200 100" preserveAspectRatio="none">
      <path className="nebrel-thumb-wave nebrel-thumb-wave-1" d="M0,60 Q25,30 50,60 T100,60 T150,60 T200,60" />
      <path className="nebrel-thumb-wave nebrel-thumb-wave-2" d="M0,70 Q25,50 50,70 T100,70 T150,70 T200,70" />
      <path className="nebrel-thumb-wave nebrel-thumb-wave-3" d="M0,45 Q25,20 50,45 T100,45 T150,45 T200,45" />
    </svg>
  );
}

function StarfieldThumb() {
  const stars = [
    "18% 22%", "32% 55%", "48% 15%", "58% 70%", "70% 35%",
    "82% 60%", "12% 78%", "90% 20%", "40% 85%", "65% 10%",
  ];
  return (
    <div className="nebrel-thumb-stars">
      {stars.map((pos, i) => {
        const [left, top] = pos.split(" ");
        return (
          <span
            key={i}
            className="nebrel-thumb-star"
            style={{ left, top, animationDelay: `${(i % 5) * 0.4}s` }}
          />
        );
      })}
    </div>
  );
}

function GridThumb() {
  return <div className="nebrel-thumb-grid" />;
}

function VoxelsThumb() {
  const cubes = [
    { left: "22%", top: "28%", size: 16, delay: "0s" },
    { left: "55%", top: "50%", size: 22, delay: "0.7s" },
    { left: "72%", top: "22%", size: 13, delay: "1.4s" },
    { left: "38%", top: "68%", size: 18, delay: "0.35s" },
  ];
  return (
    <div className="nebrel-thumb-voxels">
      {cubes.map((c, i) => (
        <span
          key={i}
          className="nebrel-thumb-voxel"
          style={{ left: c.left, top: c.top, width: c.size, height: c.size, animationDelay: c.delay }}
        />
      ))}
    </div>
  );
}

function LightningThumb() {
  return (
    <svg className="nebrel-thumb-lightning" viewBox="0 0 200 100" preserveAspectRatio="none">
      <path d="M110,4 L70,52 L96,52 L84,96 L140,44 L110,44 Z" />
    </svg>
  );
}

function ChromeThumb() {
  return <div className="nebrel-thumb-chrome" />;
}

function RetroGridThumb() {
  return (
    <div className="nebrel-thumb-retro">
      <span className="nebrel-thumb-retro-sun" />
      <div className="nebrel-thumb-retro-grid" />
    </div>
  );
}

function PlainThumb() {
  return <div className="nebrel-thumb-plain" />;
}
