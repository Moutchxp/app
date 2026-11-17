import { withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { registreParAdresse } from './batimentRetraitRepo';
import type { DecisionBatiment } from './batimentsParAdresse';

/**
 * ══ 🔴🔴 LA REPRISE RÉELLE DES BÂTIMENTS PAR ADRESSE (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 3). IMPUR (écrit). ══════════════
 * « Lot 3 : la reprise réelle en recette selon le rapport (rien effacé) » — le plan (`planBatimentsParAdresse`, validé par Arno à blanc) est APPLIQUÉ :
 *   · une adresse déduite : elle est notée sur le bâtiment (seulement s'il n'en avait pas : jamais réécrite) ;
 *   · une SÉPARATION : le bâtiment existant garde la première adresse et son historique (retraits 488, liens) ; un NOUVEAU bâtiment par autre adresse
 *     (même nom, même sorte) ; chaque bien relié à une autre adresse suit le bâtiment de SON adresse, une ligne au journal du bien ;
 *   · « adresse à préciser » : rien (choix par Arno sur la fiche Copropriété).
 * Rien n'est effacé. Une transaction par bâtiment. Refus sans la 490 (l'unicité par adresse doit être posée avant toute séparation).
 */
export async function appliquerPlanBatiments(plan: readonly DecisionBatiment[], auteur: Auteur): Promise<{ notees: number; separes: number; nouveaux: number; biensSuivis: number }> {
  if (!(await registreParAdresse())) throw new Error('Migration 490 absente : la reprise réelle est impossible (rien n’a été écrit).');
  let notees = 0; let separes = 0; let nouveaux = 0; let biensSuivis = 0;
  for (const d of plan) {
    if (d.regle === 'deja' || d.regle === 'a_preciser' || d.adresseCle === null) continue;
    await withTransaction(async (q: RequeteTx) => {
      const r = await q('UPDATE gestion_copropriete_batiment SET adresse_cle = $2 WHERE id = $1 AND adresse_cle IS NULL', [d.batiment.id, d.adresseCle]);
      if ((r as { rowCount?: number }).rowCount === 1) notees += 1;
      if (d.regle !== 'separation') return;
      separes += 1;
      for (const n of d.nouveaux) {
        await q(`INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle, adresse_cle)
                 SELECT copropriete_id, batiment_cle, batiment_libelle, sorte, $2, $3, $4 FROM gestion_copropriete_batiment WHERE id = $1
                 ON CONFLICT (copropriete_id, adresse_cle, batiment_cle) WHERE adresse_cle IS NOT NULL DO NOTHING`,
        [d.batiment.id, auteur.id, auteur.libelle, n.adresseCle]);
        const { rows } = await q<{ id: string }>(
          'SELECT id::text FROM gestion_copropriete_batiment WHERE copropriete_id = $1 AND batiment_cle = $2 AND adresse_cle = $3', [d.batiment.coproId, d.batiment.cle, n.adresseCle]);
        const nouveau = rows[0]?.id;
        if (nouveau === undefined) throw new Error(`Séparation impossible pour le bâtiment n° ${d.batiment.id} (${n.adresseCle}).`);
        nouveaux += 1;
        for (const lot of n.lots) {
          await q('UPDATE gestion_annuaire_lot SET copropriete_batiment_id = $2 WHERE id = $1 AND copropriete_batiment_id = $3', [lot, nouveau, d.batiment.id]);
          await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
                   VALUES ('annuaire_lot', $1, 'batiment_copropriete', $2, $3, $4, $5, $6)`,
          [lot, `${d.batiment.libelle} (n° ${d.batiment.id})`, `${d.batiment.libelle} (n° ${nouveau})`,
            `bâtiment ${d.batiment.libelle} séparé par adresse : le bien suit le bâtiment de son adresse (reprise « Adresses multiples d’une copropriété »)`, auteur.id, auteur.libelle]);
          biensSuivis += 1;
        }
      }
    });
  }
  return { notees, separes, nouveaux, biensSuivis };
}
