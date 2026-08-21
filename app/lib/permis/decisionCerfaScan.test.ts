import { describe, it, expect } from 'vitest';
import { accorder, accorderDestinations, planifierEcriture, type LectureValeur, type ChampScalaire } from './decisionCerfaScan';

/** N10-O — logique PURE d'accord entre DEUX lectures (OCR + vision) d'un Cerfa scanné. Aucun appel modèle : lectures bouchonnées. */
const val = (v: string): LectureValeur => ({ statut: 'valeur', valeur: v });
const vide: LectureValeur = { statut: 'vide' };
const illisible: LectureValeur = { statut: 'illisible' };

describe('accorder — écrit seulement si les deux lectures s’accordent', () => {
  it('accord sur une valeur → écrire, confiance confirmee', () => {
    const a = accorder(val('9470'), val('9470'));
    expect(a.statut).toBe('ecrire');
    if (a.statut === 'ecrire') { expect(a.valeur).toBe('9470'); expect(a.confiance).toBe('confirmee'); }
  });

  it('deux valeurs DIFFÉRENTES → désaccord, rien écrit, les deux gardées', () => {
    const a = accorder(val('9470'), val('9740'));
    expect(a.statut).toBe('desaccord');
    if (a.statut === 'desaccord') { expect(a.ocr).toEqual(val('9470')); expect(a.vision).toEqual(val('9740')); }
  });

  it('une valeur / l’autre vide → désaccord (jamais on ne tranche pour la valeur)', () => {
    expect(accorder(val('12'), vide).statut).toBe('desaccord');
    expect(accorder(vide, val('12')).statut).toBe('desaccord');
  });

  it('les deux VIDE → abstention « champ non renseigné » (PAS une valeur)', () => {
    const a = accorder(vide, vide);
    expect(a.statut).toBe('vide');
    if (a.statut === 'vide') expect(a.motif).toContain('non renseigné');
  });

  it('les deux ILLISIBLE → abstention', () => {
    expect(accorder(illisible, illisible).statut).toBe('illisible');
  });
});

describe('N10-O — VIDE ≠ 0 (porté par le code, pas par le modèle)', () => {
  it('les deux lisent « 0 » (0 écrit au Cerfa) → écrire 0', () => {
    const a = accorder(val('0'), val('0'));
    expect(a.statut === 'ecrire' && a.valeur).toBe('0');
  });

  it('les deux VIDE → RIEN écrit ; le plan n’écrit PAS 0', () => {
    const champ: ChampScalaire = { cle: 'nbPlacesStationnement', colonne: 'nb_places_stationnement', page: 10, numerique: true, accord: accorder(vide, vide) };
    const plan = planifierEcriture([champ], 'CERFA.pdf', 9, { statut: 'vide', motif: 'x' });
    expect(plan.scalaires).toEqual([]);                                  // aucune valeur posée
    const j = plan.journal.find((l) => l.champ === 'nb_places_stationnement')!;
    expect(j.role).toBe('ecartee'); expect(j.valeur).toBeNull();          // jamais 0
    expect(plan.journal.some((l) => l.valeur === 0)).toBe(false);
  });

  it('un « 0 » accordé → plan pose 0 (valeur numérique)', () => {
    const champ: ChampScalaire = { cle: 'nbLogements', colonne: 'nb_logements', page: 7, numerique: true, accord: accorder(val('0'), val('0')) };
    const plan = planifierEcriture([champ], 'CERFA.pdf', 9, { statut: 'vide', motif: 'x' });
    expect(plan.scalaires).toEqual([{ cle: 'nbLogements', valeur: '0' }]);
    expect(plan.journal.find((l) => l.champ === 'nb_logements')!.valeur).toBe(0);
  });
});

describe('accorderDestinations — même ensemble de sous-destinations, sinon désaccord', () => {
  const SD = ['Logement', 'Bureau', 'Équipements sportifs', 'Industrie'];

  it('07512024V0037 : les deux ne déclarent QUE « Équipements sportifs » → écrire, provenance « surface déclarée en W2 »', () => {
    const ocr = { 'Équipements sportifs': val('9470') } as Record<string, LectureValeur>;
    const vision = { 'Équipements sportifs': val('9470') } as Record<string, LectureValeur>;
    const a = accorderDestinations(SD, ocr, vision);
    expect(a.statut).toBe('ecrire');
    if (a.statut === 'ecrire') { expect(a.retenues).toEqual(['Équipements sportifs']); expect(a.provenances[0]).toEqual({ sousDestination: 'Équipements sportifs', valeur: '9470' }); }
  });

  it('ensembles DIFFÉRENTS (vision invente « Logement ») → désaccord, rien écrit, les deux ensembles gardés', () => {
    const ocr = { 'Équipements sportifs': val('9470') } as Record<string, LectureValeur>;
    const vision = { 'Équipements sportifs': val('9470'), 'Logement': val('50') } as Record<string, LectureValeur>;
    const a = accorderDestinations(SD, ocr, vision);
    expect(a.statut).toBe('desaccord');
    if (a.statut === 'desaccord') { expect(a.ocrRetenues).toEqual(['Équipements sportifs']); expect(a.visionRetenues.sort()).toEqual(['Logement', 'Équipements sportifs']); }
  });

  it('aucune surface des deux côtés → vide (aucune destination déclarée)', () => {
    expect(accorderDestinations(SD, {}, {}).statut).toBe('vide');
  });
});

describe('planifierEcriture — provenance destinations + désaccord journalisé', () => {
  const champVide = (): ChampScalaire => ({ cle: 'surfacePlancherM2', colonne: 'surface_plancher_m2', page: 9, numerique: true, accord: accorder(vide, vide) });

  it('destinations écrites → provenance dit « surface déclarée en W2 », JAMAIS « case cochée »', () => {
    const accordDest = accorderDestinations(['Équipements sportifs'], { 'Équipements sportifs': val('9470') }, { 'Équipements sportifs': val('9470') });
    const plan = planifierEcriture([], 'CERFA.pdf', 9, accordDest);
    expect(plan.destinations).toEqual(['Équipements sportifs']);
    const j = plan.journal.find((l) => l.champ === 'destinations' && l.role === 'retenue')!;
    expect(j.extrait).toContain('surface déclarée en W2');
    expect(j.extrait).not.toContain('cochée');
    expect(j.page).toBe(9);
  });

  it('champ scalaire en désaccord → DEUX lignes ecartées (OCR + vision), rien posé', () => {
    const champ: ChampScalaire = { cle: 'surfacePlancherM2', colonne: 'surface_plancher_m2', page: 9, numerique: true, accord: accorder(val('9470'), vide) };
    const plan = planifierEcriture([champ], 'CERFA.pdf', 9, { statut: 'vide', motif: 'x' });
    expect(plan.scalaires).toEqual([]);
    const lignes = plan.journal.filter((l) => l.champ === 'surface_plancher_m2');
    expect(lignes).toHaveLength(2);
    expect(lignes.some((l) => l.extrait.includes('OCR'))).toBe(true);
    expect(lignes.some((l) => l.extrait.includes('vision'))).toBe(true);
    expect(champVide().colonne).toBe('surface_plancher_m2'); // sanity du helper
  });
});
