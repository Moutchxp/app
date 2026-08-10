import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableArchives, PieceLien, AjoutDocument, libelleOrigineSatisfaction, MESSAGE_VIDE_ARCHIVES } from './ArchivesRendu';
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

const emailDeposee: PieceArchive = { id: 10, nomFichier: 'plan-de-masse.pdf', typeMime: 'application/pdf', tailleOctets: 12345, deposee: true, motifNonStocke: null, origine: 'email' };
const emailNonDeposee: PieceArchive = { id: 11, nomFichier: 'coupe.pdf', typeMime: 'application/pdf', tailleOctets: null, deposee: false, motifNonStocke: 'dépôt S3 non configuré', origine: 'email' };
const manuel: PieceArchive = { id: 20, nomFichier: 'note-interne.pdf', typeMime: 'application/pdf', tailleOctets: 999, deposee: true, motifNonStocke: null, origine: 'manuel' };

const ligne = (over: Partial<LigneArchive> = {}): LigneArchive => ({
  dossierId: 1, numDau: 'PC0750560001', codeInsee: '75056', communeNom: 'Paris',
  categorie: 'immeuble_neuf', libelleCategorie: 'Immeuble neuf', dateAutorisation: '2026-05-01',
  satisfaitLe: '2026-07-01', satisfaitPar: 'automatique', demandeReference: 'SVAV-DEM-2026-000042',
  pieces: [emailDeposee], ...over,
});
const rendu = (lignes: LigneArchive[]) => renderToStaticMarkup(createElement(TableArchives, { lignes, onTelecharger: () => {}, onSupprimer: () => {}, onFichier: () => {} }));

describe('A1a — TableArchives : état vide EXPLICITE', () => {
  it('aucune archive → message + explication (d’où viennent les lignes), jamais un tableau muet', () => {
    const h = rendu([]);
    expect(h).toContain(MESSAGE_VIDE_ARCHIVES);
    expect(h).toContain('Réponses');
    expect(h).not.toContain('<table');
  });
});

describe('A1a — TableArchives : colonnes orientées PERMIS', () => {
  it('rend N° Sitadel · Commune · Type · Autorisation · Satisfaction · Origine · Demande · Pièces', () => {
    const h = rendu([ligne()]);
    for (const c of ['N° Sitadel', 'Commune', 'Type', 'Autorisation', 'Satisfaction', 'Origine', 'Demande', 'Pièces']) expect(h).toContain(c);
    expect(h).toContain('PC0750560001');
    expect(h).toContain('Immeuble neuf');        // type via classer (source unique)
    expect(h).toContain('SVAV-DEM-2026-000042');
    expect(h).toContain('automatique');
  });

  it('conteneur défilant a11y (mobile) + contrôle d’ajout de document par ligne', () => {
    const h = rendu([ligne()]);
    expect(h).toContain('role="region"');
    expect(h).toContain('tabindex="0"');
    expect(h).toContain('type="file"');          // A1b : ajout à la main disponible sur la ligne
    expect(h).toContain('ajouter un document');
  });
});

describe('A1b — pièces : origine visible, e-mail non supprimable, manuel supprimable', () => {
  it('les DEUX origines s’affichent DISTINCTEMENT sur une même ligne', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })]);
    expect(h).toContain('reçue par e-mail');
    expect(h).toContain('ajoutée à la main');
    expect(h).toContain('plan-de-masse.pdf');
    expect(h).toContain('note-interne.pdf');
  });

  it('un document MANUEL a un bouton « supprimer » ; une pièce E-MAIL n’en a PAS', () => {
    const hManuel = renderToStaticMarkup(createElement(PieceLien, { piece: manuel, onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(hManuel).toContain('supprimer');
    const hEmail = renderToStaticMarkup(createElement(PieceLien, { piece: emailDeposee, onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(hEmail).not.toContain('supprimer');
  });

  it('pièce DÉPOSÉE → bouton de téléchargement (nom du fichier), jamais la clé', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: emailDeposee, onTelecharger: () => {} }));
    expect(h).toContain('<button');
    expect(h).toContain('plan-de-masse.pdf');
    expect(h).not.toContain('demandes/');
    expect(h).not.toContain('dossiers/');
    expect(h).not.toContain('cle_stockage');
  });

  it('pièce NON déposée → son MOTIF, jamais de bouton de téléchargement', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: emailNonDeposee, onTelecharger: () => {} }));
    expect(h).toContain('non déposée');
    expect(h).toContain('dépôt S3 non configuré');
    expect(h).not.toContain('↓');
  });

  it('permis renseigné SANS aucune pièce → « aucune pièce » (le dossier apparaît quand même)', () => {
    const h = rendu([ligne({ pieces: [] })]);
    expect(h).toContain('PC0750560001');
    expect(h).toContain('aucune pièce');
  });

  it('la CLÉ de stockage est ABSENTE du HTML (données = booléen + id, jamais la clé)', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })]);
    expect(h).not.toContain('dossiers/75056');
    expect(h).not.toContain('cle_stockage');
  });
});

describe('A1b — AjoutDocument', () => {
  it('rend un champ fichier accessible (input file + aria-label), SANS attribut accept (whitelist = serveur)', () => {
    const h = renderToStaticMarkup(createElement(AjoutDocument, { dossierId: 7, onFichier: () => {} }));
    expect(h).toContain('type="file"');
    expect(h).toContain('aria-label="Ajouter un document au permis 7"');
    expect(h).not.toContain('accept='); // pas de copie de la whitelist côté client
  });

  it('en cours d’envoi → input désactivé, libellé « Envoi… »', () => {
    const h = renderToStaticMarkup(createElement(AjoutDocument, { dossierId: 7, onFichier: () => {}, enCours: true }));
    expect(h).toContain('disabled');
    expect(h).toContain('Envoi');
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
