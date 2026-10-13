/**
 * ══ 🔴 LOT TACHES-AGENDA — LE VRAI SQL, SUR LA BASE DE TEST, AVEC LE FAUX GOOGLE ═══════════════════════════════════
 *
 * Les scénarios de `agendaSynchro.test.ts` simulent la base ; celui-ci passe par les VRAIS gestes (`creerTache`,
 * `decalerTache`, `modifierTache`, `marquerFaite`, `rouvrirTache`, `annulerTache`, `repondreDemande`) et la VRAIE
 * synchronisation, sur une base d'essai. Google reste FAUX (sous vitest, `porteParDefaut` est le faux Google) :
 * aucun appel réel.
 *
 * 🔴 REFUSE DE TOURNER ailleurs que sur une base `svav_test…` : il active le réglage et écrit des tâches.
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_taches npx vitest run --config vitest.integration.config.ts \
 *     app/lib/gestion/agendaSynchro.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { annulerTache, creerTache, decalerTache, marquerFaite, modifierTache, rouvrirTache } from './tachesRepo';
import { repondreDemande } from './acceptationRepo';
import { fauxGoogleDesTests, synchroniserApresGeste } from './agendaSynchroRepo';
import type { SaisieTache } from './taches';

const BASE = process.env.DATABASE_URL ?? '';
if (!/\/svav_test[^/]*$/.test(BASE)) throw new Error(`Base d'essai exigée (svav_test…), reçu : ${BASE.replace(/:[^:@/]*@/, ':***@')}`);

const MOI = { id: 1, libelle: 'a@sansvisavis.com' };
const COLLEGUE = { id: 2, libelle: 'c@criterimmo.fr' };
let lot = 0;
const saisie = (o: Partial<SaisieTache> = {}): SaisieTache => ({
  objet: '_TEST agenda', jour: '2026-10-14', heure: null, note: 'note', confieeA: 1, evenementId: null,
  rappels: [{ sorte: 'jour', heure: '09:00' }], ...o,
});
const faux = fauxGoogleDesTests();
const evs = (a: string) => [...(faux.agendas.get(a)?.values() ?? [])];
const etat = async (id: number) => (await query<{ synchro_etat: string; google_evenement_id: string | null; google_agenda: string | null }>(
  `SELECT synchro_etat, google_evenement_id, google_agenda FROM gestion_tache WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  lot = Number((await query<{ id: number }>(`SELECT id::int AS id FROM gestion_annuaire_lot ORDER BY id LIMIT 1`)).rows[0].id);
  await query(`UPDATE gestion_tache_reglage SET envoi_agenda = true WHERE id = 1`);
});
afterAll(async () => {
  await query(`UPDATE gestion_tache_reglage SET envoi_agenda = false WHERE id = 1`);
  await closePool();
});

describe('🔴 le vrai SQL', () => {
  it('soi-même : créée → décalée → modifiée (rendez-vous 1 h 30) → faite (✓) → rouverte → annulée (supprimée)', async () => {
    const c = await creerTache(lot, saisie(), MOI);
    if (!c.ok) throw new Error(c.motif);
    expect(await synchroniserApresGeste(c.id)).toBe(' Agenda Google à jour.');
    const e1 = await etat(c.id);
    expect(e1).toMatchObject({ synchro_etat: 'envoyee', google_agenda: 'a@sansvisavis.com' });
    expect(evs('a@sansvisavis.com').find((e) => e.id === e1.google_evenement_id)?.start).toEqual({ date: '2026-10-14' });

    expect((await decalerTache(c.id, { raccourci: '+1j' }, MOI, new Date('2026-10-13T12:00:00Z'))).ok).toBe(true);
    await synchroniserApresGeste(c.id);
    expect((await etat(c.id)).google_evenement_id).toBe(e1.google_evenement_id);
    expect(faux.agendas.get('a@sansvisavis.com')?.get(e1.google_evenement_id!)?.start).toEqual({ date: '2026-10-15' });

    expect((await modifierTache(c.id, saisie({ jour: '2026-10-15', heure: '09:30', dureeMinutes: 90, rappels: [{ sorte: 'avant', minutes: 60 }] }), MOI)).ok).toBe(true);
    await synchroniserApresGeste(c.id);
    expect(faux.agendas.get('a@sansvisavis.com')?.get(e1.google_evenement_id!)?.end).toEqual({ dateTime: '2026-10-15T11:00:00', timeZone: 'Europe/Paris' });
    expect((await query(`SELECT duree_minutes FROM gestion_tache WHERE id = $1`, [c.id])).rows[0].duree_minutes).toBe(90);

    await marquerFaite(c.id, MOI);
    await synchroniserApresGeste(c.id);
    expect(String(faux.agendas.get('a@sansvisavis.com')?.get(e1.google_evenement_id!)?.summary)).toMatch(/^✓ Tâche gestion — /);
    await rouvrirTache(c.id, MOI);
    await synchroniserApresGeste(c.id);
    expect(String(faux.agendas.get('a@sansvisavis.com')?.get(e1.google_evenement_id!)?.summary)).toMatch(/^Tâche gestion — /);

    await annulerTache(c.id, MOI);
    await synchroniserApresGeste(c.id);
    expect(faux.agendas.get('a@sansvisavis.com')?.has(e1.google_evenement_id!)).toBe(false);
    expect(await etat(c.id)).toMatchObject({ synchro_etat: 'retiree', google_evenement_id: null });
    const j = await query<{ operation: string; resultat: string }>(
      `SELECT operation, resultat FROM gestion_tache_agenda_appel WHERE tache_id = $1 ORDER BY id`, [c.id]);
    expect(j.rows.map((r) => `${r.operation}:${r.resultat}`)).toContain('suppression:ok');
    // 🔴 LOT FICHE-CARTE-TACHE — « ✗ Tâche annulée » est CE geste : tracé (jamais supprimé) et événement retiré.
    const tr = await query<{ action: string }>(`SELECT action FROM gestion_tache_action WHERE tache_id = $1`, [c.id]);
    expect(tr.rows.map((r) => r.action)).toContain('annulation');
    expect((await query(`SELECT etat FROM gestion_tache WHERE id = $1`, [c.id])).rows[0].etat).toBe('annulee');
  });

  it('collègue : rien avant acceptation ; dans SON agenda après', async () => {
    const c = await creerTache(lot, saisie({ confieeA: 2 }), MOI);
    if (!c.ok) throw new Error(c.motif);
    expect(await synchroniserApresGeste(c.id)).toBe(' Elle entrera dans l’agenda après acceptation.');
    expect(evs('c@criterimmo.fr').filter((e) => (e.extendedProperties as { private: Record<string, string> }).private.svavTacheId === String(c.id))).toEqual([]);
    const r = await repondreDemande({ tacheId: c.id, decision: 'accepter', utilisateur: COLLEGUE, nom: 'Claire' });
    expect(r).toMatchObject({ ok: true, tacheId: c.id });
    expect(await synchroniserApresGeste(c.id)).toBe(' Agenda Google à jour.');
    expect(await etat(c.id)).toMatchObject({ synchro_etat: 'envoyee', google_agenda: 'c@criterimmo.fr' });
  });
});
