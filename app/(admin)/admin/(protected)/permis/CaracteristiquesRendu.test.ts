import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PastilleOrigineValeur, PastilleConfiance, ChampMesureEditeur, ChampDeclareEditeur, ChampDestinationsEditeur, EditeurParking, EditeurRepere, FaitsPermisBloc, MESSAGE_AUCUN_CORPS, AnnotationsExtraction, BLEU_SOURCE, VIOLET_A_CONFIRMER, cerfaEstScanSansChamps } from './CaracteristiquesRendu';
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
    const h = rendre({ ...base, valeur: '', origine: null, journal: motifJournal('gabarit à plage annoncé pour plusieurs bâtiments, valeur non attribuable') });
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
    expect(h).toContain('NON rattaché à un bâtiment');       // l’aide dit pourquoi la valeur est au niveau permis
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
    const j: JournalChamp = { confiance: null, reserve: null, provenances: [], motif: 'attribution à un bâtiment indécidable' };
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
  it('N12 — nombre de bâtiments AVEC sa provenance « d’après les pièces » (pas un fait Sitadel)', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits: faits(), nbBatiments: 2 }));
    expect(h).toContain('Bâtiments identifiés : ');
    expect(h).toContain('2');
    expect(h).toContain('d’après les pièces'); // provenance : pas présenté comme un fait officiel Sitadel
  });
  it('N12 — aucun bâtiment identifié → phrase d’ABSENCE, JAMAIS « 0 bâtiment »', () => {
    const h0 = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits: faits(), nbBatiments: 0 }));
    expect(h0).toContain('aucun bâtiment identifié dans les pièces');
    expect(h0).not.toContain('0 bâtiment');
    // prop absente = même comportement d’absence (jamais un « 0 » trompeur)
    const hAbs = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits: faits() }));
    expect(hAbs).toContain('aucun bâtiment identifié dans les pièces');
  });
  it('message « aucun corps » exporté', () => {
    expect(MESSAGE_AUCUN_CORPS).toContain('Aucun bâtiment');
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
  it('A — chaque entrée résolue devient un lien bleu (bouton) ; l’entrée non résolue reste en texte, avec la mention de l’échec', () => {
    const lienPiece = (nom: string) => (nom === 'PC3.pdf' ? () => {} : undefined); // seule PC3 est résolue
    const h = rendre({ origine: 'extraite', journal: j, lienPiece });
    expect(h).toContain(BLEU_SOURCE);                          // au moins un lien bleu
    expect(h).toContain('<button');                           // PC3 → bouton (ouverture)
    expect(h).toContain('PC5.pdf p.3 (document introuvable)'); // PC5 non résolue → texte + mention de ce qui manque, jamais un lien mort
  });
  it('une valeur SAISIE ne montre aucune provenance (même journal fourni)', () => {
    expect(rendre({ origine: 'saisie', journal: j })).not.toContain('provenance');
  });
  it('un champ VIDE (origine null) affiche le motif, pas la provenance', () => {
    expect(rendre({ origine: null, journal: { confiance: null, reserve: null, provenances: [], motif: 'absence' } })).toContain('vide : absence');
  });
});

describe('N10-B — AnnotationsExtraction : provenances des ÉCARTÉS (superstructures) cliquables à la page', () => {
  const rendre = (props: Parameters<typeof AnnotationsExtraction>[0]) => renderToStaticMarkup(createElement(AnnotationsExtraction, props));
  const j: JournalChamp = {
    confiance: 'confirmee', reserve: 'TOITURE — superstructures cotées au-dessus', motif: null,
    provenances: [{ piece: 'PC3.pdf', page: 1 }],
    ecartes: [{ valeur: 108.93, piece: 'PC5.5.pdf', page: 1, motif: 'superstructure' }, { valeur: 100, piece: 'renommee.pdf', page: 2, motif: 'superstructure' }],
  };

  it('① une cote écartée dont la pièce est résolue rend un LIEN, et la page est transmise au résolveur (ouverture à la page)', () => {
    const vues: { nom: string; page?: number | null }[] = [];
    const lienPiece = (nom: string, page?: number | null) => { vues.push({ nom, page }); return nom === 'PC5.5.pdf' ? () => {} : undefined; };
    const h = rendre({ origine: 'extraite', journal: j, lienPiece });
    expect(h).toContain('cotes écartées au-dessus (2)');
    expect(h).toContain('108.93');
    expect(h).toContain(BLEU_SOURCE);                                   // PC5.5 résolue → lien
    expect(vues).toContainEqual({ nom: 'PC5.5.pdf', page: 1 });          // la PAGE est bien passée au résolveur (→ #page côté client)
  });

  it('② une cote écartée NON résolue rend du texte sans lien, avec la mention de l’échec', () => {
    const lienPiece = (nom: string) => (nom === 'PC5.5.pdf' ? () => {} : undefined); // renommee.pdf ne résout pas
    const h = rendre({ origine: 'extraite', journal: j, lienPiece });
    expect(h).toContain('renommee.pdf p.2 (document introuvable)');
  });

  it('③ la clé de stockage n’apparaît JAMAIS dans le rendu (ni URL, ni clé)', () => {
    const lienPiece = (nom: string) => (nom === 'PC5.5.pdf' ? () => {} : undefined);
    const h = rendre({ origine: 'extraite', journal: j, lienPiece });
    expect(h).not.toContain('http');   // aucun href/URL dans le markup (le lien est un bouton → signé à la demande)
    expect(h).not.toMatch(/cle|cle_stockage|s3|bucket/i);
  });
});

describe('N13 — ChampDestinationsEditeur : cases à cocher + libellé composé, origine/confiance/motif', () => {
  const possibles = ['Bureau', 'Artisanat et commerce de détail', 'Restauration', 'Logement'];
  it('coche les destinations présentes et compose le libellé (jamais « mixte »)', () => {
    const h = renderToStaticMarkup(createElement(ChampDestinationsEditeur, {
      possibles, valeurs: ['Bureau', 'Artisanat et commerce de détail', 'Restauration'], origine: 'extraite',
      journal: { confiance: 'a_verifier', reserve: null, provenances: [{ piece: 'cerfa.pdf', page: 8 }], motif: null }, onToggle: noop,
    }));
    expect(h).toContain('Bureau, artisanat et commerce de détail, et restauration'); // libellé composé, généré
    expect(h).not.toContain('mixte');
    expect((h.match(/checked=""/g) ?? []).length).toBe(3); // 3 cases cochées
    expect(h).toContain('extraite');        // pastille d'origine, comme les autres champs
    expect(h).toContain('à vérifier');      // confiance
    expect(h).toContain('provenance');      // provenance repliable
  });
  it('aucune destination cochée → « non renseignée », JAMAIS « 0 » ni « mixte »', () => {
    const h = renderToStaticMarkup(createElement(ChampDestinationsEditeur, { possibles, valeurs: [], origine: null, onToggle: noop }));
    expect(h).toContain('non renseignée');
    expect((h.match(/checked=""/g) ?? []).length).toBe(0);
    expect(h).not.toContain('mixte');
  });
  it('champ VIDE avec motif journalisé → motif affiché (origine null)', () => {
    const j = { confiance: null, reserve: null, provenances: [], motif: 'aucune surface par sous-destination (W2·F1) renseignée' };
    const h = renderToStaticMarkup(createElement(ChampDestinationsEditeur, { possibles, valeurs: [], origine: null, journal: j, onToggle: noop }));
    expect(h).toContain('aucune surface par sous-destination');
  });
});

describe('N3-E — FaitsPermisBloc : parcelles cadastrales (ligne par parcelle, non-rattachée dit pourquoi, export)', () => {
  const faits: FaitsPermis = { numDau: '07512025V0035', type: 'PC', communeNom: 'Paris', codeInsee: '75056', adresse: '3 av. Benoît Frachon', natureTravaux: 'Construction neuve', dateAutorisation: '2026-03-13', surfaceCreee: null };
  const parc = (over = {}) => ({ prefixe: '000', section: 'DZ', numero: '09', superficieDeclareeM2: 2631.5, role: 'origine' as const, origine: 'extraite' as const, idu: '75120000DZ0009', confiance: 'confirmee' as const, reserve: null, provenance: 'Cerfa', communeCadastrale: '75120', contenance: 2631, aireCadastraleM2: 2630, aGeometrie: true, deptCharge: true, ...over });

  it('parcelle rattachée : section, n°, superficie déclarée, contenance + ST_Area (preuve du contour), bouton export', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits, parcelles: [parc()], onExportGeojson: () => {} }));
    expect(h).toContain('Section DZ n° 09');
    expect(h).toContain('2631.5 m² déclarés');
    expect(h).toContain('cadastre 2631 m²');
    expect(h).toContain('ST_Area 2630 m²');       // la surface PostGIS prouve que le contour est là et juste
    expect(h).toContain('exporter le contour (GeoJSON)');
  });
  it('parcelle NON rattachée (dept non chargé) → dit POURQUOI, jamais un vide muet', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits, parcelles: [parc({ aGeometrie: false, deptCharge: false, contenance: null, aireCadastraleM2: null })] }));
    expect(h).toContain('non rattachée : géométrie non chargée pour le département 75');
    expect(h).not.toContain('ST_Area');
  });
  it('écart superficie déclarée vs contenance cadastrale → signalé', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits, parcelles: [parc({ contenance: 2000 })] }));
    expect(h).toContain('2631.5 m² déclarés vs 2000 m²');
  });
  it('aucune parcelle → phrase explicite (jamais un vide)', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits, parcelles: [] }));
    expect(h).toContain('aucune parcelle rattachée à ce permis');
  });
});

describe('FUS-1 — FaitsPermisBloc : empreinte attendue de la parcelle fusionnée', () => {
  const faits: FaitsPermis = { numDau: '07512025V0035', type: 'PC', communeNom: 'Paris', codeInsee: '75056', adresse: '3 av. B. Frachon', natureTravaux: 'Construction neuve', dateAutorisation: '2026-03-13', surfaceCreee: null };
  const parc = () => ({ prefixe: '000', section: 'DZ', numero: '09', superficieDeclareeM2: 2631.5, role: 'origine' as const, origine: 'extraite' as const, idu: '75120000DZ0009', confiance: 'confirmee' as const, reserve: null, provenance: 'Cerfa', communeCadastrale: '75120', contenance: 2631, aireCadastraleM2: 2630, aGeometrie: true, deptCharge: true });

  it('complète : surface + « union de N parcelles » + bouton export + garde-fou « pas la parcelle future réelle »', () => {
    const empreinte = { surfaceM2: 2886.3, nbParcelles: 2, complete: true, motif: null, millesime: '2026-06-01', aGeometrie: true };
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits, parcelles: [parc()], empreinte, onExportEmpreinte: () => {} }));
    expect(h).toContain('Empreinte attendue de la parcelle fusionnée');
    expect(h).toContain('2886.3 m²');
    expect(h).toContain('union de 2 parcelles');
    expect(h).toContain('millésime 2026-06-01');
    expect(h).toContain('exporter l’empreinte (GeoJSON)');
    expect(h).toContain('pas la parcelle future réelle');   // la LIMITE est aussi à l'écran, pas seulement dans le code
  });
  it('incomplète : dit POURQUOI, pas de surface, pas de bouton export', () => {
    const empreinte = { surfaceM2: null, nbParcelles: 2, complete: false, motif: '1 parcelle(s) d’origine non rattachée(s) au cadastre → empreinte attendue incomplète (pas d’union sur un sous-ensemble)', millesime: null, aGeometrie: false };
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits, parcelles: [parc()], empreinte, onExportEmpreinte: () => {} }));
    expect(h).toContain('Empreinte attendue : incomplète');
    expect(h).toContain('non rattachée');
    expect(h).not.toContain('exporter l’empreinte');
  });
  it('empreinte absente (113 non appliquée) → aucune ligne empreinte, le reste s’affiche', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits, parcelles: [parc()] }));
    expect(h).not.toContain('Empreinte attendue');
    expect(h).toContain('Section DZ n° 09');
  });
});

describe('N10-D — le sommet : violet « à confirmer », geste « Valider cette hauteur », valeur auto, trace, garde « non validée »', () => {
  const rendreSommet = (props: Partial<Parameters<typeof ChampMesureEditeur>[0]>) =>
    renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: sommet, valeur: '97.13', origine: 'extraite', valeurBase: 97.13, onValeur: noop, onValider: noop, ...props }));

  it('① extraite JAMAIS examinée → le MOT « à confirmer » ET le violet + le bouton « Valider cette hauteur »', () => {
    const h = rendreSommet({ confirmeLe: null });
    expect(h).toContain('à confirmer');                 // le mot est obligatoire (règle T2-B)
    expect(h).toContain(VIOLET_A_CONFIRMER);            // le violet n'est qu'un appui
    expect(h).toContain('Valider cette hauteur');        // le geste dédié au sommet
  });

  it('④ validée → plus de « à confirmer » ni violet, mais la TRACE « validée par NOM le JJ/MM/AAAA »', () => {
    const h = rendreSommet({ origine: 'saisie', valeurBase: 101, valeur: '101', confirmeLe: '2026-08-20T09:30:00Z', confirmeParNom: 'Camille Moreau' });
    expect(h).not.toContain('à confirmer');
    expect(h).toContain('validée par Camille Moreau le 20/08/2026'); // ④ : un NOM, pas un numéro
  });

  it('B — la valeur automatique est affichée et remise en un clic (aucune écriture au rendu)', () => {
    const h = rendreSommet({ confirmeLe: null, valeurAuto: 97.13 });
    expect(h).toContain('valeur automatique : 97.13');
    expect(h).toContain('Remettre la valeur automatique');
  });

  it('⑥ garde anti-piège : le champ diffère de la base → « hauteur modifiée, non validée »', () => {
    const h = rendreSommet({ valeur: '101', valeurBase: 97.13, confirmeLe: null });
    expect(h).toContain('hauteur modifiée, non validée');
  });

  it('champ ÉGAL à la base → pas d’avertissement « non validée »', () => {
    const h = rendreSommet({ valeur: '97.13', valeurBase: 97.13 });
    expect(h).not.toContain('non validée');
  });

  it('le violet et le geste ne touchent QUE le sommet : un autre champ extrait n’a ni « à confirmer » ni « Valider »', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nbEtages, valeur: '5', origine: 'extraite', onValeur: noop }));
    expect(h).not.toContain('à confirmer');
    expect(h).not.toContain('Valider cette hauteur');
  });
});

describe('N10-C — ⑤ détection « Cerfa = scan sans champ lisible » (methode=\'cerfa\', liste fermée, jamais le texte du motif)', () => {
  const j = (methode: string | null) => ({ confiance: null, reserve: null, provenances: [], motif: 'peu importe le libellé', methode });
  it('tous les champs Cerfa vides ET une ligne methode=cerfa → scan détecté', () => {
    expect(cerfaEstScanSansChamps({ surface_plancher_m2: j('cerfa') }, true)).toBe(true);
  });
  it('une ligne d’une AUTRE méthode (enonce) → PAS un scan (exact, pas un rapprochement de texte)', () => {
    expect(cerfaEstScanSansChamps({ surface_plancher_m2: j('enonce') }, true)).toBe(false);
  });
  it('des champs remplis (tousVides=false) → PAS le message, même avec methode=cerfa', () => {
    expect(cerfaEstScanSansChamps({ surface_plancher_m2: j('cerfa') }, false)).toBe(false);
  });
});

describe('N10-E — la limite PLU à côté du sommet + dépassement signalé (jamais bloquant)', () => {
  const rendreSommet = (props: Partial<Parameters<typeof ChampMesureEditeur>[0]>) =>
    renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: sommet, valeur: '97.13', origine: 'saisie', valeurBase: 97.13, onValeur: noop, onValider: noop, ...props }));
  const pluMesure = MESURES.find((m) => m.cle === 'hauteurMaxPluNgf')!;

  it('la limite PLU s’affiche À CÔTÉ de la hauteur retenue', () => {
    const h = rendreSommet({ limitePluNgf: 101 });
    expect(h).toContain('limite PLU : 101 m');
    expect(h).toContain('hauteur retenue : 97.13 m');
  });

  it('hauteur retenue SOUS la limite → pas d’alerte de dépassement', () => {
    const h = rendreSommet({ limitePluNgf: 101, valeurBase: 97.13 });
    expect(h).not.toContain('dépasse la limite');
  });

  it('hauteur retenue AU-DESSUS de la limite → dépassement SIGNALÉ, non bloquant', () => {
    const h = rendreSommet({ limitePluNgf: 101, valeurBase: 105 });
    expect(h).toContain('dépasse la limite PLU (101 m)');
    expect(h).toContain('non bloquant');
  });

  it('sans limite renseignée → aucune ligne « limite PLU »', () => {
    expect(rendreSommet({ limitePluNgf: null })).not.toContain('limite PLU');
  });

  it('la hauteur max PLU est un champ ordinaire (input + libellé), sans violet ni « Valider »', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: pluMesure, valeur: '101', origine: 'saisie', onValeur: noop }));
    expect(h).toContain('Hauteur maximale PLU (NGF)');
    expect(h).toContain('value="101"');
    expect(h).not.toContain('à confirmer');
    expect(h).not.toContain('Valider cette hauteur');
  });
});

describe('N10-I — gabarit PLU : cotes candidates lues sur les planches (choix à la main, divergence signalée)', () => {
  const gab = MESURES.find((m) => m.cle === 'hauteurMaxPluNgf')!;
  type Ecarte = NonNullable<JournalChamp['ecartes']>[number];
  const ecarte = (valeur: number, piece: string, page = 1): Ecarte => ({ valeur, piece, page, motif: null });
  const journal = (ecartes: Ecarte[], reserve: string | null = null): JournalChamp =>
    ({ confiance: null, reserve, provenances: [], ecartes, motif: null });
  const rendre = (j: JournalChamp, origine: 'extraite' | null = null) =>
    renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: gab, valeur: '', origine, journal: j, onValeur: noop }));

  it('DIVERGENT (101 sur BB/CC, 100 sur AA/Sud) → deux groupes, avertissement, un bouton par valeur, planches cliquables', () => {
    const j = journal([ecarte(101, 'PC3.2 BB'), ecarte(101, 'PC3.3 CC'), ecarte(100, 'PC3.1 AA'), ecarte(100, 'PC5.5 Sud')],
      'le gabarit NGF varie selon le plateau de nivellement de la portion coupée');
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: gab, valeur: '', origine: null, journal: j, lienPiece: () => () => {}, onValeur: noop }));
    expect(h).toContain('gabarit PLU lu sur les planches');
    expect(h).toContain('valeurs divergentes');
    expect(h).toContain('plateau de nivellement');
    expect(h).toContain('101 m');
    expect(h).toContain('100 m');
    expect(h).toContain('utiliser 101');
    expect(h).toContain('utiliser 100');
  });

  it('CONCORDANT (tout 101) → un seul groupe, PAS d’avertissement de divergence', () => {
    const h = rendre(journal([ecarte(101, 'PC3.2 BB'), ecarte(101, 'PC3.3 CC')]));
    expect(h).toContain('utiliser 101');
    expect(h).not.toContain('utiliser 100');
    expect(h).not.toContain('valeurs divergentes');
  });

  it('le bloc « cotes écartées au-dessus » générique est MASQUÉ sur le champ gabarit (candidats affichés à la place)', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: gab, valeur: '101', origine: 'extraite', journal: journal([ecarte(101, 'PC3.2 BB')]), onValeur: noop }));
    expect(h).not.toContain('cotes écartées au-dessus');
    expect(h).toContain('gabarit PLU lu sur les planches');
  });

  it('un AUTRE champ (nb d’étages) avec des écartés → aucun bloc gabarit, le détail générique reste', () => {
    const nb = MESURES.find((m) => m.cle === 'nbEtages')!;
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nb, valeur: '5', origine: 'extraite', journal: { confiance: null, reserve: null, provenances: [], ecartes: [{ valeur: 9, piece: 'x.pdf', page: 2, motif: null }], motif: null }, onValeur: noop }));
    expect(h).not.toContain('gabarit PLU lu sur les planches');
    expect(h).toContain('cotes écartées au-dessus');
  });
});
