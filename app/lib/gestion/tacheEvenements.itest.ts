/**
 * ══ 🔴 LOT GESTION-TACHES-EVENEMENTS — RATTACHER UNE TÂCHE À DES ÉVÉNEMENTS EN COURS, LE VRAI SQL (migration 366) ══
 *
 * Les vrais gestes (`creerTache`, `modifierTache`, `annulerTache`) et la vraie lecture de la frise (`tachesDeLEvenement`),
 * sur une base d'essai. Aucun appel réel (Google et le transport des mails sont faux sous vitest).
 *
 * 🔴 REFUSE DE TOURNER ailleurs que sur une base `svav_test…` (elle crée des événements d'essai et des tâches).
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_taches npx vitest run --config vitest.integration.config.ts \
 *     app/lib/gestion/tacheEvenements.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { annulerTache, creerTache, lireTache, modifierTache } from './tachesRepo';
import { evenementsProposes, repriseAncienLienFaite, tachesDeLEvenement } from './tacheEvenementsRepo';
import { readFileSync } from 'node:fs';
import type { SaisieTache } from './taches';

const BASE = process.env.DATABASE_URL ?? '';
if (!/\/svav_test[^/]*$/.test(BASE)) throw new Error(`Base d'essai exigée (svav_test…), reçu : ${BASE.replace(/:[^:@/]*@/, ':***@')}`);

const MOI = { id: 1, libelle: 'a@sansvisavis.com' };
let lot = 0;
let lotCle = '';
const ev: number[] = [];
let clos = 0;

const evenement = async (objet: string): Promise<number> => {
  const ref = `GES-2026-9${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO gestion_evenement (reference, objet, ouvert_le, ouvert_par_libelle) VALUES ($1, $2, '2026-10-01 12:00+02', 'essai') RETURNING id::int AS id`,
    [ref, objet]);
  return Number(rows[0].id);
};
const saisie = (o: Partial<SaisieTache> = {}): SaisieTache => ({
  objet: '_TEST tâche rattachée', jour: '2026-10-21', heure: '14:30', note: null, confieeA: 1, evenementId: null,
  rappels: [], ...o,
});

beforeAll(async () => {
  const l = (await query<{ id: number; cle: string }>(`SELECT id::int AS id, wippimmo_id AS cle FROM gestion_annuaire_lot ORDER BY id LIMIT 1`)).rows[0];
  lot = Number(l.id); lotCle = l.cle;
  for (const o of ['_TEST A', '_TEST B', '_TEST C']) ev.push(await evenement(o));
  // A est un événement DU BIEN (partie « lot ») : il doit être proposé en premier.
  await query(`INSERT INTO gestion_evenement_partie (evenement_id, sorte, cle, libelle, cree_par_libelle) VALUES ($1, 'lot', $2, 'bien', 'essai')`, [ev[0], lotCle]);
  clos = await evenement('_TEST clos');
  await query(`INSERT INTO gestion_monga_etape (evenement_id, type, survenu_le, source) VALUES ($1, 'cloture', '2026-10-05 12:00+02', 'manuelle')`, [clos]);
});
afterAll(async () => { await closePool(); });

describe('🔴 rattacher à des événements en cours', () => {
  let t = 0;
  it('le sélecteur : les événements en cours, ceux du bien d’abord ; jamais un événement clos', async () => {
    const p = await evenementsProposes(lotCle);
    expect(p[0]).toMatchObject({ id: ev[0], duBien: true });
    expect(p.some((x) => x.id === ev[1] && !x.duBien)).toBe(true);
    expect(p.some((x) => x.id === clos)).toBe(false);
  });

  it('à la création : 2 événements ; la frise de chacun montre la tâche, pas celle du 3e', async () => {
    const c = await creerTache(lot, saisie({ evenements: [ev[0], ev[1]] }), MOI);
    if (!c.ok) throw new Error(c.motif);
    t = c.id;
    expect((await lireTache(t))!.tache.evenements?.map((e) => e.id)).toEqual([ev[0], ev[1]]);
    expect((await tachesDeLEvenement(ev[0])).map((x) => x.id)).toContain(t);
    expect((await tachesDeLEvenement(ev[1])).map((x) => x.id)).toContain(t);
    expect((await tachesDeLEvenement(ev[2])).map((x) => x.id)).not.toContain(t);
    const f = (await tachesDeLEvenement(ev[0])).find((x) => x.id === t)!;
    expect(f).toMatchObject({ objet: '_TEST tâche rattachée', jour: '2026-10-21', heure: '14:30', expediteur: 'Arno Jorel' });
  });

  it('après coup (« Modifier ») : un 3e, puis le retrait d’un ; tracés ; la ligne retirée reste en base', async () => {
    expect((await modifierTache(t, saisie({ evenements: [ev[0], ev[1], ev[2]] }), MOI)).ok).toBe(true);
    expect((await tachesDeLEvenement(ev[2])).map((x) => x.id)).toContain(t);
    expect((await modifierTache(t, saisie({ evenements: [ev[0], ev[2]] }), MOI)).ok).toBe(true);
    expect((await lireTache(t))!.tache.evenements?.map((e) => e.id)).toEqual([ev[0], ev[2]]);
    expect((await tachesDeLEvenement(ev[1])).map((x) => x.id)).not.toContain(t);
    const lignes = (await query<{ n: number; retirees: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE retire_le IS NOT NULL)::int AS retirees FROM gestion_tache_evenement WHERE tache_id = $1`, [t])).rows[0];
    expect(lignes).toEqual({ n: 3, retirees: 1 });
    const traces = (await lireTache(t))!.traces.map((x) => x.apres as Record<string, unknown> | null);
    expect(traces.filter((a) => a && 'evenementRattache' in a)).toHaveLength(3);
    expect(traces.filter((a) => a && 'evenementRetire' in a)).toHaveLength(1);
  });

  it('un événement clos ne se rattache pas : refus clair, RIEN n’est écrit (création comprise)', async () => {
    const m = await modifierTache(t, saisie({ evenements: [ev[0], ev[2], clos] }), MOI);
    expect(m).toMatchObject({ ok: false, statut: 400, champ: 'evenements' });
    expect(m.ok ? '' : m.motif).toMatch(/n’est plus en cours/);
    expect((await lireTache(t))!.tache.evenements?.map((e) => e.id)).toEqual([ev[0], ev[2]]);
    const avant = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_tache`)).rows[0].n;
    expect((await creerTache(lot, saisie({ evenements: [clos] }), MOI)).ok).toBe(false);
    expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_tache`)).rows[0].n).toBe(avant);
  });

  /* 🔴 LOT GESTION-HISTORIQUE-TACHES (accord d'Arno) — remplace la règle du point gris : seules les tâches VALIDÉES. */
  it('annulée : la tâche disparaît de la frise ; le rattachement reste en base et dans la tâche', async () => {
    expect((await annulerTache(t, MOI)).ok).toBe(true);
    expect((await tachesDeLEvenement(ev[0])).some((x) => x.id === t)).toBe(false);
    expect((await lireTache(t))!.tache.evenements?.map((e) => e.id)).toEqual([ev[0], ev[2]]);
  });

  it('confiée à une collègue : en attente → absente de la frise ; acceptée → présente ; refusée par tous → absente', async () => {
    const c = await creerTache(lot, saisie({ objet: '_TEST invitée', confieeA: 2, evenements: [ev[0]] }), MOI);
    if (!c.ok) throw new Error(c.motif);
    expect((await tachesDeLEvenement(ev[0])).some((x) => x.id === c.id)).toBe(false);
    const { repondreDemande } = await import('./acceptationRepo');
    expect((await repondreDemande({ jeton: c.demandes![0].jeton!, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true })).ok).toBe(true);
    expect((await tachesDeLEvenement(ev[0])).some((x) => x.id === c.id)).toBe(true);
    const r = await creerTache(lot, saisie({ objet: '_TEST refusée', confieeA: 2, evenements: [ev[0]] }), MOI);
    if (!r.ok) throw new Error(r.motif);
    expect((await repondreDemande({ jeton: r.demandes![0].jeton!, decision: 'refuser', motif: 'non', utilisateur: null, nom: null, identiteParJeton: true })).ok).toBe(true);
    expect((await tachesDeLEvenement(ev[0])).some((x) => x.id === r.id)).toBe(false);
  });
});

describe('🔴 LOT GESTION-TACHES-EVENEMENTS-FUSION — « Événement du bien lié » repris dans les rattachements (367)', () => {
  it('une tâche avec l’ancien lien seul : la reprise la rattache (point dans la frise, case cochée), la donnée d’origine reste', async () => {
    const c = await creerTache(lot, saisie({ objet: '_TEST ancien lien' }), MOI);
    if (!c.ok) throw new Error(c.motif);
    // L'ancien lien SEUL, tel que les tâches d'avant la 366 le portent (aucune ligne de rattachement).
    await query(`UPDATE gestion_tache SET evenement_id = $2 WHERE id = $1`, [c.id, ev[1]]);
    expect(await repriseAncienLienFaite()).toBe(false);
    await query(readFileSync('db/migrations/367_gestion_tache_evenement_reprise.sql', 'utf8'));
    expect(await repriseAncienLienFaite()).toBe(true);
    const t = (await lireTache(c.id))!.tache;
    expect(t.evenements?.map((e) => e.id)).toEqual([ev[1]]);
    expect(t.evenement?.id).toBe(ev[1]);
    expect((await tachesDeLEvenement(ev[1])).map((x) => x.id)).toContain(c.id);
    // Rejouée : rien de plus (idempotente).
    await query(readFileSync('db/migrations/367_gestion_tache_evenement_reprise.sql', 'utf8'));
    expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_tache_evenement WHERE tache_id = $1`, [c.id])).rows[0].n).toBe(1);
    // Décocher l'événement retire le rattachement ; la reprise reste « faite », l'ancien champ reste en base.
    expect((await modifierTache(c.id, saisie({ objet: '_TEST ancien lien', evenementId: ev[1], evenements: [] }), MOI)).ok).toBe(true);
    expect((await lireTache(c.id))!.tache.evenements).toEqual([]);
    expect(await repriseAncienLienFaite()).toBe(true);
    expect((await lireTache(c.id))!.tache.evenement?.id).toBe(ev[1]);
  });
  it('un appelant qui envoie encore l’ancien champ : l’événement devient aussi un rattachement', async () => {
    const c = await creerTache(lot, saisie({ objet: '_TEST ancien champ envoyé', evenementId: ev[2] }), MOI);
    if (!c.ok) throw new Error(c.motif);
    expect((await lireTache(c.id))!.tache.evenements?.map((e) => e.id)).toEqual([ev[2]]);
  });
});
