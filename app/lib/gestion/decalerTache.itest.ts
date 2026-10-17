/**
 * ══ 🔴 LOT GESTION-DECALER-TACHE — DÉCALER UNE TÂCHE CONFIÉE À DES COLLÈGUES, LE VRAI SQL, FAUX GOOGLE, FAUX MAIL ══
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_taches npx vitest run --config vitest.integration.config.ts \
 *     app/lib/gestion/decalerTache.itest.ts
 * 🔴 REFUSE DE TOURNER ailleurs que sur une base `svav_test…`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerTache, decalerTache, lireTache, modifierTache } from './tachesRepo';
import { envoyerConfirmationReponse, envoyerSiBesoin, repondreDemande, type DemandePosee } from './acceptationRepo';
import { fauxGoogleDesTests, synchroniserApresGeste } from './agendaSynchroRepo';
import { ENVOIS_FACTICES } from './envoiDemandeTache';
import type { SaisieTache } from './taches';

const BASE = process.env.DATABASE_URL ?? '';
if (!/\/svav_test[^/]*$/.test(BASE)) throw new Error(`Base d'essai exigée (svav_test…), reçu : ${BASE.replace(/:[^:@/]*@/, ':***@')}`);

const MOI = { id: 1, libelle: 'a@sansvisavis.com' };
const CLAIRE = 2;
let EMMA = 0;
let GASPARD = 0;
let lot = 0;
const faux = fauxGoogleDesTests();
const evsDe = (agenda: string, t: number) => [...(faux.agendas.get(agenda)?.values() ?? [])]
  .filter((x) => (x as { extendedProperties?: { private?: Record<string, string> } }).extendedProperties?.private?.svavTacheId === String(t));
const saisie = (o: Partial<SaisieTache> = {}): SaisieTache => ({
  objet: '_TEST à décaler', jour: '2026-10-21', heure: '14:30', note: null, confieeA: CLAIRE, evenementId: null, rappels: [], ...o,
});
const accepter = (d: DemandePosee) => repondreDemande({ jeton: d.jeton!, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true });

beforeAll(async () => {
  lot = Number((await query<{ id: number }>(`SELECT id::int AS id FROM gestion_annuaire_lot ORDER BY id LIMIT 1`)).rows[0].id);
  EMMA = Number((await query<{ id: number }>(`SELECT id::int AS id FROM admin_utilisateur WHERE identifiant = 'e@sansvisavis.com'`)).rows[0].id);
  GASPARD = Number((await query<{ id: number }>(`SELECT id::int AS id FROM admin_utilisateur WHERE identifiant = 'g@sansvisavis.com'`)).rows[0].id);
  await query(`UPDATE gestion_tache_reglage SET envoi_mail_acceptation = true, envoi_agenda = true WHERE id = 1`);
});
afterAll(async () => {
  await query(`UPDATE gestion_tache_reglage SET envoi_mail_acceptation = false, envoi_agenda = false WHERE id = 1`);
  await closePool();
});

describe('🔴 décaler une tâche acceptée par 2 collègues', () => {
  let t = 0;
  let relances: DemandePosee[] = [];
  it('acceptée par Claire et Emma : 2 événements d’agenda', async () => {
    const c = await creerTache(lot, saisie({ invites: [EMMA] }), MOI);
    if (!c.ok) throw new Error(c.motif);
    t = c.id;
    for (const d of c.demandes!) expect((await accepter(d)).ok).toBe(true);
    await synchroniserApresGeste(t);
    expect(evsDe('c@criterimmo.fr', t)).toHaveLength(1);
    expect(evsDe('e@sansvisavis.com', t)).toHaveLength(1);
  });

  it('décalée : 2 mails « Tâche déplacée » (ancienne date barrée), états en attente, anciens événements retirés', async () => {
    const r = await decalerTache(t, { jour: '2026-10-23', heure: '09:00' }, MOI);
    if (!r.ok) throw new Error(r.motif);
    relances = r.demandes ?? [];
    expect(relances.map((d) => [d.destinataireLibelle, d.statut, d.ancienneDate?.jour])).toEqual([
      ['Claire Test', 'en_attente', '2026-10-21'], ['Emma Essai', 'en_attente', '2026-10-21']]);
    ENVOIS_FACTICES.length = 0;
    for (const d of relances) expect(await envoyerSiBesoin(d)).toBe('factice');
    expect(ENVOIS_FACTICES.map((m) => m.a[0])).toEqual(['c@criterimmo.fr', 'e@sansvisavis.com']);
    for (const m of ENVOIS_FACTICES) {
      expect(m.objet).toMatch(/^Tâche déplacée — /);
      expect(m.corps).toContain('ANCIENNE DATE (annulée) : Mercredi 21 octobre 2026 — 14 h 30 (1 h)');
      expect(m.corps).toContain('NOUVELLE DATE DE LA MISSION : VENDREDI 23 OCTOBRE 2026 — 9 h 00 (1 h)');
      expect(m.corpsHtml).toContain('<s>');
    }
    const tache = (await lireTache(t))!;
    expect(tache.tache.invites?.map((i) => i.statut)).toEqual(['en_attente', 'en_attente']);
    expect(tache.traces.map((x) => x.action)).toContain('decalage');
    await synchroniserApresGeste(t);
    expect(evsDe('c@criterimmo.fr', t)).toHaveLength(0);
    expect(evsDe('e@sansvisavis.com', t)).toHaveLength(0);
  });

  it('Claire accepte (nouvel événement, confirmation) ; Emma refuse (confirmation de refus avec motif)', async () => {
    const c = relances.find((d) => d.destinataireLibelle === 'Claire Test')!;
    const e = relances.find((d) => d.destinataireLibelle === 'Emma Essai')!;
    expect((await accepter(c)).ok).toBe(true);
    await synchroniserApresGeste(t);
    expect(evsDe('c@criterimmo.fr', t)).toHaveLength(1);
    expect((evsDe('c@criterimmo.fr', t)[0] as { start: unknown }).start).toEqual({ dateTime: '2026-10-23T09:00:00', timeZone: 'Europe/Paris' });
    ENVOIS_FACTICES.length = 0;
    expect(await envoyerConfirmationReponse(c.demandeId)).toBe('factice');
    expect((await repondreDemande({ jeton: e.jeton!, decision: 'refuser', motif: 'Indisponible le 23', utilisateur: null, nom: null, identiteParJeton: true })).ok).toBe(true);
    expect(await envoyerConfirmationReponse(e.demandeId)).toBe('factice');
    expect(ENVOIS_FACTICES.map((m) => m.objet)).toEqual([
      'Tâche acceptée par Claire Test — _TEST à décaler — Vendredi 23 octobre 2026 · 9 h 00',
      'Tâche refusée par Emma Essai — _TEST à décaler — Vendredi 23 octobre 2026 · 9 h 00',
    ]);
    expect(ENVOIS_FACTICES[0].a).toEqual([expect.stringMatching(/^gestion@/), 'a@sansvisavis.com']);
    expect(ENVOIS_FACTICES[1].corps).toContain('Motif du refus : Indisponible le 23');
    expect(evsDe('e@sansvisavis.com', t)).toHaveLength(0);
  });

  it('« Modifier » : date changée ET destinataire changé (Emma → Gaspard) : Claire « déplacée », Gaspard invitation NEUVE', async () => {
    const r = await modifierTache(t, saisie({ jour: '2026-10-26', heure: '09:00', invites: [GASPARD] }), MOI);
    if (!r.ok) throw new Error(r.motif);
    const parQui = new Map((r.demandes ?? []).map((d) => [d.destinataireLibelle, d]));
    expect(parQui.get('Claire Test')?.ancienneDate).toEqual({ jour: '2026-10-23', heure: '09:00', dureeMinutes: null });
    expect(parQui.get('Gaspard Essai')?.ancienneDate).toBeUndefined();
    ENVOIS_FACTICES.length = 0;
    await envoyerSiBesoin(parQui.get('Gaspard Essai'));
    expect(ENVOIS_FACTICES[0].objet).toMatch(/^Tâche à accepter — /);
    expect(ENVOIS_FACTICES[0].corps + (ENVOIS_FACTICES[0].corpsHtml ?? '')).not.toMatch(/déplacée|DÉPLACÉE|ANCIENNE DATE|<s>/);
    const traces = (await lireTache(t))!.traces;
    expect(traces.at(-1)).toBeDefined();
  });
});

describe('🔴 tâche confiée à soi-même, décalée : aucun mail', () => {
  it('aucune demande à envoyer (acceptée d’office, aucun jeton)', async () => {
    const c = await creerTache(lot, saisie({ objet: '_TEST soi-même', confieeA: 1 }), MOI);
    if (!c.ok) throw new Error(c.motif);
    const r = await decalerTache(c.id, { raccourci: '+1j' }, MOI, new Date('2026-10-17T10:00:00Z'));
    if (!r.ok) throw new Error(r.motif);
    expect((r.demandes ?? []).every((d) => d.jeton === null)).toBe(true);
    ENVOIS_FACTICES.length = 0;
    for (const d of r.demandes ?? []) expect(await envoyerSiBesoin(d)).toBeNull();
    expect(ENVOIS_FACTICES).toHaveLength(0);
  });
});
