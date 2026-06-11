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
  "tab.dup": "Duplicates",
  "tab.guide": "Guide",
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
  "tree.color.age": "By age",
  "tree.color.type": "By file type",
  "tree.color.mode": "Color",
  "tree.rescan": "Rescan",
  "tree.loading": "Loading…",
  "tree.ofparent": "of parent",
  "tree.items": "items",
  "tree.free": "Free space",
  "tree.unscanned": "Used, not scanned (no permission / other partitions)",
  "tree.legendFilter": "Click to highlight only some types",
  "tree.legendReset": "Show all",

  "age.w": "< 1 week",
  "age.m": "< 1 month",
  "age.hy": "< 6 months",
  "age.y": "< 1 year",
  "age.y2": "< 2 years",
  "age.old": "Older",

  "ctx.open": "Open in file manager",
  "ctx.copy": "Copy path",
  "ctx.delete": "Delete…",
  "ctx.explain": "What is this?",
  "ctx.zoom": "Zoom in",
  "ctx.ancestors": "Containing folders",

  "explain.safe": "Safe to delete",
  "explain.caution": "Delete with care",
  "explain.danger": "Don't touch",
  "explain.unknown": "We're not sure",
  "explain.what": "What it is",
  "explain.risk": "Risk of deleting",
  "explain.tip": "Tip",
  "explain.unknownWhat": "SpaceLens doesn't recognize this item.",
  "explain.notSure": "If you're not sure what it is, the safest choice is not to delete it.",
  "explain.inheritedFrom": "Info inherited from {path}",
  "explain.guessByName": "Best guess from the name",
  "explain.guessByType": "Best guess from the file type",

  "heur.insideOf": "Inside {parent} ({what}). No specific info for this item.",
  "heur.insideRisk": "Apply the same care as its parent folder.",
  "heur.cacheLike": "Looks like cache or temporary files ({name}).",
  "heur.cacheRisk": "Probably regenerable, but check the app it belongs to before deleting.",
  "heur.appData": "Likely data or settings for an app ({name}).",
  "heur.appDataRisk": "Deleting it may reset or break that app.",
  "heur.fileOfType": "Looks like a {type} file.",
  "heur.fileRisk": "Deleting it only affects this file's content.",

  "cat.video": "video",
  "cat.image": "image",
  "cat.audio": "audio",
  "cat.archive": "archive",
  "cat.package": "package",
  "cat.code": "code",
  "cat.document": "document",
  "cat.game": "game",
  "cat.binary": "program",
  "cat.other": "file",

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
  "del.unknownWarn": "We don't recognize this item. Deleting it could break something. Continue only if you know what it is.",

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

  "cleanup.legend.safe": "Deleting loses nothing — it regenerates on its own.",
  "cleanup.legend.caution": "Read the note first: there's a small trade-off.",

  "cleanup.pacman_cache.label": "Pacman package cache",
  "cleanup.pacman_cache.desc": "Old downloaded installers. Your installed programs are NOT touched — you only lose reinstalling/downgrading without internet. Needs root: 'sudo paccache -r'.",
  "cleanup.journal_logs.label": "System journal logs",
  "cleanup.journal_logs.desc": "Old system activity records. Only useful for diagnosing past problems; nothing breaks. Needs root: 'sudo journalctl --vacuum-size=200M'.",
  "cleanup.user_cache.label": "User cache (~/.cache)",
  "cleanup.user_cache.desc": "Temporary files apps keep to start faster. No settings, sessions or documents are lost — apps may just open a bit slower the first time.",
  "cleanup.thumbnails.label": "Thumbnail cache",
  "cleanup.thumbnails.desc": "Small image previews for your file manager. They regenerate as you browse folders. Zero loss.",
  "cleanup.trash.label": "Trash bin",
  "cleanup.trash.desc": "Files you already deleted. Emptying makes them unrecoverable — check there's nothing you want back.",
  "cleanup.yay_cache.label": "yay build cache",
  "cleanup.yay_cache.desc": "Leftover source files from building AUR packages. Installed programs unaffected; the next build just re-downloads.",
  "cleanup.paru_cache.label": "paru build cache",
  "cleanup.paru_cache.desc": "Leftover source files from building AUR packages. Installed programs unaffected; the next build just re-downloads.",
  "cleanup.chrome_cache.label": "Chrome cache",
  "cleanup.chrome_cache.desc": "Temporary web files only. Your logins, passwords, history and bookmarks are NOT touched — pages just load slower the first visit.",
  "cleanup.chromium_cache.label": "Chromium cache",
  "cleanup.chromium_cache.desc": "Temporary web files only. Logins, history and bookmarks stay — pages just load slower the first visit.",
  "cleanup.brave_cache.label": "Brave cache",
  "cleanup.brave_cache.desc": "Temporary web files only. Logins, history and bookmarks stay — pages just load slower the first visit.",
  "cleanup.mozilla_cache.label": "Firefox cache",
  "cleanup.mozilla_cache.desc": "Temporary web files only. Logins, history and bookmarks stay — pages just load slower the first visit.",
  "cleanup.zen_cache.label": "Zen browser cache",
  "cleanup.zen_cache.desc": "Temporary web files only. Logins, history and bookmarks stay — pages just load slower the first visit.",
  "cleanup.apt_cache.label": "APT package cache",
  "cleanup.apt_cache.desc": "Old downloaded .deb installers. Installed programs unaffected; you only lose offline reinstalls. Clear with 'sudo apt clean'.",
  "cleanup.dnf_cache.label": "DNF package cache",
  "cleanup.dnf_cache.desc": "Cached installers and metadata. Installed programs unaffected. Clear with 'sudo dnf clean all'.",

  "dup.heading": "Duplicate files",
  "dup.intro": "Identical files (same content) found in the last scan. Keep one copy and delete the rest to reclaim space.",
  "dup.warn": "Identical content doesn't always mean redundant: copies in different folders can each serve a purpose (game assets, project dependencies, backups). Only delete copies you recognize as yours — when in doubt, leave it.",
  "dup.scan": "Find duplicates",
  "dup.scanning": "Comparing file contents…",
  "dup.empty": "No duplicate files found. Nice and tidy!",
  "dup.needScan": "Scan a disk or folder first, then look for duplicates.",
  "dup.copies": "{n} copies",
  "dup.each": "each",
  "dup.reclaimable": "reclaimable",
  "dup.delete": "Delete selected",
  "dup.keepWarn": "You selected every copy in a group — keep at least one or you lose the file entirely.",

  "guide.heading": "Folder guide",
  "guide.intro": "What the folders on your system are for, and how risky each is to delete.",
  "guide.yourSystem": "Your system",
  "guide.manager": "Package manager",
  "guide.unknownDistro": "Unknown system",
  "guide.search": "Search folders…",
  "guide.legend": "What the colors mean",
  "guide.noResults": "No folders match your search.",
  "guide.group.system": "System ( / )",
  "guide.group.home": "Your home folder ( ~ )",
  "guide.group.dev": "Development & build files",
  "guide.group.cache": "Caches & cleanup",
  "legend.safe": "Safe to delete — regenerable junk.",
  "legend.caution": "Delete with care — your data or needed by an app.",
  "legend.danger": "Don't touch — the system or your keys need it.",
  "legend.unknown": "Not sure — we couldn't identify it.",

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
  "tab.dup": "Duplicados",
  "tab.guide": "Guía",
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
  "tree.color.age": "Por antigüedad",
  "tree.color.type": "Por tipo de archivo",
  "tree.color.mode": "Color",
  "tree.rescan": "Reescanear",
  "tree.loading": "Cargando…",
  "tree.ofparent": "del padre",
  "tree.items": "elementos",
  "tree.free": "Espacio libre",
  "tree.unscanned": "Usado, sin escanear (sin permiso / otras particiones)",
  "tree.legendFilter": "Click para resaltar solo algunos tipos",
  "tree.legendReset": "Mostrar todo",

  "age.w": "< 1 semana",
  "age.m": "< 1 mes",
  "age.hy": "< 6 meses",
  "age.y": "< 1 año",
  "age.y2": "< 2 años",
  "age.old": "Más viejo",

  "ctx.open": "Abrir en gestor de archivos",
  "ctx.copy": "Copiar ruta",
  "ctx.delete": "Borrar…",
  "ctx.explain": "¿Qué es esto?",
  "ctx.zoom": "Acercar",
  "ctx.ancestors": "Carpetas que lo contienen",

  "explain.safe": "Seguro borrar",
  "explain.caution": "Borrar con cuidado",
  "explain.danger": "No tocar",
  "explain.unknown": "No estamos seguros",
  "explain.what": "Qué es",
  "explain.risk": "Riesgo al borrar",
  "explain.tip": "Consejo",
  "explain.unknownWhat": "SpaceLens no reconoce este elemento.",
  "explain.notSure": "Si no sabés qué es, lo más seguro es no borrarlo.",
  "explain.inheritedFrom": "Info heredada de {path}",
  "explain.guessByName": "Estimación por el nombre",
  "explain.guessByType": "Estimación por el tipo de archivo",

  "heur.insideOf": "Dentro de {parent} ({what}). Sin info específica de este elemento.",
  "heur.insideRisk": "Aplicá la misma precaución que su carpeta contenedora.",
  "heur.cacheLike": "Parece caché o archivos temporales ({name}).",
  "heur.cacheRisk": "Probablemente regenerable, pero fijate a qué app pertenece antes de borrar.",
  "heur.appData": "Probablemente datos o configuración de una app ({name}).",
  "heur.appDataRisk": "Borrarlo puede resetear o romper esa app.",
  "heur.fileOfType": "Parece un archivo de {type}.",
  "heur.fileRisk": "Borrarlo solo afecta el contenido de este archivo.",

  "cat.video": "video",
  "cat.image": "imagen",
  "cat.audio": "audio",
  "cat.archive": "comprimido",
  "cat.package": "paquete",
  "cat.code": "código",
  "cat.document": "documento",
  "cat.game": "juego",
  "cat.binary": "programa",
  "cat.other": "archivo",

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
  "del.unknownWarn": "No reconocemos este elemento. Borrarlo podría romper algo. Continuá solo si sabés qué es.",

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

  "cleanup.legend.safe": "Borrarlo no pierde nada — se regenera solo.",
  "cleanup.legend.caution": "Leé la nota primero: hay una pequeña contra.",

  "cleanup.pacman_cache.label": "Caché de paquetes de pacman",
  "cleanup.pacman_cache.desc": "Instaladores viejos descargados. Tus programas instalados NO se tocan — solo perdés reinstalar/volver a versión anterior sin internet. Necesita root: 'sudo paccache -r'.",
  "cleanup.journal_logs.label": "Logs del journal del sistema",
  "cleanup.journal_logs.desc": "Registros viejos de actividad del sistema. Solo sirven para diagnosticar problemas pasados; no se rompe nada. Necesita root: 'sudo journalctl --vacuum-size=200M'.",
  "cleanup.user_cache.label": "Caché de usuario (~/.cache)",
  "cleanup.user_cache.desc": "Archivos temporales que las apps guardan para abrir más rápido. No se pierde configuración, sesiones ni documentos — las apps solo abren un poco más lento la primera vez.",
  "cleanup.thumbnails.label": "Caché de miniaturas",
  "cleanup.thumbnails.desc": "Vistas previas chicas de imágenes para tu gestor de archivos. Se regeneran al navegar carpetas. Pérdida cero.",
  "cleanup.trash.label": "Papelera",
  "cleanup.trash.desc": "Archivos que ya borraste. Vaciarla los hace irrecuperables — fijate que no haya nada que quieras de vuelta.",
  "cleanup.yay_cache.label": "Caché de compilación de yay",
  "cleanup.yay_cache.desc": "Restos de código fuente de compilar paquetes AUR. Los programas instalados no se tocan; la próxima compilación re-descarga.",
  "cleanup.paru_cache.label": "Caché de compilación de paru",
  "cleanup.paru_cache.desc": "Restos de código fuente de compilar paquetes AUR. Los programas instalados no se tocan; la próxima compilación re-descarga.",
  "cleanup.chrome_cache.label": "Caché de Chrome",
  "cleanup.chrome_cache.desc": "Solo archivos web temporales. Tus sesiones, contraseñas, historial y marcadores NO se tocan — las páginas solo cargan más lento la primera visita.",
  "cleanup.chromium_cache.label": "Caché de Chromium",
  "cleanup.chromium_cache.desc": "Solo archivos web temporales. Sesiones, historial y marcadores quedan — las páginas solo cargan más lento la primera visita.",
  "cleanup.brave_cache.label": "Caché de Brave",
  "cleanup.brave_cache.desc": "Solo archivos web temporales. Sesiones, historial y marcadores quedan — las páginas solo cargan más lento la primera visita.",
  "cleanup.mozilla_cache.label": "Caché de Firefox",
  "cleanup.mozilla_cache.desc": "Solo archivos web temporales. Sesiones, historial y marcadores quedan — las páginas solo cargan más lento la primera visita.",
  "cleanup.zen_cache.label": "Caché de Zen",
  "cleanup.zen_cache.desc": "Solo archivos web temporales. Sesiones, historial y marcadores quedan — las páginas solo cargan más lento la primera visita.",
  "cleanup.apt_cache.label": "Caché de paquetes APT",
  "cleanup.apt_cache.desc": "Instaladores .deb viejos descargados. Los programas instalados no se tocan; solo perdés reinstalar sin internet. Limpiá con 'sudo apt clean'.",
  "cleanup.dnf_cache.label": "Caché de paquetes DNF",
  "cleanup.dnf_cache.desc": "Instaladores y metadatos en caché. Los programas instalados no se tocan. Limpiá con 'sudo dnf clean all'.",

  "dup.heading": "Archivos duplicados",
  "dup.intro": "Archivos idénticos (mismo contenido) encontrados en el último escaneo. Quedate con una copia y borrá el resto para recuperar espacio.",
  "dup.warn": "Contenido idéntico no siempre significa redundante: copias en carpetas distintas pueden cumplir cada una su función (assets de juegos, dependencias de proyectos, backups). Borrá solo copias que reconozcas como tuyas — ante la duda, dejala.",
  "dup.scan": "Buscar duplicados",
  "dup.scanning": "Comparando contenido de archivos…",
  "dup.empty": "No se encontraron duplicados. ¡Todo ordenado!",
  "dup.needScan": "Escaneá un disco o carpeta primero, después buscá duplicados.",
  "dup.copies": "{n} copias",
  "dup.each": "cada uno",
  "dup.reclaimable": "recuperable",
  "dup.delete": "Borrar seleccionados",
  "dup.keepWarn": "Seleccionaste todas las copias de un grupo — dejá al menos una o perdés el archivo por completo.",

  "guide.heading": "Guía de carpetas",
  "guide.intro": "Para qué sirven las carpetas de tu sistema y qué tan riesgoso es borrar cada una.",
  "guide.yourSystem": "Tu sistema",
  "guide.manager": "Gestor de paquetes",
  "guide.unknownDistro": "Sistema desconocido",
  "guide.search": "Buscar carpetas…",
  "guide.legend": "Qué significan los colores",
  "guide.noResults": "Ninguna carpeta coincide con tu búsqueda.",
  "guide.group.system": "Sistema ( / )",
  "guide.group.home": "Tu carpeta personal ( ~ )",
  "guide.group.dev": "Archivos de desarrollo y compilación",
  "guide.group.cache": "Cachés y limpieza",
  "legend.safe": "Seguro borrar — basura regenerable.",
  "legend.caution": "Borrar con cuidado — tu data o que una app lo necesite.",
  "legend.danger": "No tocar — el sistema o tus claves lo necesitan.",
  "legend.unknown": "No seguro — no pudimos identificarlo.",

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
