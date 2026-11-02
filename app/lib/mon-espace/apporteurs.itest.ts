/**
 * ══ 🔴 MON ESPACE, LOT 9 — « MES APPORTEURS » SUR UNE BASE JETABLE (Arno, 02/11/2026) ═════════════════════════════════════════════════════════════
 *
 *   ① un apporteur créé depuis « Mon espace » est dans l'annuaire de la Location (`lireApporteurs`, le même), rattaché au titulaire ;
 *   ② un homonyme, le même téléphone, le même e-mail : 409, rien n'est créé ; deux créations SIMULTANÉES : une seule fiche ;
 *   ③ qui voit quoi : Marc ne voit pas l'apporteur de Léa — jusqu'à « L'utiliser » (450), sans que son rattachement change ; il ne peut pas en
 *      modifier la fiche (403) ; Léa la modifie, et la Location la lit aussitôt ; un apporteur créé dans la Location pour Marc est dans son espace ;
 *   ④ le CA par apporteur de « Mes apporteurs » = celui du Suivi CA (`parApporteur` sur toutes les ventes) pour un apporteur des seules ventes de Léa.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, VIDE ; 449 et 450 appliquées par l'épreuve). 🔒 REFUSE de tourner ailleurs que sur `svav_jetable…`
 * ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_apporteurs \
 *     npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/apporteurs.itest.ts
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { oublierSchemaDroits } from '../admin/schemaDroits';
import { creerApporteur, lireApporteurs } from '../location/suivi/suiviRepo';
import { ficheDe } from '../location/suivi/ficheApporteur';
import { enregistrerDossier, lireRetrocessions, lireVentes, saisirRetro } from '../transaction/repo';
import { parApporteur } from '../transaction/modele';
import { lireDossier } from '../transaction/saisie';
import { creerApporteurMonEspace, lireMesApporteurs, modifierFicheMonEspace, utiliserApporteur } from './apporteursRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const JOUR = '2026-11-02';
afterAll(async () => { if (baseEssai) await closePool(); });

describe.skipIf(!baseEssai)('🔴 « Mes apporteurs » : un seul annuaire, zéro doublon, qui voit quoi, le même CA', () => {
  let lea = 0; let marc = 0; let paul = 0;
  const auteurLea = { id: null, libelle: 'Lea ITEST' };
  const auteurMarc = { id: null, libelle: 'Marc ITEST' };
  const ids = async (qui: number) => (await lireMesApporteurs(qui)).apporteurs.map((a) => a.id);

  it('⓪ la base jetable : deux comptes, la 449 et la 450', async () => {
    const compte = async (prenom: string, societe: string): Promise<number> => {
      const { rows } = await query<{ id: string }>(`INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role) VALUES ($1, $2, 'ITEST', 'x', 'collaborateur') RETURNING id`,
        [`${prenom.toLowerCase()}@itest.local`, prenom]);
      await query(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, pose_par_libelle) VALUES ($1, $2, '2020-01-01', 'saisie', 'itest')`, [rows[0].id, societe]);
      return Number(rows[0].id);
    };
    lea = await compte('Lea', 'criterimmo'); marc = await compte('Marc', 'macj');
    for (const f of ['449_transaction_numero_mandat.sql', '450_mon_espace_apporteur_utilise.sql']) await query(readFileSync(`db/migrations/${f}`, 'utf8'));
    oublierSchemaDroits();
  });

  it('① créé depuis « Mon espace » : dans l’annuaire de la Location, rattaché à Léa ; dans SES apporteurs', async () => {
    const r = await creerApporteurMonEspace(lea, { nom: 'Paul DURAND', type: 'partenaire', taux: '', interne: false, telephone: '06 12 34 56 78', email: 'paul@durand.fr' }, auteurLea);
    if (!r.ok) throw new Error(r.motif);
    paul = r.id;
    const fiche = (await lireApporteurs()).find((a) => a.id === paul)!;
    expect([fiche.nom, fiche.telephone, fiche.collegues?.at(-1)?.collegueId]).toEqual(['Paul DURAND', '06 12 34 56 78', lea]);
    expect(await ids(lea)).toContain(paul);
  });

  it('② homonyme, même téléphone, même e-mail : 409 avec la fiche et son collègue, rien n’est créé', async () => {
    const avant = (await lireApporteurs()).length;
    for (const saisie of [{ nom: 'Durand Paul' }, { nom: 'Quelqu’un', telephone: '+33612345678' }, { nom: 'Autre', email: 'PAUL@durand.fr' }]) {
      const r = await creerApporteurMonEspace(marc, { type: 'partenaire', taux: '', interne: false, ...saisie }, auteurMarc);
      expect(r).toMatchObject({ ok: false, statut: 409, doublons: [{ id: paul, collegue: 'Lea ITEST' }] });
    }
    expect((await lireApporteurs()).length).toBe(avant);
  });

  it('② deux créations SIMULTANÉES du même apporteur : une seule fiche', async () => {
    const corps = { nom: 'Jean SIMULTANE', type: 'partenaire', taux: '', interne: false, telephone: '0711111111' };
    const rs = await Promise.all([creerApporteurMonEspace(lea, corps, auteurLea), creerApporteurMonEspace(marc, corps, auteurMarc)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toMatchObject({ statut: 409 });
    expect((await lireApporteurs()).filter((a) => a.nom === 'Jean SIMULTANE')).toHaveLength(1);
  });

  it('③ Marc ne voit pas Paul ; « L’utiliser » : il le voit, le rattachement ne bouge pas, deux clics = une ligne ; il ne modifie pas la fiche', async () => {
    expect(await ids(marc)).not.toContain(paul);
    expect(await utiliserApporteur(marc, paul, auteurMarc)).toEqual({ ok: true });
    expect(await utiliserApporteur(marc, paul, auteurMarc)).toEqual({ ok: true });
    const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM mon_espace_apporteur WHERE compte_id = $1 AND apporteur_id = $2', [marc, paul]);
    expect(rows[0].n).toBe(1);
    expect(await ids(marc)).toContain(paul);
    const vu = (await lireMesApporteurs(marc)).apporteurs.find((a) => a.id === paul)!;
    expect([vu.collegue, vu.modifiable]).toEqual(['Lea ITEST', false]);
    const fiche = (await lireApporteurs()).find((a) => a.id === paul)!;
    expect(await modifierFicheMonEspace(marc, paul, { ...ficheDe(fiche), societe: 'Piratage' }, fiche.version ?? null, auteurMarc)).toMatchObject({ ok: false, statut: 403 });
  });

  it('③ Léa modifie la fiche : la Location la lit aussitôt ; une version dépassée : 409', async () => {
    const fiche = (await lireApporteurs()).find((a) => a.id === paul)!;
    expect(await modifierFicheMonEspace(lea, paul, { ...ficheDe(fiche), societe: 'Cabinet Durand' }, fiche.version ?? null, auteurLea)).toMatchObject({ ok: true });
    expect((await lireApporteurs()).find((a) => a.id === paul)!.societe).toBe('Cabinet Durand');
    expect(await modifierFicheMonEspace(lea, paul, { ...ficheDe(fiche), societe: 'Encore' }, fiche.version ?? null, auteurLea)).toMatchObject({ ok: false, statut: 409 });
  });

  it('③ l’autre sens : un apporteur créé dans la Location pour Marc est dans « Mes apporteurs » de Marc, pas de Léa', async () => {
    const r = await creerApporteur({ nom: 'Zoé LOCATION', type: 'partenaire', taux: '', collegueId: marc, depuis: JOUR }, auteurMarc);
    if (r.etat !== 'ok' || r.data === undefined) throw new Error('création Location refusée');
    expect(await ids(marc)).toContain(r.data.id);
    expect(await ids(lea)).not.toContain(r.data.id);
  });

  it('④ le CA apporté par Paul dans « Mes apporteurs » = celui du Suivi CA ; une vente de Léa avec Paul entre aussi chez Léa', async () => {
    const d = lireDossier({ societe: 'criterimmo', statut: 'vendue', honorairesTtc: 12000, dateCompromis: '2026-01-10', dateActe: '2026-04-15', numeroMandat: 'A-1',
      entreeId: lea, sortieId: null, apporteurId: paul, retroApporteurTtc: 0, personnes: [{ role: 'vendeur', nom: 'VENDEUR APP' }],
      parties: [{ sorte: 'entree', compteId: lea, pourcentage: 100 }] });
    if (!d.ok) throw new Error(d.motif);
    const v = await enregistrerDossier(null, d.valeur, JOUR, auteurLea);
    if (!v.ok) throw new Error(v.motif);
    const retro = await saisirRetro({ societe: 'criterimmo', annee: 2026, mois: 4, negociateur: 'Lea ITEST', montantTtc: 1200, apporteur: 'Paul DURAND', venteId: v.valeur as number }, auteurLea);
    if (!retro.ok) throw new Error(retro.motif);
    const suiviCa = parApporteur(await lireRetrocessions(null), (await lireVentes(null)).filter((x) => x.statut === 'vendue')).find((l) => l.apporteur === 'Paul DURAND')!;
    const chezLea = (await lireMesApporteurs(lea)).apporteurs.find((a) => a.id === paul)!;
    expect([chezLea.nbVentes, chezLea.caApporteHt, chezLea.retroHt]).toEqual([suiviCa.ventesIds.length, suiviCa.caApporteHt, suiviCa.retroHt]);
    expect(chezLea.caApporteHt).toBeCloseTo(10000, 6);
    const chezMarc = (await lireMesApporteurs(marc)).apporteurs.find((a) => a.id === paul)!;
    expect(chezMarc.caApporteHt).toBe(0); // aucune de SES ventes
  });
});
