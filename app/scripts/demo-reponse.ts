import { query, withTransaction, closePool } from '../lib/db/client';
import { enregistrerReponse, deposerEtLierPieces } from '../lib/veille/demandeReponseRepo';
import { stockageConfigure, supprimer } from '../lib/stockage';
import {
  creerDemo, supprimerDemo, estProduction, estBaseLocale, REFERENCE_DEMO,
} from '../lib/demo/reponseDemo';

/**
 * DÉMO CLI — simule une réponse de mairie AVEC pièces, pour VALIDER À L'ÉCRAN le circuit réponse → pièces → « marquer reçu » →
 * Archives, puis tout effacer. Deux sous-commandes :
 *   npm run demo:reponse:creer      → crée une demande FICTIVE (SVAV-DEM-9999-000001, libellés « DÉMO ») sur un dossier SÛR, son
 *                                     acheminement daté, une réponse rattachée à 2 pièces PDF déposées par le chemin de production.
 *   npm run demo:reponse:supprimer  → efface TOUT (lignes + objets de stockage), idempotent.
 *
 * ⚠️ Ne touche JAMAIS une demande réelle : tout est scellé sur la référence sentinelle. REFUSE de tourner hors base LOCALE ou en
 * environnement de production (gardes ci-dessous). La logique vit dans app/lib/demo/reponseDemo.ts (testée) ; ce module ne fait
 * qu'injecter les dépendances RÉELLES et imprimer. Aucun module `server-only` dans son graphe (garde-fou F2).
 */
function garantirEnvironnementLocal(): void {
  if (estProduction(process.env.NODE_ENV)) {
    throw new Error(`Refus : NODE_ENV = « ${process.env.NODE_ENV} » ressemble à de la production. La démo n'écrit qu'en local.`);
  }
  if (!estBaseLocale(process.env.DATABASE_URL)) {
    throw new Error('Refus : DATABASE_URL ne pointe pas vers une base LOCALE (localhost / 127.0.0.1 / ::1). Aucune écriture.');
  }
}

async function principal(): Promise<void> {
  const commande = process.argv[2];
  garantirEnvironnementLocal();

  if (commande === 'creer') {
    const r = await creerDemo({ query, withTransaction, enregistrerReponse, deposerEtLierPieces, stockageConfigure, maintenant: new Date() });
    console.log('\n✓ DÉMO créée.');
    console.log(`  • Demande fictive : #${r.demandeId} — ${r.reference} (statut « envoyée »)`);
    console.log(`  • Dossier sûr utilisé : #${r.dossierId} — ${r.numDau}${r.communeNom ? ` (${r.communeNom})` : ''}`);
    console.log(`  • Réponse rattachée : #${r.reponseId} — ${r.bilan.deposees} pièce(s) déposée(s), ${r.bilan.nonDeposees} non déposée(s)`);
    console.log('\n  Où aller voir (interface admin → Permis) :');
    console.log('   1. Onglet « Réponses » → « Suivi des demandes envoyées » → sous-onglet « En cours » : la demande DÉMO apparaît (envoyée, 1 dossier dû, 1 réponse).');
    console.log('   2. « Marquer reçu » le dossier → il bascule dans l’onglet « Archives ».');
    console.log('   ⚠️ Point à trancher (cf. compte rendu) : les pièces d’une réponse RATTACHÉE ne sont pas affichées dans le détail « Réponses » aujourd’hui,');
    console.log('      et « marquer reçu » manuel n’associe pas reponse_id → Archives n’affiche les pièces e-mail que via la satisfaction AUTOMATIQUE (relève).');
    console.log('      Les 2 pièces sont bien DÉPOSÉES en stockage (bilan ci-dessus) : la démo sert justement à décider où les rendre consultables.');
    console.log('\n  Pour tout effacer : npm run demo:reponse:supprimer\n');
  } else if (commande === 'supprimer') {
    const r = await supprimerDemo({ query, withTransaction, supprimer });
    if (r.supprime) {
      console.log(`\n✓ DÉMO effacée : demande #${r.demandeId} (${REFERENCE_DEMO}) + ${r.objetsStockage} objet(s) de stockage supprimé(s). Aucune autre donnée touchée.\n`);
    } else {
      console.log(`\n• Rien à effacer : aucune demande ${REFERENCE_DEMO} en base (déjà supprimée, ou jamais créée).\n`);
    }
  } else {
    throw new Error('Usage : tsx app/scripts/demo-reponse.ts <creer|supprimer>');
  }
}

void principal()
  .catch((err) => { console.error('✗', err instanceof Error ? err.message : String(err)); process.exitCode = 1; })
  .finally(() => closePool());
