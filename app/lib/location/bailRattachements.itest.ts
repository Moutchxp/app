/**
 * ══ 🔴🔴 LOCATION / GESTION — LES FAILLES DE RATTACHEMENT (Arno, 20/10/2026, migration 393), SUR UNE COPIE DE LA RECETTE ═════
 *
 *   ① REPRISE DES BAUX par la migration : bail sur plusieurs lots (logement + cave), colocation, locataire sur deux baux ;
 *      le loyer de départ et les conditions passent au bail ;
 *   ② LE LOYER N'EST COMPTÉ QU'UNE FOIS, et chaque colocataire lit « loyer du bail, partagé avec X » ;
 *   ③ GARANT DE COLOCATION (rattaché au bail et aux locataires garantis) et CONTACT rattaché à son locataire ; l'écran du bien
 *      et celui du locataire le disent ; une carte sans rattachement reste visible, « à rattacher à un locataire » ;
 *   ④ SUPPRESSION REFUSÉE PAR LA BASE (ni DELETE ni TRUNCATE, sur les treize tables) ;
 *   ⑤ INDIVISION visible chez chaque copropriétaire ;
 *   ⑥ AVERTISSEMENT DE DATE (sans date d'entrée, le barème du jour, gardé avec la trace) ; BOUTON DE RECALCUL (surface connue
 *      depuis, barème de la date d'entrée, écrit seulement par « Enregistrer ») ;
 *   ⑦ L'ESSAI « ESSAI RATTACHEMENT » DU LOT 7, REJOUÉ : la reprise le met sur un seul bail, le script de reprise le range « à
 *      rattacher à la main » (colocation), et la création refaite rattache garant et conjoint.
 *
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`) : la migration elle-même est annulée à la fin ; rien ne reste.
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_test…`, copie des DONNÉES de la recette, SANS la 393 :
 *   createdb svav_test_bail393 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_bail393
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_bail393 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/bailRattachements.itest.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { oublierSchema } from '../gestion/schema';
import { ficheProprietaire } from '../gestion/annuaireRepo';
import { lireCartesDuBien } from '../gestion/partieCategorieRepo';
import { locationsAffichees, lireLocationsPourHonoraires } from '../gestion/honorairesGestionRepo';
import { calculerHonoraires } from '../gestion/honorairesGestion';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { creerLocatairesSurBien } from './portefeuilleRepo';
import { conditionsParOccupation, modifierConditionsEntree } from './conditionsEntreeRepo';
import { contactsRattachesDuBien } from './rattachementsRepo';
import { ficheLocataireLocation } from './locationRepo';
import { resumeDuBien } from './resumeBienRepo';
import { enregistrerSortie, lireBail } from './sortieLocatairesRepo';
import { classerReprise } from './rattachements';
import { oublierSchemaLocation } from './sondeLocation';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest rattachements 393' };
const S = `r${Date.now().toString(36)}`;

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const un = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T> => (await query<T>(sql, p)).rows[0];
const carte = (nom: string, n: number) => ({ nom, coordonnees: [{ sorte: 'telephone' as const, valeur: `06 41 51 61 ${String(n).padStart(2, '0')}`, libelle: 'Mobile' },
  { sorte: 'email' as const, valeur: `${nom.toLowerCase().replace(/\s+/g, '.')}.${S}@exemple.test`, libelle: 'E-mail' }] });
const contact = (nom: string, qualite: string) => ({ nom, qualite, coordonnees: [{ sorte: 'email' as const, valeur: `${nom.toLowerCase().replace(/\s+/g, '.')}.${S}@exemple.test`, libelle: 'E-mail' }] });
const CONDITIONS = {
  depot: 'agence', prelevement: true, jour: '5', garant: true, assurance: 'aucune', assurancePrecision: '',
  honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
  sommes: { prorataLoyer: '', prorataCharges: '', depotGarantie: '1 200', honorairesAgence: '' },
  reglement: 'virement', reglementPrecision: '', commentaire: '',
};
const oublier = (): void => { oublierSchemaLocation(); oublierSchema(); };

let essai: EssaiAnnule | null = null;
beforeAll(async () => { if (baseEssai) essai = await ouvrirEssaiAnnule(); });
afterAll(async () => { if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴🔴 migration 393 — le bail, les garants et contacts rattachés, le verrou', () => {
  const lot: Record<string, number> = {};
  const loc: Record<string, number> = {};
  const occ: Record<string, number> = {};
  let proprio = 0;

  it('⓪ la base est la recette AVANT la 393 ; trois biens d’essai et leurs occupations, posés à l’ancienne', async () => {
    expect((await un<{ t: string | null }>(`SELECT to_regclass('gestion_bail')::text AS t`)).t).toBeNull();
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_annuaire_occupation WHERE id IN (549, 550) AND lot_id = 7')).n).toBe(2);
    oublier();
    proprio = ok(await creerProprietaires({ cartes: [carte(`PROPRIO ${S}`, 1)], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
    const logement = { codePostal: '75011', commune: 'PARIS', famille: 'logement', typeLogement: 'appartement', dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };
    const a = ok(await creerBienComplet({ proprietaireIds: [proprio], annexes: [{ categorie: 'cave', etage: '-1' }], logement: { ...logement, adresse: `1 rue Bail A ${S}` } }, AUTEUR));
    lot.A = a.logementId; lot.Acave = a.annexes[0];
    lot.B = ok(await creerBienComplet({ proprietaireIds: [proprio], annexes: [], logement: { ...logement, adresse: `2 rue Bail B ${S}` } }, AUTEUR)).logementId;
    lot.C = ok(await creerBienComplet({ proprietaireIds: [proprio], annexes: [], logement: { ...logement, adresse: `3 rue Bail C ${S}` } }, AUTEUR)).logementId;
    for (const n of ['X', 'Y', 'Z', 'W']) {
      loc[n] = Number((await un<{ id: string }>(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise)
        VALUES ($1, $1, $2, lower($2)) RETURNING id::text`, [`${n}-${S}`, `LOC${n} ${S}`])).id);
    }
    const occuper = async (cle: string, l: string, lotId: number, entree: string, sortie: string | null): Promise<void> => {
      occ[cle] = Number((await un<{ id: string }>(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, sortie)
        VALUES ($1, $2, $3, (SELECT wippimmo_id FROM gestion_annuaire_lot WHERE id = $3), $4::date, $5::date) RETURNING id::text`, [`${cle}-${S}`, loc[l], lotId, entree, sortie])).id);
    };
    await occuper('Xa', 'X', lot.A, '2024-01-01', null);       // bail sur plusieurs lots : logement…
    await occuper('Xcave', 'X', lot.Acave, '2024-01-01', null); // …et sa cave, même locataire, même date
    await occuper('Wa', 'W', lot.A, '2020-01-01', '2022-12-31'); // locataire sur deux baux : l'ancien…
    await occuper('Wc', 'W', lot.C, '2023-01-01', null);         // …et le nouveau
    await occuper('Yb', 'Y', lot.B, '2025-06-01', null);         // colocation : deux locataires, même bien, même date
    await occuper('Zb', 'Z', lot.B, '2025-06-01', null);
    // Le loyer de départ de la colocation, saisi sur UNE carte (la règle d'avant la 393).
    await query(`INSERT INTO gestion_location_conditions (occupation_id, loyer_hc, provisions, taux_gestion_ht, base, origine, saisi_par_libelle)
                 VALUES ($1, 1000, 100, 6, 'hc', 'saisie', 'itest')`, [occ.Yb]);
  });

  it('① la migration 393 (rejouable) reprend les baux : plusieurs lots, colocation, deux baux ; le loyer passe au bail', async () => {
    const sql = readFileSync(path.join(process.cwd(), 'db/migrations/393_location_bail_rattachements.sql'), 'utf8');
    await query(sql);
    await query(sql);
    oublier();
    const bail = async (o: number) => (await un<{ b: string; lot: string; entree: string; sortie: string | null }>(
      `SELECT o.bail_id::text AS b, b.lot_id::text AS lot, b.entree::text AS entree, b.sortie::text AS sortie
         FROM gestion_annuaire_occupation o JOIN gestion_bail b ON b.id = o.bail_id WHERE o.id = $1`, [o]));
    const [xa, xc, wa, wc, yb, zb] = [await bail(occ.Xa), await bail(occ.Xcave), await bail(occ.Wa), await bail(occ.Wc), await bail(occ.Yb), await bail(occ.Zb)];
    expect(xc.b).toBe(xa.b);
    expect(xa.lot).toBe(String(lot.A));
    expect(wa.b).not.toBe(wc.b);
    expect(wa.b).not.toBe(xa.b);
    expect([wa.lot, wa.entree, wa.sortie]).toEqual([String(lot.A), '2020-01-01', '2022-12-31']);
    expect(zb.b).toBe(yb.b);
    expect(zb.sortie).toBeNull();
    expect((await un<{ b: string }>('SELECT bail_id::text AS b FROM gestion_location_conditions WHERE occupation_id = $1', [occ.Yb])).b).toBe(yb.b);
    // Toute la recette : chaque occupation d'un bien a son bail ; chaque condition et chaque carte est rattachée.
    expect(await un('SELECT count(*)::int AS n FROM gestion_annuaire_occupation WHERE lot_id IS NOT NULL AND bail_id IS NULL')).toEqual({ n: 0 });
    expect(await un('SELECT count(*)::int AS n FROM gestion_location_conditions WHERE bail_id IS NULL')).toEqual({ n: 0 });
    expect(await un('SELECT count(*)::int AS n FROM gestion_location_conditions_entree WHERE bail_id IS NULL')).toEqual({ n: 0 });
    expect(await un('SELECT count(*)::int AS n FROM gestion_contact_carte WHERE lot_id IS NULL')).toEqual({ n: 0 });
  });

  it('② le loyer de la colocation n’est compté qu’UNE fois ; chaque colocataire lit « partagé avec »', async () => {
    const aff = await locationsAffichees([occ.Yb, occ.Zb]);
    expect(aff.get(occ.Yb)?.conditions?.loyerHc).toBe(1000);
    expect(aff.get(occ.Zb)?.conditions?.loyerHc).toBe(1000);
    expect(aff.get(occ.Zb)?.partageAvec).toEqual([`LOCY ${S}`]);
    expect(aff.get(occ.Yb)?.partageAvec).toEqual([`LOCZ ${S}`]);
    const toutes = await lireLocationsPourHonoraires('2026-03-01', '2026-03-31');
    const deB = (toutes ?? []).filter((l) => l.lotId === lot.B);
    expect(deB).toHaveLength(2);
    const r = calculerHonoraires(deB, { annee: 2026, mois: 3 }, [{ valeur: 20, depuis: '2000-01-01' }]);
    expect([r.comptees, r.manquantes]).toEqual([1, 0]);
    expect(r.totalHt).toBeCloseTo(60, 9); // 1 000 € HC × 6 % — une seule fois, pas 120
  });

  it('②bis la sortie lit le BAIL : un colocataire sort, le bail continue ; le dernier sorti clôt le bail', async () => {
    const bail = await lireBail(occ.Yb);
    expect(bail?.locataires.map((l) => l.occupationId).sort()).toEqual([occ.Yb, occ.Zb].sort());
    const un1 = await enregistrerSortie({ occupationId: occ.Yb, sortants: [occ.Yb], date: '2026-04-01' }, AUTEUR);
    expect(un1.etat === 'ok' && [un1.data.vacant, un1.data.restants]).toEqual([false, [`LOCZ ${S}`]]);
    const idBail = (await un<{ b: string }>('SELECT bail_id::text AS b FROM gestion_annuaire_occupation WHERE id = $1', [occ.Zb])).b;
    expect((await un<{ s: string | null }>('SELECT sortie::text AS s FROM gestion_bail WHERE id = $1', [idBail])).s).toBeNull();
    const deux = await enregistrerSortie({ occupationId: occ.Zb, sortants: [occ.Zb], date: '2026-04-15' }, AUTEUR);
    expect(deux.etat === 'ok' && deux.data.vacant).toBe(true);
    expect((await un<{ s: string | null }>('SELECT sortie::text AS s FROM gestion_bail WHERE id = $1', [idBail])).s).toBe('2026-04-15');
  });

  it('③ garant de colocation et contact rattaché ; ⑥ sans date d’entrée, le barème du jour est dit et gardé', async () => {
    const libre = ok(await creerBienComplet({ proprietaireIds: [proprio], annexes: [], logement: { adresse: `4 rue Coloc ${S}`, codePostal: '75011', commune: 'PARIS',
      famille: 'logement', typeLogement: 'appartement', dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false } }, AUTEUR)).logementId;
    lot.D = libre;
    const r = ok(await creerLocatairesSurBien({ cartes: [carte(`COLOC UN ${S}`, 2), carte(`COLOC DEUX ${S}`, 3)], existants: [],
      contacts: [contact(`GARANT ${S}`, 'Garant'), contact(`CONJOINT ${S}`, 'Conjoint'), contact(`ARTISAN ${S}`, 'Artisan')],
      rattachements: [{ garantit: [0, 1] }, { locataire: 1 }, { locataire: null }],
      lotId: libre, entree: null, lotIds: [libre], conditions: CONDITIONS, loyer: { principal: '900', provisions: '50' } }, AUTEUR));
    const [un1, deux] = r.locataireIds;
    expect(r.dateBaremeSupposee).toBe(true);
    expect(r.rattaches).toBe(3);
    const { rows: o } = await query<{ b: string }>('SELECT DISTINCT bail_id::text AS b FROM gestion_annuaire_occupation WHERE locataire_id = ANY($1::bigint[])', [r.locataireIds]);
    expect(o).toEqual([{ b: String(r.bailId) }]);
    const ce = await un<{ bail_id: string; occupation_ids: string[] | null; hono_date_supposee: boolean; hono_date_bareme: string; jour: string }>(
      `SELECT bail_id::text, occupation_ids, hono_date_supposee, hono_date_bareme::text, (now() AT TIME ZONE 'Europe/Paris')::date::text AS jour
         FROM gestion_location_conditions_entree WHERE lot_id = $1`, [libre]);
    expect([ce.bail_id, ce.occupation_ids, ce.hono_date_supposee, ce.hono_date_bareme]).toEqual([String(r.bailId), null, true, ce.jour]);
    const { rows: g } = await query<{ l: string }>('SELECT locataire_id::text AS l FROM gestion_bail_garant WHERE bail_id = $1 AND retire_le IS NULL ORDER BY 1', [r.bailId]);
    expect(g.map((x) => Number(x.l)).sort()).toEqual([un1, deux].sort());
    // La base refuse un garant pour un locataire qui n'est pas occupant du bail.
    const carteGarant = Number((await un<{ c: string }>('SELECT carte_id::text AS c FROM gestion_bail_garant WHERE bail_id = $1 LIMIT 1', [r.bailId])).c);
    await expect(query('INSERT INTO gestion_bail_garant (bail_id, carte_id, locataire_id, cree_par_libelle) VALUES ($1, $2, $3, $4)',
      [r.bailId, carteGarant, loc.W, 'itest'])).rejects.toThrow();
    // Les écrans : la fiche du bien (cartes + résumé), la fiche de chaque locataire.
    const contacts = await contactsRattachesDuBien(libre);
    expect(contacts?.map((c) => c.mot)).toEqual([
      `garantit COLOC UN ${S}, COLOC DEUX ${S}`,
      `contact de COLOC DEUX ${S}`, 'à rattacher à un locataire']);
    const lot_cle = (await un<{ k: string }>('SELECT wippimmo_id AS k FROM gestion_annuaire_lot WHERE id = $1', [libre])).k;
    expect((await lireCartesDuBien(lot_cle)).filter((c) => c.cote === 'locataire').map((c) => c.rattachement).sort())
      .toEqual([`contact de COLOC DEUX ${S}`, `garantit COLOC UN ${S}, COLOC DEUX ${S}`, 'à rattacher à un locataire'].sort());
    expect((await resumeDuBien(libre))?.location.contacts).toHaveLength(3);
    const f1 = ok(await ficheLocataireLocation(un1));
    const f2 = ok(await ficheLocataireLocation(deux));
    expect(f1.contactsRattaches?.map((c) => c.nom)).toEqual([`GARANT ${S}`]);
    expect(f2.contactsRattaches?.map((c) => c.nom).sort()).toEqual([`CONJOINT ${S}`, `GARANT ${S}`].sort());
    // Le loyer est porté par le bail : les deux colocataires le lisent, le second sans invitation à en saisir un autre.
    const locs = f2.locations.filter((l) => l.lotId === libre);
    expect(locs[0]?.location?.conditions?.loyerHc).toBe(900);
    expect(locs[0]?.location?.partageAvec).toEqual([expect.stringContaining('COLOC UN')]);
  });

  it('④ la base refuse DELETE et TRUNCATE sur les treize tables, sans exception', async () => {
    for (const t of ['gestion_annuaire_proprietaire', 'gestion_annuaire_lot', 'gestion_annuaire_lot_proprietaire', 'gestion_bail', 'gestion_annuaire_occupation',
      'gestion_annuaire_locataire', 'gestion_annuaire_contact', 'gestion_contact_carte', 'gestion_bail_garant', 'gestion_location_conditions_entree',
      'gestion_location_conditions', 'gestion_lot_entretien', 'gestion_lot_annexe']) {
      // Le verrou de la 393 est posé sur chacune (une table « ajout seul » peut refuser avant lui, par son propre déclencheur).
      expect((await un<{ n: number }>(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname IN ($2, $3)`,
        [t, `${t}_verrou_delete`, `${t}_verrou_truncate`])).n, t).toBe(2);
      await expect(query(`DELETE FROM ${t} WHERE false`), t).rejects.toThrow();
      await expect(query(`DELETE FROM ${t}`), t).rejects.toThrow();
      await expect(query(`TRUNCATE ${t} CASCADE`), t).rejects.toThrow();
    }
    await expect(query('DELETE FROM gestion_bail_garant WHERE false')).rejects.toThrow(/Rattachements protégés/);
    expect((await un<{ t: string }>(`SELECT confdeltype AS t FROM pg_constraint WHERE conname = 'gestion_annuaire_occupation_locataire_id_fkey'`)).t).toBe('r');
  });

  it('⑤ l’indivision se voit chez chaque copropriétaire (le bien 7 et ses liens en cours)', async () => {
    const p = ok(await ficheProprietaire(146));
    const b7 = p.biens.find((b) => b.id === 7);
    expect(b7?.indivisionAvec?.length).toBeGreaterThan(0);
    await query(`INSERT INTO gestion_annuaire_lot_proprietaire (lot_id, proprietaire_id, rang, depuis, cree_par_libelle) VALUES ($1, $2, 2, '2026-01-01', 'itest')`,
      [lot.A, 146]);
    const avec = ok(await ficheProprietaire(146)).biens.find((b) => b.id === lot.A);
    expect(avec?.indivisionAvec).toEqual([`PROPRIO ${S}`.toUpperCase()].map((x) => expect.stringContaining(x.split(' ')[0])));
    const chezLautre = ok(await ficheProprietaire(proprio)).biens.find((b) => b.id === lot.A);
    expect(chezLautre?.indivisionAvec).toEqual(['JULLIEN - GARRIDO Cédric']);
  });

  it('⑦ L’ESSAI « ESSAI RATTACHEMENT » DU LOT 7 : un bail ; la reprise le laisse à la main ; refait, il rattache ; ⑥ le recalcul', async () => {
    const { rows: b } = await query<{ b: string }>('SELECT DISTINCT bail_id::text AS b FROM gestion_annuaire_occupation WHERE id IN (549, 550)');
    expect(b).toHaveLength(1);
    expect((await un<{ b: string }>('SELECT bail_id::text AS b FROM gestion_location_conditions_entree WHERE 549 = ANY(occupation_ids)')).b).toBe(b[0].b);
    // Le script de reprise : la colocation du lot 7 → « à rattacher à la main » (jamais devinée).
    const { rows: loc7 } = await query<{ l: string }>('SELECT DISTINCT locataire_id::text AS l FROM gestion_annuaire_occupation WHERE bail_id = $1 AND sortie IS NULL', [b[0].b]);
    for (const q of ['Garant', 'Conjoint']) {
      expect(classerReprise({ lotId: 7, qualite: q }, [{ bailId: Number(b[0].b), locataires: loc7.map((x) => Number(x.l)) }])).toEqual({ sorte: 'main', motif: 'colocation' });
    }
    // Refait aujourd'hui : l'essai se clôt par une sortie DATÉE (jamais effacée), puis la même création, avec ses rattachements.
    await query(`UPDATE gestion_annuaire_occupation SET sortie = '2026-11-01' WHERE id IN (549, 550)`);
    const r = ok(await creerLocatairesSurBien({ cartes: [carte('ESSAI RATTACHEMENT Locataire Un', 4), carte('ESSAI RATTACHEMENT Locataire Deux', 5)], existants: [],
      contacts: [contact(`ESSAI RATTACHEMENT Garant ${S}`, 'Garant'), contact(`ESSAI RATTACHEMENT Conjoint ${S}`, 'Conjoint')],
      rattachements: [{ garantit: [0, 1] }, { locataire: 0 }],
      lotId: 7, entree: '2026-11-02', lotIds: [7], conditions: CONDITIONS, loyer: { principal: '1 200', provisions: '130' } }, AUTEUR));
    expect(r.dateBaremeSupposee).toBe(false);
    expect(r.rattaches).toBe(3);
    const mots = (await contactsRattachesDuBien(7))?.filter((c) => c.nom.includes(S)).map((c) => c.mot);
    expect(mots).toEqual([expect.stringMatching(/^garantit ESSAI RATTACHEMENT Locataire (Un|Deux), ESSAI RATTACHEMENT Locataire (Un|Deux)$/),
      'contact de ESSAI RATTACHEMENT Locataire Un']);
    // Les anciennes cartes 1480 / 1481 restent visibles, « à rattacher à un locataire ».
    expect((await contactsRattachesDuBien(7))?.filter((c) => c.carteId === 1480 || c.carteId === 1481).map((c) => c.mot))
      .toEqual(['à rattacher à un locataire', 'à rattacher à un locataire']);
    // ⑥ LE RECALCUL : honoraires enregistrés sans surface ; la surface connue depuis ; rien ne bouge tant qu'on ne demande pas.
    const occ7 = Number((await un<{ id: string }>('SELECT id::text FROM gestion_annuaire_occupation WHERE locataire_id = $1', [r.locataireIds[0]])).id);
    const avant = (await conditionsParOccupation([occ7])).get(occ7);
    expect(avant?.honoraires?.etat).toBe('surface_manquante');
    expect(avant?.surfaceActuelle ?? null).toBeNull();
    await query('UPDATE gestion_annuaire_lot SET surface_carrez_m2 = 61.8 WHERE id = 7');
    const connue = (await conditionsParOccupation([occ7])).get(occ7);
    expect([connue?.honoraires?.etat, Number(connue?.surfaceActuelle)]).toEqual(['surface_manquante', 61.8]);
    const n = Number((await un<{ n: string }>('SELECT count(*)::text AS n FROM gestion_location_conditions_entree WHERE bail_id = $1', [r.bailId])).n);
    expect((await modifierConditionsEntree(occ7, CONDITIONS, AUTEUR, true)).etat).toBe('ok');
    const apres = await un<{ s: string; d: string; sup: boolean; n: string }>(
      `SELECT hono_surface_m2::text AS s, hono_date_bareme::text AS d, hono_date_supposee AS sup,
              (SELECT count(*)::text FROM gestion_location_conditions_entree WHERE bail_id = $1) AS n
         FROM gestion_location_conditions_entree WHERE bail_id = $1 ORDER BY id DESC LIMIT 1`, [r.bailId]);
    expect([apres.s, apres.d, apres.sup, Number(apres.n)]).toEqual(['61.8', '2026-11-02', false, n + 1]);
    expect((await conditionsParOccupation([occ7])).get(occ7)?.honoraires?.etat).toBe('ok');
  });
});
