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

/**
 * 🔴 LOT CQ (règle d'Arno : un même négociateur n'apparaît JAMAIS deux fois) — les libellés regroupés par PERSONNE, selon la correspondance
 * libellé → « Prénom NOM » du lot CG (`nommer`) : « ARNAUD » et « Arnaud Jorel » → une seule entrée « Arnaud JOREL ». Triées par nom. PUR.
 */
export interface PersonneNegociateur { nom: string; libelles: string[] }
export function personnesNegociateurs(libelles: readonly string[], nommer: (libelle: string) => string): PersonneNegociateur[] {
  const m = new Map<string, string[]>();
  for (const l of libelles) { const n = nommer(l); m.set(n, [...new Set([...(m.get(n) ?? []), l])]); }
  return [...m].map(([nom, ls]) => ({ nom, libelles: ls })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
/**
 * Le filtre « Négociateur » : sa valeur (le nom affiché — ou, lien d'avant, un libellé) → les libellés de la personne. Inconnue : la valeur seule
 * (rien ne correspond, comme avant). PUR.
 */
export function libellesDuFiltre(personnes: readonly PersonneNegociateur[], valeur: string): { nom: string; libelles: string[] } {
  const p = personnes.find((x) => x.nom === valeur) ?? personnes.find((x) => x.libelles.includes(valeur));
  return p === undefined ? { nom: valeur, libelles: [valeur] } : { nom: p.nom, libelles: p.libelles };
}
