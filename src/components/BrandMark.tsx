import { BRAND_MARK_PATH, BRAND_MARK_VIEWBOX } from "../../shared/brand.mjs";

/** Decorative alongside the visible, accessible Sidequest name or page heading. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      className="sidequest-symbol"
      width={size}
      height={size}
      viewBox={BRAND_MARK_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={BRAND_MARK_PATH} />
    </svg>
  );
}
