/**
 * TUILE « TRANSACTION », LOT D — LES VENDEURS ET ACQUÉREURS : JAMAIS DEUX FICHES POUR UNE PERSONNE (PUR).
 * L'annuaire des contacts existant ne convient pas : celui de la Gestion n'accepte que les propriétaires et locataires du fichier WIPPIMMO
 * (repris à chaque import), celui des contacts externes exige une adresse e-mail. Les vendeurs et acquéreurs ont donc des fiches DÉDIÉES
 * (`transaction_personne`, migration 434) ; une saisie qui désigne une personne déjà connue la RÉUTILISE :
 *   même e-mail (casse et espaces ignorés), ou même téléphone (les 9 derniers chiffres), ou même nom ET même adresse (normalisés).
 */

export interface FichePersonne { nom: string; telephone: string | null; email: string | null; adresse: string | null }

const norm = (t: string | null | undefined): string => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’.,]/g, ' ').replace(/\s+/g, ' ').trim();
/** Les 9 derniers chiffres d'un téléphone (« 06 12 34 56 78 » = « +33 6 12 34 56 78 ») ; '' s'il en a moins de 9. PUR. */
export const cleTelephone = (t: string | null | undefined): string => { const c = (t ?? '').replace(/\D/g, ''); return c.length < 9 ? '' : c.slice(-9); };
export const cleEmail = (e: string | null | undefined): string => (e ?? '').trim().toLowerCase();

/** Deux fiches désignent-elles la même personne ? PUR. */
export function memePersonne(a: FichePersonne, b: FichePersonne): boolean {
  if (cleEmail(a.email) !== '' && cleEmail(a.email) === cleEmail(b.email)) return true;
  if (cleTelephone(a.telephone) !== '' && cleTelephone(a.telephone) === cleTelephone(b.telephone)) return true;
  return norm(a.nom) !== '' && norm(a.nom) === norm(b.nom) && norm(a.adresse) !== '' && norm(a.adresse) === norm(b.adresse);
}

/** La fiche existante qu'une saisie désigne (la première, par id croissant), ou null. PUR. */
export function personneExistante<P extends FichePersonne & { id: number }>(saisie: FichePersonne, existantes: readonly P[]): P | null {
  return [...existantes].sort((x, y) => x.id - y.id).find((p) => memePersonne(saisie, p)) ?? null;
}

/** Le libellé d'une vente tiré de ses personnes : « VENDEURS / ACQUÉREURS » (noms dans l'ordre de saisie). PUR. */
export function libelleDesPersonnes(personnes: readonly { role: 'vendeur' | 'acquereur'; nom: string }[]): string {
  const v = personnes.filter((p) => p.role === 'vendeur').map((p) => p.nom.trim()).filter((x) => x !== '');
  const a = personnes.filter((p) => p.role === 'acquereur').map((p) => p.nom.trim()).filter((x) => x !== '');
  return [v.join(', '), a.join(', ')].filter((x) => x !== '').join(' / ');
}
