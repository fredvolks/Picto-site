// Exécuter la recette L2 du candidat via le workflow vitrine existant.
// verify.yml lance node --test tests/*.test.mjs ; les tests source restent
// dans app/tests/ pour être rejouables sans recopier leurs scénarios.
import "../app/tests/l2-release-candidate.test.mjs";
