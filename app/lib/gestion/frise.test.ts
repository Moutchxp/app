import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cleDOuverture, construireFrise, couleurDeLaCarte, dateAuCentre, etapeOuvrable, jourEnNombre,
  jourIntercalaire, mentionCreation, motAjout,
  motDateEtape, motDeLaCase, motDeLaCarte, motGroupeMessages, motMailDOrigine, motMontant, motSource,
  nombreEnJour, numerosDesEtapes, pictoSource, rangerEnLigne, TYPES_BORNE,
  type EtapeAAfficher,
} from './frise';
/* 🔴 LOT FRISE-COULEURS-DATES — les deux listes de types viennent du module, jamais recopiées : une épreuve qui
   énumère ses propres types ne verrait pas celui qu'on ajoutera demain. */
import { REPERES, TYPES_AJOUTABLES } from './mongaEtape';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 3 — COMMENT LA FRISE SE RANGE ════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (MONGA-2) : « Les ÉTAPES MAJEURES, bien visibles, dans l'ordre chronologique […] Les COMMENTAIRES
 * Monga et les rappels : simples petits repères discrets sur la frise […] Ce ne sont pas des étapes. »
 *
 * ═══ 🔴🔴 CE QUI A CHANGÉ AU LOT FRISE-CONSTRUCTIBLE (06/10/2026), ET POURQUOI ═══════════════════════════════════
 *
 * La règle de MONGA-2 disait aussi : « Les étapes attendues mais pas encore atteintes s'affichent en pointillé. »
 * Arno l'a REMPLACÉE, en toutes lettres : « la frise d'avancement n'impose plus aucune suite d'étapes. Elle se
 * CONSTRUIT avec les vraies étapes, dans l'ordre réel (ex. rendez-vous → devis refusé → nouveau rendez-vous →
 * nouveau devis…). ACCORD D'ARNO : les carrés “attendue” en pointillé sont supprimés. »
 *
 * 🔴 LES ÉPREUVES DE CE FICHIER QUI TENAIENT LES POINTILLÉS SONT DONC RÉÉCRITES, et chacune dit ce qu'elle
 * vérifiait avant. Elles ne sont pas RELÂCHÉES : elles tiennent maintenant le fait inverse — qu'aucune case sans
 * étape n'apparaît —, ce qui est une garde aussi stricte, sur la règle qui a cours.
 *
 * ⚠️ TOUT LE RESTE DE MONGA-2 EST INCHANGÉ, et les épreuves qui le tiennent n'ont pas bougé d'une ligne : l'ordre
 * chronologique, le départage à date égale, les repères à part, les devis comptés par référence, « étape déduite
 * — aucun mail », la pureté du module.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

let n = 0;
const etape = (p: Partial<EtapeAAfficher>): EtapeAAfficher => ({
  id: (n += 1), reference: 'MNG-10000', type: 'ouverture', survenuLe: '2026-09-01T00:00:00', heureConnue: false, heureFin: null,
  numero: null, rang: null, montantCents: null, texte: null, auteur: null, source: 'monga',
  certitude: 'fiable', messageId: 1, aEuUnMail: true, filId: 10, creeParLibelle: null,
  creeLe: null, titre: null, rangDevis: null, ...p,
});

/** Un jour fixe tenu pour « aujourd'hui » : une épreuve qui lit l'horloge se met à échouer un matin de mai. */
const AUJOURDHUI = '2026-10-06';

describe('① l’ordre : chronologique, puis l’ordre du dossier', () => {
  it('🔴 les étapes atteintes se rangent par date', () => {
    const { majeures } = construireFrise([
      etape({ type: 'cloture', survenuLe: '2026-10-05T00:00:00' }),
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    const atteintes = majeures.filter((c) => c.etape !== null).map((c) => c.type);
    expect(atteintes).toEqual(['ouverture', 'prise_rdv', 'cloture']);
  });

  /**
   * 🔴 À DATE ÉGALE, L'ORDRE DU DOSSIER — et non celui de l'identifiant. Deux étapes du même jour (c'est le cas
   * ordinaire : un devis reçu et un rappel arrivent le même matin) s'afficheraient sinon au hasard de l'ordre
   * d'insertion en base, qui n'a aucun sens pour un lecteur.
   */
  it('🔴 à date égale, c’est l’ordre du dossier qui tranche', () => {
    const { majeures } = construireFrise([
      etape({ id: 99, type: 'intervention', survenuLe: '2026-10-01T00:00:00' }),
      etape({ id: 1, type: 'rdv_intervention', survenuLe: '2026-10-01T00:00:00' }),
    ]);
    const atteintes = majeures.filter((c) => c.etape !== null).map((c) => c.type);
    expect(atteintes).toEqual(['rdv_intervention', 'intervention']);
  });
});

describe('② 🔴🔴 plus aucune suite imposée — les pointillés ont disparu', () => {
  /**
   * ══ CE QUE CETTE ÉPREUVE DISAIT AVANT, ET POURQUOI LE VERDICT A CHANGÉ ════════════════════════════════════
   *
   * Elle s'appelait « une étape attendue absente apparaît, sans date, à sa place logique » et vérifiait que
   * `construireFrise([ouverture, clôture])` tissait CINQ carrés vides entre les deux, dans l'ordre du dossier.
   * C'était fidèle à la règle d'alors, et c'est exactement ce qu'Arno a fait retirer.
   *
   * 🔴 LE VERDICT EST MAINTENANT L'INVERSE, ET IL EST AUSSI STRICT : il ne doit RIEN y avoir entre les deux.
   * Une frise ne montre que ce qui a eu lieu.
   */
  it('🔴🔴 entre deux étapes réelles, aucun carré inventé', () => {
    const { majeures } = construireFrise([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'cloture', survenuLe: '2026-10-05T00:00:00' }),
    ]);
    expect(majeures.map((c) => c.type)).toEqual(['ouverture', 'cloture']);
    expect(majeures.every((c) => c.sorte === 'reelle')).toBe(true);
  });

  /**
   * 🔴🔴 LA GARDE CENTRALE DU LOT : aucune case de la frise ne peut être sans étape, SAUF l'ouverture dérivée.
   * Écrite sur un jeu qui, avant, en produisait six.
   */
  it('🔴🔴 aucune case sans étape, hormis l’ouverture dérivée', () => {
    const { majeures } = construireFrise([etape({ type: 'prise_rdv' })]);
    expect(majeures.filter((c) => c.etape === null)).toHaveLength(0);
  });

  /**
   * 🔴🔴 UN ÉVÉNEMENT SANS AUCUNE ÉTAPE NE MONTRE QUE SON OUVERTURE (Arno, point 1 : « AU DÉPART : la frise
   * montre seulement le carré “Ouverture” (date d'ouverture de l'événement, modifiable), suivi d'un carré “+”
   * rouge »).
   *
   * ⚠️ CETTE ÉPREUVE S'APPELAIT « un événement sans aucune étape affiche les sept attendues ». Sept carrés vides
   * sur un dossier qui vient de naître : c'était une promesse, pas un état.
   */
  it('🔴🔴 un événement tout neuf ne montre QUE son ouverture', () => {
    const { majeures, reperes } = construireFrise([], '2026-09-01T12:00:00');
    expect(majeures).toHaveLength(1);
    expect(majeures[0].type).toBe('ouverture');
    expect(majeures[0].sorte).toBe('ouverture');
    expect(majeures[0].etape).toBeNull();
    expect(majeures[0].survenuLe).toBe('2026-09-01T12:00:00');
    expect(reperes).toHaveLength(0);
  });

  /**
   * 🔴🔴 L'OUVERTURE DÉRIVÉE NE DOUBLE JAMAIS UNE OUVERTURE ENREGISTRÉE. Les 33 ouvertures de repli posées par
   * le lot MONGA-2 gardent exactement leur place et leur date : rien n'est doublé, rien n'est remplacé.
   */
  it('🔴🔴 une ouverture enregistrée l’emporte, et reste seule', () => {
    const { majeures } = construireFrise(
      [etape({ type: 'ouverture', survenuLe: '2026-08-20T00:00:00' })], '2026-09-01T12:00:00');
    expect(majeures.filter((c) => c.type === 'ouverture')).toHaveLength(1);
    expect(majeures[0].sorte).toBe('reelle');
    expect(majeures[0].survenuLe).toBe('2026-08-20T00:00:00');
  });

  /** ⚠️ SANS DATE D'ÉVÉNEMENT, AUCUNE OUVERTURE INVENTÉE : une ouverture datée d'aujourd'hui serait un fait faux. */
  it('⚠️ sans date d’événement, pas de carte d’ouverture', () => {
    expect(construireFrise([]).majeures).toHaveLength(0);
    expect(construireFrise([], null).majeures).toHaveLength(0);
  });

  /**
   * ⚠️ ELLE S'INSÈRE À SA PLACE DANS LE TEMPS, PAS D'OFFICE EN TÊTE (Arno, point 3 : « la frise est TOUJOURS
   * triée par date d'étape »). Un événement créé APRÈS l'arrivée du premier mail Monga existe — la référence vit
   * d'abord chez Monga.
   */
  it('⚠️ une ouverture d’événement postérieure se range après ce qui l’a précédée', () => {
    const { majeures } = construireFrise(
      [etape({ type: 'prise_rdv', survenuLe: '2026-08-01T00:00:00' })], '2026-09-01T12:00:00');
    expect(majeures.map((c) => c.type)).toEqual(['prise_rdv', 'ouverture']);
  });

  /**
   * 🔴 ET CE QUI ARRIVE S'AFFICHE TOUJOURS. `rdv_eu_lieu` n'était pas « attendue » (Monga ne l'envoie que dans
   * 3 cas sur 35) ; elle s'affichait quand même quand elle existait. Ce fait-là ne change pas.
   */
  it('🔴 une étape que Monga n’envoie pas toujours s’affiche quand elle existe', () => {
    const { majeures } = construireFrise([etape({ type: 'rdv_eu_lieu' })]);
    expect(majeures.some((c) => c.type === 'rdv_eu_lieu' && c.etape !== null)).toBe(true);
  });

  /**
   * 🔴🔴 LA SUITE RÉELLE D'ARNO, ÉCRITE TELLE QUELLE : « rendez-vous → devis refusé → nouveau rendez-vous →
   * nouveau devis ». C'est l'épreuve qui dit que la frise se CONSTRUIT : aucun de ces quatre carrés n'aurait pu
   * exister sous l'ancienne règle, qui n'admettait qu'un devis et aucun refus.
   */
  it('🔴🔴 la suite réelle d’Arno s’écrit telle quelle, dans l’ordre', () => {
    const { majeures } = construireFrise([
      etape({ id: 1, type: 'prise_rdv', survenuLe: '2026-09-02T00:00:00' }),
      etape({ id: 2, type: 'devis_refuse', survenuLe: '2026-09-10T00:00:00' }),
      etape({ id: 3, type: 'prise_rdv', survenuLe: '2026-09-20T00:00:00' }),
      etape({ id: 4, type: 'devis_recu', survenuLe: '2026-09-28T00:00:00' }),
    ]);
    expect(majeures.map((c) => c.type))
      .toEqual(['prise_rdv', 'devis_refuse', 'prise_rdv', 'devis_recu']);
    /* 🔴 ET LES DEUX RENDEZ-VOUS SE DISTINGUENT : « Prise de rendez-vous 1 » puis « 2 ». */
    expect(majeures.map((c) => c.mot))
      .toEqual(['Prise de rendez-vous 1', 'Devis refusé', 'Prise de rendez-vous 2', 'Devis reçu']);
  });
});

describe('②-bis 🔴 numéroter un type répété', () => {
  /** 🔴 « Chaque type est réutilisable autant de fois que nécessaire (Devis 1, Devis 2…) » — Arno, point 2. */
  it('🔴 deux étapes du même type se numérotent par date', () => {
    const n = numerosDesEtapes([
      etape({ id: 7, type: 'intervention', survenuLe: '2026-09-20T00:00:00' }),
      etape({ id: 3, type: 'intervention', survenuLe: '2026-09-02T00:00:00' }),
    ]);
    expect(n.get(3)).toBe(1);
    expect(n.get(7)).toBe(2);
  });

  /** ⚠️ UN SEUL EXEMPLAIRE N'EST PAS NUMÉROTÉ : « Intervention 1 » ferait croire qu'il en manque une seconde. */
  it('⚠️ un type qui n’apparaît qu’une fois n’est pas numéroté', () => {
    const n = numerosDesEtapes([etape({ id: 1, type: 'intervention' })]);
    expect(n.has(1)).toBe(false);
  });

  /**
   * 🔴🔴 ON COMPTE **DANS SA RÉFÉRENCE**, et c'est la règle mesurée du lot MONGA-2 : un événement peut porter
   * plusieurs interventions Monga, et compter sur l'événement entier ferait écrire « 1 » et « 2 » sur deux faits
   * de DEUX interventions différentes.
   */
  it('🔴🔴 deux références ne se mélangent pas dans le décompte', () => {
    const n = numerosDesEtapes([
      etape({ id: 1, type: 'intervention', reference: 'MNG-10000' }),
      etape({ id: 2, type: 'intervention', reference: 'MNG-20000' }),
    ]);
    expect(n.size).toBe(0);
  });

  /**
   * 🔴🔴 `devis_recu` GARDE SON PROPRE RANG, et il ne faut pas le remplacer par ce compteur-ci : lui seul sait
   * que deux mails portant le MÊME numéro DEV- ne font qu'un seul devis (cas mesuré sur la référence 23449).
   */
  it('🔴🔴 les devis restent hors de ce compteur', () => {
    const n = numerosDesEtapes([
      etape({ id: 1, type: 'devis_recu' }), etape({ id: 2, type: 'devis_recu' }),
    ]);
    expect(n.size).toBe(0);
  });

  /** 🔴 LE TITRE D'UNE CARTE LIBRE L'EMPORTE SUR LE MOT DU TYPE (Arno : « un carré LIBRE (titre à saisir) »). */
  it('🔴 une carte libre porte son titre', () => {
    expect(motDeLaCarte(etape({ type: 'autre', titre: 'Visite du syndic' }), undefined, 0))
      .toBe('Visite du syndic');
  });

  /** ⚠️ ET SANS TITRE, ELLE NE MENT PAS : elle dit ce qu'elle est. L'écran et la route exigent le titre. */
  it('⚠️ une carte libre sans titre garde le mot du type', () => {
    expect(motDeLaCarte(etape({ type: 'autre', titre: null }), undefined, 0)).toBe('Carte libre');
    expect(motDeLaCarte(etape({ type: 'autre', titre: '   ' }), undefined, 0)).toBe('Carte libre');
  });

  /** ⚠️ LE TITRE NE DÉBORDE PAS SUR LES AUTRES TYPES : ailleurs, le mot vient du TYPE, écrit une seule fois. */
  it('⚠️ un titre posé sur un autre type est ignoré', () => {
    expect(motDeLaCarte(etape({ type: 'cloture', titre: 'Visite' }), undefined, 0)).toBe('Clôture');
  });

  /**
   * ══ 🔴🔴 DÉFAUT VU À L'ÉCRAN SUR LOT-237 LE 06/10/2026, ET CORRIGÉ ═════════════════════════════════════════
   *
   * En généralisant la numérotation à tous les types, j'avais laissé tomber une garde de MONGA-2 : « PAS DE
   * “Devis 1” QUAND IL N'Y EN A QU'UN ». La frise affichait donc « Devis 1 » sur un devis unique — ce qui fait
   * croire qu'il en manque d'autres, exactement l'inverse de ce qu'elle doit dire.
   *
   * 🔴 LE COMPTEUR GÉNÉRIQUE N'AVAIT PAS CE DÉFAUT (il ne numérote pas un ensemble d'un seul élément) ; c'est le
   * rang des devis, qui vient du DÉPÔT et vaut 1 même seul, qui demande cette garde explicite.
   */
  it('🔴🔴 un devis seul n’est pas numéroté ; deux le sont', () => {
    const d = etape({ type: 'devis_recu', rangDevis: 1 });
    expect(motDeLaCarte(d, undefined, 1)).toBe('Devis reçu');
    expect(motDeLaCarte(d, undefined, 2)).toBe('Devis 1');
    expect(motDeLaCarte(etape({ type: 'devis_recu', rangDevis: 2 }), undefined, 2)).toBe('Devis 2');
  });

  /** 🔴 ET LA FRISE ENTIÈRE LE TIENT, pas seulement la fonction : un devis unique s'y lit « Devis reçu ». */
  it('🔴🔴 sur la frise, un devis unique se lit « Devis reçu »', () => {
    const { majeures } = construireFrise([etape({ type: 'devis_recu', rangDevis: 1 })]);
    expect(majeures[0].mot).toBe('Devis reçu');
  });
});

describe('②-ter 🔴 « ajoutée le 06/10 à 22:31 par Arnaud »', () => {
  /** 🔴 Arno, point 3 : la date et l'heure de CRÉATION, et l'auteur, visibles au survol. */
  it('🔴 la mention dit quand et par qui', () => {
    expect(motAjout('2026-10-06T22:31:04', 'Arnaud')).toBe('ajoutée le 06/10 à 22:31 par Arnaud');
  });

  /** ⚠️ AUTEUR INCONNU : on ne l'invente pas. */
  it('⚠️ sans auteur, la mention dit seulement quand', () => {
    expect(motAjout('2026-10-06T22:31:04', null)).toBe('ajoutée le 06/10 à 22:31');
    expect(motAjout('2026-10-06T22:31:04', '  ')).toBe('ajoutée le 06/10 à 22:31');
  });

  /** ⚠️ SANS DATE DE POSE, AUCUNE MENTION : une mention vide vaut mieux qu'une mention fausse. */
  it('⚠️ sans date de création, rien', () => {
    expect(motAjout(null, 'Arnaud')).toBeNull();
    expect(motAjout('', 'Arnaud')).toBeNull();
  });
});

describe('③ les repères ne sont pas des étapes', () => {
  /** 🔴 « Ce ne sont pas des étapes » (Arno). Les mêler aurait noyé huit étapes sous cinquante-trois commentaires. */
  it('🔴🔴 commentaires, rappels, factures et injoignables sortent à part', () => {
    const { majeures, reperes } = construireFrise([
      etape({ type: 'commentaire' }), etape({ type: 'rappel_devis' }),
      etape({ type: 'facture' }), etape({ type: 'contact_injoignable' }),
      etape({ type: 'prise_rdv' }),
    ]);
    expect(reperes.map((r) => r.type).sort())
      .toEqual(['commentaire', 'contact_injoignable', 'facture', 'rappel_devis']);
    expect(majeures.filter((c) => c.etape !== null).map((c) => c.type)).toEqual(['prise_rdv']);
  });

  it('🔴 les repères gardent leur ordre chronologique', () => {
    const { reperes } = construireFrise([
      etape({ type: 'commentaire', survenuLe: '2026-10-05T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-01T00:00:00' }),
    ]);
    expect(reperes.map((r) => r.survenuLe)).toEqual(['2026-09-01T00:00:00', '2026-10-05T00:00:00']);
  });
});

describe('④ les devis', () => {
  /**
   * ⚠️ PAS DE « Devis 1 » QUAND IL N'Y EN A QU'UN. Numéroter un ensemble d'un seul élément fait croire qu'il en
   * manque d'autres — exactement l'inverse de ce que la frise doit dire. Et c'est le cas ORDINAIRE : l'audit a
   * mesuré qu'aucune référence ne reçoit deux devis de numéros différents par mail.
   */
  it('⚠️ un devis seul ne porte pas de numéro d’ordre', () => {
    expect(motDeLaCase(etape({ type: 'devis_recu', rangDevis: 1 }), 'devis_recu', 1)).toBe('Devis reçu');
  });

  it('🔴 plusieurs devis portent leur rang', () => {
    expect(motDeLaCase(etape({ type: 'devis_recu', rangDevis: 2 }), 'devis_recu', 3)).toBe('Devis 2');
  });

  it('🔴 le montant s’écrit en euros, et son absence est une absence', () => {
    expect(motMontant(88550)).toBe('885,50 €');
    expect(motMontant(0)).toBe('0,00 €');
    expect(motMontant(null)).toBeNull();
  });
});

describe('⑤ la source, et le mail d’origine', () => {
  it('🔴 Monga, ou le nom de qui a posé l’étape', () => {
    expect(motSource(etape({ source: 'monga' }))).toBe('Monga');
    expect(motSource(etape({ source: 'manuelle', creeParLibelle: 'a.jorel' }))).toBe('ajoutée par a.jorel');
  });

  /** ⚠️ UNE ÉTAPE MANUELLE SANS AUTEUR CONNU NE MENT PAS : elle le dit, sans inventer un nom. */
  it('⚠️ sans auteur connu, « ajoutée à la main »', () => {
    expect(motSource(etape({ source: 'manuelle', creeParLibelle: null }))).toBe('ajoutée à la main');
    expect(motSource(etape({ source: 'manuelle', creeParLibelle: '  ' }))).toBe('ajoutée à la main');
  });

  /**
   * 🔴🔴 LA PHRASE QUI JUSTIFIE TOUT LE POINT 2. « un clic sur une étape Monga ouvre le mail d'origine s'il
   * existe encore (sinon : “mail supprimé — étape conservée”) » — Arno. Sans la table des étapes, il n'y aurait
   * rien à conserver : 25 des 98 mails Monga étaient déjà à la corbeille au moment du lot.
   */
  it('🔴🔴 une étape dont le mail n’existe plus le DIT, et n’est pas cliquable', () => {
    const perdue = etape({ source: 'monga', filId: null, messageId: null, aEuUnMail: true });
    expect(motMailDOrigine(perdue)).toBe('mail supprimé — étape conservée');
    expect(etapeOuvrable(perdue)).toBe(false);
  });

  it('🔴 une étape dont le mail vit encore est cliquable', () => {
    expect(etapeOuvrable(etape({ source: 'monga', filId: 10 }))).toBe(true);
    expect(motMailDOrigine(etape({ source: 'monga', filId: 10 }))).toBe('Voir le mail d’origine');
  });

  /**
   * 🔴🔴 « MAIL SUPPRIMÉ » NE SE DIT QUE D'UN MAIL QUI A EXISTÉ — défaut trouvé à l'écran le 06/10/2026.
   *
   * Les 33 ouvertures de repli sont DÉDUITES de la date du premier mail et n'en ont jamais eu : elles
   * annonçaient toutes « mail supprimé — étape conservée ». On annonçait une suppression qui n'avait pas eu
   * lieu, et c'est le genre de fausseté qui fait douter de tout le reste de la frise.
   */
  it('🔴🔴 une étape DÉDUITE ne prétend pas qu’un mail a été supprimé', () => {
    const deduite = etape({ source: 'monga', filId: null, messageId: null, aEuUnMail: false });
    expect(motMailDOrigine(deduite)).toBe('étape déduite — aucun mail');
    expect(etapeOuvrable(deduite)).toBe(false);
  });

  /** ⚠️ UNE ÉTAPE MANUELLE N'A PAS DE MAIL D'ORIGINE, et ne prétend pas en avoir un. */
  it('⚠️ une étape manuelle n’est jamais ouvrable', () => {
    expect(motMailDOrigine(etape({ source: 'manuelle' }))).toBeNull();
    expect(etapeOuvrable(etape({ source: 'manuelle', filId: 10 }))).toBe(false);
  });
});

describe('⑥ la date affichée', () => {
  it('🔴 sans heure connue, le jour seul', () => {
    expect(motDateEtape(etape({ survenuLe: '2026-10-09T00:00:00', heureConnue: false }))).toBe('09/10/2026');
  });

  /**
   * 🔴🔴 L'HEURE NE S'AFFICHE QUE SI ELLE EST CONNUE. Sans ce drapeau, tout rendez-vous sans heure se lirait
   * « à 00h00 » — ce qui est faux, et se voit.
   */
  it('🔴🔴 avec heure et fin, la plage entière', () => {
    expect(motDateEtape(etape({ survenuLe: '2026-10-09T10:30:00', heureConnue: true, heureFin: '11:00' })))
      .toBe('09/10/2026 de 10:30 à 11:00');
  });

  it('⚠️ la variante « vers » n’a pas de fin', () => {
    expect(motDateEtape(etape({ survenuLe: '2026-05-13T10:00:00', heureConnue: true, heureFin: null })))
      .toBe('13/05/2026 à 10:00');
  });

  /**
   * 🔴 AUCUN `new Date()` DANS CE MODULE : le fuseau du lecteur ne doit pas changer le jour affiché d'un
   * rendez-vous. Un mail annonçant le 09/10 à 00:30 se lirait « 08/10 » pour qui lit depuis l'ouest.
   */
  it('🔴 la date se lit par découpage, jamais par un objet Date', () => {
    const src = readFileSync('app/lib/gestion/frise.ts', 'utf8');
    expect(src).not.toContain('new Date(');
    expect(src).not.toContain('Date.parse');
  });
});

describe('⑦ une étape écartée ne revient pas', () => {
  /**
   * ⚠️ LE DÉPÔT NE LES REND DÉJÀ PAS (`statut = 'vif'`). Ce module filtre quand même : un appelant futur
   * pourrait les lui passer, et une étape écartée réapparue sur la frise serait un démenti silencieux du geste
   * qui l'a écartée.
   */
  it('⚠️ filtrée ici aussi, en ceinture et bretelles', () => {
    const { majeures, reperes } = construireFrise([
      etape({ type: 'prise_rdv', certitude: 'ecartee' }),
      etape({ type: 'commentaire', certitude: 'ecartee' }),
    ]);
    expect(majeures.every((c) => c.etape === null)).toBe(true);
    expect(reperes).toHaveLength(0);
  });
});

describe('⑧ le module reste pur', () => {
  it('🔴🔴 aucun accès base ni réseau : il est lu par un composant client', () => {
    const src = readFileSync('app/lib/gestion/frise.ts', 'utf8');
    expect(src).not.toContain('fetch(');
    expect(src).not.toMatch(/from '.*Repo'/);
    expect(src).not.toContain("from 'pg'");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-HORIZONTALE — LA MISE EN LIGNE ══════════════════════════════════════════════════════════════
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑨ la frise en ligne : carrés, points et « + »', () => {
  const ligne = (etapes: EtapeAAfficher[], ouvertLe?: string | null) => {
    const { majeures, reperes } = construireFrise(etapes, ouvertLe);
    return rangerEnLigne(majeures, reperes, AUJOURDHUI);
  };

  /**
   * ══ 🔴🔴 CE QUE CETTE ÉPREUVE DISAIT AVANT, ET POURQUOI LE VERDICT A CHANGÉ ════════════════════════════════
   *
   * Elle s'appelait « le “+” se place après le dernier carré atteint, AVANT LES POINTILLÉS » et vérifiait que
   * tout ce qui suivait le « + » était un carré sans étape. Il n'y a plus de carré sans étape (accord d'Arno) :
   * le « + » FERME donc la marche, et c'est le fait qu'il faut tenir maintenant.
   *
   * 🔴 ARNO, POINT 1 : « le carré “Ouverture” […] SUIVI d'un carré “+” rouge. » Le gros « + » est toujours le
   * dernier élément de la ligne.
   */
  it('🔴🔴 le gros « + » ferme toujours la marche', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    expect(l[l.length - 1].sorte).toBe('plus');
    expect(l.filter((e) => e.sorte === 'plus')).toHaveLength(1);
  });

  /**
   * 🔴🔴 LA FRISE DE DÉPART, MOT POUR MOT (Arno, point 1) : « AU DÉPART : la frise montre seulement le carré
   * “Ouverture” (date d'ouverture de l'événement, modifiable), suivi d'un carré “+” rouge. »
   *
   * ⚠️ CETTE ÉPREUVE VÉRIFIAIT AVANT que le « + » venait en PREMIER, suivi de sept pointillés. Deux choses ont
   * changé d'un coup : il n'y a plus de pointillés, et il y a désormais une carte d'ouverture.
   */
  it('🔴🔴 au départ : l’ouverture, puis le « + », et rien d’autre', () => {
    const l = ligne([], '2026-09-01T12:00:00');
    expect(l.map((e) => e.sorte)).toEqual(['carre', 'plus']);
    expect(l[0].case?.type).toBe('ouverture');
    expect(l[0].case?.sorte).toBe('ouverture');
  });

  /**
   * 🔴🔴 LES « + » INTERCALAIRES (Arno, point 4) : « entre deux carrés consécutifs, un petit “+” encapsulé […]
   * ouvre le même réservoir, avec une date proposée entre celles des deux voisins ».
   *
   * ⚠️ IL Y EN A UN DE MOINS QUE DE CARRÉS : aucun après le dernier, où se trouve le gros « + ». Deux « + »
   * collés l'un à l'autre n'apprendraient rien de plus.
   */
  it('🔴🔴 un « + » intercalaire entre chaque paire de carrés, et pas après le dernier', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
      etape({ type: 'cloture', survenuLe: '2026-10-05T00:00:00' }),
    ]);
    expect(l.filter((e) => e.sorte === 'carre')).toHaveLength(3);
    expect(l.filter((e) => e.sorte === 'plus-entre')).toHaveLength(2);
    expect(l.map((e) => e.sorte))
      .toEqual(['carre', 'plus-entre', 'carre', 'plus-entre', 'carre', 'plus']);
  });

  /** 🔴 ET CHACUN PROPOSE UNE DATE ENTRE SES DEUX VOISINES (Arno, point 4). */
  it('🔴🔴 la date proposée tombe entre les deux voisines', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'cloture', survenuLe: '2026-09-11T00:00:00' }),
    ]);
    const entre = l.find((e) => e.sorte === 'plus-entre');
    expect(entre?.jourPropose).toBe('2026-09-06');
  });

  /** ⚠️ UN SEUL CARRÉ : aucun intercalaire, il n'y a pas d'« entre ». */
  it('⚠️ un seul carré ne produit aucun « + » intercalaire', () => {
    const l = ligne([etape({ type: 'ouverture' })]);
    expect(l.filter((e) => e.sorte === 'plus-entre')).toHaveLength(0);
  });

  /**
   * 🔴🔴 LES POINTS SE PLACENT ENTRE LES CARRÉS, À LEUR PLACE CHRONOLOGIQUE (Arno). Un message du 14/09 tombe
   * après le carré du 14/09 et avant celui du 16/09 — c'est la seule façon de lire un dossier sans se demander
   * quand le commentaire est arrivé.
   */
  it('🔴🔴 les messages informatifs tombent à leur place dans le temps', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-10T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    const i = l.findIndex((e) => e.sorte === 'points');
    const iOuv = l.findIndex((e) => e.case?.etape?.type === 'ouverture');
    const iRdv = l.findIndex((e) => e.case?.etape?.type === 'prise_rdv');
    expect(iOuv).toBeLessThan(i);
    expect(i).toBeLessThan(iRdv);
  });

  /** 🔴 PLUSIEURS MESSAGES RAPPROCHÉS SE GROUPENT, et le groupe les garde dans l'ordre. */
  it('🔴 des messages du même intervalle se groupent, dans l’ordre', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-12T00:00:00', texte: 'deux' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-10T00:00:00', texte: 'un' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    const groupe = l.find((e) => e.sorte === 'points');
    expect(groupe?.messages).toHaveLength(2);
    expect(groupe?.messages?.map((m) => m.texte)).toEqual(['un', 'deux']);
  });

  /**
   * ⚠️ CE QUI EST ARRIVÉ APRÈS LE DERNIER CARRÉ SE POSE AVANT LE GROS « + » : eux aussi ont eu lieu, et le
   * « + » n'est pas un fait. (L'épreuve disait avant « pas entre les pointillés » ; il n'y en a plus, mais la
   * position relative qu'elle tenait est exactement la même.)
   */
  it('⚠️ un message postérieur au dernier carré se pose AVANT le « + »', () => {
    const l = ligne([
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-12-31T00:00:00' }),
    ]);
    const iPts = l.findIndex((e) => e.sorte === 'points');
    const iPlus = l.findIndex((e) => e.sorte === 'plus');
    expect(iPts).toBeGreaterThan(0);
    expect(iPts).toBeLessThan(iPlus);
  });

  /** 🔴 AUCUNE ÉTAPE NI AUCUN MESSAGE NE SE PERD en passant en ligne : la suite les porte tous. */
  it('🔴 rien ne se perd : autant de carrés et de messages qu’avant', () => {
    const etapes = [
      etape({ type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ type: 'commentaire', survenuLe: '2026-09-10T00:00:00' }),
      etape({ type: 'rappel_devis', survenuLe: '2026-09-11T00:00:00' }),
      etape({ type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ];
    const { majeures, reperes } = construireFrise(etapes);
    const l = rangerEnLigne(majeures, reperes, AUJOURDHUI);
    expect(l.filter((e) => e.sorte === 'carre')).toHaveLength(majeures.length);
    expect(l.flatMap((e) => e.messages ?? [])).toHaveLength(reperes.length);
  });
});

describe('⑩ sur quoi la frise s’ouvre', () => {
  /** 🔴 « À l'ouverture, la frise est positionnée pour montrer la DERNIÈRE ÉTAPE ATTEINTE » (Arno). */
  it('🔴 la dernière atteinte, et non la première carte', () => {
    const { majeures } = construireFrise([
      etape({ id: 1, type: 'ouverture', survenuLe: '2026-09-01T00:00:00' }),
      etape({ id: 2, type: 'prise_rdv', survenuLe: '2026-09-15T00:00:00' }),
    ]);
    expect(cleDOuverture(majeures)).toBe('e2');
  });

  /** ⚠️ RIEN D'ATTEINT : `null`, et l'écran reste au début — là où se trouve justement le « + ». */
  it('⚠️ sans rien d’atteint, aucun calage', () => {
    const { majeures } = construireFrise([]);
    expect(cleDOuverture(majeures)).toBeNull();
  });
});

describe('⑪ le pictogramme de source', () => {
  it('🔴 Monga et la main se distinguent', () => {
    expect(pictoSource(etape({ source: 'monga' }))).toBe('◆');
    expect(pictoSource(etape({ source: 'manuelle' }))).toBe('✎');
  });

  it('🔴 le compteur de messages s’accorde', () => {
    expect(motGroupeMessages(0)).toBe('0 message');
    expect(motGroupeMessages(1)).toBe('1 message');
    expect(motGroupeMessages(3)).toBe('3 messages');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — LA DATE PROPOSÉE PAR UN « + » INTERCALAIRE ══════════════════════════════════
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑫ l’arithmétique des jours, sans objet Date', () => {
  /**
   * 🔴🔴 ALLER-RETOUR EXACT SUR LES CAS QUI CASSENT LES CALENDRIERS ÉCRITS À LA MAIN : fin de mois, année
   * bissextile, 29 février, siècle non bissextile (1900), siècle bissextile (2000).
   */
  it('🔴🔴 jour → nombre → jour rend exactement le même jour', () => {
    for (const j of ['1970-01-01', '1900-02-28', '1900-03-01', '2000-02-29', '2024-02-29',
      '2026-01-31', '2026-03-01', '2026-12-31', '2100-03-01']) {
      expect(nombreEnJour(jourEnNombre(j)), j).toBe(j);
    }
  });

  it('🔴 l’époque vaut zéro, et le jour suivant un', () => {
    expect(jourEnNombre('1970-01-01')).toBe(0);
    expect(jourEnNombre('1970-01-02')).toBe(1);
    expect(nombreEnJour(0)).toBe('1970-01-01');
  });

  /** 🔴 LES ÉCARTS SONT JUSTES, Y COMPRIS À TRAVERS UN 29 FÉVRIER. */
  it('🔴 l’écart entre deux jours est exact', () => {
    expect(jourEnNombre('2024-03-01') - jourEnNombre('2024-02-28')).toBe(2);
    expect(jourEnNombre('2026-03-01') - jourEnNombre('2026-02-28')).toBe(1);
    expect(jourEnNombre('2027-01-01') - jourEnNombre('2026-01-01')).toBe(365);
  });
});

describe('⑬ la date qu’un « + » intercalaire propose', () => {
  /** 🔴 « une date proposée entre celles des deux voisins » (Arno, point 4). Le milieu, arrondi vers le bas. */
  it('🔴🔴 entre deux voisines, le milieu', () => {
    expect(jourIntercalaire('2026-09-01', '2026-09-11', AUJOURDHUI)).toBe('2026-09-06');
    expect(jourIntercalaire('2026-09-01T08:00:00', '2026-09-05T23:00:00', AUJOURDHUI)).toBe('2026-09-03');
  });

  /** ⚠️ DEUX VOISINES LE MÊME JOUR : ce jour-là, et rien d'autre à proposer. */
  it('⚠️ deux voisines du même jour proposent ce jour', () => {
    expect(jourIntercalaire('2026-09-01', '2026-09-01', AUJOURDHUI)).toBe('2026-09-01');
  });

  /** ⚠️ DEUX JOURS CONSÉCUTIFS : le premier des deux. On ne peut pas faire mieux sans inventer une heure. */
  it('⚠️ deux jours consécutifs proposent le premier', () => {
    expect(jourIntercalaire('2026-09-01', '2026-09-02', AUJOURDHUI)).toBe('2026-09-01');
  });

  /**
   * ⚠️ SANS VOISINE À DROITE, AUJOURD'HUI — sauf si cela remonterait AVANT la voisine de gauche. Une frise dont
   * la dernière carte est datée du futur (un rendez-vous fixé la semaine prochaine) ne doit pas proposer une
   * date antérieure à elle.
   */
  it('⚠️ sans voisine à droite : aujourd’hui, jamais avant la voisine de gauche', () => {
    expect(jourIntercalaire('2026-09-01', null, AUJOURDHUI)).toBe(AUJOURDHUI);
    expect(jourIntercalaire('2026-12-25', null, AUJOURDHUI)).toBe('2026-12-25');
  });

  /** ⚠️ AUCUNE VOISINE : aujourd'hui, et c'est ce que le gros « + » propose. */
  it('⚠️ sans aucune voisine, aujourd’hui', () => {
    expect(jourIntercalaire(null, null, AUJOURDHUI)).toBe(AUJOURDHUI);
    expect(jourIntercalaire(null, '2026-09-01', AUJOURDHUI)).toBe('2026-09-01');
  });

  /**
   * 🔴 LA DATE PROPOSÉE TOMBE TOUJOURS DANS L'INTERVALLE [gauche, droite] — la propriété qui compte, éprouvée
   * sur une plage entière plutôt que sur trois exemples choisis.
   */
  it('🔴🔴 la proposition ne sort jamais de l’intervalle', () => {
    const debut = jourEnNombre('2026-01-01');
    for (let a = 0; a < 200; a += 7) {
      for (let d = 0; d < 60; d += 3) {
        const g = nombreEnJour(debut + a);
        const dr = nombreEnJour(debut + a + d);
        const p = jourIntercalaire(g, dr, AUJOURDHUI);
        expect(p >= g && p <= dr, `${g} → ${dr} a proposé ${p}`).toBe(true);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-COULEURS-DATES (08/10/2026) — LA COULEUR ET LA DATE D'UNE CARTE, EN RÈGLES PURES ═════════════

   DEMANDE D'ARNO :
     · « Carte “Clôture” (et “Clôture Monga” une fois validée) : ENTIÈREMENT verte, contour ET fond […] Cartes
       “Ouverture” et “Réouverture” : contour ROUGE. Toutes les autres cartes : contour VERT. »
     · « Cartes “Ouverture”, “Clôture” et “Réouverture” : leur date est écrite en GRAS, CENTRÉE dans la carte.
       Pas de date de création en dessous. Toutes les autres cartes : sous la carte […] la date à laquelle la
       carte a été CRÉÉE […] par exemple “créée le 08/10/2026”. »
     · « Si elle ne l'est pas pour les anciennes cartes, n'invente pas de date : affiche “date de création
       inconnue” en gris. […] Pas de migration qui fabrique des dates. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑭ la couleur d’une carte posée sur la frise', () => {
  /**
   * 🔴🔴 LES TROIS SORTES, ET ELLES COUVRENT TOUS LES TYPES. L'épreuve ne choisit pas trois exemples : elle
   * passe sur la liste ENTIÈRE des types, de sorte qu'un type ajouté demain soit forcément classé.
   */
  it('🔴🔴 « Ouverture » et « Réouverture » sont les deux cartes de DÉBUT', () => {
    expect(couleurDeLaCarte('ouverture')).toBe('debut');
    expect(couleurDeLaCarte('reouverture')).toBe('debut');
  });

  it('🔴🔴 « Clôture » a sa sorte à elle — la carte entièrement verte', () => {
    expect(couleurDeLaCarte('cloture')).toBe('cloture');
  });

  /** 🔴 « Toutes les autres cartes : contour VERT (comme aujourd'hui) » — donc `ordinaire`, et pas une de plus. */
  it('🔴🔴 tout le reste est ordinaire, et le reste veut dire TOUT le reste', () => {
    for (const t of TYPES_AJOUTABLES) {
      if (t === 'ouverture' || t === 'reouverture' || t === 'cloture') continue;
      expect(couleurDeLaCarte(t), t).toBe('ordinaire');
    }
    /* ⚠️ LES REPÈRES AUSSI, même s'ils s'affichent en POINT : la fonction ne doit pas pouvoir rendre `undefined`. */
    for (const t of REPERES) expect(couleurDeLaCarte(t), t).toBe('ordinaire');
  });

  /**
   * 🔴🔴 LES TROIS CARTES DE BORNE SONT LES MÊMES DES DEUX CÔTÉS — couleur particulière ET date au centre. Ce
   * n'est pas une coïncidence : ce sont celles qui disent QUAND une période commence ou s'arrête.
   */
  it('🔴🔴 les cartes à date centrée sont exactement les cartes non ordinaires', () => {
    expect([...TYPES_BORNE]).toEqual(['ouverture', 'cloture', 'reouverture']);
    for (const t of [...TYPES_AJOUTABLES, ...REPERES]) {
      expect(dateAuCentre(t), t).toBe(couleurDeLaCarte(t) !== 'ordinaire');
    }
  });
});

describe('⑮ « créée le … », et l’aveu quand on ne sait pas', () => {
  /** 🔴 L'EXEMPLE D'ARNO, MOT POUR MOT — avec l'année en entier, parce que la frise mêle plusieurs années. */
  it('🔴🔴 « créée le 08/10/2026 », exactement', () => {
    expect(mentionCreation('2026-10-08T22:31:04')).toEqual({ mot: 'créée le 08/10/2026', connue: true });
    /* ⚠️ L'ESPACE DE POSTGRES COMME LE « T » DE L'ISO : le dépôt rend `cree_le::text`, qui emploie l'espace. */
    expect(mentionCreation('2026-10-08 22:31:04+02')).toEqual({ mot: 'créée le 08/10/2026', connue: true });
    /* ⚠️ UN JOUR SEUL SUFFIT : on ne veut que le jour, jamais l'heure. */
    expect(mentionCreation('2026-01-03')).toEqual({ mot: 'créée le 03/01/2026', connue: true });
  });

  /**
   * 🔴🔴 ELLE N'INVENTE JAMAIS DE DATE (Arno : « n'invente pas de date »). Mesuré le 08/10/2026 : **0 carte**
   * sur les 162 de la base est sans `cree_le` — la colonne est `NOT NULL DEFAULT now()`. Cette branche couvre
   * le type `string | null` du dépôt, et elle reste juste si une donnée importée arrivait un jour sans date.
   */
  it('🔴🔴 sans date, elle l’avoue, et ne fabrique rien', () => {
    for (const v of [null, '', 'bientot', '2026', '2026-10', '26-10-08', '2026-1-8']) {
      expect(mentionCreation(v), String(v)).toEqual({ mot: 'date de création inconnue', connue: false });
    }
  });

  /** ⚠️ `connue` EST CE QUI DÉCIDE DE LA COULEUR À L'ÉCRAN : vert quand on sait, gris quand on ne sait pas. */
  it('⚠️ elle dit si la date est connue, et l’écran s’en sert pour le gris', () => {
    expect(mentionCreation('2026-10-08T00:00:00').connue).toBe(true);
    expect(mentionCreation(null).connue).toBe(false);
  });

  /**
   * ⚠️ AUCUN OBJET DE DATE CONSTRUIT : à 23 h à Paris, il rendrait déjà le lendemain. C'est le même découpage
   * que `motAjout` et `motDateEtape`, et l'épreuve de pureté du module (⑪) le tient pour tout le fichier.
   */
  it('⚠️ elle ne décale rien, quelle que soit l’heure', () => {
    expect(mentionCreation('2026-10-08T23:59:59').mot).toBe('créée le 08/10/2026');
    expect(mentionCreation('2026-10-08T00:00:00').mot).toBe('créée le 08/10/2026');
  });
});
