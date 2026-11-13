import { describe, expect, it } from 'vitest';
import { retourSur, urlConnexion } from './retourConnexion';

/** 🔴 Arno (13/11/2026) — le retour après connexion : un chemin INTERNE à l'admin, jamais une redirection ouverte. */
describe('retourSur', () => {
  it('accepte les pages de l’admin, avec leur requête', () => {
    expect(retourSur('/admin/location?previsite=11&geste=compte-rendu')).toBe('/admin/location?previsite=11&geste=compte-rendu');
    expect(retourSur('/admin')).toBe('/admin');
  });
  it.each(['https://pirate.test/admin', '//pirate.test', '/admin//pirate.test', '/admin\\x', '/administrateur', '/autre', '', null, '/admin/login?retour=/admin',
    'javascript:alert(1)', `/admin/${'x'.repeat(1001)}`, '/admin/\nx'])('refuse %s', (x) => {
    expect(retourSur(x as string | null)).toBeNull();
  });
});
describe('urlConnexion', () => {
  it('porte la page demandée ; l’accueil ou un chemin douteux : la connexion seule', () => {
    expect(urlConnexion('/admin/location?previsite=11&geste=compte-rendu')).toBe('/admin/login?retour=%2Fadmin%2Flocation%3Fprevisite%3D11%26geste%3Dcompte-rendu');
    expect(urlConnexion('/admin')).toBe('/admin/login');
    expect(urlConnexion('//x')).toBe('/admin/login');
  });
});
