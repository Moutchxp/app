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
export type NatureEnvoi = 'initiale' | 'relance_ordinaire' | 'relance_partielle';

/** Un envoi BRUT (avant mise en forme), tel que sorti d'une des deux sources. La `categorie` dit d'où il vient et quel grade lire. */
export interface EnvoiBrut {
  le: string;                                          // ISO de l'envoi (envoye_le d'acheminement OU horodatage du journal)
  categorie: 'initiale' | 'ordinaire' | 'partielle';  // initiale = 1er envoi (acheminement relance_id NULL) ; ordinaire = acheminement relance_id NOT NULL ; partielle = journal
  variante: string | null;                            // ordinaire : rappel/avis/saisine ; sinon null
  rang: number | null;                                // partielle : 1, 2, … ; sinon null
  destinataire: string | null;                        // si connu (dest_nom/dest_email, ou details du journal)
}

/** Un envoi MIS EN FORME pour l'affichage : sa nature, son grade lisible, un libellé complet, la date/heure et le destinataire. */
export interface EnvoiHistorique {
  le: string;                    // ISO
  nature: NatureEnvoi;
  grade: string | null;         // ordinaire : « Rappel »/« Avis d'échéance »/« Saisine » ; partielle : « 1re relance »… ; initiale : null
  libelle: string;              // texte lisible complet (« Demande initiale de communication », « Relance — Rappel », « Relance partielle — 2e relance »)
  destinataire: string | null;
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
      const grade = `${ordinalRelance(e.rang ?? 1)} relance`; // vocab PARTIEL (ordinaux) — jamais fusionné avec l'ordinaire
      return { le: e.le, nature: 'relance_partielle', grade, libelle: `Relance partielle — ${grade}`, destinataire: e.destinataire };
    });
}

/**
 * Point 10 — quand l'historique s'allonge, on REPLIE les entrées ANCIENNES (jamais un pavé qui repousse les gestes hors de l'écran).
 * Règle : ≤ 4 envois → tout visible ; au-delà → la demande INITIALE (ancre) et les 3 PLUS RÉCENTS restent visibles, le MILIEU
 * (plus anciennes relances) part derrière un repli. PUR (l'ordre chronologique est préservé : initiale, [repliées], récentes).
 */
export function partitionnerHistorique(envois: readonly EnvoiHistorique[]): { visibles: EnvoiHistorique[]; repliees: EnvoiHistorique[] } {
  if (envois.length <= 4) return { visibles: [...envois], repliees: [] };
  return { visibles: [envois[0], ...envois.slice(-3)], repliees: envois.slice(1, envois.length - 3) };
}
