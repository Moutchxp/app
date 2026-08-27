import { describe, it, expect } from 'vitest';
import {
  PARAMS_VEILLE, espaceReglage, reglageDansEspace,
  PARAMS_ESPACE_EMAIL, PARAMS_ESPACE_TELESERVICE, PARAMS_TRANSVERSE, type ParamVeille,
} from './reglagesVeille';

/**
 * D4-ter (ÉTANCHE) — TROIS PÉRIMÈTRES ÉTANCHES prouvés : un réglage n'appartient qu'à UN espace (e-mail / téléservice /
 * transverse), aucune valeur « partagée » rendue des deux côtés. On prouve : (1) chaque réglage dans le BON espace ; (2) les
 * trois espaces PARTITIONNENT PARAMS_VEILLE (disjoints + couvrants) ; (3) étanchéité : e-mail et téléservice n'ont AUCUNE colonne
 * en commun ; (4) les 3 réglages de préparation par rail sont des COLONNES DISTINCTES côté e-mail et côté téléservice.
 */
const EMAIL = [
  // préparation PROPRE au rail e-mail
  'dossiers_par_demande', 'permis_par_commune_par_mois', 'profil_demandeur_defaut',
  // envoi & relances (e-mail seul)
  'envois_max_par_run', 'envois_max_par_jour', 'relance_auto_active', 'envoi_heure_debut', 'envoi_heure_fin',
  'relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours',
];
const TELESERVICE = [
  'teleservice_dossiers_par_depot', 'teleservice_permis_par_commune_par_mois', 'teleservice_profil_demandeur_defaut',
  'teleservice_alerte_non_depose_active', 'teleservice_alerte_non_depose_jours',
];
// Les 3 grandeurs de préparation qui diffèrent par rail : colonne e-mail ↔ colonne téléservice (DEUX vérités, pas une surcharge).
const PAIRES_PAR_RAIL: [string, string][] = [
  ['dossiers_par_demande', 'teleservice_dossiers_par_depot'],
  ['permis_par_commune_par_mois', 'teleservice_permis_par_commune_par_mois'],
  ['profil_demandeur_defaut', 'teleservice_profil_demandeur_defaut'],
];

const col = (ps: ParamVeille[]) => ps.map((p) => p.colonne);
const par = (c: string) => PARAMS_VEILLE.find((p) => p.colonne === c)!;

describe('ÉTANCHE — espaceReglage : totale, trois classes exclusives', () => {
  it('chaque réglage tombe dans exactement une des 3 classes', () => {
    for (const p of PARAMS_VEILLE) expect(['email', 'teleservice', 'transverse'], p.colonne).toContain(espaceReglage(p));
  });
  it('rail détermine l’espace ; défaut = transverse', () => {
    expect(espaceReglage(par('dossiers_par_demande'))).toBe('email');            // préparation e-mail
    expect(espaceReglage(par('teleservice_dossiers_par_depot'))).toBe('teleservice'); // préparation téléservice
    expect(espaceReglage(par('anciennete_max_demande_annees'))).toBe('transverse');   // commun aux deux rails
    expect(espaceReglage(par('cada_email'))).toBe('transverse');
  });
});

describe('ÉTANCHE — les deux espaces de rail contiennent le BON ensemble', () => {
  it('espace Envoi e-mail auto = exactement les réglages rail e-mail', () => {
    expect(new Set(col(PARAMS_ESPACE_EMAIL))).toEqual(new Set(EMAIL));
  });
  it('espace Téléservice = exactement les réglages rail téléservice', () => {
    expect(new Set(col(PARAMS_ESPACE_TELESERVICE))).toEqual(new Set(TELESERVICE));
  });
  it('reglageDansEspace cohérent avec espaceReglage (jamais les deux)', () => {
    for (const p of PARAMS_VEILLE) {
      expect(reglageDansEspace(p, 'email'), p.colonne).toBe(espaceReglage(p) === 'email');
      expect(reglageDansEspace(p, 'teleservice'), p.colonne).toBe(espaceReglage(p) === 'teleservice');
    }
  });
});

describe('ÉTANCHE — étanchéité : e-mail et téléservice n’ont AUCUNE colonne en commun', () => {
  it('intersection(Envoi e-mail, Téléservice) = ∅', () => {
    const inter = col(PARAMS_ESPACE_EMAIL).filter((c) => col(PARAMS_ESPACE_TELESERVICE).includes(c));
    expect(inter).toEqual([]);
  });
  it('les 3 grandeurs de préparation par rail sont des colonnes DISTINCTES (deux vérités, pas un partage)', () => {
    for (const [email, tele] of PAIRES_PAR_RAIL) {
      expect(email).not.toBe(tele);
      expect(espaceReglage(par(email))).toBe('email');
      expect(espaceReglage(par(tele))).toBe('teleservice');
    }
  });
});

describe('ÉTANCHE — AUCUN réglage perdu : les 3 espaces partitionnent PARAMS_VEILLE', () => {
  it('email + téléservice + transverse = PARAMS_VEILLE, disjoints', () => {
    const total = [...col(PARAMS_ESPACE_EMAIL), ...col(PARAMS_ESPACE_TELESERVICE), ...col(PARAMS_TRANSVERSE)];
    expect(new Set(total).size).toBe(total.length);              // disjoints
    expect(new Set(total)).toEqual(new Set(col(PARAMS_VEILLE))); // couvrants
  });
  it('des transverses représentatifs restent hors des deux rails', () => {
    for (const c of ['anciennete_max_demande_annees', 'nb_candidats_examines', 'tri_candidats', 'pieces_demandees', 'adresse_reponse', 'cada_email', 'releve_active']) {
      expect(espaceReglage(par(c)), c).toBe('transverse');
      expect(reglageDansEspace(par(c), 'email'), c).toBe(false);
      expect(reglageDansEspace(par(c), 'teleservice'), c).toBe(false);
    }
  });
});
