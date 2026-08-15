import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PastilleOrigineValeur, PastilleConfiance, ChampMesureEditeur, ChampDeclareEditeur, EditeurParking, EditeurRepere, FaitsPermisBloc, MESSAGE_AUCUN_CORPS, AnnotationsExtraction, BLEU_SOURCE } from './CaracteristiquesRendu';
import { MESURES, CHAMPS_PERMIS, type FaitsPermis } from './caracteristiquesForm';
import type { JournalChamp } from '../../../../lib/permis/journalLecture';

/** N3-C — rendu PUR (node pur, renderToStaticMarkup) : origines, bornes lues de la base, NULL affiché vide, mention du sommet. */
const noop = () => {};
const sommet = MESURES.find((m) => m.estSommet)!;
const nbEtages = MESURES.find((m) => m.cle === 'nbEtages')!;

describe('N3-C — PastilleOrigineValeur : trois libellés distincts', () => {
  it('saisie / extraite / non renseignée', () => {
    expect(renderToStaticMarkup(createElement(PastilleOrigineValeur, { origine: 'saisie' }))).toContain('saisie à la main');
    expect(renderToStaticMarkup(createElement(PastilleOrigineValeur, { origine: 'extraite' }))).toContain('extraite');
    expect(renderToStaticMarkup(createElement(PastilleOrigineValeur, { origine: null }))).toContain('non renseignée');
  });
});

describe('N3-C — ChampMesureEditeur', () => {
  it('valeur VIDE → input vide (jamais 0), bornes lues de la base affichées, origine « non renseignée »', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nbEtages, bornes: { min: 0, max: 70 }, valeur: '', origine: null, onValeur: noop }));
    expect(h).toContain('value=""');            // vide, pas 0
    expect(h).not.toContain('value="0"');
    expect(h).toContain('0 et 70');             // bornes de la base
    expect(h).toContain('non renseignée');
  });

  it('valeur 0 → affichée « 0 » avec origine « saisie »', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nbEtages, bornes: { min: 0, max: 70 }, valeur: '0', origine: 'saisie', onValeur: noop }));
    expect(h).toContain('value="0"');
    expect(h).toContain('saisie à la main');
  });

  it('le SOMMET est signalé (★) et dit ce qu’il désigne (acrotère/faîtage, pas le dernier plancher)', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: sommet, bornes: { min: -50, max: 500 }, valeur: '', origine: null, onValeur: noop }));
    expect(h).toContain('★');
    expect(h).toContain('acrotère');
    expect(h).toContain('faîtage');
  });

  it('erreur au niveau du champ (role=alert)', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nbEtages, bornes: { min: 0, max: 70 }, valeur: '100', origine: null, erreur: 'valeur attendue entre 0 et 70', onValeur: noop }));
    expect(h).toContain('role="alert"');
    expect(h).toContain('entre 0 et 70');
  });
});

describe('N5-D — confiance, réserve et provenance à côté de la valeur extraite', () => {
  const RESERVE = 'la cote la plus haute des planches peut appartenir à un bâtiment voisin — les coupes et façades figurent le contexte bâti';
  const journal = (over: Partial<JournalChamp> = {}): JournalChamp => ({
    confiance: 'a_verifier', reserve: RESERVE, provenances: [{ piece: 'PC3.pdf', page: 2 }], motif: null, ...over,
  });
  const rendre = (props: Parameters<typeof ChampMesureEditeur>[0]) => renderToStaticMarkup(createElement(ChampMesureEditeur, props));
  const base = { mesure: sommet, bornes: { min: -50, max: 500 }, valeur: '89.46', onValeur: noop } as const;

  it('PastilleConfiance : deux libellés distincts', () => {
    expect(renderToStaticMarkup(createElement(PastilleConfiance, { confiance: 'a_verifier' }))).toContain('à vérifier');
    expect(renderToStaticMarkup(createElement(PastilleConfiance, { confiance: 'confirmee' }))).toContain('corroborée');
  });

  it("extraite + a_verifier + réserve → origine, confiance ET réserve affichées, distinctement", () => {
    const h = rendre({ ...base, origine: 'extraite', journal: journal() });
    expect(h).toContain('extraite');       // origine (pastille pleine)
    expect(h).toContain('à vérifier');     // confiance (pastille contour) — axe différent
    expect(h).toContain('appartenir à un bâtiment voisin'); // réserve en toutes lettres
  });

  it('extraite + confirmee SANS réserve → confiance affichée, aucune réserve inventée', () => {
    const h = rendre({ ...base, origine: 'extraite', journal: journal({ confiance: 'confirmee', reserve: null }) });
    expect(h).toContain('corroborée');
    expect(h).not.toContain('appartenir à un bâtiment voisin');
    expect(h).not.toContain('à vérifier');
  });

  it("valeur 'saisie' → NI confiance NI réserve, même si un journal est fourni", () => {
    const h = rendre({ ...base, origine: 'saisie', journal: journal() });
    expect(h).toContain('saisie à la main');
    expect(h).not.toContain('à vérifier');
    expect(h).not.toContain('corroborée');
    expect(h).not.toContain('appartenir à un bâtiment voisin');
  });

  it('champ VIDE (origine null, aucun journal) → rien, surtout pas de pastille de confiance orpheline', () => {
    const h = rendre({ ...base, valeur: '', origine: null });
    expect(h).toContain('non renseignée');
    expect(h).not.toContain('à vérifier');
    expect(h).not.toContain('corroborée');
    expect(h).not.toContain('provenance');
  });

  it('provenance (pièce, page) atteignable et exacte', () => {
    const h = rendre({ ...base, origine: 'extraite', journal: journal({ provenances: [{ piece: 'PC3.pdf', page: 2 }, { piece: 'PC5.pdf', page: 4 }] }) });
    expect(h).toContain('provenance (2 pièces)');
    expect(h).toContain('PC3.pdf p.2');
    expect(h).toContain('PC5.pdf p.4');
  });
});

describe('N5-E — motif de non-écriture sous un champ vide', () => {
  const rendre = (props: Parameters<typeof ChampMesureEditeur>[0]) => renderToStaticMarkup(createElement(ChampMesureEditeur, props));
  const base = { mesure: sommet, bornes: { min: -50, max: 500 }, onValeur: noop } as const;
  const motifJournal = (motif: string): JournalChamp => ({ confiance: null, reserve: null, provenances: [], motif });

  it('champ VIDE dont le journal porte un motif → motif affiché en clair', () => {
    const h = rendre({ ...base, valeur: '', origine: null, journal: motifJournal('gabarit à plage annoncé pour plusieurs corps, valeur non attribuable') });
    expect(h).toContain('valeur non attribuable');
  });

  it('champ VIDE SANS motif journalisé → aucune note', () => {
    const h = rendre({ ...base, valeur: '', origine: null });
    expect(h).toContain('non renseignée');
    expect(h).not.toContain('vide :');
  });

  it("un motif n'apparaît PAS sous une valeur 'saisie' (la main l'emporte, pas de motif affiché)", () => {
    const h = rendre({ ...base, valeur: '10', origine: 'saisie', journal: motifJournal('une valeur saisie à la main occupe déjà le champ') });
    expect(h).toContain('saisie à la main');
    expect(h).not.toContain('occupe déjà le champ');
  });
});

describe('N3-C — EditeurParking : trois états dont « non renseigné »', () => {
  it('select à trois options', () => {
    const h = renderToStaticMarkup(createElement(EditeurParking, { valeur: '', origine: null, onValeur: noop }));
    expect(h).toContain('non renseigné');
    expect(h).toContain('>oui<');
    expect(h).toContain('>non<');
  });
  it('N7-E — parking VIDE avec motif journalisé → motif affiché', () => {
    const j: JournalChamp = { confiance: null, reserve: null, provenances: [], motif: 'libellés Cerfa présents mais valeurs non extractibles' };
    const h = renderToStaticMarkup(createElement(EditeurParking, { valeur: '', origine: null, journal: j, onValeur: noop }));
    expect(h).toContain('non extractibles');
  });
});

describe('N7-E — ChampDeclareEditeur (champs permis)', () => {
  const nature = CHAMPS_PERMIS.find((c) => c.cle === 'natureProjet')!;
  const surface = CHAMPS_PERMIS.find((c) => c.cle === 'surfacePlancherM2')!;
  it('nature = SÉLECTEUR dont les options viennent de la liste fournie (pas de champ libre)', () => {
    const h = renderToStaticMarkup(createElement(ChampDeclareEditeur, { champ: nature, valeur: 'mixte', origine: 'saisie', naturesPossibles: ['bureaux', 'mixte'], onValeur: noop }));
    expect(h).toContain('<select');
    expect(h).toContain('>bureaux<');
    expect(h).toContain('>mixte<');
  });
  it('valeur extraite + confiance → pastille ; réserve affichée', () => {
    const j: JournalChamp = { confiance: 'confirmee', reserve: 'W2SF1=13032 vs Sitadel', provenances: [{ piece: 'cerfa.pdf', page: 8 }], motif: null };
    const h = renderToStaticMarkup(createElement(ChampDeclareEditeur, { champ: surface, valeur: '13032', origine: 'extraite', journal: j, onValeur: noop }));
    expect(h).toContain('corroborée');
    expect(h).toContain('W2SF1=13032');
    expect(h).toContain('provenance (1 pièce)');
  });
  it('champ VIDE avec motif → motif affiché ; sans motif → rien', () => {
    const j: JournalChamp = { confiance: null, reserve: null, provenances: [], motif: 'absence de champ ne vaut pas zéro' };
    expect(renderToStaticMarkup(createElement(ChampDeclareEditeur, { champ: surface, valeur: '', origine: null, journal: j, onValeur: noop }))).toContain('ne vaut pas zéro');
    expect(renderToStaticMarkup(createElement(ChampDeclareEditeur, { champ: surface, valeur: '', origine: null, onValeur: noop }))).not.toContain('vide :');
  });
  it('N7-F — une divergence (parking vs nombre) est affichée, jamais masquée', () => {
    const stat = CHAMPS_PERMIS.find((c) => c.cle === 'nbPlacesStationnement')!;
    const h = renderToStaticMarkup(createElement(ChampDeclareEditeur, { champ: stat, valeur: '3', origine: 'extraite', divergence: 'parking déclaré « non » mais 3 place(s)', onValeur: noop }));
    expect(h).toContain('divergence');
    expect(h).toContain('parking déclaré');
  });
  it('N8-C — sommet du PERMIS : libellé distinct + aide qui dit POURQUOI il n’est pas sur un corps ; extraite → confiance/réserve/provenance', () => {
    const sommet = CHAMPS_PERMIS.find((c) => c.cle === 'altitudeSommetNgf')!;
    const j: JournalChamp = { confiance: 'a_verifier', reserve: 'superstructure de toiture ; peut appartenir à un bâtiment voisin', provenances: [{ piece: 'PC3.pdf', page: 2 }], motif: null };
    const h = renderToStaticMarkup(createElement(ChampDeclareEditeur, { champ: sommet, bornes: { min: -50, max: 500 }, valeur: '89.46', origine: 'extraite', journal: j, onValeur: noop }));
    expect(h).toContain('Altitude du sommet du permis'); // libellé disambiguant (≠ « Altitude du sommet » d’un corps)
    expect(h).toContain('NON rattaché à un corps');       // l’aide dit pourquoi la valeur est au niveau permis
    expect(h).toContain('l’attribution par lot n’est pas établie');
    expect(h).toContain('à vérifier');                    // confiance de la valeur extraite
    expect(h).toContain('superstructure de toiture');     // réserve conservée
    expect(h).toContain('provenance (1 pièce)');          // provenance atteignable
    expect(h).toContain('-50 et 500');                    // bornes lues de la base
  });
  it('N8-C — sommet VIDE (origine null) porte le MOTIF de non-écriture, pas une valeur inventée', () => {
    const sommet = CHAMPS_PERMIS.find((c) => c.cle === 'altitudeSommetNgf')!;
    const j: JournalChamp = { confiance: null, reserve: null, provenances: [], motif: 'aucune cote d’acrotère qualifiée dans les planches' };
    const h = renderToStaticMarkup(createElement(ChampDeclareEditeur, { champ: sommet, bornes: { min: -50, max: 500 }, valeur: '', origine: null, journal: j, onValeur: noop }));
    expect(h).toContain('vide :');
    expect(h).toContain('aucune cote d’acrotère');
  });
});

describe('N7-E — EditeurRepere : motif sous un repère vide', () => {
  it('repère VIDE + motif → affiché ; repère RENSEIGNÉ → pas de motif', () => {
    const j: JournalChamp = { confiance: null, reserve: null, provenances: [], motif: 'attribution par corps indécidable' };
    expect(renderToStaticMarkup(createElement(EditeurRepere, { valeur: '', journal: j, onValeur: noop }))).toContain('indécidable');
    expect(renderToStaticMarkup(createElement(EditeurRepere, { valeur: '2D1', journal: j, onValeur: noop }))).not.toContain('indécidable');
  });
});

describe('N3-C — FaitsPermisBloc : lecture seule, surface seulement si présente', () => {
  const faits = (over: Partial<FaitsPermis> = {}): FaitsPermis => ({
    numDau: '07512025V0035', type: 'PC', communeNom: 'Paris', codeInsee: '75056', adresse: '3 av. Benoît Frachon',
    natureTravaux: 'Construction neuve', dateAutorisation: '2026-03-13', surfaceCreee: null, ...over,
  });
  it('affiche les faits ; PAS de ligne surface si absente', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits: faits() }));
    expect(h).toContain('07512025V0035');
    expect(h).toContain('Construction neuve');
    expect(h).toContain('lecture seule');
    expect(h).not.toContain('Surface créée');
  });
  it('affiche la surface quand elle existe', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits: faits({ surfaceCreee: '13032' }) }));
    expect(h).toContain('Surface créée');
    expect(h).toContain('13032 m²');
  });
  it('message « aucun corps » exporté', () => {
    expect(MESSAGE_AUCUN_CORPS).toContain('Aucun corps');
  });
});

describe('N10 — AnnotationsExtraction : provenance dédoublonnée, comptée honnêtement, cliquable', () => {
  const rendre = (props: Parameters<typeof AnnotationsExtraction>[0]) => renderToStaticMarkup(createElement(AnnotationsExtraction, props));
  // journal 'extraite' avec un DOUBLON (PC5 p.3 deux fois) sur 3 pièces distinctes / 4 pages distinctes.
  const j: JournalChamp = { confiance: 'confirmee', reserve: null, motif: null, provenances: [
    { piece: 'PC5.pdf', page: 3 }, { piece: 'PC5.pdf', page: 3 }, { piece: 'PC5.pdf', page: 4 }, { piece: 'PC3.pdf', page: 2 }, { piece: 'PC40.pdf', page: 26 },
  ] };

  it('D — dédoublonne (PC5 p.3 une seule fois) et compte des PIÈCES distinctes + pages, pas des pages étiquetées « pièces »', () => {
    const h = rendre({ origine: 'extraite', journal: j });
    expect(h).toContain('provenance (3 pièces, 4 pages)'); // 3 pièces distinctes (PC5/PC3/PC40), 4 pages après dédoublonnage
    expect((h.match(/PC5\.pdf p\.3/g) ?? []).length).toBe(1); // le doublon a disparu
  });
  it('A — chaque entrée résolue devient un lien bleu (bouton) ; l’entrée non résolue reste en texte simple', () => {
    const lienPiece = (nom: string) => (nom === 'PC3.pdf' ? () => {} : undefined); // seule PC3 est résolue
    const h = rendre({ origine: 'extraite', journal: j, lienPiece });
    expect(h).toContain(BLEU_SOURCE);            // au moins un lien bleu
    expect(h).toContain('<button');              // PC3 → bouton (téléchargement)
    expect(h).toContain('PC5.pdf p.3</span>');   // PC5 non résolue → texte simple, jamais un lien mort
  });
  it('une valeur SAISIE ne montre aucune provenance (même journal fourni)', () => {
    expect(rendre({ origine: 'saisie', journal: j })).not.toContain('provenance');
  });
  it('un champ VIDE (origine null) affiche le motif, pas la provenance', () => {
    expect(rendre({ origine: null, journal: { confiance: null, reserve: null, provenances: [], motif: 'absence' } })).toContain('vide : absence');
  });
});
