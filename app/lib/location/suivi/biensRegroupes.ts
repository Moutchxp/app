import { detailsAnnexe, typeDuLot, type AnnexeAffichee } from '../../gestion/annexesBien';

/**
 * ══ 🔴 Arno (26/10/2026) — OUTILS DE SUIVI : UNE SEULE LIGNE PAR BIEN (LE LOT PRINCIPAL ET SES ANNEXES) ══════════════════════════════
 * Les tableaux listaient une ligne par LOT : le lot principal, puis chaque annexe (« annexe — non comptée »). Désormais une ligne par
 * BIEN, la règle de la fiche du bien : le lot principal et ses annexes RATTACHÉES (`gestion_lot_annexe`, non détachées).
 *   · Le regroupement suit le LIEN annexe → lot principal, jamais l'adresse : une annexe à une autre adresse est regroupée quand même.
 *   · Une annexe DÉTACHÉE (bien autonome, sa propre fiche) n'est pas dans les liens transmis : elle garde sa ligne, sans mention.
 *   · Une annexe dont le lot principal n'a pas de ligne sur la période : la ligne du bien est ouverte quand même (adresse du lot principal),
 *     et le dit (`principalAbsent`).
 *   · AFFICHAGE SEUL : les lignes d'origine restent dans le groupe, et un montant de groupe n'est que la SOMME des montants de ses lignes
 *     (le total d'une colonne ne change pas d'un centime). Aucun compteur métier n'est recalculé ici. PUR.
 */
export interface LienAnnexeAffiche extends AnnexeAffichee {
  parentId: number;
  parentLibelle: string;
  parentAdresse: string | null;
  parentCommune: string | null;
}

export interface AnnexeDuGroupe<T> { lotId: number; type: string; details: string[]; ligne: T }

export interface GroupeBien<T> {
  cle: string;
  /** Le lot principal du bien (null : ligne sans bien rattaché). */
  lotId: number | null;
  libelle: string;
  /** La ligne du lot principal ; null quand seules ses annexes ont une ligne. */
  principal: T | null;
  principalAbsent: boolean;
  annexes: AnnexeDuGroupe<T>[];
  /** Toutes les lignes d'origine du groupe, dans leur ordre. */
  lignes: T[];
}

export function regrouperParBien<T extends { lotId: number | null; libelle: string }>(
  lignes: readonly T[], liens: readonly LienAnnexeAffiche[] | undefined,
): GroupeBien<T>[] {
  const lienDe = new Map((liens ?? []).map((l) => [l.id, l]));
  const groupes: (GroupeBien<T> & { rang: number })[] = [];
  const parPrincipal = new Map<number, GroupeBien<T> & { rang: number }>();
  // 1) Chaque ligne qui n'est pas une annexe rattachée ouvre SA ligne (deux lignes d'un même lot principal restent deux lignes).
  lignes.forEach((l, i) => {
    if (l.lotId !== null && lienDe.has(l.lotId)) return;
    const g = { cle: `l-${i}`, lotId: l.lotId, libelle: l.libelle, principal: l, principalAbsent: false, annexes: [], lignes: [l], rang: i };
    groupes.push(g);
    if (l.lotId !== null && !parPrincipal.has(l.lotId)) parPrincipal.set(l.lotId, g);
  });
  // 2) Chaque annexe rejoint la ligne de son lot principal (ouverte au besoin).
  lignes.forEach((l, i) => {
    const lien = l.lotId !== null ? lienDe.get(l.lotId) : undefined;
    if (lien === undefined) return;
    let g = parPrincipal.get(lien.parentId);
    if (g === undefined) {
      g = { cle: `p-${lien.parentId}`, lotId: lien.parentId, libelle: lien.parentLibelle, principal: null, principalAbsent: true, annexes: [], lignes: [], rang: i };
      groupes.push(g);
      parPrincipal.set(lien.parentId, g);
    }
    g.lignes.push(l);
    g.annexes.push({ lotId: lien.id, type: typeDuLot(lien), details: detailsAnnexe(lien, { adresse: lien.parentAdresse, commune: lien.parentCommune }), ligne: l });
  });
  return groupes.sort((a, b) => a.rang - b.rang).map((g) => ({
    cle: g.cle, lotId: g.lotId, libelle: g.libelle, principal: g.principal, principalAbsent: g.principalAbsent, annexes: g.annexes, lignes: g.lignes,
  }));
}

/** « + 1 annexe », « + 2 annexes ». PUR. */
export const motAnnexes = (n: number): string => `+ ${n} annexe${n > 1 ? 's' : ''}`;

/** La somme d'un montant sur les lignes d'un groupe ; null si aucune ligne n'en a (« — », comme avant). PUR. */
export function sommeDuGroupe<T>(g: Pick<GroupeBien<T>, 'lignes'>, montant: (l: T) => number | null): number | null {
  const v = g.lignes.map(montant).filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((s, x) => s + x, 0);
}
