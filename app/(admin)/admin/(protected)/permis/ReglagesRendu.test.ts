import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BandeauIdentite, PlageParam } from './ReglagesRendu';
import { parserBornesCheck, PARAMS_VEILLE } from '../../../../lib/sitadel/reglagesVeille';
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
});
