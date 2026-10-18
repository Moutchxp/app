/**
 * ══ 🔴🔴 TUILE LOCATION — LE SYNDIC DU BIEN, DIGICODE, PARKING (Arno, 17/10/2026), SUR UNE BASE JETABLE ═════════════════
 *
 *   ① un syndic créé par la porte de la modale de la Gestion (`validerSyndic` + `enregistrerSyndic`), avec un contact
 *      interne ; un bien créé dans la Location le reçoit : rattaché PAR SON IMMEUBLE (la copropriété du syndic porte
 *      l'adresse du bien), le contact existant DÉSIGNÉ pour ce bien, un NOUVEAU contact ajouté à l'annuaire du syndic —
 *      tout est visible par la fiche syndic de la Gestion ;
 *   ② la suggestion « Syndic déjà connu pour cette adresse » trouve ce syndic pour un autre bien à la même adresse ;
 *   ③ le code du digicode : 8 caractères au plus, effacé quand digicode = non ; le « N° de place » d'un parking nu est la
 *      colonne `porte` (aucune colonne de plus).
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 376). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l10 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/syndicBien.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { enregistrerSyndic, ficheSyndic } from '../gestion/syndicRepo';
import { cleImmeuble, validerSyndic } from '../gestion/syndics';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { syndicsPourAdresse } from './syndicLocationRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest syndic' };
const S = `y${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };

describe.skipIf(!baseEssai)('🔴 le syndic du bien, par les fonctions de la Gestion', () => {
  let proprietaireId = 0;
  let syndicId = 0;
  let contactId = 0;
  const adresse = `10 rue du Syndic${S}`;

  it('① syndic créé (porte de la modale), bien rattaché par son immeuble, contact désigné, nouveau contact dans l’annuaire du syndic', async () => {
    proprietaireId = ok(await creerProprietaires({ enGestion: false, numeroMandatTransaction: 'MT itest', cartes: [{ nom: `PROPRIO${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 44 55 66 77', libelle: 'Mobile' }, { sorte: 'email' as const, valeur: `proprio.${S}@exemple.test`, libelle: 'E-mail' }] }] }, AUTEUR)).ids[0];
    const v = validerSyndic({ nom: `CABINET${S}`, adresse: '1 avenue du Cabinet', codePostal: '75008', ville: 'PARIS', telephone: '', telephone2: '',
      email: `cabinet.${S}@exemple.test`, note: '', immeubles: [],
      contacts: [{ id: null, titre: 'Gestionnaire', prenom: 'Léa', nom: `GESTION${S}`, coordonnees: [{ id: null, sorte: 'email', libelle: 'E-mail', valeur: `lea.${S}@exemple.test` }] }] });
    if (!v.ok) throw new Error(v.motif);
    const e = await enregistrerSyndic(null, { ...v.syndic, confirmeDoublons: true }, AUTEUR);
    if (!e.ok) throw new Error(e.motif);
    syndicId = e.id;
    contactId = (await ficheSyndic(syndicId))!.contacts[0].id;

    const b = ok(await creerBienComplet({
      proprietaireIds: [proprietaireId], annexes: [],
      logement: { adresse, codePostal: '75011', commune: 'PARIS', famille: 'logement', typeLogement: 'studio', syndicId },
      syndic: { id: syndicId, contactsIds: [contactId], nouveauxContacts: [{ nom: `COMPTA${S}`, fonction: 'Comptable', email: `compta.${S}@exemple.test` }] },
    }, AUTEUR));
    expect(b.syndicRefus).toBeNull();
    const { rows } = await query<{ immeuble: string; syndic_id: string }>('SELECT immeuble, syndic_id::text FROM gestion_annuaire_lot WHERE id = $1', [b.logementId]);
    expect(rows[0]).toEqual({ immeuble: adresse, syndic_id: String(syndicId) });
    // La GESTION (sa fiche syndic) : la copropriété porte l'adresse du bien, le bien y figure, les deux contacts la suivent.
    const f = (await ficheSyndic(syndicId))!;
    const cle = cleImmeuble(adresse);
    const copro = f.coproprietes.find((c) => c.cle === cle);
    expect(copro).toBeDefined();
    expect(copro!.lots.map((l) => l.id)).toContain(b.logementId);
    expect(f.contacts.find((c) => c.id === contactId)?.immeubles).toContain(cle);
    const nouveau = f.contacts.find((c) => c.nom === `COMPTA${S}`);
    expect(nouveau).toMatchObject({ titre: 'Comptable', immeubles: [cle] });
    expect(nouveau!.coordonnees.map((k) => k.valeur)).toEqual([`compta.${S}@exemple.test`]);
  });

  it('② la suggestion « déjà connu pour cette adresse » trouve ce syndic (lecture seule)', async () => {
    const avant = Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_journal')).rows[0].n);
    const s = await syndicsPourAdresse({ libelle: adresse, codePostal: '75011', commune: 'PARIS' });
    expect(s.map((x) => x.id)).toContain(syndicId);
    expect(await syndicsPourAdresse({ libelle: `99 rue Inconnue${S}`, codePostal: '75011', commune: 'PARIS' })).toEqual([]);
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_journal')).rows[0].n)).toBe(avant);
  });

  it('③ digicode : 8 caractères au plus, effacé sur « non » ; parking nu : le N° de place dans `porte`', async () => {
    const base = { proprietaireIds: [proprietaireId], annexes: [] };
    const trop = await creerBienComplet({ ...base, logement: { adresse: `1 rue Code${S}`, famille: 'logement', typeLogement: 'studio', digicode: 'oui', digicodeCode: '123456789' } }, AUTEUR);
    expect(trop).toEqual({ etat: 'refus', motif: 'Le code du digicode fait 8 caractères au plus.' });
    const okCode = ok(await creerBienComplet({ ...base, logement: { adresse: `1 rue Code${S}`, famille: 'logement', typeLogement: 'studio', digicode: 'oui', digicodeCode: '57B83' } }, AUTEUR));
    const non = ok(await creerBienComplet({ ...base, logement: { adresse: `2 rue Code${S}`, famille: 'logement', typeLogement: 'studio', digicode: 'non', digicodeCode: '57B83' } }, AUTEUR));
    const p = ok(await creerBienComplet({ ...base, logement: { adresse: `3 rue Garage${S}`, famille: 'parking', parkingType: 'box_simple', porte: '42' } }, AUTEUR));
    const { rows } = await query<{ id: string; digicode: boolean | null; digicode_code: string | null; porte: string | null }>(
      'SELECT id::text, digicode, digicode_code, porte FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) ORDER BY id', [[okCode.logementId, non.logementId, p.logementId]]);
    expect(rows.map((r) => ({ digicode: r.digicode, code: r.digicode_code, porte: r.porte }))).toEqual([
      { digicode: true, code: '57B83', porte: null }, { digicode: false, code: null, porte: null }, { digicode: null, code: null, porte: '42' },
    ]);
  });
});
