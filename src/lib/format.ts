// Human-readable byte formatting (binary units) and percentage helpers.

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, i);
  // No decimals for plain bytes.
  const d = i === 0 ? 0 : decimals;
  return `${value.toFixed(d)} ${UNITS[i]}`;
}

export function percent(part: number, whole: number, decimals = 1): string {
  if (whole <= 0) return "0%";
  return `${((part / whole) * 100).toFixed(decimals)}%`;
}
