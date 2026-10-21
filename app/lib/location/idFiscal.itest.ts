/**
 * ══ 🔴 « ID FISCAL DU BIEN » (Arno, 21/10/2026, migration 401), SUR UNE COPIE DE LA RECETTE ═══════════════════════════════════
 *   ⓪ SANS la 401 : une valeur n'est jamais perdue en silence (`sans_schema`), un bien sans valeur se crée comme avant ;
 *   ① la 401 appliquée (deux fois : rejouable) ; ② enregistrée à la création, espaces retirés, relue (trois familles) ;
 *   ③ modifiée depuis la fiche, puis vidée ; ④ JAMAIS sur une annexe (refus) ; les annexes créées avec le bien n'en ont pas.
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`). REFUSE de tourner ailleurs que sur une base `svav_test…` :
 *   createdb svav_test_idfiscal401 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_idfiscal401
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_idfiscal401 \
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
const S = `f${Date.now().toString(36)}`;
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const oublier = (): void => { oublierSchemaLocation(); oublierSchema(); };
const MIGRATION = readFileSync(path.join(process.cwd(), 'db/migrations/401_location_id_fiscal.sql'), 'utf8');

let essai: EssaiAnnule | null = null;
beforeAll(async () => { if (baseEssai) essai = await ouvrirEssaiAnnule(); });
afterAll(async () => { if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴 migration 401 — « ID fiscal du bien »', () => {
  let proprio = 0;
  const saisie = (famille: 'logement' | 'local' | 'parking', idFiscal?: string, annexes: Record<string, unknown>[] = []) => ({
    proprietaireIds: [proprio], annexes,
    logement: { adresse: `9 rue Fiscale ${S}`, codePostal: '92400', commune: 'COURBEVOIE', famille,
      ...(famille === 'logement' ? { typeLogement: 'studio' } : famille === 'local' ? { typeLocal: 'bureaux' } : { parkingType: 'box_simple' }),
      ...(famille === 'parking' ? {} : { dpeClasse: 'D', dpeDate: '2024-01-01', entretienAPrevoir: false }),
      ...(idFiscal === undefined ? {} : { idFiscal }) },
  });
  const lu = async (id: number) => (await query<{ v: string | null }>('SELECT id_fiscal AS v FROM gestion_annuaire_lot WHERE id = $1', [id])).rows[0]?.v;

  it('⓪ sans la 401 : une valeur → sans_schema (rien n’est créé) ; sans valeur → le bien se crée comme avant', async () => {
    expect((await query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'id_fiscal'`)).rows).toEqual([]);
    oublier();
    proprio = ok(await creerProprietaires({ cartes: [{ nom: `FISCAL${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 42 53 64 78', libelle: 'Mobile' },
      { sorte: 'email', valeur: `fiscal.${S}@exemple.test`, libelle: 'E-mail' }] }], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
    expect(await creerBienComplet(saisie('logement', '921234567890'), AUTEUR)).toEqual({ etat: 'sans_schema' });
    const id = ok(await creerBienComplet(saisie('logement', '   '), AUTEUR)).logementId;
    expect((await complementsDuBien(id))?.idFiscal).toBeUndefined();
  });

  it('① la 401 appliquée deux fois (rejouable) ; ② enregistrée à la création, espaces retirés, relue — trois familles', async () => {
    await query(MIGRATION);
    await query(MIGRATION);
    oublier();
    for (const famille of ['logement', 'local', 'parking'] as const) {
      const id = ok(await creerBienComplet(saisie(famille, ' 92 1234 5678 90 '), AUTEUR)).logementId;
      expect(await lu(id), famille).toBe('921234567890');
      expect((await complementsDuBien(id))?.idFiscal, famille).toBe('921234567890');
    }
    // Facultatif, et l'avertissement « 12 chiffres » ne bloque pas.
    const court = ok(await creerBienComplet(saisie('logement', '9212'), AUTEUR)).logementId;
    expect(await lu(court)).toBe('9212');
    const sans = ok(await creerBienComplet(saisie('logement'), AUTEUR)).logementId;
    expect((await complementsDuBien(sans))?.idFiscal).toBeNull();
  });

  it('③ modifiée depuis la fiche, puis vidée ; un envoi sans le champ n’y touche pas', async () => {
    const id = ok(await creerBienComplet(saisie('logement', '921234567890'), AUTEUR)).logementId;
    ok(await modifierComplementsBien(id, { ...(await complementsDuBien(id))!, idFiscal: '75 0000 0000 01' }, AUTEUR));
    expect(await lu(id)).toBe('750000000001');
    const { idFiscal: _ignore, ...sansChamp } = (await complementsDuBien(id))!;
    ok(await modifierComplementsBien(id, { ...sansChamp, commentaire: 'autre chose' }, AUTEUR));
    expect(await lu(id)).toBe('750000000001');
    ok(await modifierComplementsBien(id, { ...(await complementsDuBien(id))!, idFiscal: '' }, AUTEUR));
    expect(await lu(id)).toBeNull();
  });

  it('④ JAMAIS sur une annexe : les annexes créées avec le bien n’en ont pas ; en poser une est refusé', async () => {
    const b = ok(await creerBienComplet(saisie('logement', '921234567890', [{ categorie: 'cave', etage: '-1', porte: '3' }]), AUTEUR));
    expect(await lu(b.logementId)).toBe('921234567890');
    const cave = b.annexes[0];
    expect(await lu(cave)).toBeNull();
    const r = await modifierComplementsBien(cave, { ...(await complementsDuBien(cave))!, idFiscal: '921234567891' }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'L’ID fiscal se saisit sur le bien principal, jamais sur une annexe.' });
    expect(await lu(cave)).toBeNull();
  });
});
