// Minimal i18n: two flat dictionaries (English default, Spanish) exposed
// through a React context with a `t(key, params)` helper.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "es";

type Dict = Record<string, string>;

const en: Dict = {
  "app.title": "SpaceLens",
  "app.tagline": "See what's eating your disk",

  "tab.disks": "Disks",
  "tab.treemap": "Map",
  "tab.topfiles": "Largest files",
  "tab.cleanup": "Cleanup",
  "tab.settings": "Settings",

  "disks.heading": "Your disks",
  "disks.scan": "Scan",
  "disks.choose": "Choose a folder…",
  "disks.home": "Scan home folder",
  "disks.used": "used",
  "disks.free": "free",
  "disks.of": "of",
  "disks.removable": "Removable",

  "scan.scanning": "Scanning…",
  "scan.files": "files",
  "scan.found": "found",
  "scan.cancel": "Cancel",
  "scan.cancelled": "Scan cancelled",
  "scan.empty": "Nothing scanned yet. Pick a disk or folder to start.",
  "scan.gotodisks": "Go to Disks",

  "tree.back": "Back",
  "tree.color.depth": "By depth",
  "tree.color.type": "By file type",
  "tree.color.mode": "Color",
  "tree.rescan": "Rescan",
  "tree.loading": "Loading…",
  "tree.ofparent": "of parent",
  "tree.items": "items",

  "ctx.open": "Open in file manager",
  "ctx.copy": "Copy path",
  "ctx.delete": "Delete…",
  "ctx.explain": "What is this?",
  "ctx.zoom": "Zoom in",

  "explain.safe": "Safe to delete",
  "explain.caution": "Delete with care",
  "explain.danger": "Don't touch",
  "explain.unknown": "No info for this folder",

  "del.title": "Delete",
  "del.toTrash": "This will move the item to the Trash (recoverable).",
  "del.permanent": "This will permanently delete the item. It cannot be recovered.",
  "del.size": "Size",
  "del.confirmType": "Type the folder name to confirm:",
  "del.cancel": "Cancel",
  "del.confirm": "Delete",
  "del.deleting": "Deleting…",
  "del.errors": "Some items could not be deleted:",
  "del.done": "Deleted.",

  "top.heading": "100 largest files",
  "top.col.size": "Size",
  "top.col.path": "Path",
  "top.empty": "Scan a disk first to see the largest files.",
  "top.open": "Open folder",

  "cleanup.heading": "Cleanup suggestions",
  "cleanup.intro": "Known caches and junk you can safely reclaim. Review before deleting.",
  "cleanup.reclaim": "Reclaim selected",
  "cleanup.total": "Selected total",
  "cleanup.empty": "Nothing obvious to clean — you're tidy!",
  "cleanup.refresh": "Refresh",
  "cleanup.scanning": "Measuring…",

  "cleanup.pacman_cache.label": "Pacman package cache",
  "cleanup.pacman_cache.desc": "Old downloaded packages. Needs root; use 'paccache -r'.",
  "cleanup.journal_logs.label": "System journal logs",
  "cleanup.journal_logs.desc": "Old logs. Needs root; trim with 'journalctl --vacuum-size'.",
  "cleanup.user_cache.label": "User cache (~/.cache)",
  "cleanup.user_cache.desc": "App caches that regenerate as needed.",
  "cleanup.thumbnails.label": "Thumbnail cache",
  "cleanup.thumbnails.desc": "Image thumbnails, regenerated on demand.",
  "cleanup.trash.label": "Trash bin",
  "cleanup.trash.desc": "Files you already sent to the trash.",
  "cleanup.yay_cache.label": "yay build cache",
  "cleanup.yay_cache.desc": "AUR build leftovers from yay.",
  "cleanup.paru_cache.label": "paru build cache",
  "cleanup.paru_cache.desc": "AUR build leftovers from paru.",
  "cleanup.chrome_cache.label": "Chrome cache",
  "cleanup.chrome_cache.desc": "Google Chrome browser cache.",
  "cleanup.chromium_cache.label": "Chromium cache",
  "cleanup.chromium_cache.desc": "Chromium browser cache.",
  "cleanup.brave_cache.label": "Brave cache",
  "cleanup.brave_cache.desc": "Brave browser cache.",
  "cleanup.mozilla_cache.label": "Firefox cache",
  "cleanup.mozilla_cache.desc": "Firefox / Mozilla browser cache.",
  "cleanup.zen_cache.label": "Zen browser cache",
  "cleanup.zen_cache.desc": "Zen browser cache.",

  "settings.heading": "Settings",
  "settings.language": "Language",
  "settings.deleteMode": "When I delete files",
  "settings.deleteMode.trash": "Move to Trash (recoverable)",
  "settings.deleteMode.permanent": "Delete permanently",
  "settings.oneFs": "Stay on one filesystem",
  "settings.oneFs.desc": "Don't follow mounted disks (USB, network) when scanning.",
  "settings.about": "About",
  "settings.aboutText": "SpaceLens — a visual disk usage analyzer for Linux.",

  "lang.title": "Choose your language",
  "lang.subtitle": "You can change this later in Settings.",
  "lang.continue": "Continue",
};

const es: Dict = {
  "app.title": "SpaceLens",
  "app.tagline": "Mirá qué se come tu disco",

  "tab.disks": "Discos",
  "tab.treemap": "Mapa",
  "tab.topfiles": "Más grandes",
  "tab.cleanup": "Limpieza",
  "tab.settings": "Ajustes",

  "disks.heading": "Tus discos",
  "disks.scan": "Escanear",
  "disks.choose": "Elegir una carpeta…",
  "disks.home": "Escanear carpeta personal",
  "disks.used": "usado",
  "disks.free": "libre",
  "disks.of": "de",
  "disks.removable": "Extraíble",

  "scan.scanning": "Escaneando…",
  "scan.files": "archivos",
  "scan.found": "encontrados",
  "scan.cancel": "Cancelar",
  "scan.cancelled": "Escaneo cancelado",
  "scan.empty": "Todavía no escaneaste nada. Elegí un disco o carpeta para empezar.",
  "scan.gotodisks": "Ir a Discos",

  "tree.back": "Atrás",
  "tree.color.depth": "Por profundidad",
  "tree.color.type": "Por tipo de archivo",
  "tree.color.mode": "Color",
  "tree.rescan": "Reescanear",
  "tree.loading": "Cargando…",
  "tree.ofparent": "del padre",
  "tree.items": "elementos",

  "ctx.open": "Abrir en gestor de archivos",
  "ctx.copy": "Copiar ruta",
  "ctx.delete": "Borrar…",
  "ctx.explain": "¿Qué es esto?",
  "ctx.zoom": "Acercar",

  "explain.safe": "Seguro borrar",
  "explain.caution": "Borrar con cuidado",
  "explain.danger": "No tocar",
  "explain.unknown": "Sin info de esta carpeta",

  "del.title": "Borrar",
  "del.toTrash": "Esto va a mover el elemento a la Papelera (recuperable).",
  "del.permanent": "Esto va a borrar el elemento de forma permanente. No se puede recuperar.",
  "del.size": "Tamaño",
  "del.confirmType": "Escribí el nombre de la carpeta para confirmar:",
  "del.cancel": "Cancelar",
  "del.confirm": "Borrar",
  "del.deleting": "Borrando…",
  "del.errors": "Algunos elementos no se pudieron borrar:",
  "del.done": "Borrado.",

  "top.heading": "100 archivos más grandes",
  "top.col.size": "Tamaño",
  "top.col.path": "Ruta",
  "top.empty": "Escaneá un disco primero para ver los archivos más grandes.",
  "top.open": "Abrir carpeta",

  "cleanup.heading": "Sugerencias de limpieza",
  "cleanup.intro": "Cachés y basura conocida que podés recuperar sin riesgo. Revisá antes de borrar.",
  "cleanup.reclaim": "Liberar seleccionados",
  "cleanup.total": "Total seleccionado",
  "cleanup.empty": "Nada obvio para limpiar — ¡estás ordenado!",
  "cleanup.refresh": "Actualizar",
  "cleanup.scanning": "Midiendo…",

  "cleanup.pacman_cache.label": "Caché de paquetes de pacman",
  "cleanup.pacman_cache.desc": "Paquetes viejos descargados. Necesita root; usá 'paccache -r'.",
  "cleanup.journal_logs.label": "Logs del journal del sistema",
  "cleanup.journal_logs.desc": "Logs viejos. Necesita root; recortá con 'journalctl --vacuum-size'.",
  "cleanup.user_cache.label": "Caché de usuario (~/.cache)",
  "cleanup.user_cache.desc": "Cachés de apps que se regeneran solas.",
  "cleanup.thumbnails.label": "Caché de miniaturas",
  "cleanup.thumbnails.desc": "Miniaturas de imágenes, se regeneran a demanda.",
  "cleanup.trash.label": "Papelera",
  "cleanup.trash.desc": "Archivos que ya mandaste a la papelera.",
  "cleanup.yay_cache.label": "Caché de compilación de yay",
  "cleanup.yay_cache.desc": "Restos de compilación AUR de yay.",
  "cleanup.paru_cache.label": "Caché de compilación de paru",
  "cleanup.paru_cache.desc": "Restos de compilación AUR de paru.",
  "cleanup.chrome_cache.label": "Caché de Chrome",
  "cleanup.chrome_cache.desc": "Caché del navegador Google Chrome.",
  "cleanup.chromium_cache.label": "Caché de Chromium",
  "cleanup.chromium_cache.desc": "Caché del navegador Chromium.",
  "cleanup.brave_cache.label": "Caché de Brave",
  "cleanup.brave_cache.desc": "Caché del navegador Brave.",
  "cleanup.mozilla_cache.label": "Caché de Firefox",
  "cleanup.mozilla_cache.desc": "Caché del navegador Firefox / Mozilla.",
  "cleanup.zen_cache.label": "Caché de Zen",
  "cleanup.zen_cache.desc": "Caché del navegador Zen.",

  "settings.heading": "Ajustes",
  "settings.language": "Idioma",
  "settings.deleteMode": "Cuando borro archivos",
  "settings.deleteMode.trash": "Mover a la Papelera (recuperable)",
  "settings.deleteMode.permanent": "Borrar permanentemente",
  "settings.oneFs": "Quedarse en un solo sistema de archivos",
  "settings.oneFs.desc": "No seguir discos montados (USB, red) al escanear.",
  "settings.about": "Acerca de",
  "settings.aboutText": "SpaceLens — un analizador visual de uso de disco para Linux.",

  "lang.title": "Elegí tu idioma",
  "lang.subtitle": "Podés cambiarlo después en Ajustes.",
  "lang.continue": "Continuar",
};

const DICTS: Record<Lang, Dict> = { en, es };

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  initialLang,
  onLangChange,
  children,
}: {
  initialLang: Lang;
  onLangChange?: (l: Lang) => void;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const value = useMemo<I18nValue>(() => {
    const setLang = (l: Lang) => {
      setLangState(l);
      onLangChange?.(l);
    };
    const t = (key: string, params?: Record<string, string | number>) => {
      let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    };
    return { lang, setLang, t };
  }, [lang, onLangChange]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
