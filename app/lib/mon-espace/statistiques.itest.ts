/**
 * ══ 🔴 MON ESPACE, LOT 8 — « MES STATISTIQUES » SUR UNE BASE JETABLE (Arno, 02/11/2026) ═════════════════════════════════════════════════════════════
 *
 *   ① la SOMME des statistiques de tous les collaborateurs = le CA de l'agence (FUSION / CA global : chaque vente une fois), au centime, HT et TTC —
 *      aucun double compte (une vente partagée Léa / Marc, une vente de Zoé seule) ;
 *   ② propagation : un acte signé (depuis « Mon espace ») entre aussitôt dans les statistiques des DEUX collègues, au bon mois ; leur prévisionnel
 *      baisse d'autant ; une annulation sort le compromis du prévisionnel ; une création dans la tuile y entre.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE ; la 449 appliquée par l'épreuve si besoin). 🔒 REFUSE de tourner ailleurs que sur
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_stats \
 *     npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/statistiques.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { enregistrerDossier, lireVentes } from '../transaction/repo';
import { lireDossier } from '../transaction/saisie';
import { pourLaVue } from '../transaction/compromisEnCours';
import { gesteDepuisMonEspace } from './gestesRepo';
import { lireMesAffaires } from './mesAffairesRepo';
import { sommeC } from './statistiques';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });
const dossier = (o: Record<string, unknown>) => { const d = lireDossier(o); if (!d.ok) throw new Error(d.motif); return d.valeur; };

describe.skipIf(!baseEssai)('🔴 « Mes statistiques » : la somme de tous = l’agence ; la propagation', () => {
  let lea = 0; let marc = 0; let zoe = 0; let compromis = 0;
  const auteur = { id: null, libelle: 'itest stats' };
  /** Le CA acté de l'année d'un collaborateur (tous les mois + le mois à confirmer), lu comme l'écran le lit. */
  const caAnnee = async (qui: number, annee: number) => {
    const a = (await lireMesAffaires(qui, JOUR)).statistiques!.annees.find((x) => x.annee === annee);
    return a === undefined ? { htC: 0, ttcC: 0 } : sommeC([...a.ca, a.aConfirmer]);
  };
  const corps = (o: Record<string, unknown>) => ({ societe: 'criterimmo', statut: 'vendue', retroApporteurTtc: 0, dateCompromis: '2026-01-10', personnes: [{ role: 'vendeur', nom: 'VENDEUR STATS' }], ...o });

  it('⓪ la base jetable : trois comptes ; une vente partagée (Léa 60 / Marc 40), une vente de Zoé, un compromis Léa / Marc', async () => {
    const compte = async (prenom: string, societe: string): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', 'collaborateur') RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    lea = await compte('Lea', 'criterimmo'); marc = await compte('Marc', 'macj'); zoe = await compte('Zoe', 'criterimmo');
    await query(readFileSync('db/migrations/449_transaction_numero_mandat.sql', 'utf8'));
    oublierSchemaDroits();
    const creer = async (o: Record<string, unknown>) => { const r = await enregistrerDossier(null, dossier(corps(o)), JOUR, auteur); if (!r.ok) throw new Error(r.motif); return r.valeur as number; };
    await creer({ honorairesTtc: 12345.67, dateActe: '2026-03-15', numeroMandat: 'S-1', entreeId: lea, sortieId: marc,
      parties: [{ sorte: 'entree', compteId: lea, pourcentage: 60 }, { sorte: 'sortie', compteId: marc, pourcentage: 40 }] });
    await creer({ honorairesTtc: 7000, dateActe: '2026-06-20', numeroMandat: 'S-2', entreeId: zoe, sortieId: null, parties: [{ sorte: 'entree', compteId: zoe, pourcentage: 100 }] });
    compromis = await creer({ statut: 'compromis', honorairesTtc: 9000, dateActePrevue: '2027-02-01', numeroMandat: 'S-3', entreeId: lea, sortieId: marc,
      parties: [{ sorte: 'entree', compteId: lea, pourcentage: 50 }, { sorte: 'sortie', compteId: marc, pourcentage: 50 }] });
  });

  it('① la somme des espaces = le CA de l’agence (chaque vente une fois), au centime, HT et TTC', async () => {
    const agence = (await lireVentes(null)).filter((v) => v.statut === 'vendue' && v.annee === 2026 && pourLaVue(v, null));
    const attendu = { htC: agence.reduce((t, v) => t + Math.round((v.honorairesTtc / 1.2) * 100), 0), ttcC: agence.reduce((t, v) => t + Math.round(v.honorairesTtc * 100), 0) };
    const somme = sommeC(await Promise.all([lea, marc, zoe].map((qui) => caAnnee(qui, 2026))));
    expect(somme).toEqual(attendu);
  });

  it('② l’acte signé (depuis « Mon espace ») entre dans les statistiques des DEUX collègues, au bon mois ; leur prévisionnel baisse d’autant', async () => {
    const avant = { lea: await lireMesAffaires(lea, JOUR), marc: await lireMesAffaires(marc, JOUR) };
    const version = (await lireVentes(null)).find((v) => v.id === compromis)!.version ?? null;
    expect((await gesteDepuisMonEspace(marc, compromis, { geste: 'acte-signe', dateActe: '2026-11-05' }, version, { id: marc, libelle: 'Marc ITEST' })).ok).toBe(true);
    for (const [qui, a] of [[lea, avant.lea], [marc, avant.marc]] as const) {
      const apres = await lireMesAffaires(qui, JOUR);
      const nov = (x: typeof apres) => x.statistiques!.annees.find((y) => y.annee === 2026)!.ca[10].htC;
      expect(nov(apres) - nov(a)).toBe(375000); // la moitié de 7 500 € HT
      expect(a.compteurs.compromis.ca.htC - apres.compteurs.compromis.ca.htC).toBe(375000);
    }
  });

  it('② une création dans la tuile entre dans le prévisionnel ; son annulation l’en sort', async () => {
    const r = await enregistrerDossier(null, dossier(corps({ statut: 'compromis', honorairesTtc: 6000, dateActePrevue: '2027-03-01', numeroMandat: 'S-4', entreeId: zoe, sortieId: null,
      parties: [{ sorte: 'entree', compteId: zoe, pourcentage: 100 }] })), JOUR, auteur);
    if (!r.ok) throw new Error(r.motif);
    expect((await lireMesAffaires(zoe, JOUR)).compteurs.compromis.ca.htC).toBe(500000);
    const version = (await lireVentes(null)).find((v) => v.id === r.valeur)!.version ?? null;
    expect((await gesteDepuisMonEspace(zoe, r.valeur as number, { geste: 'compromis-annuler', annulation: { motif: 'Défaut de crédit', date: JOUR, note: null } }, version,
      { id: zoe, libelle: 'Zoe ITEST' })).ok).toBe(true);
    expect((await lireMesAffaires(zoe, JOUR)).compteurs.compromis.ca.htC).toBe(0);
  });
});
