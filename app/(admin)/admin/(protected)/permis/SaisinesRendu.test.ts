import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CarteSaisissable, JoursForclusion, SectionSaisissables, SectionIndeterminees, SectionEnCours, SectionRecues,
  SectionAbandonnees, SectionFileDepot, SEUIL_JOURS_FORCLUSION_PROCHE,
} from './SaisinesRendu';
import { RAISON_INDETERMINEE } from '../../../../lib/veille/saisinesSuivi';
import type {
  SaisissableAffichee, IndetermineeAffichee, SaisineEnCours, SaisineRecue, SaisineAbandonnee, FileDepotSaisine,
} from '../../../../lib/veille/saisinesSuivi';

/**
 * X4 — rendu PUR de l'onglet « Saisines CADA » (renderToStaticMarkup, aucun DOM). Couvre : les quatre sections + leurs
 * libellés, la phrase explicative d'une section vide, l'indéterminée SANS bouton (raison affichée), l'avertissement de
 * conséquence AVANT le bouton « Lancer », les jours restants (signalés distinctement quand il en reste peu), et la file de
 * dépôt qui n'apparaît que si aucune adresse CADA n'est configurée (cas nominal) — plus le filet anti-orphelin documenté.
 */
const h = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const SAIS = (over: Partial<SaisissableAffichee> = {}): SaisissableAffichee => ({
  demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine',
  envoyeLe: '2026-03-14T10:00:00Z', refusTaciteLe: '2026-04-14T10:00:00Z', forclusionLe: '2026-06-14T10:00:00Z',
  joursAvantForclusion: 30, voie: 'refus_tacite', dossiersDus: 2, dossiersExclusRefusNonAcquis: 0,
  statut: 'Saisine à lancer', numeros: ['PC0920042500001'], ...over,
});
const INDET = (over: Partial<IndetermineeAffichee> = {}): IndetermineeAffichee => ({ ...SAIS(), raison: RAISON_INDETERMINEE, ...over });
const COURS = (over: Partial<SaisineEnCours> = {}): SaisineEnCours => ({ saisineId: 7, demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', envoyeeLe: '2026-05-10T09:00:00Z', statut: 'Saisine envoyée le 10 mai 2026', numeros: ['PC0920042500001'], ...over });
const RECUE = (over: Partial<SaisineRecue> = {}): SaisineRecue => ({ saisineId: 7, demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', envoyeeLe: '2026-05-10T09:00:00Z', avisRecuLe: '2026-06-01T09:00:00Z', avisSens: 'favorable', statut: 'Saisine envoyée le 10 mai 2026', numeros: ['PC0920042500001'], ...over });
const ABAND = (over: Partial<SaisineAbandonnee> = {}): SaisineAbandonnee => ({ saisineId: 9, demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', genereeLe: '2026-05-01T09:00:00Z', statut: 'Saisine abandonnée', numeros: ['PC0920042500001'], ...over });
const FILE = (over: Partial<FileDepotSaisine> = {}): FileDepotSaisine => ({ saisineId: 7, demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', objet: 'Saisine CADA — réf. SVAV-DEM-2026-000042', corps: 'CORPS-INTEGRAL-DE-LA-SAISINE', genereeLe: '2026-05-01T09:00:00Z', statut: 'Saisine à déposer sur le formulaire', numeros: ['PC0920042500001'], ...over });

const URL_FORM = 'https://www.cada.fr/formulaire-de-saisine';

describe('X4 — les quatre sections + leurs libellés', () => {
  it('chaque section porte son titre', () => {
    expect(h(createElement(SectionSaisissables, { saisissables: [SAIS()], cadaEmailVide: false }))).toContain('Demandes CADA possibles');
    expect(h(createElement(SectionEnCours, { enCours: [COURS()] }))).toContain('Saisines en cours');
    expect(h(createElement(SectionRecues, { recues: [RECUE()] }))).toContain('Avis CADA reçus');
    expect(h(createElement(SectionAbandonnees, { abandonnees: [ABAND()] }))).toContain('Saisines abandonnées');
  });
});

describe('X4 — une section vide affiche POURQUOI (jamais un compte à zéro muet)', () => {
  it('saisissables vide → phrase explicative (role note)', () => {
    const m = h(createElement(SectionSaisissables, { saisissables: [], cadaEmailVide: false }));
    expect(m).toContain('role="note"');
    expect(m).toContain('Aucune demande n’est actuellement saisissable');
    expect(m).not.toContain('<button'); // rien à cliquer
  });
  it('en cours / reçues / abandonnées vides → leur phrase', () => {
    expect(h(createElement(SectionEnCours, { enCours: [] }))).toContain('Aucune saisine en cours');
    expect(h(createElement(SectionRecues, { recues: [] }))).toContain('Aucun avis CADA reçu');
    expect(h(createElement(SectionAbandonnees, { abandonnees: [] }))).toContain('Aucune saisine abandonnée');
  });
});

describe('X4 — indéterminées : PAS de bouton, la raison en clair + renvoi vers la relève', () => {
  it('affiche la raison, aucun bouton (jamais une action inerte)', () => {
    const m = h(createElement(SectionIndeterminees, { indeterminees: [INDET()] }));
    expect(m).toContain('on ne peut pas encore affirmer que la mairie n’a pas répondu');
    expect(m).toContain('onglet Réponses');
    expect(m).not.toContain('<button');
  });
  it('vide → phrase (relève assez fraîche)', () => {
    expect(h(createElement(SectionIndeterminees, { indeterminees: [] }))).toContain('Aucune demande en attente');
  });
});

describe('X4 — « Lancer » : l’avertissement de conséquence PRÉCÈDE le bouton', () => {
  it('adresse CADA configurée → conséquence « envoi immédiat + PJ » avant le bouton', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS(), cadaEmailVide: false, onLancer: () => {} }));
    const iConseq = m.indexOf('enverra immédiatement');
    const iBouton = m.indexOf('>Lancer la demande CADA<');
    expect(iConseq).toBeGreaterThan(-1);
    expect(iBouton).toBeGreaterThan(-1);
    expect(iConseq).toBeLessThan(iBouton); // la phrase vient AVANT le bouton
    expect(m).toContain('copie de la demande initiale en pièce jointe');
  });
  it('aucune adresse CADA → conséquence « file de dépôt / saisie manuelle »', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS(), cadaEmailVide: true, onLancer: () => {} }));
    expect(m).toContain('placera dans la file de dépôt');
    expect(m).toContain('formulaire en ligne');
    expect(m).toContain('>Lancer la demande CADA<');
  });
  it('le retour d’action s’affiche à la clé du bouton (lancer-42), pas ailleurs', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS(), cadaEmailVide: false, onLancer: () => {}, retour: { cle: 'lancer-42', texte: 'Saisine envoyée à la CADA.', ok: true } }));
    expect(m).toContain('Saisine envoyée à la CADA.');
    const autre = h(createElement(CarteSaisissable, { d: SAIS(), cadaEmailVide: false, onLancer: () => {}, retour: { cle: 'lancer-99', texte: 'Autre.', ok: true } }));
    expect(autre).not.toContain('Autre.');
  });
});

describe('T1 — CarteSaisissable : la VOIE d’entrée CADA + la mention des dossiers exclus', () => {
  it('refus tacite (silence d’un mois) → « Refus tacite le … »', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS({ voie: 'refus_tacite' }), cadaEmailVide: false, onLancer: () => {} }));
    expect(m).toContain('Refus tacite le');
    expect(m).not.toContain('Refus exprès');
  });
  it('refus exprès (notifié par la mairie) → « Refus exprès notifié le … »', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS({ voie: 'refus_expres' }), cadaEmailVide: false, onLancer: () => {} }));
    expect(m).toContain('Refus exprès notifié le');
    expect(m).not.toContain('Refus tacite');
  });
  it('des dossiers au refus NON acquis → mention explicite « N dossier(s) non inclus » (jamais une omission muette)', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS({ dossiersExclusRefusNonAcquis: 2 }), cadaEmailVide: false, onLancer: () => {} }));
    expect(m).toContain('2 dossiers non inclus');
    expect(m).toContain('refus pas encore acquis');
    expect(m).toContain('role="note"');
  });
  it('aucun dossier exclu → aucune mention d’exclusion', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS({ dossiersExclusRefusNonAcquis: 0 }), cadaEmailVide: false, onLancer: () => {} }));
    expect(m).not.toContain('non inclus');
  });
});

describe('X4 — jours avant forclusion : rendus, et signalés distinctement quand il en reste peu', () => {
  it('peu de jours (≤ seuil) → alerte rouge « Urgent », role=alert', () => {
    const m = h(createElement(JoursForclusion, { jours: 3, forclusionLe: '2026-06-14T10:00:00Z' }));
    expect(m).toContain('role="alert"');
    expect(m).toContain('Urgent');
    expect(m).toContain('3 jours avant forclusion');
    expect(m).toContain('forclusion le 2026-06-14');
  });
  it('beaucoup de jours (> seuil) → pas d’alerte, mention neutre', () => {
    const m = h(createElement(JoursForclusion, { jours: 40, forclusionLe: '2026-06-14T10:00:00Z' }));
    expect(m).not.toContain('role="alert"');
    expect(m).not.toContain('Urgent');
    expect(m).toContain('Encore 40 jours avant forclusion');
  });
  it('le seuil est une constante d’AFFICHAGE (bornes du signalement) — juste sous/au seuil = urgent', () => {
    expect(h(createElement(JoursForclusion, { jours: SEUIL_JOURS_FORCLUSION_PROCHE, forclusionLe: null }))).toContain('Urgent');
    expect(h(createElement(JoursForclusion, { jours: SEUIL_JOURS_FORCLUSION_PROCHE + 1, forclusionLe: null }))).not.toContain('Urgent');
  });
  it('la carte saisissable rend bien les jours restants', () => {
    expect(h(createElement(CarteSaisissable, { d: SAIS({ joursAvantForclusion: 12 }), cadaEmailVide: false, onLancer: () => {} }))).toContain('12 jours avant forclusion');
  });
});

describe('X4 — file de dépôt : n’apparaît que si aucune adresse CADA (cas nominal)', () => {
  it('cada_email VIDE → file visible, avec l’URL du formulaire et le corps à copier', () => {
    const m = h(createElement(SectionFileDepot, { items: [FILE()], cadaEmailVide: true, urlFormulaire: URL_FORM }));
    expect(m).toContain('À saisir sur le formulaire CADA');
    expect(m).toContain(URL_FORM);
    expect(m).toContain('CORPS-INTEGRAL-DE-LA-SAISINE'); // corps copiable
  });
  it('canal e-mail (cada_email renseigné) ET rien à finaliser → la file NE s’affiche PAS (null)', () => {
    const m = h(createElement(SectionFileDepot, { items: [], cadaEmailVide: false, urlFormulaire: URL_FORM }));
    expect(m).toBe('');
  });
  it('cada_email VIDE mais aucune saisine → file visible avec sa phrase (mode dépôt manuel expliqué)', () => {
    const m = h(createElement(SectionFileDepot, { items: [], cadaEmailVide: true, urlFormulaire: URL_FORM }));
    expect(m).toContain('À saisir sur le formulaire CADA');
    expect(m).toContain('Aucune saisine à déposer');
  });
  it('filet anti-orphelin : un brouillon dont l’envoi n’a pas abouti (cada_email renseigné) reste visible « à finaliser »', () => {
    const m = h(createElement(SectionFileDepot, { items: [FILE()], cadaEmailVide: false, urlFormulaire: URL_FORM }));
    expect(m).toContain('envoi à finaliser');
    expect(m).toContain('SVAV-DEM-2026-000042'); // jamais rendu orphelin/invisible
  });
});

describe('X4 — actions des sections en cours / reçues', () => {
  it('en cours : sélecteur d’avis (favorable/défavorable/sans suite) + boutons Enregistrer/Abandonner', () => {
    const m = h(createElement(SectionEnCours, { enCours: [COURS()], onEnregistrerAvis: () => {}, onAbandonner: () => {}, onSens: () => {} }));
    expect(m).toContain('favorable');
    expect(m).toContain('défavorable');
    expect(m).toContain('sans suite');
    expect(m).toContain('Enregistrer l’avis');
    expect(m).toContain('Abandonner');
  });
  it('reçue : le sens est rendu en clair (défavorable via le libellé FR)', () => {
    expect(h(createElement(SectionRecues, { recues: [RECUE({ avisSens: 'defavorable' })] }))).toContain('Avis défavorable');
    expect(h(createElement(SectionRecues, { recues: [RECUE({ avisSens: 'favorable' })] }))).toContain('Avis favorable');
  });
});

describe('lot 5b (B) — statut explicite + numéros de permis affichés dans chaque carte', () => {
  it('carte saisissable : porte son statut ET ses numéros de permis (pas seulement la référence interne)', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS({ statut: 'Saisine à lancer', numeros: ['PC0920042500001', 'PC0920042500002'] }), cadaEmailVide: false }));
    expect(m).toContain('Saisine à lancer');
    expect(m).toContain('Permis : PC0920042500001, PC0920042500002');
  });
  it('saisine en cours : statut « envoyée le … » (e-mail) rendu tel quel', () => {
    const m = h(createElement(SectionEnCours, { enCours: [COURS({ statut: 'Saisine envoyée le 10 mai 2026', numeros: ['PC0920042500001'] })] }));
    expect(m).toContain('Saisine envoyée le 10 mai 2026');
    expect(m).toContain('Permis : PC0920042500001');
  });
  it('saisine à déposer (formulaire) : statut « déposée le … » distinct de « envoyée le … »', () => {
    const m = h(createElement(SectionFileDepot, { items: [FILE({ statut: 'Saisine à déposer sur le formulaire' })], cadaEmailVide: true, urlFormulaire: URL_FORM }));
    expect(m).toContain('Saisine à déposer sur le formulaire');
  });
  it('sans numéro rattaché : phrase explicite (jamais un vide muet)', () => {
    const m = h(createElement(CarteSaisissable, { d: SAIS({ numeros: [] }), cadaEmailVide: false }));
    expect(m).toContain('Aucun numéro de permis rattaché');
  });
});
