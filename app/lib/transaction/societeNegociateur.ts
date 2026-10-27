import type { Societe } from './modele';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — LA SOCIÉTÉ DE CHAQUE COLLABORATEUR (PUR) ══════════════════════════════
 *   · une société vaut À COMPTER d'une date ; un changement ajoute une période et ne réécrit pas le passé (une vente garde la société
 *     de son négociateur au moment de la vente — figée sur la partie à l'enregistrement) ;
 *   · pour les comptes existants, la société se DÉDUIT des fichiers importés : un onglet dans les fichiers CRITERIMMO ⇒ CRITERIMMO,
 *     MACJ ⇒ MACJ ; une personne présente dans les deux n'est PAS tranchée (« à trancher », question à Arno) ; un onglet se rapproche d'un
 *     compte par son prénom (ou « prénom nom ») quand UN SEUL compte correspond.
 */

export interface PeriodeSociete { societe: Societe; depuis: string }

/** La société d'un compte à une date (« AAAA-MM-JJ ») : la période la plus récente commencée ce jour-là ; avant la première, la première. PUR. */
export function societeALaDate(periodes: readonly PeriodeSociete[], date: string): Societe | null {
  if (periodes.length === 0) return null;
  const triees = [...periodes].sort((a, b) => a.depuis.localeCompare(b.depuis));
  const commencees = triees.filter((p) => p.depuis <= date);
  return (commencees.at(-1) ?? triees[0]).societe;
}

/** Accents, casse, tirets, apostrophes et espaces ignorés. PUR. */
export const normaliserPrenom = (t: string | null | undefined): string => (t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’.]/g, ' ').replace(/\s+/g, ' ').trim();

export interface CompteDeduit { id: number; prenom: string; nom: string }
export interface OngletImporte { onglet: string; societe: Societe; lignes: number }
export type Deduction =
  | { sorte: 'deduite'; compte: CompteDeduit; societe: Societe; onglets: OngletImporte[] }
  | { sorte: 'a_trancher'; compte: CompteDeduit; onglets: OngletImporte[] }
  | { sorte: 'aucune'; compte: CompteDeduit };

/** Les comptes qu'un onglet désigne : prénom seul, « prénom nom » ou « nom prénom », égal au libellé normalisé. PUR. */
export function comptesDeLOnglet(onglet: string, comptes: readonly CompteDeduit[]): CompteDeduit[] {
  const o = normaliserPrenom(onglet);
  if (o === '') return [];
  return comptes.filter((c) => {
    const p = normaliserPrenom(c.prenom);
    const n = normaliserPrenom(c.nom);
    return o === p || o === `${p} ${n}` || o === `${n} ${p}`;
  });
}

/**
 * La société de chaque compte, d'après les onglets importés : un onglet ne se rattache qu'à UN compte (sinon il est listé à part,
 * « ambigu ») ; un compte vu dans les deux sociétés est « à trancher ». Les onglets sans compte sont rendus à part. PUR.
 */
export function deduireSocietes(comptes: readonly CompteDeduit[], onglets: readonly OngletImporte[]): {
  deductions: Deduction[]; sansCompte: OngletImporte[]; ambigus: { onglet: OngletImporte; comptes: CompteDeduit[] }[];
} {
  const parCompte = new Map<number, OngletImporte[]>();
  const sansCompte: OngletImporte[] = [];
  const ambigus: { onglet: OngletImporte; comptes: CompteDeduit[] }[] = [];
  for (const o of onglets) {
    const cs = comptesDeLOnglet(o.onglet, comptes);
    if (cs.length === 0) sansCompte.push(o);
    else if (cs.length > 1) ambigus.push({ onglet: o, comptes: cs });
    else parCompte.set(cs[0].id, [...(parCompte.get(cs[0].id) ?? []), o]);
  }
  const deductions = comptes.map((compte): Deduction => {
    const os = parCompte.get(compte.id) ?? [];
    const societes = [...new Set(os.map((o) => o.societe))];
    if (societes.length === 0) return { sorte: 'aucune', compte };
    if (societes.length > 1) return { sorte: 'a_trancher', compte, onglets: os };
    return { sorte: 'deduite', compte, societe: societes[0], onglets: os };
  });
  return { deductions, sansCompte, ambigus };
}

/** Les onglets présents dans les DEUX sociétés (même libellé normalisé), qu'un compte existe ou non (ex. CEDRIC). PUR. */
export function ongletsDesDeuxSocietes(onglets: readonly OngletImporte[]): string[] {
  const m = new Map<string, { libelle: string; societes: Set<Societe> }>();
  for (const o of onglets) {
    const k = normaliserPrenom(o.onglet);
    const x = m.get(k) ?? { libelle: o.onglet, societes: new Set<Societe>() };
    x.societes.add(o.societe);
    m.set(k, x);
  }
  return [...m.values()].filter((x) => x.societes.size > 1).map((x) => x.libelle).sort((a, b) => a.localeCompare(b, 'fr'));
}
