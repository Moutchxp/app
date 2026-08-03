import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BandeauIdentite, PlageParam, TITRE_PARAMS_DEMANDES, TITRE_PARAMS_DOSSIERS, AIDE_PARAMS_DOSSIERS, TITRE_PARAMS_SOURCES, AIDE_PARAMS_SOURCES } from './ReglagesRendu';
import { parserBornesCheck, PARAMS_VEILLE, PARAMS_DEMANDES, PARAMS_DOSSIERS, PARAMS_SOURCES } from '../../../../lib/sitadel/reglagesVeille';
import { problemesIdentite } from '../../../../lib/sitadel/demande';

/**
 * S7d — rendu STATIQUE (aucun DOM) des pièces sensibles de l'écran Réglages :
 *  (a) le bandeau d'identité bascule complète/incomplète (vert vs rouge, message nommant le champ) ;
 *  (b) la plage affichée d'un paramètre correspond aux bornes issues des CHECK de la base.
 */
const DEFS_BASE = [
  'CHECK (((seuil_surface_immeuble_m2 >= 100) AND (seuil_surface_immeuble_m2 <= 100000)))',
  'CHECK (((anciennete_max_demande_annees >= 1) AND (anciennete_max_demande_annees <= 20)))',
];
const BORNES = parserBornesCheck(DEFS_BASE);

describe('S7d — BandeauIdentite', () => {
  it('identité complète → message « peuvent passer en « prête » » en vert', () => {
    const h = renderToStaticMarkup(createElement(BandeauIdentite, { problemes: [] }));
    expect(h).toContain('complète');
    expect(h).toContain('prête');
    expect(h).toContain('var(--color-svv-green-ink)');
  });

  it('identité incomplète → nomme le champ fautif, en rouge', () => {
    const problemes = problemesIdentite({
      raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '', representantNom: 'A. Jorel',
      representantQualite: 'gérant', emailContact: 'contact@x.fr', telephone: '',
    });
    const h = renderToStaticMarkup(createElement(BandeauIdentite, { problemes }));
    expect(h).toContain('adresse du siège');
    expect(h).toContain('var(--color-svv-red)');
  });
});

describe('S7d — PlageParam (bornes = base)', () => {
  it('affiche exactement la plage du CHECK', () => {
    const surface = PARAMS_VEILLE.find((p) => p.colonne === 'seuil_surface_immeuble_m2')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: surface, bornes: BORNES.seuil_surface_immeuble_m2 }));
    expect(h).toContain('100');
    expect(h).toContain('100000');
    expect(h).toContain('m²');
  });

  it('paramètre texte → rappel de format, pas de plage numérique', () => {
    const pieces = PARAMS_VEILLE.find((p) => p.colonne === 'pieces_demandees')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: pieces, bornes: undefined }));
    expect(h).toContain('virgules');
  });

  it('borne absente (contrainte introuvable) → le signale, n’invente aucune plage', () => {
    const anc = PARAMS_VEILLE.find((p) => p.colonne === 'anciennete_max_demande_annees')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: anc, bornes: undefined }));
    expect(h).toContain('introuvable');
  });

  it('paramètre enum (profil par défaut) → liste les choix, pas de plage numérique', () => {
    const prof = PARAMS_VEILLE.find((p) => p.colonne === 'profil_demandeur_defaut')!;
    const h = renderToStaticMarkup(createElement(PlageParam, { param: prof, bornes: undefined }));
    expect(h).toContain('entreprise');
    expect(h).toContain('personne');
    expect(h).not.toContain('Plage autorisée');
  });
});

describe('S13 — deux sous-blocs de paramètres (demandes vs dossiers)', () => {
  it('intitulés EXACTS, et plus aucune mention « moteur de veille »', () => {
    expect(TITRE_PARAMS_DEMANDES).toBe('Paramètres des demandes');
    expect(TITRE_PARAMS_DOSSIERS).toBe('Classification et affichage des dossiers');
    expect(TITRE_PARAMS_DEMANDES).not.toContain('moteur de veille');
    expect(TITRE_PARAMS_DOSSIERS).not.toContain('moteur de veille');
  });

  it('l’aide du 2e bloc dit qu’il ne concerne PAS les demandes mais la mise à jour/affichage des dossiers', () => {
    expect(AIDE_PARAMS_DOSSIERS).toContain('ne concernent pas les demandes');
    expect(AIDE_PARAMS_DOSSIERS).toContain('dossiers');
    expect(AIDE_PARAMS_DOSSIERS).toContain('Mise à jour des dossiers');
  });

  it('partition : 5 demandes / 8 dossiers / 1 source (dila_url), sans perte ni doublon', () => {
    expect(PARAMS_DEMANDES.map((p) => p.colonne)).toEqual([
      'anciennete_max_demande_annees', 'dossiers_par_demande', 'demandes_par_commune_par_mois', 'pieces_demandees', 'profil_demandeur_defaut',
    ]);
    expect(PARAMS_DOSSIERS.map((p) => p.colonne)).toEqual([
      'seuil_logements_immeuble', 'seuil_surface_immeuble_m2', 'annees_par_defaut',
      'rang_immeuble_neuf', 'rang_surelevation', 'rang_construction_neuve', 'rang_extension', 'rang_demolition',
    ]);
    expect(PARAMS_SOURCES.map((p) => p.colonne)).toEqual(['dila_url']); // S30 : 3e sous-bloc, dila_url exclu des 2 autres
    expect(PARAMS_DEMANDES.length + PARAMS_DOSSIERS.length + PARAMS_SOURCES.length).toBe(PARAMS_VEILLE.length);
    const cols = new Set([...PARAMS_DEMANDES, ...PARAMS_DOSSIERS, ...PARAMS_SOURCES].map((p) => p.colonne));
    expect(cols.size).toBe(PARAMS_VEILLE.length); // aucune colonne perdue ni dupliquée
  });

  it('S30 — sous-bloc SOURCES : intitulé + aide, et PlageParam d’une URL rappelle le format http(s)://', () => {
    expect(TITRE_PARAMS_SOURCES).toContain('annuaire des mairies');
    expect(AIDE_PARAMS_SOURCES).toMatch(/mairies/i);
    const dila = PARAMS_VEILLE.find((p) => p.colonne === 'dila_url')!;
    expect(dila.type).toBe('url');
    const h = renderToStaticMarkup(createElement(PlageParam, { param: dila, bornes: undefined }));
    expect(h).toContain('http');                 // format annoncé
    expect(h).not.toContain('introuvable');       // PAS l'erreur « plage introuvable » (une URL n'a pas de bornes)
  });
});
