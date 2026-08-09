import { describe, it, expect, vi } from 'vitest';

// db/client mocké : l'orchestrateur reçoit ses I/O par INJECTION (test node-pur), aucune vraie requête ni SMTP.
vi.mock('../db/client', () => ({ query: vi.fn() }));

import { executerPropositionAuto, type DepsPropositionAuto, type DemandeProposable } from './propositionAuto';

const DEM = (id: number, over: Partial<DemandeProposable> = {}): DemandeProposable => ({
  demandeId: id, reference: `SVAV-DEM-2026-${String(id).padStart(6, '0')}`, communeNom: 'Asnières-sur-Seine',
  envoyeLe: '2026-03-14', refusTaciteLe: '2026-04-14', joursAvantForclusion: 30, dossiersDusNums: ['DAU-1'], ...over,
});

function deps(over: Partial<DepsPropositionAuto> = {}): DepsPropositionAuto & {
  envoyes: { to: string; sujet: string; corps: string }[]; traces: number[];
} {
  const envoyes: { to: string; sujet: string; corps: string }[] = [];
  const traces: number[] = [];
  return {
    envoyes, traces,
    lireConfig: async () => ({ active: true, email: 'arno@sansvisavis.com' }),
    saisissables: async () => [DEM(42)],
    dejaProposee: async () => false,
    lienConfirmation: async (id) => `https://x/cada/confirmer?j=J${id}`,
    envoyer: async (to, sujet, corps) => { envoyes.push({ to, sujet, corps }); return '<mid@x>'; },
    tracer: async (id) => { traces.push(id); },
    ...over,
  };
}

describe('X5 — executerPropositionAuto : conditions cumulatives', () => {
  it('réglage inactif → ignore, AUCUN envoi ni trace', async () => {
    const d = deps({ lireConfig: async () => ({ active: false, email: 'arno@x.fr' }) });
    const r = await executerPropositionAuto(d);
    expect(r.resultat).toBe('ignore');
    expect(d.envoyes).toHaveLength(0);
    expect(d.traces).toHaveLength(0);
  });

  it('adresse d’alerte vide → ignore, AUCUN envoi ni trace', async () => {
    const d = deps({ lireConfig: async () => ({ active: true, email: '  ' }) });
    const r = await executerPropositionAuto(d);
    expect(r.resultat).toBe('ignore');
    expect(d.envoyes).toHaveLength(0);
    expect(d.traces).toHaveLength(0);
  });

  it('demande saisissable non proposée → envoie PUIS trace (après émission), à l’adresse d’alerte', async () => {
    const d = deps();
    const r = await executerPropositionAuto(d);
    expect(r).toMatchObject({ resultat: 'termine', envoyees: 1, ignorees: 0, echecs: 0 });
    expect(d.envoyes).toHaveLength(1);
    expect(d.envoyes[0].to).toBe('arno@sansvisavis.com');
    expect(d.envoyes[0].corps).toContain('cada/confirmer?j=J42'); // lien avec jeton de CETTE demande
    expect(d.traces).toEqual([42]); // trace APRÈS l'envoi
  });

  it('demande DÉJÀ proposée → ignorée, aucun nouvel envoi (jamais de rappel)', async () => {
    const d = deps({ dejaProposee: async () => true });
    const r = await executerPropositionAuto(d);
    expect(r).toMatchObject({ resultat: 'termine', envoyees: 0, ignorees: 1 });
    expect(d.envoyes).toHaveLength(0);
    expect(d.traces).toHaveLength(0);
  });

  it('trace UNIQUEMENT après émission : un envoi qui échoue ne laisse AUCUNE trace', async () => {
    const d = deps({ envoyer: async () => { throw new Error('SMTP down'); } });
    const r = await executerPropositionAuto(d);
    expect(r.echecs).toBe(1);
    expect(r.envoyees).toBe(0);
    expect(d.traces).toHaveLength(0); // pas de trace → sera retenté au prochain tick
  });

  it('ISOLATION : un échec sur une demande n’empêche pas les autres', async () => {
    let n = 0;
    const d = deps({
      saisissables: async () => [DEM(1), DEM(2), DEM(3)],
      envoyer: async () => { n += 1; if (n === 2) throw new Error('échec ponctuel'); return '<mid>'; },
    });
    const r = await executerPropositionAuto(d);
    expect(r.envoyees).toBe(2); // 1 et 3 partent
    expect(r.echecs).toBe(1);   // 2 échoue, isolée
    expect(d.traces.sort()).toEqual([1, 3]); // seules les réussies sont tracées
  });
});
