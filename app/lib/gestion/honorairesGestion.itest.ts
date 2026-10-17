/**
 * ══ 🔴🔴 LOT L1 (validé par Arno le 17/10/2026) — LOYER DE DÉPART, TAUX ET HONORAIRES DE GESTION, SUR UNE BASE JETABLE ═══
 *
 *   ① NON-RÉGRESSION DE L'IMPORT COMPLET : les VRAIS exports WIPPIMMO (dossier `L1_DOSSIER_EXPORTS`, défaut
 *      ~/Downloads), importés SANS les colonnes « Tx honos » / « Base honos » (l'import d'avant), puis AVEC : seul le
 *      taux des lots change — mêmes créations, aucune mise à jour, aucune fiche marquée absente en plus, aucun
 *      rapprochement en plus ; un troisième import ne change plus rien ;
 *   ② la REPRISE du taux WIPPIMMO sur les locations en cours : simulation sans écriture, puis écriture (loyer vide),
 *      puis seconde passe sans effet ;
 *   ③ la SAISIE : une ligne AJOUTÉE (la précédente reste), journalisée ; la base refuse UPDATE et DELETE ;
 *   ④ le TAUX PROPOSÉ : location précédente du lot › taux WIPPIMMO ; « Ajouter un occupant » avec ses conditions, et un
 *      refus qui défait tout le geste ;
 *   ⑤ la VUE des honoraires : loyers absents exclus et comptés, montant = loyer × taux ;
 *   ⑥ la reprise avec `--dossier` (taux lu dans Lots.xlsx) ne touche QUE les deux colonnes de taux des lots.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 370). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`. Aucun mail, aucun Drive.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l1 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/honorairesGestion.itest.ts
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { appliquerPlan } from './annuaireRepo';
import { ajouterOccupant, creerPersonne } from './annuaireEditionRepo';
import { construirePlan, tauxHonosDesLots } from './annuaireImport';
import { lireSources } from '../../scripts/importer-annuaire';
import type { FeuilleLue } from './xlsxLecture';
import {
  enregistrerConditions, lireLocationsPourHonoraires, lireReglages, locationsAffichees, reprendreTauxWippimmo,
} from './honorairesGestionRepo';
import { calculerHonoraires } from './honorairesGestion';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const DOSSIER = process.env.L1_DOSSIER_EXPORTS ?? join(homedir(), 'Downloads');
const exportsPresents = ['Lots.xlsx', 'Bailleurs.xlsx', 'Locataires.xlsx'].every((f) => existsSync(join(DOSSIER, f)));
const AUTEUR = { id: null, libelle: 'itest L1' };

/** L'export tel que l'import d'avant ce lot le lisait : sans « Tx honos » ni « Base honos ». */
const sansHonos = (f: FeuilleLue): FeuilleLue => ({
  ...f, entetes: f.entetes.map((e) => (e === 'Tx honos' || e === 'Base honos' ? `ignoree ${e}` : e)),
});
const importer = async (plan: ReturnType<typeof construirePlan>) => {
  const r = await appliquerPlan(plan, { appliquer: true, dossier: 'itest-l1', auteur: 'itest L1' });
  if (r.etat !== 'ok') throw new Error('schéma absent');
  return r.comptes;
};
const compter = async (sql: string, p: unknown[] = []) => Number((await query<{ n: string }>(sql, p)).rows[0].n);
const absentes = () => compter(`SELECT (
  (SELECT count(*) FROM gestion_annuaire_proprietaire WHERE absent_le IS NOT NULL)
  + (SELECT count(*) FROM gestion_annuaire_locataire WHERE absent_le IS NOT NULL)
  + (SELECT count(*) FROM gestion_annuaire_lot WHERE absent_le IS NOT NULL)
  + (SELECT count(*) FROM gestion_annuaire_occupation WHERE absent_le IS NOT NULL))::text AS n`);

afterAll(async () => { if (baseEssai) await closePool(); });

describe.skipIf(!baseEssai || !exportsPresents)('🔴 lot L1 — honoraires de gestion', () => {
  let tauxLus = 0;

  it('① import complet : avec « Tx honos », seul le taux des lots change (non-régression)', async () => {
    const sources = lireSources(DOSSIER);
    const avant = construirePlan({ ...sources, lots: sansHonos(sources.lots) });
    expect(avant.lots.every((l) => l.tauxHonos === null)).toBe(true);
    const c0 = await importer(avant);
    expect(c0.tauxHonos).toBe(0);
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_lot WHERE taux_honos_wippimmo IS NOT NULL')).toBe(0);
    const absentesAvant = await absentes();

    const apres = construirePlan(sources);
    tauxLus = apres.lots.filter((l) => l.tauxHonos !== null).length;
    expect(tauxLus).toBeGreaterThan(0);
    const c1 = await importer(apres);
    // Seul le taux change : rien de créé, rien de mis à jour, rien de disparu, rien de rapproché.
    expect(c1.tauxHonos).toBe(apres.lots.filter((l) => (l.tauxHonos ?? null) !== null || (l.baseHonos ?? null) !== null).length);
    expect(c1.proprietairesCrees + c1.lotsCrees + c1.locatairesCrees + c1.occupationsCreees + c1.contactsCrees).toBe(0);
    expect(c1.proprietairesMajs + c1.lotsMajs + c1.locatairesMajs + c1.occupationsMajs + c1.contactsMajs).toBe(0);
    expect(c1.lotsInchanges).toBe(c0.lotsCrees + c0.lotsMajs + c0.lotsInchanges);
    expect(c1.disparus).toBe(c0.disparus);
    expect(c1.rapproches).toBe(0);
    expect(await absentes()).toBe(absentesAvant);
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_lot WHERE taux_honos_wippimmo IS NOT NULL')).toBe(tauxLus);

    const c2 = await importer(apres);
    expect(c2.tauxHonos).toBe(0);
    expect(c2.proprietairesMajs + c2.lotsMajs + c2.locatairesMajs + c2.occupationsMajs).toBe(0);
    expect(await absentes()).toBe(absentesAvant);
  });

  it('② reprise : simulation sans écriture, puis taux WIPPIMMO posé (loyer vide), puis seconde passe sans effet', async () => {
    const enCours = await compter(`SELECT count(*)::text AS n FROM gestion_annuaire_occupation o
      JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id WHERE o.sortie IS NULL`);
    const sim = await reprendreTauxWippimmo({ appliquer: false, auteur: AUTEUR.libelle });
    expect(sim?.enCours).toBe(enCours);
    expect(await compter('SELECT count(*)::text AS n FROM gestion_location_conditions')).toBe(0);
    const r = await reprendreTauxWippimmo({ appliquer: true, auteur: AUTEUR.libelle });
    expect(r?.reprises).toBe((r?.enCours ?? 0) - (r?.dejaPourvues ?? 0) - (r?.sansTauxWippimmo ?? 0));
    expect(r?.reprises).toBeGreaterThan(0);
    expect(await compter(`SELECT count(*)::text AS n FROM gestion_location_conditions
      WHERE origine = 'reprise' AND loyer_hc IS NULL`)).toBe(r?.reprises);
    const encore = await reprendreTauxWippimmo({ appliquer: true, auteur: AUTEUR.libelle });
    expect(encore?.reprises).toBe(0);
  });

  it('③ saisie : une ligne ajoutée, journalisée ; la base refuse UPDATE et DELETE', async () => {
    const occ = Number((await query<{ id: string }>(`SELECT c.occupation_id::text AS id FROM gestion_location_conditions c
      WHERE c.origine = 'reprise' ORDER BY c.id LIMIT 1`)).rows[0].id);
    const journalAvant = await compter(`SELECT count(*)::text AS n FROM gestion_journal WHERE action = 'annuaire_conditions_location'`);
    const issue = await enregistrerConditions(occ, { loyerHc: '1 180', provisions: '90', tauxHt: '4,5', base: 'cc' }, AUTEUR);
    expect(issue.etat).toBe('ok');
    expect(await compter(`SELECT count(*)::text AS n FROM gestion_journal WHERE action = 'annuaire_conditions_location'`))
      .toBe(journalAvant + 1);
    const vue = (await locationsAffichees([occ])).get(occ);
    expect(vue?.versions).toBe(2);
    expect(vue?.conditions).toMatchObject({ loyerHc: 1180, provisions: 90, tauxHt: 4.5, base: 'cc', origine: 'saisie' });
    expect(vue?.tvaPct).toBe(20);
    const refus = await enregistrerConditions(occ, { tauxHt: '', base: 'cc' }, AUTEUR);
    expect(refus.etat).toBe('refus');
    await expect(query('UPDATE gestion_location_conditions SET loyer_hc = 1 WHERE occupation_id = $1', [occ])).rejects.toThrow(/ajout seul/);
    await expect(query('DELETE FROM gestion_location_conditions WHERE occupation_id = $1', [occ])).rejects.toThrow(/ajout seul/);
  });

  it('④ taux proposé (location précédente › WIPPIMMO) et « Ajouter un occupant » avec ses conditions', async () => {
    // Un lot dont la location en cours a des conditions saisies : le suivant reçoit ce taux en proposition.
    const { rows } = await query<{ lot_id: string; occ: string }>(`SELECT o.lot_id::text, o.id::text AS occ
      FROM gestion_annuaire_occupation o JOIN gestion_location_conditions c ON c.occupation_id = o.id
     WHERE c.origine = 'saisie' ORDER BY c.id DESC LIMIT 1`);
    const lotId = Number(rows[0].lot_id);
    const p = await creerPersonne('locataire', { nom: 'NOUVEAU L1', prenom: null,
      coordonnees: [{ sorte: 'email', valeur: 'nouveau.l1@exemple.test', libelle: '' }] }, AUTEUR);
    if (p.etat !== 'ok') throw new Error('création refusée');
    const sansConditions = await ajouterOccupant(lotId, p.data.id, '2030-01-01', AUTEUR);
    expect(sansConditions.etat).toBe('ok');
    const nouvelle = Number((await query<{ id: string }>(`SELECT id::text FROM gestion_annuaire_occupation
      WHERE locataire_id = $1 ORDER BY id DESC LIMIT 1`, [p.data.id])).rows[0].id);
    const vue = (await locationsAffichees([nouvelle])).get(nouvelle);
    expect(vue?.conditions).toBeNull();
    expect(vue?.tauxPropose).toEqual({ taux: 4.5, source: 'precedente' });

    // Un lot sans aucune condition mais avec un taux WIPPIMMO : proposé depuis WIPPIMMO.
    const lotW = Number((await query<{ id: string; taux: string }>(`SELECT lo.id::text FROM gestion_annuaire_lot lo
      WHERE lo.taux_honos_wippimmo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gestion_annuaire_occupation o
        JOIN gestion_location_conditions c ON c.occupation_id = o.id WHERE o.lot_id = lo.id) LIMIT 1`)).rows[0].id);
    const tauxW = Number((await query<{ t: string }>('SELECT taux_honos_wippimmo::text AS t FROM gestion_annuaire_lot WHERE id = $1', [lotW])).rows[0].t);
    const p2 = await creerPersonne('locataire', { nom: 'AUTRE L1', prenom: null,
      coordonnees: [{ sorte: 'email', valeur: 'autre.l1@exemple.test', libelle: '' }] }, AUTEUR);
    if (p2.etat !== 'ok') throw new Error('création refusée');
    // Avec des conditions invalides : refus, et RIEN n'est créé (ni occupation, ni conditions).
    const occAvant = await compter('SELECT count(*)::text AS n FROM gestion_annuaire_occupation WHERE locataire_id = $1', [p2.data.id]);
    const refus = await ajouterOccupant(lotW, p2.data.id, '2030-02-01', AUTEUR, { tauxHt: 'beaucoup', base: 'cc' });
    expect(refus.etat).toBe('refus');
    expect(await compter('SELECT count(*)::text AS n FROM gestion_annuaire_occupation WHERE locataire_id = $1', [p2.data.id])).toBe(occAvant);
    // Avec des conditions valides : écrites avec l'occupant.
    const ok = await ajouterOccupant(lotW, p2.data.id, '2030-02-01', AUTEUR, { loyerHc: '900', provisions: '', tauxHt: String(tauxW), base: 'hc' });
    expect(ok.etat).toBe('ok');
    const occ2 = Number((await query<{ id: string }>(`SELECT id::text FROM gestion_annuaire_occupation
      WHERE locataire_id = $1 ORDER BY id DESC LIMIT 1`, [p2.data.id])).rows[0].id);
    expect((await locationsAffichees([occ2])).get(occ2)?.conditions).toMatchObject({ loyerHc: 900, tauxHt: tauxW, base: 'hc', origine: 'saisie' });
  });

  it('⑤ la vue des honoraires : loyers absents exclus et comptés, montant = (loyer + provisions) × taux', async () => {
    const locations = await lireLocationsPourHonoraires('2026-01-01', '2026-12-31');
    if (locations === null) throw new Error('schéma absent');
    const reglages = await lireReglages();
    const r = calculerHonoraires(locations, { annee: 2026, mois: 10 }, reglages.tva);
    expect(r.comptees).toBe(1);   // la seule location en cours avec un loyer saisi en 2026
    expect(r.totalHt).toBeCloseTo(57.15, 10);
    expect(r.totalTtc).toBeCloseTo(68.58, 10);
    expect(r.manquantes).toBeGreaterThan(0);
    expect(r.parLot.filter((l) => l.manquantes > 0).every((l) => l.ht === 0)).toBe(true);
  });

  it('⑥ reprise avec le taux lu dans Lots.xlsx : seules les deux colonnes de taux des lots changent', async () => {
    const sources = lireSources(DOSSIER);
    const taux = tauxHonosDesLots(sources.lots);
    expect(taux.length).toBe(construirePlan(sources).lots.length);
    // On efface à la main le taux d'un lot (base jetable), puis la reprise le repose — et rien d'autre ne bouge.
    const cible = taux.find((t) => t.tauxHonos !== null);
    if (cible === undefined) throw new Error('aucun taux dans l’export');
    await query('UPDATE gestion_annuaire_lot SET taux_honos_wippimmo = NULL WHERE wippimmo_id = $1', [cible.wippimmoId]);
    const empreinte = async () => (await query<{ e: string }>(`SELECT md5(string_agg(concat_ws('|', wippimmo_id, proprietaire_id,
      adresse, commune, nature, type_bien, gestion_debut, gestion_fin, absent_le, importe_le), ',' ORDER BY wippimmo_id)) AS e
      FROM gestion_annuaire_lot`)).rows[0].e;
    const avant = await empreinte();
    const conditionsAvant = await compter('SELECT count(*)::text AS n FROM gestion_location_conditions');
    const sim = await reprendreTauxWippimmo({ appliquer: false, auteur: AUTEUR.libelle, tauxLots: taux });
    expect(sim?.tauxLots).toBe(1);
    expect((await query<{ t: string | null }>('SELECT taux_honos_wippimmo::text AS t FROM gestion_annuaire_lot WHERE wippimmo_id = $1',
      [cible.wippimmoId])).rows[0].t).toBeNull();
    const r = await reprendreTauxWippimmo({ appliquer: true, auteur: AUTEUR.libelle, tauxLots: taux });
    expect(r?.tauxLots).toBe(1);
    expect(Number((await query<{ t: string }>('SELECT taux_honos_wippimmo::text AS t FROM gestion_annuaire_lot WHERE wippimmo_id = $1',
      [cible.wippimmoId])).rows[0].t)).toBe(cible.tauxHonos);
    expect(await empreinte()).toBe(avant);
    // Les locations déjà pourvues ne sont pas touchées : seules d'éventuelles nouvelles locations en cours reçoivent une ligne.
    expect(await compter('SELECT count(*)::text AS n FROM gestion_location_conditions')).toBe(conditionsAvant + (r?.reprises ?? 0));
  });
});
