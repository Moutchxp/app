import type { Perms, RoleAdmin } from '../../../lib/admin/session';

export interface LienMenu {
  slug: string;
  libelle: string;
  /** Description courte — utilisée par la GRILLE du tableau de bord ; ignorée par le menu latéral. */
  desc: string;
}

/** Modules de l'admin (slug, libellé, description, permission requise). Source UNIQUE du menu ET de la grille. */
const MODULES: ReadonlyArray<LienMenu & { perm: keyof Perms }> = [
  { slug: '/admin/pilotage', libelle: 'Pilotage Moteur', desc: 'Supervision et pilotage du système.', perm: 'pilotage' },
  { slug: '/admin/cartes-annee', libelle: 'Années de construction', desc: 'Barème par année de construction.', perm: 'cartes_annee' },
  { slug: '/admin/statistiques', libelle: 'Statistiques', desc: 'Indicateurs et suivi d’activité.', perm: 'statistiques' },
  { slug: '/admin/internautes', libelle: 'Internautes (BD)', desc: 'Gestion des internautes.', perm: 'internautes' },
  { slug: '/admin/curation', libelle: 'Curation', desc: 'Modération et curation des contenus.', perm: 'curation' },
  { slug: '/admin/banc-test', libelle: 'Banc de test', desc: 'Outils de test et de diagnostic.', perm: 'banc_test' },
];

/** Tuile « Administratif » — réservée au rôle administrateur (pas une permission de module). */
const ADMINISTRATIF: LienMenu = { slug: '/admin/comptes', libelle: 'Administratif', desc: 'Gestion des comptes admin.' };

/** Tuile « Audit » (M2 Lot 7) — réservée au rôle administrateur, comme « Administratif » (fonction de sécurité,
 *  pas une permission déléguable). Vue AGRÉGÉE : connexions et détection de force brute, sans identité ni IP. */
const AUDIT: LienMenu = { slug: '/admin/audit', libelle: 'Audit', desc: 'Sécurité : connexions et force brute (agrégé).' };

/**
 * Liens visibles (M3-4 Lot C/D) — SOURCE UNIQUE du menu latéral (`Sidebar`) ET de la grille du tableau de bord.
 * **RÔLE D'ABORD** : un administrateur voit TOUS les modules (jamais un lien masqué par erreur, même si des
 * colonnes perm_* étaient à false) + « Administratif ». Un collaborateur ne voit que les modules dont il a la
 * permission, et JAMAIS « Administratif ».
 *
 * ⚠️ CONFORT d'affichage, PAS une sécurité : `proxy.ts` reste la seule autorité (il refuse un accès direct par
 * URL). Menu et grille dérivent de CE calcul — un seul endroit, aucune divergence possible entre écrans.
 */
export function liensVisibles(role: RoleAdmin, perms: Perms): LienMenu[] {
  const admin = role === 'administrateur';
  const liens: LienMenu[] = MODULES.filter((m) => admin || perms[m.perm]).map(({ slug, libelle, desc }) => ({ slug, libelle, desc }));
  if (admin) liens.push(ADMINISTRATIF, AUDIT);
  return liens;
}

/**
 * Réordonne `liens` (= le résultat de `liensVisibles(role, perms)`, l'AUTORITÉ du rôle) selon `ordreStocke`,
 * une liste de slugs (jsonb `admin_utilisateur.ordre_modules`, migration 030). Fonction PURE, appelée À
 * L'IDENTIQUE par la grille du tableau de bord ET le menu latéral → une source, deux rendus. TROIS règles :
 *   (a) d'abord les slugs de `ordreStocke` ENCORE présents dans `liens`, dans l'ordre stocké ;
 *   (b) puis les slugs de `liens` ABSENTS de `ordreStocke`, appendés À LA FIN dans leur ordre d'origine
 *       → un module ajouté plus tard apparaît TOUJOURS, jamais masqué (un module invisible = bug silencieux) ;
 *   (c) les slugs de `ordreStocke` absents de `liens` sont IGNORÉS (module supprimé, OU non autorisé pour ce rôle).
 * La règle (c) est une GARDE DE SÉCURITÉ, pas un détail : le rendu reste STRICTEMENT `liens` (déjà filtré par
 * rôle/perms dans `liensVisibles`) — simplement réordonné, jamais élargi. Un ordre stocké ne peut donc JAMAIS
 * faire réapparaître un module non autorisé. `ordreStocke` null/non-tableau/malformé (ou entrées non-string /
 * dupliquées) → tombe proprement sur `liens` inchangé (défensif : la validation du contenu vit ICI, une fois).
 */
export function ordonner(liens: LienMenu[], ordreStocke: unknown): LienMenu[] {
  if (!Array.isArray(ordreStocke)) return liens; // null / absent / malformé → ordre par défaut
  const parSlug = new Map(liens.map((l) => [l.slug, l]));
  const vus = new Set<string>();
  const ordonnes: LienMenu[] = [];
  for (const slug of ordreStocke) {
    if (typeof slug !== 'string') continue; // entrée malformée → ignorée
    const lien = parSlug.get(slug); // (c) absent de `liens` (supprimé / non autorisé) → undefined → ignoré
    if (lien && !vus.has(slug)) {
      ordonnes.push(lien); // (a) slug connu, dans l'ordre stocké
      vus.add(slug);
    }
  }
  for (const l of liens) if (!vus.has(l.slug)) ordonnes.push(l); // (b) modules absents du stockage → à la fin
  return ordonnes;
}
