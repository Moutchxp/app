/**
 * ══ 🔴 « PAIEMENT DES CHARGES » DE COPROPRIÉTÉ (Arno, 21/10/2026, migration 400), SUR UNE COPIE DE LA RECETTE ══════════════════
 *   ⓪ SANS la 400 : un choix n'est jamais perdu en silence (`sans_schema`), un bien sans choix se crée comme avant ;
 *   ① la 400 appliquée (deux fois : rejouable) ; ② choix enregistré à la création et relu (trois familles) ; ③ modifié depuis la
 *   fiche, puis vidé ; une autre valeur refusée par la base elle-même.
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`). REFUSE de tourner ailleurs que sur une base `svav_test…` :
 *   createdb svav_test_charges400 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_charges400
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_charges400 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/chargesCopro.itest.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { oublierSchema } from '../gestion/schema';
import { complementsDuBien, creerBienComplet, creerProprietaires, modifierComplementsBien } from './creationBienRepo';
import { oublierSchemaLocation } from './sondeLocation';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const S = `c${Date.now().toString(36)}`;
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const oublier = (): void => { oublierSchemaLocation(); oublierSchema(); };
const MIGRATION = readFileSync(path.join(process.cwd(), 'db/migrations/400_location_charges_copro.sql'), 'utf8');

let essai: EssaiAnnule | null = null;
beforeAll(async () => { if (baseEssai) essai = await ouvrirEssaiAnnule(); });
afterAll(async () => { if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴 migration 400 — « Paiement des charges » de copropriété', () => {
  let proprio = 0;
  const saisie = (famille: 'logement' | 'local' | 'parking', chargesCopro?: string) => ({
    proprietaireIds: [proprio], annexes: [],
    logement: { adresse: `7 rue Charges ${S}`, codePostal: '92400', commune: 'COURBEVOIE', famille,
      ...(famille === 'logement' ? { typeLogement: 'studio' } : famille === 'local' ? { typeLocal: 'bureaux' } : { parkingType: 'box_simple' }),
      ...(famille === 'parking' ? {} : { dpeClasse: 'D', dpeDate: '2024-01-01', entretienAPrevoir: false }),
      ...(chargesCopro === undefined ? {} : { chargesCopro }) },
  });

  it('⓪ sans la 400 : un choix → sans_schema (rien n’est créé) ; sans choix → le bien se crée comme avant', async () => {
    const col = await query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'charges_copro'`);
    expect(col.rows).toEqual([]);
    oublier();
    proprio = ok(await creerProprietaires({ cartes: [{ nom: `CHARGES${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 42 53 64 77', libelle: 'Mobile' },
      { sorte: 'email', valeur: `charges.${S}@exemple.test`, libelle: 'E-mail' }] }], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
    expect(await creerBienComplet(saisie('logement', 'agence'), AUTEUR)).toEqual({ etat: 'sans_schema' });
    const id = ok(await creerBienComplet(saisie('logement'), AUTEUR)).logementId;
    expect((await complementsDuBien(id))?.chargesCopro).toBeUndefined();
  });

  it('① la 400 appliquée deux fois (rejouable) ; ② choix enregistré à la création et relu, pour les trois familles', async () => {
    await query(MIGRATION);
    await query(MIGRATION);
    oublier();
    for (const [famille, valeur] of [['logement', 'agence'], ['local', 'proprietaire'], ['parking', 'agence']] as const) {
      const id = ok(await creerBienComplet(saisie(famille, valeur), AUTEUR)).logementId;
      expect((await complementsDuBien(id))?.chargesCopro, famille).toBe(valeur);
    }
    const sans = ok(await creerBienComplet(saisie('logement'), AUTEUR)).logementId;
    expect((await complementsDuBien(sans))?.chargesCopro).toBeNull();
  });

  it('③ modifié depuis la fiche, puis vidé ; un envoi sans le champ n’y touche pas ; une autre valeur refusée par la base', async () => {
    const id = ok(await creerBienComplet(saisie('logement', 'agence'), AUTEUR)).logementId;
    const c = (await complementsDuBien(id))!;
    ok(await modifierComplementsBien(id, { ...c, chargesCopro: 'proprietaire' }, AUTEUR));
    expect((await complementsDuBien(id))?.chargesCopro).toBe('proprietaire');
    const { chargesCopro: _ignore, ...sansChamp } = (await complementsDuBien(id))!;
    ok(await modifierComplementsBien(id, { ...sansChamp, commentaire: 'autre chose' }, AUTEUR));
    expect((await complementsDuBien(id))?.chargesCopro).toBe('proprietaire');
    ok(await modifierComplementsBien(id, { ...(await complementsDuBien(id))!, chargesCopro: '' }, AUTEUR));
    expect((await complementsDuBien(id))?.chargesCopro).toBeNull();
    expect(await modifierComplementsBien(id, { ...(await complementsDuBien(id))!, chargesCopro: 'syndic' }, AUTEUR)).toEqual({ etat: 'refus', motif: 'Paiement des charges : Propriétaire ou Agence.' });
    await expect(query(`UPDATE gestion_annuaire_lot SET charges_copro = 'syndic' WHERE id = $1`, [id])).rejects.toThrow(/charges_copro_chk/); // (chaque requête de l'essai a son propre point de sauvegarde)
  });
});
