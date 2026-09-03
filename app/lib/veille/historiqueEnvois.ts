import { libelleVarianteRelance } from './statutCascade';
import { ordinalRelance } from './decompteButoir';

/**
 * LOT 13-B — HISTORIQUE de NOS envois à la mairie (la demande initiale de communication, puis chaque relance). Cœur PUR : tri
 * chronologique + mise en forme des grades. AUCUNE I/O (les deux sources — `demande_acheminement` et `demande_journal` — sont
 * lues ailleurs, en batch, puis passées ici sous forme d'`EnvoiBrut`).
 *
 * ⚠️ VOCABULAIRES NON FUSIONNÉS (décision LOT 8) : la cascade ORDINAIRE porte des noms propres (Rappel / Avis d'échéance / Saisine),
 *    la cascade PARTIELLE des ordinaux (« 1re relance », « 2e relance »…). On ne mélange jamais les deux échelles.
 */
export type NatureEnvoi = 'initiale' | 'relance_ordinaire' | 'relance_partielle' | 'complement_extra' | 'relance_reponse';

/** Un envoi BRUT (avant mise en forme), tel que sorti d'une des deux sources. La `categorie` dit d'où il vient et quel grade lire. */
export interface EnvoiBrut {
  le: string;                                                    // ISO de l'envoi (envoye_le d'acheminement OU horodatage du journal)
  categorie: 'initiale' | 'ordinaire' | 'partielle' | 'extra' | 'reponse';  // …+ « extra » (LOT 30 ③) = envoi manuel supplémentaire NON compté ; « reponse » (LOT 48) = relance sur réponse partielle (mécanisme distinct de la cascade)
  variante: string | null;                                      // ordinaire : rappel/avis/saisine ; sinon null
  rang: number | null;                                          // partielle : 1, 2, … ; sinon null
  destinataire: string | null;                                  // si connu (dest_nom/dest_email, ou details du journal)
  manuel?: boolean;                                             // LOT 30 (③) : relance partielle COMPTÉE faite À LA MAIN (au lieu de partie tout seul)
}

/** Un envoi MIS EN FORME pour l'affichage : sa nature, son grade lisible, un libellé complet, la date/heure et le destinataire. */
export interface EnvoiHistorique {
  le: string;                    // ISO
  nature: NatureEnvoi;
  grade: string | null;         // ordinaire : « Rappel »/« Avis d'échéance »/« Saisine » ; partielle : « 1re relance »… ; initiale/extra : null
  libelle: string;              // texte lisible complet
  destinataire: string | null;
  manuel?: boolean;             // LOT 30 (③) : relance partielle COMPTÉE mais faite à la main
}

/**
 * Ordonne et met en forme l'historique : tri chronologique CROISSANT (la demande initiale, toujours la plus ancienne, vient en tête,
 * puis chaque relance dans l'ordre où elle est partie). PUR et stable (tri par date ISO comparable lexicographiquement).
 */
export function ordonnerHistoriqueEnvois(bruts: readonly EnvoiBrut[]): EnvoiHistorique[] {
  return [...bruts]
    .sort((a, b) => (a.le < b.le ? -1 : a.le > b.le ? 1 : 0))
    .map((e): EnvoiHistorique => {
      if (e.categorie === 'initiale') {
        return { le: e.le, nature: 'initiale', grade: null, libelle: 'Demande initiale de communication', destinataire: e.destinataire };
      }
      if (e.categorie === 'ordinaire') {
        const grade = libelleVarianteRelance(e.variante ?? ''); // vocab ORDINAIRE (source unique statutCascade)
        return { le: e.le, nature: 'relance_ordinaire', grade, libelle: `Relance — ${grade}`, destinataire: e.destinataire };
      }
      if (e.categorie === 'extra') { // LOT 30 (③) — envoi manuel supplémentaire (NON compté) : n'a pas de rang de cascade.
        return { le: e.le, nature: 'complement_extra', grade: null, libelle: 'Envoi supplémentaire', destinataire: e.destinataire };
      }
      if (e.categorie === 'reponse') { // LOT 48 — relance sur réponse partielle : ÉTAPE À PART (mécanisme distinct de la cascade partielle, jamais fusionnée).
        const grade = `${ordinalRelance(e.rang ?? 1)} relance`;
        return { le: e.le, nature: 'relance_reponse', grade, libelle: 'Relance après réponse partielle', destinataire: e.destinataire };
      }
      const grade = `${ordinalRelance(e.rang ?? 1)} relance`; // vocab PARTIEL (ordinaux) — jamais fusionné avec l'ordinaire
      return { le: e.le, nature: 'relance_partielle', grade, libelle: `Relance partielle — ${grade}`, destinataire: e.destinataire, manuel: e.manuel };
    });
}
// LOT 15 — le repli des entrées anciennes vit désormais dans `partitionnerFrise` (friseSuivi.ts) : la frise unifie envois ET cascade,
//   le repli s'applique aux seuls FAITS passés (les échéances restent visibles). L'ancien `partitionnerHistorique` (LOT 13) est absorbé.
