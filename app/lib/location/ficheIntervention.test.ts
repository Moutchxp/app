import { describe, expect, it } from 'vitest';
import { ficheDepuisEncart, NON_RENSEIGNE, texteFicheIntervention } from './ficheIntervention';
import type { EncartLogement } from './sortieLocataires';

/** 🔴🔴 Arno (11/11/2026, lot 1) — la fiche d'intervention d'un préavis, en trois blocs (module pur). Données fictives. */
const E: EncartLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement T3', meuble: false, etage: '3', porte: 'G', numLotCopro: '45', numeroLot: '100',
  batiment: 'B', escalier: null, surfaceCarrez: null, surfaceHabitable: 62, surface: null, surfaceExterieure: null, nombrePieces: 3, ascenseur: true,
  digicode: true, digicodeCode: '4521A', precisionAcces: 'Code au portail', dpeClasse: null, dpeDate: null, dpeNonSoumis: null, chauffage: null, epoqueConstruction: null,
  lots: [
    { lotId: 7, role: 'logement', type: 'Appartement T3', etage: '3', numLotCopro: '45', numeroLot: '100', porte: 'G', place: false },
    { lotId: 8, role: 'annexe', type: 'Cave', etage: '-1', numLotCopro: null, numeroLot: null, porte: '12', place: false },
    { lotId: 9, role: 'annexe', type: 'Parking', etage: null, numLotCopro: '88', numeroLot: null, porte: null, place: true },
  ],
  proprietaire: { id: 5, nom: 'DUPONT Jean' }, syndic: null, bail: { entree: '2022-09-01', loyerHc: null, provisions: null, taux: null, base: null },
  coordonnees: {
    proprietaire: { telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] },
    proprietaires: [{ id: 5, nom: 'DUPONT Jean', telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] }, { id: 6, nom: 'DUPONT Marie', telephones: [], emails: ['marie@exemple.test'] }],
    locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD', prenom: 'Alice', telephones: ['06 55 66 77 88'], emails: [], entree: '2022-09-01' }],
  },
};

describe('la fiche d’intervention', () => {
  it('① ② ③ : locataires (date d’entrée), TOUS les propriétaires, logement, lots concernés, annexes', () => {
    const f = ficheDepuisEncart(E);
    expect(f.locataires).toEqual([{ nom: 'BERNARD', prenom: 'Alice', telephones: ['06 55 66 77 88'], emails: [], entree: '2022-09-01', locataireId: 101 }]);
    expect(f.proprietaires.map((p) => p.nom)).toEqual(['DUPONT Jean', 'DUPONT Marie']);
    expect(Object.fromEntries(f.logement.map((l) => [l.cle, l.valeur]))).toEqual({
      adresse: '4 rue Fictive, 92800 Puteaux', digicode: '4521A', type: 'Appartement T3', etage: '3e étage', lot: '45', porte: 'G', acces: 'Code au portail' });
    expect(f.nombreLots).toBe(3);
    expect(f.annexes).toEqual([
      { type: 'Cave', etage: 'sous-sol 1', numeroLot: null, numero: '12', place: false },
      { type: 'Parking', etage: null, numeroLot: '88', numero: null, place: true }]);
    // Rien de l'encart d'avant n'est perdu : bâtiment, surface, pièces, ascenseur… restent dans « autres ».
    expect(f.autres.map((x) => x.cle)).toEqual(expect.arrayContaining(['batiment', 'habitable', 'pieces', 'ascenseur']));
  });
  it('une information absente : null (« non renseigné » à l’écran) ; digicode « aucun » quand il n’y en a pas', () => {
    const f = ficheDepuisEncart({ ...E, digicode: false, digicodeCode: null, precisionAcces: null, porte: null });
    expect(f.logement.find((l) => l.cle === 'digicode')?.valeur).toBe('aucun');
    expect(f.logement.find((l) => l.cle === 'acces')?.valeur).toBeNull();
    expect(f.logement.find((l) => l.cle === 'porte')?.valeur).toBeNull();
  });
  it('le texte pour les collègues : trois titres, chaque information sur sa ligne, « non renseigné » écrit', () => {
    const t = texteFicheIntervention(ficheDepuisEncart(E));
    expect(t.indexOf('━━ LOCATAIRES ━━')).toBeLessThan(t.indexOf('━━ PROPRIÉTAIRES ━━'));
    expect(t.indexOf('━━ PROPRIÉTAIRES ━━')).toBeLessThan(t.indexOf('━━ LOGEMENT ET ANNEXES ━━'));
    expect(t).toContain('• Alice BERNARD\n  Entré(e) dans le logement le 01/09/2022\n  Tél. : 06 55 66 77 88\n  E-mail : non renseigné');
    expect(t).toContain('• DUPONT Marie\n  Tél. : non renseigné\n  E-mail : marie@exemple.test');
    expect(t).toContain('Digicode : 4521A');
    expect(t).toContain('3 lots concernés par ce préavis');
    expect(t).toContain(`• Parking — étage : ${NON_RENSEIGNE} · n° de lot : 88 · n° de place : ${NON_RENSEIGNE}`);
  });
});
