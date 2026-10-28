// Préréglage local versionné — distinct des futurs gabarits validés en base.
// Les anciennes préférences sans version sont migrées sans les effacer.
export const PRESET_SCHEMA="pictau-template-preset";
export const PRESET_SCHEMA_VERSION=2;

export function restoreVersionedPreset(raw,defaults,validate){
  const fallback={...defaults};
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return fallback;
  const envelope=raw.schema===PRESET_SCHEMA;
  if(envelope&&(raw.version!==PRESET_SCHEMA_VERSION||!raw.preset||Array.isArray(raw.preset)))return fallback;
  const candidate=envelope?raw.preset:raw; // compatibilité v1, préréglage non encapsulé
  const merged={...fallback,...candidate};
  // Explicitly reset unexpected fields in persisted user-controlled JSON.
  for(const key of Object.keys(merged))if(!(key in fallback))delete merged[key];
  return validate(merged)?merged:fallback;
}
export function serializeVersionedPreset(preset,defaults,validate){
  const checked=restoreVersionedPreset(preset,defaults,validate);
  if(!validate(checked))throw new Error("Gabarit invalide.");
  return {schema:PRESET_SCHEMA,version:PRESET_SCHEMA_VERSION,preset:checked};
}
