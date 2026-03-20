import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return '刚刚';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}小时前`;
  }
  
  // Check if it was yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  }

  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}天前`;
  
  return date.toLocaleDateString('zh-CN');
};

export const getWordCount = (text: string) => {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
};

export type Rgb = { r: number; g: number; b: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const parseColorString = (raw: string): Rgb | null => {
  let s = raw.trim();
  if (s.endsWith(";")) {
    s = s.slice(0, -1).trim();
  }

  const hex = s.startsWith("#") ? s.slice(1) : s;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { r, g, b };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }

  const parseComponent = (comp: string) => {
    if (comp.endsWith("%")) {
      return clampInt(Math.round((Number(comp.slice(0, -1)) / 100) * 255), 0, 255);
    }
    return clampInt(Math.round(Number(comp)), 0, 255);
  };

  const rgbMatch = s.match(/^rgba?\(\s*([\d.]+%?)\s*(?:,|\s)\s*([\d.]+%?)\s*(?:,|\s)\s*([\d.]+%?)(?:\s*(?:,|\/)\s*[\d.]+%?)?\s*\)$/i);
  if (rgbMatch) {
    return {
      r: parseComponent(rgbMatch[1]),
      g: parseComponent(rgbMatch[2]),
      b: parseComponent(rgbMatch[3]),
    };
  }

  const hslMatch = s.match(
    /^hsla?\(\s*(-?[\d.]+(?:deg)?)\s*(?:,|\s)\s*([\d.]+%?)\s*(?:,|\s)\s*([\d.]+%?)(?:\s*(?:,|\/)\s*[\d.]+%?)?\s*\)$/i,
  );
  if (hslMatch) {
    let hRaw = Number(hslMatch[1].replace('deg', ''));
    let sRaw = Number(hslMatch[2].replace('%', ''));
    let lRaw = Number(hslMatch[3].replace('%', ''));
    
    // In CSS, S and L might be plain numbers (0-1) or percentages. We assume 0-100 if % is omitted for simplicity in legacy parsing, 
    // but standard requires %. For our purpose, just use the number.
    if (!hslMatch[2].endsWith('%') && sRaw <= 1) sRaw *= 100;
    if (!hslMatch[3].endsWith('%') && lRaw <= 1) lRaw *= 100;

    const h = ((hRaw % 360) + 360) % 360;
    const sat = clamp01(sRaw / 100);
    const lig = clamp01(lRaw / 100);

    if (sat === 0) {
      const v = Math.round(lig * 255);
      return { r: v, g: v, b: v };
    }

    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] =
      hp >= 0 && hp < 1 ? [c, x, 0] :
      hp >= 1 && hp < 2 ? [x, c, 0] :
      hp >= 2 && hp < 3 ? [0, c, x] :
      hp >= 3 && hp < 4 ? [0, x, c] :
      hp >= 4 && hp < 5 ? [x, 0, c] :
      [c, 0, x];

    const m = lig - c / 2;
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  }

  return null;
};

export const rgbToHexString = (rgb: Rgb, withHash = true, lowercase = false) => {
  const hex = [rgb.r, rgb.g, rgb.b]
    .map((v) => clampInt(v, 0, 255).toString(16).padStart(2, "0"))
    .join("");
  const s = withHash ? `#${hex}` : hex;
  return lowercase ? s.toLowerCase() : s.toUpperCase();
};

export const rgbToHsl = (rgb: Rgb) => {
  const r = clampInt(rgb.r, 0, 255) / 255;
  const g = clampInt(rgb.g, 0, 255) / 255;
  const b = clampInt(rgb.b, 0, 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

export const formatColorString = (rgb: Rgb, format: string, hexLowercase: boolean) => {
  switch (format) {
    case "#RRGGBB":
      return rgbToHexString(rgb, true, hexLowercase);
    case "RRGGBB":
      return rgbToHexString(rgb, false, hexLowercase);
    case "rgb(R, G, B)":
      return `rgb(${clampInt(rgb.r, 0, 255)}, ${clampInt(rgb.g, 0, 255)}, ${clampInt(rgb.b, 0, 255)})`;
    case "hsl(H, S%, L%)": {
      const hsl = rgbToHsl(rgb);
      return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    }
    default:
      return rgbToHexString(rgb, true, hexLowercase);
  }
};
