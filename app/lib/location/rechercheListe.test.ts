import { describe, expect, it } from 'vitest';
import { motsRecherche, scoreRecherche, segmentsSurlignes } from './rechercheListe';
import { texteRechercheApporteur } from './suivi/suivi';

/** 🔴 Arno (25/10/2026) — le mini moteur de recherche (l'apporteur d'affaires) : la règle pure. */
const BEKETOV = { nom: 'Hélène Beketov', nomFamille: 'Beketov', prenom: 'Hélène', societe: 'Immo Écluse', telephone: '06 12 34 56 78', email: 'h.beketov@exemple.test' };
const t = texteRechercheApporteur(BEKETOV);

describe('🔴 la recherche : accents, casse, plusieurs mots, téléphone', () => {
  it('sans tenir compte des accents ni de la casse', () => {
    expect(scoreRecherche('BEKETOV Hélène', t, 'helene')).not.toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', t, 'HÉLÈNE')).not.toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', t, 'ecluse')).not.toBeNull();   // la société
  });
  it('plusieurs mots : tous présents', () => {
    expect(scoreRecherche('BEKETOV Hélène', t, 'beke immo')).not.toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', t, 'beke martin')).toBeNull();
    expect(motsRecherche('  Hélène   Beke ')).toEqual(['helene', 'beke']);
  });
  it('le téléphone, avec ou sans espaces ; l’e-mail', () => {
    expect(scoreRecherche('BEKETOV Hélène', t, '0612')).not.toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', t, '06 12 34')).not.toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', t, '0612345678')).not.toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', texteRechercheApporteur({ ...BEKETOV, telephone: '+33 6 12 34 56 78' }), '0612345678')).not.toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', t, '0699')).toBeNull();
    expect(scoreRecherche('BEKETOV Hélène', t, 'exemple.test')).not.toBeNull();
  });
  it('les meilleurs d’abord : le libellé qui commence par le mot > un mot du libellé > ailleurs', () => {
    const a = scoreRecherche('BEKETOV Hélène', t, 'bek')!;
    const b = scoreRecherche('BEKETOV Hélène', t, 'hel')!;
    const c = scoreRecherche('BEKETOV Hélène', t, 'immo')!;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
  it('le surlignage, sur le libellé tel qu’affiché (accents gardés)', () => {
    expect(segmentsSurlignes('BEKETOV Hélène', 'hele')).toEqual([{ t: 'BEKETOV ', fort: false }, { t: 'Hélè', fort: true }, { t: 'ne', fort: false }]);
  });
});
