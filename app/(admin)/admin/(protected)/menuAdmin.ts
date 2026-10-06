import type { Perms, RoleAdmin } from '../../../lib/admin/session';
/* 🔴 LOT ACCUEIL-GESTION, POINT 1 — l'adresse de la première page du module, composée par le module PUR qui
   connaît la grammaire de ces adresses. La recopier ici en ferait une seconde vérité. */
import { URL_ACCUEIL_GESTION } from '../../../lib/gestion/ecranUrl';

export interface LienMenu {
  slug: string;
  libelle: string;
  /** Description courte — utilisée par la GRILLE du tableau de bord ; ignorée par le menu latéral. */
  desc: string;
  /**
   * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 1 — OÙ MÈNE LA TUILE, QUAND CE N'EST PAS LA RACINE ═══════════════════════
   *
   * Facultatif. Absent ⇒ la tuile mène à `slug`, comme depuis toujours — c'est le cas de TOUS les modules sauf
   * un. Présent ⇒ elle mène là, et c'est aussi l'adresse que le menu REPOSE quand on reclique la tuile du module
   * où l'on se trouve déjà.
   *
   * 🔴 IL NE CHANGE PAS CE QUE REND `slug` TAPÉ À LA MAIN : c'est la destination de LA TUILE, pas le défaut du
   * module. La distinction est ce qui permet aux deux décisions d'Arno — « la boîte en arrivant » (27/09) et
   * « la tuile ouvre l'écran partagé » (06/10) — de tenir ensemble.
   *
   * ⚠️ LA GRILLE DU TABLEAU DE BORD NE LE LIT PAS, et ce n'est pas un oubli : Arno a demandé le MENU DE GAUCHE.
   * Changer la grille au passage serait une fonctionnalité modifiée sans accord.
   */
  accueil?: string;
}

/** Modules de l'admin (slug, libellé, description, permission requise). Source UNIQUE du menu ET de la grille. */
const MODULES: ReadonlyArray<LienMenu & { perm: keyof Perms }> = [
  { slug: '/admin/pilotage', libelle: 'Pilotage Moteur', desc: 'Supervision et pilotage du système.', perm: 'pilotage' },
  { slug: '/admin/cartes-annee', libelle: 'Années de construction', desc: 'Barème par année de construction.', perm: 'cartes_annee' },
  { slug: '/admin/statistiques', libelle: 'Statistiques', desc: 'Indicateurs et suivi d’activité.', perm: 'statistiques' },
  { slug: '/admin/internautes', libelle: 'Internautes (BD)', desc: 'Gestion des internautes.', perm: 'internautes' },
  { slug: '/admin/curation', libelle: 'Curation', desc: 'Modération et curation des contenus.', perm: 'curation' },
  { slug: '/admin/banc-test', libelle: 'Banc de test', desc: 'Outils de test et de diagnostic.', perm: 'banc_test' },
  // RATT-EDIT (lot A2) — « Permis de construire » devient un module GARDÉ (perm_permis, migration 225), au lieu d'être réservé au rôle
  //   administrateur. Un collaborateur avec le droit coché le voit ; sans le droit, l'entrée disparaît (comme les 6 autres modules).
  { slug: '/admin/permis', libelle: 'Permis de construire', desc: 'Veille des autorisations d’urbanisme (Sitadel).', perm: 'permis' },
  // GESTION (lot 2) — module GARDÉ (perm_gestion, migration 228). AJOUTÉ EN FIN DE LISTE : l'ordre, la présence et le libellé
  //   des tuiles existantes sont strictement inchangés, et `ordonner` (règle b) appende toute nouveauté à la fin de l'ordre
  //   déjà rangé par l'utilisateur — une tuile ajoutée apparaît donc toujours, sans déranger celles d'avant.
  /* 🔴 LOT ACCUEIL-GESTION, POINT 1 — la tuile vise la PREMIÈRE PAGE du module (l'écran partagé), pas la racine.
     L'adresse est composée par `ecranUrl`, module PUR : elle n'est pas recopiée à la main ici. */
  {
    slug: '/admin/gestion', libelle: 'Gestion', perm: 'gestion', accueil: URL_ACCUEIL_GESTION,
    desc: 'Courrier de gestion locative : file des échanges et événements.',
  },
];

/** Tuile « Administratif » — réservée au rôle administrateur (pas une permission de module). */
const ADMINISTRATIF: LienMenu = { slug: '/admin/comptes', libelle: 'Administratif', desc: 'Gestion des comptes admin.' };

/** Tuile « Audit » (M2 Lot 7) — réservée au rôle administrateur, comme « Administratif » (fonction de sécurité,
 *  pas une permission déléguable). Vue AGRÉGÉE : connexions et détection de force brute, sans identité ni IP. */
const AUDIT: LienMenu = { slug: '/admin/audit', libelle: 'Audit', desc: 'Sécurité : connexions et force brute (agrégé).' };

/** RATT-EDIT (lot A2) — « Permis de construire » N'EST PLUS réservé au rôle administrateur : c'est désormais un MODULE GARDÉ
 *  (perm 'permis', déclaré dans MODULES ci-dessus + dans proxy.ts). Un collaborateur le voit s'il a le droit `perm_permis`. */

/** Tuile « Sources de données » (fraîcheur lot 1) — réservée au rôle administrateur, comme « Audit »/« Permis ».
 *  État de fraîcheur des données qui font fonctionner l'outil (millésime, âge, surveillance, couverture), en LECTURE
 *  SEULE. AUCUNE pastille d'actions : une source périmée ne se répare pas d'un clic. Le proxy fail-closed réserve déjà
 *  /admin/sources et /api/admin/sources à l'administrateur. */
const SOURCES: LienMenu = { slug: '/admin/sources', libelle: 'Sources de données', desc: 'Fraîcheur des données qui font fonctionner l’outil.' };

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
  const liens: LienMenu[] = MODULES
    .filter((m) => admin || perms[m.perm])
    /* ⚠️ `accueil` SUIT LE LIEN quand il existe : sans cela, le menu l'aurait perdu en chemin et la tuile serait
       retombée sur `slug` — le défaut qu'on vient de corriger, invisible. */
    .map(({ slug, libelle, desc, accueil }) => (accueil === undefined
      ? { slug, libelle, desc } : { slug, libelle, desc, accueil }));
  // RATT-EDIT (lot A2) — PERMIS a quitté cette liste réservée-admin : il est désormais dans MODULES (gardé par perm 'permis'), visible
  //   selon le droit comme les 6 autres. ADMINISTRATIF/AUDIT/SOURCES restent réservés au RÔLE administrateur (non délégables).
  if (admin) liens.push(ADMINISTRATIF, AUDIT, SOURCES);
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

/** Ensemble des slugs de modules CONNUS (les 6 modules + Administratif + Audit) — source unique pour valider un
 *  ordre reçu. NB : c'est l'univers des slugs EXISTANTS, pas ceux visibles par un rôle donné (cf. `validerOrdreModules`). */
export const SLUGS_MODULES: ReadonlySet<string> = new Set([...MODULES.map((m) => m.slug), ADMINISTRATIF.slug, AUDIT.slug, SOURCES.slug]); // RATT-EDIT (lot A2) — le slug /admin/permis vient désormais de MODULES.map (module gardé), plus de la liste réservée-admin

/** Borne anti-DoS du tableau d'ordre reçu (très au-dessus des 8 modules réels) — évite un payload géant. */
const MAX_ENTREES_ORDRE = 64;

/**
 * Valide un ordre reçu du client AVANT écriture (jsonb accepte n'importe quoi, donc on filtre ici). Renvoie la
 * liste NORMALISÉE (slugs connus, dédupliqués dans l'ordre de 1re apparition), ou `null` si le corps est invalide.
 * Règles : doit être un TABLEAU de chaînes ; chaque entrée doit être un slug CONNU (`SLUGS_MODULES`) ; longueur
 * bornée ; toute entrée non-string OU slug inconnu → rejet TOTAL (`null`) — on n'écrit jamais de déchet en base.
 * ⚠️ On valide contre les slugs EXISTANTS, PAS contre `liensVisibles(role, perms)` : un admin qui perdrait une
 * permission plus tard verrait sinon son ordre rejeté. La sécurité RÔLE est déjà assurée à la LECTURE par la
 * règle (c) de `ordonner` — une seule définition, non dupliquée ici. Doublons → DÉDUPLIQUÉS (plutôt que rejetés) :
 * un doublon est un bruit inoffensif, le normaliser est plus robuste que faire échouer une sauvegarde.
 */
export function validerOrdreModules(corps: unknown): string[] | null {
  if (!Array.isArray(corps) || corps.length > MAX_ENTREES_ORDRE) return null;
  const ordonnes: string[] = [];
  const vus = new Set<string>();
  for (const x of corps) {
    if (typeof x !== 'string' || !SLUGS_MODULES.has(x)) return null; // non-string ou slug inconnu → rejet total
    if (!vus.has(x)) {
      vus.add(x);
      ordonnes.push(x); // dédup en préservant l'ordre de 1re apparition
    }
  }
  return ordonnes;
}
