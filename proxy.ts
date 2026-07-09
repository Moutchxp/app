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
 * Table de correspondance PRÉFIXE de chemin → permission requise (Module). Le premier préfixe qui
 * correspond décide. Un chemin non listé (ex. /admin landing, /api/admin/ping) n'exige aucune permission
 * particulière : la simple authentification suffit. Les administrateurs ont toutes les permissions.
 */
const PERMISSIONS: ReadonlyArray<readonly [string, Module]> = [
  // Pages de modules
  ['/admin/pilotage', 'pilotage'],
  ['/admin/cartes-annee', 'cartes_annee'],
  ['/admin/statistiques', 'statistiques'],
  ['/admin/internautes', 'internautes'],
  ['/admin/curation', 'curation'],
  ['/admin/banc-test', 'banc_test'],
  // Routes d'API correspondantes (defense in depth : vérifiées au proxy ET, à terme, dans chaque route)
  ['/api/admin/config', 'pilotage'],
  ['/api/admin/cartes-annee', 'cartes_annee'],
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
  // la déconnexion est déjà passée en whitelist publique). Placé EN AMONT de la table chemin→permission → NE DÉPEND
  // PAS de son fail-open (un chemin non listé serait autorisé par `permissionRequise`, mais il est ici d'abord
  // intercepté par le drapeau). sub=null (voie de secours) a `doitChanger=false` forcé (session.ts) → jamais concerné.
  if (session.doitChanger && !CHEMINS_CHANGEMENT_MDP.has(pathname)) {
    if (estApi) {
      return NextResponse.json({ erreur: 'CHANGEMENT_REQUIS' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/admin/compte/mot-de-passe', request.url), 302);
  }

  const requise = permissionRequise(pathname);

  // Administrateur → toutes permissions. Collaborateur → doit porter la permission du chemin.
  if (requise !== null && !session.perms[requise]) {
    if (estApi) {
      return new NextResponse(null, { status: 403 });
    }
    // Page interdite → renvoi vers l'accueil admin (pas la page de login : l'utilisateur EST authentifié).
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}
