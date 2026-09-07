import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** City id ("madrid") to display label ("Madrid"), one rule for every email. */
export function toCityLabel(cityId: string): string {
  if (!cityId) return "";
  return cityId.charAt(0).toUpperCase() + cityId.slice(1);
}
