export const MIN_CM = 2;
export const MAX_CM = 10;
export const MAX_ROUTINE = 10;
export const THEMES = ["all", "hygiene", "autonomie", "alimentation", "ecole", "loisirs", "transport", "sensoriel"];

export function clampWidth(cm) {
  const n = Number(cm);
  return Number.isFinite(n) ? Math.max(MIN_CM, Math.min(MAX_CM, n)) : 5;
}

export function scaleMetrics(preset, cm) {
  const k = clampWidth(cm) / 5;
  return {
    widthCm: clampWidth(cm),
    heightCm: clampWidth(cm) * (preset.shape === "portrait" ? 1.35 : 1),
    bandMm: Number(preset.bandMm) * k,
    strokeMm: Number(preset.strokeMm) * k,
    fontPt: Number(preset.fontPt) * k,
    separatorMm: Number(preset.separatorMm) * k
  };
}

export function labelFor(item, language) {
  return language === "en" ? item.en : item.fr;
}

export function searchCatalog(items, query, theme, sort, language) {
  const q = String(query || "").trim().toLocaleLowerCase(language === "en" ? "en" : "fr");
  return items.filter(function(item) {
    const byTheme = theme === "all" || item.theme === theme;
    const text = [item.fr, item.en, item.theme, ...(item.tags || [])].join(" ").toLocaleLowerCase();
    return byTheme && (!q || text.includes(q));
  }).sort(function(a,b) {
    return sort === "az" ? labelFor(a,language).localeCompare(labelFor(b,language)) : b.created - a.created;
  });
}

export function addToRoutine(ids, id) {
  return ids.length >= MAX_ROUTINE ? [...ids] : [...ids, id];
}

export function moveRoutine(ids, index, direction) {
  const dest = index + direction;
  if (index < 0 || index >= ids.length || dest < 0 || dest >= ids.length) return [...ids];
  const next = [...ids];
  [next[index],next[dest]] = [next[dest],next[index]];
  return next;
}

export function routineFitsPaper(ids, widthCm, paper) {
  const printable = paper === "a4" ? 18.6 : 19.4;
  return ids.length * clampWidth(widthCm) <= printable;
}

export function validatePreset(preset) {
  return preset && ["square","portrait"].includes(preset.shape) &&
    Number(preset.bandMm) >= 6 && Number(preset.bandMm) <= 30 &&
    Number(preset.strokeMm) >= 0.4 && Number(preset.strokeMm) <= 4 &&
    Number(preset.fontPt) >= 7 && Number(preset.fontPt) <= 26 &&
    Number(preset.separatorMm) >= 0.5 && Number(preset.separatorMm) <= 4 &&
    /^#[a-fA-F0-9]{6}$/.test(preset.color) && (!preset.fontColor || /^#[a-fA-F0-9]{6}$/.test(preset.fontColor)) &&
    (preset.artPercent===undefined || (typeof preset.artPercent==="number" && Number.isFinite(preset.artPercent) && preset.artPercent>=30 && preset.artPercent<=95)) &&
    (preset.squareCenterMode===undefined || ["upper_illustration_area","entire_inner_square_height"].includes(preset.squareCenterMode));
}

export const DEFAULT_PRESET = Object.freeze({
  shape:"square",
  artPercent:70,
  squareCenterMode:"upper_illustration_area",
  bandMm:12,
  strokeMm:1.2,
  fontPt:14,
  separatorMm:1.2,
  color:"#4775a9",
  fontColor:"#111111",
  colored:true
});
