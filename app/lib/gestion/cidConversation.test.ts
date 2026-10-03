import { describe, it, expect } from 'vitest';
import {
  MENTION_IMAGE_INTROUVABLE, pieceEstImage, reecrireImages, resoudreCids, type PieceIntegree,
} from './imagesMail';

/**
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES, POINT 2 — LA SIGNATURE RETROUVE SES PICTOS ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CAS RÉEL D'ARNO (03/10/2026), LU CHEZ GOOGLE ET NON SUPPOSÉ.
 *
 * Il envoie un mail depuis gestion@, se le renvoie depuis son adresse personnelle, et la signature « Service
 * Gestion » affiche « image intégrée non retrouvée » à la place de ses trois pictos.
 *
 *   · notre envoi (Gmail 1a100d7a8d14e269) : multipart/related portant TROIS image/png `inline`,
 *     Content-ID `<sig0…@criterimmo.fr>`, `<sig1…>`, `<sig2…>`, noms « signature-1/2/3.png » ;
 *   · le mail revenu (1a1011cca965f9fd) : multipart/alternative de DEUX parties, text/plain + text/html.
 *     AUCUNE image. Son HTML cite pourtant `cid:1d0ecfbd47378a46_0.0.{1,2,3}` — des identifiants réécrits par
 *     Gmail, qui ne désignent que des parties restées chez lui.
 *
 * 🔴 IL N'Y AVAIT DONC RIEN À RETROUVER DANS CE MESSAGE, et aucun rapprochement par nom ou par identifiant ne
 * pouvait aboutir : le `cid` de Gmail n'a aucun rapport avec le nôtre. Les images sont dans l'AUTRE message de la
 * conversation — le nôtre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const img = (src: string) => `<img src="${src}" style="width:240px">`;
const piece = (pieceId: number, nomFichier: string, typeMime: string | null = 'image/png'): PieceIntegree =>
  ({ pieceId, nomFichier, typeMime });

/** Le corps cité du mail revenu, tel qu'il est en base. */
const CORPS_REVENU = `<div>Bonjour</div><div>${img('cid:1d0ecfbd47378a46_0.0.1')}`
  + `${img('cid:1d0ecfbd47378a46_0.0.2')}${img('cid:1d0ecfbd47378a46_0.0.3')}</div>`;

/** Les pièces de NOTRE envoi, dans l'ordre où elles ont été écrites. */
const NOTRE_ENVOI: PieceIntegree[] = [
  piece(27118, 'signature-1.png'),
  piece(27119, 'signature-2.png'),
  piece(27120, 'signature-3.png'),
  piece(27121, 'test renomage.pdf', 'application/pdf'),
];

describe('🔴 ① le nom, dans CE message — la règle d’avant, intacte', () => {
  it('un cid qui porte le nom du fichier se résout ici', () => {
    const t = resoudreCids(img('cid:image003.png@01DC579B.8FCB6050'), [piece(7, 'image003.png')]);
    expect(t.get('image003.png@01dc579b.8fcb6050')).toBe(7);
  });

  /** ⚠️ ET LE MESSAGE PASSE AVANT L'ÉCHANGE : une pièce homonyme ailleurs ne doit pas voler la place. */
  it('🔴 la pièce du message gagne contre une homonyme de la conversation', () => {
    const t = resoudreCids(img('cid:logo.png@x'), [piece(7, 'logo.png')], [piece(99, 'logo.png')]);
    expect(t.get('logo.png@x')).toBe(7);
  });
});

describe('🔴 ② le nom, dans la CONVERSATION', () => {
  it('🔴 un cid que ce message ne porte pas se résout dans l’échange', () => {
    const t = resoudreCids(img('cid:signature-2.png@criterimmo.fr'), [], NOTRE_ENVOI);
    expect(t.get('signature-2.png@criterimmo.fr')).toBe(27119);
  });
});

describe('🔴🔴 ③ le rang, et sa condition stricte', () => {
  /** 🔴🔴 LE CAS D'ARNO, REJOUÉ TEL QUEL : trois cid Gmail, trois images dans notre envoi. */
  it('🔴🔴 les trois pictos de la signature retrouvent leurs octets', () => {
    const t = resoudreCids(CORPS_REVENU, [], NOTRE_ENVOI);
    expect(t.get('1d0ecfbd47378a46_0.0.1')).toBe(27118);
    expect(t.get('1d0ecfbd47378a46_0.0.2')).toBe(27119);
    expect(t.get('1d0ecfbd47378a46_0.0.3')).toBe(27120);
  });

  /** 🔴 LE PDF DE LA CONVERSATION N'EST PAS UNE CANDIDATE : on ne pose pas un document à la place d'un picto. */
  it('🔴 seules les IMAGES de l’échange sont candidates', () => {
    expect(pieceEstImage(piece(1, 'bail.pdf', 'application/pdf'))).toBe(false);
    expect(pieceEstImage(piece(1, 'logo.png', null))).toBe(true);
    expect(pieceEstImage(piece(1, 'sans-extension', null))).toBe(false);
  });

  /**
   * 🔴🔴 LA CONDITION QUI FAIT TOUT TENIR. Le rang est un rapprochement par POSITION : il n'est juste que si les
   * deux comptes tombent juste. Un écart, et l'on s'abstient ENTIÈREMENT — poser la mauvaise image serait pire
   * que n'en poser aucune, parce qu'un faux se propage au transfert suivant.
   */
  it('🔴🔴 une image candidate de trop ⇒ AUCUN rapprochement', () => {
    const t = resoudreCids(CORPS_REVENU, [], [...NOTRE_ENVOI, piece(27200, 'photo.png')]);
    expect(t.size).toBe(0);
  });

  it('🔴🔴 une image candidate de moins ⇒ AUCUN rapprochement', () => {
    const t = resoudreCids(CORPS_REVENU, [], NOTRE_ENVOI.slice(0, 2));
    expect(t.size).toBe(0);
  });

  /** ⚠️ ET SANS CONVERSATION, RIEN NE CHANGE PAR RAPPORT À AVANT CE LOT. */
  it('⚠️ sans pièces de conversation, aucun cid ne se résout', () => {
    expect(resoudreCids(CORPS_REVENU, []).size).toBe(0);
  });

  /** ⚠️ UN MÊME cid ÉCRIT DEUX FOIS NE CONSOMME QU'UNE CANDIDATE — sinon tout le rapprochement se décalerait. */
  it('⚠️ un cid répété ne compte qu’une fois', () => {
    const html = img('cid:a@x') + img('cid:A@X') + img('cid:b@x');
    const t = resoudreCids(html, [], [piece(1, 'un.png'), piece(2, 'deux.png')]);
    expect(t.get('a@x')).toBe(1);
    expect(t.get('b@x')).toBe(2);
  });

  /** 🔴 UNE PIÈCE DÉJÀ PRISE PAR SON NOM NE SE REPRÉSENTE PAS comme candidate du rang. */
  it('🔴 une pièce résolue par le nom sort des candidates', () => {
    const html = img('cid:signature-1.png@z') + img('cid:1d0ecfbd_0.0.2') + img('cid:1d0ecfbd_0.0.3');
    const t = resoudreCids(html, [], NOTRE_ENVOI);
    expect(t.get('signature-1.png@z')).toBe(27118);
    expect(t.get('1d0ecfbd_0.0.2')).toBe(27119);
    expect(t.get('1d0ecfbd_0.0.3')).toBe(27120);
  });
});

describe('🔴🔴 ce que l’écran affiche', () => {
  const rendu = (html: string, pieces: PieceIntegree[], conversation: PieceIntegree[] = []) =>
    reecrireImages(html, {
      pieces, conversation,
      piece: (id) => `/api/admin/gestion/pieces/${id}`,
      relais: (r) => `/relais?rang=${r}`,
    });

  it('🔴🔴 la signature d’Arno s’affiche, octets servis par nos routes', () => {
    const sortie = rendu(CORPS_REVENU, [], NOTRE_ENVOI);
    expect(sortie).toContain('/api/admin/gestion/pieces/27118');
    expect(sortie).toContain('/api/admin/gestion/pieces/27119');
    expect(sortie).toContain('/api/admin/gestion/pieces/27120');
    expect(sortie).not.toContain('cid:');
    expect(sortie).not.toContain('data-absente');
  });

  /**
   * 🔴🔴 ARNO : « pas le texte “image intégrée non retrouvée” en gras au milieu de la signature ». Le mot reste
   * dans l'infobulle — on ne cesse pas de le dire —, mais l'`alt` est VIDE : le navigateur ne peint plus de texte.
   */
  it('🔴🔴 vraiment introuvable : un emplacement neutre, pas un texte dans la page', () => {
    const sortie = rendu(img('cid:perdu@x'), []);
    expect(sortie).toContain('alt=""');
    expect(sortie).toContain(`title="${MENTION_IMAGE_INTROUVABLE}"`);
    expect(sortie).toContain('data-absente="1"');
    // ⚠️ ET PLUS AUCUN `src` : une adresse morte ferait un carré barré, qui est exactement ce qu'on évite.
    expect(sortie).not.toContain('src=');
  });

  /** ⚠️ LE RESTE DU DOCUMENT N'EST PAS TOUCHÉ : images distantes et `data:` gardent leur chemin d'avant. */
  it('⚠️ les autres images ne changent pas de traitement', () => {
    const sortie = rendu(`${img('https://exemple.test/x.png')}${img('data:image/png;base64,AAA')}`, []);
    expect(sortie).toContain('/relais?rang=0');
    expect(sortie).toContain('data:image/png;base64,AAA');
  });
});
