import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NOM_COOKIE, verifierJeton } from './app/lib/admin/session';

/**
 * Garde d'accès de l'interface admin (EX-11..EX-15).
 * Node.js runtime (défaut Proxy en Next 16) — `jose` et la lecture du cookie y fonctionnent.
 */
export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};

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

  return NextResponse.next();
}
