import { describe, it, expect } from 'vitest';
import { estPieceCerfaPc, trouverCerfaPc } from './identifierCerfa';
import type { ResultatLectureGed, PieceGedMeta } from './lectureGed';

describe('LECT-1 (A) — estPieceCerfaPc : reconnaître le Cerfa PC par son contenu', () => {
  it('en-tête réel « N° 13409*14 CERFA Demande de Permis » → reconnu', () => {
    expect(estPieceCerfaPc(['1 / 23  N°   13409*14  CERFA  Demande de Permis de construire'])).toBe(true);
  });
  it('autre version, n° espacé, « permis de construire » sans le mot « cerfa » → reconnu (générique)', () => {
    expect(estPieceCerfaPc(['N° 13 409*07', 'Demande de permis de construire — identité du demandeur'])).toBe(true);
  });
  it('NOTICE citant un AUTRE formulaire (13407 = déclaration d’ouverture) → NON reconnu', () => {
    expect(estPieceCerfaPc(['Déclaration d’ouverture de chantier (Cerfa n° 13407) à déposer en mairie'])).toBe(false);
  });
  it('démolir (13405) / DP (13406) cités dans une notice → NON reconnus', () => {
    expect(estPieceCerfaPc(['permis de démolir (cerfa n° 13405) doit être joint'])).toBe(false);
    expect(estPieceCerfaPc(['formulaire spécifique cerfa n° 13406'])).toBe(false);
  });
  it('« 13409 » SANS contexte cerfa/permis (référence perdue) → NON reconnu (anti-faux-positif)', () => {
    expect(estPieceCerfaPc(['réf interne 13409 du dossier comptable'])).toBe(false);
  });
  it('aucun marqueur → non reconnu', () => {
    expect(estPieceCerfaPc(['Avis favorable de l’ABF du 30 mai 2025', null, undefined])).toBe(false);
  });
});

describe('LECT-1 (A) — trouverCerfaPc : apparie par id, renvoie la clé de stockage', () => {
  const ged = (pieces: { id: number; nomFichier: string; texte: string }[]): ResultatLectureGed =>
    ({ pieces: pieces.map((p) => ({ id: p.id, nomFichier: p.nomFichier, typeMime: 'application/pdf', nbPages: 1, pages: [{ page: 1, texte: p.texte, aTexte: true }], muette: false, motif: null })) } as unknown as ResultatLectureGed);
  const metas = (ids: number[]): PieceGedMeta[] => ids.map((id) => ({ id, nomFichier: `f${id}`, typeMime: 'application/pdf', cleStockage: `k${id}` } as unknown as PieceGedMeta));

  it('trouve le Cerfa parmi plusieurs pièces (une notice cite 13407) et renvoie SA méta', () => {
    const g = ged([
      { id: 10, nomFichier: 'f10', texte: 'notice cerfa 13407 déclaration d’ouverture' },
      { id: 11, nomFichier: 'f11', texte: 'N° 13409*14 CERFA Demande de Permis de construire' },
    ]);
    expect(trouverCerfaPc(g, metas([10, 11]))).toMatchObject({ id: 11, cleStockage: 'k11' });
  });
  it('aucun Cerfa identifié → null', () => {
    expect(trouverCerfaPc(ged([{ id: 10, nomFichier: 'f10', texte: 'avis ABF favorable' }]), metas([10]))).toBeNull();
  });
});
