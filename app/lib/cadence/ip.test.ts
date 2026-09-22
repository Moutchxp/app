import { describe, it, expect, afterEach, vi } from 'vitest';
import { sujetVisiteur, SUJET_PARTAGE } from './ip';

/**
 * LE TEST QUI COMPTE : un robot ne doit pas pouvoir se forger une adresse par requête pour n'être jamais compté.
 * Next 16 n'expose pas l'adresse du socket (`ip` retiré en v15) → la confiance est DÉCLARÉE par l'exploitant
 * (`CADENCE_ENTETE_IP`), jamais déduite d'un en-tête présent.
 */

const requete = (entetes: Record<string, string> = {}) => new Request('http://test/api/analyse', { headers: entetes });

afterEach(() => vi.unstubAllEnvs());

describe('AUCUN mandataire déclaré → aucun en-tête n’est cru (usurpation impossible)', () => {
  it.each([
    ['x-forwarded-for', '203.0.113.7'],
    ['cf-connecting-ip', '203.0.113.7'],
    ['x-real-ip', '203.0.113.7'],
    ['forwarded', 'for=203.0.113.7'],
  ])('%s forgé par le client est IGNORÉ', (nom, valeur) => {
    expect(sujetVisiteur(requete({ [nom]: valeur }))).toBe(SUJET_PARTAGE);
  });

  it('DEUX requêtes avec des adresses forgées DIFFÉRENTES tombent dans le MÊME seau', () => {
    const a = sujetVisiteur(requete({ 'x-forwarded-for': '198.51.100.1' }));
    const b = sujetVisiteur(requete({ 'x-forwarded-for': '198.51.100.2' }));
    expect(a).toBe(b); // sinon le robot échapperait au comptage en changeant d'en-tête
    expect(a).toBe(SUJET_PARTAGE);
  });

  it('aucun en-tête du tout → seau partagé', () => {
    expect(sujetVisiteur(requete())).toBe(SUJET_PARTAGE);
  });
});

describe('mandataire DÉCLARÉ → l’en-tête nommé, et LUI SEUL, est lu', () => {
  it('lit l’en-tête déclaré', () => {
    vi.stubEnv('CADENCE_ENTETE_IP', 'cf-connecting-ip');
    expect(sujetVisiteur(requete({ 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('IGNORE les AUTRES en-têtes, même présents (seul le déclaré fait foi)', () => {
    vi.stubEnv('CADENCE_ENTETE_IP', 'cf-connecting-ip');
    const sujet = sujetVisiteur(requete({ 'x-forwarded-for': '198.51.100.9', 'cf-connecting-ip': '203.0.113.7' }));
    expect(sujet).toBe('203.0.113.7');
  });

  it('en-tête déclaré ABSENT → seau partagé (on ne devine pas)', () => {
    vi.stubEnv('CADENCE_ENTETE_IP', 'cf-connecting-ip');
    expect(sujetVisiteur(requete({ 'x-forwarded-for': '198.51.100.9' }))).toBe(SUJET_PARTAGE);
  });

  it('X-Forwarded-For déclaré : première valeur de la liste (le client vu par le mandataire)', () => {
    vi.stubEnv('CADENCE_ENTETE_IP', 'x-forwarded-for');
    expect(sujetVisiteur(requete({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.7');
  });

  it('valeur illisible ou hors format → seau partagé, jamais une valeur arbitraire', () => {
    vi.stubEnv('CADENCE_ENTETE_IP', 'cf-connecting-ip');
    for (const v of ['', '   ', 'robot<script>', 'a'.repeat(60), 'sujet;drop']) {
      expect(sujetVisiteur(requete({ 'cf-connecting-ip': v }))).toBe(SUJET_PARTAGE);
    }
  });

  it('IPv6 acceptée, casse normalisée', () => {
    vi.stubEnv('CADENCE_ENTETE_IP', 'cf-connecting-ip');
    expect(sujetVisiteur(requete({ 'cf-connecting-ip': '2001:DB8::1' }))).toBe('2001:db8::1');
  });
});
