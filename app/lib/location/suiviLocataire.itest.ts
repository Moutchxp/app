import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { gardeBaseJetable } from '../../scripts/baseJetable';

/**
 * ══ 🔴🔴 « SUIVI COMMERCIAL » DANS LA FICHE LOCATAIRE (Arno, 26/10/2026) — L'ÉPREUVE RÉELLE, SUR LA BASE JETABLE SEULEMENT ══════════════
 *   · une ligne « À qualifier » (origine à renseigner) : le bloc part VIDE ; enregistré → la MÊME ligne (aucune seconde), journalisée, et le
 *     Suivi du mois lit les mêmes valeurs ; relue ensuite : PRÉ-REMPLIE ; une version périmée : conflit, rien n'est écrit ;
 *   · un bail sans ligne : enregistrer CRÉE la ligne, rattachée au bail ; une seconde création : refusée (jamais de doublon) ;
 *   · un locataire en place : la ligne créée est un « Mandat de gestion seul » sans honoraire ; une ligne convertie dit sa conversion ;
 *   · plusieurs baux : la ligne du bail courant, les autres baux et lignes à part, rien n'est fusionné ; un bail d'un autre locataire : refusé.
 * Les migrations 430 à 432 sont appliquées au besoin (fichiers tels que livrés). 🔒 REFUSE DE DÉMARRER si DATABASE_URL ne vise pas `gestion_jetable`.
 */
const garde = gardeBaseJetable(process.env.DATABASE_URL);
if (garde !== null) throw new Error(garde);
vi.mock('./sondeLocation', async () => {
  const { query } = await import('../db/client');
  return {
    colonneExisteMemo: async (t: string, c: string) => ((await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [t, c])).rows[0]?.n ?? 0) > 0,
    oublierSchemaLocation: () => {},
  };
});

const { query, pool } = await import('../db/client');
const { lireSuiviLocataire, enregistrerSuiviLocataire } = await import('./suiviLocataireRepo');
const { lireActivites } = await import('./suivi/tableauBordRepo');
const { convertirEnMandatSeul } = await import('./suivi/conversionMandatRepo');
const { suiviDeDepart, suiviVide } = await import('./suiviLocataire');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
let proprio = 0;
const id = async (sql: string, p: unknown[]): Promise<number> => Number((await query<{ id: string }>(sql, p)).rows[0].id);
const lot = (adresse: string): Promise<number> => id(
  `INSERT INTO gestion_annuaire_lot (wippimmo_id, proprietaire_id, proprietaire_texte, adresse, commune, categorie, en_gestion, statut_bien_depuis)
   VALUES ($1, $2, 'TEST Test', $3, 'PARIS', 'logement', true, '2020-01-01') RETURNING id::text`, [`sl-${adresse}`, proprio, adresse]);
const locataire = (cle: string, nom: string): Promise<number> => id(
  `INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise) VALUES ($1, $1, $2, lower($2)) RETURNING id::text`, [cle, nom]);
const bail = async (l: number, loc: number, entree: string, sortie: string | null = null): Promise<number> => {
  const b = await id('INSERT INTO gestion_bail (lot_id, entree, sortie) VALUES ($1, $2::date, $3::date) RETURNING id::text', [l, entree, sortie]);
  // Les dates du bail suivent ses occupations (`gestion_bail_dates_trg`) : la sortie se pose sur l'occupation.
  await query('INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, sortie, bail_id) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)',
    [`o-${b}`, loc, l, `w-${l}`, entree, sortie, b]);
  return b;
};
const ligne = (bailId: number, l: number, o: { type?: string; date: string; origine: string | null; hp: number; hl: number }): Promise<number> => id(
  `INSERT INTO gestion_location_activite (type, date_signature, bail_id, lot_id, libelle_proprietaire, libelle_locataire, hono_proprietaire_ht, hono_locataire_ht,
     negociateur_libelle, origine_contact, source, cree_par_libelle) VALUES ($1, $2::date, $3, $4, 'TEST Test', 'LOC', $5, $6, '', $7, 'import', 'épreuve') RETURNING id::text`,
  [o.type ?? 'bail', o.date, bailId, l, o.hp, o.hl, o.origine]);
const lignesDuBail = async (b: number) => (await query<{ id: string; type: string }>('SELECT id::text, type FROM gestion_location_activite WHERE bail_id = $1 AND annule_le IS NULL ORDER BY id', [b])).rows;
const journal = async (activite: number) => (await query<{ n: number }>(
  `SELECT count(*)::int AS n FROM gestion_journal WHERE action = 'location_dossier_suivi' AND ((entite = 'location_activite' AND entite_id = $1) OR commentaire LIKE $2)`,
  [activite, `%ligne de suivi n° ${activite})%`])).rows[0].n;
const SAISIE = { type: 'bail', dateSignature: '2026-09-01', honoProprietaireHt: '500', honoLocataireHt: '100', negociateurId: 4, apporteurId: null, apporteurTaux: '',
  mandatGestion: false, avecGestion: false, origineProprietaire: null, origineLocataire: null, origineContact: 'internet', collegueId: null, commissionApporteur: '',
  primeMode: 'aucune', primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '', categoriePrime: 'logement' };

const L: Record<string, number> = {};
beforeAll(async () => {
  for (const [col, f] of [['entre_occupe', '430_location_rentre_occupe.sql'], ['converti_le', '431_location_bascules_octobre_conversion.sql']] as const) {
    const t = col === 'entre_occupe' ? 'gestion_annuaire_lot' : 'gestion_location_activite';
    if ((await query<{ n: number }>('SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [t, col])).rows[0].n === 0) {
      await pool.query(readFileSync(`db/migrations/${f}`, 'utf8'));
    }
  }
  if ((await query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'gestion_location_negociateur_alias'`)).rows[0].n === 0) {
    await pool.query(readFileSync('db/migrations/432_location_negociateur_alias.sql', 'utf8'));
  }
  await query(`INSERT INTO admin_utilisateur (id, identifiant, mot_de_passe, role, prenom, nom) VALUES (3, 'a.jorel@sansvisavis.com', 'x', 'administrateur', 'Arnaud', 'JOREL'),
               (4, 'jb.pons@sansvisavis.com', 'x', 'collaborateur', 'Jean-Baptiste', 'PONS') ON CONFLICT (id) DO NOTHING`);
  proprio = await id(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise) VALUES ('sl-p', 'TEST', 'TEST Test', 'test test') RETURNING id::text`, []);
  L.loc = await locataire('sl-l', 'MARTIN Léa');
  L.autre = await locataire('sl-a', 'DUPONT Paul');
  L.lotAncien = await lot('1 Rue Ancienne'); L.bailAncien = await bail(L.lotAncien, L.loc, '2021-03-01', '2026-08-31');
  L.ligneAncienne = await ligne(L.bailAncien, L.lotAncien, { date: '2021-02-20', origine: 'recommandation', hp: 900, hl: 0 });
  L.lot = await lot('7 Rue des Essais'); L.bail = await bail(L.lot, L.loc, '2026-09-12');
  L.aQualifier = await ligne(L.bail, L.lot, { date: '2026-09-05', origine: null, hp: 416.67, hl: 226.95 });
  L.avenant = await ligne(L.bail, L.lot, { type: 'avenant', date: '2026-10-02', origine: null, hp: 50, hl: 0 });
  L.lotSans = await lot('9 Rue Sans Suivi'); L.bailSans = await bail(L.lotSans, L.loc, '2026-06-01');
  L.lotAutre = await lot('5 Rue Autre'); L.bailAutre = await bail(L.lotAutre, L.autre, '2026-05-01');
});
afterAll(async () => { await pool.end(); });

describe('🔴 une ligne « À qualifier » : vide, puis la MÊME ligne enregistrée', () => {
  let version = '';
  it('lue : la ligne du Suivi d’où l’on vient ; « non validée » ; le bloc part VIDE (rien n’est repris)', async () => {
    const r = await lireSuiviLocataire(L.loc, { bailId: L.bail, activiteId: L.aQualifier });
    if (r.etat !== 'ok' || r.data.courant.sorte !== 'ligne') throw new Error(JSON.stringify(r));
    expect([r.data.courant.activiteId, r.data.courant.bailId, r.data.courant.valide]).toEqual([L.aQualifier, L.bail, false]);
    expect(suiviDeDepart(r.data.courant)).toEqual(suiviVide({ type: 'bail', categoriePrime: r.data.courant.suivi.categoriePrime }));
    version = r.data.courant.version;
  });
  it('ENREGISTRÉE : la même ligne mise à jour (toujours UNE ligne « Bail » pour ce bail), chaque champ au journal', async () => {
    const avant = await lignesDuBail(L.bail);
    const r = await enregistrerSuiviLocataire(L.loc, { bailId: L.bail, activiteId: L.aQualifier, version, suivi: SAISIE }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(r.etat === 'ok' && r.data.activiteId).toBe(L.aQualifier);
    expect(r.etat === 'ok' && r.data.changements.map((c) => c.champ)).toEqual(expect.arrayContaining(['Date de signature du bail', 'Négociateur', 'Origine du contact', 'Honoraires propriétaire HT']));
    expect(await lignesDuBail(L.bail)).toEqual(avant);
    expect((await lignesDuBail(L.bail)).filter((x) => x.type === 'bail')).toHaveLength(1);
    expect(await journal(L.aQualifier)).toBeGreaterThan(0);
  });
  it('🔴 LE SUIVI DU MOIS lit les MÊMES valeurs (une seule source : la ligne)', async () => {
    const a = (await lireActivites([2026])).find((x) => x.id === L.aQualifier);
    expect([a?.dateSignature, a?.honoProprietaireHt, a?.honoLocataireHt, a?.negociateurId, a?.origineContact, a?.bailId]).toEqual(['2026-09-01', 500, 100, 4, 'internet', L.bail]);
  });
  it('relue : désormais PRÉ-REMPLIE avec ce qui vient d’être validé', async () => {
    const r = await lireSuiviLocataire(L.loc, { activiteId: L.aQualifier });
    if (r.etat !== 'ok' || r.data.courant.sorte !== 'ligne') throw new Error('lecture');
    expect(r.data.courant.valide).toBe(true);
    const d = suiviDeDepart(r.data.courant);
    expect([d?.dateSignature, d?.honoProprietaireHt, d?.negociateurId, d?.origineContact]).toEqual(['2026-09-01', '500', 4, 'internet']);
  });
  it('une version PÉRIMÉE : conflit, rien n’est écrit', async () => {
    const r = await enregistrerSuiviLocataire(L.loc, { bailId: L.bail, activiteId: L.aQualifier, version, suivi: { ...SAISIE, honoProprietaireHt: '1' } }, AUTEUR);
    expect(r.etat).toBe('conflit');
    expect((await lireActivites([2026])).find((x) => x.id === L.aQualifier)?.honoProprietaireHt).toBe(500);
  });
});

describe('🔴 un bail SANS ligne : création rattachée au bail, jamais de doublon', () => {
  it('lu : « sans ligne » (bloc vide) ; enregistré : UNE ligne créée, rattachée à CE bail, journalisée ; une seconde création : refusée', async () => {
    const r = await lireSuiviLocataire(L.loc, { bailId: L.bailSans });
    expect(r.etat === 'ok' && r.data.courant.sorte).toBe('sans_ligne');
    const c = await enregistrerSuiviLocataire(L.loc, { bailId: L.bailSans, activiteId: null, version: '', suivi: { ...SAISIE, dateSignature: '2026-05-20' } }, AUTEUR);
    if (c.etat !== 'ok') throw new Error(JSON.stringify(c));
    const lignes = await lignesDuBail(L.bailSans);
    expect(lignes).toEqual([{ id: String(c.data.activiteId), type: 'bail' }]);
    expect(c.data.changements.every((x) => x.avant === '(vide)')).toBe(true);
    expect(await journal(c.data.activiteId)).toBe(c.data.changements.length);
    const deux = await enregistrerSuiviLocataire(L.loc, { bailId: L.bailSans, activiteId: null, version: '', suivi: SAISIE }, AUTEUR);
    expect(deux.etat).toBe('conflit');
    expect(await lignesDuBail(L.bailSans)).toHaveLength(1);
    const relu = await lireSuiviLocataire(L.loc, { bailId: L.bailSans });
    expect(relu.etat === 'ok' && relu.data.courant.sorte === 'ligne' && relu.data.courant.valide).toBe(true);
  });
  it('un bail qui n’est pas celui du locataire : refusé, rien n’est écrit', async () => {
    const r = await enregistrerSuiviLocataire(L.loc, { bailId: L.bailAutre, activiteId: null, version: '', suivi: SAISIE }, AUTEUR);
    expect(r.etat).toBe('refus');
    expect(await lignesDuBail(L.bailAutre)).toEqual([]);
  });
});

describe('🔴 locataire en place : « Mandat de gestion seul »', () => {
  it('un bail marqué « en place » sans ligne : la ligne CRÉÉE est un « Mandat de gestion seul », sans honoraire de location', async () => {
    const l = await lot('11 Rue En Place');
    const b = await bail(l, L.loc, '2014-12-26');
    await query('UPDATE gestion_bail SET en_place_prise_gestion = true WHERE id = $1', [b]);
    const lu = await lireSuiviLocataire(L.loc, { bailId: b });
    expect(lu.etat === 'ok' && lu.data.courant.sorte === 'sans_ligne' && lu.data.courant.enPlace !== null).toBe(true);
    const c = await enregistrerSuiviLocataire(L.loc, { bailId: b, activiteId: null, version: '', suivi: { ...SAISIE, dateSignature: '2026-10-20' } }, AUTEUR);
    if (c.etat !== 'ok') throw new Error(JSON.stringify(c));
    const a = (await query<{ type: string; hp: string; hl: string }>('SELECT type, hono_proprietaire_ht AS hp, hono_locataire_ht AS hl FROM gestion_location_activite WHERE id = $1', [c.data.activiteId])).rows[0];
    expect([a.type, Number(a.hp), Number(a.hl)]).toEqual(['gestion_seule', 0, 0]);
    const relu = await lireSuiviLocataire(L.loc, { bailId: b });
    if (relu.etat !== 'ok' || relu.data.courant.sorte !== 'ligne') throw new Error('lecture');
    expect([relu.data.courant.suivi.type, relu.data.courant.enPlace]).toEqual(['gestion_seule', { dateMandat: '2026-10-20' }]);
  });
  it('une ligne « Bail » CONVERTIE (le geste du Suivi du mois) : montrée en « Mandat de gestion seul », avec sa conversion et sa date d’origine', async () => {
    const l = await lot('13 Rue Convertie');
    const b = await bail(l, L.loc, '2014-12-26');
    const a = await ligne(b, l, { date: '2014-12-26', origine: 'proprietaire_deja_client', hp: 0, hl: 0 });
    expect((await convertirEnMandatSeul(a, '2026-10-20', AUTEUR)).etat).toBe('ok');
    const r = await lireSuiviLocataire(L.loc, { activiteId: a });
    if (r.etat !== 'ok' || r.data.courant.sorte !== 'ligne') throw new Error('lecture');
    expect([r.data.courant.suivi.type, r.data.courant.suivi.dateSignature, r.data.courant.enPlace]).toEqual(['gestion_seule', '2026-10-20', { dateMandat: '2026-10-20' }]);
    expect([r.data.courant.conversion?.typeOrigine, r.data.courant.conversion?.dateOrigine, r.data.courant.conversion?.par]).toEqual(['bail', '2014-12-26', AUTEUR.libelle]);
  });
});

describe('🔴 plusieurs baux : la ligne du bail courant, les autres à part (rien n’est fusionné)', () => {
  it('depuis la ligne du Suivi : la sienne ; l’avenant du même bail et l’ancien bail (sa ligne) dans « les autres »', async () => {
    const r = await lireSuiviLocataire(L.loc, { activiteId: L.aQualifier });
    if (r.etat !== 'ok') throw new Error('lecture');
    const autres = new Map(r.data.autres.map((b) => [b.bailId, b.lignes.map((x) => x.activiteId)]));
    expect(autres.get(L.bail)).toEqual([L.avenant]);
    expect(autres.get(L.bailAncien)).toEqual([L.ligneAncienne]);
    expect([...autres.values()].flat()).not.toContain(L.aQualifier);
    expect(r.data.autres.find((b) => b.bailId === L.bailAncien)?.sortie).toBe('2026-08-31');
  });
  it('sans ligne de départ (fiche de la Location) : le bail EN COURS le plus récent, sa ligne « Bail » (pas l’avenant)', async () => {
    const r = await lireSuiviLocataire(L.loc);
    if (r.etat !== 'ok' || r.data.courant.sorte !== 'ligne') throw new Error('lecture');
    expect([r.data.courant.bailId, r.data.courant.activiteId]).toEqual([L.bail, L.aQualifier]);
  });
  it('une ligne du Suivi « non rattachée » : rien n’est pris à sa place ; tous les baux restent consultables', async () => {
    const r = await lireSuiviLocataire(L.loc, { nonRattache: true });
    if (r.etat !== 'ok') throw new Error('lecture');
    expect(r.data.courant).toEqual({ sorte: 'non_rattache' });
    expect(r.data.autres.map((b) => b.bailId)).toEqual(expect.arrayContaining([L.bail, L.bailAncien, L.bailSans]));
  });
});
