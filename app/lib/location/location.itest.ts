/**
 * ══ 🔴🔴 TUILE LOCATION (correction d'Arno du 17/10/2026) — SUR UNE BASE JETABLE ═══════════════════════════════════
 *
 *   ① « Nouveau propriétaire + bien + annexes » : propriétaire, logement, cave et parking créés, annexes EN ARBRE, N° de
 *      mandat posé ; fiche du bien et fiche du propriétaire les montrent ;
 *   ② dédoublonnage : un téléphone déjà connu est signalé (fiche X) ; rien n'est fusionné ;
 *   ③ le lien annexe → logement ne se perd jamais (UPDATE / DELETE refusés en base) ; pas d'annexe d'annexe ; une annexe se
 *      rattache à un logement du MÊME propriétaire ;
 *   ④ caractéristiques : l'adresse d'un bien IMPORTÉ n'est jamais réécrite ; celle d'un bien créé ici l'est ;
 *   ⑤ l'import WIPPIMMO ne marque pas absents les biens créés ici, et ne réécrit pas les caractéristiques saisies ;
 *   ⑥ données communes : une modification faite par la Location se lit dans la fiche de la Gestion ;
 *   ⑦ loyer de départ et taux : saisis sur la location d'un bien de la Location, relus par sa fiche ;
 *   ⑧ listes de l'accueil : le logement porte ses annexes ; le filtre trouve le propriétaire.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 372). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l2 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/location.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { appliquerPlan, ficheProprietaire } from '../gestion/annuaireRepo';
import { ajouterOccupant, creerPersonne, modifierPersonne } from '../gestion/annuaireEditionRepo';
import { enregistrerConditions } from '../gestion/honorairesGestionRepo';
import { normaliserTexte, nomComplet } from '../gestion/annuaire';
import type { PlanImport } from '../gestion/annuaireImport';
import {
  ajouterAnnexe, chercherDoublons, creerProprietaireEtBiens, enregistrerMandat, ficheBienLocation, ficheProprietaireLocation,
  listeBiens, listeProprietaires, modifierBien, rattacherAnnexe,
} from './locationRepo';

/** Arno (18/10/2026) : DPE et « Entretien à prévoir » obligatoires à la création d'un logement — l'ancienne voie aussi. */
const DPE_ENTRETIEN = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest Location' };
const S = `l2${Date.now().toString(36)}`;

afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T; motif?: string }): T => {
  if (i.etat !== 'ok') throw new Error(`attendu ok, reçu ${JSON.stringify(i)}`);
  return i.data as T;
};

describe.skipIf(!baseEssai)('🔴 tuile Location', () => {
  let proprietaireId = 0;
  let logementId = 0;

  it('① nouveau propriétaire + logement + cave + parking, annexes en arbre, N° de mandat', async () => {
    const r = ok(await creerProprietaireEtBiens({
      proprietaireId: null,
      proprietaire: { civilite: 'Mme', nom: `EXEMPLE${S}`, prenom: 'Claire', telephone: '06 12 34 56 71', email: `claire.${S}@exemple.test`, numeroMandat: 'MG 2026-041' },
      logement: { ...DPE_ENTRETIEN, adresse: `14 rue des Lilas ${S}`, codePostal: '75011', commune: 'Paris', etage: '3', porte: 'G', numLotCopro: '27', surfaceCarrezM2: '41,8', surfaceExterieureM2: '4' },
      annexes: [{ categorie: 'cave', etage: '-1', numLotCopro: '112', porte: '12' }, { categorie: 'parking', etage: '-2', numLotCopro: '152', porte: '52' }],
    }, AUTEUR));
    proprietaireId = r.proprietaireId;
    logementId = r.logementId;
    const f = ok(await ficheBienLocation(logementId));
    expect(f.bien).toMatchObject({ categorie: 'logement', etage: '3', porte: 'G', numLotCopro: '27', surfaceCarrezM2: 41.8, surfaceExterieureM2: 4, creeDansLApplication: true });
    expect(f.annexes.map((a) => [a.categorie, a.porte, a.adresse])).toEqual([['cave', '12', `14 rue des Lilas ${S}`], ['parking', '52', `14 rue des Lilas ${S}`]]);
    const annexe = ok(await ficheBienLocation(f.annexes[0].id));
    expect(annexe.parent?.id).toBe(logementId);
    const p = ok(await ficheProprietaireLocation(proprietaireId));
    expect(p.numeroMandat).toBe('MG 2026-041');
    expect(p.biens).toHaveLength(3);
    expect(p.fiche.lots.length).toBe(3); // la fiche commune (celle de la Gestion) voit les mêmes biens
  });

  it('② dédoublonnage : le téléphone déjà connu est signalé, rien n’est fusionné', async () => {
    const d = await chercherDoublons([{ sorte: 'telephone', valeur: '0612345671' }, { sorte: 'email', valeur: '' }]);
    expect(d.some((x) => x.sujet === 'proprietaire' && x.id === proprietaireId)).toBe(true);
    // On crée quand même (personne différente) : deux fiches, aucune fusion.
    ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `EXEMPLE${S}`, prenom: 'Paul', telephone: '06 12 34 56 71' },
      logement: { ...DPE_ENTRETIEN, adresse: `9 bd Inventé ${S}` }, annexes: [] }, AUTEUR));
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire WHERE nom LIKE $1', [`EXEMPLE${S}`])).rows[0].n)).toBe(2);
  });

  it('③ le lien annexe → logement ne se perd jamais ; pas d’annexe d’annexe ; même propriétaire exigé', async () => {
    const f = ok(await ficheBienLocation(logementId));
    const cave = f.annexes[0].id;
    await expect(query('UPDATE gestion_lot_annexe SET parent_id = $1 WHERE annexe_id = $2', [cave, cave])).rejects.toThrow(/ajout seul/);
    await expect(query('DELETE FROM gestion_lot_annexe WHERE annexe_id = $1', [cave])).rejects.toThrow(/ajout seul/);
    const sousAnnexe = await ajouterAnnexe(cave, { categorie: 'box' }, AUTEUR);
    expect(sousAnnexe.etat).toBe('refus');
    // Un bien du même propriétaire, autonome, se rattache ; celui d'un autre propriétaire, non.
    const autonome = ok(await creerProprietaireEtBiens({ proprietaireId, proprietaire: {}, logement: { ...DPE_ENTRETIEN, adresse: `Box ${S}`, categorie: 'box' }, annexes: [] }, AUTEUR));
    expect((await rattacherAnnexe(logementId, autonome.logementId, AUTEUR)).etat).toBe('ok');
    const autre = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `AUTRE${S}` }, logement: { ...DPE_ENTRETIEN, adresse: `Ailleurs ${S}` }, annexes: [] }, AUTEUR));
    const refus = await rattacherAnnexe(logementId, autre.logementId, AUTEUR);
    expect(refus.etat).toBe('refus');
    expect(ok(await ficheBienLocation(logementId)).annexes).toHaveLength(3);
  });

  it('④ caractéristiques : adresse d’un bien créé ici modifiable, celle d’un bien importé jamais réécrite', async () => {
    ok(await modifierBien(logementId, { categorie: 'logement', etage: '4', adresse: `16 rue des Lilas ${S}`, codePostal: '75011', commune: 'Paris' }, AUTEUR));
    expect(ok(await ficheBienLocation(logementId)).bien).toMatchObject({ etage: '4', adresse: `16 rue des Lilas ${S}` });
    // Un bien importé de WIPPIMMO :
    const plan = planImport();
    await appliquerPlan(plan, { appliquer: true, dossier: 'itest-l2', auteur: 'itest L2' });
    const imp = Number((await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_lot WHERE wippimmo_id = $1', [`${S}-L1`])).rows[0].id);
    ok(await modifierBien(imp, { etage: '2', porte: 'D', adresse: 'Adresse inventée' }, AUTEUR));
    const lu = ok(await ficheBienLocation(imp)).bien;
    expect(lu).toMatchObject({ etage: '2', porte: 'D', adresse: `5 impasse Modèle ${S}`, creeDansLApplication: false });
  });

  it('⑤ un nouvel import ne marque pas absents les biens créés ici, et ne réécrit pas les caractéristiques', async () => {
    await appliquerPlan(planImport(), { appliquer: true, dossier: 'itest-l2', auteur: 'itest L2' });
    const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_annuaire_lot WHERE wippimmo_id LIKE 'app-%' AND absent_le IS NOT NULL`);
    expect(Number(rows[0].n)).toBe(0);
    const imp = Number((await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_lot WHERE wippimmo_id = $1', [`${S}-L1`])).rows[0].id);
    expect(ok(await ficheBienLocation(imp)).bien).toMatchObject({ etage: '2', porte: 'D' });
  });

  it('⑥ données communes : une modification par la Location se lit dans la fiche de la Gestion', async () => {
    ok(await modifierPersonne('proprietaire', proprietaireId, { note: `note ${S}` }, AUTEUR));
    const g = await ficheProprietaire(proprietaireId);
    if (g.etat !== 'ok') throw new Error('fiche absente');
    expect(g.data.personnes.find((p) => p.id === proprietaireId)?.note).toBe(`note ${S}`);
    ok(await enregistrerMandat(proprietaireId, '  MG 2026-042 ', AUTEUR));
    expect(ok(await ficheProprietaireLocation(proprietaireId)).numeroMandat).toBe('MG 2026-042');
  });

  it('⑦ loyer de départ et taux saisis sur la location du bien, relus par la fiche de la Location', async () => {
    const loc = await creerPersonne('locataire', { nom: `MODELE${S} Jules`, coordonnees: [{ sorte: 'email', valeur: `jules.${S}@exemple.test`, libelle: '' }] }, AUTEUR);
    if (loc.etat !== 'ok') throw new Error('locataire non créé');
    ok(await ajouterOccupant(logementId, loc.data.id, '2026-03-01', AUTEUR));
    const f = ok(await ficheBienLocation(logementId));
    const occ = f.fiche.occupations[0].occupationId;
    ok(await enregistrerConditions(occ, { loyerHc: '1180', provisions: '90', tauxHt: '4,5', base: 'cc' }, AUTEUR));
    const relue = ok(await ficheBienLocation(logementId)).locations.find((l) => l.occupationId === occ)?.location;
    expect(relue?.conditions).toMatchObject({ loyerHc: 1180, provisions: 90, tauxHt: 4.5, base: 'cc' });
  });

  it('⑨ ancienne page « Nouveau propriétaire + bien » : DPE et entretien obligatoires (refus avant TOUTE écriture, fiche du propriétaire comprise) ; « Non soumis » ; une annexe autonome non concernée', async () => {
    const compter = async (t: string) => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`)).rows[0].n);
    // Un propriétaire À LUI (les comptes des autres cas ne bougent pas).
    const p9 = ok(await creerPersonne('proprietaire', { nom: `NEUF${S}`, coordonnees: [] }, AUTEUR)).id;
    const [lots, fiches] = [await compter('gestion_annuaire_lot'), await compter('gestion_annuaire_proprietaire')];
    const sans = await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `SANSDPE${S}` }, logement: { adresse: `1 rue Sans DPE ${S}` }, annexes: [] }, AUTEUR);
    expect(sans.etat).toBe('refus');
    expect(sans.etat === 'refus' && sans.motif).toContain('Choisissez la classe DPE (A à G) ou « Non soumis ».');
    expect(sans.etat === 'refus' && sans.motif).toContain('Entretien à prévoir : répondez Oui ou Non.');
    const refus = async (l: Record<string, unknown>) => {
      const r = await creerProprietaireEtBiens({ proprietaireId: p9, proprietaire: {}, logement: { adresse: `1 rue Sans DPE ${S}`, ...DPE_ENTRETIEN, ...l }, annexes: [] }, AUTEUR);
      return r.etat === 'refus' ? r.motif : r.etat;
    };
    expect(await refus({ dpeDate: '' })).toBe('La date du DPE est obligatoire (sauf « Non soumis »).');
    expect(await refus({ dpeDate: '2999-01-01' })).toBe('La date du DPE ne peut pas être dans le futur.');
    expect(await refus({ entretienAPrevoir: true, entretiens: [] })).toContain('cochez ou ajoutez au moins un entretien');
    expect([await compter('gestion_annuaire_lot'), await compter('gestion_annuaire_proprietaire')]).toEqual([lots, fiches]);
    // « Non soumis » sans date, entretien « Oui » + chaudière : accepté, écrit comme par le formulaire complet.
    const ns = ok(await creerProprietaireEtBiens({ proprietaireId: p9, proprietaire: {}, logement: { adresse: `2 rue Non Soumis ${S}`, dpeClasse: 'non_soumis', dpeDate: '',
      entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', dateAnniversaire: '2026-11-02' }] }, annexes: [] }, AUTEUR));
    const { rows } = await query<{ dpe_classe: string | null; dpe_date: string | null; dpe_non_soumis: boolean | null; entretien_a_prevoir: boolean | null }>(
      'SELECT dpe_classe, dpe_date::text, dpe_non_soumis, entretien_a_prevoir FROM gestion_annuaire_lot WHERE id = $1', [ns.logementId]);
    expect(rows[0]).toEqual({ dpe_classe: null, dpe_date: null, dpe_non_soumis: true, entretien_a_prevoir: true });
    const { rows: e } = await query<{ sorte: string }>('SELECT sorte FROM gestion_lot_entretien WHERE lot_id = $1', [ns.logementId]);
    expect(e.map((x) => x.sorte)).toEqual(['chaudiere']);
    // Une classe, comme au formulaire : enregistrée telle quelle.
    const c = ok(await creerProprietaireEtBiens({ proprietaireId: p9, proprietaire: {}, logement: { adresse: `3 rue Classe ${S}`, ...DPE_ENTRETIEN, dpeClasse: 'g' }, annexes: [] }, AUTEUR));
    const { rows: g } = await query<{ dpe_classe: string; dpe_date: string }>('SELECT dpe_classe, dpe_date::text FROM gestion_annuaire_lot WHERE id = $1', [c.logementId]);
    expect(g[0]).toEqual({ dpe_classe: 'G', dpe_date: '2024-03-01' });
    // Une annexe autonome (box) : pas de DPE demandé.
    ok(await creerProprietaireEtBiens({ proprietaireId: p9, proprietaire: {}, logement: { adresse: `Box 2 ${S}`, categorie: 'box' }, annexes: [] }, AUTEUR));
  });

  it('⑧ listes : le logement porte ses annexes ; le filtre trouve le propriétaire', async () => {
    const biens = await listeBiens(0, `16 rue des Lilas ${S}`);
    const tete = biens.lignes.find((b) => b.id === logementId);
    expect(tete?.annexes.map((a) => a.categorie).sort()).toEqual(['box', 'cave', 'parking']);
    expect(biens.lignes.some((b) => b.parentId !== null)).toBe(false);
    const p = await listeProprietaires(0, `EXEMPLE${S}`);
    expect(p.lignes.find((x) => x.id === proprietaireId)).toMatchObject({ biens: 4, numeroMandat: 'MG 2026-042' });
  });
});

function planImport(): PlanImport {
  const nom = nomComplet(`IMPORT${S}`, 'Luc');
  return {
    proprietaires: [{ wippimmoId: `${S}-P1`, civilite: null, nom: `IMPORT${S}`, prenom: 'Luc', nomComplet: nom, nomNormalise: normaliserTexte(nom),
      adresse: null, commune: null, codePostal: null, adresseNormalisee: '', relationDepuis: null, contacts: [] }],
    lots: [{ wippimmoId: `${S}-L1`, proprietaireTexte: nom, proprietaireCle: normaliserTexte(nom), immeuble: null, nature: 'Appartement',
      typeBien: 'Type 2', adresse: `5 impasse Modèle ${S}`, commune: 'Paris', codePostal: '75011',
      adresseNormalisee: normaliserTexte(`5 impasse Modèle ${S} Paris`), gestionDebut: null, gestionFin: null }],
    locataires: [], occupations: [], rejets: [], homonymes: [], lotsSansProprietaire: 0, occupationsHorsGestion: 0, locatairesRegroupes: 0,
  };
}
