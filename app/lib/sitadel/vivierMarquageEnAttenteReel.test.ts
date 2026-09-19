import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * §B — MARQUAGE « carte en attente » sur le CHEMIN RÉEL, avec la sérialisation du driver reproduite fidèlement.
 *
 * Le bug : `chargerVivier` posait `dossierId: d.id` — or pg sérialise `d.id` (bigint) en CHAÎNE ('241'), alors que
 * `PermisVivier.dossierId` est typé `number`. Le marquage compare `Set<number>.has(p.dossierId)` où le Set, lui, est construit
 * via `Number(...)` (idsDossiersCartesVirtuelles) → `Set{241}.has('241')` → toujours `false`. Aucun permis n'était jamais marqué.
 *
 * Les tests §B existants (rechercheVivier.test.ts, route.test.ts) posent `dossierId: 241` en NOMBRE et NE reproduisent PAS la
 * sérialisation du driver : ils passent alors que la prod est cassée. Ici on mocke `../db/client` en routant par fragment de SQL
 * (même patron que verrouReferenceVivier.test.ts) et on rend `id` en CHAÎNE, comme le driver `pg` pour un bigint. On exerce le VRAI
 * chemin de la route (chargerVivier + idsDossiersCartesVirtuelles + rechercherDansVivier). Ce test ÉCHOUE sur le code d'avant le
 * correctif (dossierId = '241' → non marqué) et PASSE après (coercition au producteur → 241, marqué). Cas exact de la capture.
 */
const H = vi.hoisted(() => {
  const state = { candidatRows: [] as Record<string, unknown>[], sqlSeen: [] as string[] };
  const queryMock = async (sql: string) => {
    state.sqlSeen.push(sql);
    if (sql.includes('AS prada_courriel')) return { rows: state.candidatRows };   // requête CANDIDATS (proposition ET vivier)
    if (sql.includes('demande_depot_presume')) return { rows: [] };               // verrou de commune → aucune bloquée
    if (sql.includes("IN ('brouillon', 'prete')")) return { rows: [] };           // aucune commune déjà préparée → la carte tient
    if (sql.includes("date_trunc('month'")) return { rows: [] };                  // lireHistorique — permis du mois (plafond)
    return { rows: [] };                                                          // dejaRattaches, contraintes, etc.
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { chargerVivier, idsDossiersCartesVirtuelles } from './demandeRepo';
import { rechercherDansVivier } from './rechercheVivier';
import { CONFIG_VEILLE_DEFAUT } from './veilleConfig';

const cfg = { ...CONFIG_VEILLE_DEFAUT }; // verrou référence ON par défaut (aucune commune bloquée : bloqueesRows vides)
const moisAvant = (n: number): string => { const d = new Date(); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Ligne SQL brute du permis de la capture (PC 07511425V0025, dossier 241, Paris 14e, téléservice). ⚠️ `id` est une CHAÎNE : c'est
 * EXACTEMENT ce que le driver `pg` renvoie pour un `bigint` (le cœur du bug ; un `id: 241` numérique masquerait la régression).
 */
const rowCapture = (): Record<string, unknown> => ({
  id: '241', type: 'PC', num_dau: '07511425V0025', code_insee: '75114', departement: '75',
  date_reelle_autorisation: moisAvant(2), nature_projet_completee: '1', i_extension: false, i_surelevation: false,
  nb_lgt_tot_crees: 20, surf_creee: 2000, superficie_terrain: null,
  adr_num_ter: '82', adr_libvoie_ter: 'AVENUE DENFERT ROCHEREAU', adr_lieudit_ter: null, adr_localite_ter: 'Paris 14e', adr_codpost_ter: '75014',
  sec_cadastre1: 'AB', num_cadastre1: '0001', sec_cadastre2: null, num_cadastre2: null, sec_cadastre3: null, num_cadastre3: null,
  etat_dau: '2', etat_ambigu: false, date_doc: null, date_daact: null, vu_au_dernier: true,
  commune_nom: 'Paris 14e', dest_email: null, dest_statut: 'confirme', dest_source: 'saisie_manuelle',
  dest_canal: 'formulaire', dest_url_formulaire: 'https://teleservice.paris.fr', dest_adresse_postale: null,
  dest_telephone: null, dest_responsable_nom: null, dest_protocole_verifie_le: null, dest_telephone_standard: null,
  dest_email_type: null, dest_protocole_source: null, dest_note: null,
  prada_courriel: null, prada_import_id: null, prada_nom: null, prada_prenom: null, prada_adresse: null,
  prada_millesime: null, prada_statut: null, prada_origine: null, prada_rapprochement: null,
});

beforeEach(() => { H.state.candidatRows = [rowCapture()]; H.state.sqlSeen = []; });

describe('§B — marquage « carte en attente » (chemin réel, sérialisation bigint→chaîne reproduite)', () => {
  it('chargerVivier coerce d.id (bigint pg = CHAÎNE) → PermisVivier.dossierId est un NOMBRE honnête', async () => {
    const { vivier } = await chargerVivier(cfg);
    const permis = vivier.find((p) => p.numDau === '07511425V0025');
    expect(permis).toBeDefined();
    expect(typeof permis!.dossierId).toBe('number'); // ÉCHOUE avant le correctif : 'string' ('241')
    expect(permis!.dossierId).toBe(241);
  });

  it('idsDossiersCartesVirtuelles rend bien un Set<number> (le dossier 241 porté par la carte virtuelle)', async () => {
    const enAttente = await idsDossiersCartesVirtuelles(cfg);
    expect(enAttente.has(241)).toBe(true);
    expect([...enAttente].every((x) => typeof x === 'number')).toBe(true);
  });

  it('BOUT EN BOUT — le cas capture (dossier 241, Paris, téléservice) est marqué enAttente malgré la sérialisation du driver', async () => {
    // Chaîne EXACTE de la route (chargerVivier + idsDossiersCartesVirtuelles en parallèle, puis rechercherDansVivier).
    const [{ vivier }, enAttente] = await Promise.all([chargerVivier(cfg), idsDossiersCartesVirtuelles(cfg)]);

    // Recherche par n° de permis (le cas de la capture) — trouvé par num_dau, marqué enAttente.
    const parNum = rechercherDansVivier(vivier, '07511425V0025', 'formulaire', 50, { enAttente });
    const permisNum = parNum.resultats.find((x) => x.numDau === '07511425V0025');
    expect(permisNum?.enAttente).toBe(true); // ÉCHOUE avant le correctif : Set{241}.has('241') === false → undefined

    // Recherche par ville « paris » — même permis, même marquage.
    const parVille = rechercherDansVivier(vivier, 'paris', 'formulaire', 50, { enAttente });
    const permisVille = parVille.resultats.find((x) => x.numDau === '07511425V0025');
    expect(permisVille?.enAttente).toBe(true);
  });
});
