'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { cn } from '../../lib/utils';

interface CapeImageProps {
  imageUrl: string | undefined;
  part?: 'front' | 'back';
  width?: number;
  className?: string;
}

// The vanilla Minecraft cape UV layout, as fractions of the texture's own
// size (front at 1,1 w10 h16 / back at 12,1 w10 h16 out of a 64x32 texture).
// Expressed as ratios rather than fixed pixel offsets so this works for a
// cape PNG of any resolution that keeps the standard 64:32 aspect ratio -
// earlier this assumed every upload was pre-scaled 8x to ~512x256, which
// silently cropped the wrong region for anything not that exact size.
const CAPE_PART_ASPECT = 16 / 10; // height:width of one cape face
const FRONT_UV = { x: 1 / 64, y: 1 / 32, w: 10 / 64, h: 16 / 32 };
const BACK_UV = { x: 12 / 64, y: 1 / 32, w: 10 / 64, h: 16 / 32 };


export const CapeImage = React.memo(function CapeImage({
  imageUrl,
  part = 'front',
  width = 60, // Default width
  className,
}: CapeImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Calculate height based on width and cape aspect ratio (10:16 for the part)
  const height = useMemo(() => Math.round(width * CAPE_PART_ASPECT), [width]);

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage(null);
    
    const canvas = canvasRef.current;
    if (!canvas) {
      // console.warn("[CapeImage] Effect ran before canvas was ready.");
      setIsLoading(false); // Not strictly an error, but can't proceed
      return;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (!imageUrl) {
      // console.log("[CapeImage] No imageUrl provided.");
      setIsLoading(false); // Nothing to load
      return;
    }

    // console.log(`[CapeImage] Loading ${part} from ${imageUrl} for canvas ${width}x${height}`);
    const img = new Image();
    img.crossOrigin = 'anonymous'; 
    img.src = imageUrl;

    const onLoad = () => {
      // console.log("[CapeImage] Image loaded.");
      if (!canvasRef.current) { // Check if canvas is still there
        // console.error("[CapeImage] Canvas lost before drawing.");
        setErrorMessage("Canvas lost before drawing.");
        setIsLoading(false);
        return;
      }
      const currentCtx = canvasRef.current.getContext('2d');
      if (!currentCtx) {
        setErrorMessage("Failed to get canvas context for drawing.");
        setIsLoading(false);
        return;
      }

      try {
        const uv = part === 'back' ? BACK_UV : FRONT_UV;
        const sx = uv.x * img.naturalWidth;
        const sy = uv.y * img.naturalHeight;
        const sw = uv.w * img.naturalWidth;
        const sh = uv.h * img.naturalHeight;

        currentCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        currentCtx.imageSmoothingEnabled = false; // Pixelated look

        currentCtx.drawImage(
          img,
          sx, sy, sw, sh, // Source rectangle, proportional to the image's real size
          0, 0, canvasRef.current.width, canvasRef.current.height  // Destination rectangle
        );
        // console.log(`[CapeImage] Drawn ${part} part.`);
        setErrorMessage(null);
      } catch (drawError) {
        console.error("[CapeImage] Error drawing cape part:", drawError);
        setErrorMessage("Error rendering cape part.");
      } finally {
        setIsLoading(false);
      }
    };

    const onError = (error: string | Event) => {
      console.error("[CapeImage] Failed to load cape image:", imageUrl, error);
      setErrorMessage("Failed to load cape image.");
      setIsLoading(false);
    };
    
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);

    return () => {
      // console.log("[CapeImage] Cleanup effect for:", imageUrl);
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };
  }, [imageUrl, part, width, height]); // Rerun effect if these change

  return (
    <div 
      className={cn("cape-image-container relative inline-block align-middle overflow-hidden", className)} 
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {errorMessage ? (
        <div 
          className="error-message w-full h-full flex justify-center items-center text-center text-xs text-red-600 bg-red-100 border border-red-600 p-1 box-border"
          title={errorMessage}
        >
          ⚠️ Error
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={cn(
            "cape-canvas block w-full h-full image-pixelated transition-opacity duration-300 ease-in-out",
            isLoading && !errorMessage ? "opacity-0" : "opacity-100"
          )}
          title={`Cape ${part} view`}
          style={{ backgroundColor: 'transparent' }}
        />
      )}
    </div>
  );
});

// CSS for image-pixelated could be in a global stylesheet or defined via a style tag / CSS-in-JS if preferred
// For Tailwind, it's often handled by browser defaults or specific image rendering utilities if available.
// The 'image-rendering: pixelated;' style is important.
// Adding a global style for this:
// <style jsx global>{`
//   .image-pixelated {
//     image-rendering: pixelated;
//     image-rendering: -moz-crisp-edges; /* Firefox */
//     image-rendering: crisp-edges; /* Old Edge, Safari */
//   }
// `}</style> 