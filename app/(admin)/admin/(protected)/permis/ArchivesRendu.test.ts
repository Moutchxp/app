import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableArchives, PieceLien, libelleOrigineSatisfaction, MESSAGE_VIDE_ARCHIVES } from './ArchivesRendu';
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

const pieceDeposee: PieceArchive = { id: 10, nomFichier: 'plan-de-masse.pdf', typeMime: 'application/pdf', tailleOctets: 12345, deposee: true, motifNonStocke: null };
const pieceNonDeposee: PieceArchive = { id: 11, nomFichier: 'coupe.pdf', typeMime: 'application/pdf', tailleOctets: null, deposee: false, motifNonStocke: 'dépôt S3 non configuré' };

const ligne = (over: Partial<LigneArchive> = {}): LigneArchive => ({
  dossierId: 1, numDau: 'PC0750560001', codeInsee: '75056', communeNom: 'Paris',
  categorie: 'immeuble_neuf', libelleCategorie: 'Immeuble neuf', dateAutorisation: '2026-05-01',
  satisfaitLe: '2026-07-01', satisfaitPar: 'automatique', demandeReference: 'SVAV-DEM-2026-000042',
  pieces: [pieceDeposee], ...over,
});
const rendu = (lignes: LigneArchive[]) => renderToStaticMarkup(createElement(TableArchives, { lignes, onTelecharger: () => {} }));

describe('A1a — TableArchives : état vide EXPLICITE', () => {
  it('aucune archive → message + explication (d’où viennent les lignes), jamais un tableau muet', () => {
    const h = rendu([]);
    expect(h).toContain(MESSAGE_VIDE_ARCHIVES);
    expect(h).toContain('Réponses');     // dit d'où viendront les lignes
    expect(h).not.toContain('<table');   // pas de tableau vide
  });
});

describe('A1a — TableArchives : colonnes orientées PERMIS', () => {
  it('rend N° Sitadel · Commune · Type · Autorisation · Satisfaction · Origine · Demande · Pièces', () => {
    const h = rendu([ligne()]);
    for (const c of ['N° Sitadel', 'Commune', 'Type', 'Autorisation', 'Satisfaction', 'Origine', 'Demande', 'Pièces']) expect(h).toContain(c);
    expect(h).toContain('PC0750560001');
    expect(h).toContain('Paris');
    expect(h).toContain('Immeuble neuf');        // type via classer (libellé source unique)
    expect(h).toContain('SVAV-DEM-2026-000042'); // référence de la demande d'origine
    expect(h).toContain('automatique');          // origine du marquage
  });

  it('conteneur défilant a11y (mobile)', () => {
    const h = rendu([ligne()]);
    expect(h).toContain('role="region"');
    expect(h).toContain('tabindex="0"');
  });
});

describe('A1a — pièces : téléchargeable, motif, ou aucune ; la clé ne fuit jamais', () => {
  it('pièce DÉPOSÉE → bouton de téléchargement (nom du fichier), jamais la clé', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: pieceDeposee, onTelecharger: () => {} }));
    expect(h).toContain('<button');
    expect(h).toContain('plan-de-masse.pdf');
    expect(h).not.toContain('demandes/');     // aucun préfixe de clé S3 dans le HTML
    expect(h).not.toContain('cle_stockage');
  });

  it('pièce NON déposée → son MOTIF, jamais un bouton mort', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: pieceNonDeposee, onTelecharger: () => {} }));
    expect(h).not.toContain('<button');
    expect(h).toContain('non déposée');
    expect(h).toContain('dépôt S3 non configuré'); // le motif
  });

  it('permis renseigné SANS aucune pièce → « aucune pièce » (le dossier apparaît quand même)', () => {
    const h = rendu([ligne({ pieces: [] })]);
    expect(h).toContain('PC0750560001'); // la ligne EST là
    expect(h).toContain('aucune pièce');
  });

  it('la CLÉ de stockage est ABSENTE du HTML (données = booléen + id, jamais la clé)', () => {
    const h = rendu([ligne({ pieces: [pieceDeposee, pieceNonDeposee] })]);
    expect(h).not.toContain('demandes/75056'); // le schéma de clé n'apparaît pas
    expect(h).not.toContain('cle_stockage');
  });
});

describe('A1a — libelleOrigineSatisfaction', () => {
  it('automatique / manuel / inconnu → jamais muet', () => {
    expect(libelleOrigineSatisfaction('automatique')).toBe('automatique');
    expect(libelleOrigineSatisfaction('manuel')).toBe('manuel');
    expect(libelleOrigineSatisfaction(null)).toBe('—');
    expect(libelleOrigineSatisfaction('bizarre')).toBe('—');
  });
});
