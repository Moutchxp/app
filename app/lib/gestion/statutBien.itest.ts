/**
 * ══ 🔴🔴 LE STATUT DU BIEN — EN GESTION · ANCIENNE GESTION · LOCATION SEULE (Arno, 21/10/2026, migration 403) ══════════════════
 *
 *   ① un propriétaire aux TROIS statuts (créés par « Nouveau bien », le statut déduit et journalisé « création ») ;
 *   ② chaque transition, dans les deux sens, avec un BAIL en cours et des ANNEXES : la rattachée suit, la détachée non ; le bail
 *      n'est pas touché ; les refus (transition interdite, annexe rattachée, date future) n'écrivent RIEN ;
 *   ③ la sortie de gestion vers CHACUNE des deux destinations ;
 *   ④ la base refuse un statut changé sans sa ligne au journal, et le journal refuse modification et effacement ;
 *   ⑤ les MAILS du bien sont conservés : mêmes rattachements, octet pour octet, après les transitions ;
 *   ⑥ le mail « nouveau mandat » se décide sur le statut du BIEN.
 *
 * VRAIES fonctions, VRAIE base — une COPIE jetable de la recette avec la 403 appliquée. 🔒 REFUSE de tourner ailleurs que sur
 * une base `svav_jetable…` ou `svav_test…`, et se met de côté si la 403 n'y est pas.
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_statut403 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/statutBien.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerBienComplet, creerProprietaires } from '../location/creationBienRepo';
import { notifierPortefeuille } from '../location/mailPortefeuilleRepo';
import type { TransportDemande } from './envoiDemandeTache';
import { changerStatutBien, lireStatutBien, sqlStatutBien, transitionsDuBien } from './statutBienRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest statut du bien' };
const S = `s${Date.now().toString(36)}`;
const DPE_ENTRETIEN = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const tel = (v: string) => ({ sorte: 'telephone' as const, valeur: v, libelle: 'Mobile' });
afterAll(async () => { if (baseEssai) await closePool(); });

let avec403 = false;
beforeAll(async () => {
  if (!baseEssai) return;
  const { rows } = await query<{ c: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'statut_bien') AS c`);
  avec403 = rows[0]?.c === true;
});

const statutDe = async (id: number): Promise<string> => (await query<{ s: string }>('SELECT statut_bien AS s FROM gestion_annuaire_lot WHERE id = $1', [id])).rows[0].s;
const transition = (id: number, vers: string, effetLe = '2026-10-21', extra: Record<string, unknown> = {}) =>
  changerStatutBien(id, { vers, effetLe, ...extra }, AUTEUR, new Date('2026-10-21T10:00:00Z'));

describe.skipIf(!baseEssai)('🔴🔴 le statut du bien (403)', () => {
  let proprietaire = 0;
  let enGestion = 0;
  let cave = 0;
  let parkingDetache = 0;
  let locationSeule = 0;
  let troisieme = 0;
  let bail = 0;

  it('① un propriétaire aux trois statuts : créés en gestion / location seule, puis l’un sorti en ancienne gestion', async () => {
    if (!avec403) return;
    proprietaire = ok(await creerProprietaires({ cartes: [{ nom: `STATUT${S}`, coordonnees: [tel('06 03 03 03 03'), { sorte: 'email' as const, valeur: `statut.${S}@exemple.test`, libelle: 'E-mail' }] }], enGestion: true, numeroMandat: `MG0 ${S}` }, AUTEUR)).ids[0];
    const a = ok(await creerBienComplet({ proprietaireIds: [proprietaire], enGestion: true,
      logement: { adresse: `1 rue Statut${S}`, ...DPE_ENTRETIEN, famille: 'logement', typeLogement: 'appartement' },
      annexes: [{ categorie: 'cave', porte: '3' }, { categorie: 'parking', parkingType: 'box_simple', detachee: true }] }, AUTEUR));
    enGestion = a.logementId;
    [cave, parkingDetache] = a.annexes;
    locationSeule = ok(await creerBienComplet({ proprietaireIds: [proprietaire], enGestion: false,
      logement: { adresse: `2 rue Statut${S}`, ...DPE_ENTRETIEN, famille: 'logement', typeLogement: 'appartement' }, annexes: [] }, AUTEUR)).logementId;
    troisieme = ok(await creerBienComplet({ proprietaireIds: [proprietaire], enGestion: true,
      logement: { adresse: `3 rue Statut${S}`, ...DPE_ENTRETIEN, famille: 'logement', typeLogement: 'appartement' }, annexes: [] }, AUTEUR)).logementId;
    expect([await statutDe(enGestion), await statutDe(cave), await statutDe(parkingDetache), await statutDe(locationSeule), await statutDe(troisieme)])
      .toEqual(['en_gestion', 'en_gestion', 'en_gestion', 'location_seule', 'en_gestion']);
    expect((await transitionsDuBien(locationSeule)).map((t) => [t.avant, t.apres, t.source])).toEqual([[null, 'location_seule', 'creation']]);
    ok(await transition(troisieme, 'ancienne_gestion', '2026-10-01', { motif: 'fin du mandat' }));
    const { rows } = await query<{ s: string; n: number }>(
      `SELECT statut_bien AS s, count(*)::int AS n FROM gestion_annuaire_lot WHERE proprietaire_id = $1 GROUP BY 1 ORDER BY 1`, [proprietaire]);
    expect(rows).toEqual([{ s: 'ancienne_gestion', n: 1 }, { s: 'en_gestion', n: 3 }, { s: 'location_seule', n: 1 }]);
    // L'expression partagée dit la même chose que la colonne.
    const { rows: e } = await query<{ s: string }>(`SELECT ${await sqlStatutBien('lo')} AS s FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [troisieme]);
    expect(e[0].s).toBe('ancienne_gestion');
  });

  it('② transitions dans les DEUX sens, avec un bail et des annexes : la rattachée suit, la détachée garde le sien, le bail ne bouge pas', async () => {
    if (!avec403) return;
    bail = Number((await query<{ id: string }>(`INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, '2026-01-01') RETURNING id::text`, [enGestion])).rows[0].id);
    const bailAvant = (await query('SELECT lot_id, entree::text, sortie FROM gestion_bail WHERE id = $1', [bail])).rows;
    // En gestion → location seule (sortie de gestion), et retour : location seule → en gestion.
    const s1 = ok(await transition(enGestion, 'location_seule', '2026-10-20', { motif: 'mandat de gestion résilié' }));
    expect(s1).toMatchObject({ avant: 'en_gestion', apres: 'location_seule', lots: [enGestion, cave] });
    expect([await statutDe(enGestion), await statutDe(cave), await statutDe(parkingDetache)]).toEqual(['location_seule', 'location_seule', 'en_gestion']);
    expect(ok(await transition(enGestion, 'en_gestion'))).toMatchObject({ avant: 'location_seule', apres: 'en_gestion', lots: [enGestion, cave] });
    // En gestion → ancienne gestion, puis ancienne gestion → en gestion (Reprendre) ; puis → ancienne → location seule (Remettre).
    ok(await transition(enGestion, 'ancienne_gestion'));
    expect(await statutDe(cave)).toBe('ancienne_gestion');
    ok(await transition(enGestion, 'en_gestion'));
    ok(await transition(enGestion, 'ancienne_gestion'));
    ok(await transition(enGestion, 'location_seule'));
    expect([await statutDe(enGestion), await statutDe(cave)]).toEqual(['location_seule', 'location_seule']);
    ok(await transition(enGestion, 'en_gestion'));
    // L'annexe détachée a SON statut : elle a ses propres gestes.
    expect((await lireStatutBien(parkingDetache))?.gestes.map((g) => g.cle)).toEqual(['sortie-de-gestion']);
    expect((await lireStatutBien(cave))).toMatchObject({ suitLot: { id: enGestion }, gestes: [] });
    expect((await query('SELECT lot_id, entree::text, sortie FROM gestion_bail WHERE id = $1', [bail])).rows).toEqual(bailAvant);
    // Le journal : chaque geste sur le bien, chaque suivi sur la cave (via le bien) ; et l'Historique de la fiche.
    expect((await transitionsDuBien(enGestion)).filter((t) => t.source === 'geste').map((t) => `${t.avant}>${t.apres}`).reverse()).toEqual([
      'en_gestion>location_seule', 'location_seule>en_gestion', 'en_gestion>ancienne_gestion', 'ancienne_gestion>en_gestion',
      'en_gestion>ancienne_gestion', 'ancienne_gestion>location_seule', 'location_seule>en_gestion']);
    expect((await transitionsDuBien(cave)).filter((t) => t.source === 'annexe').every((t) => t.viaLotId === enGestion)).toBe(true);
    const { rows: j } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal WHERE entite = 'annuaire_lot' AND entite_id = $1 AND action = 'location_statut_bien'`, [cave]);
    expect(j[0].n).toBe(7);
  });

  it('② les refus n’écrivent RIEN : transition interdite, annexe rattachée, date future, destination absente', async () => {
    if (!avec403) return;
    const avant = (await transitionsDuBien(locationSeule)).length;
    expect(await transition(locationSeule, 'ancienne_gestion')).toEqual({ etat: 'refus', motif: 'Transition impossible : « Location seule » → « Ancienne gestion ».' });
    expect(await transition(locationSeule, 'en_gestion', '2026-10-22')).toEqual({ etat: 'refus', motif: 'La date d’effet ne peut pas être dans le futur : le statut change aujourd’hui.' });
    expect(await transition(locationSeule, null as unknown as string)).toMatchObject({ etat: 'refus' });
    expect(await transition(cave, 'location_seule')).toEqual({ etat: 'refus', motif: `Cette annexe suit son bien principal (bien ${enGestion}) : changez le statut de ce bien-là.` });
    expect((await transitionsDuBien(locationSeule)).length).toBe(avant);
    expect(await statutDe(locationSeule)).toBe('location_seule');
  });

  it('③ sortie de gestion vers CHACUNE des destinations ; « Passer en gestion » enregistre le mandat proposé', async () => {
    if (!avec403) return;
    expect(ok(await transition(locationSeule, 'en_gestion', '2026-10-21', { mandat: { sorte: 'gestion', numero: `MG ${S}`, signeLe: '2026-10-15' } })).avertissement).toBeNull();
    const { rows: m } = await query<{ n: string | null }>('SELECT numero_mandat_gestion AS n FROM gestion_annuaire_proprietaire WHERE id = $1', [proprietaire]);
    expect(m[0].n).toBe(`MG ${S}`);
    expect((await transitionsDuBien(locationSeule))[0].mandat).toBe(`Mandat de gestion n° MG ${S}, signé le 15/10/2026`);
    expect(ok(await transition(locationSeule, 'ancienne_gestion'))).toMatchObject({ apres: 'ancienne_gestion' });
    ok(await transition(locationSeule, 'en_gestion'));
    expect(ok(await transition(locationSeule, 'location_seule', '2026-10-21', { mandat: { sorte: 'transaction', numero: `MT ${S}`, signeLe: null } }))).toMatchObject({ apres: 'location_seule' });
    // Un mandat d'une autre sorte que celle proposée est ignoré (rien d'écrit).
    ok(await transition(locationSeule, 'en_gestion', '2026-10-21', { mandat: { sorte: 'transaction', numero: 'IGNORÉ', signeLe: null } }));
    const { rows: t } = await query<{ n: string | null }>('SELECT numero_mandat_transaction AS n FROM gestion_annuaire_proprietaire WHERE id = $1', [proprietaire]);
    expect(t[0].n).toBe(`MT ${S}`);
  });

  it('④ la base refuse un statut sans sa ligne au journal ; le journal est en ajout seul', async () => {
    if (!avec403) return;
    await expect(query(`UPDATE gestion_annuaire_lot SET statut_bien = 'location_seule' WHERE id = $1`, [enGestion])).rejects.toThrow(/transition journalisée/);
    await expect(query('DELETE FROM gestion_bien_statut_transition WHERE lot_id = $1', [enGestion])).rejects.toThrow(/ajout seul/);
    await expect(query(`UPDATE gestion_bien_statut_transition SET motif = 'x' WHERE lot_id = $1`, [enGestion])).rejects.toThrow(/ajout seul/);
  });

  it('⑤ les MAILS du bien sont conservés : mêmes rattachements, octet pour octet, après des transitions', async () => {
    if (!avec403) return;
    const { rows: lots } = await query<{ id: string; cle: string }>(
      `SELECT lo.id::text, lo.wippimmo_id AS cle FROM gestion_annuaire_lot lo
        WHERE lo.statut_bien = 'en_gestion' AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id)
          AND EXISTS (SELECT 1 FROM gestion_rattachement r WHERE r.cible_sorte = 'lot' AND r.cible_cle = lo.wippimmo_id)
        ORDER BY (SELECT count(*) FROM gestion_rattachement r WHERE r.cible_cle = lo.wippimmo_id) DESC LIMIT 1`);
    if (lots.length === 0) return;
    const id = Number(lots[0].id);
    const empreinte = async () => (await query<{ e: string; n: number }>(
      `SELECT md5(string_agg(r::text, '|' ORDER BY r.id)) AS e, count(*)::int AS n FROM gestion_rattachement r WHERE r.cible_cle = $1`, [lots[0].cle])).rows[0];
    const avant = await empreinte();
    expect(avant.n).toBeGreaterThan(0);
    ok(await transition(id, 'location_seule'));
    ok(await transition(id, 'en_gestion'));
    ok(await transition(id, 'ancienne_gestion'));
    expect(await empreinte()).toEqual(avant);
    ok(await transition(id, 'en_gestion'));
  });

  it('⑥ le mail « nouveau mandat » : bien en location seule → ignoré ; bien en gestion → envoyé (statut du BIEN, pas du propriétaire)', async () => {
    if (!avec403) return;
    const envoyes: unknown[] = [];
    const releve = { envoyer: async (m: unknown) => { envoyes.push(m); return { ok: true, messageId: 'x' }; } } as unknown as TransportDemande;
    ok(await transition(locationSeule, 'location_seule'));
    await query('UPDATE gestion_annuaire_proprietaire SET en_gestion = true WHERE id = $1', [proprietaire]);
    const non = await notifierPortefeuille({ sens: 'entree', proprietaireId: null, lotIds: [locationSeule], origine: null, exigerEnGestion: true },
      { auteur: AUTEUR, tuile: 'Location' }, { transport: releve });
    expect(non).toMatchObject({ envoye: false, ignore: true });
    await query('UPDATE gestion_annuaire_proprietaire SET en_gestion = false WHERE id = $1', [proprietaire]);
    const oui = await notifierPortefeuille({ sens: 'entree', proprietaireId: null, lotIds: [enGestion], origine: null, exigerEnGestion: true },
      { auteur: AUTEUR, tuile: 'Location' }, { transport: releve });
    expect(oui.ignore).not.toBe(true);
  });
});
