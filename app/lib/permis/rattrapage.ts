import { actionsNomsRepli, libelleNomRepli, nomAffichageCorps } from './nomCorps';
import { actionsAutoStatut, type EtatStatutPolygone, type PolygoneRecouvert } from './polygoneStatut';

/**
 * NOM-2 — DÉCISION PURE du RATTRAPAGE d'un dossier déjà tracé : liste CE QUI SERAIT ÉCRIT (les noms de repli manquants + les statuts
 * automatiques de recouvrement), SANS rien écrire. Réutilise les décisions PURES existantes (`actionsNomsRepli`, `actionsAutoStatut`) →
 * MÊMES GARANTIES : on n'écrit jamais dans `repere`, on ne recalcule jamais un `nom_repli` déjà posé, on ne pose jamais par-dessus une
 * décision d'origine 'saisie', mêmes seuil/tolérance que RATT-5/RATT-6 (les `recouverts` reçus sont DÉJÀ filtrés au seuil courant, donc
 * `actionsAutoStatut` peut être appelé avec un seuil de 0 : leur taux détermine detruit vs mixte via la tolérance). PUR (aucune I/O).
 */
export interface ApercuNomRattrapage { corpsId: number; nomActuel: string; nomFutur: string }
export interface ApercuStatutRattrapage { cleabs: string; repere: string; statut: 'detruit' | 'mixte' | 'revoque'; tauxPct: number | null }
export interface ApercuRattrapage { noms: ApercuNomRattrapage[]; statuts: ApercuStatutRattrapage[] }

export function apercuRattrapage(
  corps: readonly { corpsId: number; repere: string | null; nomRepli?: string | null }[],
  reperesParCleabs: Map<string, string>,
  statuts: Map<string, EtatStatutPolygone>,
  recouverts: readonly PolygoneRecouvert[],
): ApercuRattrapage {
  const noms: ApercuNomRattrapage[] = actionsNomsRepli(corps.map((c) => ({ id: c.corpsId, repere: c.repere, nomRepli: c.nomRepli ?? null })))
    .map((a) => ({
      corpsId: a.corpsId,
      nomActuel: nomAffichageCorps({ repere: null, nomRepli: null, corpsId: a.corpsId }), // « bâtiment {id} » (l'affichage actuel, faute de nom)
      nomFutur: libelleNomRepli(a.code) ?? a.code,
    }));
  const tauxDe = new Map(recouverts.map((r) => [r.cleabs, r.tauxPct]));
  const statutsA: ApercuStatutRattrapage[] = actionsAutoStatut(recouverts, 0, statuts).map((a) => ({
    cleabs: a.cleabs,
    repere: reperesParCleabs.get(a.cleabs) ?? a.cleabs,
    statut: a.statut,
    tauxPct: tauxDe.get(a.cleabs) ?? null,
  }));
  return { noms, statuts: statutsA };
}

/** NOM-2 — le rattrapage n'a-t-il RIEN à écrire ? (aucun nom manquant, aucun statut à poser). PUR. */
export function rattrapageVide(a: ApercuRattrapage): boolean {
  return a.noms.length === 0 && a.statuts.length === 0;
}
