import { describe, it, expect } from 'vitest';
import { echeanceDe, etatEcheance, type EntreeEcheance, type ReglagesEcheance } from './echeance';

/**
 * R6 — échéance PURE. Mois calendaire (pas 30 jours) + débordement de fin de mois ; ordre de priorité des états
 * (non_delivree > repondue > indeterminee > depassee/proche/en_cours). Le point central : jamais de silence non vérifié.
 */
const REG: ReglagesEcheance = { echeanceAlerteJours: 7, releveFraicheurHeures: 48 };

// Base « envoyée, relève fraîche » — chaque test surcharge ce qu'il éprouve.
function entree(over: Partial<EntreeEcheance> = {}): EntreeEcheance {
  return {
    envoyeLe: new Date('2026-03-15T10:00:00Z'),
    statutAcheminement: 'envoye',
    aReponseRattachee: false,
    derniereReleveOkLe: new Date('2026-04-20T02:00:00Z'),
    ...over,
  };
}

describe('R6 — echeanceDe : un mois calendaire + débordement de fin de mois', () => {
  it('cas simple : 15 janvier → 15 février', () => {
    expect(echeanceDe(new Date('2026-01-15T10:00:00Z')).toISOString()).toBe('2026-02-15T10:00:00.000Z');
  });

  it('débordement : 31 janvier → 28 février (année NON bissextile 2026)', () => {
    expect(echeanceDe(new Date('2026-01-31T10:00:00Z')).toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });

  it('débordement : 31 janvier → 29 février (année bissextile 2024)', () => {
    expect(echeanceDe(new Date('2024-01-31T10:00:00Z')).toISOString()).toBe('2024-02-29T10:00:00.000Z');
  });

  it('débordement : 31 mars → 30 avril (avril n’a que 30 jours)', () => {
    expect(echeanceDe(new Date('2026-03-31T08:30:00Z')).toISOString()).toBe('2026-04-30T08:30:00.000Z');
  });

  it('passage d’année : 15 décembre → 15 janvier suivant', () => {
    expect(echeanceDe(new Date('2025-12-15T00:00:00Z')).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });
});

describe('R6 — etatEcheance : ordre de priorité et silence vérifié', () => {
  it('non_delivree (rebond) l’emporte sur une échéance TRÈS dépassée', () => {
    const r = etatEcheance(entree({ statutAcheminement: 'rebond', envoyeLe: new Date('2026-01-01T10:00:00Z') }), new Date('2026-06-01T10:00:00Z'), REG);
    expect(r.etat).toBe('non_delivree');
  });

  it('non_delivree (echec) idem', () => {
    expect(etatEcheance(entree({ statutAcheminement: 'echec' }), new Date('2026-06-01T10:00:00Z'), REG).etat).toBe('non_delivree');
  });

  it('repondue l’emporte sur l’indétermination (réponse rattachée, même relève absente)', () => {
    const r = etatEcheance(entree({ aReponseRattachee: true, derniereReleveOkLe: null }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('repondue');
  });

  it('POINT CENTRAL : relève trop ancienne → indeterminee MÊME si l’échéance est largement dépassée', () => {
    // échéance = 15 avril ; maintenant = 30 avril (dépassé) ; dernière relève = 10 avril (20 j > 48 h) → indéterminée.
    const r = etatEcheance(entree({ derniereReleveOkLe: new Date('2026-04-10T10:00:00Z') }), new Date('2026-04-30T10:00:00Z'), REG);
    expect(r.etat).toBe('indeterminee');
  });

  it('jamais relevé (null) → indeterminee', () => {
    expect(etatEcheance(entree({ derniereReleveOkLe: null }), new Date('2026-04-30T10:00:00Z'), REG).etat).toBe('indeterminee');
  });

  it('relève fraîche + échéance passée → depassee', () => {
    // échéance = 15 avril 10:00 ; maintenant = 20 avril ; relève = 20 avril 02:00 (8 h < 48 h) → dépassée.
    const r = etatEcheance(entree(), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('depassee');
    expect(r.joursRestants).toBeLessThan(0);
  });

  it('proche AU SEUIL EXACT (échéance dans exactement echeance_alerte_jours) → proche', () => {
    const echeance = echeanceDe(new Date('2026-03-15T10:00:00Z')); // 15 avril 10:00
    const maintenant = new Date(echeance.getTime() - REG.echeanceAlerteJours * 86_400_000); // exactement 7 j avant
    const r = etatEcheance(entree({ derniereReleveOkLe: new Date(maintenant.getTime() - 3_600_000) }), maintenant, REG);
    expect(r.etat).toBe('proche');
    expect(r.joursRestants).toBe(7);
  });

  it('loin de l’échéance (relève fraîche) → en_cours', () => {
    const echeance = echeanceDe(new Date('2026-03-15T10:00:00Z'));
    const maintenant = new Date(echeance.getTime() - 10 * 86_400_000); // 10 j avant > seuil 7
    const r = etatEcheance(entree({ derniereReleveOkLe: new Date(maintenant.getTime() - 3_600_000) }), maintenant, REG);
    expect(r.etat).toBe('en_cours');
    expect(r.joursRestants).toBe(10);
  });

  it('pas encore envoyée (envoyeLe null, non rebond) → en_cours, le délai ne court pas', () => {
    const r = etatEcheance(entree({ envoyeLe: null, statutAcheminement: 'en_attente' }), new Date('2026-04-20T10:00:00Z'), REG);
    expect(r.etat).toBe('en_cours');
  });

  it('motif TOUJOURS non vide, quel que soit l’état', () => {
    const cas: EntreeEcheance[] = [
      entree({ statutAcheminement: 'rebond' }),
      entree({ aReponseRattachee: true }),
      entree({ derniereReleveOkLe: null }),
      entree(),
      entree({ envoyeLe: null }),
    ];
    for (const c of cas) expect(etatEcheance(c, new Date('2026-04-20T10:00:00Z'), REG).motif.length).toBeGreaterThan(0);
  });
});
