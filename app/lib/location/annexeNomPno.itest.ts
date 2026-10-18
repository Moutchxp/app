/**
 * ══ 🔴🔴 TUILE LOCATION — NOM D'ANNEXE « AUTRE », ASSURANCE PNO, PROPRIÉTAIRE PUIS BIEN (Arno, 18/10/2026), BASE JETABLE ═══
 *
 *   ① le bien et une annexe « Autre » nommée : le nom est gardé et sert de titre ; une annexe « Autre » sans nom est refusée
 *      (formulaire comme fiche commune), avant toute écriture ;
 *   ② l'assurance PNO : Oui + date anniversaire enregistrées ; repasser à Non (fiche commune) vide la date ; la contrainte
 *      en base refuse une date sans PNO ;
 *   ③ « Créer un nouveau propriétaire » → le bien : les fiches, puis le bien avec elles et le contact saisi.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 378). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l13 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/annexeNomPno.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ficheLot } from '../gestion/annuaireRepo';
import { lireCartesDuBien } from '../gestion/partieCategorieRepo';
import { complementsDuBien, creerBienComplet, creerProprietaires, modifierComplementsBien } from './creationBienRepo';
import { ajouterAnnexe, ficheBienLocation, modifierBien } from './locationRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest annexe PNO' };
const S = `n${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const tel = (v: string) => ({ sorte: 'telephone' as const, valeur: v, libelle: 'Mobile' });
const nbLots = async () => Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n);

describe.skipIf(!baseEssai)('🔴 nom d’annexe, assurance PNO, propriétaire puis bien', () => {
  let proprietaire = 0;
  let logement = 0;
  let annexe = 0;

  it('① annexe « Autre » : nom obligatoire, gardé, titre de l’annexe ; refus avant toute écriture', async () => {
    [proprietaire] = ok(await creerProprietaires({ enGestion: false, numeroMandatTransaction: 'MT itest', cartes: [{ nom: `PNO${S}`, coordonnees: [tel('06 20 20 20 20'), { sorte: 'email' as const, valeur: `pno.${S}@exemple.test`, libelle: 'E-mail' }] }] }, AUTEUR)).ids;
    const avant = await nbLots();
    const sansNom = await creerBienComplet({ proprietaireIds: [proprietaire], logement: { adresse: `5 rue Cellier${S}`, famille: 'logement', typeLogement: 'studio' },
      annexes: [{ categorie: 'autre', nomAnnexe: '  ' }] }, AUTEUR);
    expect(sansNom.etat).toBe('refus');
    expect(await nbLots()).toBe(avant);
    const b = ok(await creerBienComplet({ proprietaireIds: [proprietaire], logement: { adresse: `5 rue Cellier${S}`, famille: 'logement', typeLogement: 'studio',
      assurancePno: true, pnoDateAnniversaire: '2026-11-15' }, annexes: [{ categorie: 'autre', nomAnnexe: 'Cellier', etage: '-1' }, { categorie: 'cave', nomAnnexe: 'ignoré' }] }, AUTEUR));
    logement = b.logementId;
    annexe = b.annexes[0];
    const { rows } = await query<{ id: string; nom_annexe: string | null; etage: string | null }>('SELECT id::text, nom_annexe, etage FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) ORDER BY id', [b.annexes]);
    expect(rows.map((r) => [r.nom_annexe, r.etage])).toEqual([['Cellier', '-1'], [null, null]]);
    const f = await ficheBienLocation(logement);
    if (f.etat !== 'ok') throw new Error(f.etat);
    expect(JSON.stringify(f.data)).toContain('"nomAnnexe":"Cellier"');
    // La fiche commune : ajouter une annexe « Autre » sans nom est refusé ; la renommer à vide aussi.
    expect((await ajouterAnnexe(logement, { categorie: 'autre' }, AUTEUR)).etat).toBe('refus');
    expect((await ajouterAnnexe(logement, { categorie: 'autre', nomAnnexe: 'Grenier' }, AUTEUR)).etat).toBe('ok');
    expect((await modifierBien(annexe, { categorie: 'autre', nomAnnexe: '' }, AUTEUR)).etat).toBe('refus');
    expect((await modifierBien(annexe, { categorie: 'autre', nomAnnexe: 'Local vélo' }, AUTEUR)).etat).toBe('ok');
    expect((await query<{ n: string | null }>('SELECT nom_annexe AS n FROM gestion_annuaire_lot WHERE id = $1', [annexe])).rows[0].n).toBe('Local vélo');
  });

  it('② assurance PNO : Oui + date, puis Non (fiche commune) vide la date ; la base refuse une date sans PNO', async () => {
    expect(await complementsDuBien(logement)).toMatchObject({ assurancePno: true, pnoDateAnniversaire: '2026-11-15' });
    const c = (await complementsDuBien(logement))!;
    expect((await modifierComplementsBien(logement, { ...c, typeLogement: 'studio', assurancePno: 'non', pnoDateAnniversaire: '2026-11-15' }, AUTEUR)).etat).toBe('ok');
    expect(await complementsDuBien(logement)).toMatchObject({ assurancePno: false, pnoDateAnniversaire: null });
    expect((await modifierComplementsBien(logement, { ...c, typeLogement: 'studio', assurancePno: 'oui', pnoDateAnniversaire: '2027-01-31' }, AUTEUR)).etat).toBe('ok');
    expect(await complementsDuBien(logement)).toMatchObject({ assurancePno: true, pnoDateAnniversaire: '2027-01-31' });
    await expect(query('UPDATE gestion_annuaire_lot SET assurance_pno = false WHERE id = $1', [logement])).rejects.toThrow(/pno_date_chk/);
  });

  it('③ nouveau propriétaire → bien : les fiches d’abord, puis le bien avec elles et le contact saisi', async () => {
    const ids = ok(await creerProprietaires({ enGestion: false, numeroMandatTransaction: 'MT itest', cartes: [
      { nom: `SUITE${S}`, prenom: 'Ana', coordonnees: [tel('06 30 30 30 30'), { sorte: 'email' as const, valeur: `ana.${S}@exemple.test`, libelle: 'E-mail' }] }, { nom: `SUITE${S}`, prenom: 'Bob', coordonnees: [tel('06 31 31 31 31')] },
    ] }, AUTEUR)).ids;
    const b = ok(await creerBienComplet({ proprietaireIds: ids, annexes: [], logement: { adresse: `8 rue Suite${S}`, famille: 'logement', typeLogement: 'appartement' },
      contacts: [{ nom: `NOTAIRE${S}`, qualite: 'notaire', coordonnees: [{ sorte: 'email', valeur: `notaire.${S}@exemple.test`, libelle: 'E-mail' }] }] }, AUTEUR));
    const g = await ficheLot(b.logementId);
    if (g.etat !== 'ok') throw new Error(g.etat);
    expect(g.data.proprietaires.map((p) => p.id).sort()).toEqual([...ids].sort());
    const { rows } = await query<{ c: string }>('SELECT wippimmo_id AS c FROM gestion_annuaire_lot WHERE id = $1', [b.logementId]);
    expect((await lireCartesDuBien(rows[0].c)).map((x) => x.qualite)).toEqual(['notaire']);
  });
});
