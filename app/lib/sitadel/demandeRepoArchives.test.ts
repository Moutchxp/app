import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A1a — listerArchives. On mocke ../db/client et on route la requête d'archives par son fragment `dd.satisfait_le IS NOT
 * NULL`. On PROUVE : (1) seuls les dossiers SATISFAITS sont archivés (filtre SQL) via JOINTURE (pas de rapprochement mémoire,
 * piège bigint→chaîne évité) ; (2) la CLÉ de stockage n'est jamais sélectionnée (seulement `IS NOT NULL`) ni renvoyée ; (3) le
 * mapping + `classer` ; (4) un permis satisfait SANS pièce apparaît quand même.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { rows: [] as Record<string, unknown>[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (sql.includes('dd.satisfait_le IS NOT NULL')) return { rows: state.rows };
    return { rows: [] }; // config_veille + sous-lectures → défauts (seuils 10/1500, rangs 1..5)
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { listerArchives } from './demandeRepo';
import { chargerConfigVeille } from './veilleConfig';

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  dossier_id: 1, num_dau: 'PC0750560001', code_insee: '75056', commune_nom: 'Paris',
  type: 'PC', nature_projet_completee: '1', i_extension: false, i_surelevation: false, nb_lgt_tot_crees: 20, surf_creee: 2000,
  date_autorisation: '2026-05-01', satisfait_le: '2026-07-01', satisfait_par: 'automatique', demande_reference: 'SVAV-DEM-2026-000042',
  pieces: [{ id: 10, nomFichier: 'plan.pdf', typeMime: 'application/pdf', tailleOctets: 12345, deposee: true, motifNonStocke: null, origine: 'email' }],
  ...over,
});
const archiveQuery = () => H.appels.find((a) => a.sql.includes('dd.satisfait_le IS NOT NULL'))!;

beforeEach(() => { H.appels.length = 0; H.state.rows = []; });

describe('A1a — listerArchives : filtre satisfait + jointure SQL', () => {
  it('n’archive QUE les dossiers satisfaits (WHERE satisfait_le IS NOT NULL), par JOINTURE SQL (jamais en mémoire)', async () => {
    await listerArchives(await chargerConfigVeille());
    const sql = archiveQuery().sql.replace(/\s+/g, ' ');
    expect(sql).toContain('WHERE dd.satisfait_le IS NOT NULL');
    expect(sql).toContain('JOIN sitadel_dossier s ON s.id = dd.dossier_id'); // jointure SQL → piège bigint→chaîne évité
    expect(sql).toContain('JOIN demande dm ON dm.id = dd.demande_id');
    expect(sql).toContain('ORDER BY dd.satisfait_le DESC');
  });

  it('la CLÉ de stockage n’est jamais sélectionnée : seulement `cle_stockage IS NOT NULL` (booléen)', async () => {
    await listerArchives(await chargerConfigVeille());
    const sql = archiveQuery().sql;
    expect(sql).toContain('cle_stockage IS NOT NULL'); // exposée comme booléen `deposee`
    expect(sql).not.toMatch(/cle_stockage\s+AS/i);     // jamais renvoyée telle quelle
    expect(sql).not.toContain("'cle', p.cle_stockage");
  });
});

describe('A1a — listerArchives : mapping + pièces', () => {
  it('mappe une ligne + classe la catégorie via classer (source unique), pièces comprises ; la clé n’est nulle part', async () => {
    H.state.rows = [row()];
    const r = await listerArchives(await chargerConfigVeille());
    expect(r).toHaveLength(1);
    expect(r[0].numDau).toBe('PC0750560001');
    expect(r[0].categorie).toBe('immeuble_neuf');       // nature '1' + 20 logements ≥ seuil → immeuble neuf
    expect(r[0].demandeReference).toBe('SVAV-DEM-2026-000042');
    expect(r[0].satisfaitPar).toBe('automatique');
    expect(r[0].pieces).toEqual([{ id: 10, nomFichier: 'plan.pdf', typeMime: 'application/pdf', tailleOctets: 12345, deposee: true, motifNonStocke: null, origine: 'email' }]);
    expect(JSON.stringify(r)).not.toContain('cle_stockage'); // la clé n'est nulle part dans le résultat
  });

  it('un permis renseigné SANS pièce apparaît quand même (pieces = [])', async () => {
    H.state.rows = [row({ pieces: [] })];
    const r = await listerArchives(await chargerConfigVeille());
    expect(r).toHaveLength(1);
    expect(r[0].pieces).toEqual([]);
  });

  it('une pièce NON déposée porte son motif (deposee = false)', async () => {
    H.state.rows = [row({ pieces: [{ id: 11, nomFichier: 'coupe.pdf', typeMime: null, tailleOctets: null, deposee: false, motifNonStocke: 'dépôt S3 non configuré', origine: 'email' }] })];
    const r = await listerArchives(await chargerConfigVeille());
    expect(r[0].pieces[0].deposee).toBe(false);
    expect(r[0].pieces[0].motifNonStocke).toBe('dépôt S3 non configuré');
  });
});

describe('G2 — listerArchives : charge le délai G1 (recu_le, expiration L1, lien fort) via la réponse', () => {
  it('la requête joint la réponse et sélectionne recu_le + l’expiration des liens forts + a_lien_fort', async () => {
    await listerArchives(await chargerConfigVeille());
    const sql = archiveQuery().sql.replace(/\s+/g, ' ');
    expect(sql).toContain('LEFT JOIN demande_reponse dr ON dr.id = dd.reponse_id'); // délai G1 via la réponse qui a satisfait
    expect(sql).toContain('dr.recu_le::text AS recu_le');
    expect(sql).toContain('AND l.fort'); // expiration + présence limitées aux liens FORTS
    expect(sql).toContain('AS a_lien_fort');
  });

  it('mappe recuLe / expireLeCapte / aLienFort ; défauts sûrs si absents (satisfait à la main → recu_le NULL, pas de lien)', async () => {
    H.state.rows = [row({ recu_le: '2026-07-01', expire_le_capte: '2026-07-17', a_lien_fort: true })];
    const r = await listerArchives(await chargerConfigVeille());
    expect(r[0]).toMatchObject({ recuLe: '2026-07-01', expireLeCapte: '2026-07-17', aLienFort: true });
    H.state.rows = [row({ recu_le: null })]; // satisfait à la main : aucune réponse
    const r2 = await listerArchives(await chargerConfigVeille());
    expect(r2[0]).toMatchObject({ recuLe: null, expireLeCapte: null, aLienFort: false });
  });
});

describe('T5 — listerArchives : pièces au grain DEMANDE (répare le « marquer reçu » manuel, sans script de reprise)', () => {
  it('les pièces e-mail sont chargées de TOUTES les réponses de la demande (hors rebond), étiquetées recuLe+objet — plus par dd.reponse_id', async () => {
    await listerArchives(await chargerConfigVeille());
    const sql = archiveQuery().sql.replace(/\s+/g, ' ');
    // repli demande-grain : la sous-requête des pièces ne clé PLUS sur dd.reponse_id
    expect(sql).toContain('WHERE dr2.demande_id = dd.demande_id AND dr2.nature <> \'rebond\'');
    expect(sql).not.toContain('FROM demande_reponse_piece p WHERE p.reponse_id = dd.reponse_id'); // ancienne voie supprimée
    // étiquette par réponse (date + objet)
    expect(sql).toContain("'recuLe', dr2.recu_le::text");
    expect(sql).toContain("'objet', dr2.objet");
    // G1/G2 INCHANGÉS : le délai reste ancré sur la réponse satisfaisante (dd.reponse_id)
    expect(sql).toContain('LEFT JOIN demande_reponse dr ON dr.id = dd.reponse_id');
  });

  it('un permis satisfait À LA MAIN (satisfait_par manuel, recu_le NULL) affiche désormais les pièces e-mail de sa demande, étiquetées', async () => {
    H.state.rows = [row({
      satisfait_par: 'manuel', recu_le: null, // satisfait à la main : aucune réponse liée par dd.reponse_id
      pieces: [{ id: 30, nomFichier: 'arrete.pdf', typeMime: 'application/pdf', tailleOctets: 5000, deposee: true, motifNonStocke: null, origine: 'email', recuLe: '2026-06-20', objet: 'Documents demandés' }],
    })];
    const r = await listerArchives(await chargerConfigVeille());
    expect(r[0].satisfaitPar).toBe('manuel');
    expect(r[0].recuLe).toBeNull();                 // pas de délai G1 (inchangé)
    expect(r[0].pieces).toHaveLength(1);            // MAIS les pièces e-mail de la demande sont là (le défaut réparé)
    expect(r[0].pieces[0]).toMatchObject({ id: 30, nomFichier: 'arrete.pdf', origine: 'email', recuLe: '2026-06-20', objet: 'Documents demandés' });
    expect(JSON.stringify(r)).not.toContain('cle_stockage');
  });
});
