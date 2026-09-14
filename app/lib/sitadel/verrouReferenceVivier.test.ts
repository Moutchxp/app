import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * VERROU « référence mairie » du vivier Téléservice — COMPORTEMENT sur le vrai chemin (mock de ../db/client routé par fragment
 * de SQL, comme demandeRepoProposition.test.ts). On PROUVE, à partir de l'état EXISTANT (communesBloqueesTeleservice) et sans
 * aucun code de levée :
 *   · réglage ON + commune bloquée → absente du VIVIER (chargerVivier) ET de proposerLots (proposition) ;
 *   · réglage ON + verrou résolu (aucune présomption vivante) → commune de nouveau proposable ;
 *   · réglage OFF → comportement d'avant, à l'identique (et l'état des verrous n'est même pas lu) ;
 *   · défaut = ON, y compris config PRÉ-MIGRATION (colonne absente → repli TRUE) ;
 *   · listerADeposer STRICTEMENT inchangé : la carte déjà préparée d'une commune bloquée reste affichée.
 */
const H = vi.hoisted(() => {
  const state = {
    candidatRows: [] as Record<string, unknown>[],
    bloqueesRows: [] as Record<string, unknown>[],
    deposerRows: [] as Record<string, unknown>[],
    verrouRows: [] as Record<string, unknown>[],
    verrouThrows: false,
    sqlSeen: [] as string[],
  };
  const queryMock = async (sql: string) => {
    state.sqlSeen.push(sql);
    if (sql.includes('teleservice_verrou_reference_actif')) { if (state.verrouThrows) throw new Error('colonne absente (pré-222)'); return { rows: state.verrouRows }; }
    if (sql.includes('demande_depot_presume')) return { rows: state.bloqueesRows };          // communesBloqueesTeleservice (verrou vivant)
    if (sql.includes("IN ('brouillon', 'prete')")) return { rows: state.deposerRows };       // listerADeposer (cartes à déposer)
    if (sql.includes('AS prada_courriel')) return { rows: state.candidatRows };              // requête CANDIDATS (SELECTION priorite.ts) — proposition ET vivier
    if (sql.includes("date_trunc('month'")) return { rows: [] };                             // lireHistorique — permis du mois (plafond)
    return { rows: [] };                                                                     // dejaRattaches, contraintes, config, etc.
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { proposition, chargerVivier, listerADeposer } from './demandeRepo';
import { CONFIG_VEILLE_DEFAUT, lireTeleserviceVerrouReference } from './veilleConfig';

const cfgOn = { ...CONFIG_VEILLE_DEFAUT, teleserviceVerrouReferenceActif: true };
const cfgOff = { ...CONFIG_VEILLE_DEFAUT, teleserviceVerrouReferenceActif: false };
const moisAvant = (n: number): string => { const d = new Date(); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Ligne SQL brute d'un permis téléservice (formulaire) d'une commune donnée — forme renvoyée par la requête candidats. */
const permisRow = (id: number, codeInsee: string, communeNom: string): Record<string, unknown> => ({
  id, type: 'PC', num_dau: `PC${codeInsee}${String(id).padStart(3, '0')}`, code_insee: codeInsee, departement: codeInsee.slice(0, 2),
  date_reelle_autorisation: moisAvant(2), nature_projet_completee: '1', i_extension: false, i_surelevation: false,
  nb_lgt_tot_crees: 20, surf_creee: 2000, superficie_terrain: null,
  adr_num_ter: '1', adr_libvoie_ter: 'RUE TEST', adr_lieudit_ter: null, adr_localite_ter: communeNom, adr_codpost_ter: `${codeInsee.slice(0, 2)}001`,
  sec_cadastre1: 'AB', num_cadastre1: '0001', sec_cadastre2: null, num_cadastre2: null, sec_cadastre3: null, num_cadastre3: null,
  etat_dau: '2', etat_ambigu: false, date_doc: null, date_daact: null, vu_au_dernier: true,
  commune_nom: communeNom, dest_email: null, dest_statut: 'confirme', dest_source: 'saisie_manuelle',
  dest_canal: 'formulaire', dest_url_formulaire: 'https://teleservice.test.fr', dest_adresse_postale: null,
  dest_telephone: null, dest_responsable_nom: null, dest_protocole_verifie_le: null, dest_telephone_standard: null,
  dest_email_type: null, dest_protocole_source: null, dest_note: null,
  prada_courriel: null, prada_import_id: null, prada_nom: null, prada_prenom: null, prada_adresse: null,
  prada_millesime: null, prada_statut: null, prada_origine: null, prada_rapprochement: null,
});

// Deux communes téléservice : A (75056) et B (75101). Une seule sera bloquée.
const A = '75056', B = '75101';
beforeEach(() => {
  H.state.candidatRows = [permisRow(1, A, 'Paris'), permisRow(2, B, 'Autre-Ville')];
  H.state.bloqueesRows = [];
  H.state.deposerRows = [];
  H.state.verrouRows = [];
  H.state.verrouThrows = false;
  H.state.sqlSeen = [];
});

describe('VERROU référence — réglage ON', () => {
  it('commune bloquée (présomption vivante) → ABSENTE du vivier ET de proposerLots ; l’autre reste', async () => {
    H.state.bloqueesRows = [{ code_insee: A, reference: 'SVAV-DEM-2026-000009', demande_id: 9 }]; // A en attente d'accusé
    const vivier = (await chargerVivier(cfgOn)).vivier.map((p) => p.codeInsee);
    const lots = (await proposition(cfgOn, 12)).lots.map((l) => l.codeInsee);
    expect(vivier).not.toContain(A); expect(vivier).toContain(B);
    expect(lots).not.toContain(A);   expect(lots).toContain(B);
  });

  it('verrou RÉSOLU (aucune présomption vivante) → la commune redevient proposable (vivier + proposerLots)', async () => {
    H.state.bloqueesRows = []; // reference_captee / sans_accuse / renoncee → plus rien de vivant
    const vivier = (await chargerVivier(cfgOn)).vivier.map((p) => p.codeInsee);
    const lots = (await proposition(cfgOn, 12)).lots.map((l) => l.codeInsee);
    expect(vivier).toContain(A); expect(vivier).toContain(B);
    expect(lots).toContain(A);   expect(lots).toContain(B);
  });
});

describe('VERROU référence — réglage OFF (comportement d’avant, à l’identique)', () => {
  it('commune bloquée mais réglage OFF → toujours présente (vivier + proposerLots) et l’état des verrous n’est PAS lu', async () => {
    H.state.bloqueesRows = [{ code_insee: A, reference: 'X', demande_id: 9 }]; // bloquée en base…
    const vivier = (await chargerVivier(cfgOff)).vivier.map((p) => p.codeInsee);
    const lots = (await proposition(cfgOff, 12)).lots.map((l) => l.codeInsee);
    expect(vivier).toContain(A); expect(vivier).toContain(B); // …mais OFF → aucune exclusion
    expect(lots).toContain(A);   expect(lots).toContain(B);
    expect(H.state.sqlSeen.some((s) => s.includes('demande_depot_presume'))).toBe(false); // gaté : aucune lecture du verrou
  });
});

describe('VERROU référence — défaut ON, y compris config pré-migration', () => {
  it('CONFIG_VEILLE_DEFAUT = filtre ACTIF (repli total)', () => {
    expect(CONFIG_VEILLE_DEFAUT.teleserviceVerrouReferenceActif).toBe(true);
  });
  it('colonne présente à true → true ; à false → false ; ABSENTE (pré-222, lecture qui échoue) → repli TRUE', async () => {
    H.state.verrouRows = [{ teleservice_verrou_reference_actif: true }];
    expect((await lireTeleserviceVerrouReference()).teleserviceVerrouReferenceActif).toBe(true);
    H.state.verrouRows = [{ teleservice_verrou_reference_actif: false }];
    expect((await lireTeleserviceVerrouReference()).teleserviceVerrouReferenceActif).toBe(false);
    H.state.verrouThrows = true; // colonne absente → la lecture isolée échoue
    expect((await lireTeleserviceVerrouReference()).teleserviceVerrouReferenceActif).toBe(true);
  });
});

describe('VERROU référence — listerADeposer STRICTEMENT inchangé', () => {
  it('la carte déjà préparée d’une commune bloquée reste affichée (le filtre ne touche pas listerADeposer)', async () => {
    H.state.bloqueesRows = [{ code_insee: A, reference: 'X', demande_id: 9 }]; // A bloquée → hors vivier (autre test)…
    H.state.deposerRows = [{ id: 42, reference: 'SVAV-DEM-2026-000042', commune_nom: 'Paris', url: 'https://teleservice.test.fr', corps: 'Texte', statut: 'prete', nb: 1, dossiers: [] }];
    const cartes = await listerADeposer();
    expect(cartes.map((c) => c.reference)).toContain('SVAV-DEM-2026-000042'); // …mais sa carte préparée reste
    // listerADeposer n'a lu ni le réglage ni l'état des verrous (il ne filtre rien de tel).
    expect(H.state.sqlSeen.some((s) => s.includes('demande_depot_presume'))).toBe(false);
    expect(H.state.sqlSeen.some((s) => s.includes('teleservice_verrou_reference_actif'))).toBe(false);
  });
});
