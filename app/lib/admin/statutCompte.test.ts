import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classeCommission, libelleStatut } from './statut';

/** 🔴 LOT P (439) — le statut d'un compte : 4 valeurs, journalisé (avant / après / auteur / date) ; sans la 439, rien ne s'écrit. Base simulée. */
const lotP = vi.fn<() => Promise<boolean>>();
vi.mock('./schemaDroits', () => ({ statutDisponible: () => lotP() }));
const appels: { sql: string; params: unknown[] }[] = [];
let reponse: Record<string, unknown>[] = [];
vi.mock('../db/client', () => ({ query: async (sql: string, params: unknown[] = []) => { appels.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: reponse }; } }));
const m = await import('./statutCompte');
beforeEach(() => { appels.length = 0; reponse = []; lotP.mockResolvedValue(true); });

describe('🔴 LOT P — statut d’un compte', () => {
  it('les 4 statuts ; une valeur inconnue refusée sans une requête ; sans la 439, refus avec le motif', async () => {
    expect(await m.definirStatutCompte(5, 'patron', 2)).toEqual({ ok: false, motif: expect.stringMatching(/Associé, Salarié, Indépendant ou Observateur/) });
    lotP.mockResolvedValue(false);
    expect(await m.definirStatutCompte(5, 'salarie', 2)).toEqual({ ok: false, motif: expect.stringMatching(/migration 439/) });
    expect(appels).toEqual([]);
    expect(['associe', 'salarie', 'independant', 'observateur', null].map((s) => libelleStatut(s as never))).toEqual(['Associé', 'Salarié', 'Indépendant', 'Observateur', 'à renseigner']);
  });
  it('un changement : UPDATE + ligne de journal « changement_statut » (avant, après, auteur), dans UNE requête', async () => {
    reponse = [{ id: '5', change: true }];
    expect(await m.definirStatutCompte(5, 'independant', 2)).toEqual({ ok: true, change: true });
    expect(appels[0].sql).toContain("INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres) SELECT 'changement_statut'");
    expect(appels[0].params).toEqual([5, 'independant', 2]);
  });
  it('l’historique daté se relit (initialisation de la migration comprise) ; le cumul suit le statut', async () => {
    reponse = [{ statut: 'associe', le: '2026-10-28 10:00:00+01', avant: { statut: null }, apres: { statut: 'associe', origine: 'migration 439' }, par: null }];
    const e = await m.lireStatutCompte(1);
    expect(e.historique).toEqual([{ le: '2026-10-28 10:00:00+01', avant: null, apres: 'associe', par: null, origine: 'migration 439' }]);
    expect(['independant', 'associe', 'salarie', 'observateur', null].map((s) => classeCommission(s as never))).toEqual(['independant', 'interne', 'interne', 'a_renseigner', 'a_renseigner']);
  });
});
