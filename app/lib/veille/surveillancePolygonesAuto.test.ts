import { describe, it, expect, vi } from 'vitest';
import { executerSurveillancePolygones, type DepsSurveillancePolygones } from './surveillancePolygonesAuto';
import type { ChangementSurveille } from '../permis/surveillancePolygones';

/**
 * SURV-1 — ORCHESTRATION (par injection, aucun SMTP ni base). On prouve les gardes (marqueur absent / adresse vide), la composition
 * d'UN e-mail récapitulatif, l'anti-doublon, et l'ordre ENVOI → MARQUAGE (un envoi qui échoue ne marque rien).
 */
function makeDeps(over: Partial<DepsSurveillancePolygones> = {}): DepsSurveillancePolygones {
  return {
    disponible: vi.fn(async () => true),
    lireReglages: vi.fn(async () => ({ active: true, toleranceContourPct: 0, fenetreJours: 730, email: 'arno@exemple.fr', siteUrl: 'https://app.exemple.fr' })),
    chargerDossiersEnFenetre: vi.fn(async () => [{ dossierId: 531, numDau: 'PC531', valideLe: '2026-06-01' }]),
    chargerFootprints: vi.fn(async () => ({ valides: [{ cleabs: 'A' }], courants: [{ cleabs: 'A', changementRelatif: 0 }, { cleabs: 'B', changementRelatif: null }] })), // B nouveau
    dejaAlertes: vi.fn(async (): Promise<ChangementSurveille[]> => []),
    aujourdhui: vi.fn(async () => '2026-08-29'),
    envoyer: vi.fn(async (_to: string, _s: string, _c: string) => { void _to; void _s; void _c; }),
    marquer: vi.fn(async (_d: number, _c: ChangementSurveille[]) => { void _d; void _c; }),
    ...over,
  };
}

describe('SURV-1 — executerSurveillancePolygones', () => {
  it('marqueur absent (171 non appliquée) → RIEN (aucun chargement de dossiers, aucun envoi)', async () => {
    const chargerDossiersEnFenetre = vi.fn(async () => []);
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ disponible: vi.fn(async () => false), chargerDossiersEnFenetre, envoyer });
    expect(await executerSurveillancePolygones(deps)).toEqual({ dossiers: 0, aAlerter: 0, envoye: false });
    expect(chargerDossiersEnFenetre).not.toHaveBeenCalled();
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('SURV-2 — interrupteur ÉTEINT → RIEN, même avec des changements détectables (rien chargé, rien envoyé, rien marqué)', async () => {
    const disponible = vi.fn(async () => true);
    const chargerDossiersEnFenetre = vi.fn(async () => [{ dossierId: 531, numDau: 'PC531', valideLe: '2026-06-01' }]);
    const envoyer = vi.fn(async () => {});
    const marquer = vi.fn(async () => {});
    const deps = makeDeps({
      lireReglages: vi.fn(async () => ({ active: false, toleranceContourPct: 0, fenetreJours: 730, email: 'arno@exemple.fr', siteUrl: null })),
      disponible, chargerDossiersEnFenetre, envoyer, marquer,
    });
    expect(await executerSurveillancePolygones(deps)).toEqual({ dossiers: 0, aAlerter: 0, envoye: false });
    expect(disponible).not.toHaveBeenCalled();
    expect(chargerDossiersEnFenetre).not.toHaveBeenCalled();
    expect(envoyer).not.toHaveBeenCalled();
    expect(marquer).not.toHaveBeenCalled();
  });

  it('SURV-2 — éteint puis rallumé → reprise normale (aucun effet de bord entre-temps : rien n’a été marqué)', async () => {
    const marquer = vi.fn(async () => {});
    const eteint = makeDeps({ marquer, lireReglages: vi.fn(async () => ({ active: false, toleranceContourPct: 0, fenetreJours: 730, email: 'arno@exemple.fr', siteUrl: null })) });
    expect((await executerSurveillancePolygones(eteint)).envoye).toBe(false);
    expect(marquer).not.toHaveBeenCalled(); // rien n’a pollué la table marqueur pendant l’extinction
    const rallume = makeDeps({ marquer }); // active:true par défaut → comportement SURV-1
    expect((await executerSurveillancePolygones(rallume)).envoye).toBe(true);
    expect(marquer).toHaveBeenCalledTimes(1);
  });

  it('adresse d’alerte vide → RIEN (même pas la disponibilité)', async () => {
    const disponible = vi.fn(async () => true);
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ lireReglages: vi.fn(async () => ({ active: true, toleranceContourPct: 0, fenetreJours: 730, email: '  ', siteUrl: null })), disponible, envoyer });
    expect((await executerSurveillancePolygones(deps)).envoye).toBe(false);
    expect(disponible).not.toHaveBeenCalled();
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('un polygone nouveau → UN e-mail (avec lien fiche) ; le dossier est marqué', async () => {
    const envoyer = vi.fn(async (_to: string, _s: string, _c: string) => { void _to; void _s; void _c; });
    const marquer = vi.fn(async (_d: number, _c: ChangementSurveille[]) => { void _d; void _c; });
    const deps = makeDeps({ envoyer, marquer });
    const r = await executerSurveillancePolygones(deps);
    expect(r).toEqual({ dossiers: 1, aAlerter: 1, envoye: true });
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(envoyer.mock.calls[0][0]).toBe('arno@exemple.fr');
    expect(envoyer.mock.calls[0][2]).toContain('PC531');
    expect(envoyer.mock.calls[0][2]).toContain('https://app.exemple.fr/admin/permis?q=PC531'); // lien direct vers la fiche
    expect(envoyer.mock.calls[0][2]).toContain('B : nouveau polygone apparu');
    expect(envoyer.mock.calls[0][2]).toContain('n’est PAS une invalidation'); // libellé obligatoire
    expect(marquer).toHaveBeenCalledTimes(1);
    expect(marquer.mock.calls[0][0]).toBe(531);
    expect(marquer.mock.calls[0][1]).toEqual([{ cleabs: 'B', type: 'nouveau' }]);
  });

  it('changement DÉJÀ alerté → pas de second envoi', async () => {
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ dejaAlertes: vi.fn(async () => [{ cleabs: 'B', type: 'nouveau' as const }]), envoyer });
    expect((await executerSurveillancePolygones(deps)).envoye).toBe(false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('aucun dossier validé en fenêtre → rien, PAS un échec', async () => {
    const envoyer = vi.fn(async () => {});
    const deps = makeDeps({ chargerDossiersEnFenetre: vi.fn(async () => []), envoyer });
    expect((await executerSurveillancePolygones(deps)).envoye).toBe(false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('l’ENVOI précède le MARQUAGE : un envoi qui ÉCHOUE ne marque RIEN (retenté) et relaie', async () => {
    const ordre: string[] = [];
    const envoyer = vi.fn(async () => { ordre.push('envoyer'); throw new Error('SMTP KO'); });
    const marquer = vi.fn(async () => { ordre.push('marquer'); });
    const deps = makeDeps({ envoyer, marquer });
    await expect(executerSurveillancePolygones(deps)).rejects.toThrow('SMTP KO');
    expect(ordre).toEqual(['envoyer']);
    expect(marquer).not.toHaveBeenCalled();
  });
});
