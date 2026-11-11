import { describe, expect, it } from 'vitest';
import { adresseInterne, apresRetour, clicASuivre, empiler, lirePile, origineDe, restaurationPour, type Depart } from './retour';

/** 🔴🔴 Arno (11/11/2026) — le « ← Retour » vers la page d'origine : les règles. PUR. */
const D = (depuis: string, vers: string): Depart => ({ depuis, vers, defilement: 0, etat: {}, le: 0 });
describe('le départ, l’origine, le retour', () => {
  it('adresse interne : chemin + requête de l’application, sans le fragment ; hors application : rien', () => {
    expect(adresseInterne('/admin/location/bien/7?x=1#haut', 'http://localhost:3000')).toBe('/admin/location/bien/7?x=1');
    expect(adresseInterne('https://exemple.test/admin', 'http://localhost:3000')).toBeNull();
    expect(adresseInterne('/tache/reponse', 'http://localhost:3000')).toBeNull();
  });
  it('clic suivi : lien interne, même onglet, clic simple ; pas un nouvel onglet, pas un lien de retour, pas un clic déjà empêché', () => {
    const base = { href: '/admin/location', target: null, download: false, bouton: 0, modificateur: false, empeche: false, lienRetour: false };
    expect(clicASuivre(base)).toBe(true);
    expect(clicASuivre({ ...base, target: '_blank' })).toBe(false);
    expect(clicASuivre({ ...base, lienRetour: true })).toBe(false);
    expect(clicASuivre({ ...base, modificateur: true })).toBe(false);
    expect(clicASuivre({ ...base, empeche: true })).toBe(false);
    expect(clicASuivre({ ...base, href: 'mailto:a@b.c' })).toBe(false);
  });
  it('l’origine d’une page : le départ le plus récent qui y mène ; le retour retire ce départ et ce qui suit', () => {
    let pile: Depart[] = [];
    pile = empiler(pile, D('/admin/location', '/admin/location/bien/7'));
    pile = empiler(pile, D('/admin/location/bien/7', '/admin/location/locataire/101'));
    expect(origineDe(pile, '/admin/location/locataire/101')?.depart.depuis).toBe('/admin/location/bien/7');
    const o = origineDe(pile, '/admin/location/bien/7')!;
    expect(o.depart.depuis).toBe('/admin/location');
    expect(apresRetour(pile, o.index)).toEqual([]);
    expect(origineDe(pile, '/admin/gestion')).toBeNull();
    expect(empiler([], D('/a', '/a'))).toEqual([]);
  });
  it('une pile ou une restauration abîmée ne casse rien ; une restauration d’une autre page ou trop ancienne n’est pas appliquée', () => {
    expect(lirePile('{pas du json')).toEqual([]);
    const r = JSON.stringify({ url: '/admin/location', defilement: 420, etat: { a: 1 }, le: 1000 });
    expect(restaurationPour(r, '/admin/location', 2000)).toMatchObject({ defilement: 420, etat: { a: 1 } });
    expect(restaurationPour(r, '/admin/gestion', 2000)).toBeNull();
    expect(restaurationPour(r, '/admin/location', 1000 + 61_000)).toBeNull();
  });
});
