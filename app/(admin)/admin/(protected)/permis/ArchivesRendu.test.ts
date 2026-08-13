import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableArchives, PieceLien, AjoutDocument, libelleOrigineSatisfaction, MESSAGE_VIDE_ARCHIVES, etatArchive, BadgeEtatArchive, type EtatArchive } from './ArchivesRendu';
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

const emailDeposee: PieceArchive = { id: 10, nomFichier: 'plan-de-masse.pdf', typeMime: 'application/pdf', tailleOctets: 12345, deposee: true, motifNonStocke: null, origine: 'email' };
const emailNonDeposee: PieceArchive = { id: 11, nomFichier: 'coupe.pdf', typeMime: 'application/pdf', tailleOctets: null, deposee: false, motifNonStocke: 'dépôt S3 non configuré', origine: 'email' };
const manuel: PieceArchive = { id: 20, nomFichier: 'note-interne.pdf', typeMime: 'application/pdf', tailleOctets: 999, deposee: true, motifNonStocke: null, origine: 'manuel' };

const MAINTENANT = new Date('2026-07-10T12:00:00Z'); // < 2 mois après satisfait_le 2026-07-01, avant le délai (recu_le + 7 j)
const ligne = (over: Partial<LigneArchive> = {}): LigneArchive => ({
  dossierId: 1, numDau: 'PC0750560001', codeInsee: '75056', communeNom: 'Paris',
  categorie: 'immeuble_neuf', libelleCategorie: 'Immeuble neuf', dateAutorisation: '2026-05-01',
  satisfaitLe: '2026-07-01', satisfaitPar: 'automatique', demandeReference: 'SVAV-DEM-2026-000042',
  recuLe: '2026-07-01', expireLeCapte: null, aLienFort: false,
  pieces: [emailDeposee], ...over,
});
const rendu = (lignes: LigneArchive[], maintenant: Date = MAINTENANT) => renderToStaticMarkup(createElement(TableArchives, { lignes, maintenant, onTelecharger: () => {}, onSupprimer: () => {}, onFichier: () => {} }));

describe('A1a — TableArchives : état vide EXPLICITE', () => {
  it('aucune archive → message + explication (d’où viennent les lignes), jamais un tableau muet', () => {
    const h = rendu([]);
    expect(h).toContain(MESSAGE_VIDE_ARCHIVES);
    expect(h).toContain('Réponses');
    expect(h).not.toContain('<table');
  });
});

describe('A1a — TableArchives : colonnes orientées PERMIS', () => {
  it('rend N° permis · Commune · Type · Autorisation · Satisfaction · Origine · Demande · Pièces', () => {
    const h = rendu([ligne()]);
    for (const c of ['N° permis', 'Commune', 'Type', 'Autorisation', 'Satisfaction', 'Origine', 'Demande', 'Pièces']) expect(h).toContain(c);
    expect(h).not.toContain('N° Sitadel'); // T6-B : libellé harmonisé (« N° Sitadel » → « N° permis »)
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

  it('permis renseigné SANS pièce → « aucun document attaché » (jamais une archive vide muette ; le dossier apparaît quand même)', () => {
    const h = rendu([ligne({ pieces: [] })]);
    expect(h).toContain('PC0750560001');
    expect(h).toContain('aucun document attaché');
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

describe('G2 — etatArchive : 5 états (mot + couleur), 2 mois, exception « versement oublié »', () => {
  const RECENT = new Date('2026-07-10T12:00:00Z');    // < 2 mois après 2026-07-01, avant délai (recu+7 j = 08/07 déjà passé → dépassé)
  const AVANT_DELAI = new Date('2026-07-05T12:00:00Z'); // avant recu+7 j
  const VIEUX = new Date('2026-10-01T12:00:00Z');     // > 2 mois après 2026-07-01

  it('OBTENU (vert) : une pièce manuelle (= dossier_document en GED)', () => {
    const e = etatArchive(ligne({ pieces: [emailDeposee, manuel] }), RECENT);
    expect(e).toMatchObject({ cle: 'obtenu', mot: 'obtenu', couleurLigne: 'var(--color-svv-green-ink)' });
  });

  it('EN ATTENTE (orange) : contenu e-mail non classé, délai NON dépassé', () => {
    const e = etatArchive(ligne({ pieces: [emailDeposee] }), AVANT_DELAI);
    expect(e).toMatchObject({ cle: 'attente', mot: 'en attente', couleurLigne: '#8a5a00' });
  });

  it('DÉLAI DÉPASSÉ (rouge) : contenu non classé, délai G1 (recu + 7 j) passé, < 2 mois', () => {
    const e = etatArchive(ligne({ recuLe: '2026-07-01', pieces: [emailDeposee] }), RECENT); // 10/07 > 08/07
    expect(e).toMatchObject({ cle: 'depasse', mot: 'délai dépassé', couleurLigne: 'var(--color-svv-red)' });
  });

  it('lien fort non classé → même logique de délai (aLienFort compte comme un contenu)', () => {
    const e = etatArchive(ligne({ pieces: [], aLienFort: true, recuLe: '2026-07-01', expireLeCapte: '2026-07-17' }), AVANT_DELAI);
    expect(e.cle).toBe('attente'); // expiration L1 17/07 > 05/07
    expect(etatArchive(ligne({ pieces: [], aLienFort: true, recuLe: '2026-07-01', expireLeCapte: '2026-07-04' }), AVANT_DELAI).cle).toBe('depasse');
  });

  it('SANS CONTENU REÇU (neutre) : satisfait à la main, aucune pièce, aucun lien → JAMAIS rouge', () => {
    const e = etatArchive(ligne({ satisfaitPar: 'manuel', recuLe: null, expireLeCapte: null, aLienFort: false, pieces: [] }), VIEUX);
    expect(e).toMatchObject({ cle: 'sans_contenu', mot: 'sans contenu reçu', couleurLigne: null, couleurPieces: null });
    expect(e.couleurPieces).not.toBe('var(--color-svv-red)'); // jamais rouge, même vieux
  });

  it('> 2 mois AVEC documents (classé) → NEUTRE (ligne et pièces sans couleur), mot « obtenu »', () => {
    const e = etatArchive(ligne({ pieces: [manuel] }), VIEUX);
    expect(e).toMatchObject({ cle: 'obtenu', mot: 'obtenu', couleurLigne: null, couleurPieces: null });
  });

  it('> 2 mois SANS documents mais contenu reçu → ligne NEUTRE, colonne Pièces ROUGE « versement oublié »', () => {
    const e = etatArchive(ligne({ pieces: [emailDeposee] }), VIEUX);
    expect(e).toMatchObject({ cle: 'versement_oublie', mot: 'versement oublié', couleurLigne: null, couleurPieces: 'var(--color-svv-red)' });
  });
});

describe('G2 — rendu : le MOT est TOUJOURS présent (lisible en noir et blanc) + la couleur en appui', () => {
  it('BadgeEtatArchive rend le mot ; TableArchives colore la ligne et pose le mot dans la colonne Pièces', () => {
    const etat: EtatArchive = { cle: 'depasse', mot: 'délai dépassé', couleurLigne: 'var(--color-svv-red)', couleurPieces: 'var(--color-svv-red)' };
    expect(renderToStaticMarkup(createElement(BadgeEtatArchive, { etat }))).toContain('délai dépassé');
    // ligne « délai dépassé » : mot + couleur rouge présents ; ligne « versement oublié » (>2 mois) : mot présent, ligne neutre
    const hDepasse = rendu([ligne({ pieces: [emailDeposee] })], new Date('2026-07-15T12:00:00Z'));
    expect(hDepasse).toContain('délai dépassé');
    expect(hDepasse).toContain('var(--color-svv-red)');
    const hOubli = rendu([ligne({ pieces: [emailDeposee] })], new Date('2026-10-01T12:00:00Z'));
    expect(hOubli).toContain('versement oublié');
  });
});
