import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableArchives, PieceLien, AjoutDocument, libelleOrigineSatisfaction, labelNbPieces, MESSAGE_VIDE_ARCHIVES, etatArchive, BadgeEtatArchive, type EtatArchive } from './ArchivesRendu';
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

const emailDeposee: PieceArchive = { id: 10, nomFichier: 'plan-de-masse.pdf', typeMime: 'application/pdf', tailleOctets: 12345, deposee: true, motifNonStocke: null, origine: 'email', recuLe: '2026-07-01', objet: 'Réponse à votre demande de communication' };
const emailNonDeposee: PieceArchive = { id: 11, nomFichier: 'coupe.pdf', typeMime: 'application/pdf', tailleOctets: null, deposee: false, motifNonStocke: 'dépôt S3 non configuré', origine: 'email', recuLe: '2026-07-01', objet: 'Réponse à votre demande de communication' };
const manuel: PieceArchive = { id: 20, nomFichier: 'note-interne.pdf', typeMime: 'application/pdf', tailleOctets: 999, deposee: true, motifNonStocke: null, origine: 'manuel', recuLe: null, objet: null };
const fiche: PieceArchive = { id: 30, nomFichier: 'Fiche de synthèse du permis.pdf', typeMime: 'application/pdf', tailleOctets: 5000, deposee: true, motifNonStocke: null, origine: 'genere', recuLe: null, objet: null };

const MAINTENANT = new Date('2026-07-10T12:00:00Z'); // < 2 mois après satisfait_le 2026-07-01, avant le délai (recu_le + 7 j)
const ligne = (over: Partial<LigneArchive> = {}): LigneArchive => ({
  dossierId: 1, numDau: 'PC0750560001', codeInsee: '75056', communeNom: 'Paris',
  categorie: 'immeuble_neuf', libelleCategorie: 'Immeuble neuf', dateAutorisation: '2026-05-01',
  satisfaitLe: '2026-07-01', satisfaitPar: 'automatique', demandeReference: 'SVAV-DEM-2026-000042',
  recuLe: '2026-07-01', expireLeCapte: null, aLienFort: false,
  pieces: [emailDeposee], ...over,
});
// N1-C — par défaut on rend la 1ʳᵉ ligne DÉPLOYÉE (dossierOuvert = son id) : les pièces vivent désormais dans le panneau déplié,
// donc les tests de CONTRAT des pièces (T5, sécurité, origines) doivent ouvrir la ligne pour les voir. `dossierOuvert=null` teste le repli.
const rendu = (lignes: LigneArchive[], maintenant: Date = MAINTENANT, dossierOuvert: number | null = lignes[0]?.dossierId ?? null) =>
  renderToStaticMarkup(createElement(TableArchives, { lignes, maintenant, dossierOuvert, onDeplier: () => {}, onTelecharger: () => {}, onSupprimer: () => {}, onFichier: () => {} }));

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

describe('N1-B — fiche de synthèse générée (origine « genere »)', () => {
  it('affichée EN PREMIER dans les pièces, AVANT les pièces reçues par e-mail', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, fiche] })]);
    expect(h).toContain('Fiche de synthèse du permis.pdf');
    expect(h).toContain('fiche de synthèse');                     // pastille distinctive
    // la fiche apparaît avant la pièce e-mail dans le HTML (rendue en tête)
    expect(h.indexOf('Fiche de synthèse du permis.pdf')).toBeLessThan(h.indexOf('plan-de-masse.pdf'));
  });

  it('NON supprimable à la main (aucun bouton « supprimer » sur la fiche générée)', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: fiche, onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(h).toContain('fiche de synthèse');
    expect(h).not.toContain('supprimer'); // se régénère → jamais supprimable
    expect(h).toContain('↓');             // mais téléchargeable
  });

  it('la CLÉ de stockage n’apparaît jamais pour une fiche générée non plus', () => {
    const h = rendu([ligne({ pieces: [fiche] })]);
    expect(h).not.toMatch(/cle_stockage|dossiers\/93/i);
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

describe('N1-C — repli des pièces par permis (disclosure natif)', () => {
  it('label du compte : « 1 pièce » (singulier) · « 13 pièces » (pluriel) · « aucune pièce » (zéro, jamais muet)', () => {
    expect(labelNbPieces(1)).toBe('1 pièce');
    expect(labelNbPieces(13)).toBe('13 pièces');
    expect(labelNbPieces(0)).toBe('aucune pièce');
  });

  it('ligne REPLIÉE (défaut) : compte + état visibles, mais AUCUNE pièce ni ajout de document rendus', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })], MAINTENANT, null);
    expect(h).toContain('2 pièces');              // U6 : le chiffre porté par la ligne repliée
    expect(h).toContain('obtenu');                // état G2 conservé sur la ligne repliée (pièce manuelle = obtenu)
    expect(h).toContain('aria-expanded="false"'); // disclosure fermé
    expect(h).toContain('Déplier');
    expect(h).not.toContain('plan-de-masse.pdf'); // pièces masquées tant que replié
    expect(h).not.toContain('note-interne.pdf');
    expect(h).not.toContain('type="file"');       // l'ajout de document est dans le panneau → masqué aussi
  });

  it('ligne DÉPLOYÉE : panneau <td id> ciblé par aria-controls, pièces + ajout présents, bouton « Fermer »', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })], MAINTENANT, 1);
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('aria-controls="archive-pieces-1"');
    expect(h).toContain('id="archive-pieces-1"');
    expect(h).toContain('Fermer');
    expect(h).toContain('plan-de-masse.pdf');
    expect(h).toContain('note-interne.pdf');
    expect(h).toContain('type="file"');           // ajout à la main dans le panneau déployé
  });

  it('G2 — la couleur d’état de la ligne reste présente, REPLIÉE comme DÉPLOYÉE', () => {
    const l = ligne({ pieces: [emailDeposee] });
    const t = new Date('2026-07-15T12:00:00Z'); // délai dépassé (recu + 7 j), < 2 mois → rouge
    expect(rendu([l], t, null)).toContain('var(--color-svv-red)'); // repliée
    expect(rendu([l], t, 1)).toContain('var(--color-svv-red)');    // déployée
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

describe('T5 — CellulePieces : pièces e-mail groupées par réponse (étiquette date + objet)', () => {
  it('deux réponses porteuses → deux étiquettes « reçues le JJ/MM — objet » ; boutons de téléchargement des pièces stockées', () => {
    const pieces: PieceArchive[] = [
      { id: 500, nomFichier: 'plan.pdf', typeMime: 'application/pdf', tailleOctets: 1000, deposee: true, motifNonStocke: null, origine: 'email', recuLe: '2026-08-12', objet: 'Envoi des pièces' },
      { id: 490, nomFichier: 'arrete.pdf', typeMime: 'application/pdf', tailleOctets: 2000, deposee: true, motifNonStocke: null, origine: 'email', recuLe: '2026-08-05', objet: 'Première réponse' },
    ];
    const h = rendu([ligne({ pieces })]);
    expect(h).toContain('reçues le 12/08 — Envoi des pièces');
    expect(h).toContain('reçues le 05/08 — Première réponse');
    expect(h).toContain('plan.pdf');
    expect(h).toContain('arrete.pdf');
  });

  it('pièce e-mail NON déposée → motif, aucun bouton (non-régression du contrat) ; pièce déposée → bouton (non-régression auto)', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, emailNonDeposee] })]);
    expect(h).toContain('plan-de-masse.pdf');            // déposée → téléchargeable (non-régression)
    expect(h).toContain('coupe.pdf');
    expect(h).toContain('non déposée : dépôt S3 non configuré'); // motif rendu
  });

  it('SÉCURITÉ : la clé de stockage n’apparaît jamais dans le rendu Archives', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })]);
    expect(h).not.toMatch(/cle_stockage|entrantes\//i);
  });
});
