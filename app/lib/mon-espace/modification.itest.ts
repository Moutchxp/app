/**
 * ══ 🔴 MON ESPACE, LOT 6 — REJOINDRE, MODIFIER, GARDE DE VERSION, JOURNAL ; SUR UNE BASE JETABLE (Arno, 02/11/2026) ══════════════════════════════════
 *
 *   ① Rejoindre : Léa rejoint la sortie libre d'une affaire de Marc (preuve : le n° écrit autrement) → elle y est, aucune vente créée, la
 *      répartition fait 100 %, la commission de Marc (manuelle, taux 47 %) n'a PAS bougé ; les deux espaces la voient ; un mauvais n° → 403 ;
 *   ② Modifier : Zoé (absente) → 403 ; Léa → accepté (décision 2 : elle change les honoraires) ; la commission de Marc reste ; l'administrateur → accepté ;
 *   ③ Garde de version : deux enregistrements sur la même version → le second 409, rien n'est écrasé ; idem entre « Mon espace » et la tuile
 *      (Modifier, Acte signé) ;
 *   ④ Journal : chaque geste tracé (auteur figé, avant → après) ; non modifiable en base ; un collaborateur n'y lit pas les commissions ;
 *   ⑤ Propagation : les gestes de « Mon espace » se lisent dans la tuile (société, FUSION, ligne miroir) et chez l'autre collègue ; l'inverse aussi.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE ; la 449 appliquée par l'épreuve). 🔒 REFUSE de tourner ailleurs que sur `svav_jetable…` ou
 * `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_modification \
 *     npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/modification.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { acteSigne, enregistrerDossier, lireVentes, MOTIF_CONFLIT_VERSION } from '../transaction/repo';
import { lireDossier } from '../transaction/saisie';
import { totalCompromisEnCours } from '../transaction/compromisEnCours';
import type { Vente } from '../transaction/modele';
import { MOTIF_MODIFIER_PAS_SUR_UN_COTE, MOTIF_REJOINDRE_MANDAT } from './modification';
import { journalMonEspace, modifierDepuisMonEspace } from './modificationRepo';
import { lireMesAffaires } from './mesAffairesRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });
const dossier = (o: Record<string, unknown>) => { const d = lireDossier(o); if (!d.ok) throw new Error(d.motif); return d.valeur; };
const lire = async (id: number, vue: 'criterimmo' | 'macj' | null = null): Promise<Vente> => (await lireVentes(vue)).find((v) => v.id === id)!;
const compter = async (): Promise<number> => Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM transaction_vente')).rows[0].n);

describe.skipIf(!baseEssai)('🔴 rejoindre, modifier, garde de version, journal', () => {
  let lea = 0; let marc = 0; let zoe = 0; let arno = 0; let id = 0;
  let honoraires = 12000; // les honoraires de l'affaire tels qu'enregistrés (l'écran renvoie ce qu'il a lu)
  const auteur = (libelle: string, compte: number) => ({ id: compte, libelle });
  // La saisie telle que l'écran l'envoie : l'affaire, Marc à l'entrée ; `o` change ce qu'il faut. Les commissions envoyées par l'écran (proposées)
  // sont celles qu'un écran pourrait envoyer : le serveur doit les IGNORER pour un collaborateur.
  const corps = (o: Record<string, unknown> = {}) => ({ societe: 'macj', statut: 'compromis', honorairesTtc: honoraires, retroApporteurTtc: 0, numeroMandat: 'REJ-1',
    dateCompromis: '2026-10-15', personnes: [{ role: 'vendeur', nom: 'VENDEUR REJOINT' }], entreeId: marc, sortieId: null,
    parties: [{ sorte: 'entree', compteId: marc, pourcentage: 100 }], ...o });
  const avecLea = (o: Record<string, unknown> = {}) => corps({ sortieId: lea, parties: [{ sorte: 'entree', compteId: marc, pourcentage: 50 }, { sorte: 'sortie', compteId: lea, pourcentage: 50 }],
    commissions: { entree: { montant: '0', unite: 'ttc', taux: 50, mode: 'manuelle' }, sortie: null }, ...o });
  const commissionDeMarc = async () => (await lire(id)).lignes.filter((l) => l.role === 'negociateur' && l.cote === 'entree').map((l) => [l.montantTtc, l.taux, l.mode]);

  it('⓪ la base jetable : quatre comptes, leur société ; la 449 ; l’affaire de Marc (sa commission saisie à la main, 47 %), créée dans la tuile', async () => {
    const compte = async (prenom: string, societe: string, role = 'collaborateur'): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', $3) RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom, role]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    lea = await compte('Lea', 'criterimmo'); marc = await compte('Marc', 'macj'); zoe = await compte('Zoe', 'criterimmo'); arno = await compte('Arno', 'criterimmo', 'administrateur');
    await query(readFileSync('db/migrations/449_transaction_numero_mandat.sql', 'utf8'));
    oublierSchemaDroits();
    const r = await enregistrerDossier(null, dossier(corps({ commissions: { entree: { montant: '2999,99', unite: 'ttc', taux: 47, mode: 'manuelle' }, sortie: null } })), JOUR, auteur('Marc ITEST', marc));
    if (!r.ok) throw new Error(r.motif);
    id = r.valeur as number;
    expect(await commissionDeMarc()).toEqual([[2999.99, 47, 'manuelle']]);
  });

  it('① Léa rejoint la sortie (preuve : le n° écrit autrement) : elle y est, aucune vente créée, 100 %, la commission de Marc intacte ; les deux espaces la voient', async () => {
    const avant = await compter();
    const faux = await modifierDepuisMonEspace(lea, id, dossier(avecLea()), { version: (await lire(id)).version ?? null, rejoindre: { numero: 'REJ-2' } }, JOUR, auteur('Lea ITEST', lea));
    expect(faux.ok ? null : [faux.statut, faux.motif]).toEqual([403, MOTIF_REJOINDRE_MANDAT]);
    const r = await modifierDepuisMonEspace(lea, id, dossier(avecLea()), { version: (await lire(id)).version ?? null, rejoindre: { numero: 'rej 01' } }, JOUR, auteur('Lea ITEST', lea));
    if (!r.ok) throw new Error(r.motif);
    expect(await compter()).toBe(avant);
    const v = await lire(id);
    expect([v.dossier?.entree?.id, v.dossier?.sortie?.id]).toEqual([marc, lea]);
    expect(v.repartition!.parties.reduce((t, p) => t + (p.pourcentage ?? 0), 0)).toBe(100);
    expect(await commissionDeMarc()).toEqual([[2999.99, 47, 'manuelle']]);
    for (const qui of [lea, marc]) expect((await lireMesAffaires(qui, JOUR)).compteurs.compromis.ids).toContain(id);
  });

  it('② Modifier : Zoé (absente) refusée ; Léa change les honoraires (décision 2) — la commission de Marc reste ; l’administrateur aussi', async () => {
    const version = async () => (await lire(id)).version ?? null;
    const z = await modifierDepuisMonEspace(zoe, id, dossier(avecLea({ honorairesTtc: 15000 })), { version: await version(), rejoindre: null }, JOUR, auteur('Zoe ITEST', zoe));
    expect(z.ok ? null : [z.statut, z.motif]).toEqual([403, MOTIF_MODIFIER_PAS_SUR_UN_COTE]);
    const l = await modifierDepuisMonEspace(lea, id, dossier(avecLea({ honorairesTtc: 15000 })), { version: await version(), rejoindre: null }, JOUR, auteur('Lea ITEST', lea));
    expect(l.ok).toBe(true);
    honoraires = 15000;
    expect((await lire(id)).honorairesTtc).toBe(15000);
    expect(await commissionDeMarc()).toEqual([[2999.99, 47, 'manuelle']]);
    const a = await modifierDepuisMonEspace(arno, id, dossier(avecLea({ honorairesTtc: 15000, note: 'vu par l’administrateur', commissions: undefined })), { version: await version(), rejoindre: null }, JOUR, auteur('Arno ITEST', arno));
    expect(a.ok).toBe(true);
  });

  it('③ garde de version : deux enregistrements sur la même version → le second 409, rien n’est écrasé ; idem entre « Mon espace » et la tuile', async () => {
    const v0 = (await lire(id)).version ?? null;
    expect((await modifierDepuisMonEspace(lea, id, dossier(avecLea({ note: 'Léa d’abord' })), { version: v0, rejoindre: null }, JOUR, auteur('Lea ITEST', lea))).ok).toBe(true);
    const second = await modifierDepuisMonEspace(marc, id, dossier(avecLea({ note: 'Marc ensuite' })), { version: v0, rejoindre: null }, JOUR, auteur('Marc ITEST', marc));
    expect(second.ok ? null : [second.statut, second.motif]).toEqual([409, MOTIF_CONFLIT_VERSION]);
    expect((await lire(id)).note).toBe('Léa d’abord');
    // la tuile Suivi CA, avec une version périmée : refusée aussi (Modifier, Acte signé) ; avec la bonne : acceptée
    const tuile = await enregistrerDossier(id, dossier(avecLea({ note: 'tuile périmée', commissions: undefined })), JOUR, auteur('Arno ITEST', arno), v0);
    expect(tuile.ok ? null : tuile.conflit).toBe(true);
    const acte = await acteSigne(id, '2026-12-01', auteur('Arno ITEST', arno), v0);
    expect(acte.ok ? null : acte.conflit).toBe(true);
    expect((await lire(id)).statut).toBe('compromis');
    expect((await enregistrerDossier(id, dossier(avecLea({ note: 'tuile à jour', commissions: undefined })), JOUR, auteur('Arno ITEST', arno), (await lire(id)).version ?? null)).ok).toBe(true);
    // chaque écriture fait avancer la version
    expect((await lire(id)).version!).toBeGreaterThan(v0!);
  });

  it('④ journal : chaque geste tracé (auteur figé, avant → après) ; non modifiable en base ; Léa n’y lit pas les commissions, l’administrateur oui', async () => {
    const pourLea = (await journalMonEspace(lea, id))!;
    const pourArno = (await journalMonEspace(arno, id))!;
    expect(pourLea.some((j) => j.auteur === 'Lea ITEST' && j.action === 'modification' && JSON.stringify(j.apres).includes('15000'))).toBe(true);
    expect(pourLea.some((j) => j.action === 'commissions')).toBe(false);
    expect(pourArno.some((j) => j.action === 'commissions')).toBe(true);
    expect(await journalMonEspace(zoe, id)).toBeNull();
    await expect(query('UPDATE transaction_journal SET auteur_libelle = $1 WHERE entite_id = $2', ['falsifié', id])).rejects.toThrow();
    await expect(query("DELETE FROM transaction_journal WHERE entite = 'vente' AND entite_id = $1", [id])).rejects.toThrow();
  });

  it('⑤ propagation : la tuile (société, FUSION, ligne miroir) et l’autre collègue lisent les gestes de « Mon espace » ; l’inverse aussi ; aucun double compte', async () => {
    const v = await lire(id);
    expect([v.honorairesTtc, (await lire(id, 'macj')).honorairesTtc]).toEqual([15000, 15000]);
    expect((await lire(id, 'criterimmo')).miroir?.origineId).toBe(id); // la part de Léa, ligne miroir chez CRITERIMMO
    expect(totalCompromisEnCours([v], null).htC).toBe(1250000); // 15 000 € TTC = 12 500 € HT, une seule fois pour le groupe
    const [l, m] = [(await lireMesAffaires(lea, JOUR)).compteurs.compromis.ca.htC, (await lireMesAffaires(marc, JOUR)).compteurs.compromis.ca.htC];
    expect(l + m).toBe(1250000);
    // l'inverse : la tuile change la répartition (60 / 40) → les deux espaces suivent
    expect((await enregistrerDossier(id, dossier(avecLea({ parties: [{ sorte: 'entree', compteId: marc, pourcentage: 60 }, { sorte: 'sortie', compteId: lea, pourcentage: 40 }], commissions: undefined })),
      JOUR, auteur('Arno ITEST', arno), (await lire(id)).version ?? null)).ok).toBe(true);
    expect([(await lireMesAffaires(marc, JOUR)).compteurs.compromis.ca.htC, (await lireMesAffaires(lea, JOUR)).compteurs.compromis.ca.htC]).toEqual([750000, 500000]);
  });
});
