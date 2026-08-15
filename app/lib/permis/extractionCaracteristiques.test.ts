import { describe, it, expect } from 'vitest';
import {
  cotesNgfDansTexte, niveauDeTexte, gabaritsDansTexte, sousSolsDansTexte, reperesDansTexte, normaliserNiveau, extraireCandidats,
} from './extractionCaracteristiques';
import type { ResultatLectureGed, PieceLue, PageTexte } from './lectureGed';

/**
 * N5-A — moteur d'extraction PUR (chaînes seulement, aucune base ni réseau). On éprouve chaque détecteur, les FAUX POSITIFS
 * écartés, l'association cote↔niveau (jamais devinée), le gabarit sans attribution à un corps, et la distinction « page sans
 * texte » vs « texte sans motif ».
 */
describe('N5-A — cotesNgfDansTexte : toutes les formes de cote', () => {
  it('capte NGF signé/non signé, virgule/point, N.G.F., espaces variables', () => {
    expect(cotesNgfDansTexte('NGF +84.24').map((c) => c.valeur)).toEqual([84.24]);
    expect(cotesNgfDansTexte('NGF 84,24').map((c) => c.valeur)).toEqual([84.24]);
    expect(cotesNgfDansTexte('N.G.F. +84.24').map((c) => c.valeur)).toEqual([84.24]);
    expect(cotesNgfDansTexte('N.G.F  +59,63').map((c) => c.valeur)).toEqual([59.63]);
    expect(cotesNgfDansTexte('cote NGF   +   53.50 au sol').map((c) => c.valeur)).toEqual([53.5]);
    expect(cotesNgfDansTexte('plusieurs : NGF +59.63 puis NGF +84.24').map((c) => c.valeur)).toEqual([59.63, 84.24]);
  });
  it('garde le TEXTE BRUT capté (traçabilité)', () => {
    expect(cotesNgfDansTexte('… NGF +84.24 …')[0].texteBrut).toContain('84.24');
  });
});

describe('N5-A — FAUX POSITIFS écartés (les cas que j’ai écartés)', () => {
  it('un PRIX, une DATE, une RÉFÉRENCE — sans « NGF » → NON captés', () => {
    expect(cotesNgfDansTexte('montant 84,24 € TTC')).toEqual([]);      // prix
    expect(cotesNgfDansTexte('déposé le 07.05.2024')).toEqual([]);     // date
    expect(cotesNgfDansTexte('dossier PC 075 120 25 V0035')).toEqual([]); // référence
    expect(cotesNgfDansTexte('surface 84.24 m²')).toEqual([]);         // surface (pas de NGF)
  });
  it('« NGF 2024 » (nombre hors plausibilité -50..500) → écarté (artefact, pas une cote)', () => {
    expect(cotesNgfDansTexte('réf NGF 2024')).toEqual([]);
    expect(cotesNgfDansTexte('NGF -999')).toEqual([]);
  });
});

describe('N5-A — niveauDeTexte : titre fiable, isolé unique, ambigu → null', () => {
  it('« PLAN DU NIVEAU R07 » → R07 ; « Plan du Rdc » → RDC ; « Niveau SS1 » → SS1', () => {
    expect(niveauDeTexte('PLAN DU NIVEAU R07 — cartouche')).toBe('R07');
    expect(niveauDeTexte('Plan du Rdc')).toBe('RDC');
    expect(niveauDeTexte('Niveau SS1 parking')).toBe('SS1');
  });
  it('label ISOLÉ unique (« SS1 » sans titre) → SS1 ; deux labels distincts → null (AMBIGU, non deviné)', () => {
    expect(niveauDeTexte('cote au SS1 uniquement')).toBe('SS1');
    expect(niveauDeTexte('report R06 vers R07')).toBeNull();                 // deux labels isolés → ambigu
    expect(niveauDeTexte('PLAN DU NIVEAU R07 PLAN DU NIVEAU R06')).toBeNull(); // deux titres → ambigu
    expect(niveauDeTexte('PLAN DU NIVEAU R07 (report R06 en gris)')).toBe('R07'); // un TITRE l'emporte sur un label isolé
    expect(niveauDeTexte('aucun niveau ici')).toBeNull();
  });
  it('normaliserNiveau : R7/R 07 → R07 ; R.D.C → RDC ; SS 1 → SS1', () => {
    expect(normaliserNiveau('R7')).toBe('R07');
    expect(normaliserNiveau('R.D.C')).toBe('RDC');
    expect(normaliserNiveau('SS 1')).toBe('SS1');
  });
});

describe('N5-A — gabaritsDansTexte : contexte « immeuble », AUCUNE attribution à un corps', () => {
  it('« deux immeubles R+5 à R+7 » → min 5 / max 7', () => {
    const g = gabaritsDansTexte('la construction de deux immeubles R+5 à R+7 sur 1 niveau de sous-sol');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ rMin: 5, rMax: 7 });
    expect(g[0].texteBrut).toContain('immeubles R+5 à R+7');
  });
  it('« immeuble R+7 » seul → min = max = 7', () => {
    expect(gabaritsDansTexte('un immeuble R+7')[0]).toMatchObject({ rMin: 7, rMax: 7 });
  });
  it('« R+2 » ISOLÉ (annotation de plan, sans « immeuble ») → PAS un gabarit', () => {
    expect(gabaritsDansTexte('report du plancher R+2 à +66.67')).toEqual([]);
  });
});

describe('N5-A — sous-sols et repères', () => {
  it('« 1 niveau de sous-sol », « Un niveau de sous-sol » → 1', () => {
    expect(sousSolsDansTexte('sur 1 niveau de sous-sol')[0].niveaux).toBe(1);
    expect(sousSolsDansTexte('Un niveau de sous-sol enterré')[0].niveaux).toBe(1);
    expect(sousSolsDansTexte('avec deux niveaux de sous-sol')[0].niveaux).toBe(2);
  });
  it('repère de corps dans un contexte « bâtiment/corps » (signal faible)', () => {
    expect(reperesDansTexte('BATIMENT 2D1 — cartouche').map((r) => r.repere)).toEqual(['2D1']);
    expect(reperesDansTexte('corps A1 et bâtiment 2D2').map((r) => r.repere)).toEqual(['A1', '2D2']);
  });
});

// ── extraireCandidats : orchestration + provenance + distinction des muettes ─────
const page = (n: number, texte: string): PageTexte => ({ page: n, texte, aTexte: texte.trim() !== '' });
const piece = (id: number, nom: string, pages: PageTexte[], muette = false, motif: string | null = null): PieceLue =>
  ({ id, nomFichier: nom, typeMime: 'application/pdf', nbPages: pages.length, pages, muette, motif });
const ged = (pieces: PieceLue[]): ResultatLectureGed => ({ dossierId: 1, pieces, bilan: { nbPieces: pieces.length, nbPages: 0, pagesAvecTexte: 0, pagesSansTexte: 0, piecesMuettes: 0 } });

describe('N5-A — extraireCandidats : provenance, cote↔niveau, cote max, muettes distinguées', () => {
  it('cote associée au niveau de sa page ; cote sur page sans niveau → niveau null (jamais deviné)', () => {
    const r = extraireCandidats(ged([
      piece(10, 'PC-R07.pdf', [page(1, 'PLAN DU NIVEAU R07 — NGF +84.24')]),
      piece(11, 'PC-sansniveau.pdf', [page(1, 'coupe : NGF +59.63 sans titre de niveau')]),
    ]));
    const r07 = r.cotes.find((c) => c.valeur === 84.24)!;
    expect(r07.niveau).toBe('R07');
    expect(r07.provenance).toMatchObject({ pieceId: 10, pieceNom: 'PC-R07.pdf', page: 1 });
    expect(r.cotes.find((c) => c.valeur === 59.63)!.niveau).toBeNull(); // niveau non deviné
  });

  it('la cote la plus HAUTE est la valeur réelle max, avec sa provenance', () => {
    const r = extraireCandidats(ged([piece(1, 'a.pdf', [page(1, 'NGF +10.00 NGF +99.90 NGF +42.00')])]));
    expect(r.bilan.coteMax).toMatchObject({ valeur: 99.9, provenance: { pieceNom: 'a.pdf' } });
  });

  it('bilan des niveaux reconnus (avec leurs cotes)', () => {
    const r = extraireCandidats(ged([piece(1, 'p.pdf', [page(1, 'PLAN DU NIVEAU R01 NGF +63.15'), page(2, 'PLAN DU NIVEAU R02 NGF +66.67')])]));
    const niveaux = Object.fromEntries(r.bilan.niveaux.map((n) => [n.niveau, n.cotes.map((c) => c.valeur)]));
    expect(niveaux).toMatchObject({ R01: [63.15], R02: [66.67] });
  });

  it('« pas de texte » (muette) DISTINCT de « texte présent sans motif reconnu »', () => {
    const r = extraireCandidats(ged([
      piece(1, 'scan.pdf', [], true, 'PDF sans couche texte'),          // muette → pas_de_texte
      piece(2, 'lettre.pdf', [page(1, 'Monsieur, veuillez agréer…')]),  // texte mais aucun motif
    ]));
    const m = Object.fromEntries(r.bilan.piecesSansCandidat.map((p) => [p.pieceNom, p.motif]));
    expect(m['scan.pdf']).toBe('pas_de_texte');
    expect(m['lettre.pdf']).toBe('texte_sans_motif');
  });

  it('gabarit rendu SANS attribution à un corps (aucun champ « corps » sur le candidat)', () => {
    const r = extraireCandidats(ged([piece(1, 'arrete.pdf', [page(1, 'deux immeubles R+5 à R+7')])]));
    expect(r.gabarits[0]).toMatchObject({ rMin: 5, rMax: 7 });
    expect('corps' in r.gabarits[0]).toBe(false);
  });
});
