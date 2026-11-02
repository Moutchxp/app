/**
 * ══ 🔴 MON ESPACE, LOT 3 — « MES AFFAIRES » ET LA PROPAGATION, SUR UNE BASE JETABLE (Arno, 02/11/2026) ═════════════════════════════════════════
 *
 * Règle transverse (docs/PLAN_MON_ESPACE.md) : un geste fait dans la tuile Suivi CA se lit aussitôt dans « Mon espace » des collègues concernés,
 * par les MÊMES données (aucune copie) :
 *   ① un compromis partagé créé dans la Transaction → dans les compteurs de Léa (entrée) et de Marc (sortie), chacun SON CA ; Zoé (sur aucun
 *      côté) n'en reçoit rien ; la réponse de Léa ne contient ni la commission ni le taux de Marc ;
 *   ② modifié dans la Transaction (répartition 70 / 30) → les CA suivent ;
 *   ③ acte signé → il passe des compromis aux ventes actées de l'année, dans le bon mois ; retour en compromis → il revient ;
 *   ④ annulé → il disparaît des compteurs ;
 *   ⑤ une vente importée de l'onglet « LEA » des fichiers : à Léa (rattachement existant par le prénom), jamais à Marc.
 * 🔴 LOT 4 — les listes de « Mon espace » sont ces mêmes identifiants (« Mes compromis en cours » : `compteurs.compromis.ids` ; « Mes ventes » :
 * `compteurs.parAnnee`) : chaque étape vérifie aussi le bon onglet et la bonne année.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE ; la 449 y est appliquée par l'épreuve). 🔒 REFUSE de tourner ailleurs que sur `svav_jetable…`
 * ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_mon_espace \
 *     npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/mesAffaires.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { acteSigne, annulerCompromis, creerVente, enregistrerDossier, retourCompromis } from '../transaction/repo';
import { lireDossier, lireVente } from '../transaction/saisie';
import { lireMesAffaires } from './mesAffairesRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest mon espace' };
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });
const issue = <T>(r: { ok: true; valeur?: T } | { ok: false; motif: string }): T => { if (!r.ok) throw new Error(r.motif); return r.valeur as T; };
const dossier = (o: Record<string, unknown>) => { const d = lireDossier(o); if (!d.ok) throw new Error(d.motif); return d.valeur; };

describe.skipIf(!baseEssai)('🔴 « Mon espace » lit les gestes de la tuile Suivi CA', () => {
  let lea = 0; let marc = 0; let zoe = 0; let partage = 0;
  const corps = (pctEntree: number, o: Record<string, unknown> = {}) => ({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: 12000, retroApporteurTtc: 0,
    dateCompromis: '2026-10-15', dateActePrevue: '2027-01-20', numeroMandat: 'PROPAG-1', personnes: [{ role: 'vendeur', nom: 'VENDEUR PROPAG' }],
    entreeId: lea, sortieId: marc, parties: [{ sorte: 'entree', compteId: lea, pourcentage: pctEntree }, { sorte: 'sortie', compteId: marc, pourcentage: 100 - pctEntree }],
    commissions: { entree: { montant: '3111,11', unite: 'ttc', taux: 52, mode: 'manuelle' }, sortie: { montant: '2999,99', unite: 'ttc', taux: 47, mode: 'manuelle' } }, ...o });
  const compteurs = async (id: number) => (await lireMesAffaires(id, JOUR)).compteurs;

  it('⓪ la base jetable : trois comptes, leur société ; la 449 appliquée ici seulement', async () => {
    const compte = async (prenom: string, societe: string): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', 'collaborateur') RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    lea = await compte('Léa', 'criterimmo'); marc = await compte('Marc', 'macj'); zoe = await compte('Zoé', 'criterimmo');
    await query(readFileSync('db/migrations/449_transaction_numero_mandat.sql', 'utf8'));
    oublierSchemaDroits();
  });

  it('① créé dans la Transaction : chez Léa ET Marc, chacun son CA (50 / 50 de 10 000 € HT) ; Zoé : rien ; Léa ne reçoit ni la commission ni le taux de Marc', async () => {
    partage = issue(await enregistrerDossier(null, dossier(corps(50)), JOUR, AUTEUR));
    expect([(await compteurs(lea)).compromis, (await compteurs(marc)).compromis].map((c) => [c.ids, c.ca.htC])).toEqual([[[partage], 500000], [[partage], 500000]]);
    const z = await lireMesAffaires(zoe, JOUR);
    expect([z.ventes, z.compteurs.compromis.nb, z.compteurs.actees.nb]).toEqual([[], 0, 0]);
    const json = JSON.stringify(await lireMesAffaires(lea, JOUR));
    expect(json).toContain('3111.11');
    expect(json).not.toContain('2999.99');
    expect(json).not.toContain('"taux":47');
    expect(json).toContain('PROPAG-1');
  });

  it('② modifié dans la Transaction (70 / 30) : les CA suivent', async () => {
    issue(await enregistrerDossier(partage, dossier(corps(70)), JOUR, AUTEUR));
    expect([(await compteurs(lea)).compromis.ca.htC, (await compteurs(marc)).compromis.ca.htC]).toEqual([700000, 300000]);
  });

  it('③ acte signé : des compromis aux ventes actées de l’année, dans le bon mois ; retour en compromis : il revient', async () => {
    issue(await acteSigne(partage, '2026-11-20', AUTEUR));
    const c = await compteurs(lea);
    expect([c.compromis.nb, c.actees.ids, c.actees.ca.htC, c.actees.annee]).toEqual([0, [partage], 700000, 2026]);
    // « Mes ventes » : dans l'année 2026 de Léa ET de Marc ; plus dans « Mes compromis en cours »
    for (const id of [lea, marc]) expect((await compteurs(id)).parAnnee?.find((a) => a.annee === 2026)?.ids).toContain(partage);
    const v = (await lireMesAffaires(marc, JOUR)).ventes.find((x) => x.id === partage);
    expect([v?.statut, v?.mois, v?.annee]).toEqual(['vendue', 11, 2026]);
    issue(await retourCompromis(partage, AUTEUR));
    expect([(await compteurs(marc)).compromis.ids, (await compteurs(marc)).actees.nb, (await compteurs(marc)).parAnnee]).toEqual([[partage], 0, []]);
  });

  it('④ annulé : il disparaît des compteurs des deux collègues', async () => {
    issue(await annulerCompromis(partage, { motif: 'Défaut de crédit', date: '2026-11-02', note: null }, AUTEUR));
    expect([(await compteurs(lea)).compromis.nb, (await compteurs(marc)).compromis.nb]).toEqual([0, 0]);
    // ni dans un onglet ni dans l'autre ; la vente reste lisible (statut « annulée ») dans la réponse, comme dans le Suivi CA
    expect([(await compteurs(lea)).parAnnee, (await lireMesAffaires(lea, JOUR)).ventes.find((v) => v.id === partage)?.statut]).toEqual([[], 'annulee']);
  });

  it('⑤ une vente importée de l’onglet « LEA » (rattachée par le prénom) : à Léa, jamais à Marc', async () => {
    const v = lireVente({ societe: 'criterimmo', libelle: 'IMPORT LEA', honorairesTtc: 6000, statut: 'vendue', annee: 2026, mois: 3, parts: [{ negociateur: 'LEA', role: 'vendeur' }] });
    if (!v.ok) throw new Error(v.motif);
    const id = issue(await creerVente(v.valeur, AUTEUR));
    expect((await compteurs(lea)).actees.ids).toContain(id);
    expect((await compteurs(lea)).parAnnee?.map((a) => [a.annee, a.ids])).toEqual([[2026, [id]]]);
    expect((await lireMesAffaires(marc, JOUR)).ventes.map((x) => x.id)).not.toContain(id);
  });
});
