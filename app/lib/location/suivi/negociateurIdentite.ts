/**
 * ══ 🔴🔴 LOCATION — UNE PERSONNE = UN SEUL ESPACE NÉGOCIATEUR (Arno, 26/10/2026). PUR. ═══════════════════════════════════════════════
 *
 * CONSTAT : le Suivi du mois d'octobre 2026 montrait « Négociateur — jb.pons@sansvisavis.com » ET « Négociateur — Jean-Baptiste PONS »
 * pour la même personne. CAUSE (`tableauBord.ts:119`, `cleNegociateur`) : un négociateur est identifié par son COMPTE quand la ligne en
 * porte un (`id:N`), sinon par le TEXTE de son libellé (`nom:…`) — une ligne saisie avec le compte et une ligne reprise du fichier avec
 * le seul texte formaient deux espaces ; le nom affiché était celui de la première ligne de chaque clé (`tableauBord.ts:821`), parfois
 * l'adresse du compte. Les rétrocessions suivent la même clé (`tableauBord.ts:822`).
 *
 * RÈGLE : chaque libellé texte est rattaché à un compte collaborateur par une correspondance EXPLICITE, jamais devinée en silence :
 *   ① un rattachement posé à la main par Arno (table d'alias, migration 432 — réversible, journalisé) ;
 *   ② sinon, une correspondance SANS AMBIGUÏTÉ : le libellé est exactement « prénom nom », « nom prénom » ou l'adresse d'UN SEUL compte
 *      (casse, accents et espaces ignorés) ;
 *   ③ sinon (plusieurs comptes possibles, ou aucun) : le libellé reste séparé et figure dans « Négociateurs à rapprocher ».
 * Une ligne rattachée prend l'identité du compte (`negociateurId`) : toutes ses rémunérations rejoignent l'espace unique, partout où la clé
 * sert (espaces du mois, filtre, totaux, tableaux annuels). L'espace porte le NOM de la personne, jamais son adresse (sauf compte sans nom).
 * Le libellé d'origine est gardé (`negociateurLibelleOrigine`). Aucun montant ne change : seules les clés se rejoignent.
 */

export interface CompteNegociateur { id: number; identifiant: string; prenom: string | null; nom: string | null }
export interface AliasNegociateur { libelleNormalise: string; libelle: string; compteId: number }

/** Casse, accents et espaces ignorés. PUR. */
export const normaliserLibelle = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Le nom de la personne (« Jean-Baptiste PONS ») ; l'adresse seulement si le compte n'a pas de nom. PUR. */
export const nomDuCompteNegociateur = (c: CompteNegociateur): string =>
  [c.prenom, c.nom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ') || c.identifiant;

export type Rattachement =
  | { sorte: 'compte' | 'alias' | 'auto'; compteId: number }
  | { sorte: 'ambigu'; candidats: number[] }
  | { sorte: 'aucun' };

/** Le compte d'un libellé texte (sans compte sur la ligne). PUR. */
export function rattacherLibelle(libelle: string, comptes: readonly CompteNegociateur[], alias: readonly AliasNegociateur[]): Rattachement {
  const n = normaliserLibelle(libelle);
  if (n === '') return { sorte: 'aucun' };
  const a = alias.find((x) => x.libelleNormalise === n && comptes.some((c) => c.id === x.compteId));
  if (a !== undefined) return { sorte: 'alias', compteId: a.compteId };
  const candidats = comptes.filter((c) => {
    const p = normaliserLibelle(c.prenom); const nm = normaliserLibelle(c.nom);
    const formes = [p !== '' && nm !== '' ? `${p} ${nm}` : null, p !== '' && nm !== '' ? `${nm} ${p}` : null, normaliserLibelle(c.identifiant)];
    return formes.includes(n);
  }).map((c) => c.id);
  if (candidats.length === 1) return { sorte: 'auto', compteId: candidats[0] };
  return candidats.length > 1 ? { sorte: 'ambigu', candidats } : { sorte: 'aucun' };
}

export interface LibelleARapprocher { libelle: string; nb: number; candidats: { id: number; nom: string }[] }

/**
 * LES LIGNES (activités ou rétrocessions) AVEC LEUR IDENTITÉ UNIQUE : une ligne avec compte prend le nom du compte ; une ligne sans compte
 * prend le compte de son libellé quand il est sûr (①②) ; les autres restent telles quelles et sont listées « à rapprocher ». PUR.
 */
export function unifierNegociateurs<T extends { negociateurId: number | null; negociateurLibelle: string }>(
  lignes: readonly T[], comptes: readonly CompteNegociateur[], alias: readonly AliasNegociateur[],
): { lignes: (T & { negociateurLibelleOrigine?: string })[]; aRapprocher: LibelleARapprocher[] } {
  const parId = new Map(comptes.map((c) => [c.id, c]));
  const restes = new Map<string, LibelleARapprocher>();
  const sortie = lignes.map((l) => {
    if (l.negociateurId !== null) {
      const c = parId.get(l.negociateurId);
      return c === undefined ? l : { ...l, negociateurLibelle: nomDuCompteNegociateur(c) };
    }
    if (l.negociateurLibelle.trim() === '') return l;
    const r = rattacherLibelle(l.negociateurLibelle, comptes, alias);
    if (r.sorte === 'alias' || r.sorte === 'auto' || r.sorte === 'compte') {
      const c = parId.get(r.compteId) as CompteNegociateur;
      return { ...l, negociateurId: c.id, negociateurLibelle: nomDuCompteNegociateur(c), negociateurLibelleOrigine: l.negociateurLibelle };
    }
    const cle = normaliserLibelle(l.negociateurLibelle);
    const deja = restes.get(cle);
    if (deja !== undefined) deja.nb += 1;
    else restes.set(cle, { libelle: l.negociateurLibelle.trim(), nb: 1,
      candidats: (r.sorte === 'ambigu' ? r.candidats : []).map((id) => ({ id, nom: nomDuCompteNegociateur(parId.get(id) as CompteNegociateur) })) });
    return l;
  });
  return { lignes: sortie, aRapprocher: [...restes.values()].sort((x, y) => x.libelle.localeCompare(y.libelle)) };
}
