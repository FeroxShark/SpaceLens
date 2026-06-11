// Map file extensions to broad categories, each with a color used when the
// treemap is in "by file type" coloring mode.

export type Category =
  | "video"
  | "image"
  | "audio"
  | "archive"
  | "package"
  | "code"
  | "document"
  | "game"
  | "binary"
  | "other";

export const CATEGORY_COLORS: Record<Category, string> = {
  video: "#e85d75", // rose
  image: "#f2a65a", // amber
  audio: "#f7d154", // yellow
  archive: "#7bc96f", // green
  package: "#4cc4b0", // teal
  code: "#4ea3f2", // blue
  document: "#9b8cf2", // indigo
  game: "#c77dff", // violet
  binary: "#8a8f98", // gray
  other: "#5a6270", // slate
};

const EXT_MAP: Record<string, Category> = {};
const register = (cat: Category, exts: string[]) =>
  exts.forEach((e) => (EXT_MAP[e] = cat));

register("video", ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts"]);
register("image", ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "heic", "raw", "psd", "ico"]);
register("audio", ["mp3", "flac", "wav", "ogg", "aac", "m4a", "opus", "wma", "mid"]);
register("archive", ["zip", "tar", "gz", "xz", "bz2", "7z", "rar", "zst", "lz4", "iso", "img"]);
register("package", ["pkg", "deb", "rpm", "appimage", "flatpak", "snap", "whl", "jar", "apk"]);
register("code", ["js", "ts", "tsx", "jsx", "py", "rs", "go", "c", "cpp", "h", "hpp", "java", "rb", "php", "sh", "json", "toml", "yaml", "yml", "html", "css", "lua", "vim"]);
register("document", ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "txt", "md", "epub", "csv"]);
register("game", ["vpk", "pak", "wad", "sav", "rom", "nes", "sfc", "gba", "iso"]);
register("binary", ["exe", "dll", "so", "bin", "o", "a", "dylib", "wasm", "node"]);

export function categoryForName(name: string): Category {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "other";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? "other";
}

export function colorForName(name: string): string {
  return CATEGORY_COLORS[categoryForName(name)];
}

export const ALL_CATEGORIES: Category[] = [
  "video",
  "image",
  "audio",
  "archive",
  "package",
  "code",
  "document",
  "game",
  "binary",
  "other",
];
