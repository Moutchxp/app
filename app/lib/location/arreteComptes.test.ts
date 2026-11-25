import { describe, expect, it } from 'vitest';
import { arreteFr, joursDuMois, MOTIF_ARRETE_INCOMPLET, MOTIF_ARRETE_INVALIDE, verifierArrete } from './arreteComptes';

/** 🔴 Arno (23/11/2026, 512) — la date d'arrêté des comptes : jour et mois annuels, facultative. */
describe('la date d’arrêté des comptes (module pur)', () => {
  it('jour ET mois, un jour qui existe chaque année ; vide des deux côtés = non renseignée', () => {
    expect(verifierArrete('31', '12')).toEqual({ ok: true, arrete: { jour: 31, mois: 12 } });
    expect(verifierArrete(30, 6)).toEqual({ ok: true, arrete: { jour: 30, mois: 6 } });
    expect(verifierArrete('', '')).toEqual({ ok: true, arrete: null });
    expect(verifierArrete(null, undefined)).toEqual({ ok: true, arrete: null });
    expect(verifierArrete('31', '')).toEqual({ ok: false, motif: MOTIF_ARRETE_INCOMPLET });
    expect(verifierArrete('', '6')).toEqual({ ok: false, motif: MOTIF_ARRETE_INCOMPLET });
    expect(verifierArrete('31', '6')).toEqual({ ok: false, motif: MOTIF_ARRETE_INVALIDE });
    expect(verifierArrete('29', '2')).toEqual({ ok: false, motif: MOTIF_ARRETE_INVALIDE });
    expect(verifierArrete('0', '1')).toEqual({ ok: false, motif: MOTIF_ARRETE_INVALIDE });
    expect(verifierArrete('1', '13')).toEqual({ ok: false, motif: MOTIF_ARRETE_INVALIDE });
    expect(verifierArrete('1.5', '3')).toEqual({ ok: false, motif: MOTIF_ARRETE_INCOMPLET });
  });
  it('affichage « JJ/MM » ; février : 28 jours', () => {
    expect(arreteFr({ jour: 31, mois: 12 })).toBe('31/12');
    expect(arreteFr({ jour: 1, mois: 7 })).toBe('01/07');
    expect(arreteFr(null)).toBe('non renseignée');
    expect(joursDuMois(2)).toBe(28);
    expect(joursDuMois(6)).toBe(30);
    expect(joursDuMois(12)).toBe(31);
  });
});

/** 🔴 (Arno, 25/11/2026, 23h13) — « afficher la date de clôture des comptes en toutes lettres, par exemple "1er MARS" » (écran seulement). */
describe('🔴 arreteEnLettres', () => {
  it('1er, 2, 28 février, 29, 30, 31 ; mois en MAJUSCULES avec leurs accents', async () => {
    const { arreteEnLettres } = await import('./arreteComptes');
    expect(arreteEnLettres({ jour: 1, mois: 3 })).toBe('1er MARS');
    expect(arreteEnLettres({ jour: 1, mois: 1 })).toBe('1er JANVIER');
    expect(arreteEnLettres({ jour: 2, mois: 5 })).toBe('2 MAI');
    expect(arreteEnLettres({ jour: 15, mois: 6 })).toBe('15 JUIN');
    expect(arreteEnLettres({ jour: 28, mois: 2 })).toBe('28 FÉVRIER');
    expect(arreteEnLettres({ jour: 29, mois: 2 })).toBe('29 FÉVRIER');            // jamais saisi (le 29/02 est refusé), mais écrit sans erreur
    expect(arreteEnLettres({ jour: 31, mois: 8 })).toBe('31 AOÛT');
    expect(arreteEnLettres({ jour: 30, mois: 9 })).toBe('30 SEPTEMBRE');
    expect(arreteEnLettres({ jour: 31, mois: 12 })).toBe('31 DÉCEMBRE');
    expect(arreteEnLettres(null)).toBe('non renseignée');
  });
  it('le format en chiffres reste celui du journal et du mail aux partenaires de la sortie', async () => {
    const { arreteFr } = await import('./arreteComptes');
    expect(arreteFr({ jour: 1, mois: 3 })).toBe('01/03');
  });
});
