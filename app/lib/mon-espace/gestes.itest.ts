/**
 * ══ 🔴 MON ESPACE, LOT 7 — LES GESTES DEPUIS « MON ESPACE », SUR UNE BASE JETABLE (Arno, 02/11/2026) ═══════════════════════════════════════════════
 *
 *   ① Acte signé (par Marc, depuis son espace) : l'affaire passe des compromis aux ventes actées, dans le bon mois, chez Léa ET Marc, dans la tuile
 *      (CRITERIMMO, MACJ et sa ligne miroir, FUSION / CA global) ; le prévisionnel baisse d'autant ; aucun double compte ; l'empreinte change ;
 *   ② Revenir en compromis (par Léa) : l'inverse, partout ;
 *   ③ Droits et garde de version : Zoé (hors de l'affaire) → 403 ; un geste sur une version périmée → 409, rien n'est perdu ; l'administrateur → OK ;
 *   ④ Annuler (par Léa) : l'affaire sort des compromis en cours et des prévisionnels partout ; son n° de mandat redevient libre ; le journal dit qui.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE ; la 449 appliquée par l'épreuve si besoin). 🔒 REFUSE de tourner ailleurs que sur
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_gestes \
 *     npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/gestes.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { enregistrerDossier, lireJournal, lireVentes, MOTIF_CONFLIT_VERSION } from '../transaction/repo';
import { venteDuMandat } from '../transaction/mandatRepo';
import { lireDossier } from '../transaction/saisie';
import { compromisEnCours, totalCompromisEnCours } from '../transaction/compromisEnCours';
import type { Vente } from '../transaction/modele';
import { gesteDepuisMonEspace, MOTIF_GESTE_PAS_SUR_UN_COTE } from './gestesRepo';
import { empreinteMesAffaires, lireMesAffaires } from './mesAffairesRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });
const dossier = (o: Record<string, unknown>) => { const d = lireDossier(o); if (!d.ok) throw new Error(d.motif); return d.valeur; };
const lire = async (id: number, vue: 'criterimmo' | 'macj' | null = null): Promise<Vente | undefined> => (await lireVentes(vue)).find((v) => v.id === id);
const version = async (id: number): Promise<number | null> => (await lire(id))?.version ?? null;
/** Le prévisionnel (les compromis en cours) de chaque vue, en centimes HT. */
const previsionnels = async (): Promise<number[]> => Promise.all((['criterimmo', 'macj', null] as const).map(async (vue) => totalCompromisEnCours(await lireVentes(vue), vue).htC));

describe.skipIf(!baseEssai)('🔴 les gestes depuis « Mon espace »', () => {
  let lea = 0; let marc = 0; let zoe = 0; let arno = 0; let id = 0; let avant: number[] = [];
  const auteur = (libelle: string, compte: number) => ({ id: compte, libelle });
  const chez = async (qui: number) => (await lireMesAffaires(qui, JOUR)).compteurs;

  it('⓪ la base jetable : quatre comptes ; l’affaire partagée (Léa à l’entrée 60 %, Marc à la sortie 40 %), créée dans la tuile', async () => {
    const compte = async (prenom: string, societe: string, role = 'collaborateur'): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', $3) RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom, role]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    lea = await compte('Lea', 'criterimmo'); marc = await compte('Marc', 'macj'); zoe = await compte('Zoe', 'criterimmo'); arno = await compte('Arno', 'criterimmo', 'administrateur');
    await query(readFileSync('db/migrations/449_transaction_numero_mandat.sql', 'utf8'));
    oublierSchemaDroits();
    const r = await enregistrerDossier(null, dossier({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: 12000, retroApporteurTtc: 0, numeroMandat: 'GESTE-1',
      dateCompromis: '2026-10-15', dateActePrevue: '2027-01-20', personnes: [{ role: 'vendeur', nom: 'VENDEUR GESTE' }], entreeId: lea, sortieId: marc,
      parties: [{ sorte: 'entree', compteId: lea, pourcentage: 60 }, { sorte: 'sortie', compteId: marc, pourcentage: 40 }] }), JOUR, auteur('Arno ITEST', arno));
    if (!r.ok) throw new Error(r.motif);
    id = r.valeur as number;
    avant = await previsionnels();
    expect(avant).toEqual([1000000, 1000000 * 0.4, 1000000]); // CRITERIMMO porte la vente ; MACJ, sa part ; le groupe, une fois
  });

  it('① Acte signé par Marc : vente actée en novembre 2026 partout (deux espaces, CRITERIMMO, MACJ et sa ligne miroir, FUSION) ; prévisionnel en baisse d’autant', async () => {
    const empreinteAvant = await empreinteMesAffaires(lea);
    const r = await gesteDepuisMonEspace(marc, id, { geste: 'acte-signe', dateActe: '2026-11-20' }, await version(id), auteur('Marc ITEST', marc));
    expect(r.ok).toBe(true);
    for (const vue of ['criterimmo', 'macj', null] as const) {
      const v = await lire(id, vue);
      expect([v?.statut, v?.mois, v?.annee], String(vue)).toEqual(['vendue', 11, 2026]);
    }
    expect((await lire(id, 'macj'))?.miroir?.origineId).toBe(id);
    for (const qui of [lea, marc]) {
      const c = await chez(qui);
      expect([c.compromis.ids.includes(id), c.actees.ids.includes(id)]).toEqual([false, true]);
    }
    expect(await previsionnels()).toEqual([0, 0, 0]);
    // aucun double compte : mon CA + celui de Marc = la vente, une fois (10 000 € HT)
    expect((await chez(lea)).actees.ca.htC + (await chez(marc)).actees.ca.htC).toBe(1000000);
    expect(await empreinteMesAffaires(lea)).not.toBe(empreinteAvant);
  });

  it('② Revenir en compromis par Léa : l’inverse, partout', async () => {
    expect((await gesteDepuisMonEspace(lea, id, { geste: 'retour-compromis' }, await version(id), auteur('Lea ITEST', lea))).ok).toBe(true);
    expect((await lire(id))?.statut).toBe('compromis');
    expect(compromisEnCours(await lireVentes('macj'), 'macj').map((v) => v.id)).toContain(id);
    expect(await previsionnels()).toEqual(avant);
    for (const qui of [lea, marc]) expect((await chez(qui)).compromis.ids).toContain(id);
  });

  it('③ droits et garde de version : Zoé → 403 ; version périmée → 409, rien n’est perdu ; l’administrateur → accepté', async () => {
    const z = await gesteDepuisMonEspace(zoe, id, { geste: 'acte-signe', dateActe: '2026-11-21' }, await version(id), auteur('Zoe ITEST', zoe));
    expect(z.ok ? null : [z.statut, z.motif]).toEqual([403, MOTIF_GESTE_PAS_SUR_UN_COTE]);
    const perimee = (await version(id))! - 1;
    const p = await gesteDepuisMonEspace(lea, id, { geste: 'acte-signe', dateActe: '2026-11-21' }, perimee, auteur('Lea ITEST', lea));
    expect(p.ok ? null : [p.statut, p.motif]).toEqual([409, MOTIF_CONFLIT_VERSION]);
    expect((await lire(id))?.statut).toBe('compromis');
    expect((await gesteDepuisMonEspace(arno, id, { geste: 'acte-signe', dateActe: '2026-11-21' }, await version(id), auteur('Arno ITEST', arno))).ok).toBe(true);
    expect((await gesteDepuisMonEspace(arno, id, { geste: 'retour-compromis' }, await version(id), auteur('Arno ITEST', arno))).ok).toBe(true);
  });

  it('④ Annuler par Léa : hors des compromis en cours et des prévisionnels partout ; le n° de mandat redevient libre ; le journal dit qui', async () => {
    const r = await gesteDepuisMonEspace(lea, id, { geste: 'compromis-annuler', annulation: { motif: 'Défaut de crédit', date: '2026-11-02', note: null } },
      await version(id), auteur('Lea ITEST', lea));
    expect(r.ok).toBe(true);
    expect(await previsionnels()).toEqual([0, 0, 0]);
    for (const qui of [lea, marc]) expect((await chez(qui)).compromis.ids).not.toContain(id);
    expect(await venteDuMandat('criterimmo', 'GESTE-1')).toBeNull();
    const j = await lireJournal('vente', id);
    expect(j.filter((x) => ['acte_signe', 'retour_compromis', 'annulation_compromis'].includes(x.action)).map((x) => [x.action, x.auteur]).reverse()).toEqual([
      ['acte_signe', 'Marc ITEST'], ['retour_compromis', 'Lea ITEST'], ['acte_signe', 'Arno ITEST'], ['retour_compromis', 'Arno ITEST'], ['annulation_compromis', 'Lea ITEST']]);
  });
});
