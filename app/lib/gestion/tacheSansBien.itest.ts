/**
 * ══ 🔴 LOT GESTION-TACHES-SANS-BIEN — UNE TÂCHE SANS BIEN, LE VRAI SQL (migration 368), FAUX GOOGLE, FAUX MAIL ══════
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_taches npx vitest run --config vitest.integration.config.ts \
 *     app/lib/gestion/tacheSansBien.itest.ts
 * 🔴 REFUSE DE TOURNER ailleurs que sur une base `svav_test…`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerTache, listerTaches, lireTache } from './tachesRepo';
import { envoyerConfirmationAcceptation, envoyerDemande, envoyerRecapitulatif, mesTachesRecues, repondreDemande } from './acceptationRepo';
import { fauxGoogleDesTests, synchroniserApresGeste } from './agendaSynchroRepo';
import { tachesDeLEvenement } from './tacheEvenementsRepo';
import { ENVOIS_FACTICES, transportFactice } from './envoiDemandeTache';
import type { SaisieTache } from './taches';

const BASE = process.env.DATABASE_URL ?? '';
if (!/\/svav_test[^/]*$/.test(BASE)) throw new Error(`Base d'essai exigée (svav_test…), reçu : ${BASE.replace(/:[^:@/]*@/, ':***@')}`);

const MOI = { id: 1, libelle: 'a@sansvisavis.com' };
const CLAIRE = 2;
let ev = 0;
let lot = 0;
const faux = fauxGoogleDesTests();
const saisie = (o: Partial<SaisieTache> = {}): SaisieTache => ({
  objet: '_TEST sans bien', jour: '2026-10-21', heure: '10:00', note: 'Réunion au cabinet', confieeA: CLAIRE, evenementId: null, rappels: [], ...o,
});
const lecteur = { async preparer() { return []; }, async ouvrir() { return { ok: false as const, motif: 'essai' }; } };

beforeAll(async () => {
  process.env.GESTION_JETON_CLE ||= 'ab'.repeat(32);
  lot = Number((await query<{ id: number }>(`SELECT id::int AS id FROM gestion_annuaire_lot ORDER BY id LIMIT 1`)).rows[0].id);
  ev = Number((await query<{ id: number }>(
    `INSERT INTO gestion_evenement (reference, objet, ouvert_le, ouvert_par_libelle) VALUES ($1, '_TEST sans bien', '2026-10-01 12:00+02', 'essai') RETURNING id::int AS id`,
    [`GES-2026-8${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`])).rows[0].id);
  await query(`UPDATE gestion_tache_reglage SET envoi_mail_acceptation = true, envoi_agenda = true WHERE id = 1`);
});
afterAll(async () => {
  await query(`UPDATE gestion_tache_reglage SET envoi_mail_acceptation = false, envoi_agenda = false WHERE id = 1`);
  await closePool();
});

describe('🔴 une tâche sans bien', () => {
  let t = 0;
  let jeton = '';
  let demandeId = 0;
  it('création : sans bien, contacts saisis à la main, rattachée à un événement en cours', async () => {
    const c = await creerTache(null, saisie({
      contactsManuels: [{ nom: '_TEST M. Dupont', qualite: 'Président du conseil syndical', telephone: '06 00 00 00 09', email: 'dupont@example.invalid' }],
      contacts: [], evenements: [ev],
    }), MOI);
    if (!c.ok) throw new Error(c.motif);
    t = c.id; jeton = c.demandes![0].jeton!; demandeId = c.demandes![0].demandeId;
    const d = (await lireTache(t))!;
    expect(d.tache).toMatchObject({ lotId: null, lotCle: null, adresseBien: '' });
    expect(d.contacts.map((x) => [x.nom, x.famille, x.coordonnees.map((y) => y.affichage ?? y.valeur)]))
      .toEqual([['_TEST M. Dupont', 'independant', ['06 00 00 00 09', 'dupont@example.invalid']]]);
    expect(d.tache.evenements?.map((e) => e.id)).toEqual([ev]);
    // Elle est dans la liste de toutes les tâches (page pleine, module), et dans la frise de l'événement, sans adresse.
    expect((await listerTaches(null)).taches.find((x) => x.id === t)).toMatchObject({ lotId: null, adresseBien: '' });
    expect((await tachesDeLEvenement(ev)).find((x) => x.id === t)?.adresse).toBe('');
    expect((await mesTachesRecues(CLAIRE)).find((x) => x.tacheId === t)?.adresseBien).toBe('');
  });

  it('invitation : objet et corps sans adresse, aucun « undefined » ; le contact saisi y est', async () => {
    ENVOIS_FACTICES.length = 0;
    expect(await envoyerDemande(demandeId, jeton, transportFactice, new Date(), lecteur)).toBe('factice');
    const m = ENVOIS_FACTICES[0];
    expect(m.objet).toMatch(/^Tâche à accepter — _TEST sans bien — /);
    for (const x of [m.corps, m.corpsHtml ?? '']) expect(x).not.toMatch(/Adresse du bien|ADRESSE DU BIEN|undefined|\bnull\b|Adresse non renseignée/);
    expect(m.corps).toContain('_TEST M. Dupont');
  });

  it('acceptation : agenda SANS lieu (titre sans adresse) ; récapitulatif et confirmation propres', async () => {
    const r = await repondreDemande({ jeton, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true });
    expect(r.ok).toBe(true);
    expect(await synchroniserApresGeste(t)).toBe(' Agenda Google à jour.');
    const e = [...(faux.agendas.get('c@criterimmo.fr')?.values() ?? [])]
      .find((x) => (x as { extendedProperties?: { private?: Record<string, string> } }).extendedProperties?.private?.svavTacheId === String(t)) as
      { summary: string; location?: string; description: string } | undefined;
    expect(e?.summary).toBe('Tâche gestion — _TEST sans bien');
    expect(e?.location).toBeUndefined();
    expect(e?.description).not.toContain('Fiche du bien');
    ENVOIS_FACTICES.length = 0;
    expect(await envoyerRecapitulatif(demandeId, 'ajoutee', transportFactice, lecteur)).toBe('factice');
    expect(await envoyerConfirmationAcceptation(demandeId, transportFactice, lecteur)).toBe('factice');
    expect(ENVOIS_FACTICES[0].objet).toMatch(/^Tâche acceptée — _TEST sans bien — /);
    expect(ENVOIS_FACTICES[1].objet).toBe('Tâche acceptée par Claire Test — _TEST sans bien — Mercredi 21 octobre 2026 · 10 h 00');
    for (const m of ENVOIS_FACTICES) {
      for (const x of [m.corps, m.corpsHtml ?? '']) expect(x).not.toMatch(/Adresse du bien|ADRESSE DU BIEN|undefined|\bnull\b|Adresse non renseignée/);
    }
  });

  it('une tâche AVEC bien garde son adresse partout (inchangé)', async () => {
    const c = await creerTache(lot, saisie({ objet: '_TEST avec bien', confieeA: 1 }), MOI);
    if (!c.ok) throw new Error(c.motif);
    const d = (await lireTache(c.id))!;
    expect(d.tache.lotId).toBe(lot);
    expect(d.tache.adresseBien).not.toBe('');
    await synchroniserApresGeste(c.id);
    const e = [...(faux.agendas.get('a@sansvisavis.com')?.values() ?? [])]
      .find((x) => (x as { extendedProperties?: { private?: Record<string, string> } }).extendedProperties?.private?.svavTacheId === String(c.id)) as
      { summary: string; description: string } | undefined;
    expect(e?.summary).toMatch(/^Tâche gestion — _TEST avec bien — ./);
    expect(e?.description).toContain('Fiche du bien');
  });
});
