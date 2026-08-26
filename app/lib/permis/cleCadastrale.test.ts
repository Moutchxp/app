import { describe, it, expect } from 'vitest';
import { normaliserCleCadastrale, choisirAppariement, resoudrePreseance } from './cleCadastrale';

describe('PARC-1 — normaliserCleCadastrale (règles justifiées par mesure)', () => {
  it('MAJUSCULE + trim de la section (récupère le cas mesuré « f » → « F »)', () => {
    expect(normaliserCleCadastrale('92026', 'f', '86')).toEqual({ commune: '92026', section: 'F', numero: '86' });
    expect(normaliserCleCadastrale('75056', '  as ', ' 31 ')).toEqual({ commune: '75056', section: 'AS', numero: '31' });
  });
  it('NE supprime PAS les zéros de tête du numéro (mesuré : 0 gain, risque de faux appariement)', () => {
    expect(normaliserCleCadastrale('75120', 'DZ', '09')).toEqual({ commune: '75120', section: 'DZ', numero: '09' });
    // '09' reste '09' : on ne le confond pas avec '9' ni '90'.
    expect(normaliserCleCadastrale('75120', 'DZ', '09')!.numero).not.toBe('9');
  });
  it('une composante vide → null (aucun rapprochement possible)', () => {
    expect(normaliserCleCadastrale('92026', '', '86')).toBeNull();
    expect(normaliserCleCadastrale('92026', 'F', '   ')).toBeNull();
    expect(normaliserCleCadastrale(null, 'F', '86')).toBeNull();
    expect(normaliserCleCadastrale('92026', undefined, '86')).toBeNull();
  });
});

describe('PARC-1 — choisirAppariement : ambiguïté REFUSÉE (jamais un faux succès)', () => {
  it('exactement une parcelle → appariée', () => {
    expect(choisirAppariement(['75120000DZ0009'])).toEqual({ statut: 'apparie', parcelle: '75120000DZ0009' });
  });
  it('plusieurs parcelles → AMBIGU (refusé, compté comme échec)', () => {
    expect(choisirAppariement(['idu-a', 'idu-b'])).toEqual({ statut: 'ambigu', nb: 2 });
  });
  it('aucune parcelle → aucun', () => {
    expect(choisirAppariement([])).toEqual({ statut: 'aucun' });
  });
});

describe('PARC-1 — resoudrePreseance : « instruit » n’est JAMAIS écrasé par « cadastral »', () => {
  it('un lien « instruit » existant → on GARDE (jamais remplacé par un cadastral)', () => {
    expect(resoudrePreseance('instruit')).toBe('garder');
  });
  it('un lien « cadastral » existant → on GARDE (idempotence, pas de doublon)', () => {
    expect(resoudrePreseance('cadastral')).toBe('garder');
  });
  it('aucun lien existant → on INSÈRE', () => {
    expect(resoudrePreseance(null)).toBe('inserer');
  });
  // 🔴 GARDE ANTI-RÉGRESSION : si un jour on inverse le sens (le cadastral écrase l'instruit), CE TEST CASSE.
  it('SENS DE PRÉSÉANCE verrouillé : présence d’un lien ⇒ jamais d’insertion écrasante', () => {
    for (const o of ['instruit', 'cadastral'] as const) {
      expect(resoudrePreseance(o)).not.toBe('inserer'); // un lien existant n'entraîne JAMAIS une insertion (donc jamais un écrasement)
    }
  });
});
