import { describe, expect, it } from 'vitest';
import { chiffrerGli, gliDepuisJanvier, gliDuMois, verifierMargeGli, type LigneGli, type MargeGli } from './margeGli';

/**
 * 🔴 Arno (25/10/2026, 427) — LA MARGE GLI ET LES « NOUVELLES GLI » : gain / mois = loyer CC × marge (au centime), / an = × 12 ; la marge
 * VERSIONNÉE (une GLI prend celle de SA date) ; une GLI sans loyer CC comptée dans le nombre, jamais dans les montants ; le cumul
 * « depuis le 1er janvier » sans effet boule de neige. Données fictives.
 */
const gli = (bailId: number, date: string, loyerHc: number | null, provisions: number | null): LigneGli =>
  ({ bailId, activiteId: bailId * 10, lotId: bailId * 100, bien: `Bien ${bailId}`, locataire: `Locataire ${bailId}`, date, loyerHc, provisions });
const marges: MargeGli[] = [{ depuis: '2026-01-01', marge: 2.5 }, { depuis: '2026-06-15', marge: 3.25 }];
const eur = (x: number) => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

describe('🔴 gain d’une GLI : loyer CC × marge en vigueur à SA date', () => {
  it('au centime : (1 234,56 + 85,44) × 2,5 % = 33,00 € / mois', () => {
    const g = chiffrerGli(gli(1, '2026-03-10', 1234.56, 85.44), marges);
    expect([g.loyerCc, g.marge, eur(g.gainMensuel!)]).toEqual([1320, 2.5, '33,00']);
  });
  it('au centime, une marge à deux décimales : (987,65 + 112,35) × 3,25 % = 35,75 € / mois', () => {
    expect(eur(chiffrerGli(gli(2, '2026-07-01', 987.65, 112.35), marges).gainMensuel!)).toBe('35,75');
  });
  it('VERSIONNÉE : la veille de la nouvelle version, l’ancienne ; le jour même, la nouvelle ; avant toute version, aucune', () => {
    expect(chiffrerGli(gli(3, '2026-06-14', 1000, 0), marges).marge).toBe(2.5);
    expect(chiffrerGli(gli(3, '2026-06-15', 1000, 0), marges).marge).toBe(3.25);
    const avant = chiffrerGli(gli(3, '2025-12-31', 1000, 0), marges);
    expect([avant.marge, avant.gainMensuel]).toEqual([null, null]);
  });
  it('0 % accepté : gain nul, compté', () => {
    expect(chiffrerGli(gli(4, '2026-02-01', 1000, 100), [{ depuis: '2026-01-01', marge: 0 }]).gainMensuel).toBe(0);
  });
});

describe('🔴 le mois et « Depuis le 1er janvier »', () => {
  const lignes = [gli(1, '2026-01-20', 1000, 100), gli(2, '2026-02-05', 800, 50), gli(3, '2026-02-25', null, 40), gli(4, '2026-02-26', 700, null),
    gli(5, '2026-07-01', 2000, 0), gli(6, '2025-02-10', 900, 100)];
  it('le mois : le nombre (toutes), le gain / mois (sans les GLI sans loyer CC), / an = × 12, la mention', () => {
    const f = gliDuMois(lignes, marges, '2026-02');
    expect(f.nb).toBe(3);
    expect(eur(f.mensuel)).toBe('21,25');           // 850 × 2,5 %
    expect(f.annuel).toBe(f.mensuel * 12);
    expect(eur(f.annuel)).toBe('255,00');
    expect(f.sansLoyer).toBe(2);
    expect(f.gli.map((g) => g.bailId)).toEqual([2, 3, 4]);
  });
  it('« Depuis le 1er janvier » : chaque GLI UNE fois (janvier 27,50 + février 21,25 = 48,75, pas 76,25) ; ni l’an d’avant ni après le mois', () => {
    const c = gliDepuisJanvier(lignes, marges, '2026-02');
    expect(c.nb).toBe(4);
    expect(eur(c.mensuel)).toBe('48,75');
    expect(eur(c.annuel)).toBe('585,00');
    expect(c.gli.map((g) => g.bailId)).toEqual([1, 2, 3, 4]);
    // Juillet : la GLI 5 à 3,25 % (sa date), les autres gardent la leur.
    expect(eur(gliDepuisJanvier(lignes, marges, '2026-07').mensuel)).toBe('113,75');
  });
  it('une GLI avant toute marge : comptée dans le nombre, signalée, sans gain', () => {
    const f = gliDuMois([gli(7, '2026-01-02', 1000, 0)], [{ depuis: '2026-03-01', marge: 2 }], '2026-01');
    expect([f.nb, f.mensuel, f.sansMarge, f.sansLoyer]).toEqual([1, 0, 1, 0]);
  });
});

describe('🔴 la saisie d’une version', () => {
  it('pourcentage de 0 à 100, deux décimales au plus, virgule acceptée ; date obligatoire', () => {
    expect(verifierMargeGli({ depuis: '2026-11-01', marge: '2,5' })).toEqual({ ok: true, depuis: '2026-11-01', marge: 2.5 });
    expect(verifierMargeGli({ depuis: '2026-11-01', marge: '0' })).toEqual({ ok: true, depuis: '2026-11-01', marge: 0 });
    expect(verifierMargeGli({ depuis: '2026-11-01', marge: '3,25 %' })).toMatchObject({ ok: true, marge: 3.25 });
    for (const m of ['2,555', '-1', '101', '', 'abc']) expect(verifierMargeGli({ depuis: '2026-11-01', marge: m }).ok).toBe(false);
    expect(verifierMargeGli({ depuis: '', marge: '2' })).toMatchObject({ ok: false, motif: 'La date « applicable à partir du » est obligatoire.' });
  });
});
