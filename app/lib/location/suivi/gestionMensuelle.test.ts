import { describe, expect, it } from 'vitest';
import {
  calculerDossier, calculerMois, finDeDuree, indicesManquants, loyerDuJour, moisEntre, totalMois, type BailMensuel, type BienMensuel, type LireIndice,
} from './gestionMensuelle';

/**
 * 🔴 Arno (25/10/2026) — LE MOTEUR DE LA COMMISSION RÉCURRENTE SUR LA GESTION : révision annuelle (bon indice, bonne date), loyer réel
 * prioritaire, vacance, nouveau locataire, sortie de gestion, prorata au jour, fin de durée, indice manquant signalé, sommes au centime.
 * Données fictives.
 */
const VALEURS: Record<string, number> = { 'irl-2023-4': 140, 'irl-2024-4': 144.2, 'irl-2025-4': 147.08 };
const indices: LireIndice = (t, a, q) => VALEURS[`${t}-${a}-${q}`] ?? null;
const sans = (cle: string): LireIndice => (t, a, q) => (`${t}-${a}-${q}` === cle ? null : indices(t, a, q));
const jour = (iso: string): number => Date.UTC(...(iso.split('-').map(Number).map((x, i) => (i === 1 ? x - 1 : x)) as [number, number, number])) / 86400000;

const BAIL: BailMensuel = { bailId: 1, entree: '2024-03-15', sortie: null, locataire: 'DURAND Léa', loyerHc: 1000, provisions: 100, base: 'cc', tauxGestion: 6,
  indice: { type: 'irl', annee: 2023, trimestre: 4 }, revision: '2025-03-15', revises: [] };
const bien = (baux: BailMensuel[], finGestion: string | null = null): BienMensuel => ({ lotId: 7, libelle: '3 rue Fictive', baux, finGestion });

describe('🔴 le loyer du jour : révision annuelle, loyer réel, indice manquant', () => {
  it('révision à la BONNE DATE avec le BON indice (même trimestre, année suivante), arrondie au centime, puis chaînée', () => {
    expect(loyerDuJour(BAIL, jour('2025-03-14'), indices)).toMatchObject({ hc: 1000, source: 'entree' });
    expect(loyerDuJour(BAIL, jour('2025-03-15'), indices)).toMatchObject({ hc: 1030, provisions: 100, source: 'calcule' });   // 1 000 × 144,2 / 140
    expect(loyerDuJour(BAIL, jour('2026-03-15'), indices)).toMatchObject({ hc: 1050.57, source: 'calcule' });                 // 1 030 × 147,08 / 144,2 = 1 050,571…
  });
  it('le loyer RÉEL révisé l’emporte à sa date d’effet ; la révision suivante part de lui (indice de son année)', () => {
    const b = { ...BAIL, revises: [{ effetLe: '2025-06-01', loyerHc: 1100, provisions: 120 }] };
    expect(loyerDuJour(b, jour('2025-05-31'), indices)).toMatchObject({ hc: 1030, provisions: 100, source: 'calcule' });
    expect(loyerDuJour(b, jour('2025-06-01'), indices)).toMatchObject({ hc: 1100, provisions: 120, source: 'reel' });
    expect(loyerDuJour(b, jour('2026-03-15'), indices)).toMatchObject({ hc: 1121.97, provisions: 120, source: 'calcule' });   // 1 100 × 147,08 / 144,2
  });
  it('un indice MANQUANT : le dernier loyer connu est gardé, et c’est SIGNALÉ (jamais d’invention)', () => {
    const l = loyerDuJour(BAIL, jour('2026-04-01'), sans('irl-2025-4'));
    expect(l).toMatchObject({ hc: 1030, source: 'calcule', alertes: ['indice IRL T4 2025 manquant'] });
    expect(loyerDuJour(BAIL, jour('2025-04-01'), sans('irl-2023-4'))).toMatchObject({ hc: 1000, source: 'entree', alertes: ['indice IRL T4 2023 manquant'] });
  });
  it('un bail SANS indice : le loyer d’entrée, sans révision', () => {
    expect(loyerDuJour({ ...BAIL, indice: null }, jour('2027-01-01'), indices)).toMatchObject({ hc: 1000, source: 'entree', alertes: [] });
  });
});

describe('🔴 le mois : honoraires et commission, au jour près', () => {
  const apporteur = { taux: 0.1, debut: '2024-03-15', fin: null };
  it('mois d’entrée : prorata au jour (17 jours sur 31) ; honoraires = loyer CC × taux ; commission = honoraires × 10 %', () => {
    const m = calculerMois(bien([BAIL]), '2024-03', indices, apporteur, null);
    expect(m.joursOccupes).toBe(17);
    expect(m.honoraires).toBe(36.19);            // 1 100 × 6 % × 17 / 31 = 36,193…
    expect(m.commission).toBe(3.62);
    expect(m).toMatchObject({ locataire: 'DURAND Léa', loyerCc: 1100, source: 'entree' });
  });
  it('un mois plein : 66,00 € d’honoraires, 6,60 € de commission ; le mois de la révision est réparti au jour', () => {
    expect(calculerMois(bien([BAIL]), '2024-04', indices, apporteur, null)).toMatchObject({ honoraires: 66, commission: 6.6, joursOccupes: 30 });
    const mars = calculerMois(bien([BAIL]), '2025-03', indices, apporteur, null);
    // 14 jours à 1 100 € CC, 17 jours à 1 130 € CC.
    expect(mars.honoraires).toBe(Math.round((1100 * 0.06 * 14 / 31 + 1130 * 0.06 * 17 / 31) * 100) / 100);
    expect(mars).toMatchObject({ loyerHc: 1030, loyerCc: 1130, source: 'calcule' });
  });
  it('VACANCE = 0 ; le calcul REDÉMARRE avec le nouveau locataire et SON loyer', () => {
    const b1 = { ...BAIL, sortie: '2025-05-10' };
    const b2: BailMensuel = { ...BAIL, bailId: 2, entree: '2025-06-01', locataire: 'PETIT Marc', loyerHc: 1200, provisions: 80, indice: { type: 'irl', annee: 2024, trimestre: 4 }, revision: '2026-06-01' };
    const b = bien([b1, b2]);
    expect(calculerMois(b, '2025-05', indices, apporteur, null)).toMatchObject({ joursOccupes: 10, locataire: 'DURAND Léa' });
    expect(calculerMois(b, '2025-05', indices, apporteur, null).honoraires).toBe(Math.round(1130 * 0.06 * 10 / 31 * 100) / 100);
    // Un mois entièrement vacant : rien.
    expect(calculerMois(bien([b1, { ...b2, entree: '2025-07-01' }]), '2025-06', indices, apporteur, null)).toMatchObject({ joursOccupes: 0, honoraires: 0, commission: 0, locataire: null, source: null });
    expect(calculerMois(b, '2025-06', indices, apporteur, null)).toMatchObject({ locataire: 'PETIT Marc', loyerCc: 1280, honoraires: 76.8, commission: 7.68, source: 'entree' });
  });
  it('SORTIE DE GESTION : plus rien à partir de sa date (prorata) ; les mois suivants sont à zéro', () => {
    const b = bien([BAIL], '2025-09-16');
    expect(calculerMois(b, '2025-09', indices, apporteur, null).joursOccupes).toBe(15);
    expect(calculerMois(b, '2025-10', indices, apporteur, null)).toMatchObject({ joursOccupes: 0, honoraires: 0, commission: 0 });
  });
  it('FIN DE DURÉE (N ans depuis la signature) : la commission s’arrête au jour ; les honoraires continuent', () => {
    const fin = finDeDuree('2024-03-15', 1);
    expect(fin).toBe('2025-03-15');
    const m = calculerMois(bien([BAIL]), '2025-03', indices, { taux: 0.1, debut: '2024-03-15', fin }, null);
    expect(m.commission).toBe(Math.round(1100 * 0.06 * 14 / 31 * 0.1 * 100) / 100);
    expect(calculerMois(bien([BAIL]), '2025-04', indices, { taux: 0.1, debut: '2024-03-15', fin }, null)).toMatchObject({ commission: 0, honoraires: 67.8 });
  });
  it('le collègue a sa propre fenêtre et son propre taux', () => {
    const m = calculerMois(bien([BAIL]), '2024-04', indices, apporteur, { taux: 0.05, debut: '2024-03-15', fin: null });
    expect([m.commission, m.collegue]).toEqual([6.6, 3.3]);
  });
});

describe('🔴 le dossier, les sommes au centime, les indices manquants', () => {
  it('du mois de signature au mois en cours ; les totaux = la somme des mois affichés, au centime', () => {
    const lignes = calculerDossier(bien([BAIL]), '2024-03-15', '2024-12-20', indices, { taux: 1 / 3, debut: '2024-03-15', fin: null }, null);
    expect(lignes.map((l) => l.mois)).toEqual(moisEntre('2024-03', '2024-12'));
    const c = (x: number) => Math.round(x * 100);
    expect(c(totalMois(lignes, 'commission'))).toBe(lignes.reduce((s, l) => s + c(l.commission), 0));
    expect(c(totalMois(lignes, 'honoraires'))).toBe(lignes.reduce((s, l) => s + c(l.honoraires), 0));
  });
  it('les indices dont une révision passée a besoin et qui manquent, avec les biens concernés', () => {
    const m = indicesManquants([{ ...BAIL, libelle: '3 rue Fictive' }], '2026-04-01', sans('irl-2025-4'));
    expect(m).toEqual([{ type: 'irl', annee: 2025, trimestre: 4, biens: ['3 rue Fictive'] }]);
    expect(indicesManquants([{ ...BAIL, libelle: 'x' }], '2026-04-01', indices)).toEqual([]);
  });
  it('loyer ou taux inconnu : rien n’est inventé, c’est signalé', () => {
    expect(calculerMois(bien([{ ...BAIL, loyerHc: null }]), '2024-04', indices, null, null)).toMatchObject({ honoraires: 0, alertes: ['loyer d’entrée inconnu (DURAND Léa)'] });
    expect(calculerMois(bien([{ ...BAIL, tauxGestion: null }]), '2024-04', indices, null, null).alertes).toEqual(['taux d’honoraires de gestion inconnu (DURAND Léa)']);
  });
});
