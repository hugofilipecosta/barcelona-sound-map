const KEY = "barcelona-sound-map:saved";

export function loadSavedIds() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

export function storeSavedIds(saved: Set<string>) {
  window.localStorage.setItem(KEY, JSON.stringify(Array.from(saved)));
}
