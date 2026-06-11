// Persisted user settings via tauri-plugin-store. Language defaults to English
// and `langChosen` drives the first-run language prompt.

import { load, type Store } from "@tauri-apps/plugin-store";
import type { Lang } from "./i18n";

export type DeleteMode = "trash" | "permanent";

export interface Settings {
  lang: Lang;
  langChosen: boolean;
  deleteMode: DeleteMode;
  oneFilesystem: boolean;
}

const DEFAULTS: Settings = {
  lang: "en",
  langChosen: false,
  deleteMode: "trash",
  oneFilesystem: true,
};

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) store = await load("settings.json", { autoSave: false, defaults: {} });
  return store;
}

export async function loadSettings(): Promise<Settings> {
  const s = await getStore();
  const get = async <T>(k: keyof Settings, def: T): Promise<T> => {
    const v = await s.get<T>(k as string);
    return v === undefined || v === null ? def : v;
  };
  return {
    lang: await get("lang", DEFAULTS.lang),
    langChosen: await get("langChosen", DEFAULTS.langChosen),
    deleteMode: await get("deleteMode", DEFAULTS.deleteMode),
    oneFilesystem: await get("oneFilesystem", DEFAULTS.oneFilesystem),
  };
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const s = await getStore();
  for (const [k, v] of Object.entries(partial)) {
    await s.set(k, v);
  }
  await s.save();
}
