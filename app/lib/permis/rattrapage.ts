import { actionsNomsRepli, libelleNomRepli, nomAffichageCorps } from './nomCorps';
import { actionsAutoStatut, type EtatStatutPolygone, type PolygoneRecouvert } from './polygoneStatut';

// AFF-2 — défaut du seuil « détruit » POUR CET APERÇU uniquement. La constante pilotable canonique est SEUIL_DESTRUCTION_PCT_DEFAUT
//   (rattachementConfig, migration 214), MAIS ce module est importé par un composant CLIENT (SuiviRattachementVue) : importer
//   rattachementConfig tirerait `pg` (db/client) dans le bundle navigateur. On garde donc ici un fallback local, aligné sur le défaut.
const SEUIL_DESTRUCTION_APERCU_DEFAUT = 75;

/**
 * NOM-2 — DÉCISION PURE du RATTRAPAGE d'un dossier déjà tracé : liste CE QUI SERAIT ÉCRIT (les noms de repli manquants + les statuts
 * automatiques de recouvrement), SANS rien écrire. Réutilise les décisions PURES existantes (`actionsNomsRepli`, `actionsAutoStatut`) →
 * MÊMES GARANTIES : on n'écrit jamais dans `repere`, on ne recalcule jamais un `nom_repli` déjà posé, on ne pose jamais par-dessus une
 * décision d'origine 'saisie'. Les `recouverts` reçus sont DÉJÀ filtrés au plancher courant → on passe plancher=0 à `actionsAutoStatut` et
 * seul le seuil « détruit » (AFF-2) départage detruit vs mixte. `seuilDetruitPct` défaut = défaut config (aperçu informatif). PUR (aucune I/O).
 */
export interface ApercuNomRattrapage { corpsId: number; nomActuel: string; nomFutur: string }
export interface ApercuStatutRattrapage { cleabs: string; repere: string; statut: 'detruit' | 'mixte' | 'revoque'; tauxPct: number | null }
export interface ApercuRattrapage { noms: ApercuNomRattrapage[]; statuts: ApercuStatutRattrapage[] }

export function apercuRattrapage(
  corps: readonly { corpsId: number; repere: string | null; nomRepli?: string | null }[],
  reperesParCleabs: Map<string, string>,
  statuts: Map<string, EtatStatutPolygone>,
  recouverts: readonly PolygoneRecouvert[],
  seuilDetruitPct: number = SEUIL_DESTRUCTION_APERCU_DEFAUT,
): ApercuRattrapage {
  const noms: ApercuNomRattrapage[] = actionsNomsRepli(corps.map((c) => ({ id: c.corpsId, repere: c.repere, nomRepli: c.nomRepli ?? null })))
    .map((a) => ({
      corpsId: a.corpsId,
      nomActuel: nomAffichageCorps({ repere: null, nomRepli: null, corpsId: a.corpsId }), // « bâtiment {id} » (l'affichage actuel, faute de nom)
      nomFutur: libelleNomRepli(a.code) ?? a.code,
    }));
  const tauxDe = new Map(recouverts.map((r) => [r.cleabs, r.tauxPct]));
  const statutsA: ApercuStatutRattrapage[] = actionsAutoStatut(recouverts, 0, seuilDetruitPct, statuts).map((a) => ({
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
