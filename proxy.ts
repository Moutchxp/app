import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload, type Module } from './app/lib/admin/session';

/**
 * Garde d'accès de l'interface admin (EX-11..EX-15) + contrôle des PERMISSIONS côté serveur (M3 Lot 2e).
 * Node.js runtime (défaut Proxy en Next 16) — `jose` et la lecture du cookie y fonctionnent.
 *
 * ⚠️ Masquer un lien dans le menu n'est PAS une sécurité : un collaborateur qui tape /admin/curation
 * dans la barre d'adresse (ou appelle /api/admin/curation) DOIT être refusé ici, côté serveur.
 */
export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};

/**
 * Table de correspondance PRÉFIXE de chemin → permission requise (Module). Le premier préfixe qui correspond
 * décide. ⚠️ DÉFAUT FAIL-CLOSED (durcissement) : un chemin sous le matcher qui n'est NI ici, NI dans la whitelist
 * publique, NI réservé au rôle administrateur (`estAdministratif`/`estAudit`), NI dans `CHEMINS_AUTHENTIFIE_SEUL`,
 * est REFUSÉ par défaut (cf. fin de `proxy()`). Toute NOUVELLE route de module DOIT donc être déclarée ici, sinon
 * elle sera bloquée. Les administrateurs ont toutes les permissions (`permsToutes`) → ils passent partout.
 */
const PERMISSIONS: ReadonlyArray<readonly [string, Module]> = [
  // Pages de modules
  ['/admin/pilotage', 'pilotage'],
  ['/admin/cartes-annee', 'cartes_annee'],
  ['/admin/statistiques', 'statistiques'],
  ['/admin/internautes', 'internautes'],
  ['/admin/curation', 'curation'],
  ['/admin/banc-test', 'banc_test'],
  // Routes d'API correspondantes (defense in depth : vérifiées au proxy ET dans chaque handler via garde.ts).
  ['/api/admin/config', 'pilotage'],
  ['/api/admin/cartes-annee', 'cartes_annee'],
  ['/api/admin/statistiques', 'statistiques'],
  ['/api/admin/geo/communes', 'statistiques'], // sert la carte du module Statistiques
  ['/api/admin/curation', 'curation'],
  ['/api/admin/banc-comparer', 'banc_test'],
  ['/api/admin/banc-profil-actif', 'banc_test'],
];

/** Permission requise pour un chemin, ou `null` si aucune (chemin authentifié suffit). */
function permissionRequise(pathname: string): Module | null {
  for (const [prefixe, module] of PERMISSIONS) {
    if (pathname === prefixe || pathname.startsWith(`${prefixe}/`)) return module;
  }
  return null;
}

/**
 * Chemins ATTEIGNABLES tant que `doitChanger` est vrai (M3-4 Lot B) : la page ET la route de changement de mot de
 * passe self-service. NAMESPACE SINGULIER `/compte/` — disjoint du futur `/comptes` (pluriel, Lot C) : match EXACT,
 * aucun `startsWith`, donc aucune collision de préfixe. La déconnexion (`/api/admin/session`) est déjà en whitelist
 * publique plus haut (elle n'atteint jamais ce bloc). Les assets du rendu (`/_next/...`) ne sont pas dans le matcher.
 */
const CHEMINS_CHANGEMENT_MDP = new Set(['/admin/compte/mot-de-passe', '/api/admin/compte/mot-de-passe']);

/**
 * Tuile « Administratif » (M3-4 Lot C) — namespace PLURIEL `/comptes`, réservé au RÔLE administrateur EN DUR
 * (pas une permission de module, pas de perm_administratif : la surface qui distribue les droits n'est pas
 * elle-même distribuable). Match par FRONTIÈRE DE SEGMENT → disjoint du self-service SINGULIER `/compte/…` :
 * `/admin/compte/mot-de-passe` ne matche PAS `/admin/comptes` (14ᵉ caractère `e/` vs `es`). PREMIÈRE des deux
 * barrières (l'autre : revérification du rôle EN BASE dans chaque handler, cf. garde.ts `exigerAdministrateur`).
 */
function estAdministratif(pathname: string): boolean {
  for (const p of ['/admin/comptes', '/api/admin/comptes']) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * Surface AUDIT (journal de sécurité : `/admin/audit` + `/api/admin/audit`) — réservée au RÔLE administrateur EN
 * DUR, comme la tuile « Administratif » (pas une permission de module : le journal de sécurité n'est pas un droit
 * distribuable). La route API se re-garde en aval via `exigerAdministrateur` (garde.ts) → double barrière. Match
 * par frontière de segment (aucune collision de préfixe). Séparé d'`estAdministratif` pour ne pas brouiller le
 * sens de cette dernière (toujours = tuile /comptes uniquement, référencée telle quelle par les handlers comptes).
 */
function estAudit(pathname: string): boolean {
  for (const p of ['/admin/audit', '/api/admin/audit']) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * Chemins AUTHENTIFIÉ-SEUL : accessibles à TOUT compte connecté (collaborateur inclus) SANS permission de module,
 * mais refusés si non authentifié (l'auth est déjà exigée plus haut). Ils n'entrent pas dans la table
 * chemin→permission ; sous le défaut FAIL-CLOSED, ils DOIVENT être autorisés EXPLICITEMENT ici :
 *  - `/admin` : accueil / grille des tuiles (c'est aussi la cible des redirections de refus → pas de boucle) ;
 *  - `/api/admin/ping` : sonde d'authentification (defense in depth, EX-13/EX-15), aucune donnée sensible ;
 *  - `/admin/compte/mot-de-passe` + `/api/admin/compte/mot-de-passe` : self-service mot de passe (aucune perm de
 *    module ; la route se re-garde en aval). Match EXACT (Set) : aucun sous-chemin implicitement ouvert.
 */
const CHEMINS_AUTHENTIFIE_SEUL: ReadonlySet<string> = new Set([
  '/admin',
  '/api/admin/ping',
  '/admin/compte/mot-de-passe',
  '/api/admin/compte/mot-de-passe',
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Whitelist : la page de login et l'endpoint de session restent publics.
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }
  if (pathname === '/api/admin/session') {
    return NextResponse.next();
  }

  const jeton = request.cookies.get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const estApi = pathname.startsWith('/api/admin/');

  if (!payload) {
    // Cookie absent ou invalide (signature/exp) → traité comme non authentifié (EX-15).
    if (estApi) {
      return new NextResponse(null, { status: 401 });
    }
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Session EFFECTIVE (tolérante : ancien jeton sans perms → administrateur complet, voie de secours idem).
  const session = sessionDepuisPayload(payload);

  // ═══ ENFORCEMENT PREMIÈRE CONNEXION (M3-4 Lot B) ═══
  // TANT QUE doitChanger : tout l'admin est bloqué SAUF la page/route de changement (whitelist EXACTE ci-dessus ;
  // la déconnexion est déjà passée en whitelist publique). Placé EN AMONT de la table chemin→permission ET du défaut
  // fail-closed → l'enforcement ne dépend d'AUCUN des deux : même un chemin par ailleurs autorisé (déclaré,
  // authentifié-seul ou rôle admin) est d'abord intercepté ici par le drapeau. sub=null (voie de secours) a
  // `doitChanger=false` forcé (session.ts) → jamais concerné.
  if (session.doitChanger && !CHEMINS_CHANGEMENT_MDP.has(pathname)) {
    if (estApi) {
      return NextResponse.json({ erreur: 'CHANGEMENT_REQUIS' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/admin/compte/mot-de-passe', request.url), 302);
  }

  // ═══ SURFACES RÉSERVÉES AU RÔLE administrateur EN DUR ═══
  // Tuile « Administratif » (/comptes, M3-4 Lot C) ET audit (/audit, journal de sécurité) : réservées au RÔLE,
  // pas à une permission de module. En amont de la table chemin→permission. Voie de secours (sub=null) :
  // `session.role === 'administrateur'` → autorisée. Collaborateur → 403 (API) / redirection accueil (page).
  if ((estAdministratif(pathname) || estAudit(pathname)) && session.role !== 'administrateur') {
    if (estApi) {
      return new NextResponse(null, { status: 403 });
    }
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  const requise = permissionRequise(pathname);

  // Route de module DÉCLARÉE : la permission est exigée. Administrateur → `permsToutes` → passe. Collaborateur
  // sans la permission → 403 (API) / redirection accueil (page, l'utilisateur EST authentifié — pas le login).
  if (requise !== null) {
    if (!session.perms[requise]) {
      if (estApi) {
        return new NextResponse(null, { status: 403 });
      }
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }

  // ═══ DÉFAUT FAIL-CLOSED (durcissement — remplace l'ancien fail-open `return null`) ═══
  // Chemin sous le matcher mais NON déclaré dans PERMISSIONS. Autorisé UNIQUEMENT si :
  //  - rôle administrateur (accès total, inchangé — inclut la voie de secours sub=null) ; OU
  //  - chemin explicitement AUTHENTIFIÉ-SEUL (accueil, sonde, self-service mot de passe).
  // Tout le reste (route/page inconnue — typiquement un futur endpoint ajouté SANS déclaration) → REFUSÉ. Ferme
  // le foot-gun : une route non listée n'est plus accessible à un collaborateur du seul fait qu'il est authentifié.
  // Les gardes internes (garde.ts) restent en place en aval : défense en profondeur, deux barrières indépendantes.
  if (session.role === 'administrateur') return NextResponse.next();
  if (CHEMINS_AUTHENTIFIE_SEUL.has(pathname)) return NextResponse.next();
  if (estApi) {
    return new NextResponse(null, { status: 403 });
  }
  return NextResponse.redirect(new URL('/admin', request.url));
}
