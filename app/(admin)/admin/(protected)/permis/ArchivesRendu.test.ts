import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableArchives, PieceLien, CellulePieces, AjoutDocument, categoriePiece, libelleOrigineSatisfaction, labelNbPieces, MESSAGE_VIDE_ARCHIVES, etatArchive, BadgeEtatArchive, type EtatArchive } from './ArchivesRendu';
import { BLEU_SOURCE } from './CaracteristiquesRendu'; // N10 : le bleu partagé des pièces sources
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

const emailDeposee: PieceArchive = { id: 10, nomFichier: 'plan-de-masse.pdf', typeMime: 'application/pdf', tailleOctets: 12345, deposee: true, motifNonStocke: null, origine: 'email', recuLe: '2026-07-01', objet: 'Réponse à votre demande de communication' };
const emailNonDeposee: PieceArchive = { id: 11, nomFichier: 'coupe.pdf', typeMime: 'application/pdf', tailleOctets: null, deposee: false, motifNonStocke: 'dépôt S3 non configuré', origine: 'email', recuLe: '2026-07-01', objet: 'Réponse à votre demande de communication' };
const manuel: PieceArchive = { id: 20, nomFichier: 'note-interne.pdf', typeMime: 'application/pdf', tailleOctets: 999, deposee: true, motifNonStocke: null, origine: 'manuel', recuLe: null, objet: null };
const fiche: PieceArchive = { id: 30, nomFichier: 'Fiche de synthèse du permis.pdf', typeMime: 'application/pdf', tailleOctets: 5000, deposee: true, motifNonStocke: null, origine: 'genere', recuLe: null, objet: null };
const auto: PieceArchive = { id: 40, nomFichier: 'arrete-PC.pdf', typeMime: 'application/pdf', tailleOctets: 3000, deposee: true, motifNonStocke: null, origine: 'auto', recuLe: null, objet: null, deposePar: 'a.jorel@sansvisavis.com' };

const MAINTENANT = new Date('2026-07-10T12:00:00Z'); // < 2 mois après satisfait_le 2026-07-01, avant le délai (recu_le + 7 j)
const ligne = (over: Partial<LigneArchive> = {}): LigneArchive => ({
  dossierId: 1, numDau: 'PC0750560001', codeInsee: '75056', communeNom: 'Paris',
  categorie: 'immeuble_neuf', libelleCategorie: 'Immeuble neuf', dateAutorisation: '2026-05-01',
  satisfaitLe: '2026-07-01', satisfaitPar: 'automatique', demandeReference: 'SVAV-DEM-2026-000042',
  recuLe: '2026-07-01', expireLeCapte: null, aLienFort: false,
  pieces: [emailDeposee], sourcesNonResolues: [], completudeIncomplete: false,
  completudeNonVide: false, historiqueNonVide: false, batimentsNonVide: false, // UNIF-3 : signaux « non vide » (défaut vide → familles si-non-vide absentes)
  ...over,
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

  it('conteneur défilant a11y (mobile)', () => {
    const h = rendu([ligne()]);
    expect(h).toContain('role="region"');
    expect(h).toContain('tabindex="0"');
  });

  // UNIF-3b — l'ajout de document vit dans la famille « Pièces » du détail, REPLIÉE par défaut (uniformité stricte) : son contenu
  //   est lazy (monté au dépliage). Le geste se teste donc sur le composant, pas via le HTML de la ligne repliée.
  it('contrôle d’ajout de document par permis (composant AjoutDocument)', () => {
    const h = renderToStaticMarkup(createElement(AjoutDocument, { dossierId: 1, onFichier: () => {} }));
    expect(h).toContain('type="file"');          // A1b : ajout à la main disponible
    expect(h).toContain('ajouter un document');
  });
});

describe('A1b — pièces : origine visible, e-mail non supprimable, manuel supprimable', () => {
  // UNIF-3b — contenu des pièces = famille repliée (lazy). Le contrat des DEUX origines se teste sur CellulePieces (le composant rendu au dépliage).
  it('les DEUX origines s’affichent DISTINCTEMENT (CellulePieces)', () => {
    const h = renderToStaticMarkup(createElement(CellulePieces, { pieces: [emailDeposee, manuel], onTelecharger: () => {}, onSupprimer: () => {} }));
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

  it('permis renseigné SANS pièce → la ligne apparaît quand même (le dossier n’est jamais masqué)', () => {
    expect(rendu([ligne({ pieces: [] })])).toContain('PC0750560001');
  });
  // UNIF-3b — « aucun document attaché » est le vide de la famille Pièces (lazy) → testé sur CellulePieces, jamais une archive muette.
  it('permis SANS pièce → CellulePieces dit « aucun document attaché » (jamais muet)', () => {
    expect(renderToStaticMarkup(createElement(CellulePieces, { pieces: [], onTelecharger: () => {}, onSupprimer: () => {} }))).toContain('aucun document attaché');
  });

  it('la CLÉ de stockage est ABSENTE du HTML (données = booléen + id, jamais la clé)', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })]);
    expect(h).not.toContain('dossiers/75056');
    expect(h).not.toContain('cle_stockage');
  });
});

describe('N3-C / UNIF-3b — famille « Caractéristiques » dans l’encart déplié (facultative, repliée)', () => {
  it('slot ABSENT → la famille Caractéristiques n’apparaît pas ; la famille Pièces (remplissable) reste là', () => {
    const h = rendu([ligne()]); // pas de slotCaracteristiques
    expect(h).toContain('Pièces du permis');            // famille remplissable toujours présente (titre replié)
    expect(h).not.toContain('Caractéristiques du permis'); // slot absent → aucune famille Caractéristiques
    expect(h).not.toContain('data-caract'); // rien d'injecté (et de toute façon lazy)
  });
  it('N3-D — slot FOURNI + ligne DÉPLIÉE → la famille Caractéristiques précède la famille Pièces (contenu métier d’abord)', () => {
    const h = renderToStaticMarkup(createElement(TableArchives, {
      lignes: [ligne()], maintenant: MAINTENANT, dossierOuvert: 1,
      onDeplier: () => {}, onTelecharger: () => {}, onSupprimer: () => {}, onFichier: () => {},
      slotCaracteristiques: (id: number) => createElement('span', { 'data-caract': id }, `caract-${id}`),
    }));
    // UNIF-3b — les deux familles sont REPLIÉES : on prouve l'ORDRE canonique (Caractéristiques avant Pièces), pas le contenu (lazy).
    expect(h).toContain('Caractéristiques du permis');
    expect(h.indexOf('Caractéristiques du permis')).toBeLessThan(h.indexOf('Pièces du permis'));
    expect(h).not.toContain('data-caract'); // contenu monté seulement au dépliage de la famille
  });
  it('slot FOURNI mais ligne REPLIÉE → aucune famille rendue (le panneau n’est pas rendu du tout)', () => {
    const h = renderToStaticMarkup(createElement(TableArchives, {
      lignes: [ligne()], maintenant: MAINTENANT, dossierOuvert: null,
      onDeplier: () => {}, onTelecharger: () => {}, onSupprimer: () => {}, onFichier: () => {},
      slotCaracteristiques: (id: number) => createElement('span', { 'data-caract': id }, `caract-${id}`),
    }));
    expect(h).not.toContain('caract-1');
    expect(h).not.toContain('Caractéristiques du permis'); // panneau non rendu → aucun titre de famille
  });
});

describe('N3-D — categoriePiece (PURE) : classement par nom de fichier, inconnu → « autres »', () => {
  it('plans : « PC<chiffre> » et « C_A »', () => {
    expect(categoriePiece('PC1_2D_PDM.pdf')).toBe('plans');
    expect(categoriePiece('PC16.1_2D_PDM.pdf')).toBe('plans');
    expect(categoriePiece('C_A2_2D_PDM.pdf')).toBe('plans');
  });
  it('décision : autorisation, notification, arrêté', () => {
    expect(categoriePiece('_autorisation-13-03-2026.pdf')).toBe('decision');
    expect(categoriePiece('_lettreDeNotification-13-03-2026.pdf')).toBe('decision');
    expect(categoriePiece('arrete-du-maire.pdf')).toBe('decision');
  });
  it('avis : Favorable, UDAP, RATP', () => {
    expect(categoriePiece('Favorable-470505-106 ENEDIS.pdf')).toBe('avis');
    expect(categoriePiece('001b UDAP ABF PLATAU.pdf')).toBe('avis');
    expect(categoriePiece('RATP25-043179_131814.pdf')).toBe('avis');
  });
  it('cerfa', () => { expect(categoriePiece('cerfa_13409_15_2D.pdf')).toBe('cerfa'); });
  it('nom INCONNU → « autres » (jamais deviné)', () => {
    expect(categoriePiece('note-interne.pdf')).toBe('autres');
    expect(categoriePiece('document-bizarre.xyz')).toBe('autres');
  });
});

describe('N3-D — CellulePieces : ordre des catégories, ordre d’origine interne, rien de masqué', () => {
  const doc = (id: number, nom: string): PieceArchive => ({ id, nomFichier: nom, typeMime: 'application/pdf', tailleOctets: 100, deposee: true, motifNonStocke: null, origine: 'auto', recuLe: null, objet: null, deposePar: null });
  const rendreCellule = (pieces: PieceArchive[]) => renderToStaticMarkup(createElement(CellulePieces, { pieces, onTelecharger: () => {}, onSupprimer: () => {} }));

  it('ordre : fiche → Plans → Décision → Avis → Cerfa → Autres', () => {
    const h = rendreCellule([
      doc(1, 'cerfa_13409.pdf'), doc(2, 'inconnu.pdf'), doc(3, 'Favorable-ENEDIS.pdf'),
      doc(4, '_autorisation.pdf'), doc(5, 'PC1_2D.pdf'), fiche,
    ]);
    expect(h.indexOf('Fiche de synthèse du permis.pdf')).toBeLessThan(h.indexOf('Plans'));
    expect(h.indexOf('Plans')).toBeLessThan(h.indexOf('Décision'));
    expect(h.indexOf('Décision')).toBeLessThan(h.indexOf('Avis de services'));
    expect(h.indexOf('Avis de services')).toBeLessThan(h.indexOf('Cerfa'));
    expect(h.indexOf('Cerfa')).toBeLessThan(h.indexOf('Autres pièces'));
  });

  it('ordre d’ORIGINE conservé À L’INTÉRIEUR d’une catégorie', () => {
    const h = rendreCellule([doc(1, 'PC1_2D.pdf'), doc(2, 'PC2_2D.pdf'), doc(3, 'PC10_2D.pdf')]);
    expect(h.indexOf('PC1_2D.pdf')).toBeLessThan(h.indexOf('PC2_2D.pdf'));
    expect(h.indexOf('PC2_2D.pdf')).toBeLessThan(h.indexOf('PC10_2D.pdf'));
  });

  it('un nom INCONNU → catégorie « Autres pièces », TOUJOURS rendu + bouton de téléchargement (T5)', () => {
    const h = rendreCellule([doc(9, 'un-truc-inconnu.pdf')]);
    expect(h).toContain('Autres pièces');
    expect(h).toContain('un-truc-inconnu.pdf'); // jamais masqué
    expect(h).toContain('↓');                    // téléchargeable (contrat T5)
  });

  it('la fiche « genere » reste en tête et NON supprimable (non-régression N1-B/N6-F)', () => {
    const h = rendreCellule([doc(1, 'PC1_2D.pdf'), fiche]);
    expect(h.indexOf('Fiche de synthèse du permis.pdf')).toBeLessThan(h.indexOf('PC1_2D.pdf'));
    // la fiche n'a pas de bouton « supprimer » ; la pièce auto en a un → « supprimer » présent une seule fois (pour l'auto)
    expect((h.match(/supprimer/g) ?? []).length).toBe(1);
  });

  it('N10 — une pièce SOURCE remonte EN TÊTE de SA catégorie ; l’ordre des NON-sources reste stable', () => {
    const src = (id: number, nom: string): PieceArchive => ({ ...doc(id, nom), estSource: true });
    // Plans : PC2 (non source), PC5 SOURCE, PC10 (non source) → PC5 doit passer devant PC2, et PC2 rester devant PC10.
    const h = rendreCellule([doc(1, 'PC2_2D.pdf'), src(2, 'PC5_2D.pdf'), doc(3, 'PC10_2D.pdf')]);
    expect(h.indexOf('PC5_2D.pdf')).toBeLessThan(h.indexOf('PC2_2D.pdf'));   // source en tête
    expect(h.indexOf('PC2_2D.pdf')).toBeLessThan(h.indexOf('PC10_2D.pdf'));  // ordre relatif des non-sources conservé
  });

  it('N10 — l’ordre des CATÉGORIES n’est pas touché par une source dans « Autres »', () => {
    const src = (id: number, nom: string): PieceArchive => ({ ...doc(id, nom), estSource: true });
    const h = rendreCellule([src(1, 'inconnu.pdf'), doc(2, 'PC1_2D.pdf')]); // source dans Autres, plan non source
    expect(h.indexOf('Plans')).toBeLessThan(h.indexOf('Autres pièces'));    // Plans reste avant Autres
  });

  it('N10 — une pièce source est écrite en BLEU (repérable d’un coup d’œil) ; une non-source ne l’est pas', () => {
    const src: PieceArchive = { ...doc(1, 'PC3_2D.pdf'), estSource: true };
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: src, onTelecharger: () => {} }));
    expect(h).toContain(BLEU_SOURCE);
    const hn = renderToStaticMarkup(createElement(PieceLien, { piece: doc(2, 'PC4_2D.pdf'), onTelecharger: () => {} }));
    expect(hn).not.toContain(BLEU_SOURCE);
  });
});

describe('N6-F — pièce VERSÉE AUTOMATIQUEMENT (origine « auto »)', () => {
  it('pastille « versée automatiquement » (distincte de « ajoutée à la main » et « fiche de synthèse ») + expéditeur affiché', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: auto, onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(h).toContain('versée automatiquement');
    expect(h).not.toContain('ajoutée à la main');
    expect(h).not.toContain('fiche de synthèse');
    expect(h).toContain('a.jorel@sansvisavis.com'); // point 3 : d'où vient la pièce
    expect(h).toContain('arrete-PC.pdf');
  });

  it('SUPPRIMABLE (un versement auto peut se tromper) — bouton « supprimer » présent', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: auto, onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(h).toContain('supprimer');
    expect(h).toContain('↓'); // téléchargeable aussi
  });

  it('les trois origines dossier_document COEXISTENT (fiche en tête, auto et manuel distinctes) — CellulePieces', () => {
    const h = renderToStaticMarkup(createElement(CellulePieces, { pieces: [fiche, auto, manuel], onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(h).toContain('fiche de synthèse');
    expect(h).toContain('versée automatiquement');
    expect(h).toContain('ajoutée à la main');
    // fiche générée en PREMIER (non-régression N1-B)
    expect(h.indexOf('fiche de synthèse')).toBeLessThan(h.indexOf('versée automatiquement'));
    // la fiche n'a PAS de bouton supprimer, mais auto ET manuel en ont un → au moins 2 occurrences de « supprimer »
    expect((h.match(/supprimer/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('la CLÉ de stockage n’apparaît jamais pour une pièce auto', () => {
    const h = rendu([ligne({ pieces: [auto] })]);
    expect(h).not.toMatch(/cle_stockage|dossiers\/1\//i);
  });
});

describe('N1-B — fiche de synthèse générée (origine « genere »)', () => {
  it('affichée EN PREMIER dans les pièces, AVANT les pièces reçues par e-mail (CellulePieces)', () => {
    const h = renderToStaticMarkup(createElement(CellulePieces, { pieces: [emailDeposee, fiche], onTelecharger: () => {}, onSupprimer: () => {} }));
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

  it('ligne DÉPLOYÉE : panneau <td id> ciblé par aria-controls, encart de familles présent, bouton « Fermer »', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })], MAINTENANT, 1);
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('aria-controls="archive-pieces-1"');
    expect(h).toContain('id="archive-pieces-1"');
    expect(h).toContain('Fermer');
    // UNIF-3b — l'encart est là (famille Pièces remplissable, titre replié) ; le contenu (pièces + ajout) est lazy → monté au dépliage de la famille.
    expect(h).toContain('Pièces du permis');
    expect(h).not.toContain('plan-de-masse.pdf'); // contenu de la famille non rendu tant que la famille n'est pas dépliée
    expect(h).not.toContain('type="file"');
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

  // N6-G — régression : N6-F a requalifié les pièces versées auto ('manuel' → 'auto'). L'état ne les reconnaissait plus comme
  //   « en GED » → un permis plein de pièces retombait sur « sans contenu reçu ». Ces tests l'auraient attrapée.
  it('N6-G — OBTENU : pièces d’origine AUTO SEULES (versées automatiquement) → en GED, JAMAIS « sans contenu reçu »', () => {
    const e = etatArchive(ligne({ pieces: [auto] }), RECENT);
    expect(e).toMatchObject({ cle: 'obtenu', mot: 'obtenu', couleurLigne: 'var(--color-svv-green-ink)' });
    expect(e.cle).not.toBe('sans_contenu'); // le symptôme exact du 07512025V0035
  });
  it('N6-G — OBTENU : mélange AUTO + MANUEL → en GED', () => {
    expect(etatArchive(ligne({ pieces: [auto, manuel] }), RECENT).cle).toBe('obtenu');
  });
  it('N6-G — OBTENU : AUTO en GED PRIME sur une pièce e-mail non classée (obtenu, pas « en attente »)', () => {
    expect(etatArchive(ligne({ pieces: [auto, emailDeposee] }), RECENT).cle).toBe('obtenu');
  });
  it('N6-G — la fiche GÉNÉRÉE seule ne suffit PAS à « obtenu » (ce n’est pas une pièce reçue)', () => {
    expect(etatArchive(ligne({ satisfaitPar: 'manuel', recuLe: null, expireLeCapte: null, aLienFort: false, pieces: [fiche] }), RECENT).cle).toBe('sans_contenu');
  });

  it('EN ATTENTE (orange) : contenu e-mail non classé, délai NON dépassé', () => {
    const e = etatArchive(ligne({ pieces: [emailDeposee] }), AVANT_DELAI);
    expect(e).toMatchObject({ cle: 'attente', mot: 'en attente', couleurLigne: 'var(--color-svv-amber)' });
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

  it('POLISH-1 — INCOMPLET (diagnostic connu) : toute la ligne ROUGE + mot « incomplet » (prime sur « obtenu »)', () => {
    const e = etatArchive(ligne({ pieces: [manuel], completudeIncomplete: true }), RECENT);
    expect(e).toMatchObject({ cle: 'incomplet', mot: 'incomplet', couleurLigne: 'var(--color-svv-red)', couleurPieces: 'var(--color-svv-red)' });
    expect(e.couleurLigne).toBe('var(--color-svv-red)'); // MÊME rouge que BlocCompletude (var(--color-svv-red)), aucune nouvelle teinte
  });
  it('POLISH-1 — incomplet PRIME même au-delà de 2 mois (rouge, pas neutre)', () => {
    const e = etatArchive(ligne({ pieces: [manuel], completudeIncomplete: true }), VIEUX);
    expect(e.cle).toBe('incomplet'); expect(e.couleurLigne).toBe('var(--color-svv-red)');
  });
  it('POLISH-1 — non diagnostiqué (completudeIncomplete=false) → inchangé (« obtenu » vert), jamais « incomplet »', () => {
    expect(etatArchive(ligne({ pieces: [manuel], completudeIncomplete: false }), RECENT).cle).toBe('obtenu');
  });
  it('POLISH-1 — a11y : le MOT « incomplet » est rendu dans le tableau (info portée par le texte, pas la seule couleur)', () => {
    const h = rendu([ligne({ pieces: [manuel], completudeIncomplete: true })]);
    expect(h).toContain('incomplet');
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
    const h = renderToStaticMarkup(createElement(CellulePieces, { pieces, onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(h).toContain('reçues le 12/08 — Envoi des pièces');
    expect(h).toContain('reçues le 05/08 — Première réponse');
    expect(h).toContain('plan.pdf');
    expect(h).toContain('arrete.pdf');
  });

  it('pièce e-mail NON déposée → motif, aucun bouton (non-régression du contrat) ; pièce déposée → bouton (non-régression auto)', () => {
    const h = renderToStaticMarkup(createElement(CellulePieces, { pieces: [emailDeposee, emailNonDeposee], onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(h).toContain('plan-de-masse.pdf');            // déposée → téléchargeable (non-régression)
    expect(h).toContain('coupe.pdf');
    expect(h).toContain('non déposée : dépôt S3 non configuré'); // motif rendu
  });

  it('SÉCURITÉ : la clé de stockage n’apparaît jamais dans le rendu Archives', () => {
    const h = rendu([ligne({ pieces: [emailDeposee, manuel] })]);
    expect(h).not.toMatch(/cle_stockage|entrantes\//i);
  });
});

describe('N10-J B — pièce source : libellé texte + résolution ambiguë rendue visible', () => {
  const doc = (id: number, nom: string): PieceArchive => ({ id, nomFichier: nom, typeMime: 'application/pdf', tailleOctets: 100, deposee: true, motifNonStocke: null, origine: 'auto', recuLe: null, objet: null, deposePar: null });

  it('une source porte un LIBELLÉ TEXTE « a servi à remplir N champs » (jamais la couleur seule)', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: { ...doc(1, 'PC3.2_Coupe_BB.pdf'), estSource: true, nbChampsSource: 2 }, onTelecharger: () => {} }));
    expect(h).toContain('a servi à remplir 2 champs');
  });

  it('singulier : « 1 champ »', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: { ...doc(1, 'PC3.pdf'), estSource: true, nbChampsSource: 1 }, onTelecharger: () => {} }));
    expect(h).toContain('a servi à remplir 1 champ');
    expect(h).not.toContain('1 champs');
  });

  it('source sans compte (défensif) → pas de libellé « undefined »', () => {
    const h = renderToStaticMarkup(createElement(PieceLien, { piece: { ...doc(1, 'PC3.pdf'), estSource: true }, onTelecharger: () => {} }));
    expect(h).not.toContain('a servi à remplir');
  });

  it('CellulePieces : les sources NON résolues (homonyme/ambigu) sont RENDUES VISIBLES, sans rien épingler', () => {
    const h = renderToStaticMarkup(createElement(CellulePieces, { pieces: [doc(1, 'PC3.pdf'), doc(2, 'PC3.pdf')], sourcesNonResolues: ['PC3.pdf'], onTelecharger: () => {}, onSupprimer: () => {} }));
    expect(h).toContain('source non résolue');
    expect(h).toContain('PC3.pdf');
  });
})
