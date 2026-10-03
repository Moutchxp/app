import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aideReintegrerDrive, EMOJI_CORBEILLE_DRIVE, JOURS_CONSERVATION, joursRestants, LIBELLE_REINTEGRER_DRIVE,
  MENTION_DOSSIER_PROTEGE, MENTION_SANS_SUPPRESSION, MOT_CORBEILLE_DRIVE, motReintegreDrive,
  parJetLePlusRecent, peutReintegrer, phraseJoursRestants, titreCorbeilleDrive, type LigneCorbeille,
} from './corbeilleDriveListe';

/**
 * ══ 🔴🔴 LOT CORBEILLE-DRIVE-REELLE-ET-SCROLL, POINT 2 — LA CORBEILLE DU DRIVE ══════════════════════════════════
 *
 * Les trois épreuves qu'Arno demande : la liste, « Réintégrer » qui remet au bon parent et met le registre à
 * jour, et le garde-fou du dossier protégé. Le CALCUL est ici ; le CÂBLAGE de l'écran et de la route est éprouvé
 * dans `corbeille/route.test.ts` et `SelecteurFichierDrive.corbeille.test.ts`.
 */

const ligne = (o: Partial<LigneCorbeille> = {}): LigneCorbeille => ({
  id: 'F1', nom: 'un.pdf', origine: 'Test', origineId: 'D1', jeteLe: '2026-10-03T20:45:22.094Z',
  tailleOctets: 1, dossier: false, jeteDirectement: true, protege: false, ...o,
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA LISTE — « les plus récents d'abord »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la liste, les plus récemment jetés d’abord', () => {
  /**
   * 🔴 LE TRI SE FAIT CHEZ NOUS PARCE QUE GOOGLE LE REFUSE. Mesuré sur le vrai Drive le 04/10/2026 :
   * `orderBy=trashedTime` rend HTTP 400, « Invalid Value ». Ce n'est pas un choix d'architecture — c'est la seule
   * façon d'obtenir l'ordre demandé. Et `orderBy=recency`, qui PASSE, aurait donné un ordre plausible et FAUX :
   * c'est la date du dernier accès, pas celle du jet.
   */
  it('🔴 le plus récemment jeté vient en tête', () => {
    const r = parJetLePlusRecent([
      ligne({ id: 'vieux', jeteLe: '2026-09-29T15:31:37.724Z' }),
      ligne({ id: 'neuf', jeteLe: '2026-10-03T21:56:26.978Z' }),
      ligne({ id: 'moyen', jeteLe: '2026-09-30T15:37:14.033Z' }),
    ]);
    expect(r.map((x) => x.id)).toEqual(['neuf', 'moyen', 'vieux']);
  });

  /** ⚠️ UNE DATE ABSENTE PASSE EN QUEUE, et ne prétend pas être ancienne : la ranger au hasard mentirait. */
  it('⚠️ une date absente ne prend pas la place d’une date connue', () => {
    const r = parJetLePlusRecent([
      ligne({ id: 'sansDate', jeteLe: null }),
      ligne({ id: 'avecDate', jeteLe: '2026-09-29T15:31:37.724Z' }),
    ]);
    expect(r.map((x) => x.id)).toEqual(['avecDate', 'sansDate']);
  });

  /** ⚠️ ET UNE DATE ILLISIBLE SE COMPORTE COMME UNE ABSENTE, au lieu de faire exploser le tri. */
  it('⚠️ une date illisible ne casse pas le tri', () => {
    const r = parJetLePlusRecent([ligne({ id: 'bruit', jeteLe: 'pas une date' }), ligne({ id: 'bon' })]);
    expect(r.map((x) => x.id)).toEqual(['bon', 'bruit']);
  });

  /** ⚠️ LE TRI NE MODIFIE PAS LA LISTE REÇUE : on ne retouche jamais ce qu'un appelant nous prête. */
  it('⚠️ il rend une copie', () => {
    const avant = [ligne({ id: 'A' }), ligne({ id: 'B' })];
    expect(parJetLePlusRecent(avant)).not.toBe(avant);
    expect(avant.map((x) => x.id)).toEqual(['A', 'B']);
  });
});

describe('🔴 le titre de la liste', () => {
  /**
   * ⚠️ « AU MOINS », ET PAS UN COMPTE EXACT, QUAND LA PAGE EST PLEINE. Mesuré : la corbeille du cabinet rend un
   * `nextPageToken`. Annoncer « 25 fichiers » ferait conclure qu'il n'y en a pas plus — exactement la faute que
   * la loupe évite en disant « emplacements CONNUS ».
   */
  it('⚠️ une page pleine dit « au moins »', () => {
    expect(titreCorbeilleDrive(25, true)).toContain('Au moins 25 fichiers');
    expect(titreCorbeilleDrive(25, false)).toContain('25 fichiers');
    expect(titreCorbeilleDrive(25, false)).not.toContain('Au moins');
  });

  it('⚠️ une corbeille vide le dit, et ne compte pas', () => {
    expect(titreCorbeilleDrive(0, false)).toBe('La corbeille du Drive est vide.');
  });

  it('⚠️ le singulier est écrit', () => {
    expect(titreCorbeilleDrive(1, false)).toContain('1 fichier à');
  });

  /**
   * ⚠️ CE QUE LA LISTE NE FAIT PAS EST ÉCRIT À L'ÉCRAN. Arno : « pas de suppression définitive, pas de “vider la
   * corbeille” ». Le dire est plus utile que de le taire : qui cherche le bouton doit comprendre qu'il n'existe
   * pas ici, et non croire qu'il ne l'a pas trouvé.
   */
  it('⚠️ elle annonce ce qu’elle ne sait pas faire', () => {
    expect(MENTION_SANS_SUPPRESSION).toContain('ne supprime rien définitivement');
    expect(MENTION_SANS_SUPPRESSION).toContain('ne vide pas la corbeille');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES JOURS QUI RESTENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 les jours restants avant suppression définitive', () => {
  const JOUR = 86_400_000;
  const jete = Date.parse('2026-10-01T12:00:00.000Z');

  it('🔴 trente jours au jour du jet, et un de moins chaque jour', () => {
    expect(joursRestants('2026-10-01T12:00:00.000Z', jete)).toBe(30);
    expect(joursRestants('2026-10-01T12:00:00.000Z', jete + JOUR)).toBe(29);
    expect(joursRestants('2026-10-01T12:00:00.000Z', jete + 29 * JOUR)).toBe(1);
  });

  /**
   * 🔴 ON ARRONDIT VERS LE BAS, ET C'EST DÉLIBÉRÉ : annoncer « 1 jour » quand il reste quatre heures est un
   * mensonge utile dans un seul sens — celui qui fait agir tout de suite. L'inverse ferait remettre au lendemain
   * un fichier qui serait parti.
   */
  it('🔴 vingt-huit heures écoulées valent un jour de moins, pas deux', () => {
    expect(joursRestants('2026-10-01T12:00:00.000Z', jete + 28 * 3_600_000)).toBe(29);
  });

  /** ⚠️ JAMAIS NÉGATIF : passé trente jours, « 0 » dit la vérité utile là où « -3 » ferait douter du calcul. */
  it('⚠️ au-delà de trente jours, zéro et pas moins', () => {
    expect(joursRestants('2026-10-01T12:00:00.000Z', jete + 45 * JOUR)).toBe(0);
  });

  it('⚠️ une date absente ou illisible ne rend pas un nombre', () => {
    expect(joursRestants(null, jete)).toBeNull();
    expect(joursRestants('pas une date', jete)).toBeNull();
  });

  it('⚠️ la phrase suit le nombre, au singulier comme au pluriel', () => {
    expect(phraseJoursRestants(30)).toBe('encore 30 jours');
    expect(phraseJoursRestants(1)).toBe('plus qu’1 jour');
    expect(phraseJoursRestants(0)).toContain('d’un instant à l’autre');
    expect(phraseJoursRestants(null)).toContain('inconnue');
  });

  /** ⚠️ LE NOMBRE DE JOURS EST ÉCRIT UNE FOIS : deux copies auraient divergé. */
  it('⚠️ trente jours, et une seule définition', () => {
    expect(JOURS_CONSERVATION).toBe(30);
    const driveCorbeille = readFileSync('app/lib/gestion/driveCorbeille.ts', 'utf8');
    expect(driveCorbeille).toContain('Récupérable 30 jours');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE GARDE-FOU — ET LES DEUX AUTRES REFUS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ce qui interdit de réintégrer', () => {
  /**
   * 🔴🔴 « DOCUMENTS CLIENTS SCANNÉS » EST INTOUCHABLE EN ÉCRITURE. Règle absolue d'Arno : « ni corbeille, ni
   * réintégration, ni déplacement, ni copie vers lui ; lecture de métadonnées seulement ». Réintégrer y écrirait.
   *
   * ⚠️ LA LIGNE EST AFFICHÉE QUAND MÊME, avec la mention « Dossier protégé » : la masquer aurait été pire — on
   * chercherait un document qu'on ne voit pas, sans savoir pourquoi. Mesuré sur la corbeille réelle du cabinet :
   * 1 ligne sur 25 est dans ce cas.
   */
  it('🔴🔴 une origine protégée refuse, et le dit en toutes lettres', () => {
    const v = peutReintegrer(ligne({ protege: true }));
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motif).toContain('Documents clients scannés');
    expect(v.ok === false && v.motif).toContain('Google Drive');
  });

  /**
   * 🔴 UN FICHIER EMPORTÉ PAR SON DOSSIER NE SE RÉINTÈGRE PAS SEUL. Mesuré sur le vrai Drive :
   * `explicitlyTrashed` vaut faux pour 14 des 25 entrées de la corbeille du cabinet. Le sortir le remettrait dans
   * un dossier lui aussi à la corbeille : il disparaîtrait de la corbeille sans reparaître nulle part de visible.
   */
  it('🔴 un fichier emporté par son dossier dit QUOI FAIRE à la place', () => {
    const v = peutReintegrer(ligne({ jeteDirectement: false, origine: 'Test / Vieux dossier' }));
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motif).toContain('« Test / Vieux dossier »');
    expect(v.ok === false && v.motif).toContain('Réintégrez le dossier');
  });

  /** ⚠️ ET SANS ORIGINE, « remettre à sa place » n'a pas de sens — Google refuserait après coup. */
  it('⚠️ sans emplacement d’origine, on ne propose rien', () => {
    expect(peutReintegrer(ligne({ origineId: '' })).ok).toBe(false);
    expect(peutReintegrer(ligne({ origineId: '   ' })).ok).toBe(false);
  });

  /** 🔴 LE CAS ORDINAIRE PASSE : jeté lui-même, origine connue, hors archive. */
  it('🔴 une ligne ordinaire se réintègre', () => {
    expect(peutReintegrer(ligne()).ok).toBe(true);
  });

  /**
   * 🔴🔴 L'ORDRE DES REFUS COMPTE : l'archive d'abord. Un fichier à la fois protégé ET emporté par son dossier
   * doit annoncer la PROTECTION — c'est la règle absolue, et celle qui ne se lève jamais ; l'autre se lèverait en
   * réintégrant le dossier.
   */
  it('🔴🔴 l’archive est annoncée avant toute autre raison', () => {
    const v = peutReintegrer(ligne({ protege: true, jeteDirectement: false, origineId: '' }));
    expect(v.ok === false && v.motif).toContain('Documents clients scannés');
  });
});

describe('🔴 les mots de la réintégration', () => {
  /** 🔴 LE MÊME MOT QUE POUR LES MAILS (demande d'Arno) : « Réintégrer », à l'identique. */
  it('🔴 c’est le mot des mails, pas un synonyme', () => {
    expect(LIBELLE_REINTEGRER_DRIVE).toBe('Réintégrer');
    const mails = readFileSync('app/lib/gestion/boiteOrigine.ts', 'utf8');
    expect(mails).toContain("export const LIBELLE_REINTEGRER = 'Réintégrer';");
  });

  it('🔴 l’aide DIT où le fichier va revenir', () => {
    expect(aideReintegrerDrive('Test / Quittances')).toBe('Le fichier revient à sa place d’origine : Test / Quittances.');
    expect(aideReintegrerDrive('')).toBe('Le fichier revient à sa place d’origine.');
  });

  it('🔴 le bandeau nomme le fichier ET son dossier', () => {
    expect(motReintegreDrive('un.pdf', 'Test')).toBe('« un.pdf » est revenu dans Test.');
    expect(motReintegreDrive('un.pdf', '')).toBe('« un.pdf » est revenu à sa place.');
  });

  /** ⚠️ LA MENTION ET L'EMOJI SONT CEUX QU'ARNO A ÉCRITS, au caractère près. */
  it('⚠️ la catégorie porte les mots demandés', () => {
    expect(MOT_CORBEILLE_DRIVE).toBe('Corbeille');
    expect(EMOJI_CORBEILLE_DRIVE).toBe('🗑');
    expect(MENTION_DOSSIER_PROTEGE).toBe('Dossier protégé');
  });

  /** ⚠️ AUCUNE APOSTROPHE DROITE dans les textes affichés : le dépôt écrit avec l'apostrophe typographique. */
  it('⚠️ les textes sont écrits avec l’apostrophe typographique', () => {
    const textes = [
      MENTION_SANS_SUPPRESSION, aideReintegrerDrive('X'), motReintegreDrive('X', 'Y'),
      phraseJoursRestants(1), phraseJoursRestants(0), phraseJoursRestants(null),
      titreCorbeilleDrive(2, true),
    ];
    for (const t of textes) expect(t, t).not.toContain("'");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔒 LES PROPRIÉTÉS DU MODULE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 les propriétés du module', () => {
  const code = readFileSync('app/lib/gestion/corbeilleDriveListe.ts', 'utf8');

  /** 🔒🔒 IL EST IMPORTÉ PAR UN COMPOSANT `'use client'` : ni réseau, ni base, ni React. */
  it('🔒🔒 ni réseau, ni base, ni React', () => {
    for (const mot of ['fetch(', 'SELECT ', 'UPDATE ', 'useState', 'useEffect', "from 'react'", 'server-only']) {
      expect(code, mot).not.toContain(mot);
    }
  });

  /** 🔒🔒 ET IL NE CONNAÎT AUCUNE SUPPRESSION DÉFINITIVE : le mot ne figure pas dans ses gestes. */
  it('🔒🔒 aucune suppression définitive, aucun vidage', () => {
    for (const mot of ['files.delete', 'emptyTrash', 'supprimerDefinitivement', 'viderCorbeille']) {
      expect(code, mot).not.toContain(mot);
    }
  });
});
