/**
 * ══ 🔴 MON ESPACE, LOT 5 — CRÉER UN COMPROMIS DEPUIS « MON ESPACE », SUR UNE BASE JETABLE (Arno, 02/11/2026) ══════════════════════════════════════
 *
 *   ① n° libre : créé ; ② même n° dans la même structure : refusé avec le résumé, rien d'écrit ; ③ même n° dans l'autre structure : créé ;
 *   ④ collaborateur absent des deux côtés : refusé (403), rien d'écrit ; administrateur : créé pour autrui ;
 *   ⑤ PROPAGATION (règle transverse) : le compromis créé depuis « Mon espace » se lit aussitôt, avec les MÊMES montants qu'un compromis identique
 *      créé dans la tuile Suivi CA, dans sa société, FUSION / CA global, la ligne miroir de l'inter-cabinet, les compromis en cours, et dans
 *      « Mon espace » de l'autre collègue ; aucun double comptage ;
 *   ⑥ non-régression : la création depuis la tuile Suivi CA marche comme avant (n° obligatoire du lot 2).
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE ; la 449 appliquée par l'épreuve). 🔒 REFUSE de tourner ailleurs que sur `svav_jetable…`
 * ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_creation \
 *     npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/creation.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { enregistrerDossier, lireVentes } from '../transaction/repo';
import { lireDossier } from '../transaction/saisie';
import { compromisEnCours, totalCompromisEnCours } from '../transaction/compromisEnCours';
import { MOTIF_MANDAT_OBLIGATOIRE } from '../transaction/mandat';
import { MOTIF_CREATION_PAS_SUR_UN_COTE } from './creation';
import { creerCompromisMonEspace } from './creationRepo';
import { lireMesAffaires } from './mesAffairesRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest création mon espace' };
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });
const dossier = (o: Record<string, unknown>) => { const d = lireDossier(o); if (!d.ok) throw new Error(d.motif); return d.valeur; };
const compter = async (): Promise<number> => Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM transaction_vente')).rows[0].n);

describe.skipIf(!baseEssai)('🔴 créer un compromis depuis « Mon espace »', () => {
  let lea = 0; let marc = 0; let arno = 0; let depuisEspace = 0; let depuisTuile = 0;
  const corps = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: 12000, retroApporteurTtc: 0,
    dateCompromis: '2026-10-15', dateActePrevue: '2027-01-20', numeroMandat: 'ESP-1', personnes: [{ role: 'vendeur', nom: 'VENDEUR ESPACE' }],
    entreeId: lea, sortieId: marc, parties: [{ sorte: 'entree', compteId: lea, pourcentage: 60 }, { sorte: 'sortie', compteId: marc, pourcentage: 40 }], ...o });

  it('⓪ la base jetable : trois comptes (dont un administrateur), leur société ; la 449 appliquée ici seulement', async () => {
    const compte = async (prenom: string, societe: string, role = 'collaborateur'): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', $3) RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom, role]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    lea = await compte('Lea', 'criterimmo'); marc = await compte('Marc', 'macj'); arno = await compte('Arno', 'criterimmo', 'administrateur');
    await query(readFileSync('db/migrations/449_transaction_numero_mandat.sql', 'utf8'));
    oublierSchemaDroits();
  });

  it('① n° libre : créé depuis « Mon espace » (Léa à l’entrée, Marc à la sortie : décision 2)', async () => {
    const r = await creerCompromisMonEspace(lea, dossier(corps()), JOUR, AUTEUR);
    if (!r.ok) throw new Error(r.motif);
    depuisEspace = r.id;
    expect((await lireVentes('criterimmo')).find((v) => v.id === depuisEspace)?.numeroMandat).toBe('ESP-1');
  });

  it('② même n° (écrit autrement) dans la même structure : refusé (422) avec le résumé, rien d’écrit', async () => {
    const avant = await compter();
    const r = await creerCompromisMonEspace(marc, dossier(corps({ numeroMandat: 'esp 01' })), JOUR, AUTEUR);
    expect(r.ok ? null : [r.statut, r.motif.startsWith('Ce mandat existe déjà : n° ESP-1 chez CRITERIMMO')]).toEqual([422, true]);
    expect(await compter()).toBe(avant);
  });

  it('③ même n° dans l’autre structure : créé', async () => {
    const r = await creerCompromisMonEspace(marc, dossier(corps({ societe: 'macj', entreeId: marc, sortieId: null,
      parties: [{ sorte: 'entree', compteId: marc, pourcentage: 100 }] })), JOUR, AUTEUR);
    expect(r.ok).toBe(true);
  });

  it('④ collaborateur absent des deux côtés : refusé (403), rien d’écrit ; administrateur : créé pour autrui', async () => {
    const avant = await compter();
    const pourAutrui = corps({ numeroMandat: 'ESP-2' });
    const r = await creerCompromisMonEspace(marc + 1000, dossier(pourAutrui), JOUR, AUTEUR);
    expect(r.ok ? null : [r.statut, r.motif]).toEqual([403, MOTIF_CREATION_PAS_SUR_UN_COTE]);
    expect(await compter()).toBe(avant);
    expect((await creerCompromisMonEspace(arno, dossier(pourAutrui), JOUR, AUTEUR)).ok).toBe(true);
  });

  it('⑤ propagation : partout, avec les montants d’un compromis identique créé dans la tuile Suivi CA ; chez Marc aussi ; aucun double compte', async () => {
    // Le même compromis, créé dans la tuile Suivi CA (la fonction de la tuile, telle quelle).
    const t = await enregistrerDossier(null, dossier(corps({ numeroMandat: 'TUILE-1' })), JOUR, AUTEUR);
    if (!t.ok) throw new Error(t.motif);
    depuisTuile = t.valeur as number;
    for (const vue of ['criterimmo', 'macj', null] as const) {
      const vs = await lireVentes(vue);
      const total = (id: number) => totalCompromisEnCours(vs.filter((v) => v.id === id), vue);
      expect(compromisEnCours(vs, vue).map((v) => v.id), String(vue)).toContain(depuisEspace);
      expect([total(depuisEspace).htC, total(depuisEspace).ttcC], String(vue)).toEqual([total(depuisTuile).htC, total(depuisTuile).ttcC]);
    }
    // la ligne miroir de l'inter-cabinet, chez MACJ (la société de Marc)
    expect((await lireVentes('macj')).find((v) => v.id === depuisEspace)?.miroir?.origineId).toBe(depuisEspace);
    // le groupe compte la commission une fois : 10 000 € HT
    expect(totalCompromisEnCours((await lireVentes(null)).filter((v) => v.id === depuisEspace), null).htC).toBe(1000000);
    // dans « Mon espace » des deux collègues, chacun sa part (60 / 40)
    const chez = async (id: number) => (await lireMesAffaires(id, JOUR)).compteurs.compromis;
    expect((await chez(lea)).ids).toContain(depuisEspace);
    expect((await chez(marc)).ids).toContain(depuisEspace);
  });

  it('⑥ non-régression : la tuile Suivi CA crée comme avant, et refuse toujours un compromis sans n° (lot 2)', async () => {
    expect((await enregistrerDossier(null, dossier(corps({ numeroMandat: 'TUILE-2' })), JOUR, AUTEUR)).ok).toBe(true);
    const sans = await enregistrerDossier(null, dossier(corps({ numeroMandat: undefined })), JOUR, AUTEUR);
    expect(sans.ok ? null : sans.motif).toBe(MOTIF_MANDAT_OBLIGATOIRE);
  });
});
