import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 8 — AFFICHAGE AUTOMATIQUE (téléservice). `propositionsDepotTeleservice` s'exerce END-TO-END sur le VRAI chemin (`proposition`
 * → filtre 77b1800 verrou de commune + plafond mensuel + éligibilité) via un mock de ../db/client qui renvoie de VRAIES lignes.
 * On PROUVE les PREUVES du lot : commune LIBRE → une carte (une par commune, dédupliquée) ; commune EN ATTENTE D'ACCUSÉ (verrou
 * `demande_depot_presume` vivant) → aucune carte ; verrou LEVÉ (référence captée) → la carte réapparaît d'elle-même ; cap mensuel
 * atteint → aucune carte ; commune déjà PRÉPARÉE (brouillon/prête) → aucune carte ; lots E-MAIL → jamais dans ce rail (non-régression).
 */
const H = vi.hoisted(() => {
  const state = {
    candidatRows: [] as Record<string, unknown>[],
    contrainteRows: [] as Record<string, unknown>[],
    moisRows: [] as Record<string, unknown>[],
    verrouRows: [] as Record<string, unknown>[],   // communesBloqueesTeleservice (demande_depot_presume vivant)
    dejaRows: [] as Record<string, unknown>[],       // communes déjà préparées (brouillon/prête)
  };
  const queryMock = async (sql: string) => {
    if (sql.includes('demande_depot_presume dp')) return { rows: state.verrouRows };              // verrou de commune (77b1800)
    if (sql.includes('SELECT DISTINCT code_insee FROM demande')) return { rows: state.dejaRows };  // déjà préparées (affichage)
    if (sql.includes('AS prada_courriel')) return { rows: state.candidatRows };                    // requête CANDIDATS
    if (sql.includes('max_dossiers_par_demande AS max_dossiers')) return { rows: state.contrainteRows }; // contraintes commune
    if (sql.includes("date_trunc('month'")) return { rows: state.moisRows };                       // permis du mois (plafond)
    return { rows: [] }; // config_veille (→ défauts), demande_dossier actif (dejaRattaches vide), etc.
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { propositionsDepotTeleservice } from './demandeRepo';
import { chargerConfigVeille } from './veilleConfig';

const moisAvant = (n: number): string => { const d = new Date(); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Ligne SQL brute d'un dossier à téléservice (formulaire) — forme renvoyée par la requête candidats. */
const rowFormulaire = (id: number, codeInsee: string, communeNom: string, date: string): Record<string, unknown> => ({
  id, type: 'PC', num_dau: `PC${codeInsee}00${String(id).padStart(3, '0')}`, code_insee: codeInsee, departement: codeInsee.slice(0, 2),
  date_reelle_autorisation: date, nature_projet_completee: '1', i_extension: false, i_surelevation: false,
  nb_lgt_tot_crees: 20, surf_creee: 2000, superficie_terrain: null,
  adr_num_ter: '1', adr_libvoie_ter: 'RUE DE RIVOLI', adr_lieudit_ter: null, adr_localite_ter: communeNom, adr_codpost_ter: '75001',
  sec_cadastre1: 'AB', num_cadastre1: '0001', sec_cadastre2: null, num_cadastre2: null, sec_cadastre3: null, num_cadastre3: null,
  etat_dau: '2', etat_ambigu: false, date_doc: null, date_daact: null, vu_au_dernier: true,
  commune_nom: communeNom, dest_email: null, dest_statut: 'confirme', dest_source: 'saisie_manuelle',
  dest_canal: 'formulaire', dest_url_formulaire: `https://teleservice.${codeInsee}.fr`, dest_adresse_postale: null,
  dest_telephone: null, dest_responsable_nom: null, dest_protocole_verifie_le: null, dest_telephone_standard: null,
  dest_email_type: null, dest_protocole_source: null, dest_note: null,
  prada_courriel: null, prada_import_id: null, prada_nom: null, prada_prenom: null, prada_adresse: null,
  prada_millesime: null, prada_statut: null, prada_origine: null, prada_rapprochement: null,
});

/** Idem mais canal E-MAIL (rail e-mail) — ne doit JAMAIS apparaître dans le rail téléservice. */
const rowEmail = (id: number, codeInsee: string, communeNom: string, date: string): Record<string, unknown> => ({
  ...rowFormulaire(id, codeInsee, communeNom, date),
  dest_email: `urbanisme@${codeInsee}.fr`, dest_canal: 'email', dest_url_formulaire: null, dest_email_type: 'direct',
});

beforeEach(() => { H.state.candidatRows = []; H.state.contrainteRows = []; H.state.moisRows = []; H.state.verrouRows = []; H.state.dejaRows = []; });

describe('LOT 8 — propositionsDepotTeleservice : une carte par commune LIBRE, aucune sinon', () => {
  it('commune libre → UNE carte (deux dossiers formulaire dédupliqués en une seule proposition par commune)', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2)), rowFormulaire(2, '75056', 'Paris', moisAvant(3))];

    const props = await propositionsDepotTeleservice(cfg);
    expect(props).toHaveLength(1);                       // UNE carte pour la commune, pas deux (un dépôt à la fois)
    expect(props[0].codeInsee).toBe('75056');
    expect(props[0].communeNom).toBe('Paris');
    expect(props[0].cle).not.toBe('');                  // clé de lot utilisable par le POST …/demandes
    expect(props[0].permis).toHaveLength(1);
    expect(props[0].permis[0].numDau).toMatch(/^PC75056/);
  });

  it('commune EN ATTENTE D’ACCUSÉ (verrou vivant) → aucune carte ; verrou levé → la carte réapparaît d’elle-même', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))];

    // Verrou vivant → proposition (filtre 77b1800) écarte la commune → aucune proposition de dépôt.
    H.state.verrouRows = [{ code_insee: '75056', reference: null, demande_id: 900 }];
    expect(await propositionsDepotTeleservice(cfg)).toHaveLength(0);

    // Référence captée → verrou levé (plus de ligne vivante) → la carte réapparaît sans autre geste.
    H.state.verrouRows = [];
    expect(await propositionsDepotTeleservice(cfg)).toHaveLength(1);
  });

  it('cap mensuel atteint (5 permis déjà demandés ce mois) → aucune carte', async () => {
    const cfg = await chargerConfigVeille(); // permisParCommuneParMois = 5
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))];
    H.state.moisRows = [{ code_insee: '75056', n: 5 }];
    expect(await propositionsDepotTeleservice(cfg)).toHaveLength(0);
  });

  it('commune déjà PRÉPARÉE (demande brouillon/prête) → aucune carte (sa carte est déjà dans le carrousel)', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))];
    H.state.dejaRows = [{ code_insee: '75056' }];       // une demande brouillon/prête existe déjà pour la commune
    expect(await propositionsDepotTeleservice(cfg)).toHaveLength(0);
  });

  it('non-régression rail e-mail : les lots E-MAIL n’apparaissent JAMAIS dans le rail téléservice', async () => {
    const cfg = await chargerConfigVeille();
    H.state.candidatRows = [rowEmail(1, '92044', 'Courbevoie', moisAvant(2)), rowEmail(2, '92044', 'Courbevoie', moisAvant(3))];
    expect(await propositionsDepotTeleservice(cfg)).toHaveLength(0); // canal 'email' filtré → rien pour le rail téléservice
  });

  it('mixte e-mail + téléservice : seule la commune téléservice libre produit une carte', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2)), rowEmail(2, '92044', 'Courbevoie', moisAvant(2))];
    const props = await propositionsDepotTeleservice(cfg);
    expect(props).toHaveLength(1);
    expect(props[0].codeInsee).toBe('75056'); // la commune e-mail (92044) est absente
  });
});
