import { describe, expect, it } from 'vitest';
import { immeubleDeLAg, verifierDateAg } from './immeubleAg';

describe('🔴 dernière AG : par immeuble (clé de la Gestion), masquée pour un parking nu sans immeuble', () => {
  it('la clé est celle de l’« Immeuble » ; sans lui, l’adresse ; un parking nu sans immeuble n’en a pas', () => {
    expect(immeubleDeLAg({ immeuble: '15 rue Carle Hébert', adresse: 'autre', parking: false })).toEqual({ cle: '15 rue carle hebert', libelle: '15 rue Carle Hébert' });
    expect(immeubleDeLAg({ immeuble: '15 rue Carle Hebert', parking: true })?.cle).toBe('15 rue carle hebert');
    expect(immeubleDeLAg({ immeuble: '', adresse: '3 rue X', parking: false })).toEqual({ cle: '3 rue x', libelle: '3 rue X' });
    expect(immeubleDeLAg({ immeuble: null, adresse: '3 rue X', parking: true })).toBeNull();
  });
  it('date facultative, valide ou refusée', () => {
    expect(verifierDateAg('')).toEqual({ ok: true, date: null });
    expect(verifierDateAg('2026-06-30')).toEqual({ ok: true, date: '2026-06-30' });
    expect(verifierDateAg('2026-02-30').ok).toBe(false);
    expect(verifierDateAg('30/06/2026').ok).toBe(false);
  });
});
