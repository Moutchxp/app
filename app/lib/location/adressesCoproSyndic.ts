/**
 * ══ 🔴🔴 Arno (28/11/2026, 12h17, point 4) — LA FICHE SYNDIC NE RÉPÈTE JAMAIS UNE ADRESSE ═════════════════════════════════════════════════════════════
 * « Sur la fiche syndic, la liste des adresses d'une copropriété montre des doublons (« 43 Avenue Marceau · 43 avenue Marceau · 43 avenue Marceau · 80 rue
 * de Normandie · 80 rue de Normandie »). » CONSTAT (recette, lecture seule) : ce ne sont pas des doublons en base — la liste écrivait l'adresse de CHAQUE
 * BIEN de la copropriété. Une adresse n'est donc écrite qu'une fois, sous la clé de comparaison de la 522 (`cleComparable` : majuscules, accents,
 * ponctuation, « bis / ter » et abréviations du type de voie ignorés) ; ses biens la suivent (aucun lien vers un bien n'est perdu). PUR.
 */
import { cleComparable } from '../gestion/adresseCoproExclusivite';

export interface AdresseEtSesBiens<L> { adresse: string; cle: string; lots: L[] }

/** Les biens groupés par adresse (une fois chacune, dans l'ordre de première apparition) ; un bien sans adresse garde la sienne, vide. PUR. */
export function biensParAdresse<L extends { adresse: string | null }>(lots: readonly L[]): AdresseEtSesBiens<L>[] {
  const groupes = new Map<string, AdresseEtSesBiens<L>>();
  for (const l of lots) {
    const adresse = (l.adresse ?? '').replace(/\s+/g, ' ').trim();
    const cle = adresse === '' ? '' : cleComparable(adresse);
    const g = groupes.get(cle) ?? { adresse, cle, lots: [] };
    g.lots.push(l);
    groupes.set(cle, g);
  }
  return [...groupes.values()];
}
