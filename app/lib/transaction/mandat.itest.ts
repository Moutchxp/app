/**
 * ══ 🔴 MON ESPACE, LOT 2 — LE N° DE MANDAT, SUR UNE BASE JETABLE (Arno, 02/11/2026) ═══════════════════════════════════════════════════════
 *
 *   ⓪ ancien schéma (sans la 449) : un compromis se crée comme avant, sans n° ; un n° envoyé quand même est refusé ; rien ne plante ;
 *   puis la 449 est appliquée SUR CETTE BASE (jamais ailleurs) :
 *   ① création d'un compromis SANS n° → refusée, rien n'est écrit ;
 *   ② création avec n° → acceptée ; le n° se lit PARTOUT où la vente s'affiche : sa société, l'autre société (ligne miroir de
 *      l'inter-cabinet), FUSION / CA global (toutes les ventes), les compromis en cours ; les montants ne changent pas (aucun double compte) ;
 *   ③ même n° écrit autrement (espaces, casse, zéros de tête) dans la même structure → refusé, avec le résumé de la vente ;
 *   ④ même n° dans l'autre structure → accepté ;
 *   ⑤ fiche ancienne sans n° : modifiée sans n° → acceptée ; n° ajouté → accepté ; effacé → refusé ;
 *   ⑥ annulée → son n° redevient libre ; « Rétablir » alors refusé (le n° est repris) ;
 *   ⑦ le même geste depuis la tuile Suivi CA (enregistrerDossier) et ses suites (acte signé, retour en compromis) gardent le n° partout.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE). 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_mandat \
 *     npx vitest run --config vitest.integration.config.ts app/lib/transaction/mandat.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { acteSigne, annulerCompromis, creerVente, enregistrerDossier, lireVentes, modifierVente, retablirCompromis, retourCompromis } from './repo';
import { lireDossier, lireModification, lireVente } from './saisie';
import { compromisEnCours, totalCompromisEnCours } from './compromisEnCours';
import { MOTIF_MANDAT_INEFFACABLE, MOTIF_MANDAT_OBLIGATOIRE, MOTIF_SANS_449 } from './mandat';
import type { Vente } from './modele';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest mandat' };
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });

const compter = async (): Promise<number> => Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM transaction_vente')).rows[0].n);
const issue = <T>(r: { ok: true; valeur?: T } | { ok: false; motif: string }): T => { if (!r.ok) throw new Error(r.motif); return r.valeur as T; };
const motif = (r: { ok: boolean; motif?: string }): string => { if (r.ok) throw new Error('accepté à tort'); return r.motif ?? ''; };
const dossier = (o: Record<string, unknown>) => { const d = lireDossier(o); if (!d.ok) throw new Error(d.motif); return d.valeur; };
const trouve = (vs: readonly Vente[], id: number): Vente | undefined => vs.find((v) => v.id === id);

describe.skipIf(!baseEssai)('🔴 le n° de mandat d’une vente (migration 449)', () => {
  let entree = 0; let sortie = 0; let partage = 0; let ancienne = 0; let sansN = 0;
  // Un compromis réparti : entrée CRITERIMMO (porteuse), sortie MACJ (ligne miroir chez MACJ).
  const corps = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: 12000, retroApporteurTtc: 0,
    dateCompromis: '2026-10-15', dateActePrevue: '2027-01-20', personnes: [{ role: 'vendeur', nom: 'VENDEUR MANDAT' }, { role: 'acquereur', nom: 'ACQUEREUR MANDAT' }],
    entreeId: entree, sortieId: sortie, parties: [{ sorte: 'entree', compteId: entree, pourcentage: 50 }, { sorte: 'sortie', compteId: sortie, pourcentage: 50 }],
    adresseBien: '3 rue du Mandat, 75012 Paris', ...o });

  it('⓪ ancien schéma (sans la 449) : un compromis se crée sans n°, un n° envoyé est refusé, la lecture ne nomme pas la colonne', async () => {
    const compte = async (prenom: string, societe: string): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', 'collaborateur') RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    entree = await compte('Entree', 'criterimmo');
    sortie = await compte('Sortie', 'macj');
    oublierSchemaDroits();
    sansN = issue(await enregistrerDossier(null, dossier(corps()), JOUR, AUTEUR));
    expect(trouve(await lireVentes('criterimmo'), sansN)?.numeroMandat).toBeUndefined();
    expect(motif(await enregistrerDossier(null, dossier(corps({ numeroMandat: 'A1' })), JOUR, AUTEUR))).toBe(MOTIF_SANS_449);
    // Une fiche ancienne (vente actée, sans dossier), qui servira au ⑤.
    const v = lireVente({ societe: 'criterimmo', libelle: 'ANCIENNE VENTE', honorairesTtc: 6000, statut: 'vendue', annee: 2025, mois: 6, parts: [] });
    if (!v.ok) throw new Error(v.motif);
    ancienne = issue(await creerVente(v.valeur, AUTEUR));
    // La 449, appliquée SUR CETTE BASE JETABLE seulement.
    await query(readFileSync('db/migrations/449_transaction_numero_mandat.sql', 'utf8'));
    oublierSchemaDroits();
  });

  it('① création d’un compromis SANS n° → refusée, rien n’est écrit (tuile Suivi CA et ancienne action « vente-saisir »)', async () => {
    const avant = await compter();
    expect(motif(await enregistrerDossier(null, dossier(corps()), JOUR, AUTEUR))).toBe(MOTIF_MANDAT_OBLIGATOIRE);
    expect(motif(await enregistrerDossier(null, dossier(corps({ numeroMandat: '   ' })), JOUR, AUTEUR))).toBe(MOTIF_MANDAT_OBLIGATOIRE);
    const v = lireVente({ societe: 'criterimmo', libelle: 'COMPROMIS SANS N', honorairesTtc: 1000, statut: 'compromis', annee: 2026, mois: null, parts: [] });
    if (!v.ok) throw new Error(v.motif);
    expect(motif(await creerVente(v.valeur, AUTEUR))).toBe(MOTIF_MANDAT_OBLIGATOIRE);
    expect(await compter()).toBe(avant);
  });

  it('② création avec n° → acceptée ; le n° se lit partout (société, ligne miroir, FUSION / CA global, compromis en cours), montants inchangés', async () => {
    partage = issue(await enregistrerDossier(null, dossier(corps({ numeroMandat: ' M-0042 ' })), JOUR, AUTEUR));
    const crit = trouve(await lireVentes('criterimmo'), partage);
    const macj = trouve(await lireVentes('macj'), partage);
    const tout = trouve(await lireVentes(null), partage);
    expect([crit?.numeroMandat, macj?.numeroMandat, tout?.numeroMandat]).toEqual(['M-0042', 'M-0042', 'M-0042']);
    expect(macj?.miroir?.origineId).toBe(partage); // la ligne miroir de l'inter-cabinet, chez MACJ
    expect(compromisEnCours(await lireVentes('criterimmo'), 'criterimmo').find((v) => v.id === partage)?.numeroMandat).toBe('M-0042');
    expect(compromisEnCours(await lireVentes('macj'), 'macj').find((v) => v.id === partage)?.numeroMandat).toBe('M-0042');
    // Les montants ne dépendent pas du n° : dans chaque vue (CRITERIMMO, MACJ, FUSION / CA global), les mêmes totaux que le compromis
    // IDENTIQUE créé sans n° (⓪) ; le groupe compte la commission (10 000 € HT) une seule fois.
    for (const vue of ['criterimmo', 'macj', null] as const) {
      const vs = await lireVentes(vue);
      const total = (id: number) => totalCompromisEnCours(vs.filter((v) => v.id === id), vue);
      expect([total(partage).htC, total(partage).ttcC], String(vue)).toEqual([total(sansN).htC, total(sansN).ttcC]);
    }
    expect(totalCompromisEnCours((await lireVentes(null)).filter((v) => v.id === partage), null).htC).toBe(1000000);
    // Le geste est tracé au journal (qui, quand, quoi).
    const { rows } = await query<{ apres: Record<string, unknown>; auteur_libelle: string }>(
      "SELECT apres, auteur_libelle FROM transaction_journal WHERE entite = 'vente' AND entite_id = $1 AND action = 'saisie'", [partage]);
    expect([rows[0].apres.numero_mandat, rows[0].auteur_libelle]).toEqual(['M-0042', 'itest mandat']);
  });

  it('③ même n° écrit autrement dans la même structure → refusé avec le résumé de la vente qui le porte', async () => {
    const avant = await compter();
    for (const variante of ['m 42', 'M42', 'm-00042', 'M.0042']) {
      const r = motif(await enregistrerDossier(null, dossier(corps({ numeroMandat: variante })), JOUR, AUTEUR));
      expect(r).toContain('Ce mandat existe déjà : n° M-0042 chez CRITERIMMO');
      expect(r).toContain('VENDEUR MANDAT');
      expect(r).toContain('compromis en cours (signé le 15/10/2026)');
    }
    expect(await compter()).toBe(avant);
  });

  it('④ même n° dans l’autre structure → accepté', async () => {
    const autre = issue(await enregistrerDossier(null, dossier(corps({ societe: 'macj', entreeId: sortie, sortieId: null,
      parties: [{ sorte: 'entree', compteId: sortie, pourcentage: 100 }], numeroMandat: 'M-0042' })), JOUR, AUTEUR));
    expect(trouve(await lireVentes('macj'), autre)?.numeroMandat).toBe('M-0042');
  });

  it('⑤ fiche ancienne sans n° : modifiée sans n° → acceptée ; n° ajouté → accepté ; effacé → refusé ; un n° pris → refusé', async () => {
    const ch = (o: Record<string, unknown>) => { const x = lireModification(o); if (!x.ok) throw new Error(x.motif); return x.valeur; };
    expect((await modifierVente(ancienne, ch({ note: 'corrigée sans n°' }), AUTEUR)).ok).toBe(true);
    expect(motif(await modifierVente(ancienne, ch({ numeroMandat: 'm0042' }), AUTEUR))).toContain('Ce mandat existe déjà');
    expect((await modifierVente(ancienne, ch({ numeroMandat: '0099' }), AUTEUR)).ok).toBe(true);
    expect(trouve(await lireVentes('criterimmo'), ancienne)?.numeroMandat).toBe('0099'); // le texte saisi, jamais le nombre 99
    expect(motif(await modifierVente(ancienne, ch({ numeroMandat: '' }), AUTEUR))).toBe(MOTIF_MANDAT_INEFFACABLE);
    // Le dossier d'une fiche existante : sans le champ (écran d'avant), le n° reste ; vide, refusé.
    expect((await enregistrerDossier(partage, dossier(corps({ note: 'sans parler du n°' })), JOUR, AUTEUR)).ok).toBe(true);
    expect(trouve(await lireVentes('criterimmo'), partage)?.numeroMandat).toBe('M-0042');
    expect(motif(await enregistrerDossier(partage, dossier(corps({ numeroMandat: '' })), JOUR, AUTEUR))).toBe(MOTIF_MANDAT_INEFFACABLE);
  });

  it('⑥ annulée → son n° redevient libre ; « Rétablir » alors refusé (le n° est repris), avec le résumé', async () => {
    issue(await annulerCompromis(partage, { motif: 'Défaut de crédit', date: '2026-11-01', note: null }, AUTEUR));
    expect(compromisEnCours(await lireVentes('criterimmo'), 'criterimmo').map((v) => v.id)).not.toContain(partage);
    const repris = issue(await enregistrerDossier(null, dossier(corps({ numeroMandat: 'M42', personnes: [{ role: 'vendeur', nom: 'REPRENEUR' }] })), JOUR, AUTEUR));
    expect(trouve(await lireVentes('criterimmo'), repris)?.numeroMandat).toBe('M42');
    const r = motif(await retablirCompromis(partage, AUTEUR));
    expect(r).toContain('Ce mandat existe déjà : n° M42 chez CRITERIMMO');
    expect(r).toContain('REPRENEUR');
    expect(trouve(await lireVentes(null), partage)?.statut).toBe('annulee');
  });

  it('⑦ acte signé puis retour en compromis : le n° suit la vente partout, dans le bon mois', async () => {
    const id = issue(await enregistrerDossier(null, dossier(corps({ numeroMandat: 'SIGNE-1' })), JOUR, AUTEUR));
    issue(await acteSigne(id, '2026-12-05', AUTEUR));
    for (const s of ['criterimmo', 'macj', null] as const) {
      const v = trouve(await lireVentes(s), id);
      expect([v?.statut, v?.mois, v?.annee, v?.numeroMandat]).toEqual(['vendue', 12, 2026, 'SIGNE-1']);
    }
    issue(await retourCompromis(id, AUTEUR));
    expect(compromisEnCours(await lireVentes('macj'), 'macj').find((v) => v.id === id)?.numeroMandat).toBe('SIGNE-1');
  });
});
