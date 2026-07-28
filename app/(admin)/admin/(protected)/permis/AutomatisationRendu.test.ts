import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BandeauEtat, AvertissementOrdonnanceur, LigneHistorique } from './AutomatisationRendu';
import { messageDemandeManuelle, type RunVeille } from '../../../../lib/sitadel/planification';

const RUN: RunVeille = {
  declencheur: 'planifie', statut: 'succes', demarreLe: '2026-07-28 12:00:00+00', finiLe: '2026-07-28 12:07:00+00',
  millesimeDetecte: '2026-07', millesimeIngere: '2026-07', lignesLues: 100, dossiersRetenus: 10, dossiersNouveaux: 3,
  message: 'ok', erreur: null,
};

describe('S11b — AvertissementOrdonnanceur', () => {
  it('suspect → bandeau d’avertissement présent (ordonnanceur peut-être absent)', () => {
    const h = renderToStaticMarkup(createElement(AvertissementOrdonnanceur, {
      suspect: true, message: 'aucun passage automatique depuis 96 h (plus de 2× l’intervalle de 24 h) — l’ordonnanceur n’est peut-être pas installé.',
    }));
    expect(h).toContain('ordonnanceur');
    expect(h).toContain('96 h');
    expect(h).toContain('var(--color-svv-red)');
  });
  it('non suspect → rien (aucun bandeau)', () => {
    expect(renderToStaticMarkup(createElement(AvertissementOrdonnanceur, { suspect: false, message: '' }))).toBe('');
  });
});

describe('S11b — BandeauEtat (français simple)', () => {
  it('actif → « Automatisation active » + dernier passage traduit + millésime', () => {
    const h = renderToStaticMarkup(createElement(BandeauEtat, { autoActive: true, dernierRun: RUN, prochainPhrase: 'prévu dans ~20 h', millesimeBase: '2026-07' }));
    expect(h).toContain('Automatisation active');
    expect(h).toContain('succès');          // statut traduit
    expect(h).toContain('2026-07');
    expect(h).toContain('prévu dans ~20 h');
  });
  it('éteinte → « Automatisation éteinte », aucun passage', () => {
    const h = renderToStaticMarkup(createElement(BandeauEtat, { autoActive: false, dernierRun: null, prochainPhrase: 'automatisation éteinte — aucun passage planifié', millesimeBase: null }));
    expect(h).toContain('Automatisation éteinte');
    expect(h).toContain('aucun passage enregistré');
  });
});

describe('S11b — LigneHistorique (statut traduit, durée, erreur)', () => {
  const tableAutour = (run: RunVeille) => renderToStaticMarkup(createElement('table', null, createElement('tbody', null, createElement(LigneHistorique, { run }))));
  it('succès → statut traduit + durée', () => {
    const h = tableAutour(RUN);
    expect(h).toContain('succès');
    expect(h).toContain('7 min 0 s');
    expect(h).toContain('2026-07 → 2026-07');
  });
  it('échec → message d’erreur affiché', () => {
    const h = tableAutour({ ...RUN, statut: 'echec', erreur: 'DiDo HTTP 503', millesimeIngere: null });
    expect(h).toContain('échec');
    expect(h).toContain('DiDo HTTP 503');
  });
});

describe('S11b — message « Lancer maintenant » (jamais un démarrage immédiat)', () => {
  it('les deux variantes renvoient au prochain passage', () => {
    expect(messageDemandeManuelle(false)).toContain('au prochain passage');
    expect(messageDemandeManuelle(true)).toContain('déjà en attente');
    expect(messageDemandeManuelle(false)).not.toMatch(/démarre à l.instant|en cours d.exécution/i);
  });
});
