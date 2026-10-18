/**
 * ══ 🔴🔴 TUILE LOCATION — CLIENTS ET CONTACTS À LA CRÉATION (Arno, 17/10/2026), SUR UNE BASE JETABLE ════════════════════
 *
 * « Seuls les PROPRIÉTAIRES et les LOCATAIRES sont des clients ; toutes les autres personnes sont des CONTACTS. »
 *   ① propriétaire seul, obligatoires ALLÉGÉS (le nom ; la première carte complète : téléphone ET e-mail) ;
 *   ② propriétaire + 2 contacts → contacts posés sur le bien, côté propriétaire, par la porte de la Gestion (même table,
 *      même rôle), et NON comptés parmi les propriétaires ; absents de la recherche de l'accueil ;
 *   ③ contacts seuls refusés (propriétaire comme locataire) ; un contact sans e-mail refusé (règle de la Gestion) ;
 *   ④ côté locataire : deux locataires + un contact du locataire, sur le bien choisi.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 376). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l9 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/contactsCreation.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ficheLot } from '../gestion/annuaireRepo';
import { lireCartesDuBien } from '../gestion/partieCategorieRepo';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { creerLocatairesSurBien, rechercherPortefeuille } from './portefeuilleRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest contacts' };
const S = `k${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const tel = (v: string) => ({ sorte: 'telephone' as const, valeur: v, libelle: 'Mobile' });
const mail = (v: string) => ({ sorte: 'email' as const, valeur: v, libelle: 'E-mail' });
const cleDuLot = async (id: number): Promise<string> => (await query<{ c: string }>('SELECT wippimmo_id AS c FROM gestion_annuaire_lot WHERE id = $1', [id])).rows[0].c;

describe.skipIf(!baseEssai)('🔴 clients et contacts à la création', () => {
  let proprietaireId = 0;
  let logementId = 0;

  it('① propriétaire seul : le nom, un téléphone et un e-mail (première carte, Arno 18/10/2026) ; ni téléphone ni e-mail ⇒ refus', async () => {
    expect((await creerProprietaires({ cartes: [{ nom: `SANSCOORD${S}` }], enGestion: false, numeroMandatTransaction: 'MT itest' }, AUTEUR)).etat).toBe('refus');
    const r = ok(await creerProprietaires({ cartes: [{ nom: `SEUL${S}`, coordonnees: [tel('06 12 34 56 99'), mail(`seul.${S}@exemple.test`)] }], enGestion: false, numeroMandatTransaction: 'MT itest' }, AUTEUR));
    proprietaireId = r.ids[0];
    const { rows } = await query<{ civilite: string | null; prenom: string | null; adresse: string | null }>(
      'SELECT civilite, prenom, adresse FROM gestion_annuaire_proprietaire WHERE id = $1', [proprietaireId]);
    expect(rows[0]).toEqual({ civilite: null, prenom: null, adresse: null });
  });

  it('② propriétaire + 2 contacts : posés sur le bien côté propriétaire, NON comptés comme propriétaires, absents de la recherche', async () => {
    const b = ok(await creerBienComplet({
      proprietaireIds: [proprietaireId], annexes: [],
      logement: { adresse: `3 rue Contacts${S}`, famille: 'logement', typeLogement: 'studio' },
      contacts: [
        { nom: `NOTAIRE${S}`, prenom: 'Luc', qualite: 'notaire', coordonnees: [mail(`notaire.${S}@exemple.test`), tel('01 40 00 00 01')] },
        { nom: `GARDIEN${S}`, qualite: 'gardien', coordonnees: [mail(`gardien.${S}@exemple.test`)] },
      ],
    }, AUTEUR));
    logementId = b.logementId;
    expect(b).toMatchObject({ contacts: 2, contactsRefus: null });
    const cartes = await lireCartesDuBien(await cleDuLot(logementId));
    expect(cartes.filter((c) => c.cote === 'proprietaire').map((c) => ({ nom: c.nom, qualite: c.qualite, adresse: c.adresse })).sort((x, y) => (x.nom ?? '').localeCompare(y.nom ?? '')))
      .toEqual([
        { nom: `GARDIEN${S}`, qualite: 'gardien', adresse: `gardien.${S}@exemple.test` },
        { nom: `NOTAIRE${S}`, qualite: 'notaire', adresse: `notaire.${S}@exemple.test` },
      ]);
    // La Gestion (sa propre lecture) : UN propriétaire — les contacts ne sont pas des clients.
    const g = await ficheLot(logementId);
    if (g.etat !== 'ok') throw new Error(g.etat);
    expect(g.data.proprietaires.map((p) => p.id)).toEqual([proprietaireId]);
    // Aucune fiche d'annuaire n'est née pour un contact, et la recherche de l'accueil ne les trouve pas.
    expect(Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire WHERE nom_complet ILIKE $1`, [`%NOTAIRE${S}%`])).rows[0].n)).toBe(0);
    const r = await rechercherPortefeuille(`NOTAIRE${S}`);
    expect(r.proprietaires.length + r.locataires.length + r.syndics.length + r.biens.length).toBe(0);
  });

  it('③ contacts seuls refusés ; un contact sans e-mail refusé (avant toute écriture)', async () => {
    expect((await creerProprietaires({ cartes: [], existants: [], enGestion: false, numeroMandatTransaction: 'MT itest' }, AUTEUR)).etat).toBe('refus');
    expect((await creerBienComplet({ proprietaireIds: [], annexes: [], logement: { adresse: `4 rue X${S}`, famille: 'logement', typeLogement: 'studio' },
      contacts: [{ nom: 'X', coordonnees: [mail('x@exemple.test')] }] }, AUTEUR)).etat).toBe('refus');
    const avant = Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n);
    const sansMail = await creerBienComplet({ proprietaireIds: [proprietaireId], annexes: [],
      logement: { adresse: `5 rue Y${S}`, famille: 'logement', typeLogement: 'studio' }, contacts: [{ nom: 'SANSMAIL', coordonnees: [tel('06 00 00 00 09')] }] }, AUTEUR);
    expect(sansMail.etat).toBe('refus');
    if (sansMail.etat === 'refus') expect(sansMail.motif).toMatch(/^Contact 1 : .*e-mail/);
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n)).toBe(avant);
    expect((await creerLocatairesSurBien({ cartes: [], existants: [], contacts: [{ nom: 'G', coordonnees: [mail('g@exemple.test')] }], lotId: logementId, entree: null }, AUTEUR)).etat).toBe('refus');
  });

  it('④ côté locataire : deux locataires (obligatoires allégés) + un contact du locataire, sur le bien choisi', async () => {
    const r = ok(await creerLocatairesSurBien({
      cartes: [{ nom: `COLOC${S}`, prenom: 'Ana', coordonnees: [tel('06 10 10 10 10'), mail(`ana.${S}@exemple.test`)] }, { nom: `COLOC${S}`, prenom: 'Ben', coordonnees: [tel('06 11 11 11 11')] }],
      existants: [], contacts: [{ nom: `GARANT${S}`, qualite: 'garant', coordonnees: [mail(`garant.${S}@exemple.test`)] }],
      lotId: logementId, entree: '2026-11-01',
    }, AUTEUR));
    expect(r.locataireIds).toHaveLength(2);
    expect(r).toMatchObject({ contacts: 1, contactsRefus: null });
    const g = await ficheLot(logementId);
    if (g.etat !== 'ok') throw new Error(g.etat);
    expect(g.data.occupants.map((p) => p.id).sort()).toEqual([...r.locataireIds].sort());
    const cartes = await lireCartesDuBien(await cleDuLot(logementId));
    expect(cartes.filter((c) => c.cote === 'locataire').map((c) => c.qualite)).toEqual(['garant']);
  });
});
