import type { CoutLigne, CoutSaisi, FamilleCout } from './coutsSaisis';
import type { GestionMois, Societe } from './modele';
import type { SalairesLocation } from './locationCa';

/**
 * ══ 🔴🔴 LA CONFIDENTIALITÉ DES SALAIRES (Arno, 13/11/2026, option 1) — PUR ══════════════════════════════════════════════════════════════════════
 * Un compte qui a le droit « Transaction » SANS la case « Les coûts » garde le Suivi CA (ses totaux, ses analyses), mais ne reçoit JAMAIS un salaire
 * individuel, ni un montant qui permettrait de le retrouver par soustraction :
 *   · LE SERVEUR (`masquerSalaires`) retire le détail salarié par salarié ; un mois de salaires d'une famille (et d'une structure) qui compte AU MOINS
 *     DEUX salariés est livré en AGRÉGAT ; un mois qui n'en compte qu'un (ou un ancien montant mensuel dont on ne sait pas combien il en compte) n'est
 *     PAS livré : il est signalé « masqué » (`salairesMasques`) — et le « reste » du comptable de ce mois (honoraires − coûts − salaires) l'est aussi ;
 *   · LE NAVIGATEUR (`rehydraterSalairesMasques`) remet chaque montant masqué sous la forme d'une valeur INCONNUE (NaN) : elle se propage d'elle-même à
 *     TOUT ce qui en dépend — le total des coûts du mois, le CA net, le reste, les totaux de l'année, N−1, les écarts — et à rien d'autre ; l'affichage
 *     écrit « confidentiel » à sa place. Un total sans salaire seul reste exact au centime. « Sans salaires » : rien de masqué n'y entre.
 * Pour un compte « Les coûts » : rien de tout cela (les données d'avant, intactes).
 */
export { MOT_CONFIDENTIEL } from './format';
export interface SalaireMasque { societe: Societe; famille: FamilleCout; annee: number; mois: number }
export interface DonneesAvecSalaires {
  coutsLignes?: CoutLigne[] | null; coutsSaisis?: CoutSaisi[];
  gestion?: GestionMois[];
  locationCa?: { salaires: SalairesLocation[] | null } & Record<string, unknown> | null;
  /** La lecture de la page « Suivi CA › Location » (vue=location) : ses salaires mensuels. */
  salaires?: SalairesLocation[] | null;
  salairesMasques?: SalaireMasque[];
}
const cle = (s: Societe, f: FamilleCout, a: number, m: number): string => `${s}|${f}|${a}|${m}`;
const cent = (x: number): number => Math.round(x * 100) / 100;

/** Les salaires du serveur pour un lecteur sans « Les coûts » (voir l'encadré). `lignes` : toutes les lignes de coût (salaires éclatés par activité). PUR. */
export function masquerSalaires<T extends DonneesAvecSalaires>(d: T, lignes: readonly CoutLigne[]): T & { salairesMasques: SalaireMasque[] } {
  // ① qui touche un salaire, par structure × famille × mois
  const groupes = new Map<string, { s: Societe; f: FamilleCout; a: number; m: number; ids: Set<number>; ht: number }>();
  for (const l of lignes) {
    if (l.poste !== 'salaires') continue;
    const k = cle(l.societe, l.famille, l.annee, l.mois);
    const g = groupes.get(k) ?? { s: l.societe, f: l.famille, a: l.annee, m: l.mois, ids: new Set<number>(), ht: 0 };
    if (l.compteId !== null) g.ids.add(l.compteId);
    g.ht = cent(g.ht + l.montantHt);
    groupes.set(k, g);
  }
  const masques = new Map<string, SalaireMasque>();
  const masquer = (s: Societe, f: FamilleCout, a: number, m: number) => masques.set(cle(s, f, a, m), { societe: s, famille: f, annee: a, mois: m });
  for (const g of groupes.values()) if (g.ids.size < 2 && g.ht !== 0) masquer(g.s, g.f, g.a, g.m);
  // un ancien montant mensuel (sans lignes : on ne sait pas combien de salariés il compte) : masqué
  const sansLignes = (f: FamilleCout, a: number, m: number) => !groupes.has(cle('criterimmo', f, a, m));
  for (const g of d.gestion ?? []) if (g.salarieHt != null && g.salarieHt !== 0 && sansLignes('gestion', g.annee, g.mois)) masquer('criterimmo', 'gestion', g.annee, g.mois);
  for (const x of [...(d.locationCa?.salaires ?? []), ...(d.salaires ?? [])]) if (x.salairesHt != null && x.salairesHt !== 0 && sansLignes('location', x.annee, x.mois)) masquer('criterimmo', 'location', x.annee, x.mois);
  const estMasque = (s: Societe, f: FamilleCout, a: number, m: number) => masques.has(cle(s, f, a, m));
  // ② ce qui est livré : jamais une ligne de salarié ; la vente en agrégat par structure et mois (au moins deux salariés) ; rien d'un mois masqué
  const venteAgregee: CoutSaisi[] = [...groupes.values()].filter((g) => g.f === 'vente' && !estMasque(g.s, g.f, g.a, g.m))
    .map((g) => ({ societe: g.s, famille: 'vente', poste: 'salaires', annee: g.a, mois: g.m, montantHt: g.ht }));
  const sansSalaire = <L extends { poste: string }>(xs: readonly L[]) => xs.filter((l) => l.poste !== 'salaires' && l.poste !== 'remunerations');
  const out: T & { salairesMasques: SalaireMasque[] } = { ...d, salairesMasques: [...masques.values()] };
  if (d.coutsLignes != null) out.coutsLignes = sansSalaire(d.coutsLignes);
  if (d.coutsSaisis !== undefined) out.coutsSaisis = [...sansSalaire(d.coutsSaisis), ...venteAgregee];
  if (d.gestion !== undefined) out.gestion = d.gestion.map((g) => (estMasque('criterimmo', 'gestion', g.annee, g.mois) ? { ...g, salarieHt: null, resteHt: null } : g));
  const loc = (xs: SalairesLocation[] | null | undefined) => (xs == null ? xs : xs.map((x) => (estMasque('criterimmo', 'location', x.annee, x.mois) ? { ...x, salairesHt: null } : x)));
  if (d.locationCa != null) out.locationCa = { ...d.locationCa, salaires: loc(d.locationCa.salaires) ?? null };
  if (d.salaires !== undefined) out.salaires = loc(d.salaires);
  return out;
}

/**
 * Le navigateur : chaque salaire masqué redevient une valeur INCONNUE (NaN) là où l'écran l'aurait lue — la ligne de gestion du mois (salarié ET
 * reste), le mois des salaires de la Location, une ligne de salaires de la vente — pour que tout ce qui en dépend se sache inconnu. Sans masque : les
 * données telles quelles (le même objet). PUR.
 */
export function rehydraterSalairesMasques<T extends DonneesAvecSalaires>(d: T): T {
  const ms = d.salairesMasques ?? [];
  if (ms.length === 0) return d;
  const de = (f: FamilleCout) => ms.filter((x) => x.famille === f);
  const out: T = { ...d };
  if (d.gestion !== undefined) {
    const g = [...d.gestion];
    for (const x of de('gestion')) {
      const i = g.findIndex((r) => r.annee === x.annee && r.mois === x.mois);
      if (i >= 0) g[i] = { ...g[i], salarieHt: Number.NaN, resteHt: Number.NaN };
      else g.push({ id: -(x.annee * 100 + x.mois), annee: x.annee, mois: x.mois, nbLots: null, honorairesHt: null, adhocHt: null, mongaHt: null, salarieHt: Number.NaN, resteHt: null, note: null, origine: 'saisie' });
    }
    out.gestion = g.sort((a, b) => a.annee - b.annee || a.mois - b.mois);
  }
  const loc = (xs: SalairesLocation[] | null | undefined): SalairesLocation[] | null | undefined => {
    if (xs === undefined) return xs;
    const r = [...(xs ?? [])];
    for (const x of de('location')) {
      const i = r.findIndex((y) => y.annee === x.annee && y.mois === x.mois);
      if (i >= 0) r[i] = { ...r[i], salairesHt: Number.NaN }; else r.push({ annee: x.annee, mois: x.mois, salairesHt: Number.NaN, note: null });
    }
    return r;
  };
  if (d.locationCa != null) out.locationCa = { ...d.locationCa, salaires: loc(d.locationCa.salaires) ?? null };
  if (d.salaires !== undefined) out.salaires = loc(d.salaires);
  if (d.coutsSaisis !== undefined) out.coutsSaisis = [...d.coutsSaisis, ...de('vente').map((x) => ({ societe: x.societe, famille: 'vente' as const, poste: 'salaires' as const,
    annee: x.annee, mois: x.mois, montantHt: Number.NaN }))];
  return out;
}

/** Un montant inconnu (un salaire confidentiel, ou ce qui en dépend) ? PUR. */
export const estConfidentiel = (x: number | null | undefined): boolean => typeof x === 'number' && Number.isNaN(x);
