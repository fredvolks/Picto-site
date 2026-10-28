// Illustrations vectorielles d'exemple créées pour la première maquette.
// Aucune n'est un pictogramme réel approuvé ou publié.
const start = '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">';
const end = '</g></svg>';
const icon = function(paths) { return start + paths + end; };

export const samples = [
{id:"toilette",fr:"toilette",en:"toilet",theme:"hygiene",created:12,tags:["wc","toilettes","bathroom","autonomie"],image:icon('<path d="M38 25h17v33H38z M55 51h39v12c0 14-9 23-22 23H58c-10 0-16-8-16-17v-6 M55 58H40 M57 87v11M85 87v11M53 99h43"/><path d="M35 25h23M65 38h22"/>')},
{id:"laver-mains",fr:"laver les mains",en:"wash hands",theme:"hygiene",created:11,tags:["eau","hygiène","handwashing"],image:icon('<path d="M31 80l-6-12c-3-6 5-11 9-5l6 8-5-29c-1-9 9-10 11-2l6 23-2-33c0-8 11-8 11 0l2 31 4-24c2-8 12-5 11 3l-3 23 6-13c4-7 13-2 10 5L79 89c-3 8-15 12-29 11-9-1-15-8-19-20z"/><path d="M22 23c0 6-8 8-8 15M39 14c0 9-7 11-7 18M93 20c0 8-7 11-7 18"/>')},
{id:"collation",fr:"collation",en:"snack",theme:"alimentation",created:10,tags:["manger","pomme","fruit","eat"],image:icon('<path d="M61 45c-16-17-36-4-35 17 1 21 14 42 31 37 8-3 15-2 23 0 18 4 30-19 31-38 1-21-20-32-36-16M62 44c1-10 6-18 14-21M66 37c-12-13-23-12-30-6"/>')},
{id:"ecole",fr:"école",en:"school",theme:"ecole",created:9,tags:["classe","apprendre","teacher","school"],image:icon('<path d="M18 51l42-30 42 30 M26 48v52h68V48 M53 100V71h18v29 M37 54h12v12H37zM74 54h12v12H74z M16 100h89"/>')},
{id:"bus",fr:"autobus",en:"bus",theme:"transport",created:8,tags:["transport","autobus scolaire"],image:icon('<rect x="19" y="28" width="82" height="56" rx="9"/><path d="M21 51h78M44 30v21M70 30v21M26 67h14M80 67h12"/><circle cx="37" cy="88" r="8"/><circle cx="83" cy="88" r="8"/>')},
{id:"jouer",fr:"jouer",en:"play",theme:"loisirs",created:7,tags:["ballon","jeux","playground"],image:icon('<circle cx="61" cy="58" r="36"/><path d="M61 23l-14 25 10 20h25l9-21M47 48l-22 8M57 68l-6 25M82 68l13 10"/>')},
{id:"pause",fr:"pause",en:"break",theme:"autonomie",created:6,tags:["repos","calme","break"],image:icon('<path d="M22 79h76M34 79V46M86 79V46M34 53c11-18 41-20 52 0M43 55c9-9 24-9 33 0M52 26h16M47 20h26"/>')},
{id:"lire",fr:"lire",en:"read",theme:"ecole",created:5,tags:["lecture","livre","book"],image:icon('<path d="M60 93c-13-9-28-10-43-5V35c15-5 30-4 43 5v53zM60 93c14-9 29-10 43-5V35c-14-5-29-4-43 5v53zM60 40v53M27 49c9-2 17-1 24 3M71 52c7-4 15-5 23-3M27 63c9-2 17-1 24 3M71 66c7-4 15-5 23-3"/>')},
{id:"doudou",fr:"toutou",en:"stuffed animal",theme:"sensoriel",created:4,tags:["doudou","ours","teddy"],image:icon('<circle cx="35" cy="36" r="12"/><circle cx="85" cy="36" r="12"/><circle cx="60" cy="55" r="32"/><circle cx="49" cy="51" r="2"/><circle cx="71" cy="51" r="2"/><path d="M55 64l5 4 5-4M60 68v7M52 76q8 6 16 0 M36 85l-9 17M84 85l9 17"/>')},
{id:"habiller",fr:"s'habiller",en:"get dressed",theme:"autonomie",created:3,tags:["vêtement","chandail","shirt"],image:icon('<path d="M42 25L25 35 12 63l20 11 10-17v44h36V57l10 17 20-11-13-28-17-10-18 13zM42 25c1 10 9 15 18 15s17-5 18-15"/>')},
{id:"brosse",fr:"brosser les dents",en:"brush teeth",theme:"hygiene",created:2,tags:["dent","brosse","teeth"],image:icon('<path d="M29 28q-10 8-7 27l11 40c3 11 15 10 17 0l10-30 10 30c3 10 14 10 17 0l11-40c3-19-7-27-20-27-8 0-12 6-18 6s-11-6-18-6z"/><path d="M18 17h29M25 12v12M33 12v12M41 12v12"/>')},
{id:"boire",fr:"boire de l'eau",en:"drink water",theme:"alimentation",created:1,tags:["gourde","water","boire"],image:icon('<path d="M44 24h32v10l-7 8v12l10 15v30H41V69l10-15V42l-7-8zM51 24V15h18v9M44 77h32"/>')}
];
