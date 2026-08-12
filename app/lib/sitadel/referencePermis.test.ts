import { describe, it, expect } from 'vitest';
import { formaterReferencePermis, arrondissementParis, formaterArrondissement, composerAdressePermis, resoudreAdresseAvecReplis } from './referencePermis';

/**
 * U2 — SOURCE UNIQUE de la référence de permis (2 lettres de type + num_dau) et dérivation de l'arrondissement parisien depuis
 * le num_dau (source structurée, pas de parsing d'adresse). PUR. On PROUVE : pas d'invention du type (jamais « PC » par
 * défaut), démolitions traitées (PD), et les recoupements d'arrondissement donnés au cahier.
 */
describe('U2 — formaterReferencePermis : <type><num_dau>, sans invention', () => {
  it('PC + num_dau → référence collée, sans espace', () => {
    expect(formaterReferencePermis('PC', '07511524V0006')).toEqual({ ok: true, reference: 'PC07511524V0006' });
  });
  it('démolition (PD) → PD… (« PC » n’est JAMAIS écrit en dur)', () => {
    expect(formaterReferencePermis('PD', '07511524V0006')).toEqual({ ok: true, reference: 'PD07511524V0006' });
  });
  it('type ABSENT / inconnu → indéterminé explicite, jamais « PC » supposé', () => {
    const a = formaterReferencePermis(null, '07511524V0006');
    const b = formaterReferencePermis('', '07511524V0006');
    const c = formaterReferencePermis('XX', '07511524V0006');
    for (const r of [a, b, c]) { expect(r.ok).toBe(false); if (!r.ok) expect(r.raison).toMatch(/type/i); }
    expect(JSON.stringify([a, b, c])).not.toContain('PC07511524V0006');
  });
  it('num_dau absent → indéterminé explicite', () => {
    const r = formaterReferencePermis('PC', '   ');
    expect(r.ok).toBe(false); if (!r.ok) expect(r.raison).toMatch(/num/i);
  });
  it('tolère la casse du type (pc → PC), num_dau repris tel quel', () => {
    expect(formaterReferencePermis('pc', '07511524V0006')).toEqual({ ok: true, reference: 'PC07511524V0006' });
  });
});

describe('U2 — arrondissement de Paris dérivé du num_dau (source structurée)', () => {
  it('07511524V0006 → 15 (Paris 15e)', () => {
    expect(arrondissementParis('07511524V0006')).toBe(15);
    expect(formaterArrondissement('07511524V0006')).toBe('15e');
  });
  it('07511225V0010 → 12 (Paris 12e)', () => {
    expect(arrondissementParis('07511225V0010')).toBe(12);
    expect(formaterArrondissement('07511225V0010')).toBe('12e');
  });
  it('1er arrondissement → « 1er » (cas particulier d’affichage)', () => {
    expect(formaterArrondissement('07510124V0034')).toBe('1er');
  });
  it('hors Paris (autre département) → indéterminé (null)', () => {
    expect(arrondissementParis('09204224V0006')).toBeNull();   // 92xxx
    expect(formaterArrondissement('09204224V0006')).toBeNull();
  });
  it('num_dau malformé → indéterminé (null), jamais deviné', () => {
    expect(arrondissementParis('nimportequoi')).toBeNull();
    expect(arrondissementParis('0751XX24V0006')).toBeNull();   // lettres à la place de l’arrondissement
    expect(arrondissementParis('07512124V0006')).toBeNull();   // 21e n’existe pas (hors [1;20])
    expect(arrondissementParis('')).toBeNull();
  });
});

describe('U4 — composerAdressePermis : source unique, une seule adresse, dégradation propre', () => {
  it('adresse présente → voiePresente + ligne « voie, ville/CP, arrondissement »', () => {
    const a = composerAdressePermis({ adresse: '1 AVENUE DE LA PORTE BRANCIO', codePostal: '75015', communeNom: 'Paris', numDau: '07511524V0006' });
    expect(a.voiePresente).toBe(true);
    expect(a.voie).toBe('1 AVENUE DE LA PORTE BRANCIO');
    expect(a.villeCP).toBe('75015 Paris');
    expect(a.ligne).toBe('1 AVENUE DE LA PORTE BRANCIO, 75015 Paris, arrondissement 15e');
  });
  it('adresse ABSENTE → voiePresente=false + ligne DÉGRADÉE (ville/CP + arrondissement), JAMAIS « non renseignée »', () => {
    const a = composerAdressePermis({ adresse: '', codePostal: null, communeNom: 'Paris', numDau: '07511524V0006' });
    expect(a.voiePresente).toBe(false);
    expect(a.ligne).toBe('Paris, arrondissement 15e');
    expect(a.ligne).not.toMatch(/non renseign/i);
  });
  it('hors Paris (aucun arrondissement) → ligne = voie + ville/CP, sans mention d’arrondissement', () => {
    const a = composerAdressePermis({ adresse: '3 rue X', codePostal: '92000', communeNom: 'Nanterre', numDau: '09200124V0006' });
    expect(a.arrondissement).toBeNull();
    expect(a.ligne).toBe('3 rue X, 92000 Nanterre');
  });
});

describe('U5 — resoudreAdresseAvecReplis : repli cross-type VÉRIFIÉ par le cadastre', () => {
  const PARIS = { codePostal: null, communeNom: 'Paris', numDau: '07511524V0006' as string | null };

  it('adresse PROPRE → aucun repli (origine propre)', () => {
    const r = resoudreAdresseAvecReplis({ ...PARIS, adresse: '5 rue X', parcelles: [] }, [{ type: 'PD', adresse: 'AUTRE', parcelles: [] }]);
    expect(r.provenance.origine).toBe('propre');
    expect(r.adresse.voie).toBe('5 rue X');
  });

  it('absente + sœur adressée ET parcelle COMMUNE → REPLI vérifié (adresse empruntée + provenance)', () => {
    const r = resoudreAdresseAvecReplis(
      { ...PARIS, adresse: '', parcelles: ['AS-4'] },
      [{ type: 'PD', adresse: '1 AVENUE DE LA PORTE BRANCIO', codePostal: '75015', communeNom: 'Paris', numDau: '07511524V0006', parcelles: ['AS-4'] }],
    );
    expect(r.provenance).toEqual({ origine: 'repli', soeurType: 'PD', parcelleCommune: 'AS-4' });
    expect(r.adresse.voie).toBe('1 AVENUE DE LA PORTE BRANCIO');
  });

  it('absente + sœur adressée mais parcelles DISJOINTES → PAS de repli, dégradation U4 (origine absente)', () => {
    const r = resoudreAdresseAvecReplis({ ...PARIS, adresse: '', parcelles: ['AB-1'] }, [{ type: 'PD', adresse: '9 rue Y', parcelles: ['XY-9'] }]);
    expect(r.provenance.origine).toBe('absente'); // terrain différent → jamais d’emprunt
    expect(r.adresse.voiePresente).toBe(false);
  });

  it('absente + sœur adressée mais parcelles ABSENTES d’un côté → NON VÉRIFIABLE (signalée, jamais empruntée) — cas demande 156', () => {
    const r = resoudreAdresseAvecReplis({ ...PARIS, adresse: '', parcelles: [] }, [{ type: 'PD', adresse: '1 AVENUE', parcelles: ['AS-4'] }]);
    expect(r.provenance).toEqual({ origine: 'non_verifiable', soeurTypes: ['PD'] });
    expect(r.adresse.voiePresente).toBe(false); // pas d’emprunt sur la seule foi du numéro
  });

  it('≥ 2 sœurs vérifiées d’adresses DIFFÉRENTES → AMBIGU, aucun choix arbitraire (garde défensive)', () => {
    const r = resoudreAdresseAvecReplis(
      { ...PARIS, adresse: '', parcelles: ['AS-4'] },
      [{ type: 'PC', adresse: 'ADRESSE A', parcelles: ['AS-4'] }, { type: 'PD', adresse: 'ADRESSE B', parcelles: ['AS-4'] }],
    );
    expect(r.provenance.origine).toBe('ambigu');
    expect(r.adresse.voiePresente).toBe(false);
  });

  it('absente + aucune sœur ADRESSÉE → absente (U4)', () => {
    const r = resoudreAdresseAvecReplis({ ...PARIS, adresse: '', parcelles: ['AS-4'] }, [{ type: 'PD', adresse: '', parcelles: ['AS-4'] }]);
    expect(r.provenance.origine).toBe('absente');
  });

  it('normalisation casse/espaces des parcelles (« as-4 » ≡ « AS-4 »)', () => {
    const r = resoudreAdresseAvecReplis({ ...PARIS, adresse: '', parcelles: [' as-4 '] }, [{ type: 'PD', adresse: '1 AV', parcelles: ['AS-4'] }]);
    expect(r.provenance.origine).toBe('repli');
  });
});
