/**
 * ══ 🔴 MON ESPACE, LOT 10 — LE MODE AGENCE SUR UNE BASE JETABLE (Arno, 02/11/2026) ════════════════════════════════════════════════════════════════
 *
 *   ① réservé aux administrateurs : un collaborateur n'obtient rien (null → 403), un administrateur la structure entière ;
 *   ② CRITERIMMO, MACJ, FUSION : chaque chiffre = celui du Suivi CA sur les données de SA page (`lireDonneesSociete`, la lecture de la route),
 *      au centime, HT et TTC, en Mois / Période / Année / Tout ; une vente partagée entre les deux sociétés (inter-cabinet, ligne miroir) comprise ;
 *   ③ la somme des espaces personnels de tous les collaborateurs = le CA de FUSION en mode agence ;
 *   ④ propagation : un geste d'un espace personnel ou de la tuile se voit aussitôt en mode agence (compteurs, empreinte), et un geste de
 *      l'administrateur en mode agence se voit aussitôt dans l'espace du collaborateur.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE ; la 449 appliquée par l'épreuve si besoin). 🔒 REFUSE de tourner ailleurs que sur
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_agence \
 *     npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/agence.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { resultatDesCartes } from '../transaction/carteAffaireLignes';
import { totalCompromisEnCours } from '../transaction/compromisEnCours';
import { lireDonneesSociete } from '../transaction/donneesSociete';
import { ventesDesAnnees } from '../transaction/periodeAnnees';
import { ventesPeriode } from '../transaction/periodeMois';
import { enregistrerDossier, lireVentes } from '../transaction/repo';
import { lireDossier } from '../transaction/saisie';
import { resolveurDe } from '../transaction/statutLigne';
import type { DonneesSociete } from '../transaction/modele';
import { AGENCES, societeDeLAgence, type Agence } from './agence';
import { empreinteAgence, lireAgence } from './agenceRepo';
import { gesteDepuisMonEspace } from './gestesRepo';
import { lireMesAffaires } from './mesAffairesRepo';
import { sommeC, totauxDuChoix, type ChoixStats } from './statistiques';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });
const dossier = (o: Record<string, unknown>) => { const d = lireDossier(o); if (!d.ok) throw new Error(d.motif); return d.valeur; };

describe.skipIf(!baseEssai)('🔴 le mode agence : les chiffres du Suivi CA, la somme des espaces, la propagation', () => {
  let arno = 0; let lea = 0; let marc = 0; let zoe = 0; let compromis = 0;
  const auteur = { id: null, libelle: 'itest agence' };
  const corps = (o: Record<string, unknown>) => ({ societe: 'criterimmo', statut: 'vendue', retroApporteurTtc: 0, dateCompromis: '2026-01-10', personnes: [{ role: 'vendeur', nom: 'VENDEUR AGENCE' }], ...o });
  const creer = async (o: Record<string, unknown>) => { const r = await enregistrerDossier(null, dossier(corps(o)), JOUR, auteur); if (!r.ok) throw new Error(r.motif); return r.valeur as number; };
  /** Ce que la page de la structure du Suivi CA lit, et la somme de ses cartes pour ces ventes. */
  const suiviCa = async (a: Agence) => {
    const d: DonneesSociete = await lireDonneesSociete(societeDeLAgence(a), JOUR);
    const opts = { retros: d.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
    return { d, cartes: (vs: DonneesSociete['ventes']) => resultatDesCartes(vs, d.societe, opts).ca };
  };

  it('⓪ la base jetable : un administrateur, trois collaborateurs ; une vente partagée CRITERIMMO / MACJ, une de Zoé, une de Marc, un compromis', async () => {
    const compte = async (prenom: string, societe: string, role = 'collaborateur'): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', $3) RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom, role]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    arno = await compte('Arno', 'criterimmo', 'administrateur');
    lea = await compte('Lea', 'criterimmo'); marc = await compte('Marc', 'macj'); zoe = await compte('Zoe', 'criterimmo');
    await query(readFileSync('db/migrations/449_transaction_numero_mandat.sql', 'utf8'));
    oublierSchemaDroits();
    await creer({ honorairesTtc: 12345.67, dateActe: '2026-03-15', numeroMandat: 'G-1', entreeId: lea, sortieId: marc,
      parties: [{ sorte: 'entree', compteId: lea, pourcentage: 60 }, { sorte: 'sortie', compteId: marc, pourcentage: 40 }] });
    await creer({ honorairesTtc: 7000.01, dateActe: '2026-06-20', numeroMandat: 'G-2', entreeId: zoe, sortieId: null, parties: [{ sorte: 'entree', compteId: zoe, pourcentage: 100 }] });
    await creer({ societe: 'macj', honorairesTtc: 5555.55, dateActe: '2025-09-02', numeroMandat: 'G-3', entreeId: marc, sortieId: null, parties: [{ sorte: 'entree', compteId: marc, pourcentage: 100 }] });
    compromis = await creer({ statut: 'compromis', honorairesTtc: 9000, dateActePrevue: '2027-02-01', numeroMandat: 'G-4', entreeId: lea, sortieId: marc,
      parties: [{ sorte: 'entree', compteId: lea, pourcentage: 50 }, { sorte: 'sortie', compteId: marc, pourcentage: 50 }] });
  });

  it('① un collaborateur : rien (403 à la route) ; l’administrateur : la structure', async () => {
    expect(await lireAgence(lea, 'tous', JOUR)).toBeNull();
    expect(await empreinteAgence(lea, 'macj')).toBeNull();
    const a = await lireAgence(arno, 'tous', JOUR);
    expect(a?.agence).toEqual({ cle: 'tous', societe: null });
    expect(a?.ventes.every((v) => v.commissionsRetirees === false)).toBe(true);
  });

  it.each(AGENCES)('② %s : compteurs et statistiques = le Suivi CA, au centime (Mois, Période, Année, Tout ; HT et TTC)', async (cle) => {
    const a = (await lireAgence(arno, cle, JOUR))!;
    const { d, cartes } = await suiviCa(cle);
    const cec = totalCompromisEnCours(d.ventes, d.societe, resolveurDe(d.statutsNegociateurs));
    expect(a.compteurs.compromis.ca).toEqual({ htC: cec.htC, ttcC: cec.ttcC });
    expect(a.compteurs.actees.ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2026])));
    const s = a.statistiques!;
    const c = (o: Partial<ChoixStats>): ChoixStats => ({ mode: 'annee', annee: 2026, mois: 3, periode: [1, 6], ...o });
    expect(totauxDuChoix(s, c({}), JOUR).n.ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2026])));
    expect(totauxDuChoix(s, c({}), JOUR).n1!.ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2025])));
    expect(totauxDuChoix(s, c({ mode: 'mois' }), JOUR).n.ca).toEqual(cartes(ventesPeriode(d.ventes, [{ annee: 2026, mois: 3 }])));
    expect(totauxDuChoix(s, c({ mode: 'periode', periode: [1, 2, 3, 4, 5, 6] }), JOUR).n.ca)
      .toEqual(cartes(ventesPeriode(d.ventes, [1, 2, 3, 4, 5, 6].map((mois) => ({ annee: 2026, mois })))));
    expect(totauxDuChoix(s, c({ mode: 'tout' }), JOUR).n.ca).toEqual(cartes(ventesDesAnnees(d.ventes, [2025, 2026])));
  });

  it('② la vente partagée se lit dans CRITERIMMO et dans MACJ (sa part, ligne miroir comprise), une seule fois dans FUSION', async () => {
    const ids = async (cle: Agence) => (await lireAgence(arno, cle, JOUR))!.compteurs.parAnnee!.find((x) => x.annee === 2026)?.ids ?? [];
    const fusion = await ids('tous');
    expect(new Set(fusion).size).toBe(fusion.length);
    expect(fusion).toHaveLength(2);
    expect((await ids('macj')).length).toBeGreaterThanOrEqual(1);
  });

  it('③ la somme des espaces personnels de tous les collaborateurs = le CA de FUSION en mode agence (2026 et 2025)', async () => {
    const fusion = (await lireAgence(arno, 'tous', JOUR))!.statistiques!;
    for (const annee of [2025, 2026]) {
      const espaces = await Promise.all([lea, marc, zoe].map(async (qui) => totauxDuChoix((await lireMesAffaires(qui, JOUR)).statistiques!, { mode: 'annee', annee, mois: 1, periode: [1] }, JOUR).n.ca));
      expect(sommeC(espaces)).toEqual(totauxDuChoix(fusion, { mode: 'annee', annee, mois: 1, periode: [1] }, JOUR).n.ca);
    }
  });

  it('④ un acte signé dans l’espace de Marc : aussitôt dans le mode agence (FUSION, CRITERIMMO), l’empreinte de la structure change', async () => {
    const avant = { fusion: (await lireAgence(arno, 'tous', JOUR))!, empreinte: await empreinteAgence(arno, 'tous') };
    const version = (await lireVentes(null)).find((v) => v.id === compromis)!.version ?? null;
    expect((await gesteDepuisMonEspace(marc, compromis, { geste: 'acte-signe', dateActe: '2026-11-05' }, version, { id: marc, libelle: 'Marc ITEST' })).ok).toBe(true);
    const apres = (await lireAgence(arno, 'tous', JOUR))!;
    expect(apres.compteurs.compromis.nb).toBe(avant.fusion.compteurs.compromis.nb - 1);
    expect(apres.compteurs.actees.ca.htC - avant.fusion.compteurs.actees.ca.htC).toBe(750000);
    expect(await empreinteAgence(arno, 'tous')).not.toBe(avant.empreinte);
  });

  it('④ une création dans la tuile : aussitôt dans les compromis du mode agence ; l’administrateur l’annule en mode agence : sortie de l’espace de Zoé', async () => {
    const id = await creer({ statut: 'compromis', honorairesTtc: 6000, dateActePrevue: '2027-03-01', numeroMandat: 'G-5', entreeId: zoe, sortieId: null,
      parties: [{ sorte: 'entree', compteId: zoe, pourcentage: 100 }] });
    expect((await lireAgence(arno, 'criterimmo', JOUR))!.compteurs.compromis.ids).toContain(id);
    expect((await lireMesAffaires(zoe, JOUR)).compteurs.compromis.ids).toContain(id);
    const version = (await lireVentes(null)).find((v) => v.id === id)!.version ?? null;
    expect((await gesteDepuisMonEspace(arno, id, { geste: 'compromis-annuler', annulation: { motif: 'Défaut de crédit', date: JOUR, note: null } }, version,
      { id: arno, libelle: 'Arno ITEST' })).ok).toBe(true);
    expect((await lireMesAffaires(zoe, JOUR)).compteurs.compromis.ids).not.toContain(id);
    expect((await lireAgence(arno, 'criterimmo', JOUR))!.compteurs.compromis.ids).not.toContain(id);
  });
});
