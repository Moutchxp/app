import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Q4-fix — NON-RÉGRESSION P3/Q1 sur le VRAI CHEMIN. On exerce `proposition` END-TO-END (lireDossiersPriorite → versCandidat →
 * proposerLots, avec `paramsLot` porteur du filtre d'ancienneté) via un mock de ../db/client qui renvoie de VRAIES lignes de
 * candidats Paris + la contrainte téléservice réelle (`mairie_contact.max_dossiers_par_demande = 1`). Ce n'est PAS un cas
 * fabriqué à côté du chemin : c'est précisément la chaîne complète qui, mal testée, avait laissé passer la régression de P3.
 * On PROUVE : (P3) chaque lot Paris = 1 dossier, quelle que soit la fenêtre ; (Q4) le filtre change le NOMBRE de lots, jamais
 * leur TAILLE ; (Q1) le plafond mensuel en permis reste appliqué.
 */
const H = vi.hoisted(() => {
  const state = { candidatRows: [] as Record<string, unknown>[], contrainteRows: [] as Record<string, unknown>[], moisRows: [] as Record<string, unknown>[] };
  const queryMock = async (sql: string) => {
    if (sql.includes('AS prada_courriel')) return { rows: state.candidatRows };                 // requête CANDIDATS (SELECTION de priorite.ts)
    if (sql.includes('max_dossiers_par_demande AS max_dossiers')) return { rows: state.contrainteRows }; // lireContraintesCommune (P3)
    if (sql.includes("date_trunc('month'")) return { rows: state.moisRows };                    // lireHistorique — permis du mois (Q1)
    return { rows: [] }; // config_veille (→ défauts), demande_dossier actif (dejaRattaches vide), etc.
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { proposition } from './demandeRepo';
import { chargerConfigVeille } from './veilleConfig';

const moisAvant = (n: number): string => { const d = new Date(); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Ligne SQL brute d'un dossier PARIS à téléservice (formulaire) — forme renvoyée par la requête candidats. */
const parisRow = (id: number, date: string): Record<string, unknown> => ({
  id, type: 'PC', num_dau: `PC07505600${String(id).padStart(3, '0')}`, code_insee: '75056', departement: '75',
  date_reelle_autorisation: date, nature_projet_completee: '1', i_extension: false, i_surelevation: false,
  nb_lgt_tot_crees: 20, surf_creee: 2000, superficie_terrain: null,
  adr_num_ter: '1', adr_libvoie_ter: 'RUE DE RIVOLI', adr_lieudit_ter: null, adr_localite_ter: 'Paris', adr_codpost_ter: '75001',
  sec_cadastre1: 'AB', num_cadastre1: '0001', sec_cadastre2: null, num_cadastre2: null, sec_cadastre3: null, num_cadastre3: null,
  etat_dau: '2', etat_ambigu: false, date_doc: null, date_daact: null, vu_au_dernier: true,
  commune_nom: 'Paris', dest_email: null, dest_statut: 'confirme', dest_source: 'saisie_manuelle',
  dest_canal: 'formulaire', dest_url_formulaire: 'https://teleservice.paris.fr', dest_adresse_postale: null,
  dest_telephone: null, dest_responsable_nom: null, dest_protocole_verifie_le: null, dest_telephone_standard: null,
  dest_email_type: null, dest_protocole_source: null, dest_note: null,
  prada_courriel: null, prada_import_id: null, prada_nom: null, prada_prenom: null, prada_adresse: null,
  prada_millesime: null, prada_statut: null, prada_origine: null, prada_rapprochement: null,
});

beforeEach(() => { H.state.candidatRows = []; H.state.contrainteRows = []; H.state.moisRows = []; });

describe('Q4-fix — P3 (téléservice max 1) tient AVEC le filtre d’ancienneté actif ; le filtre change le nombre, pas la taille', () => {
  it('Paris formulaire, max_dossiers=1 → chaque lot = 1 dossier à 6 mois ET à 12 mois ; le filtre réduit le NOMBRE de lots', async () => {
    const cfg = await chargerConfigVeille(); // défauts : dossiersParDemande=5, permisParCommuneParMois=5, ancienneteMax=3 ans
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [
      parisRow(1, moisAvant(2)), parisRow(2, moisAvant(3)), parisRow(3, moisAvant(4)), // < 6 mois
      parisRow(4, moisAvant(9)),                                                        // entre 6 et 12 mois
    ];
    const p6 = (await proposition(cfg, 6)).lots.filter((l) => l.codeInsee === '75056');
    const p12 = (await proposition(cfg, 12)).lots.filter((l) => l.codeInsee === '75056');

    // P3 — JAMAIS de lot groupé : 1 dossier par demande, quelle que soit la fenêtre (c'était le symptôme 2).
    expect(p6.every((l) => l.dossiers.length === 1)).toBe(true);
    expect(p12.every((l) => l.dossiers.length === 1)).toBe(true);
    // P3 — canal formulaire + profil imposé remontés depuis la contrainte téléservice.
    expect(p6.every((l) => l.canal === 'formulaire' && l.profilImpose === 'personne')).toBe(true);
    // Q4 — le filtre agit sur le NOMBRE de lots (6 mois → 3 ; 12 mois → 4 : le dossier de ~9 mois entre dans la fenêtre élargie).
    expect(p6).toHaveLength(3);
    expect(p12).toHaveLength(4);
  });

  it('Q1 — le plafond mensuel en PERMIS reste appliqué (déjà 5 permis ce mois → aucun lot Paris), filtre actif', async () => {
    const cfg = await chargerConfigVeille(); // permisParCommuneParMois = 5
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [parisRow(1, moisAvant(2)), parisRow(2, moisAvant(3))];
    H.state.moisRows = [{ code_insee: '75056', n: 5 }]; // 5 permis déjà demandés ce mois → quota épuisé
    const paris = (await proposition(cfg, 6)).lots.filter((l) => l.codeInsee === '75056');
    expect(paris).toHaveLength(0); // plafond mensuel (Q1) respecté même avec le filtre d'ancienneté
  });
});
