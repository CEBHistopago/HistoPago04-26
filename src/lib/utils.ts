import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un número como moneda con separadores de miles y 2 decimales.
 * @param value El número a formatear.
 * @returns Un string formateado (ej: 1,250.50).
 */
export function formatCurrency(value: number | undefined | null): string {
  const num = value ?? 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
