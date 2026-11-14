import { describe, expect, it } from 'vitest';
import { avecReprise, decisionRetour, estReprise, retourSur, sansReprise, urlConnexion } from './retourConnexion';

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

/** 🔴 Arno (14/11/2026, production iPhone) — au plus UN aller-retour automatique : jamais de boucle connexion ↔ page. */
describe('decisionRetour / reprise', () => {
  const R = '/admin/location?previsite=11&geste=compte-rendu';
  it('session valide, premier passage : on y va, marqué `reprise=1`', () => {
    expect(decisionRetour(R, true)).toEqual({ geste: 'aller', vers: `${R}&reprise=1` });
  });
  it('session valide, déjà tenté : on PROPOSE (bouton), sans la marque — jamais de nouveau départ automatique', () => {
    expect(decisionRetour(`${R}&reprise=1`, true)).toEqual({ geste: 'proposer', vers: R });
  });
  it('pas de session : le formulaire', () => {
    expect(decisionRetour(R, false)).toEqual({ geste: 'former' });
    expect(decisionRetour(`${R}&reprise=1`, false)).toEqual({ geste: 'former' });
  });
  it('la marque traverse le garde (urlConnexion la garde dans `retour`) : la boucle s’arrête au 2e passage', () => {
    const premier = decisionRetour(R, true);
    expect(premier.geste).toBe('aller');
    const vers = (premier as { vers: string }).vers;
    // le garde, sans cookie, renvoie à la connexion avec la page demandée (marque comprise)
    const connexion = urlConnexion(vers);
    const retour = new URLSearchParams(connexion.split('?')[1]).get('retour')!;
    expect(retourSur(retour)).toBe(vers);
    expect(decisionRetour(retour, true).geste).toBe('proposer');
  });
  it('avec ou sans requête ni ancre ; sansReprise rend le chemin d’origine', () => {
    expect(avecReprise('/admin/location')).toBe('/admin/location?reprise=1');
    expect(avecReprise('/admin/location#x')).toBe('/admin/location?reprise=1#x');
    expect(sansReprise('/admin/location?reprise=1')).toBe('/admin/location');
    expect(sansReprise(R)).toBe(R);
    expect(estReprise('/admin/location?reprise=1')).toBe(true);
    expect(estReprise(R)).toBe(false);
  });
});
