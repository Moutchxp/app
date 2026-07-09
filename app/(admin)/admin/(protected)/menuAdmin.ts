import type { Perms, RoleAdmin } from '../../../lib/admin/session';

export interface LienMenu {
  slug: string;
  libelle: string;
}

/** Modules de la barre latérale et leur permission (D6). */
const MODULES: ReadonlyArray<{ slug: string; libelle: string; perm: keyof Perms }> = [
  { slug: '/admin/pilotage', libelle: 'Pilotage', perm: 'pilotage' },
  { slug: '/admin/cartes-annee', libelle: 'Cartes d’année', perm: 'cartes_annee' },
  { slug: '/admin/statistiques', libelle: 'Statistiques', perm: 'statistiques' },
  { slug: '/admin/internautes', libelle: 'Internautes', perm: 'internautes' },
  { slug: '/admin/curation', libelle: 'Curation', perm: 'curation' },
  { slug: '/admin/banc-test', libelle: 'Banc de test', perm: 'banc_test' },
];

/**
 * Liens visibles du menu (M3-4 Lot C). **RÔLE D'ABORD** : un administrateur voit TOUS les modules (jamais un
 * lien masqué par erreur, même si des colonnes perm_* étaient à false) + la tuile « Administratif ». Un
 * collaborateur ne voit que les modules dont il a la permission, et JAMAIS « Administratif ».
 *
 * ⚠️ Le menu est un CONFORT d'affichage, PAS une sécurité : `proxy.ts` reste la seule autorité (il refuse un
 * accès direct par URL). Ce filtrage ne fait que masquer des liens non pertinents.
 */
export function liensVisibles(role: RoleAdmin, perms: Perms): LienMenu[] {
  const admin = role === 'administrateur';
  const liens = MODULES.filter((m) => admin || perms[m.perm]).map((m) => ({ slug: m.slug, libelle: m.libelle }));
  if (admin) liens.push({ slug: '/admin/comptes', libelle: 'Administratif' });
  return liens;
}
