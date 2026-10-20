import { describe, expect, it } from 'vitest';
import { libelleMandat, sorteDuBien, verifierMandat } from './mandatBien';
import { statutProprietaires } from './mailNouvelleLocation';

/** 🔴 Arno (21/10/2026, 397) — le mandat d'un bien selon « Bien en gestion ? ». */
describe('le mandat d’un bien', () => {
  it('la sorte suit « Bien en gestion ? » : Oui → gestion, Non → transaction locative', () => {
    expect(sorteDuBien(true)).toBe('gestion');
    expect(sorteDuBien(false)).toBe('transaction');
    expect(sorteDuBien(null)).toBeNull();
  });
  it('la saisie : facultative (rien → null), n° et date contrôlés', () => {
    expect(verifierMandat(undefined)).toEqual({ ok: true, mandat: null });
    expect(verifierMandat({ sorte: 'gestion', numero: ' ', signeLe: '' })).toEqual({ ok: true, mandat: null });
    expect(verifierMandat({ sorte: 'gestion', numero: ' MG-41 ', signeLe: '2026-10-15' })).toEqual({ ok: true, mandat: { sorte: 'gestion', numero: 'MG-41', signeLe: '2026-10-15' } });
    expect(verifierMandat({ sorte: 'transaction', numero: '', signeLe: '2026-10-15' })).toEqual({ ok: true, mandat: { sorte: 'transaction', numero: null, signeLe: '2026-10-15' } });
    expect(verifierMandat({ sorte: 'gestion', numero: 'x', signeLe: '15/10/2026' })).toEqual({ ok: false, motif: 'Mandat de gestion : la date de signature est à saisir au format JJ/MM/AAAA.' });
    expect(verifierMandat({ sorte: 'autre', numero: 'x' })).toMatchObject({ ok: false });
  });
  it('le libellé, et la ligne sous la pastille du mail « Nouvelle location »', () => {
    expect(libelleMandat('gestion', { numero: 'MG-41', signeLe: '2026-10-15' })).toBe('Mandat de gestion n° MG-41, signé le 15/10/2026');
    expect(libelleMandat('transaction', { numero: null, signeLe: '2026-10-15' })).toBe('Mandat de transaction locative, signé le 15/10/2026');
    expect(libelleMandat('gestion', { numero: null, signeLe: null })).toBeNull();
    const s = statutProprietaires({ proprietaires: [{ nom: 'A', dejaEnGestion: false, depuis: null }], biensEnGestion: 1, mandats: ['ANCIEN'],
      mandatLibelles: ['Mandat de transaction locative n° MT-7, signé le 15/10/2026'] });
    expect(s.mandat).toBe('Mandat de transaction locative n° MT-7, signé le 15/10/2026');
    // Sans les lignes du bien (appel d'avant), la règle d'avant.
    expect(statutProprietaires({ proprietaires: [{ nom: 'A', dejaEnGestion: false, depuis: null }], biensEnGestion: 1, mandats: ['MG-1'] }).mandat).toBe('Mandat de gestion n° MG-1');
  });
});
