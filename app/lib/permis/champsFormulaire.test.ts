import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N7-B — lecture des champs AcroForm. Le cœur PUR (`filtrerChamps`, `estChampIdentite`) est testé sur des tables INJECTÉES (pas
 * de PDF réel) ; `lireChampsFormulaire` est testé avec `pdfjs-dist` MOCKÉ (succès → filtré ; échec → table vide, jamais d'exception).
 */

// Mock de l'import DYNAMIQUE de pdfjs (build legacy). L'état pilote getFieldObjects / le throw.
const H = vi.hoisted(() => {
  const state = { fieldObjects: null as unknown, doitThrow: false, detruit: 0 };
  const getDocument = () => ({
    promise: state.doitThrow
      ? Promise.reject(new Error('PDF chiffré'))
      : Promise.resolve({ getFieldObjects: async () => state.fieldObjects, destroy: async () => { state.detruit += 1; } }),
  });
  return { state, getDocument };
});
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument: H.getDocument }));

import { filtrerChamps, estChampIdentite, lireChampsFormulaire, CHAMPS_IDENTITE_INTERDITS } from './champsFormulaire';

beforeEach(() => { H.state.fieldObjects = null; H.state.doitThrow = false; H.state.detruit = 0; });

describe('estChampIdentite — liste noire', () => {
  it('bloque les champs d’identité (nom, prénom, adresse, siret, courriel…)', () => {
    for (const n of ['Nom_2', 'Prénom_2', 'Adresse Numéro', 'Voie_3', 'Localité_3', 'CP_3', 'Siret', 'courriel_2', 'Téléphone fixe_2', 'Portable_2', 'Raison sociale et dénomination'])
      expect(estChampIdentite(n)).toBe(true);
  });
  it('ne bloque PAS les champs techniques (« Nombre… », section, superficie, stationnement)', () => {
    for (const n of ['Nombre de places de stationnement', 'T2S_section', 'T2T_superficie', 'S1M_stationnementapres', 'C5ZJ1_niveaux', 'N de parcelle s'])
      expect(estChampIdentite(n)).toBe(false);
  });
  it('la liste noire est déclarée en un seul endroit (constante exportée non vide)', () => {
    expect(CHAMPS_IDENTITE_INTERDITS.length).toBeGreaterThan(0);
    expect(CHAMPS_IDENTITE_INTERDITS).toContain('siret');
  });
});

describe('filtrerChamps — pur', () => {
  it('garde les renseignés hors identité, avec page et type ; écarte identité et vides', () => {
    const champs = filtrerChamps({
      'Nom_2': [{ type: 'text', value: 'Dupont', page: 1 }],                 // identité → écarté
      'T2T_superficie': [{ type: 'text', value: '2631.5', page: 4 }],        // gardé
      'Construction neuve': [{ type: 'checkbox', value: 'On', page: 2 }],    // gardé
      'Parcs de stationnement': [{ type: 'checkbox', value: false, page: 2 }], // case non cochée → écarté
      'Voie_3': [{ type: 'text', value: '', page: 1 }],                      // vide + identité → écarté
    });
    expect(champs.map((c) => c.nom).sort()).toEqual(['Construction neuve', 'T2T_superficie']);
    const sup = champs.find((c) => c.nom === 'T2T_superficie')!;
    expect(sup).toMatchObject({ valeur: '2631.5', page: 4, type: 'text' });
  });
  it('convertit une valeur non-string en chaîne', () => {
    const champs = filtrerChamps({ 'C5ZJ1_niveaux': [{ type: 'text', value: 8, page: 6 }] });
    expect(champs[0].valeur).toBe('8');
  });
  it('table nulle (pas d’AcroForm) → vide', () => {
    expect(filtrerChamps(null)).toEqual([]);
  });
});

describe('lireChampsFormulaire — pdfjs mocké', () => {
  it('succès → champs filtrés, document détruit', async () => {
    H.state.fieldObjects = { 'T2T_superficie': [{ type: 'text', value: '2631.5', page: 4 }], 'Nom_2': [{ type: 'text', value: 'X', page: 1 }] };
    const champs = await lireChampsFormulaire(Buffer.from('pdf'));
    expect(champs.map((c) => c.nom)).toEqual(['T2T_superficie']);
    expect(H.state.detruit).toBe(1);
  });
  it('PDF illisible → table VIDE, jamais d’exception', async () => {
    H.state.doitThrow = true;
    await expect(lireChampsFormulaire(Buffer.from('x'))).resolves.toEqual([]);
  });
  it('PDF sans AcroForm (getFieldObjects null) → vide', async () => {
    H.state.fieldObjects = null;
    await expect(lireChampsFormulaire(Buffer.from('x'))).resolves.toEqual([]);
  });
});
