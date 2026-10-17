/**
 * ══ 🔴 LOT GESTION-INVITATIONS-TACHES — PLUSIEURS INVITÉS, LE VRAI SQL (migration 365), FAUX GOOGLE, FAUX MAIL ══════
 *
 * Les vrais gestes (`creerTache`, `repondreDemande`, `changerDestinataire`, `modifierTache`) et la vraie synchronisation
 * de l'agenda, sur une base d'essai. Sous vitest, Google et le transport des mails sont TOUJOURS faux : aucun appel réel.
 *
 * 🔴 REFUSE DE TOURNER ailleurs que sur une base `svav_test…` (elle écrit des comptes d'essai et des tâches).
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_taches npx vitest run --config vitest.integration.config.ts \
 *     app/lib/gestion/invitesTache.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerTache, lireTache, modifierTache } from './tachesRepo';
import { demandeDuJeton, envoyerDemande, envoyerRecapitulatif, repondreDemande, type DemandePosee } from './acceptationRepo';
import { ouvrirPieceSignee, type LecteurPiecesTache } from './mailTacheRepo';
import { ENVOIS_FACTICES, transportFactice } from './envoiDemandeTache';
import { changerDestinataire, renvoyerInvitation } from './invitesRepo';
import { fauxGoogleDesTests, synchroniserApresGeste } from './agendaSynchroRepo';
import type { SaisieTache } from './taches';

const BASE = process.env.DATABASE_URL ?? '';
if (!/\/svav_test[^/]*$/.test(BASE)) throw new Error(`Base d'essai exigée (svav_test…), reçu : ${BASE.replace(/:[^:@/]*@/, ':***@')}`);

const MOI = { id: 1, libelle: 'a@sansvisavis.com' };
const CLAIRE = 2; // c@criterimmo.fr
let EMMA = 0;
let FELIX = 0;
let GASPARD = 0;
let lot = 0;
const faux = fauxGoogleDesTests();
const tacheDe = (e: unknown): string | undefined =>
  (e as { extendedProperties?: { private?: Record<string, string> } }).extendedProperties?.private?.svavTacheId;
const evs = (a: string) => [...(faux.agendas.get(a)?.values() ?? [])].filter((e) => tacheDe(e) !== undefined);

async function compte(identifiant: string, prenom: string, nom: string): Promise<number> {
  const deja = await query<{ id: number }>(`SELECT id::int AS id FROM admin_utilisateur WHERE identifiant = $1`, [identifiant]);
  if (deja.rows[0]) return Number(deja.rows[0].id);
  // La base d'essai a reçu des comptes à identifiant imposé : la séquence est remise au-dessus.
  await query(`SELECT setval('admin_utilisateur_id_seq', (SELECT max(id) FROM admin_utilisateur))`);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO admin_utilisateur (identifiant, mot_de_passe, role, prenom, nom, actif) VALUES ($1, 'x', 'collaborateur', $2, $3, true)
     RETURNING id::int AS id`, [identifiant, prenom, nom]);
  return Number(rows[0].id);
}

const saisie = (o: Partial<SaisieTache> = {}): SaisieTache => ({
  objet: '_TEST invités', jour: '2026-10-21', heure: '14:30', note: 'note', confieeA: CLAIRE, evenementId: null,
  rappels: [{ sorte: 'avant', minutes: 60 }], ...o,
});
const jetonDe = (demandes: readonly DemandePosee[] | undefined, libelle: string): string => {
  const d = (demandes ?? []).find((x) => x.destinataireLibelle === libelle);
  if (!d?.jeton) throw new Error(`pas de jeton pour ${libelle}`);
  return d.jeton;
};

beforeAll(async () => {
  lot = Number((await query<{ id: number }>(`SELECT id::int AS id FROM gestion_annuaire_lot ORDER BY id LIMIT 1`)).rows[0].id);
  EMMA = await compte('e@sansvisavis.com', 'Emma', 'Essai');
  FELIX = await compte('f@criterimmo.fr', 'Félix', 'Essai');
  GASPARD = await compte('g@sansvisavis.com', 'Gaspard', 'Essai');
  await query(`UPDATE gestion_tache_reglage SET envoi_agenda = true WHERE id = 1`);
});
afterAll(async () => {
  await query(`UPDATE gestion_tache_reglage SET envoi_agenda = false WHERE id = 1`);
  await closePool();
});

describe('🔴 trois invités, chacun son lien, sa réponse, son agenda', () => {
  let tacheId = 0;
  let jetons: Record<string, string> = {};

  it('création : trois invitations en attente, trois jetons distincts, « Confiée à » = le premier', async () => {
    const c = await creerTache(lot, saisie({ invites: [EMMA, FELIX] }), MOI);
    if (!c.ok) throw new Error(c.motif);
    tacheId = c.id;
    expect(c.demandes?.map((d) => d.statut)).toEqual(['en_attente', 'en_attente', 'en_attente']);
    jetons = { claire: jetonDe(c.demandes, 'Claire Test'), emma: jetonDe(c.demandes, 'Emma Essai'), felix: jetonDe(c.demandes, 'Félix Essai') };
    expect(new Set(Object.values(jetons)).size).toBe(3);
    const t = (await lireTache(tacheId))!.tache;
    expect(t.confieeA).toBe(CLAIRE);
    expect(t.invites?.map((i) => [i.libelle, i.principal, i.statut])).toEqual([
      ['Claire Test', true, 'en_attente'], ['Emma Essai', false, 'en_attente'], ['Félix Essai', false, 'en_attente'],
    ]);
    await synchroniserApresGeste(tacheId);
    expect(evs('c@criterimmo.fr').filter((e) => tacheDe(e) === String(tacheId))).toHaveLength(0);
  });

  it('Claire accepte, Emma refuse (motif) : chacun SA demande ; l’agenda de Claire seul reçoit la tâche, une fois', async () => {
    const a = await repondreDemande({ jeton: jetons.claire, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true });
    expect(a).toMatchObject({ ok: true, statut: 'acceptee' });
    const r0 = await repondreDemande({ jeton: jetons.emma, decision: 'refuser', motif: '', utilisateur: null, nom: null, identiteParJeton: true });
    expect(r0.ok).toBe(false);
    const r = await repondreDemande({ jeton: jetons.emma, decision: 'refuser', motif: 'Pas disponible ce jour-là', utilisateur: null, nom: null, identiteParJeton: true });
    expect(r).toMatchObject({ ok: true, statut: 'refusee' });
    await synchroniserApresGeste(tacheId);
    await synchroniserApresGeste(tacheId); // deux fois : jamais de doublon
    const de = (a: string) => evs(a).filter((e) => tacheDe(e) === String(tacheId));
    expect(de('c@criterimmo.fr')).toHaveLength(1);
    expect(de('e@sansvisavis.com')).toHaveLength(0);
    expect(de('f@criterimmo.fr')).toHaveLength(0);
    const t = (await lireTache(tacheId))!.tache;
    expect(t.invites?.map((i) => i.statut)).toEqual(['acceptee', 'refusee', 'en_attente']);
    expect(t.invites?.[1].motif).toBe('Pas disponible ce jour-là');
  });

  it('changer le destinataire de Félix (en attente) → Gaspard : l’ancien lien « ne vous est plus destiné », le nouveau a le sien', async () => {
    const t0 = (await lireTache(tacheId))!.tache;
    const felix = t0.invites!.find((i) => i.libelle === 'Félix Essai')!;
    const r = await changerDestinataire(tacheId, felix.inviteId, GASPARD, MOI);
    if (!r.ok) throw new Error(r.motif);
    expect(r.demandes).toHaveLength(1);
    expect(r.demandes[0]).toMatchObject({ statut: 'en_attente', destinataireLibelle: 'Gaspard Essai' });
    jetons.gaspard = r.demandes[0].jeton!;

    const ancien = await demandeDuJeton(jetons.felix, 'destinataire');
    expect(ancien.verdict).toMatchObject({ ok: false, cause: 'plus_destinee' });
    expect(ancien.tache).toBeNull();
    const essai = await repondreDemande({ jeton: jetons.felix, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true });
    expect(essai).toMatchObject({ ok: false, cause: 'plus_destinee' });
    expect((await demandeDuJeton(jetons.gaspard, 'destinataire')).verdict.ok).toBe(true);

    const t = (await lireTache(tacheId))!.tache;
    expect(t.invites?.map((i) => [i.libelle, i.statut])).toEqual([['Claire Test', 'acceptee'], ['Emma Essai', 'refusee'], ['Gaspard Essai', 'en_attente']]);
    const tr = (await lireTache(tacheId))!.traces.map((x) => x.apres);
    expect(tr).toContainEqual({ destinataireChange: 'Gaspard Essai' });
    const ligne = (await query<{ retire_raison: string; remplace_par: number }>(
      `SELECT retire_raison, remplace_par::int AS remplace_par FROM gestion_tache_invite WHERE id = $1`, [felix.inviteId])).rows[0];
    expect(ligne.retire_raison).toBe('destinataire_change');
    expect(ligne.remplace_par).toBe(t.invites![2].inviteId);
  });

  it('interdit sur un invité qui a accepté (Claire) : refus clair, rien ne change', async () => {
    const t = (await lireTache(tacheId))!.tache;
    const r = await changerDestinataire(tacheId, t.invites![0].inviteId, FELIX, MOI);
    expect(r).toMatchObject({ ok: false, statut: 409 });
    expect(r.ok ? '' : r.motif).toMatch(/déjà accepté/);
    expect((await lireTache(tacheId))!.tache.invites?.map((i) => i.libelle)).toEqual(['Claire Test', 'Emma Essai', 'Gaspard Essai']);
  });

  it('« Mes tâches » (sans jeton) : Gaspard répond à SA demande, pas à celle de Claire', async () => {
    const r = await repondreDemande({ tacheId, decision: 'accepter', utilisateur: { id: GASPARD, libelle: 'g@sansvisavis.com' }, nom: 'Gaspard Essai' });
    expect(r).toMatchObject({ ok: true, statut: 'acceptee' });
    await synchroniserApresGeste(tacheId);
    const t = (await lireTache(tacheId))!.tache;
    expect(t.invites?.map((i) => i.statut)).toEqual(['acceptee', 'refusee', 'acceptee']);
    const de = (a: string) => evs(a).filter((e) => tacheDe(e) === String(tacheId));
    expect(de('g@sansvisavis.com')).toHaveLength(1);
    expect(de('c@criterimmo.fr')).toHaveLength(1);
  });

  it('modifier : retirer Gaspard (accepté) le sort de son agenda ; son lien ne lui est plus destiné', async () => {
    const r = await modifierTache(tacheId, saisie({ invites: [EMMA] }), MOI);
    if (!r.ok) throw new Error(r.motif);
    await synchroniserApresGeste(tacheId);
    const de = (a: string) => evs(a).filter((e) => tacheDe(e) === String(tacheId));
    expect(de('g@sansvisavis.com')).toHaveLength(0);
    expect(de('c@criterimmo.fr')).toHaveLength(1);
    expect((await demandeDuJeton(jetons.gaspard, 'destinataire')).verdict).toMatchObject({ ok: false, cause: 'plus_destinee' });
    expect((await lireTache(tacheId))!.tache.invites?.map((i) => i.libelle)).toEqual(['Claire Test', 'Emma Essai']);
  });
});

describe('🔴 LOT 2 — « Renvoyer l’invitation »', () => {
  it('nouveau lien, l’ancien inutilisable ; 2 minutes au moins entre deux renvois au même invité ; jamais sur un accepté', async () => {
    const c = await creerTache(lot, saisie({ confieeA: EMMA, invites: [GASPARD] }), MOI);
    if (!c.ok) throw new Error(c.motif);
    const premier = jetonDe(c.demandes, 'Emma Essai');
    const emma = (await lireTache(c.id))!.tache.invites!.find((i) => i.libelle === 'Emma Essai')!;

    const r1 = await renvoyerInvitation(c.id, emma.inviteId, MOI);
    if (!r1.ok) throw new Error(r1.motif);
    expect(r1.message).toBe('Invitation renvoyée à Emma Essai.');
    const second = r1.demandes[0].jeton!;
    expect(second).not.toBe(premier);
    expect((await demandeDuJeton(premier, 'destinataire')).verdict).toMatchObject({ ok: false, cause: 'remplace' });
    expect((await repondreDemande({ jeton: premier, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true })).ok).toBe(false);
    expect((await demandeDuJeton(second, 'destinataire')).verdict.ok).toBe(true);

    // Tout de suite après : refusé, avec le temps qui reste ; RIEN n'a changé (le second lien marche toujours).
    const tot = await renvoyerInvitation(c.id, emma.inviteId, MOI);
    expect(tot).toMatchObject({ ok: false, statut: 429 });
    expect(tot.ok ? '' : tot.motif).toMatch(/patientez encore/);
    expect((await demandeDuJeton(second, 'destinataire')).verdict.ok).toBe(true);
    // 2 minutes plus tard : permis.
    const r2 = await renvoyerInvitation(c.id, emma.inviteId, MOI, new Date(Date.now() + 2 * 60_000 + 1000));
    expect(r2.ok).toBe(true);
    expect((await demandeDuJeton(second, 'destinataire')).verdict).toMatchObject({ ok: false, cause: 'remplace' });

    // L'autre invité n'a pas bougé ; un invité qui a accepté ne se renvoie pas.
    const g = jetonDe(c.demandes, 'Gaspard Essai');
    expect((await repondreDemande({ jeton: g, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true })).ok).toBe(true);
    const gaspard = (await lireTache(c.id))!.tache.invites!.find((i) => i.libelle === 'Gaspard Essai')!;
    expect(await renvoyerInvitation(c.id, gaspard.inviteId, MOI)).toMatchObject({ ok: false, statut: 409 });
    const traces = (await lireTache(c.id))!.traces.map((x) => x.apres);
    expect(traces.filter((a) => (a as { invitationRenvoyee?: string } | null)?.invitationRenvoyee === 'Emma Essai')).toHaveLength(2);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT 3 — LE CONTENU DES MAILS (invitation, récapitulatif), les pièces jointes ou leurs liens signés.
   Le Drive est remplacé par un lecteur d'essai (aucun appel Google) ; le transport est le transport FACTICE.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const TAILLES: Record<string, number> = { 'drive-leger-1': 120_000, 'drive-leger-2': 80_000, 'drive-lourd': 14_000_000 };
const lecteur: LecteurPiecesTache = {
  async preparer(pieces) {
    return pieces.map((p) => ({ ...p, tailleOctets: TAILLES[p.driveId] ?? 1000, permis: true, telechargeable: true, motif: null,
      lire: async () => Buffer.alloc(Math.min(TAILLES[p.driveId] ?? 1000, 200_000), 1) }));
  },
  async ouvrir(driveId) {
    return { ok: true, nom: `${driveId}.pdf`, flux: { corps: null, typeMime: 'application/pdf', statut: 200, intervalle: null, longueur: 3 } };
  },
};

describe('🔴 LOT 3 — invitation et récapitulatif, même structure ; pièces jointes ou liens signés', () => {
  beforeAll(async () => {
    process.env.GESTION_JETON_CLE ||= 'ab'.repeat(32);
    await query(`UPDATE gestion_tache_reglage SET envoi_mail_acceptation = true WHERE id = 1`);
  });
  afterAll(async () => { await query(`UPDATE gestion_tache_reglage SET envoi_mail_acceptation = false WHERE id = 1`); });

  it('invitation : sections, « Vous êtes 3 invités », pièces légères JOINTES ; récapitulatif après acceptation', async () => {
    const c = await creerTache(lot, saisie({ invites: [EMMA, GASPARD], note: 'Apporter le plan' }), MOI);
    if (!c.ok) throw new Error(c.motif);
    for (const id of ['drive-leger-1', 'drive-leger-2']) {
      await query(`INSERT INTO gestion_tache_piece (tache_id, drive_fichier_id, nom, type_mime, ajoute_par_libelle) VALUES ($1, $2, $3, 'application/pdf', 'essai')`,
        [c.id, id, `_TEST ${id}.pdf`]);
    }
    const claire = c.demandes!.find((d) => d.destinataireLibelle === 'Claire Test')!;
    ENVOIS_FACTICES.length = 0;
    expect(await envoyerDemande(claire.demandeId, claire.jeton!, transportFactice, new Date(), lecteur)).toBe('factice');
    const m = ENVOIS_FACTICES[0];
    expect(m.a).toEqual(['c@criterimmo.fr']);
    expect(m.objet).toMatch(/^Tâche à accepter — /);
    expect(m.corps).toContain('Service Gestion — CRITERIMMO / Sans Vis-à-Vis');
    expect(m.corps).toContain('Invitation envoyée par Arno Jorel');
    expect(m.corps).toContain('DATE DE LA MISSION : MERCREDI 21 OCTOBRE 2026 — 14 h 30 (1 h)');
    expect(m.corps).toContain('Apporter le plan');
    expect(m.corps).toContain('Vous êtes 3 invités : Claire Test, Emma Essai, Gaspard Essai.');
    expect(m.corps).toContain(`/tache/reponse?j=${encodeURIComponent(claire.jeton!)}&d=accepter`);
    expect(m.pieces?.map((p) => p.nom)).toEqual(['_TEST drive-leger-1.pdf', '_TEST drive-leger-2.pdf']);
    expect(m.corpsHtml).toContain('font-size:26px');

    expect((await repondreDemande({ jeton: claire.jeton!, decision: 'accepter', utilisateur: null, nom: null, identiteParJeton: true })).ok).toBe(true);
    const emma = c.demandes!.find((d) => d.destinataireLibelle === 'Emma Essai')!;
    // Emma n'a jamais reçu de mail (sa demande est « aucun ») : pas de récapitulatif pour elle.
    ENVOIS_FACTICES.length = 0;
    expect(await envoyerRecapitulatif(claire.demandeId, 'ajoutee', transportFactice, lecteur)).toBe('factice');
    const r = ENVOIS_FACTICES[0];
    expect(r.objet).toMatch(/^Tâche acceptée — /);
    expect(r.messageId).toMatch(/^<tache-acceptation\./); // la relève ne le rattache jamais à un bien
    expect(r.corps).toContain('Claire Test (vous) : ✓ Acceptée');
    expect(r.corps).toContain('Emma Essai : ⏳ En attente');
    expect(r.corps).toContain('Tâche acceptée, ajoutée à votre agenda.');
    expect(r.corps).not.toContain('Accepter :');
    expect(await envoyerRecapitulatif(emma.demandeId, 'ajoutee', transportFactice, lecteur)).toBeNull();
    const traces = (await lireTache(c.id))!.traces.map((x) => x.apres as Record<string, unknown> | null);
    expect(traces).toContainEqual({ recapitulatif: 'Claire Test', etat: 'factice' });
  });

  it('pièce lourde : un LIEN signé (aucune pièce jointe) ; il marche, puis cesse après un renvoi', async () => {
    const c = await creerTache(lot, saisie({ confieeA: FELIX, invites: [] }), MOI);
    if (!c.ok) throw new Error(c.motif);
    await query(`INSERT INTO gestion_tache_piece (tache_id, drive_fichier_id, nom, type_mime, ajoute_par_libelle) VALUES ($1, 'drive-lourd', '_TEST lourd.pdf', 'application/pdf', 'essai')`, [c.id]);
    const d = c.demandes![0];
    ENVOIS_FACTICES.length = 0;
    expect(await envoyerDemande(d.demandeId, d.jeton!, transportFactice, new Date(), lecteur)).toBe('factice');
    const m = ENVOIS_FACTICES[0];
    expect(m.pieces ?? []).toHaveLength(0);
    const lien = /_TEST lourd\.pdf — à télécharger : (\S+)/.exec(m.corps)?.[1] ?? '';
    expect(lien).toMatch(/\/api\/tache\/piece\?j=/);
    const j = decodeURIComponent(new URL(lien).searchParams.get('j') ?? '');
    expect(await ouvrirPieceSignee(j, lecteur)).toMatchObject({ ok: true, nom: 'drive-lourd.pdf' });
    expect(await ouvrirPieceSignee(`${j.slice(0, -2)}xx`, lecteur)).toMatchObject({ ok: false, statut: 410 });
    const felix = (await lireTache(c.id))!.tache.invites![0];
    const { renvoyerInvitation: renvoyer } = await import('./invitesRepo');
    expect((await renvoyer(c.id, felix.inviteId, MOI)).ok).toBe(true);
    expect(await ouvrirPieceSignee(j, lecteur)).toMatchObject({ ok: false, statut: 410 });
  });
});
