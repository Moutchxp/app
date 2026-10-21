/**
 * ══ 🔴🔴 TUILE LOCATION — « BIEN EN GESTION ? » PROPRE À CHAQUE BIEN (Arno, 20/10/2026), SUR UNE BASE JETABLE ══════════════
 *
 *   ① AVANT la migration 390 : le code tourne — un bien « en gestion » se crée comme avant, un bien « hors gestion » est
 *      refusé (`sans_schema`, rien n'est écrit : jamais un « Non » perdu en silence) ; aucune carte ne se dit hors gestion ;
 *   ② la migration 390 : tous les biens EXISTANTS sont « en gestion » (valeur par défaut), aucun autre changement ;
 *   ③ APRÈS : « Non » est enregistré sur le BIEN et ses annexes (pas sur le propriétaire), journalisé, et lu par la carte
 *      du bien (fiche propriétaire) et l'en-tête de la fiche du bien ; « Oui » reste « en gestion » ; réponse vide refusée.
 *
 * VRAIES fonctions, VRAIE base : schéma de `svav_recette` copié, vide, SANS la colonne `en_gestion` du lot.
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou `svav_test…` (elle y applique la migration 390).
 *   createdb svav_jetable_bien_gestion && pg_dump -s -O -x -T mns_lidar_brut -T mnt_lidar_brut -T rge_alti \
 *     -T analyse_sans_lidar svav_recette | psql -q -d svav_jetable_bien_gestion
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_bien_gestion \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/bienEnGestion.itest.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ficheLot, ficheProprietaire } from '../gestion/annuaireRepo';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { oublierSchemaLocation } from './sondeLocation';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest bien en gestion' };
const S = `g${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const parking = (adresse: string) => ({ adresse, famille: 'parking', parkingType: 'box_simple' });
const logement = (adresse: string) => ({ adresse, famille: 'logement', typeLogement: 'studio', dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false });
const colonneLot = async (): Promise<boolean> => (await query<{ n: number }>(
  `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'en_gestion'`)).rows[0].n > 0;

describe.skipIf(!baseEssai)('🔴 « Bien en gestion ? » — enregistré sur le bien, avant et après la migration 390', () => {
  let proprietaire = 0;
  let avant: number[] = [];

  it('⓪ la base d’essai n’a pas encore la colonne (sinon l’épreuve « avant » n’aurait pas de sens)', async () => {
    expect(await colonneLot()).toBe(false);
    oublierSchemaLocation();
    proprietaire = ok(await creerProprietaires({ cartes: [{ nom: `GESTION${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 22 33 44 77', libelle: 'Mobile' }, { sorte: 'email', valeur: `gestion.${S}@exemple.test`, libelle: 'E-mail' }] }],
      enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
  });

  it('① AVANT : « Oui » (et un appel sans réponse, d’avant ce lot) créent le bien comme avant ; « Non » refusé, rien d’écrit', async () => {
    const lots = async () => Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n);
    const n0 = await lots();
    expect((await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [], logement: parking(`1 rue Avant${S}`), enGestion: false }, AUTEUR)).etat).toBe('sans_schema');
    expect(await lots()).toBe(n0);
    const oui = ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [], logement: parking(`2 rue Avant${S}`), enGestion: true }, AUTEUR));
    const ancien = ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [], logement: parking(`3 rue Avant${S}`) }, AUTEUR));
    avant = [oui.logementId, ancien.logementId];
    expect(await lots()).toBe(n0 + 2);
    // Les écrans tournent sans la colonne : aucune carte ne se dit « hors gestion ».
    const f = ok(await ficheProprietaire(proprietaire));
    expect(f.biens.filter((b) => avant.includes(b.id)).map((b) => b.horsGestion)).toEqual([false, false]);
    expect(ok(await ficheLot(avant[0])).horsGestion).toBe(false);
  });

  it('② la migration 390 : chaque bien existant est « en gestion », sans autre changement', async () => {
    const instantane = async () => (await query<{ id: string; ligne: string }>(
      `SELECT id::text, (to_jsonb(lo) - 'en_gestion')::text AS ligne FROM gestion_annuaire_lot lo ORDER BY id`)).rows;
    const t0 = await instantane();
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/390_location_bien_en_gestion.sql'), 'utf8'));
    oublierSchemaLocation();
    expect(await colonneLot()).toBe(true);
    const { rows } = await query<{ total: number; en_gestion: number; nuls: number }>(
      'SELECT count(*)::int AS total, count(*) FILTER (WHERE en_gestion)::int AS en_gestion, count(*) FILTER (WHERE en_gestion IS NULL)::int AS nuls FROM gestion_annuaire_lot');
    expect(rows[0].total).toBeGreaterThanOrEqual(2);
    expect(rows[0]).toEqual({ total: rows[0].total, en_gestion: rows[0].total, nuls: 0 });
    expect(await instantane()).toEqual(t0);
    // Rejouée : rien ne bouge (idempotente).
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/390_location_bien_en_gestion.sql'), 'utf8'));
    expect(await instantane()).toEqual(t0);
  });

  it('③ APRÈS : « Non » enregistré sur le bien ET ses annexes, journalisé ; le propriétaire ne change pas ; la carte le dit', async () => {
    const proprio = async () => (await query<{ g: boolean | null }>('SELECT en_gestion AS g FROM gestion_annuaire_proprietaire WHERE id = $1', [proprietaire])).rows[0].g;
    expect(await proprio()).toBe(true);
    const non = ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [{ categorie: 'cave', etage: '-1' }],
      logement: logement(`4 rue Apres${S}`), enGestion: false }, AUTEUR));
    const { rows } = await query<{ id: string; en_gestion: boolean }>('SELECT id::text, en_gestion FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) ORDER BY id',
      [[non.logementId, ...non.annexes]]);
    expect(rows.map((r) => r.en_gestion)).toEqual([false, false]);
    expect(await proprio()).toBe(true);
    const j = await query<{ commentaire: string }>(`SELECT commentaire FROM gestion_journal WHERE entite = 'annuaire_lot' AND entite_id = $1 AND action = 'location_bien_cree'`, [non.logementId]);
    expect(j.rows[0]?.commentaire).toMatch(/, bien en gestion : non$/);

    const oui = ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [], logement: parking(`5 rue Apres${S}`), enGestion: true }, AUTEUR));
    expect((await query<{ g: boolean }>('SELECT en_gestion AS g FROM gestion_annuaire_lot WHERE id = $1', [oui.logementId])).rows[0].g).toBe(true);
    expect((await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [], logement: parking(`6 rue Apres${S}`), enGestion: null }, AUTEUR)))
      .toEqual({ etat: 'refus', motif: 'Statut du bien : choisissez « En gestion » ou « Location seule ».' });

    // La carte du bien (fiche propriétaire, Gestion ET Location) et l'en-tête de la fiche du bien.
    const f = ok(await ficheProprietaire(proprietaire));
    const carte = (id: number) => f.biens.find((b) => b.id === id)?.horsGestion;
    expect([carte(non.logementId), carte(oui.logementId), carte(avant[0]), carte(avant[1])]).toEqual([true, false, false, false]);
    expect(ok(await ficheLot(non.logementId)).horsGestion).toBe(true);
    expect(ok(await ficheLot(oui.logementId)).horsGestion).toBe(false);
    // « Hors gestion » n'est PAS une sortie de gestion : le bien reste avec les biens en cours de la fiche.
    expect(f.biens.find((b) => b.id === non.logementId)?.fin).toBeNull();
  });
});
