"use client";
/**
 * Accessible before/after comparison. <BeforeAfter before={MediaLike} after={MediaLike} caption? />
 * Built on a native <input type="range"> (keyboard: arrows, Home/End, PageUp/Down; touch + mouse drag),
 * with aria-valuetext. Without JS both images remain visible side by side via the <noscript> fallback in views.
 * Images are real project photos only — the component never invents content.
 */
import { useId, useState } from "react";
import { ResponsiveImage, type MediaLike } from "./ResponsiveImage";

export function BeforeAfter({ before, after, caption }: { before: MediaLike; after: MediaLike; caption?: string }) {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <figure>
      <div className="ba" style={{ ["--pos" as string]: `${pos}%` }}>
        <div className="ba-layer">
          <ResponsiveImage media={before} alt={before.alt || "Avant travaux"} sizes="(min-width: 1024px) 66vw, 100vw" />
        </div>
        <div className="ba-layer ba-after">
          <ResponsiveImage media={after} alt={after.alt || "Après travaux"} sizes="(min-width: 1024px) 66vw, 100vw" />
        </div>
        <span className="badge-demo absolute left-3 top-3">Avant</span>
        <span className="badge-demo absolute right-3 top-3">Après</span>
        <div className="ba-line" aria-hidden="true" />
        <div className="ba-knob" aria-hidden="true">
          ⇄
        </div>
        <label htmlFor={id} className="sr-only">
          Comparer avant et après : déplacer le curseur
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-valuetext={`${pos} % avant, ${100 - pos} % après`}
        />
      </div>
      {caption && <figcaption className="mt-3 text-sm text-bronze">{caption}</figcaption>}
    </figure>
  );
}
