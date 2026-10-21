/**
 * ══ 🔴🔴 UN DIGICODE PAR BÂTIMENT (Arno, 21/10/2026, migration 399), SUR UNE COPIE DE LA RECETTE ═════════════════════════════
 *
 *   ① deux bâtiments à la même adresse, deux codes ; « Bât. B » / « B » / « bâtiment b » = le même bâtiment ;
 *   ② un bien sans bâtiment → le code général ; un bâtiment sans code → le code général, avec la mention ;
 *   ③ modifié depuis un bien → propagé aux SEULS biens du même bâtiment ; le code général se modifie à part ;
 *   ④ changement de syndic → aucun effet ; ⑤ le journal (bâtiment compris) ; les codes déjà portés par l'immeuble deviennent
 *      son code général, rien n'est supprimé ; ⑥ le mail « Nouvelle location » : le code du bâtiment du logement, et celui
 *      d'une annexe seulement si son bâtiment diffère.
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`) ; la 399 y est appliquée (deux fois : rejouable) puis annulée.
 * 🔒 AUCUN ENVOI, AUCUN DRIVE. REFUSE de tourner ailleurs que sur une base `svav_test…`, copie de la recette AVEC la 396 et SANS la 399 :
 *   createdb svav_test_digicode399 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_digicode399
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_digicode399 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/digicodeBatiment.itest.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { oublierSchema } from '../gestion/schema';
import { complementsDuBien, creerBienComplet, creerProprietaires, modifierComplementsBien } from './creationBienRepo';
import { creerLocatairesSurBienAvec } from './portefeuilleRepo';
import { oublierSchemaLocation } from './sondeLocation';
import { enregistrerDigicode, journalDigicode, lireDigicodeDuLot, lireDigicodesAdresse } from './digicodeImmeubleRepo';
import { donneesNouvelleLocation } from './mailNouvelleLocationRepo';
import { htmlNouvelleLocation, texteNouvelleLocation } from './mailNouvelleLocation';
import type { DepsBrancheBail } from './brancheBailDriveRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const S = `d${Date.now().toString(36)}`;
const SANS_DRIVE: DepsBrancheBail = { fetch: (async () => { throw new Error('Drive interdit pendant l’épreuve'); }) as typeof fetch, jeton: async () => ({ etat: 'expire', motif: 'épreuve sans Drive' }) };
const un = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T> => (await query<T>(sql, p)).rows[0];
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const oublier = (): void => { oublierSchemaLocation(); oublierSchema(); };
const MIGRATION = readFileSync(path.join(process.cwd(), 'db/migrations/399_gestion_immeuble_digicode_batiment.sql'), 'utf8');

let essai: EssaiAnnule | null = null;
const fetchGlobal = globalThis.fetch;
beforeAll(async () => {
  if (!baseEssai) return;
  globalThis.fetch = (async (u: string | URL | Request, i?: RequestInit) => {
    if (/googleapis\.com/.test(String(u))) throw new Error(`appel Google interdit pendant l'épreuve : ${String(u)}`);
    return fetchGlobal(u, i);
  }) as typeof fetch;
  essai = await ouvrirEssaiAnnule();
});
afterAll(async () => { globalThis.fetch = fetchGlobal; if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴🔴 migration 399 — un digicode par bâtiment', () => {
  const VOIE = `25 rue Essai ${S}`;
  const ADR = { voie: VOIE, codePostal: '92400', commune: 'Courbevoie' };
  let proprio = 0;
  const bien = async (batiment: string | null, digicode: boolean | null = null, code = '', voie = VOIE): Promise<number> => ok(await creerBienComplet({
    proprietaireIds: [proprio], annexes: [],
    logement: { adresse: voie, codePostal: '92400', commune: 'COURBEVOIE', famille: 'logement', typeLogement: 'appartement', dpeClasse: 'D', dpeDate: '2024-01-01',
      entretienAPrevoir: false, ...(batiment === null ? {} : { batiment }), ...(digicode === null ? {} : { digicode, digicodeCode: code }) },
  }, AUTEUR)).logementId;
  const code = async (lot: number) => { const d = await lireDigicodeDuLot(lot); return d === null ? null : { code: d.code, portee: d.portee, batiment: d.batiment }; };
  let a1 = 0; let a2 = 0; let b1 = 0; let b2 = 0; let sans = 0; let c1 = 0;

  it('⓪ la recette AVEC la 396, SANS la 399 ; un code déjà porté par l’immeuble ; la 399 appliquée deux fois (rejouable) → il devient le code général', async () => {
    expect((await un<{ t: string | null }>(`SELECT to_regclass('gestion_immeuble')::text AS t`)).t).toBe('gestion_immeuble');
    expect((await un<{ t: string | null }>(`SELECT to_regclass('gestion_immeuble_batiment')::text AS t`)).t).toBeNull();
    oublier();
    proprio = ok(await creerProprietaires({ cartes: [{ nom: `BATIMENT${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 42 53 64 75', libelle: 'Mobile' }, { sorte: 'email', valeur: `bat.${S}@exemple.test`, libelle: 'E-mail' }] }], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
    // AVANT la 399 : le digicode de l'immeuble (396), un seul pour l'adresse.
    expect(await enregistrerDigicode(ADR, { digicode: true, code: '0000' }, AUTEUR, 'fiche_syndic')).toMatchObject({ ok: true, change: true });
    const avant = await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_immeuble_digicode_journal');
    await query(MIGRATION);
    await query(MIGRATION);
    oublier();
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_immeuble_digicode_journal')).n).toBe(avant.n);
    expect(await un('SELECT digicode, digicode_code AS code FROM gestion_immeuble WHERE voie = $1', [VOIE])).toEqual({ digicode: true, code: '0000' });
    const l = await lireDigicodesAdresse(ADR);
    expect(l?.parBatiment).toBe(true);
    expect([l?.general.digicode, l?.general.code]).toEqual([true, '0000']);
  });

  it('① deux bâtiments à la même adresse, deux codes ; « Bât. B » = « B » = « bâtiment b »', async () => {
    a1 = await bien('A', true, 'AAAA');
    a2 = await bien('Bât. A');
    b1 = await bien('B', true, 'BBBB');
    b2 = await bien('bâtiment b');
    sans = await bien(null);
    c1 = await bien('C');
    expect(await code(a1)).toEqual({ code: 'AAAA', portee: 'batiment', batiment: 'A' });
    expect(await code(a2)).toEqual({ code: 'AAAA', portee: 'batiment', batiment: 'A' });
    expect(await code(b1)).toEqual({ code: 'BBBB', portee: 'batiment', batiment: 'B' });
    expect(await code(b2)).toEqual({ code: 'BBBB', portee: 'batiment', batiment: 'B' });
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_immeuble_batiment b JOIN gestion_immeuble i ON i.id = b.immeuble_id WHERE i.voie = $1', [VOIE])).n).toBe(2);
    // Le code n'est JAMAIS copié sur les fiches de biens.
    expect((await query('SELECT 1 FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) AND (digicode IS NOT NULL OR digicode_code IS NOT NULL)', [[a1, a2, b1, b2, sans, c1]])).rows).toEqual([]);
    expect((await lireDigicodeDuLot(b2))?.mention).toBe(`Commun aux 2 biens du bâtiment B, ${VOIE}, 92400 COURBEVOIE`);
  });

  it('② sans bâtiment → le code général ; bâtiment sans code → le code général avec la mention', async () => {
    const s = await lireDigicodeDuLot(sans);
    expect([s?.code, s?.portee, s?.batiment]).toEqual(['0000', 'general', null]);
    expect(s?.mention).toBe(`Code général de l’adresse · Commun aux 2 biens de l’adresse ${VOIE}, 92400 COURBEVOIE`);
    const c = await lireDigicodeDuLot(c1);
    expect([c?.code, c?.portee, c?.batiment]).toEqual(['0000', 'general', 'C']);
    expect(c?.mention).toMatch(/^Code général de l’adresse \(le bâtiment C n’a pas de code propre\) · Commun aux 2 biens de l’adresse /);
    // La fiche rose : une ligne par bâtiment connu (déduits des biens) + le code général.
    const l = await lireDigicodesAdresse(ADR);
    expect(l?.batiments.map((b) => [b.libelle, b.code, b.nbBiens])).toEqual([['A', 'AAAA', 2], ['B', 'BBBB', 2], ['C', null, 1]]);
  });

  it('③ modifié depuis un bien → propagé aux SEULS biens du même bâtiment ; le code général se modifie à part', async () => {
    const c = await complementsDuBien(b2);
    ok(await modifierComplementsBien(b2, { ...c, digicode: true, digicodeCode: '9B9B' }, AUTEUR));
    expect((await code(b1))?.code).toBe('9B9B');
    expect((await code(b2))?.code).toBe('9B9B');
    for (const x of [a1, a2]) expect((await code(x))?.code).toBe('AAAA');
    for (const x of [sans, c1]) expect((await code(x))?.code).toBe('0000');
    // Le code général, depuis le bien SANS bâtiment : seuls les biens qui le lisent changent.
    const cs = await complementsDuBien(sans);
    ok(await modifierComplementsBien(sans, { ...cs, digicode: true, digicodeCode: '1G1G' }, AUTEUR));
    for (const x of [sans, c1]) expect((await code(x))?.code).toBe('1G1G');
    expect((await code(b1))?.code).toBe('9B9B');
    expect((await code(a1))?.code).toBe('AAAA');
    // Un bien du bâtiment C saisit SON code : C a désormais un code propre, le code général ne bouge pas.
    const cc = await complementsDuBien(c1);
    ok(await modifierComplementsBien(c1, { ...cc, digicode: true, digicodeCode: '3C3C' }, AUTEUR));
    expect(await code(c1)).toEqual({ code: '3C3C', portee: 'batiment', batiment: 'C' });
    expect((await code(sans))?.code).toBe('1G1G');
    // Un champ laissé tel quel (le code général affiché) n'est JAMAIS copié sur le bâtiment.
    const autreC = await bien('c');
    const vu = await complementsDuBien(autreC);
    expect(vu?.digicodeCode).toBe('3C3C');
    ok(await modifierComplementsBien(autreC, { ...vu, commentaire: 'rien d’autre' }, AUTEUR));
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_immeuble_batiment b JOIN gestion_immeuble i ON i.id = b.immeuble_id WHERE i.voie = $1', [VOIE])).n).toBe(3);
  });

  it('④ changement de syndic → aucun effet sur les codes', async () => {
    const sy = (await query<{ id: string }>('SELECT id::text FROM gestion_syndic WHERE supprime_le IS NULL ORDER BY id LIMIT 1')).rows[0];
    expect(sy).toBeDefined();
    {
      const c = await complementsDuBien(a1);
      ok(await modifierComplementsBien(a1, { ...c, syndicId: Number(sy.id) }, AUTEUR));
      ok(await modifierComplementsBien(a1, { ...(await complementsDuBien(a1)), syndicId: null }, AUTEUR));
    }
    expect((await code(a1))?.code).toBe('AAAA');
    expect((await code(b1))?.code).toBe('9B9B');
    expect((await code(sans))?.code).toBe('1G1G');
  });

  it('⑤ le journal : chaque changement, bâtiment compris (vide = code général) ; rien n’est supprimé', async () => {
    const j = await journalDigicode(ADR);
    expect(j.map((x) => [x.batiment, x.avant, x.apres, x.depuis]).reverse()).toEqual([
      [null, 'non renseigné', 'oui · code 0000', 'fiche_syndic'],
      ['A', 'non renseigné', 'oui · code AAAA', 'nouveau_bien'],
      ['B', 'non renseigné', 'oui · code BBBB', 'nouveau_bien'],
      ['B', 'oui · code BBBB', 'oui · code 9B9B', 'fiche_bien'],
      [null, 'oui · code 0000', 'oui · code 1G1G', 'fiche_bien'],
      ['C', 'non renseigné', 'oui · code 3C3C', 'fiche_bien'],
    ]);
    const g = await query<{ commentaire: string }>(`SELECT commentaire FROM gestion_journal WHERE entite = 'annuaire_lot' AND entite_id = $1 AND action = 'digicode_immeuble'`, [b2]);
    expect(g.rows.map((r) => r.commentaire)).toEqual([`digicode du bâtiment B de l’immeuble ${VOIE} (commun aux biens de ce bâtiment)`]);
    await expect(query('DELETE FROM gestion_immeuble_batiment WHERE batiment_cle = $1', ['zzz'])).rejects.toThrow(/ne s'effacent jamais/);
  });

  it('⑥ le mail « Nouvelle location » : le code du bâtiment du logement ; une annexe ne le répète que si son bâtiment diffère', async () => {
    const lot = ok(await creerBienComplet({ proprietaireIds: [proprio],
      annexes: [{ categorie: 'cave', etage: '-1', porte: '12' }, { categorie: 'parking', etage: '-1', porte: '34', parkingType: 'box_simple' }],
      logement: { adresse: VOIE, codePostal: '92400', commune: 'COURBEVOIE', famille: 'logement', typeLogement: 'appartement', batiment: 'Bât. B',
        dpeClasse: 'D', dpeDate: '2024-01-01', entretienAPrevoir: false } }, AUTEUR));
    const [cave, parking] = lot.annexes;
    // La cave est au bâtiment B (même bâtiment) ; le parking au bâtiment A (autre bâtiment).
    ok(await modifierComplementsBien(cave, { ...(await complementsDuBien(cave)), batiment: 'B' }, AUTEUR));
    ok(await modifierComplementsBien(parking, { ...(await complementsDuBien(parking)), batiment: 'A' }, AUTEUR));
    // Le bâtiment changé, le digicode laissé tel quel : rien n'est recopié (B garde 9B9B, A garde AAAA).
    expect((await code(cave))?.code).toBe('9B9B');
    expect((await code(parking))?.code).toBe('AAAA');
    const i = ok(await creerLocatairesSurBienAvec({
      cartes: [{ civilite: 'Mme', nom: `LOCATAIRE${S}`, prenom: 'Léa', coordonnees: [{ sorte: 'telephone', valeur: '06 42 53 64 76', libelle: 'Mobile' }, { sorte: 'email', valeur: `lea.${S}@exemple.test`, libelle: 'E-mail' }] }],
      existants: [], contacts: [], rattachements: [],
      lotId: lot.logementId, entree: '2026-11-01', lotIds: [lot.logementId, cave, parking],
      conditions: { depot: 'agence', prelevement: false, jour: null, garant: false, assurance: 'visale', assurancePrecision: 'V123456789', honorairesLocataire: 'agence',
        honorairesProprietaire: 'gestion', sommes: { prorataLoyer: '', prorataCharges: '', depotGarantie: '', honorairesAgence: '' }, reglement: 'virement', reglementPrecision: '', commentaire: '' },
      loyer: { principal: '900', provisions: '50' },
    }, AUTEUR, SANS_DRIVE));
    const d = await donneesNouvelleLocation((i as { bailId: number }).bailId);
    expect(d).not.toBeNull();
    const digi = (id: number) => d!.lots.find((l) => l.id === id)?.lignes.find((x) => x.mot === 'Digicode')?.valeur ?? null;
    expect(digi(lot.logementId)).toBe('9B9B');
    expect(digi(cave)).toBeNull();
    expect(digi(parking)).toBe('AAAA');
    // Le bandeau garantie : Visale en vert, avec le n° de visa ; l'objet sans « SANS GLI ».
    expect(d!.gli).toEqual({ etat: 'oui', sorte: 'visale', titre: 'GARANTIE VISALE', detail: 'N° de visa : V123456789' });
    expect(texteNouvelleLocation(d!)).toContain('✓ GARANTIE VISALE — N° de visa : V123456789');
    expect(htmlNouvelleLocation(d!)).not.toMatch(/SANS GLI/);
  });
});
