import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 9 — AFFICHAGE AUTOMATIQUE (téléservice), cartes VIRTUELLES. `cartesDepotAutoTeleservice` s'exerce END-TO-END sur le VRAI
 * chemin (`proposition` → filtre 77b1800 verrou de commune + plafond mensuel + éligibilité) via un mock de ../db/client. On PROUVE
 * les PREUVES du lot : commune LIBRE → UNE carte COMPLÈTE (corps figé non vide + URL + dossiers), sans clic ; en attente d'accusé
 * (verrou vivant) → aucune carte ; verrou levé → réapparaît ; cap atteint → aucune carte ; déjà préparée → aucune carte ; lots
 * e-mail → jamais ; et surtout AUCUNE ÉCRITURE (INSERT/UPDATE/DELETE) à l'affichage → jamais de demande fantôme. La matérialisation
 * (`materialiserDepotTeleservice`) n'écrit RIEN quand le lot n'est plus frais (garde) → jamais un doublon.
 */
const H = vi.hoisted(() => {
  const state = {
    candidatRows: [] as Record<string, unknown>[],
    contrainteRows: [] as Record<string, unknown>[],
    moisRows: [] as Record<string, unknown>[],
    verrouRows: [] as Record<string, unknown>[],   // communesBloqueesTeleservice (demande_depot_presume vivant)
    dejaRows: [] as Record<string, unknown>[],       // communes déjà préparées (brouillon/prête)
    urlRows: [] as Record<string, unknown>[],        // mairie_contact.url_formulaire
    dossierRows: [] as Record<string, unknown>[],    // dossiersPourDepot (adresse + parcelles + sœurs)
    sql: [] as string[],                             // toutes les requêtes émises → contrôle « lecture seule »
  };
  const queryMock = async (sql: string) => {
    state.sql.push(sql);
    if (sql.includes('demande_depot_presume dp')) return { rows: state.verrouRows };              // verrou de commune (77b1800)
    if (sql.includes('SELECT DISTINCT code_insee FROM demande')) return { rows: state.dejaRows };  // déjà préparées (affichage)
    if (sql.includes('url_formulaire FROM mairie_contact')) return { rows: state.urlRows };         // URL téléservice par commune
    if (sql.includes('s.id::text AS dossier_id')) return { rows: state.dossierRows };               // dossiers (adresse/parcelles/sœurs)
    if (sql.includes('AS prada_courriel')) return { rows: state.candidatRows };                    // requête CANDIDATS
    if (sql.includes('max_dossiers_par_demande AS max_dossiers')) return { rows: state.contrainteRows }; // contraintes commune
    if (sql.includes("date_trunc('month'")) return { rows: state.moisRows };                       // permis du mois (plafond)
    return { rows: [] }; // config_veille (→ défauts), etc.
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { cartesDepotAutoTeleservice, materialiserDepotTeleservice } from './demandeRepo';
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
const rowEmail = (id: number, codeInsee: string, communeNom: string, date: string): Record<string, unknown> => ({
  ...rowFormulaire(id, codeInsee, communeNom, date),
  dest_email: `urbanisme@${codeInsee}.fr`, dest_canal: 'email', dest_url_formulaire: null, dest_email_type: 'direct',
});
/** Objet dossier renvoyé par dossiersPourDepot (shape listerADeposer) pour l'id `id`. */
const dossierRow = (id: number, codeInsee: string, communeNom: string): Record<string, unknown> => ({
  dossier_id: String(id),
  dossier: { type: 'PC', numDau: `PC${codeInsee}00${String(id).padStart(3, '0')}`, adresse: '1 RUE DE RIVOLI ' + communeNom, codePostal: '75001', communeNom, parcelles: ['AB-0001'], soeurs: [] },
});

beforeEach(() => {
  H.state.candidatRows = []; H.state.contrainteRows = []; H.state.moisRows = [];
  H.state.verrouRows = []; H.state.dejaRows = []; H.state.urlRows = []; H.state.dossierRows = []; H.state.sql = [];
});

const aucuneEcriture = (): boolean => !H.state.sql.some((s) => /\b(INSERT|UPDATE|DELETE)\b/i.test(s));

describe('LOT 9 — cartesDepotAutoTeleservice : cartes de dépôt virtuelles complètes, une par commune LIBRE', () => {
  it('commune libre → UNE carte COMPLÈTE (corps figé non vide + URL + dossiers), sans aucune écriture en base', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))];
    H.state.urlRows = [{ code_insee: '75056', url_formulaire: 'https://teleservice.paris.fr' }];
    H.state.dossierRows = [dossierRow(1, '75056', 'Paris')];

    const cartes = await cartesDepotAutoTeleservice(cfg);
    expect(cartes).toHaveLength(1);
    const c = cartes[0];
    expect(c.codeInsee).toBe('75056');
    expect(c.communeNom).toBe('Paris');
    expect(c.cle).not.toBe('');                       // clé de lot → matérialisation au 1er geste
    expect(c.url).toBe('https://teleservice.paris.fr');
    expect(c.corps).toContain('du dossier suivant');    // corps figé RÉEL (corpsFormulaireTeleservice), pas un placeholder
    expect(c.corps).toContain('Permis concerné');
    expect(c.dossiers).toHaveLength(1);
    expect(c.dossiers[0].numDau).toMatch(/^PC75056/);
    expect(aucuneEcriture()).toBe(true);              // PREUVE — afficher n'écrit RIEN (pas de demande fantôme)
  });

  it('deux dossiers même commune → UNE seule carte (un dépôt à la fois)', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2)), rowFormulaire(2, '75056', 'Paris', moisAvant(3))];
    H.state.urlRows = [{ code_insee: '75056', url_formulaire: 'https://teleservice.paris.fr' }];
    H.state.dossierRows = [dossierRow(1, '75056', 'Paris'), dossierRow(2, '75056', 'Paris')];
    expect(await cartesDepotAutoTeleservice(cfg)).toHaveLength(1);
  });

  it('en attente d’accusé (verrou vivant) → aucune carte ; verrou levé → la carte réapparaît d’elle-même', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))];
    H.state.urlRows = [{ code_insee: '75056', url_formulaire: 'https://teleservice.paris.fr' }];
    H.state.dossierRows = [dossierRow(1, '75056', 'Paris')];

    H.state.verrouRows = [{ code_insee: '75056', reference: null, demande_id: 900 }];
    expect(await cartesDepotAutoTeleservice(cfg)).toHaveLength(0);

    H.state.verrouRows = [];
    expect(await cartesDepotAutoTeleservice(cfg)).toHaveLength(1);
  });

  it('cap mensuel atteint (5 permis ce mois) → aucune carte', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))];
    H.state.moisRows = [{ code_insee: '75056', n: 5 }];
    expect(await cartesDepotAutoTeleservice(cfg)).toHaveLength(0);
  });

  it('commune déjà PRÉPARÉE (demande brouillon/prête) → aucune carte (elle est déjà réelle dans le carrousel)', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))];
    H.state.dejaRows = [{ code_insee: '75056' }];
    expect(await cartesDepotAutoTeleservice(cfg)).toHaveLength(0);
  });

  it('non-régression rail e-mail : les lots E-MAIL n’apparaissent JAMAIS en carte téléservice', async () => {
    const cfg = await chargerConfigVeille();
    H.state.candidatRows = [rowEmail(1, '92044', 'Courbevoie', moisAvant(2))];
    expect(await cartesDepotAutoTeleservice(cfg)).toHaveLength(0);
    expect(aucuneEcriture()).toBe(true);
  });
});

describe('LOT 9 — materialiserDepotTeleservice : garde d’idempotence (lot non frais → aucune écriture)', () => {
  it('clé sans lot frais correspondant → { ok:false } avec une raison, et AUCUNE écriture', async () => {
    const cfg = await chargerConfigVeille();
    H.state.contrainteRows = [{ code_insee: '75056', max_dossiers: 1, profil_impose: 'personne' }];
    H.state.candidatRows = [rowFormulaire(1, '75056', 'Paris', moisAvant(2))]; // lot réel pour 75056…
    const res = await materialiserDepotTeleservice(cfg, 2026, 'admin', 'cle-inexistante-999', 'Paris'); // …mais on demande une clé qui n'existe pas
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.raison).toBeTruthy();
    expect(aucuneEcriture()).toBe(true); // apparierSelection ne trouve rien → creerDemandes n'INSÈRE rien
  });
});
