// 🔴 D35 (Arno, 03/11/2026, option C) — L'ACTIVITÉ PRINCIPALE (SALAIRE) D'UN PROFIL ET LA RÉPARTITION DE SON SALAIRE CHARGÉ (PUR ; lu aussi par l'écran).
import type { Fonction } from './fonctionsCompteModele';

/**
 * ══ LA RÈGLE (une seule comptabilité) ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Le salaire chargé d'un collaborateur est UN montant par mois. UNE activité principale porte 100 % de ce salaire ; ses autres fonctions n'en
 * portent aucune part. L'activité principale est datée (« À compter du ») : le mois d'un changement, le salaire se partage en JOURS CALENDAIRES
 * — les jours avant la date vont à l'ancienne activité, ceux à partir de la date à la nouvelle —, chaque part arrondie au centime, le reste sur la
 * nouvelle (la somme = le salaire saisi, au centime). Les mois entièrement avant : 100 % l'ancienne ; après : 100 % la nouvelle. Rien n'est recopié :
 * la famille d'un salaire se CALCULE ici, partout où il apparaît.
 */
export interface VersionPrincipale { activite: Fonction; depuis: string | null }
export interface PeriodeFonction { fonction: Fonction; depuis: string | null; jusqua: string | null }
/** Une part du salaire d'un mois : son activité, son montant (centimes), ses jours (sur les jours du mois). */
export interface PartSalaire { famille: Fonction; htC: number; jours: number; joursMois: number }

export const joursDuMois = (annee: number, mois: number): number => new Date(Date.UTC(annee, mois, 0)).getUTCDate();
const iso = (annee: number, mois: number, jour: number): string => `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
const ordonner = (vs: readonly VersionPrincipale[]): VersionPrincipale[] => [...vs].sort((a, b) => (a.depuis ?? '').localeCompare(b.depuis ?? ''));

/** L'activité principale à une date (« AAAA-MM-JJ ») : la dernière version commencée ; null : aucune. PUR. */
export function principaleALaDate(vs: readonly VersionPrincipale[], dateIso: string): Fonction | null {
  let r: Fonction | null = null;
  for (const v of ordonner(vs)) if (v.depuis === null || v.depuis <= dateIso) r = v.activite;
  return r;
}
/** Le collaborateur a-t-il une activité principale au moins un jour de ce mois ? (la condition pour saisir son salaire) PUR. */
export const aUnePrincipaleAuMois = (vs: readonly VersionPrincipale[], annee: number, mois: number): boolean =>
  principaleALaDate(vs, iso(annee, mois, joursDuMois(annee, mois))) !== null;

/**
 * La répartition du salaire d'un mois entre activités (le mois d'un changement : au prorata des jours calendaires). Les jours d'avant la toute
 * première version (une activité principale posée en cours de mois) vont à celle-ci. Aucune activité principale : aucune part. PUR.
 */
export function repartirSalaire(vs: readonly VersionPrincipale[], annee: number, mois: number, montantHt: number): PartSalaire[] {
  const n = joursDuMois(annee, mois);
  const premiere = ordonner(vs)[0]?.activite ?? null;
  if (premiere === null) return [];
  const segments: { famille: Fonction; jours: number }[] = [];
  for (let j = 1; j <= n; j++) {
    const a = principaleALaDate(vs, iso(annee, mois, j)) ?? premiere;
    const dernier = segments.at(-1);
    if (dernier !== undefined && dernier.famille === a) dernier.jours += 1; else segments.push({ famille: a, jours: 1 });
  }
  const total = Math.round((montantHt + Math.sign(montantHt) * Number.EPSILON) * 100);
  let reste = total;
  const parts = segments.map((s, i) => {
    const htC = i === segments.length - 1 ? reste : Math.round((total * s.jours) / n);
    reste -= htC;
    return { famille: s.famille, htC, jours: s.jours, joursMois: n };
  });
  // une même activité deux fois dans le mois (A → B → A) : une part
  const parFamille = new Map<Fonction, PartSalaire>();
  for (const p of parts) { const x = parFamille.get(p.famille); parFamille.set(p.famille, x === undefined ? p : { ...x, htC: x.htC + p.htC, jours: x.jours + p.jours }); }
  return [...parFamille.values()];
}

/** Les fonctions en vigueur au moins un jour de ce mois (le rangement des profils proposés, C9). PUR. */
export function fonctionsAuMois(ps: readonly PeriodeFonction[], annee: number, mois: number): Fonction[] {
  const debut = iso(annee, mois, 1); const fin = iso(annee, mois, joursDuMois(annee, mois));
  return [...new Set(ps.filter((p) => (p.depuis === null || p.depuis <= fin) && (p.jusqua === null || p.jusqua > debut)).map((p) => p.fonction))];
}
/** Les fonctions en vigueur à une date. PUR. */
export const fonctionsALaDate = (ps: readonly PeriodeFonction[], dateIso: string): Fonction[] =>
  [...new Set(ps.filter((p) => (p.depuis === null || p.depuis <= dateIso) && (p.jusqua === null || p.jusqua > dateIso)).map((p) => p.fonction))];

/** La mention d'une part partielle (« prorata 15/30 j ») ; un mois entier : rien. PUR. */
export const mentionProrata = (p: Pick<PartSalaire, 'jours' | 'joursMois'>): string | null => (p.jours === p.joursMois ? null : `prorata ${p.jours}/${p.joursMois} j`);
