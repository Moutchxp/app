/**
 * ══ 🔴🔴 TUILE LOCATION — « QUI RATTACHER À CE BIEN ? » ET LES CONTACTS DU SYNDIC (Arno, 18/10/2026), SUR UNE BASE JETABLE ══
 *
 *   ① un couple co-propriétaire d'un bien (avec un contact du propriétaire) : la personne cherchée, son conjoint (personne
 *      LIÉE) et le contact sont proposés ;
 *   ② nouveau bien : UNE seule des deux personnes rattachée, le contact EXISTANT rattaché sur ce bien — la carte d'origine
 *      et les fiches des personnes ne sont pas modifiées ;
 *   ③ les deux personnes ; un contact coché qui n'est pas celui de ces propriétaires est refusé avant toute écriture ;
 *   ④ « + Ajouter un contact » de la modale du syndic : le contact est dans l'annuaire du syndic de la Gestion.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 376). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l11 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/rattachementProprietaires.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { lireCartesDuBien } from '../gestion/partieCategorieRepo';
import { enregistrerSyndic, ficheSyndic } from '../gestion/syndicRepo';
import { validerSyndic } from '../gestion/syndics';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { personnesARattacher } from './rattachementProprietairesRepo';
import { ajouterContactSyndic } from './syndicLocationRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest rattachement' };
const S = `r${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const tel = (v: string) => ({ sorte: 'telephone' as const, valeur: v, libelle: 'Mobile' });
const mail = (v: string) => ({ sorte: 'email' as const, valeur: v, libelle: 'E-mail' });
const cle = async (id: number): Promise<string> => (await query<{ c: string }>('SELECT wippimmo_id AS c FROM gestion_annuaire_lot WHERE id = $1', [id])).rows[0].c;
const fiches = async (ids: number[]) => (await query('SELECT * FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[]) ORDER BY id', [ids])).rows;
const coproprietaires = async (lotId: number) =>
  (await query<{ p: string }>('SELECT proprietaire_id::text AS p FROM gestion_annuaire_lot_proprietaire WHERE lot_id = $1 AND jusqu_a IS NULL', [lotId])).rows.map((r) => Number(r.p));

describe.skipIf(!baseEssai)('🔴 qui rattacher à ce bien ? — personnes une à une, contacts existants', () => {
  let lea = 0;
  let paul = 0;
  let carteNotaire = 0;
  let bienCouple = 0;
  const emailNotaire = `notaire.${S}@exemple.test`;

  it('① le couple et son contact sont proposés (la personne cherchée, la personne liée, le contact)', async () => {
    [lea, paul] = ok(await creerProprietaires({ enGestion: false, numeroMandatTransaction: 'MT itest', cartes: [
      { nom: `MARTIN${S}`, prenom: 'Léa', coordonnees: [tel('06 11 11 11 11'), mail(`lea.${S}@exemple.test`)] },
      { nom: `MARTIN${S}`, prenom: 'Paul', coordonnees: [mail(`paul.${S}@exemple.test`)] },
    ] }, AUTEUR)).ids;
    bienCouple = ok(await creerBienComplet({ proprietaireIds: [lea, paul], annexes: [],
      logement: { adresse: `3 rue du Couple${S}`, famille: 'logement', typeLogement: 'appartement' },
      contacts: [{ nom: `NOTAIRE${S}`, prenom: 'Luc', qualite: 'notaire', coordonnees: [mail(emailNotaire)] }] }, AUTEUR)).logementId;
    const d = await personnesARattacher(lea);
    expect(d).not.toBeNull();
    expect(d!.choisie).toBe(lea);
    expect(d!.proprietaires.map((p) => p.id)).toEqual([lea, paul]);
    expect(d!.proprietaires[0]).toMatchObject({ telephone: '+33611111111', biens: [`3 rue du Couple${S}`] });
    expect(d!.contacts.map((c) => c.email)).toEqual([emailNotaire]);
    expect(d!.contacts[0]).toMatchObject({ lotId: bienCouple, qualite: 'notaire' });
    carteNotaire = d!.contacts[0].id;
  });

  it('② une seule des deux personnes + le contact existant ; carte d’origine et fiches des personnes intactes', async () => {
    const fichesAvant = await fiches([lea, paul]);
    const origineAvant = (await lireCartesDuBien(await cle(bienCouple))).find((c) => c.id === carteNotaire);
    const b = ok(await creerBienComplet({ proprietaireIds: [lea], contactsExistants: [carteNotaire], annexes: [],
      logement: { adresse: `9 rue Seule${S}`, famille: 'logement', typeLogement: 'studio' } }, AUTEUR));
    expect(b.contactsRefus).toBeNull();
    expect(b.contacts).toBe(1);
    const { rows } = await query<{ p: string }>('SELECT proprietaire_id::text AS p FROM gestion_annuaire_lot WHERE id = $1', [b.logementId]);
    expect(Number(rows[0].p)).toBe(lea);
    expect(await coproprietaires(b.logementId)).toEqual([]);
    const cartes = await lireCartesDuBien(await cle(b.logementId));
    expect(cartes.map((c) => ({ cote: c.cote, adresse: c.adresse, qualite: c.qualite, prenom: c.prenom }))).toEqual([
      { cote: 'proprietaire', adresse: emailNotaire, qualite: 'notaire', prenom: 'Luc' },
    ]);
    expect((await lireCartesDuBien(await cle(bienCouple))).find((c) => c.id === carteNotaire)).toEqual(origineAvant);
    expect(await fiches([lea, paul])).toEqual(fichesAvant);
  });

  it('③ les deux personnes ; un contact étranger à ces propriétaires refusé avant toute écriture', async () => {
    const b = ok(await creerBienComplet({ proprietaireIds: [lea, paul], annexes: [],
      logement: { adresse: `11 rue Deux${S}`, famille: 'logement', typeLogement: 'studio' } }, AUTEUR));
    expect(await coproprietaires(b.logementId)).toEqual([paul]);
    const [autre] = ok(await creerProprietaires({ enGestion: false, numeroMandatTransaction: 'MT itest', cartes: [{ nom: `AUTRE${S}`, coordonnees: [tel('06 99 99 99 99'), mail(`autre.${S}@exemple.test`)] }] }, AUTEUR)).ids;
    const avant = Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n);
    const r = await creerBienComplet({ proprietaireIds: [autre], contactsExistants: [carteNotaire], annexes: [],
      logement: { adresse: `12 rue Refus${S}`, famille: 'logement', typeLogement: 'studio' } }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Un contact coché n’est plus rattaché à ces propriétaires dans la Gestion : retirez-le.' });
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n)).toBe(avant);
  });

  it('④ « + Ajouter un contact » (modale du syndic) : le contact est dans l’annuaire du syndic de la Gestion', async () => {
    const v = validerSyndic({ nom: `QUIRATTACHE${S}`, adresse: '7 quai Distinct', codePostal: '69002', ville: 'LYON', telephone: '', telephone2: '',
      email: `accueil.${S}@quirattache.test`, note: '', immeubles: [], contacts: [] });
    if (!v.ok) throw new Error(v.motif);
    const e = await enregistrerSyndic(null, { ...v.syndic, confirmeDoublons: true }, AUTEUR);
    if (!e.ok) throw new Error(e.motif);
    expect(await ajouterContactSyndic(e.id, { nom: '', email: 'x@y.z' }, AUTEUR)).toEqual({ etat: 'refus', motif: 'Le nom est obligatoire.' });
    const r = await ajouterContactSyndic(e.id, { civilite: 'Mme', nom: `NOUVELLE${S}`, prenom: 'Zoé', fonction: 'Assistante', telephone: '06 12 12 12 12', email: `zoe.${S}@quirattache.test` }, AUTEUR);
    expect(r.etat).toBe('ok');
    const f = (await ficheSyndic(e.id))!;
    const c = f.contacts.find((x) => x.nom === `NOUVELLE${S}`);
    expect(c).toMatchObject({ civilite: 'Mme', prenom: 'Zoé', titre: 'Assistante', immeubles: [] });
    expect(r.etat === 'ok' ? r.data.contactId : null).toBe(c!.id);
    expect(c!.coordonnees.map((k) => k.valeur.replace(/\D/g, '').slice(-9))).toContain('612121212');
    expect(c!.coordonnees.map((k) => k.valeur)).toContain(`zoe.${S}@quirattache.test`);
  });
});
