import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AUCUN_BIEN_DU_MAIL, biensDuMail, MENTION_AJOUT_PONCTUEL, MOTIF_AJOUT_PONCTUEL, TITRE_BIENS_DU_MAIL,
} from './ficheRattachement';
import { MOTIF_POSE_PAR_SUIVI } from './periodeRepo';

/**
 * ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE, POINT 1 — « BIEN(S) DE CE MAIL » ═════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), fil 3490 (« Réfrigérateur-congélateur en panne… », TCS) : il a rattaché un mail à
 * UN SEUL bien (2 Square Henri Régnault, lot 484), et la fenêtre « Visualiser / Modifier » lui montrait AUSSI les
 * lots 247, 282, 169, 491 et 4, marqués « À trancher ». « On n'y comprend rien. »
 *
 * 🔴 CE QUE LA BASE DIT. Le moteur pose un lien `statut='propose'` sur CHAQUE mail pour CHAQUE bien possible de
 * l'expéditeur : relevé sur ce fil, le mail 57472 en porte cinq, plus le bien confirmé. Ces propositions servent
 * la modale « Rattacher ce mail à… » ; elles n'ont rien à faire dans une fenêtre qui dit à quoi ce mail EST
 * rattaché.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les liens du fil 3490, tels qu'ils sont en base — recopiés à l'identique. */
const LIENS = [
  { id: 139584, messageId: 5495, statut: 'confirme', motif: null },
  { id: 138680, messageId: 5495, statut: 'propose', motif: null },
  { id: 53518, messageId: 5495, statut: 'retire', motif: null },
  { id: 172477, messageId: 5499, statut: 'confirme', motif: 'rattaché à la main' },
  { id: 138681, messageId: 5499, statut: 'propose', motif: null },
  { id: 139712, messageId: 57122, statut: 'confirme', motif: null },
  { id: 139708, messageId: 57122, statut: 'propose', motif: null },
  { id: 139709, messageId: 57122, statut: 'propose', motif: null },
];

const BIEN = (cle: string, lienIds: number[], statut: 'auto' | 'classe' | 'a_trancher' = 'auto') =>
  ({ cle, lienIds, nbMails: 6, statut });

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA FENÊTRE SE LIMITE AUX BIENS DE CE MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① seuls les biens rattachés à CE mail', () => {
  it('🔴🔴 le cas d’Arno : un seul bien, et plus aucune carte « À trancher »', () => {
    const biens = [
      BIEN('484', [139584, 172477, 139712]),
      BIEN('247', [138680, 138681], 'a_trancher'),
      BIEN('169', [139708], 'a_trancher'),
      BIEN('282', [139709], 'a_trancher'),
    ];
    const r = biensDuMail(biens, LIENS, 5495);
    expect(r.map((b) => b.cle)).toEqual(['484']);
    expect(r[0].statut).not.toBe('a_trancher');
  });

  /** 🔴 UN LIEN `propose` N'EST PAS UN RATTACHEMENT : c'est une proposition, et elle reste dans la modale. */
  it('🔴🔴 un mail qui n’a que des propositions n’a aucun bien', () => {
    const biens = [BIEN('247', [138680, 138681], 'a_trancher'), BIEN('169', [139708], 'a_trancher')];
    expect(biensDuMail(biens, LIENS, 5495)).toEqual([]);
  });

  /** 🔴 UN LIEN `retire` EST MORT : il ne rattache plus rien. */
  it('🔴 un lien retiré ne compte pas', () => {
    expect(biensDuMail([BIEN('358', [53518])], LIENS, 5495)).toEqual([]);
  });

  /**
   * ⚠️ LA CARTE NE PARLE QUE DE CE MAIL : « sur 1 mail », et « Voir le détail par mail » ne montre que ses liens.
   * Sans cela, elle annoncerait « sur 6 mails de la conversation » dans une fenêtre qui n'en montre qu'un.
   */
  it('⚠️ le compte de mails et les liens sont ramenés à ce seul mail', () => {
    const r = biensDuMail([BIEN('484', [139584, 172477, 139712])], LIENS, 57122);
    expect(r[0].nbMails).toBe(1);
    expect(r[0].lienIds).toEqual([139712]);
  });

  it('⚠️ un mail inconnu du fil ne rend rien, sans lever', () => {
    expect(biensDuMail([BIEN('484', [139584])], LIENS, 999999)).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② L'AJOUT PONCTUEL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② l’ajout ponctuel se reconnaît et se dit', () => {
  const PONCTUEL = [...LIENS,
    { id: 900001, messageId: 5495, statut: 'confirme', motif: MOTIF_AJOUT_PONCTUEL }];

  it('🔴🔴 un bien ajouté ponctuellement est marqué', () => {
    const r = biensDuMail([BIEN('491', [900001], 'a_trancher')], PONCTUEL, 5495);
    expect(r).toHaveLength(1);
    expect(r[0].ponctuel).toBe(true);
    /* 🔴 ET IL N'EST PLUS « À trancher » : c'est un rattachement, décidé à la main. */
    expect(r[0].statut).toBe('classe');
  });

  /**
   * 🔴 UN BIEN RATTACHÉ **AUSSI** PAR LA CONVERSATION N'EST PAS PONCTUEL. L'annoncer comme tel ferait croire
   * qu'il s'en ira tout seul, alors que la conversation le porte.
   */
  it('🔴 un bien porté par les deux voies n’est pas « ponctuel »', () => {
    const r = biensDuMail([BIEN('484', [139584, 900001])], PONCTUEL, 5495);
    expect(r[0].ponctuel).toBe(false);
  });

  it('⚠️ un bien ordinaire ne porte pas la mention', () => {
    expect(biensDuMail([BIEN('484', [139584])], LIENS, 5495)[0].ponctuel).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LA PROMESSE : AUCUNE INFLUENCE SUR LES FENÊTRES DE SUIVI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ un ajout ponctuel ne touche à aucune période', () => {
  /**
   * 🔴🔴 LA PROMESSE TIENT À DEUX FAITS DU CODE, et ce bloc les vérifie tous les deux :
   *   ① le geste POSE UN LIEN et rien d'autre — aucune période, aucune exception, donc aucun repère possible ;
   *   ② `projeterLeFil` ne retire QUE ce qu'elle a posé elle-même (`MOTIF_POSE_PAR_SUIVI`), et le motif d'un
   *      ajout ponctuel est DIFFÉRENT — il ne sera donc jamais défait par une projection.
   */
  const menu = readFileSync('app/(admin)/admin/(protected)/gestion/MenuRattachementBien.tsx', 'utf8');
  const code = menu.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  it('🔴🔴 le geste n’écrit QU’un rattachement : ni période, ni exception', () => {
    expect(code).toContain("fetch('/api/admin/gestion/rattachements'");
    for (const interdit of ['/periodes', '/suivi', 'exception', 'periode']) {
      expect(code, interdit).not.toContain(interdit);
    }
  });

  it('🔴🔴 son motif est distinct de celui du suivi, donc la projection n’y touche jamais', () => {
    expect(MOTIF_AJOUT_PONCTUEL).not.toBe(MOTIF_POSE_PAR_SUIVI);
    expect(code).toContain('ponctuel\n                ? MOTIF_AJOUT_PONCTUEL');
  });

  /**
   * 🔴 ET LA PORTÉE EST FIGÉE : « ponctuel » veut dire ce mail, et le choix n'est pas offert.
   *
   * ⚠️ LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT — LE PIED EST DÉSORMAIS FOURNISSABLE PAR L'APPELANT (`pied`),
   * et la fenêtre « Visualiser / Modifier » s'en sert pour son encadré d'exception. Le mode ponctuel, lui, est
   * intact : c'est la branche qui suit, et c'est elle qu'on fige ici.
   */
  it('🔴 aucune portée à choisir en ajout ponctuel', () => {
    expect(code).toContain('pied !== undefined ? pied : ponctuel ? (');
    expect(code).toContain('mrb-ponctuel');
  });

  /** 🔴 LES PROPOSITIONS SONT DÉCOCHÉES : on ajoute un bien qu'on a en tête, on ne valide pas le moteur. */
  it('🔴 aucune pré-coche en ajout ponctuel', () => {
    expect(code).toContain('(ponctuel ? [] : (d.contexte.biens ?? []).filter((b) => b.recommande)');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES MOTS, ET LA FENÊTRE QUI LES EMPLOIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ ce que la fenêtre écrit', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 2 — IL N'Y A PLUS QU'UNE FENÊTRE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════

     CONSTAT D'ARNO (03/10/2026) : « depuis la LIGNE de la Réception (fil 3490), la fenêtre “Bien(s) de cet
     échange” affiche ENCORE tous les biens proposés pour l'expéditeur (lots 247, 282, 169, 491, 4 — “À
     trancher”). Ton lot a7f5f968 n'a corrigé que la fenêtre ouverte depuis un mail. »

     🔴 LA CAUSE TENAIT À LA CONDITION QUE CE FICHIER FIGEAIT : `messageId === null ? … : …`. Deux
     comportements dans une seule fenêtre, et l'un des deux rendait `fiche.biens` tel quel — propositions
     comprises. Corriger un seul des deux chemins ne pouvait pas suffire ; il fallait qu'il n'y en ait plus
     qu'un. Les trois épreuves qui figeaient les DEUX comportements sont donc remplacées par celles qui
     figent l'UNIQUE.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  it('🔴🔴 un seul titre, et il parle du MAIL', () => {
    /* 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — « RATTACHÉ(S) » DIT CE QUE LA FENÊTRE MONTRE. « Bien(s) de ce
       mail » pouvait se lire « les biens dont ce mail parle », c'est-à-dire les propositions ; la fenêtre, elle,
       ne montre que les liens vivants et confirmés. Mot d'Arno, à la lettre. */
    expect(TITRE_BIENS_DU_MAIL).toBe('Bien(s) rattaché(s) à ce mail');
    expect(src).toContain('<h2 className="mrt-titre" id="rdf-titre">{TITRE_BIENS_DU_MAIL}</h2>');
    /* 🔴 ET « Bien(s) de cet échange » N'EST PLUS EMPLOYÉ NULLE PART : un rattachement se pose sur un MAIL,
       « les biens de l'échange » était une somme — et une somme ne se modifie pas. */
    expect(src).not.toContain('TITRE_BIENS_DE_L_ECHANGE');
  });

  it('🔴🔴 les biens affichés sont TOUJOURS ceux du mail, sans condition', () => {
    expect(src).toContain('biensDuMail(fiche.biens, tousLesLiens, mailId)');
    /* 🔴 PLUS AUCUN SECOND CHEMIN : c'est lui qui laissait passer les cartes « À trancher » depuis la liste. */
    expect(src).not.toContain('fiche.biens.map((b) => ({ ...b, ponctuel: false }))');
  });

  it('🔴 « Aucun bien rattaché à ce mail », dans les deux points d’entrée', () => {
    expect(AUCUN_BIEN_DU_MAIL).toBe('Aucun bien rattaché à ce mail');
    expect(src).toContain('AUCUN_BIEN_DU_MAIL');
    /* ⚠️ ET LA PHRASE DE L'ÉCHANGE A DISPARU AVEC LA FENÊTRE QUI LA PORTAIT. */
    expect(src).not.toContain('Cet échange n’est rattaché à aucun bien pour l’instant.');
  });

  it('🔴 la mention « ajout ponctuel » est écrite, jamais seulement colorée', () => {
    expect(MENTION_AJOUT_PONCTUEL).toBe('ajout ponctuel');
    expect(src).toContain('{MENTION_AJOUT_PONCTUEL}');
  });

  /**
   * 🔴🔴 LES DEUX POINTS D'ENTRÉE DONNENT LEUR MAIL — c'est tout le lot, et c'est en deux lignes de JSX.
   *
   * ⚠️ CE TEST DIT L'INVERSE DE CELUI QU'IL REMPLACE (« la liste n'envoie aucun mail »), et c'est exactement
   * la demande d'Arno : « une SEULE fenêtre, quel que soit le point d'entrée […] le mail cliqué, ou depuis une
   * ligne de liste le mail affiché sur la ligne ».
   */
  it('🔴🔴 la liste passe le mail AFFICHÉ sur la ligne', () => {
    const boite = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
    const i = boite.indexOf('<RattachementsDuFil');
    expect(i).toBeGreaterThan(0);
    expect(boite.slice(i, i + 400)).toContain('messageId={rattachementsDe.messageId}');
    /* 🔴 ET C'EST BIEN `messageAffiche`, pas « le dernier de l'échange » : sous Envoyés, ce n'est pas le même. */
    expect(boite).toContain('messageId: l.messageAffiche');
  });

  /**
   * ⚠️ LA FENÊTRE A GAGNÉ DEUX PROPRIÉTÉS AU LOT CLASSER-PAR-LA-MODALE (`ouvreLaModification`,
   * `actionsDePied`), et leurs encadrés ont repoussé `messageId` au-delà des 500 premiers caractères. On lit
   * donc la balise ENTIÈRE, jusqu'à son `/>`, au lieu d'une fenêtre de caractères arbitraire — ce que le garde
   * voulait dire depuis le début, et qui ne se cassera plus au prochain commentaire.
   */
  it('🔴 la conversation passe le mail ouvert', () => {
    const cnv = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    const i = cnv.indexOf('<RattachementsDuFil');
    expect(i).toBeGreaterThan(0);
    const balise = cnv.slice(i, cnv.indexOf('/>', i));
    expect(balise).toContain('messageId={message.messageId}');
  });
});
