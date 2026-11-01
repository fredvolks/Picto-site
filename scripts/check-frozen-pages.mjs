// Gel des trois pages publiques Pict-au : ne modifie JAMAIS leurs fichiers.
// Empêche de passer la CI si l'une des pages ou sa connexion visuelle change.
// Déverrouillage uniquement sur demande explicite du propriétaire.
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const manifest=JSON.parse(readFileSync(new URL("../docs/PICTAU_PAGES_GELEES.json",import.meta.url),"utf8"));
let failures=0;
for(const [path,expected] of Object.entries(manifest.frozen_files)){
 let observed="";
 try{observed=execFileSync("git",["hash-object",path],{encoding:"utf8"}).trim()}catch(e){observed="fichier absent"}
 if(observed!==expected){console.error("BLOQUÉ — page Pict-au gelée modifiée : "+path+" attendu="+expected+" reçu="+observed);failures++;}
}
const source=readFileSync(manifest.login_renderer.file,"utf8");
const a=source.indexOf(manifest.login_renderer.from);
const b=source.indexOf(manifest.login_renderer.until,a);
if(a<0||b<=a){console.error("BLOQUÉ — modèle Connexion introuvable");failures++}
else{
 const current=source.slice(a,b),frozen=readFileSync(new URL("../"+manifest.login_renderer.snapshot,import.meta.url),"utf8");
 if(current!==frozen){console.error("BLOQUÉ — rendu Connexion modifié sans déverrouillage explicite");failures++}
}
if(failures){console.error(failures+" modification(s) interdites des trois pages gelées. Seul le propriétaire peut demander le déverrouillage.");process.exitCode=1}
else{console.log("GEL PICT-AU OK — Accueil, Création de compte, Connexion et styles : inchangés")}
