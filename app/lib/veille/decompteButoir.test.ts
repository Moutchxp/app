import { describe, it, expect } from 'vitest';
import { decompteButoirCada, ordinalRelance, type PartielDecompte } from './decompteButoir';
import type { EntreeEcheance, ReglagesEcheance } from './echeance';

/**
 * LOT-8 (B) — décompte avant le butoir qui FAIT FOI. Butoir PARTIEL prolongé si marqueur actif (jamais vidé par les documents obtenus,
 * cas 154), sinon butoir ORDINAIRE via etatEcheance (obtenu / indéterminé / décompte). PUR.
 */
const REG: ReglagesEcheance = { echeanceAlerteJours: 7, releveFraicheurHeures: 48 };
const SANS_PARTIEL: PartielDecompte = { actif: false, le: null, delaiMois: 1, delaiJours: 4 };
const e = (over: Partial<EntreeEcheance> = {}): EntreeEcheance => ({
  envoyeLe: new Date('2026-08-04T00:00:00Z'), statutAcheminement: 'envoye', dossiersActifs: 1, dossiersSatisfaits: 0,
  derniereReleveOkLe: new Date('2026-08-31T00:00:00Z'), ...over,
});
const MAINTENANT = new Date('2026-08-31T00:00:00Z');

describe('decompteButoirCada — quelle date fait foi', () => {
  it('marqueur PARTIEL actif → butoir PROLONGÉ (source=partiel), décompte positif AVANT le butoir', () => {
    const r = decompteButoirCada(e(), MAINTENANT, REG, { actif: true, le: '2026-08-28T12:00:00+02:00', delaiMois: 1, delaiJours: 4 });
    expect(r.source).toBe('partiel');
    expect(r.etat).toBe('compte');
    expect(r.jours).toBeGreaterThan(0); // butoir 02/10 > 31/08
    expect(r.butoir).not.toBeNull();
  });

  it('🔴 satisfait-mais-partiel (154) → le décompte n’est PAS vidé (le délai CADA du complément court toujours)', () => {
    // dossiersActifs=1, dossiersSatisfaits=1 : etatEcheance dirait « répondue » (joursRestants:null) ; le partiel court quand même.
    const r = decompteButoirCada(e({ dossiersSatisfaits: 1 }), MAINTENANT, REG, { actif: true, le: '2026-08-28T12:00:00+02:00', delaiMois: 1, delaiJours: 4 });
    expect(r.etat).toBe('compte');
    expect(r.source).toBe('partiel');
    expect(r.jours).toBeGreaterThan(0);
  });

  it('ORDINAIRE en cours → jours remontés d’etatEcheance (04/08 + 1 mois = 04/09, à 4 j du 31/08)', () => {
    const r = decompteButoirCada(e(), MAINTENANT, REG, SANS_PARTIEL);
    expect(r.source).toBe('ordinaire');
    expect(r.etat).toBe('compte');
    expect(r.jours).toBe(4);
  });

  it('ORDINAIRE dépassé → jours ≤ 0 (échéance passée)', () => {
    const r = decompteButoirCada(e({ envoyeLe: new Date('2026-06-01T00:00:00Z') }), MAINTENANT, REG, SANS_PARTIEL);
    expect(r.etat).toBe('compte');
    expect(r.jours!).toBeLessThanOrEqual(0);
  });

  it('ORDINAIRE, tous documents obtenus (non partiel) → etat=obtenu, aucun décompte', () => {
    const r = decompteButoirCada(e({ dossiersSatisfaits: 1 }), MAINTENANT, REG, SANS_PARTIEL);
    expect(r.etat).toBe('obtenu');
    expect(r.jours).toBeNull();
  });

  it('relève trop ancienne → etat=indetermine (silence non vérifié)', () => {
    const r = decompteButoirCada(e({ derniereReleveOkLe: null }), MAINTENANT, REG, SANS_PARTIEL);
    expect(r.etat).toBe('indetermine');
    expect(r.jours).toBeNull();
  });

  it('non délivrée (rebond) → etat=non_delivree', () => {
    const r = decompteButoirCada(e({ statutAcheminement: 'rebond' }), MAINTENANT, REG, SANS_PARTIEL);
    expect(r.etat).toBe('non_delivree');
  });

  it('pas encore envoyée → etat=non_envoyee', () => {
    const r = decompteButoirCada(e({ envoyeLe: null }), MAINTENANT, REG, SANS_PARTIEL);
    expect(r.etat).toBe('non_envoyee');
  });
});

describe('ordinalRelance — grade de la cascade partielle', () => {
  it('1 → 1re, 2 → 2e, 3 → 3e', () => {
    expect(ordinalRelance(1)).toBe('1re');
    expect(ordinalRelance(2)).toBe('2e');
    expect(ordinalRelance(3)).toBe('3e');
  });
});
