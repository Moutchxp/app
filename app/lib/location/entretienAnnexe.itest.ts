/**
 * ══ 🔴🔴 TUILE LOCATION — ENTRETIEN À PRÉVOIR, ANNEXES ANNOTÉES / DÉTACHÉES, MANDAT DE TRANSACTION (Arno, 18/10/2026) ═════
 *
 *   ① entretien : chaudière (date), ramonage, deux autres à la création ; repasser à Non (fiche commune) vide le tout —
 *      sans rien effacer (les lignes reçoivent `retire_le`) ;
 *   ② annotation d'une annexe : à la création, puis modifiée depuis la fiche ;
 *   ③ détacher / rattacher : le lien parent (`gestion_lot_annexe`) reste identique ; détachée, l'annexe reste sous son
 *      logement mais ne sort plus avec lui du portefeuille ;
 *   ④ mandat de transaction locative : exigé pour « Non », posé sur chaque fiche créée, lu et modifiable par la fiche.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 379). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l14 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/entretienAnnexe.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { complementsDuBien, creerBienComplet, creerProprietaires, modifierComplementsBien } from './creationBienRepo';
import { detacherAnnexe, lireEntretiens } from './entretienAnnexeRepo';
import { enregistrerMandat, ficheBienLocation, ficheProprietaireLocation, modifierBien } from './locationRepo';
import { sortirDuPortefeuille } from './portefeuilleRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest entretien annexes' };
const S = `e${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const tel = (v: string) => ({ sorte: 'telephone' as const, valeur: v, libelle: 'Mobile' });

describe.skipIf(!baseEssai)('🔴 entretien, annexes, mandat de transaction', () => {
  let proprietaires: number[] = [];
  let logement = 0;
  let parking = 0;
  let cave = 0;

  it('④ mandat de transaction : refusé sans numéro pour « Non », posé sur chaque fiche ; « Oui » n’en garde aucun', async () => {
    const cartes = [{ nom: `MT${S}A`, coordonnees: [tel('06 40 40 40 40')] }, { nom: `MT${S}B`, coordonnees: [tel('06 41 41 41 41')] }];
    expect(await creerProprietaires({ cartes, enGestion: false }, AUTEUR)).toEqual({ etat: 'refus', motif: 'Propriétaire non en gestion : le N° de mandat de transaction locative est à renseigner.' });
    proprietaires = ok(await creerProprietaires({ cartes, enGestion: false, numeroMandatTransaction: ' MT 2026-041 ', numeroMandat: 'abandonné' }, AUTEUR)).ids;
    const { rows } = await query<{ g: string | null; t: string | null }>('SELECT numero_mandat_gestion AS g, numero_mandat_transaction AS t FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[]) ORDER BY id', [proprietaires]);
    expect(rows).toEqual([{ g: null, t: 'MT 2026-041' }, { g: null, t: 'MT 2026-041' }]);
    const oui = ok(await creerProprietaires({ cartes: [{ nom: `MT${S}C`, coordonnees: [tel('06 42 42 42 42')] }], enGestion: true, numeroMandat: 'MG 1', numeroMandatTransaction: 'MT ignoré' }, AUTEUR)).ids;
    expect((await query<{ t: string | null }>('SELECT numero_mandat_transaction AS t FROM gestion_annuaire_proprietaire WHERE id = $1', [oui[0]])).rows[0].t).toBeNull();
    const f = await ficheProprietaireLocation(proprietaires[0]);
    if (f.etat !== 'ok') throw new Error(f.etat);
    expect(f.data.numeroMandatTransaction).toBe('MT 2026-041');
    expect((await enregistrerMandat(proprietaires[0], 'MT 2026-042', AUTEUR, 'transaction')).etat).toBe('ok');
    const g = await ficheProprietaireLocation(proprietaires[0]);
    expect(g.etat === 'ok' ? g.data.numeroMandatTransaction : null).toBe('MT 2026-042');
  });

  it('① entretien à la création, puis Non depuis la fiche : tout est vidé, rien n’est effacé', async () => {
    const b = ok(await creerBienComplet({ proprietaireIds: proprietaires, logement: { adresse: `4 rue Entretien${S}`, famille: 'logement', typeLogement: 'appartement',
      entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', dateAnniversaire: '2026-10-01' }, { sorte: 'ramonage' },
        { sorte: 'autre', nom: 'Climatisation', dateAnniversaire: '2027-05-02' }, { sorte: 'autre', nom: 'VMC' }] },
    annexes: [{ categorie: 'parking', parkingType: 'box_simple', annotation: 'Clé chez le gardien', detachee: true }, { categorie: 'cave', porte: '7' }] }, AUTEUR));
    expect(b.entretienRefus).toBeNull();
    logement = b.logementId;
    [parking, cave] = b.annexes;
    expect(await lireEntretiens(logement)).toEqual({ aPrevoir: true, entretiens: [
      { sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-10-01' }, { sorte: 'ramonage', nom: null, dateAnniversaire: null },
      { sorte: 'autre', nom: 'Climatisation', dateAnniversaire: '2027-05-02' }, { sorte: 'autre', nom: 'VMC', dateAnniversaire: null }] });
    // Modifier une date : seule cette ligne change (l'ancienne est retirée, la nouvelle ajoutée).
    const c = (await complementsDuBien(logement))!;
    expect(c.entretiens).toHaveLength(4);
    expect((await modifierComplementsBien(logement, { ...c, typeLogement: 'appartement', entretienAPrevoir: 'oui', entretiens: [
      { sorte: 'chaudiere', dateAnniversaire: '2026-11-01' }, { sorte: 'ramonage' }, { sorte: 'autre', nom: 'Climatisation', dateAnniversaire: '2027-05-02' }, { sorte: 'autre', nom: 'VMC' }] }, AUTEUR)).etat).toBe('ok');
    const n = async (vivantes: boolean) => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_lot_entretien WHERE lot_id = $1 AND retire_le IS ${vivantes ? '' : 'NOT '}NULL`, [logement])).rows[0].n);
    expect([await n(true), await n(false)]).toEqual([4, 1]);
    expect((await modifierComplementsBien(logement, { ...c, typeLogement: 'appartement', entretienAPrevoir: 'non', entretiens: [{ sorte: 'chaudiere' }] }, AUTEUR)).etat).toBe('ok');
    expect(await lireEntretiens(logement)).toEqual({ aPrevoir: false, entretiens: [] });
    expect([await n(true), await n(false)]).toEqual([0, 5]);
  });

  it('② annotation de l’annexe : à la création, puis modifiée depuis la fiche', async () => {
    const lire = async () => (await query<{ a: string | null }>('SELECT annotation AS a FROM gestion_annuaire_lot WHERE id = $1', [parking])).rows[0].a;
    expect(await lire()).toBe('Clé chez le gardien');
    expect((await modifierBien(parking, { categorie: 'parking', annotation: 'Badge bleu\nporte du fond' }, AUTEUR)).etat).toBe('ok');
    expect(await lire()).toBe('Badge bleu\nporte du fond');
  });

  it('③ détachée : lien parent identique, toujours sous le logement ; ne sort plus avec lui ; rattachée, elle le suit de nouveau', async () => {
    const lien = async () => (await query('SELECT id, annexe_id, parent_id, pose_le FROM gestion_lot_annexe WHERE annexe_id = $1', [parking])).rows;
    const avant = await lien();
    expect(avant).toHaveLength(1);
    const f = await ficheBienLocation(logement);
    if (f.etat !== 'ok') throw new Error(f.etat);
    expect(f.data.annexes.find((a) => a.id === parking)).toMatchObject({ detachee: true, parentId: logement });
    // Le logement sort du portefeuille : la cave le suit, le parking détaché reste.
    ok(await sortirDuPortefeuille('bien', logement, AUTEUR));
    const sortis = async () => (await query<{ id: string; s: boolean }>('SELECT id::text, sorti_portefeuille_le IS NOT NULL AS s FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) ORDER BY id', [[parking, cave]])).rows.map((r) => r.s);
    expect(await sortis()).toEqual([false, true]);
    // Rattacher puis détacher : seule la marque change ; le lien est rigoureusement le même.
    expect((await detacherAnnexe(parking, false, AUTEUR)).etat).toBe('ok');
    expect((await query<{ d: boolean }>('SELECT annexe_detachee_le IS NOT NULL AS d FROM gestion_annuaire_lot WHERE id = $1', [parking])).rows[0].d).toBe(false);
    expect((await detacherAnnexe(parking, true, AUTEUR)).etat).toBe('ok');
    expect(await lien()).toEqual(avant);
    expect((await detacherAnnexe(logement, true, AUTEUR)).etat).toBe('inconnu');
  });
});
