/**
 * ══ 🔴🔴 LE DIGICODE PORTÉ PAR L'IMMEUBLE (Arno, 21/10/2026, migration 396), SUR UNE COPIE DE LA RECETTE ══════════════════
 *
 *   ① saisi sur l'IMMEUBLE (fiche immeuble / syndic) → visible sur TOUS les biens de l'adresse (formes d'adresse différentes) ;
 *   ② saisi sur UN BIEN → visible sur l'immeuble et les autres biens ; les colonnes du bien ne sont PAS écrites ;
 *   ③ modifié d'un côté → propagé partout ; ④ changement puis retrait du syndic → aucun effet sur le code ;
 *   ⑤ « Nouveau bien » à une adresse sans immeuble → l'immeuble est créé (adresse seule), AUCUNE copropriété (pas de fiche
 *      rose) ; ⑥ le journal (avant, après, qui, quand, depuis quelle fiche) ; ⑦ l'encart de sortie et le mail lisent l'immeuble ;
 *   ⑧ la reprise À BLANC : rien n'est écrit, le cas « à arbitrer » est rapporté.
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`) ; la 396 y est appliquée puis annulée.
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_test…`, copie de la recette SANS la 396 :
 *   createdb svav_test_digicode396 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_digicode396
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_digicode396 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/digicodeImmeuble.itest.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { oublierSchema } from '../gestion/schema';
import { complementsDuBien, creerBienComplet, creerProprietaires, modifierComplementsBien } from './creationBienRepo';
import { oublierSchemaLocation } from './sondeLocation';
import { enregistrerDigicode, executerRepriseDigicodes, lireDigicodeAdresse, lireDigicodeDuLot, texteRapportReprise } from './digicodeImmeubleRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const S = `g${Date.now().toString(36)}`;
const un = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T> => (await query<T>(sql, p)).rows[0];
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const compter = async (t: string): Promise<number> => (await un<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).n;
const carte = (nom: string, n: number) => ({ nom, coordonnees: [{ sorte: 'telephone' as const, valeur: `06 42 53 64 ${String(n).padStart(2, '0')}`, libelle: 'Mobile' },
  { sorte: 'email' as const, valeur: `${nom.toLowerCase()}.${n}@exemple.test`, libelle: 'E-mail' }] });

let essai: EssaiAnnule | null = null;
beforeAll(async () => { if (baseEssai) essai = await ouvrirEssaiAnnule(); });
afterAll(async () => { if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴🔴 migration 396 — le digicode porté par l’immeuble', () => {
  let proprio = 0;
  const bien = async (voie: string, cp = '92400', commune = 'COURBEVOIE', digicode: boolean | null = null, code = ''): Promise<number> => ok(await creerBienComplet({
    proprietaireIds: [proprio], annexes: [],
    logement: { adresse: voie, codePostal: cp, commune, famille: 'logement', typeLogement: 'appartement', dpeClasse: 'D', dpeDate: '2024-01-01', entretienAPrevoir: false,
      ...(digicode === null ? {} : { digicode, digicodeCode: code }) },
  }, AUTEUR)).logementId;
  const vu = async (lot: number) => { const c = await complementsDuBien(lot); return [c?.digicode ?? null, c?.digicodeCode ?? null]; };
  let a = 0; let b = 0; let autre = 0;

  it('⓪ la recette SANS la 396 ; la 396 appliquée dans la transaction ; deux biens au même immeuble (adresses écrites différemment), un ailleurs', async () => {
    expect((await un<{ t: string | null }>(`SELECT to_regclass('gestion_immeuble')::text AS t`)).t).toBeNull();
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/396_gestion_immeuble_digicode.sql'), 'utf8'));
    oublierSchemaLocation(); oublierSchema();
    proprio = ok(await creerProprietaires({ cartes: [carte(`IMMEUBLE${S}`, 1)], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
    a = await bien(`12 boulevard Essai ${S}`);
    b = await bien(`12  Bd ESSAI ${S.toUpperCase()}`, '92400', 'Courbevoie');
    autre = await bien(`14 boulevard Essai ${S}`);
    expect(await compter('gestion_immeuble')).toBe(0);
  });

  it('① saisi sur l’IMMEUBLE (fiche immeuble / syndic) : visible sur ses DEUX biens, pas sur l’immeuble voisin ; la mention compte les biens', async () => {
    const r = await enregistrerDigicode({ voie: `12 bd essai ${S}`, codePostal: '92400', commune: 'Courbevoie' }, { digicode: true, code: '57B83' }, AUTEUR, 'fiche_syndic');
    expect(r).toMatchObject({ ok: true, change: true });
    expect(await vu(a)).toEqual([true, '57B83']);
    expect(await vu(b)).toEqual([true, '57B83']);
    expect(await vu(autre)).toEqual([null, null]);
    expect((await complementsDuBien(a))?.digicodeImmeuble).toEqual({ mention: `Commun à tous les biens du 12 boulevard Essai ${S}, 92400 COURBEVOIE (2 biens)`, source: 'immeuble' });
  });

  it('② saisi sur UN BIEN : l’immeuble et l’autre bien le voient ; les colonnes du bien ne sont PAS écrites ; ③ propagé partout', async () => {
    const c = (await complementsDuBien(b))!;
    ok(await modifierComplementsBien(b, { ...c, digicode: true, digicodeCode: '9X41' }, AUTEUR));
    expect(await vu(a)).toEqual([true, '9X41']);
    expect(await vu(b)).toEqual([true, '9X41']);
    expect(await lireDigicodeAdresse({ voie: `12 boulevard Essai ${S}`, codePostal: '92400', commune: 'COURBEVOIE' })).toMatchObject({ digicode: true, code: '9X41', source: 'immeuble' });
    expect(await un('SELECT digicode, digicode_code AS code FROM gestion_annuaire_lot WHERE id = $1', [b])).toEqual({ digicode: null, code: null });
    // Deux fiches ne peuvent jamais montrer deux codes : il n'y a qu'une ligne, sur l'immeuble.
    expect(await compter('gestion_immeuble')).toBe(1);
    // Retour sur l'immeuble : « Non » se propage aussi.
    await enregistrerDigicode({ voie: `12 boulevard Essai ${S}`, codePostal: '92400', commune: 'Courbevoie' }, { digicode: false }, AUTEUR, 'fiche_syndic');
    expect(await vu(a)).toEqual([false, null]);
    expect(await vu(b)).toEqual([false, null]);
    await enregistrerDigicode({ voie: `12 boulevard Essai ${S}`, codePostal: '92400', commune: 'Courbevoie' }, { digicode: true, code: '57B83' }, AUTEUR, 'fiche_syndic');
  });

  it('④ changer de syndic, puis ne plus en avoir : le digicode ne bouge pas', async () => {
    const syndic = Number((await un<{ id: string }>('SELECT id::text FROM gestion_syndic WHERE supprime_le IS NULL ORDER BY id LIMIT 1')).id);
    const c = (await complementsDuBien(a))!;
    ok(await modifierComplementsBien(a, { ...c, syndicId: syndic }, AUTEUR));
    expect(await vu(a)).toEqual([true, '57B83']);
    ok(await modifierComplementsBien(a, { ...(await complementsDuBien(a))!, syndicId: null }, AUTEUR));
    expect(await vu(a)).toEqual([true, '57B83']);
    expect(await vu(b)).toEqual([true, '57B83']);
  });

  it('⑤ « Nouveau bien » à une adresse sans immeuble : l’immeuble est CRÉÉ (adresse seule, sans syndic) ; AUCUNE copropriété (pas de fiche rose)', async () => {
    const copros = await compter('gestion_copropriete');
    const n = await compter('gestion_immeuble');
    const neuf = await bien(`3 avenue Nouvelle ${S}`, '92400', 'COURBEVOIE', true, 'A123');
    expect(await compter('gestion_immeuble')).toBe(n + 1);
    expect(await compter('gestion_copropriete')).toBe(copros);
    expect(await un('SELECT voie, digicode, digicode_code AS code FROM gestion_immeuble ORDER BY id DESC LIMIT 1')).toEqual({ voie: `3 avenue Nouvelle ${S}`, digicode: true, code: 'A123' });
    expect(await un('SELECT digicode, digicode_code AS code FROM gestion_annuaire_lot WHERE id = $1', [neuf])).toEqual({ digicode: null, code: null });
    // Un bien saisi ensuite à la même adresse (écrite « av. ») hérite du code.
    expect(await vu(await bien(`3 av. NOUVELLE ${S}`))).toEqual([true, 'A123']);
  });

  it('⑥ le JOURNAL : ancien code, nouveau code, qui, quand, depuis quelle fiche ; ni modifiable ni effaçable', async () => {
    const { rows } = await query<{ ad: boolean | null; ac: string | null; pd: boolean | null; pc: string | null; depuis: string; par: string; lot: string | null }>(
      `SELECT j.avant_digicode AS ad, j.avant_code AS ac, j.apres_digicode AS pd, j.apres_code AS pc, j.depuis, j.auteur_libelle AS par, j.lot_id::text AS lot
         FROM gestion_immeuble_digicode_journal j JOIN gestion_immeuble i ON i.id = j.immeuble_id WHERE i.voie = $1 ORDER BY j.id`, [`12 bd essai ${S}`]);
    expect(rows.map((r) => [r.ad, r.ac, r.pd, r.pc, r.depuis, r.par])).toEqual([
      [null, null, true, '57B83', 'fiche_syndic', AUTEUR.libelle],
      [true, '57B83', true, '9X41', 'fiche_bien', AUTEUR.libelle],
      [true, '9X41', false, null, 'fiche_syndic', AUTEUR.libelle],
      [false, null, true, '57B83', 'fiche_syndic', AUTEUR.libelle],
    ]);
    expect(rows[1].lot).toBe(String(b));
    await expect(query('UPDATE gestion_immeuble_digicode_journal SET apres_code = $1', ['x'])).rejects.toThrow(/ne s'effacent jamais/);
    await expect(query('DELETE FROM gestion_immeuble WHERE voie = $1', [`12 bd essai ${S}`])).rejects.toThrow(/ne s'effacent jamais/);
  });

  it('⑦ lu par bien : l’immeuble d’abord ; sinon l’ANCIEN code du bien reste lisible (« bien »)', async () => {
    expect(await lireDigicodeDuLot(a)).toMatchObject({ digicode: true, code: '57B83', source: 'immeuble' });
    // Le bien d'essai 436 de la recette porte un ancien code ; son immeuble n'en a pas : l'ancien code reste lisible.
    expect(await lireDigicodeDuLot(436)).toMatchObject({ digicode: true, code: '57B83', source: 'bien' });
  });

  it('⑧ la reprise À BLANC : rien n’est écrit ; des codes différents à la même adresse vont dans « à arbitrer »', async () => {
    // Deux biens d'une même adresse avec des codes DIFFÉRENTS (anciennes colonnes, comme avant la 396).
    const x = await bien(`7 rue Arbitrage ${S}`); const y = await bien(`7 r ARBITRAGE ${S}`);
    await query('UPDATE gestion_annuaire_lot SET digicode = true, digicode_code = $2 WHERE id = $1', [x, '1111']);
    await query('UPDATE gestion_annuaire_lot SET digicode = true, digicode_code = $2 WHERE id = $1', [y, '2222']);
    const avant = [await compter('gestion_immeuble'), await compter('gestion_immeuble_digicode_journal')];
    const r = await executerRepriseDigicodes({ reel: false });
    expect([await compter('gestion_immeuble'), await compter('gestion_immeuble_digicode_journal')]).toEqual(avant);
    const arbitrer = r.aArbitrer.find((z) => z.adresse.startsWith(`7 rue Arbitrage ${S}`));
    expect(arbitrer).toMatchObject({ raison: 'codes différents à la même adresse', lots: [{ id: x, valeur: 'oui · code 1111' }, { id: y, valeur: 'oui · code 2222' }] });
    expect(r.repris.some((z) => z.adresse.startsWith('10 rue ESSAI ENCART logement') && z.valeur === 'oui · code 57B83')).toBe(true);
    expect(texteRapportReprise(r)).toMatch(/À BLANC \(rien n’est écrit\)[\s\S]*À ARBITRER/);
    // Les anciennes colonnes sont intactes, et lisibles.
    expect(await lireDigicodeDuLot(x)).toMatchObject({ code: '1111', source: 'bien' });
    expect(await lireDigicodeDuLot(y)).toMatchObject({ code: '2222', source: 'bien' });
  });
});
