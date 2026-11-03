// Catégories officielles du catalogue Pict-au (copie publique des codes
// canoniques Supabase, vérifiée en lecture seule le 1er novembre 2026).
// La table pictau_themes est réservée par RLS aux Super Admin : NE PAS
// l'exposer aux comptes clients pour obtenir les libellés. Synchroniser ici
// lorsqu'une catégorie est validée ou fusionnée par Émilie.
// [code du thème, libellé FR, libellé EN]
export const CLIENT_CATEGORIES=Object.freeze([
  ["actions","Verbes d’action","Action verbs"],
  ["alimentation","Alimentation","Food"],
  ["autonomie","Autonomie","Independence"],
  ["autres","Autres","Other"],
  ["consignes","Consignes","Instructions"],
  ["ecole","École","School"],
  ["etapes","Étapes","Steps"],
  ["hygiene","Hygiène","Hygiene"],
  ["lieux","Lieux","Places"],
  ["loisirs","Loisirs","Leisure"],
  ["objets","Objets significatifs","Meaningful objects"],
  ["sensoriel","Sensoriel","Sensory"],
  ["socialisation","Socialisation","Social skills"],
  ["transport","Transport","Transport"]
].map(row=>Object.freeze(row)));

export function clientCategoryLabel(code,language="fr"){
  const row=CLIENT_CATEGORIES.find(item=>item[0]===code);
  return row?(language==="en"?row[2]:row[1]):code;
}
