import { describe, it, expect, vi } from 'vitest';
import { executerEnvoiInitialAuto, type DepsEnvoiInitialAuto } from './envoiInitialAuto';
import type { RapportEnvoi } from '../sitadel/envoiDemande';

/**
 * 224 — ENVOI AUTO de la 1re demande (rail e-mail). On PROUVE : (1) interrupteur à false → RIEN n'est envoyé (envoyerDemandes jamais
 * appelé) ; (2) fenêtre horaire fermée/incohérente → rien ne part ; (3) fenêtre ouverte → passe par envoyerDemandes (LE chemin capé —
 * capBatch) et relaie SON budget, jamais plus ; (4) un échec est ISOLÉ (pas de throw propagé) ; (5) SÉPARATION : la décision ne dépend
 * QUE de son propre flag (l'objet config injecté n'a aucun champ de relance/saisine — le module ne peut structurellement pas les lire).
 */
// Un rapport d'envoi minimal : `budget` = salve autorisée par les caps (capBatch), `resultats` = ce qui est réellement parti.
const rapport = (over: Partial<RapportEnvoi> = {}): RapportEnvoi => ({
  mode: 'applique', candidats: 3, emisAujourdhui: 0, capParRun: 50, capParJour: 100, budget: 2,
  bloqueesCorps: [], bloqueesCompte: [],
  destinataires: [], octetsPartis: 0,
  resultats: [
    { id: 1, reference: 'SVAV-DEM-2026-000001', issue: 'envoye', messageId: '<a@b>' },
    { id: 2, reference: 'SVAV-DEM-2026-000002', issue: 'envoye', messageId: '<c@d>' },
  ],
  ...over,
});

function deps(over: Partial<DepsEnvoiInitialAuto> = {}): { d: DepsEnvoiInitialAuto; envoye: ReturnType<typeof vi.fn> } {
  const envoye = vi.fn(async () => rapport());
  const d: DepsEnvoiInitialAuto = {
    lireConfig: async () => ({ envoiInitialActive: true, envoiHeureDebut: 9, envoiHeureFin: 18 }),
    envoyerDemandes: envoye,
    maintenant: () => new Date('2026-09-16T10:00:00+02:00'), // mercredi 10h → jour/heure ouvrés
    ...over,
  };
  return { d, envoye };
}

describe('224 — executerEnvoiInitialAuto (gardé par le flag + la fenêtre, capé par envoyerDemandes)', () => {
  it('interrupteur à FALSE → « ignore » et envoyerDemandes JAMAIS appelé (rien ne part de lui-même)', async () => {
    const { d, envoye } = deps({ lireConfig: async () => ({ envoiInitialActive: false, envoiHeureDebut: 9, envoiHeureFin: 18 }) });
    const r = await executerEnvoiInitialAuto(d);
    expect(r.resultat).toBe('ignore');
    expect(r.envoyees).toBe(0);
    expect(envoye).not.toHaveBeenCalled(); // AUCUN envoi
  });

  it('flag ON mais HORS fenêtre horaire → « reporte », rien envoyé', async () => {
    const { d, envoye } = deps({ maintenant: () => new Date('2026-09-16T06:00:00+02:00') }); // 6h < 9h → fermé
    const r = await executerEnvoiInitialAuto(d);
    expect(r.resultat).toBe('reporte');
    expect(envoye).not.toHaveBeenCalled();
  });

  it('flag ON mais fenêtre INCOHÉRENTE (début ≥ fin) → « reporte », rien envoyé', async () => {
    const { d, envoye } = deps({ lireConfig: async () => ({ envoiInitialActive: true, envoiHeureDebut: 18, envoiHeureFin: 9 }) });
    const r = await executerEnvoiInitialAuto(d);
    expect(r.resultat).toBe('reporte');
    expect(envoye).not.toHaveBeenCalled();
  });

  it('flag ON + fenêtre ouverte → passe par envoyerDemandes (chemin capé) et relaie SON budget/compte, jamais plus', async () => {
    const { d, envoye } = deps();
    const r = await executerEnvoiInitialAuto(d);
    expect(envoye).toHaveBeenCalledTimes(1);       // LE seul chemin d'envoi (capBatch appliqué DEDANS)
    expect(r.resultat).toBe('termine');
    expect(r.envoyees).toBe(2);                     // exactement ce que le chemin capé a émis
    expect(r.budget).toBe(2);                       // relaie le budget capé, sans le dépasser
  });

  it('CAP RESPECTÉ : quand le budget capé est 1 (cap/run atteint), le module ne rapporte qu’1 envoi (aucun contournement)', async () => {
    const { d } = deps({ envoyerDemandes: async () => rapport({ budget: 1, resultats: [{ id: 1, reference: 'X', issue: 'envoye' }] }) });
    const r = await executerEnvoiInitialAuto(d);
    expect(r.envoyees).toBe(1);
    expect(r.budget).toBe(1);
  });

  it('un échec d’envoi est ISOLÉ : « echec » renvoyé, jamais une exception propagée (la veille continue)', async () => {
    const { d } = deps({ envoyerDemandes: async () => { throw new Error('SMTP down'); } });
    const r = await executerEnvoiInitialAuto(d);
    expect(r.resultat).toBe('echec');
    expect(r.envoyees).toBe(0);
  });

  it('SÉPARATION : la décision ne dépend QUE de envoiInitialActive — l’objet config n’expose AUCUN champ de relance/saisine', async () => {
    // Le TYPE de lireConfig ne contient ni relanceActive ni saisineActive : le module ne peut structurellement pas les lire.
    const cfg = await deps().d.lireConfig();
    expect(Object.keys(cfg).sort()).toEqual(['envoiHeureDebut', 'envoiHeureFin', 'envoiInitialActive']);
  });
});
