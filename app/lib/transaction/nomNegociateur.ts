import { formeNom, formePrenom } from './personnes';
import type { Retrocession, Vente } from './modele';

/**
 * ══ 🔴 LOT CG (Arno, 31/10/2026) — LE NOM AFFICHÉ D'UN NÉGOCIATEUR : « Prénom NOM » (PUR) ═══════════════════════════════════════════════════════
 * Partout dans la tuile (cartes, fiche, espace par négociateur, synthèse, fenêtres), un libellé de négociateur (« CEDRIC », « Cédric JULLIEN »,
 * « CATHERINE ») s'affiche « Prénom NOM » (`formePrenom` / `formeNom` du lot BL) :
 *   ① rattaché à un compte : le prénom et le nom du compte (CEDRIC → Cédric JULLIEN) ;
 *   ② sinon, la fiche « sans compte » (lot BX) quand son prénom ou son nom est renseigné (migration 445 : CATHERINE → Catherine TARRISSE) ;
 *   ③ sinon le libellé, en prénom (« JULIEN » → « Julien », « JEAN CLAUDE » → « Jean Claude ») — jamais en majuscules.
 */
export interface PrenomNom { prenom: string | null; nom: string | null }

export function nomAffiche(libelle: string, compte: PrenomNom | null, fiche: PrenomNom | null): string {
  const de = (x: PrenomNom): string => [formePrenom(x.prenom), formeNom(x.nom)].filter((y) => y !== '').join(' ');
  if (compte !== null && de(compte) !== '') return de(compte);
  if (fiche !== null && de(fiche) !== '') return de(fiche);
  return formePrenom(libelle);
}

/** Tous les libellés de négociateur d'un ensemble de ventes et de rétrocessions (lignes, parties, dossier, ligne miroir). PUR. */
export function libellesNegociateurs(ventes: readonly Vente[], retros: readonly Retrocession[] = []): string[] {
  const xs = new Set<string>();
  const ajouter = (x: string | null | undefined): void => { if (x != null && x.trim() !== '') xs.add(x); };
  for (const v of ventes) {
    v.lignes.forEach((l) => { if (l.role === 'negociateur' || l.role === 'part' || l.role === 'vendeur') ajouter(l.negociateur); });
    v.repartition?.parties.forEach((p) => ajouter(p.negociateur));
    ajouter(v.dossier?.entree?.nom); ajouter(v.dossier?.sortie?.nom);
    v.miroir?.cotes.forEach((c) => ajouter(c.negociateur));
  }
  retros.forEach((r) => ajouter(r.negociateur));
  return [...xs];
}
