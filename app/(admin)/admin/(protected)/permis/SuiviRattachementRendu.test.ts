import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableSuivi, DetailSuiviRendu, LIBELLE_ETAT_SUIVI } from './SuiviRattachementRendu';
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';

/**
 * FUS-3b — rendu PUR du suivi (renderToStaticMarkup, aucun DOM). Couvre : compteurs + groupes par état, tri par urgence,
 * ancienneté ; le tableau comparatif « trois sources » (dont « aucun bâtiment » et « sans objet »), critères et provenance.
 */
const ligne = (o: Partial<LigneSuivi>): LigneSuivi => ({ dossierId: 1, numDau: '07512025V0035', commune: 'Paris', codeInsee: '75112', etat: 'suivi_aucun_signal', verdict: null, joursAnciennete: 3, derniereEvalIso: null, ...o });

const detail = (o: Partial<DetailSuivi> = {}): DetailSuivi => ({
  dossierId: 1, numDau: '07512025V0035', commune: 'Paris', codeInsee: '75112', etat: 'suivi_aucun_signal', persiste: false,
  verdict: 'RIEN', regime: 'sans_fusion', motif: 'aucun signal (en attente)',
  criteres: {
    surface: { applicable: false, ratio: null, seuil: 0.8, franchi: false },
    bordure: { applicable: false, part: null, seuil: 0.6, franchi: false },
    bati: { nbNouveauxOuModifies: 0, franchi: false },
  },
  seuils: { seuilSurface: 0.8, seuilBordure: 0.6, margeAltitudeM: 0.1 },
  seuilsProvenance: 'defaut', seuilsBrut: { surfacePct: 80, bordurePct: 60, margeAltitudeCm: 10 },
  millesimeCadastre: '2026-06-01', millesimeBati: '2026-03-20',
  comparatif: [
    { intitule: 'Surface de parcelle', enBase: { texte: '2631.5 m² déclarés', presente: true }, cadastre: { texte: '2885 m²', presente: true }, bdTopo: { texte: 'sans objet pour cette source', presente: false } },
    { intitule: 'Nombre de bâtiments', enBase: { texte: '2 corps déclarés', presente: true }, cadastre: { texte: 'sans objet pour cette source', presente: false }, bdTopo: { texte: 'aucun bâtiment dans l’empreinte', presente: true } },
  ],
  ...o,
});

describe('FUS-3b — libellés d’état', () => {
  it('libellés exacts (dont « suivi, aucun signal »)', () => {
    expect(LIBELLE_ETAT_SUIVI.suivi_aucun_signal).toBe('suivi, aucun signal');
    expect(LIBELLE_ETAT_SUIVI.arbitrage_demande).toBe('arbitrage demandé');
    expect(LIBELLE_ETAT_SUIVI.valide).toBe('rattaché');
  });
});

describe('FUS-3b — TableSuivi (compteurs, groupes, ancienneté)', () => {
  const compteurs = (o: Partial<Record<EtatSuivi, number>>): Record<EtatSuivi, number> =>
    ({ arbitrage_demande: 0, en_attente_bati: 0, annule_par_lidar: 0, valide: 0, refuse: 0, suivi_aucun_signal: 0, ...o });

  it('groupe par état, compte, et affiche l’ancienneté', () => {
    const lignes = [ligne({ dossierId: 2, etat: 'arbitrage_demande', joursAnciennete: 5, derniereEvalIso: '2026-08-11' }), ligne({ dossierId: 1, etat: 'suivi_aucun_signal', joursAnciennete: 3 })];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes, compteurs: { arbitrage_demande: 1, en_attente_bati: 0, annule_par_lidar: 0, valide: 0, refuse: 0, suivi_aucun_signal: 1 } }));
    expect(h).toContain('arbitrage demandé');
    expect(h).toContain('suivi, aucun signal');
    expect(h).toContain('en attente depuis 5 jours');
    expect(h).toContain('suivi depuis 3 jours');
    expect(h).toContain('évalué le 2026-08-11');
  });

  it('univers vide → message explicite', () => {
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes: [], compteurs: compteurs({}) }));
    expect(h).toMatch(/Aucun permis suivi/);
  });
});

describe('FUS-3b — DetailSuiviRendu (comparatif trois sources + provenance)', () => {
  it('rend les trois colonnes, « aucun bâtiment », « sans objet », et la provenance des seuils', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail() }));
    expect(h).toContain('En base (permis)');
    expect(h).toContain('Cadastre');
    expect(h).toContain('BD TOPO');
    expect(h).toContain('aucun bâtiment dans l’empreinte');
    expect(h).toContain('sans objet pour cette source');
    expect(h).toContain('repli sur défaut'); // provenance defaut
    expect(h).toContain('cadastre 2026-06-01');
    expect(h).toMatch(/dérivé — aucun dossier en base/); // persiste=false
  });

  it('critères sans objet en régime sans fusion', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail() }));
    expect(h).toContain('surface : sans objet (sans fusion)');
    expect(h).toContain('0 polygone(s)');
  });
});
