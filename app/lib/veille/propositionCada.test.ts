import { describe, it, expect } from 'vitest';
import { composerProposition, type EntreeProposition } from './propositionCada';

/**
 * X5 — composition PURE de l'e-mail de proposition de saisine CADA. Vérifie : le détail de la demande initiale (référence,
 * commune, dates, dossiers, jours avant forclusion) + le lien de confirmation ; le ton interne SANS citation d'article ;
 * l'avertissement « le lien ne fait rien tout seul » (l'acte part d'un clic).
 */
const E = (over: Partial<EntreeProposition> = {}): EntreeProposition => ({
  reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine',
  envoyeLe: '2026-03-14', refusTaciteLe: '2026-04-14', joursAvantForclusion: 30,
  dossiersDusNums: ['DAU-092-2025-0001', 'DAU-092-2025-0002'], lienConfirmation: 'https://www.sansvisavis.com/cada/confirmer?j=JETON',
  ...over,
});

describe('X5 — composerProposition : détail du dossier + lien, ton interne factuel', () => {
  it('le corps montre le détail de la demande initiale et le lien de confirmation', () => {
    const { corps } = composerProposition(E());
    expect(corps).toContain('SVAV-DEM-2026-000042');
    expect(corps).toContain('Asnières-sur-Seine');
    expect(corps).toContain('2026-03-14');           // date d'envoi
    expect(corps).toContain('2026-04-14');           // refus tacite
    expect(corps).toContain('DAU-092-2025-0001');    // dossiers concernés
    expect(corps).toContain('DAU-092-2025-0002');
    expect(corps).toContain('30 jour');              // jours avant forclusion
    expect(corps).toContain('https://www.sansvisavis.com/cada/confirmer?j=JETON'); // lien
  });

  it('le sujet identifie le dossier (référence + commune)', () => {
    expect(composerProposition(E()).sujet).toBe('Saisir la CADA ? — SVAV-DEM-2026-000042 (Asnières-sur-Seine)');
  });

  it('dit explicitement que le lien ne déclenche RIEN au chargement (l’acte part d’un clic)', () => {
    const { corps } = composerProposition(E());
    expect(corps).toMatch(/ne fait rien tout seul|ne part qu’au clic|ne part qu'au clic/i);
    expect(corps).toMatch(/onglet .{0,3}Saisines CADA/i); // rappelle l'autre voie
  });

  it('AUCUNE citation d’article (ce n’est pas une pièce juridique)', () => {
    const { corps, sujet } = composerProposition(E());
    // Pas de « L.311-1 », « R.343-1 », « article … », « CRPA »… dans le message interne.
    expect(/\b[LR]\.?\s?\d{3}-\d/i.test(corps)).toBe(false);
    expect(/\barticle\b/i.test(corps)).toBe(false);
    expect(/\bCRPA\b/.test(corps + sujet)).toBe(false);
  });

  it('urgence signalée quand il reste peu de jours', () => {
    expect(composerProposition(E({ joursAvantForclusion: 3 })).corps).toMatch(/priorité/i);
    expect(composerProposition(E({ joursAvantForclusion: 30 })).corps).not.toMatch(/priorité/i);
  });
});
