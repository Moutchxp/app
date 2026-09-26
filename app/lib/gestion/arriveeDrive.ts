/**
 * MODULE « GESTION » — LOT DRIVE-2-bis : LE DOSSIER D'ARRIVÉE. Module presque pur (une écriture Drive, gardée).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DÉCISION D'ARNO DU 26/09 : LA COPIE NE RANGE PLUS, ELLE DÉPOSE. Toutes les pièces arrivent dans
 * « Base de données locative / 00 Arrivée des mails / AAAA / MM », d'après la date du mail. Les dossiers des biens
 * et des propriétaires restent VIDES, et « 00 Non rattachés » n'est plus alimenté — mais il n'est pas supprimé :
 * il porte déjà 16 pièces de l'essai précédent, et on ne défait pas ce qu'on a fait sans qu'on le demande.
 *
 * 🔴 CES DOSSIERS PASSENT PAR LE MÊME CHEMIN GARDÉ QUE TOUS LES AUTRES : garde-fou, création, puis enregistrement
 * dans la liste blanche. Sans l'enregistrement, le mois suivant ne pourrait rien y déposer.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { NoeudArbre } from './driveGardeFou';
import { dossierPeriode, type DepsCopie } from './copiePiecesReel';

export const ARRIVEE_NOM = '00 Arrivée des mails';
export const CLE_ARRIVEE = 'arrivee';

/** L'année et le mois d'un mail, en deux morceaux. `null` si la date est illisible. PUR. */
export function periodeDe(date: string): { annee: string; mois: string } | null {
  const m = /^(\d{4})-(\d{2})/.exec((date ?? '').slice(0, 10));
  return m === null ? null : { annee: m[1], mois: m[2] };
}

/** Les clés des dossiers de période sous l'arrivée. Préfixées pour ne pas heurter celles de « 00 Non rattachés ». */
export const cleAnnee = (annee: string): string => `arrivee|${annee}`;
export const cleMois = (annee: string, mois: string): string => `arrivee|${annee}|${mois}`;

/** Une date illisible n'envoie pas la pièce n'importe où : elle a son dossier, et il le dit. */
export const ANNEE_INCONNUE = 'date inconnue';
export const MOIS_INCONNU = '00';

/**
 * LE DOSSIER D'ARRIVÉE D'UNE PIÈCE, en créant « AAAA » puis « MM » à la demande.
 *
 * `noeuds` et `parCle` sont MIS À JOUR : la même passe réutilise immédiatement ce qu'elle vient de créer, sans
 * relire la base ni redemander à Drive.
 */
export async function dossierArrivee(
  date: string,
  racineArrivee: NoeudArbre,
  noeuds: NoeudArbre[],
  parCle: Map<string, NoeudArbre>,
  jeton: string,
  deps: DepsCopie,
  compter: () => void,
): Promise<{ ok: true; dossier: NoeudArbre } | { ok: false; motif: string }> {
  const p = periodeDe(date);
  const annee = p?.annee ?? ANNEE_INCONNUE;
  const mois = p?.mois ?? MOIS_INCONNU;

  const creer = async (
    parent: NoeudArbre, nom: string, cle: string, chemin: string,
  ): Promise<NoeudArbre | { motif: string }> => {
    const deja = parCle.get(`periode|${cle}`);
    if (deja !== undefined) return deja;
    const r = await dossierPeriode({ parentDriveId: parent.driveId, nom, cle, chemin }, noeuds, jeton, deps);
    if (!r.ok) return { motif: r.motif };
    const n: NoeudArbre = { driveId: r.driveId, parentDriveId: parent.driveId, sorte: 'periode', nom, chemin };
    parCle.set(`periode|${cle}`, n);
    compter();
    return n;
  };

  const base = `/${ARRIVEE_NOM}`;
  const a = await creer(racineArrivee, annee, cleAnnee(annee), `${base}/${annee}`);
  if ('motif' in a) return { ok: false, motif: a.motif };
  const m = await creer(a, mois, cleMois(annee, mois), `${base}/${annee}/${mois}`);
  if ('motif' in m) return { ok: false, motif: m.motif };
  return { ok: true, dossier: m };
}
