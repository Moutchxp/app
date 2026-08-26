import { describe, it, expect } from 'vitest';
import {
  libelleAnnee, libelleEtages, contenuBulleBatiment, doitCreerAuDoubleClic,
  libelleDossiersParcelle, libelleParcellePartagee, libelleTypeDossier, libelleEtatDau, htmlDetailDossiers,
} from './bulleBatiment';

describe('libelleAnnee', () => {
  it('année connue → « Construit en <annee> » (entier brut, sans séparateur)', () => {
    expect(libelleAnnee(1954)).toBe('Construit en 1954');
    expect(libelleAnnee(2003)).toBe('Construit en 2003');
    expect(libelleAnnee(1789)).toBe('Construit en 1789');
  });

  it('année absente (null/undefined) → libellé EXPLICITE, jamais un vide ni un tiret', () => {
    const attendu = 'Année de construction non renseignée';
    expect(libelleAnnee(null)).toBe(attendu);
    expect(libelleAnnee(undefined)).toBe(attendu);
    expect(libelleAnnee(null).length).toBeGreaterThan(0);
    expect(libelleAnnee(null)).not.toBe('—');
    expect(libelleAnnee(null)).not.toBe('');
  });

  it('valeur non finie (NaN/Infinity) → repli sur le libellé « non renseignée »', () => {
    expect(libelleAnnee(NaN)).toBe('Année de construction non renseignée');
    expect(libelleAnnee(Infinity)).toBe('Année de construction non renseignée');
  });
});

describe('libelleEtages', () => {
  // ⚠️ Test DÉDIÉ au 0 : décision Arno — « 0 étage » telle quelle, JAMAIS « non renseigné ».
  it('etages = 0 → « 0 étage » (singulier), et surtout PAS « non renseigné » (le 0 n’est pas avalé)', () => {
    expect(libelleEtages(0)).toBe('0 étage');
    expect(libelleEtages(0)).not.toBe('Nombre d’étages non renseigné');
  });

  it('etages = 1 → « 1 étage » (singulier)', () => {
    expect(libelleEtages(1)).toBe('1 étage');
  });

  it('etages = 5 → « 5 étages » (pluriel)', () => {
    expect(libelleEtages(5)).toBe('5 étages');
    expect(libelleEtages(2)).toBe('2 étages');
  });

  it('etages = null/undefined → « Nombre d’étages non renseigné », jamais un vide', () => {
    const attendu = 'Nombre d’étages non renseigné';
    expect(libelleEtages(null)).toBe(attendu);
    expect(libelleEtages(undefined)).toBe(attendu);
    expect(libelleEtages(null).length).toBeGreaterThan(0);
    expect(libelleEtages(null)).not.toBe('');
  });

  it('valeur non finie (NaN/Infinity) → « non renseigné » (jamais « NaN étage »)', () => {
    expect(libelleEtages(NaN)).toBe('Nombre d’étages non renseigné');
    expect(libelleEtages(Infinity)).toBe('Nombre d’étages non renseigné');
  });
});

describe('contenuBulleBatiment — 4 combinaisons année × étages', () => {
  it('les DEUX présents → deux lignes de valeur, aucune ligne d’absence', () => {
    const html = contenuBulleBatiment(1954, 5, 3, 1);
    expect(html).toContain('Construit en 1954');
    expect(html).toContain('5 étages');
    expect(html).not.toContain('non renseigné');
    // Année + étages + parcelle = 3 lignes (PARC-2 a ajouté la ligne de rattachement à la parcelle).
    expect((html.match(/svv-cur-bulle-l/g) ?? []).length).toBe(3);
  });

  it('année SEULE (étages absents) → « Construit en … » + « Nombre d’étages non renseigné »', () => {
    const html = contenuBulleBatiment(1954, null);
    expect(html).toContain('Construit en 1954');
    expect(html).toContain('Nombre d’étages non renseigné');
  });

  it('étages SEULS (année absente, y compris 0 étage) → « Année … non renseignée » + « 0 étage »', () => {
    const html = contenuBulleBatiment(null, 0);
    expect(html).toContain('Année de construction non renseignée');
    // Le 0 survit MÊME quand l’année manque (aucun court-circuit falsy global).
    expect(html).toContain('0 étage');
    expect(html).not.toContain('Nombre d’étages non renseigné');
  });

  it('AUCUN des deux → les deux lignes d’absence empilées (jamais un vide)', () => {
    const html = contenuBulleBatiment(null, null, 0, 0);
    expect(html).toContain('Année de construction non renseignée');
    expect(html).toContain('Nombre d’étages non renseigné');
    // Année + étages + parcelle = 3 lignes.
    expect((html.match(/svv-cur-bulle-l/g) ?? []).length).toBe(3);
  });

  it('role="status" (annonce lecteur d’écran) + classe de style, aucun jargon de source', () => {
    const html = contenuBulleBatiment(1954, 5);
    expect(html).toContain('role="status"');
    expect(html).toContain('class="svv-cur-bulle"');
    expect(html).not.toMatch(/BDNB|DGFiP|BD ?TOPO/i);
  });
});

describe('PARC-2 — libelleDossiersParcelle : rattachement à la PARCELLE (formulation NON NÉGOCIABLE)', () => {
  it('N > 0 → parle de « la parcelle de ce bâtiment », JAMAIS d’un permis DU bâtiment', () => {
    const txt = libelleDossiersParcelle(3, 1);
    expect(txt).toContain('parcelle de ce bâtiment');
    expect(txt).toContain('3 dossiers');
    expect(txt).toContain('1 permis de démolir');
    // 🔴 GARDE : jamais une affirmation attribuant le permis AU BÂTIMENT.
    expect(txt).not.toMatch(/ce bâtiment (a|possède|porte|est titulaire d).{0,4}(un )?permis/i);
    expect(txt.toLowerCase()).not.toContain('ce bâtiment a un permis');
  });
  it('pluriel/singulier corrects, PD omis quand 0', () => {
    expect(libelleDossiersParcelle(1, 0)).toBe('La parcelle de ce bâtiment est citée par 1 dossier');
    expect(libelleDossiersParcelle(2, 0)).toBe('La parcelle de ce bâtiment est citée par 2 dossiers');
    expect(libelleDossiersParcelle(5, 2)).toContain('(dont 2 permis de démolir)');
  });
  it('ABSENCE (0 dossier) → « aucun dossier RATTACHÉ à cette parcelle », JAMAIS « aucun permis » (négation absolue interdite)', () => {
    const txt = libelleDossiersParcelle(0, 0);
    expect(txt).toBe('Aucun dossier rattaché à cette parcelle');
    // 🔴 GARDE : la base ne prouve pas l’absence de permis → on ne l’affirme JAMAIS.
    expect(txt.toLowerCase()).not.toContain('aucun permis');
    expect(txt).toContain('rattaché'); // fait de rapprochement, pas affirmation métier
  });
  it('parcelle non chargée (null/undefined) → INDÉTERMINÉ, jamais une absence ni « aucun permis »', () => {
    for (const v of [null, undefined, NaN] as const) {
      const txt = libelleDossiersParcelle(v, v);
      expect(txt).toContain('non chargée');
      expect(txt.toLowerCase()).not.toContain('aucun dossier');
      expect(txt.toLowerCase()).not.toContain('aucun permis');
    }
  });
});

describe('PARC-2 — libelleParcellePartagee : la bulle DOIT dire quand la parcelle porte plusieurs bâtiments', () => {
  it('≥ 2 bâtiments → mise en garde explicite « ne désigne pas lequel »', () => {
    const txt = libelleParcellePartagee(3);
    expect(txt).toBe('Parcelle partagée par 3 bâtiments — le dossier ne désigne pas lequel est concerné');
  });
  it('0 ou 1 bâtiment → aucune mise en garde (null)', () => {
    expect(libelleParcellePartagee(1)).toBeNull();
    expect(libelleParcellePartagee(0)).toBeNull();
    expect(libelleParcellePartagee(null)).toBeNull();
  });
});

describe('PARC-2 — libellés à liste FERMÉE (jamais de libellé fabriqué)', () => {
  it('type PC/PD vérifié, autre → « Type inconnu »', () => {
    expect(libelleTypeDossier('PC')).toBe('Permis de construire');
    expect(libelleTypeDossier('PD')).toBe('Permis de démolir');
    expect(libelleTypeDossier('XX')).toBe('Type inconnu');
    expect(libelleTypeDossier(null)).toBe('Type inconnu');
  });
  it('etat_dau (dictionnaire SDES) vérifié, autre/null → « État non précisé »', () => {
    expect(libelleEtatDau('2')).toBe('Autorisé');
    expect(libelleEtatDau('4')).toBe('Annulé');
    expect(libelleEtatDau('5')).toBe('Commencé');
    expect(libelleEtatDau('6')).toBe('Terminé');
    expect(libelleEtatDau('1')).toBe('État non précisé'); // code nature ≠ etat_dau : jamais interprété
    expect(libelleEtatDau(null)).toBe('État non précisé');
  });
});

describe('PARC-2 — htmlDetailDossiers : liste + raccourci GED sans lien mort + aucune nature affichée', () => {
  const d = (o: Partial<Parameters<typeof htmlDetailDossiers>[0][number]>) => ({
    numDau: 'PC0750000', type: 'PC', dateAutorisation: '2019-06-01', etat: '2', gedPieces: [], ...o,
  });
  it('liste non vide → un item par dossier, type + num + date + état, JAMAIS la nature', () => {
    const html = htmlDetailDossiers([d({ numDau: 'PC075034', type: 'PC', dateAutorisation: '2019-06-01', etat: '2' })], 1);
    expect(html).toContain('Permis de construire PC075034');
    expect(html).toContain('2019-06-01');
    expect(html).toContain('Autorisé');
    expect(html).not.toMatch(/nature/i);
  });
  it('raccourci GED présent UNIQUEMENT si pièces réelles → jamais de lien mort', () => {
    const sans = htmlDetailDossiers([d({ gedPieces: [] })], 1);
    expect(sans).not.toContain('svv-cur-ged');
    const avec = htmlDetailDossiers([d({ gedPieces: [{ id: 7, nom: 'arrêté.pdf' }] })], 1);
    expect(avec).toContain('class="svv-cur-ged"');
    expect(avec).toContain('data-piece-id="7"');
    expect(avec).toContain('aria-hidden="true"'); // glyphe unicode, pas d’icône
  });
  it('parcelle partagée → la mise en garde figure dans le détail', () => {
    const html = htmlDetailDossiers([d({})], 3);
    expect(html).toContain('Parcelle partagée par 3 bâtiments');
  });
  it('liste vide → répète l’absence RATTACHÉE à la parcelle, jamais « aucun permis »', () => {
    const html = htmlDetailDossiers([], 1);
    expect(html).toContain('Aucun dossier rattaché à cette parcelle');
    expect(html.toLowerCase()).not.toContain('aucun permis');
  });
  it('échappement HTML des valeurs injectées (num_dau, nom de fichier) — aucune surface d’injection', () => {
    const html = htmlDetailDossiers([d({ numDau: 'PC<script>', gedPieces: [{ id: 1, nom: '"><img>' }] })], 1);
    expect(html).not.toContain('<script>');
    expect(html).toContain('PC&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img&gt;');
  });
});

describe('doitCreerAuDoubleClic (règle de conflit d’interaction — ACQUISE, doit survivre)', () => {
  it('mode bulle INACTIF → le double-clic crée un tag (comportement existant préservé)', () => {
    expect(doitCreerAuDoubleClic(false)).toBe(true);
  });

  it('mode bulle ACTIF → la création par double-clic est SUSPENDUE', () => {
    expect(doitCreerAuDoubleClic(true)).toBe(false);
  });
});
