// Un PDF correctement archivé appartient au client, mais son export ne
// donne pas au serveur le droit de reprendre le contrôle de sa navigation.
// Les identifiants sont ceux du compte Supabase (et non de simples chaînes).
const USER_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function shouldOpenArchivedPdf({
  uid,activeUid,request,activeRequest,sourcePage,currentPage,
  navigation,activeNavigation
}={}){
  // Le compteur d'export démarre à zéro : une redirection est impossible
  // avant le démarrage d'une demande réelle. L'époque de navigation peut
  // commencer à zéro, mais jamais être négative.
  return typeof uid==="string"&&USER_ID.test(uid)&&uid===activeUid&&
    Number.isSafeInteger(request)&&request>0&&request===activeRequest&&
    Number.isSafeInteger(navigation)&&navigation>=0&&navigation===activeNavigation&&
    ["routines","boards"].includes(sourcePage)&&sourcePage===currentPage;
}
