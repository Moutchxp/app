import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  adresseDuDernierEntete, aidePieceCitee, copieCitee, decouperLesPiecesCitees, type PieceCitable,
} from './piecesCitees';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — LES NOMS DE PIÈCES CITÉS DANS UN CORPS ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO : sur le mail de Louis Vaglio du 30/06/2026 17:27 (fil 3366), aucune pièce jointe visible alors
 * que le texte affiche trois noms de fichiers.
 *
 * 🔴 VÉRIFIÉ DANS GMAIL : ce message NE PORTE AUCUNE pièce (18 118 octets en tout, ni `attachments` ni
 * `attachmentIds`). Les trois noms sont dans la partie citée, après « Le 11 nov. 2025 à 20:09, Blandine Piriou
 * <blandine.piriou@gmail.com> a écrit : » — c'est ainsi qu'Apple Mail écrit les pièces du mail qu'on cite.
 *
 * Le corps de ce fichier EST celui du message 5231, au caractère près, et les quatre copies sont celles mesurées
 * en base (mails 27076, 26914, 6788 et 6813 du fil 3366).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le corps du message 5231, tel que la base le porte. */
const CORPS = `Bonjour,

Je vous contacte pour me renseigner sur la régularisation des charges.

Bien à vous,

Louis Vaglio et Aurélie Arnaud

Le 11 nov. 2025 à 20:09, Blandine Piriou <blandine.piriou@gmail.com> a écrit :

Bonjour,
Votre virement a été effectué aujourd'hui.
Bien à vous
Blandine PIRIOU

<RIB..pdf>
<Solde Charges courantes au 31_03_2025.pdf>
<Rmbt VAGLIO ARNAUD Aurélie et Louis DPR.pdf>
`;

/** Les quatre mails du fil qui portent ces trois fichiers, mesurés en base. */
const PIECES: PieceCitable[] = [
  { pieceId: 1, nomFichier: 'RIB..pdf', messageId: 27076, recuLe: '2025-11-10T11:22:04Z', de: 'gestion@criterimmo.fr' },
  { pieceId: 2, nomFichier: 'RIB..pdf', messageId: 26914, recuLe: '2025-11-11T19:08:47Z', de: 'blandine.piriou@gmail.com' },
  { pieceId: 3, nomFichier: 'RIB..pdf', messageId: 6813, recuLe: '2026-06-12T16:46:40Z', de: 'louisvaglio@live.fr' },
  { pieceId: 4, nomFichier: 'RIB..pdf', messageId: 6788, recuLe: '2026-06-15T08:35:28Z', de: 'gestion@criterimmo.fr' },
  { pieceId: 5, nomFichier: 'Solde Charges courantes au 31_03_2025.pdf', messageId: 26914, recuLe: '2025-11-11T19:08:47Z', de: 'blandine.piriou@gmail.com' },
  { pieceId: 6, nomFichier: 'Rmbt VAGLIO ARNAUD Aurélie et Louis DPR.pdf', messageId: 26914, recuLe: '2025-11-11T19:08:47Z', de: 'blandine.piriou@gmail.com' },
];

const LE_30_JUIN = '2026-06-30T15:27:32Z';

describe('🔴🔴 ① le cas d’Arno, mot pour mot', () => {
  const morceaux = decouperLesPiecesCitees(CORPS, PIECES, LE_30_JUIN);
  const liens = morceaux.filter((m) => m.sorte === 'piece');

  it('🔴🔴 les trois noms cités deviennent trois liens', () => {
    expect(liens.map((m) => m.texte)).toEqual([
      'RIB..pdf',
      'Solde Charges courantes au 31_03_2025.pdf',
      'Rmbt VAGLIO ARNAUD Aurélie et Louis DPR.pdf',
    ]);
  });

  /**
   * 🔴🔴 L'INFO-BULLE D'ARNO, MOT POUR MOT : « pièce du mail du 11/11/2025 ». C'est le mail que la citation
   * NOMME — pas la copie la plus récente, qui date du 15/06/2026 et n'aurait rien dit à personne.
   */
  it('🔴🔴 l’info-bulle nomme le mail du 11/11/2025, celui que la citation désigne', () => {
    for (const l of liens) expect(l.sorte === 'piece' && l.aide).toBe('pièce du mail du 11/11/2025');
    /* 🔴 ET C'EST BIEN LA COPIE DE CE MAIL-LÀ qui s'ouvre, pas une autre. */
    expect(liens.map((m) => (m.sorte === 'piece' ? m.pieceId : 0))).toEqual([2, 5, 6]);
  });

  /** 🔴 LE TEXTE AUTOUR EST INTACT : on recompose le corps exactement. */
  it('🔴 recollés, les morceaux rendent le corps au caractère près', () => {
    expect(morceaux.map((m) => (m.sorte === 'piece' ? `<${m.texte}>` : m.texte)).join('')).toBe(CORPS);
  });

  /** 🔴 AUCUNE PIÈCE N'EST AJOUTÉE AU MAIL : ce module rend des morceaux de TEXTE, et rien d'autre. */
  it('🔴🔴 rien n’est ajouté au mail : seul le texte change d’habillage', () => {
    expect(morceaux.every((m) => m.sorte === 'texte' || m.sorte === 'piece')).toBe(true);
    expect(morceaux.filter((m) => m.sorte === 'texte').length).toBeGreaterThan(0);
  });
});

describe('🔴🔴 ② sans correspondance, le texte reste tel quel', () => {
  /** 🔴 DEMANDE D'ARNO : « Sans correspondance, le texte reste tel quel. » */
  it('🔴🔴 un nom qu’aucune pièce ne porte n’est pas souligné', () => {
    const m = decouperLesPiecesCitees('Voici <inconnu.pdf> pour vous.', PIECES, LE_30_JUIN);
    expect(m).toEqual([{ sorte: 'texte', texte: 'Voici <inconnu.pdf> pour vous.' }]);
  });

  it('⚠️ sans aucune pièce connue, le corps est rendu d’un bloc', () => {
    expect(decouperLesPiecesCitees(CORPS, [], LE_30_JUIN)).toEqual([{ sorte: 'texte', texte: CORPS }]);
    expect(decouperLesPiecesCitees('', PIECES, LE_30_JUIN)).toEqual([{ sorte: 'texte', texte: '' }]);
  });

  /**
   * 🔴🔴 LES ADRESSES NE SONT PAS DES FICHIERS. Un corps de mail est plein de `<prenom.nom@gmail.com>`, qui
   * finit par un point et trois lettres. Mesuré : sans cette exclusion, le compte passe de 4 034 citations à
   * 131 397 — on aurait tenté d'apparier des adresses à des pièces.
   */
  it('🔴🔴 une adresse entre chevrons n’est jamais prise pour un fichier', () => {
    const avecAdresse = [...PIECES, {
      pieceId: 9, nomFichier: 'blandine.piriou@gmail.com', messageId: 1,
      recuLe: '2025-11-11T19:08:47Z', de: 'x@y.fr',
    }];
    const m = decouperLesPiecesCitees('Écrit par <blandine.piriou@gmail.com> hier.', avecAdresse, LE_30_JUIN);
    expect(m.some((x) => x.sorte === 'piece')).toBe(false);
  });

  it('⚠️ la casse et les blancs de bord sont ignorés, et rien d’autre', () => {
    const m = decouperLesPiecesCitees('<  rib..PDF  >', PIECES, LE_30_JUIN);
    expect(m.some((x) => x.sorte === 'piece')).toBe(true);
    /* « RIB (1).pdf » n'est PAS « RIB..pdf » : un rapprochement plus souple ouvrirait une autre pièce. */
    expect(decouperLesPiecesCitees('<RIB (1).pdf>', PIECES, LE_30_JUIN)
      .some((x) => x.sorte === 'piece')).toBe(false);
  });
});

describe('🔴🔴 ③ laquelle des copies, et pourquoi', () => {
  const copies = PIECES.filter((p) => p.nomFichier === 'RIB..pdf');

  /** ① L'ADRESSE DE L'EN-TÊTE DE CITATION GAGNE — c'est le cas d'Arno. */
  it('🔴🔴 l’adresse citée désigne la copie', () => {
    expect(copieCitee(copies, 'blandine.piriou@gmail.com', LE_30_JUIN)?.messageId).toBe(26914);
    expect(copieCitee(copies, 'louisvaglio@live.fr', LE_30_JUIN)?.messageId).toBe(6813);
  });

  /** ② SANS ADRESSE : la copie la plus RÉCENTE qui précède le mail qui cite — la source la plus probable. */
  it('🔴 sans adresse, la copie la plus récente d’avant', () => {
    expect(copieCitee(copies, null, LE_30_JUIN)?.messageId).toBe(6788);
    expect(copieCitee(copies, null, '2025-11-11T00:00:00Z')?.messageId).toBe(27076);
  });

  /** ③ ET SI TOUTES SONT POSTÉRIEURES, la plus ancienne : le lien ne doit jamais rester mort. */
  it('🔴 toutes postérieures : la plus ancienne, jamais rien', () => {
    expect(copieCitee(copies, null, '2024-01-01T00:00:00Z')?.messageId).toBe(27076);
  });

  it('⚠️ une adresse inconnue retombe sur la règle de date, elle ne perd pas le lien', () => {
    expect(copieCitee(copies, 'personne@nulle.part', LE_30_JUIN)?.messageId).toBe(6788);
  });

  it('⚠️ aucune copie : aucune réponse', () => {
    expect(copieCitee([], null, LE_30_JUIN)).toBeNull();
  });
});

describe('🔴 ④ l’en-tête de citation', () => {
  it('🔴 l’adresse du dernier en-tête, et non du premier', () => {
    const avant = 'Le 1 jan 2025, A <a@x.fr> a écrit :\nblabla\n'
      + 'Le 11 nov. 2025 à 20:09, Blandine Piriou <blandine.piriou@gmail.com> a écrit :\n';
    expect(adresseDuDernierEntete(avant)).toBe('blandine.piriou@gmail.com');
  });

  it('🔴 « Forwarded message » et « wrote: » comptent aussi', () => {
    expect(adresseDuDernierEntete('---------- Forwarded message ---------\nDe : X <x@y.fr>\n'))
      .toBe('x@y.fr');
    expect(adresseDuDernierEntete('On 3 Jan 2026, Bob <bob@z.fr> wrote:\n')).toBe('bob@z.fr');
  });

  /**
   * ⚠️ UN EN-TÊTE SANS ADRESSE N'EN FAIT PAS REMONTER UNE AUTRE : prendre celle d'une citation PLUS HAUTE
   * désignerait le mauvais mail, ce qui est pire que de ne rien désigner.
   */
  it('⚠️ un en-tête sans adresse ne remonte pas chercher la précédente', () => {
    expect(adresseDuDernierEntete('A <a@x.fr> a écrit :\nblabla\nLe 2 fév, Quelquun a écrit :\n')).toBeNull();
  });

  it('⚠️ aucun en-tête : aucune adresse', () => {
    expect(adresseDuDernierEntete('Bonjour, voici le document.')).toBeNull();
  });
});

describe('🔴 ⑤ le mot de l’info-bulle', () => {
  it('🔴 le jour, en français, et jamais une date inventée', () => {
    expect(aidePieceCitee('2025-11-11T19:08:47Z')).toBe('pièce du mail du 11/11/2025');
    expect(aidePieceCitee('pas une date')).toBe('pièce du mail du —');
  });

  /** ⚠️ LE JOUR EST CELUI DE PARIS : un mail du 1er janvier à 00:30 à Paris est le 31 décembre en UTC. */
  it('⚠️ le jour est celui de Paris', () => {
    expect(aidePieceCitee('2025-12-31T23:30:00Z')).toBe('pièce du mail du 01/01/2026');
  });
});

/**
 * ══ 🔴🔴 ⑥ OÙ CES NOMS S'AFFICHENT VRAIMENT — UN GARDE DE CÂBLAGE ═══════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE J'AI DÛ CORRIGER EN L'ÉCRIVANT. Mes premières épreuves d'écran visaient le bloc « Historique du
 * bien » — et elles échouaient. La raison : le corps du vrai mail 5231 porte « Le 11 nov. 2025 … a écrit : », et
 * `corpsLisible` range alors TOUT ce qui suit dans la partie CITÉE. Or seule la fenêtre de CONVERSATION rend
 * cette partie (`gst-cite-bloc`) ; l'historique l'écarte. Les trois noms qu'Arno voit sont donc dans la
 * conversation, et nulle part ailleurs.
 *
 * 🔴 D'OÙ CE GARDE : il éprouve ce qu'aucun rendu isolé ne montre — que la fenêtre de conversation découpe les
 * DEUX parties du corps (la visible ET la citée), et qu'elle reçoit bien les pièces de tout le fil. Sans la
 * seconde, le défaut d'Arno resterait entier, et toutes les épreuves d'écran passeraient quand même.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 ⑥ la fenêtre de conversation découpe les deux parties du corps', () => {
  const SRC = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

  it('🔴🔴 la partie CITÉE passe par le découpage — c’est là que vivent les noms d’Arno', () => {
    expect(SRC).toContain('<p className="gst-msg-corps gst-cite-corps">');
    expect(SRC).toMatch(/gst-cite-corps">\s*<MorceauxDuCorps/);
  });

  it('🔴 la partie visible aussi : un corps sans en-tête de citation les porte là', () => {
    expect(SRC).toMatch(/<p className="gst-msg-corps">\s*<MorceauxDuCorps/);
  });

  /** 🔴 ET LES PIÈCES DE TOUT LE FIL LUI ARRIVENT, dédoublonnage DÉFAIT — sans quoi la copie du mail cité
      ne serait pas désignable. */
  it('🔴🔴 toutes les copies du fil lui sont passées, pas seulement les dédoublonnées', () => {
    expect(SRC).toContain('piecesCitables={piecesCitees}');
    expect(SRC).toContain('...p.autresApparitions.map((a) => ({');
  });

  /** ⚠️ ET LE MÊME COMPOSANT SERT LE MAIL DÉPLIÉ DE L'HISTORIQUE : une seule écriture, un seul comportement. */
  it('⚠️ le mail déplié de l’historique passe par le même module', () => {
    const vdb = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
    expect(vdb).toContain('decouperLesPiecesCitees(lisibleOuvert.visible, piecesCitables, l.recuLe)');
  });
});
