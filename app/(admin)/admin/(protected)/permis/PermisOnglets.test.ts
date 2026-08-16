import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OngletsPermis, GROUPES_ONGLETS, type CleOnglet } from './PermisOnglets';

const rendu = (actif: CleOnglet) => renderToStaticMarkup(createElement(OngletsPermis, { actif, onChoisir: () => {} }));

describe('S13 — barre d’onglets Permis (deux groupes nommés)', () => {
  it('les deux intitulés de groupe sont présents', () => {
    const h = rendu('dossiers');
    expect(h).toContain('Mise à jour des dossiers');
    expect(h).toContain('Demandes aux mairies');
  });

  it('chaque groupe est un role="group" NOMMÉ par son intitulé (accessibilité, pas seulement visuel)', () => {
    const h = rendu('dossiers');
    expect(h).toContain('role="group"');
    expect(h).toContain('aria-label="Mise à jour des dossiers"');
    expect(h).toContain('aria-label="Demandes aux mairies"');
  });

  it('les onglets sont dans le BON groupe et dans le BON ordre', () => {
    expect(GROUPES_ONGLETS.map((g) => g.titre)).toEqual(['Mise à jour des dossiers', 'Demandes aux mairies']);
    expect(GROUPES_ONGLETS[0].onglets.map((o) => o.cle)).toEqual(['dossiers', 'automatisation', 'rattachement']);
    expect(GROUPES_ONGLETS[1].onglets.map((o) => o.cle)).toEqual(['a_demander', 'en_cours', 'reponses', 'archives', 'saisines', 'collaborateurs', 'reglages']);
    // ordre RÉEL dans le markup : Dossiers, Automatisation, Rattachement, puis À demander, En cours, Réponses, Archives, Saisines CADA, Collaborateurs, Réglages
    const h = rendu('dossiers');
    let pos = -1;
    for (const lib of ['Dossiers', 'Automatisation', 'Rattachement', 'À demander', 'En cours', 'Réponses', 'Archives', 'Saisines CADA', 'Collaborateurs', 'Réglages']) {
      const i = h.indexOf(`>${lib}<`);
      expect(i).toBeGreaterThan(pos);
      pos = i;
    }
  });

  it('l’onglet actif est signalé (aria-current="page") dans les DEUX groupes', () => {
    expect(rendu('dossiers')).toContain('aria-current="page"');       // groupe 1
    const hReg = rendu('reglages');
    expect(hReg).toContain('aria-current="page"');                     // groupe 2
    expect(hReg).toMatch(/aria-current="page"[^>]*>Réglages</);        // c'est bien Réglages qui est actif
    expect(rendu('a_demander')).toMatch(/aria-current="page"[^>]*>À demander</);
  });
});
