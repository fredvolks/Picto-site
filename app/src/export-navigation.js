// Un PDF correctement archivé appartient au client, mais son export ne
// donne pas au serveur le droit de reprendre le contrôle de sa navigation.
export function shouldOpenArchivedPdf({
  uid,activeUid,request,activeRequest,sourcePage,currentPage,
  navigation,activeNavigation
}={}){
  return typeof uid==="string"&&uid.length>0&&uid===activeUid&&
    Number.isSafeInteger(request)&&request===activeRequest&&
    Number.isSafeInteger(navigation)&&navigation===activeNavigation&&
    ["routines","boards"].includes(sourcePage)&&sourcePage===currentPage;
}
