/**
 * ══ 🔴🔴 LOT L0 (17/10/2026) — L'IMPORT WIPPIMMO ET LES FICHES CRÉÉES DANS L'APPLICATION, SUR UNE BASE JETABLE ══════
 *
 *   ① une fiche créée à la main, absente de l'export → l'import ne la marque PAS absente ;
 *   ② une fiche issue de WIPPIMMO qui disparaît de l'export → marquée absente, comme avant ;
 *   ③ une fiche créée à la main puis RETROUVÉE dans l'export → rapprochée sous sa clé « app-… », sans doublon —
 *      propriétaire (et son bien), locataire et bail ; un second import ne change plus rien ;
 *   ④ même nom sans coordonnée commune → pas de rapprochement deviné : fiche créée depuis l'export ET signalée.
 *
 * VRAIES fonctions (création à la main de l'annuaire, import complet `appliquerPlan`), VRAIE base (schéma copié, vide,
 * migration 369). 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l0 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/annuaireImportApplication.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { appliquerPlan } from './annuaireRepo';
import { ajouterOccupant, creerPersonne } from './annuaireEditionRepo';
import { verifierCoordonnees } from './annuaireEdition';
import { clePersonne, nomComplet, normaliserTexte, type ContactAnnuaire } from './annuaire';
import type { LocatairePlan, LotPlan, OccupationPlan, PlanImport, ProprietairePlan } from './annuaireImport';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest L0' };
const S = `l0${Date.now().toString(36)}`;

/** Une coordonnée telle que l'export la porte : la forme canonique est celle de la saisie (même normalisation). */
function contact(sorte: 'telephone' | 'email', brut: string): ContactAnnuaire {
  const v = verifierCoordonnees([{ sorte, valeur: brut, libelle: '' }]);
  if (!v.ok) throw new Error(v.motif);
  return { sorte, valeur: v.retenues[0].valeur, valeurBrute: brut, rang: 0 } as ContactAnnuaire;
}
const proprio = (id: string, nom: string, prenom: string, contacts: ContactAnnuaire[] = []): ProprietairePlan => ({
  wippimmoId: id, civilite: null, nom, prenom, nomComplet: nomComplet(nom, prenom),
  nomNormalise: normaliserTexte(nomComplet(nom, prenom)), adresse: null, commune: null, codePostal: null,
  adresseNormalisee: '', relationDepuis: null, contacts,
});
const lot = (id: string, p: ProprietairePlan): LotPlan => ({
  wippimmoId: id, proprietaireTexte: p.nomComplet, proprietaireCle: p.nomNormalise, immeuble: null, nature: null,
  typeBien: 'Appartement', adresse: `${id} rue de l’Essai`, commune: 'Paris', codePostal: '75011',
  adresseNormalisee: normaliserTexte(`${id} rue de l’Essai`), gestionDebut: null, gestionFin: null,
});
const locataire = (id: string, nom: string, contacts: ContactAnnuaire[]): LocatairePlan => ({
  clePersonne: clePersonne(normaliserTexte(nom), contacts, id), wippimmoId: id, nom,
  nomNormalise: normaliserTexte(nom), adresse: null, commune: null, codePostal: null, adresseNormalisee: '', contacts,
});
const plan = (o: Partial<PlanImport>): PlanImport => ({
  proprietaires: [], lots: [], locataires: [], occupations: [], rejets: [], homonymes: [],
  lotsSansProprietaire: 0, occupationsHorsGestion: 0, locatairesRegroupes: 0, ...o,
});
const importer = async (p: PlanImport) => {
  const r = await appliquerPlan(p, { appliquer: true, dossier: 'itest-l0', auteur: 'itest L0' });
  if (r.etat !== 'ok') throw new Error('schéma absent');
  return r.comptes;
};
const creer = async (sujet: 'proprietaire' | 'locataire', nom: string, prenom: string | null, coords: { sorte: 'telephone' | 'email'; valeur: string }[]) => {
  const r = await creerPersonne(sujet, { nom, prenom, coordonnees: coords.map((c) => ({ ...c, libelle: '' })) }, AUTEUR);
  if (r.etat !== 'ok') throw new Error(`création refusée : ${JSON.stringify(r)}`);
  return r.data.id;
};
const ligne = async (table: string, id: number) =>
  (await query<Record<string, string | null>>(
    `SELECT wippimmo_id, absent_le::text, cle_import FROM ${table} WHERE id = $1`, [id])).rows[0];
const compter = async (sql: string, p: unknown[]) => Number((await query<{ n: string }>(sql, p)).rows[0].n);

afterAll(async () => { if (baseEssai) await closePool(); });

describe.skipIf(!baseEssai)('🔴 import WIPPIMMO et fiches créées dans l’application', () => {
  // L'export de référence : un propriétaire WIPPIMMO et son bien, présents à chaque import.
  const fixe = proprio(`${S}-900`, `FIXE${S}`, 'Paul');
  const lotFixe = lot(`${S}-L900`, fixe);

  it('① une fiche créée à la main et absente de l’export n’est PAS marquée absente', async () => {
    const id = await creer('proprietaire', `MANUEL${S}`, 'Anne', [{ sorte: 'telephone', valeur: '06 12 34 56 01' }]);
    const loc = await creer('locataire', `LOCMANUEL${S}`, null, [{ sorte: 'email', valeur: `loc.${S}@exemple.test` }]);
    await importer(plan({ proprietaires: [fixe], lots: [lotFixe] }));
    await importer(plan({ proprietaires: [fixe], lots: [lotFixe] }));
    expect((await ligne('gestion_annuaire_proprietaire', id)).absent_le).toBeNull();
    expect((await ligne('gestion_annuaire_locataire', loc)).absent_le).toBeNull();
  });

  it('② une fiche issue de WIPPIMMO qui disparaît de l’export est marquée absente, comme avant', async () => {
    const partant = proprio(`${S}-901`, `PARTANT${S}`, 'Luc');
    await importer(plan({ proprietaires: [fixe, partant], lots: [lotFixe] }));
    const { rows } = await query<{ id: string; absent_le: string | null }>(
      'SELECT id::text, absent_le::text FROM gestion_annuaire_proprietaire WHERE wippimmo_id = $1', [partant.wippimmoId]);
    expect(rows[0].absent_le).toBeNull();
    await importer(plan({ proprietaires: [fixe], lots: [lotFixe] }));
    expect((await ligne('gestion_annuaire_proprietaire', Number(rows[0].id))).absent_le).not.toBeNull();
  });

  it('③ une fiche créée à la main puis retrouvée dans l’export est rapprochée, sans doublon (propriétaire, bien, locataire, bail)', async () => {
    const nomP = `MARTIN${S}`;
    const idP = await creer('proprietaire', nomP, 'Claire', [{ sorte: 'telephone', valeur: '06 12 34 56 02' }]);
    const nomL = `DURAND${S} Paul`;
    const idL = await creer('locataire', nomL, null, [{ sorte: 'email', valeur: `paul.${S}@exemple.test` }]);
    // Le bien vient de WIPPIMMO ; le bail est saisi dans l'application, sans date de sortie.
    const pW = proprio(`${S}-902`, nomP, 'Claire', [contact('telephone', '06 12 34 56 02')]);
    const lotW = lot(`${S}-L902`, pW);
    const base = plan({ proprietaires: [fixe], lots: [lotFixe, { ...lotW, proprietaireCle: null }] });
    await importer(base);
    const idLot = Number((await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_lot WHERE wippimmo_id = $1',
      [lotW.wippimmoId])).rows[0].id);
    const occ = await ajouterOccupant(idLot, idL, '2026-03-01', AUTEUR);
    expect(occ.etat).toBe('ok');

    // WIPPIMMO exporte maintenant la propriétaire, le locataire et le bail (avec une sortie).
    const lW = locataire(`${S}-L77`, nomL, [contact('email', `paul.${S}@exemple.test`)]);
    const oW: OccupationPlan = { wippimmoId: `${S}-B77`, clePersonne: lW.clePersonne, lotWippimmoId: lotW.wippimmoId,
      lotConnu: true, entree: '2026-03-01', sortie: '2026-09-30' };
    const complet = plan({ proprietaires: [fixe, pW], lots: [lotFixe, lotW], locataires: [lW], occupations: [oW] });
    const c1 = await importer(complet);
    expect(c1.rapproches).toBe(3); // propriétaire, locataire, bail

    // Aucun doublon : une seule fiche de chaque, la fiche de l'application garde sa clé « app-… ».
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire WHERE nom_normalise = $1',
      [normaliserTexte(nomComplet(nomP, 'Claire'))])).toBe(1);
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_locataire WHERE nom_normalise = $1',
      [normaliserTexte(nomL)])).toBe(1);
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_occupation WHERE lot_id = $1', [idLot])).toBe(1);
    const p = await ligne('gestion_annuaire_proprietaire', idP);
    expect(p.wippimmo_id).toMatch(/^app-/);
    expect(p.cle_import).toBe(pW.wippimmoId);
    expect(p.absent_le).toBeNull();
    const l = await ligne('gestion_annuaire_locataire', idL);
    expect(l.wippimmo_id).toMatch(/^app-/);
    expect(l.cle_import).toBe(lW.clePersonne);
    // Le bien de WIPPIMMO est rattaché à la fiche de l'application, et le bail en a reçu la sortie (date vide ici).
    expect((await query<{ p: string }>('SELECT proprietaire_id::text AS p FROM gestion_annuaire_lot WHERE id = $1',
      [idLot])).rows[0].p).toBe(String(idP));
    const o = (await query<{ wippimmo_id: string; cle_import: string; entree: string; sortie: string; locataire_id: string }>(
      `SELECT wippimmo_id, cle_import, entree::text, sortie::text, locataire_id::text
         FROM gestion_annuaire_occupation WHERE lot_id = $1`, [idLot])).rows[0];
    expect(o).toMatchObject({ cle_import: oW.wippimmoId, entree: '2026-03-01', sortie: '2026-09-30', locataire_id: String(idL) });
    expect(o.wippimmo_id).toMatch(/^app-/);

    // Un second import identique : plus rien à rapprocher, aucun doublon, la fiche reste présente.
    const c2 = await importer(complet);
    expect(c2.rapproches).toBe(0);
    expect(c2.proprietairesCrees + c2.locatairesCrees + c2.occupationsCreees).toBe(0);
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire WHERE nom_normalise = $1',
      [normaliserTexte(nomComplet(nomP, 'Claire'))])).toBe(1);
    // Et une fois rapprochée, la fiche absente d'un export suivant n'est toujours pas marquée absente.
    await importer(plan({ proprietaires: [fixe], lots: [lotFixe] }));
    expect((await ligne('gestion_annuaire_proprietaire', idP)).absent_le).toBeNull();
  });

  it('④ même nom sans coordonnée commune : aucun rapprochement deviné, la fiche est créée et le rapport le dit', async () => {
    const nom = `HOMONYME${S}`;
    const idApp = await creer('proprietaire', nom, 'Jean', [{ sorte: 'telephone', valeur: '06 12 34 56 03' }]);
    const autre = proprio(`${S}-903`, nom, 'Jean', [contact('telephone', '06 99 99 99 99')]);
    const c = await importer(plan({ proprietaires: [fixe, autre], lots: [lotFixe] }));
    expect(c.rapproches).toBe(0);
    expect(c.divergences.some((d) => d.includes('aucune coordonnée commune'))).toBe(true);
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire WHERE nom_normalise = $1',
      [normaliserTexte(nomComplet(nom, 'Jean'))])).toBe(2);
    expect((await ligne('gestion_annuaire_proprietaire', idApp)).cle_import).toBeNull();
  });
});
