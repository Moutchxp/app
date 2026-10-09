import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COTE_IMAGE_SIGNIFICATIF, estImageDeSignature, estImageSignificative, sqlEstVraiePiece,
  TAILLE_IMAGE_SIGNIFICATIVE, trierPieces,
} from './lisibilite';
import { MENTION_IMAGE_INTEGREE, nomImageIntegree } from './pieces';

/**
 * ══ 🔴🔴 LOT IMAGES-INTEGREES-COMME-PIECES (09/10/2026) ════════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO, fil 36640 : « un message contient une photo INTÉGRÉE dans le corps du mail. Elle s'affiche
 * dans le corps mais n'apparaît ni dans le compteur “N pièces”, ni dans la liste des pièces jointes du message,
 * et ne peut donc pas être rangée dans le Drive. »
 *
 * ══ 🔴🔴 CE N'ÉTAIT PAS UN DÉFAUT : C'ÉTAIT UNE RÈGLE, ET ELLE EST BORNÉE, PAS ANNULÉE ══════════════════════════
 *
 * Le lot ETOILE-SIGNATURES-PIECES (03/10) écarte les images intégrées du compte — demande d'Arno de ce jour-là,
 * qui visait les LOGOS de signature. Elle emportait les photos avec eux. La nouvelle borne (« au moins 30 Ko OU
 * au moins 300 px sur le plus petit côté ») rend les photos au compte SANS rendre les logos.
 *
 * ══ 🔴 CE QUI EST MESURÉ, ET CE QUI NE L'EST PAS ════════════════════════════════════════════════════════════════
 *
 * Sur la base, le 09/10/2026 : 11 955 images intégrées, dont **5 020 ≥ 30 Ko**, sur **3 081 messages** — et les
 * 5 020 sont STOCKÉES (objet présent, 5 018 avec miniature prête). Rien à re-télécharger, `imap.ts` intact.
 * Les DIMENSIONS, elles, ne sont nulle part : la moitié « 300 px » de la règle est écrite et éprouvée ici, mais
 * rien ne l'alimente encore (voir `app/.captures/images-integrees-comme-pieces/mesures.md`).
 */

const LISIBILITE = readFileSync('app/lib/gestion/lisibilite.ts', 'utf8');
const PJ = readFileSync('app/(admin)/admin/(protected)/gestion/PiecesJointes.tsx', 'utf8');

const image = (o: Partial<Parameters<typeof estImageDeSignature>[0]> = {}) => ({
  nomFichier: 'image001.png', typeMime: 'image/png', tailleOctets: 4_283, ...o,
});

describe('🔴🔴 ① la règle « image significative »', () => {
  it('🔴 les deux bornes sont celles d’Arno, nommées', () => {
    expect(TAILLE_IMAGE_SIGNIFICATIVE).toBe(30 * 1024);
    expect(COTE_IMAGE_SIGNIFICATIF).toBe(300);
  });

  /** 🔴🔴 « OU », PAS « ET » : chacune des deux bornes suffit. */
  it('🔴🔴 30 Ko suffit, 300 px suffit, et aucune des deux n’est obligatoire', () => {
    expect(estImageSignificative(image({ tailleOctets: 30 * 1024 }))).toBe(true);
    expect(estImageSignificative(image({ tailleOctets: 30 * 1024 - 1 }))).toBe(false);
    /* Une capture de 827 × 414 qui pèse 28 Ko : petite en octets, grande à l'œil — c'est une pièce. */
    expect(estImageSignificative(image({ tailleOctets: 28_618, largeurPx: 827, hauteurPx: 414 }))).toBe(true);
    /* Le PLUS PETIT côté décide : une bannière 900 × 90 reste un ornement. */
    expect(estImageSignificative(image({ tailleOctets: 3_872, largeurPx: 900, hauteurPx: 90 }))).toBe(false);
  });

  /** ⚠️ NE PAS SAVOIR N'EST PAS « PETIT » : sans octets ni dimensions, cette fonction ne conclut rien. */
  it('⚠️ une taille inconnue ne rend pas une image significative', () => {
    expect(estImageSignificative(image({ tailleOctets: null }))).toBe(false);
    expect(estImageSignificative(image({ tailleOctets: null, largeurPx: 0, hauteurPx: 0 }))).toBe(false);
  });
});

describe('🔴🔴 ② ce que le tri en fait', () => {
  /**
   * 🔴🔴 LE CAS D'ARNO : une photo intégrée de 148 Ko. Avant ce lot elle était écartée (et c'était la règle du
   * 03/10) ; elle est maintenant une pièce entière.
   */
  it('🔴🔴 une photo intégrée de 148 Ko est une pièce', () => {
    const p = image({ nomFichier: 'Image (9).jpeg', typeMime: 'image/jpeg', tailleOctets: 148_684, integree: true });
    expect(estImageDeSignature(p)).toBe(false);
    expect(trierPieces([p]).vraies).toHaveLength(1);
  });

  /**
   * 🔴🔴 ET LE NOM NE LA RATTRAPE PAS. C'est le point qui fait toute la différence, et il est mesuré : sur les
   * 5 020 images intégrées de plus de 30 Ko, **3 123 s'appellent `image001.png` ou équivalent** — c'est le nom
   * qu'Outlook donne à une photo collée dans le corps. Si la règle de NOM s'appliquait ensuite, la correction
   * n'aurait rien corrigé pour les deux tiers des cas.
   */
  it('🔴🔴 un nom de signature ne la ré-écarte pas', () => {
    const p = image({ nomFichier: 'image001.png', tailleOctets: 148_684, integree: true });
    expect(estImageDeSignature(p)).toBe(false);
  });

  /** 🔴🔴 CE QUE LA RÈGLE DU 03/10 PROTÉGEAIT TIENT : un logo intégré de 4 Ko reste écarté. */
  it('🔴🔴 un logo intégré de 4 Ko reste écarté', () => {
    expect(estImageDeSignature(image({ integree: true }))).toBe(true);
    expect(trierPieces([image({ integree: true })]).vraies).toEqual([]);
  });

  /**
   * 🔴🔴 ET LES IMAGES **NON** INTÉGRÉES NE BOUGENT PAS D'UN IOTA. Mesuré : 1 051 images non intégrées de plus
   * de 30 Ko portent un nom de signature et sont écartées par la règle de NOM. Les faire réapparaître serait un
   * changement qu'Arno n'a pas demandé — ce cas l'interdit.
   */
  it('🔴🔴 une image NON intégrée garde exactement la règle d’avant', () => {
    expect(estImageDeSignature(image({ nomFichier: 'image001.png', tailleOctets: 148_684, integree: false })))
      .toBe(true);
    expect(estImageDeSignature(image({ nomFichier: 'photo.jpg', tailleOctets: 148_684, integree: false })))
      .toBe(false);
    /* `null` (migration absente, ou pièce sans empreinte) ⇒ comportement d'avant, à la lettre. */
    expect(estImageDeSignature(image({ nomFichier: 'image001.png', tailleOctets: 148_684, integree: null })))
      .toBe(true);
  });

  /** ⚠️ UN DOCUMENT N'EST JAMAIS CONCERNÉ : la règle ne parle que d'images. */
  it('⚠️ un PDF de 2 Ko reste une pièce', () => {
    expect(estImageDeSignature({ nomFichier: 'bail.pdf', typeMime: 'application/pdf', tailleOctets: 2_000 }))
      .toBe(false);
  });
});

describe('🔴🔴 ③ le SQL compte EXACTEMENT comme l’écran', () => {
  const sql = sqlEstVraiePiece('p', true);

  /** 🔴🔴 LA MÊME BORNE, EN OCTETS, DANS LA MÊME EXPRESSION — un compteur paginé se calcule dans le WHERE. */
  it('🔴🔴 la borne des 30 Ko est dans le prédicat', () => {
    expect(sql).toContain('p.taille_octets >= 30720');
    expect(sql).toContain('coalesce(p.integree, false) AND NOT (p.taille_octets >= 30720)');
  });

  /** 🔴🔴 ET LES DEUX BRANCHES SONT SÉPARÉES : l'intégrée d'un côté, la règle de nom/taille de l'autre. */
  it('🔴🔴 une image NON intégrée ne passe pas par la borne des 30 Ko', () => {
    expect(sql).toContain('NOT coalesce(p.integree, false) AND (p.nom_fichier ~*');
  });

  /** ⚠️ SANS LA MIGRATION 296, LE PRÉDICAT EST CELUI D'AVANT : aucune colonne `integree` n'est nommée. */
  it('⚠️ sans la colonne, rien ne change', () => {
    const sansColonne = sqlEstVraiePiece('p', false);
    expect(sansColonne).not.toContain('integree');
    expect(sansColonne).not.toContain('30720');
  });
});

describe('🔴 ④ ce que la pièce affiche', () => {
  /** 🔴 LA MENTION, ÉCRITE UNE FOIS ET AU MOT PRÈS. */
  it('🔴 « intégrée au mail », sur la carte', () => {
    expect(MENTION_IMAGE_INTEGREE).toBe('intégrée au mail');
    expect(PJ).toContain('{p.integree === true && <span className="pj-integree">{MENTION_IMAGE_INTEGREE}</span>}');
  });

  /**
   * 🔴 LE NOM : le sien, sinon « Image intégrée N.ext ». L'extension suit le TYPE RÉEL — un PNG nommé « .jpg »
   * s'ouvre de travers dans la moitié des outils, et c'est ce nom-là qu'on retrouvera dans le Drive.
   */
  it('🔴 le nom d’origine gagne, et le repli est numéroté', () => {
    expect(nomImageIntegree('IMG_0339.jpeg', 1, 'image/jpeg')).toBe('IMG_0339.jpeg');
    expect(nomImageIntegree('(sans nom)', 1, 'image/jpeg')).toBe('Image intégrée 1.jpg');
    expect(nomImageIntegree('', 2, 'image/png')).toBe('Image intégrée 2.png');
    expect(nomImageIntegree('   ', 3, null)).toBe('Image intégrée 3.jpg');
    /* ⚠️ Un fichier RÉELLEMENT nommé « (sans nom).png » garde son nom : on compare le libellé entier. */
    expect(nomImageIntegree('(sans nom).png', 1, 'image/png')).toBe('(sans nom).png');
  });

  /** 🔴 LE RANG COMPTE LES INTÉGRÉES SEULES, dans l'ordre affiché — sinon le numéro sauterait. */
  it('🔴 le rang se calcule sur les seules images intégrées', () => {
    expect(PJ).toContain('rangIntegree={dispo.slice(0, i + 1).filter((x) => x.integree === true).length}');
  });

  /**
   * 🔒 RIEN N'EST RETIRÉ : la pièce garde les gestes de toutes les autres (œil, téléchargement, ▲ Drive), parce
   * qu'elle est une pièce ORDINAIRE — aucune branche ne la distingue dans la carte, hormis sa mention.
   */
  it('🔒 aucun geste n’est conditionné à « intégrée »', () => {
    const carte = PJ.slice(PJ.indexOf('function CartePiece('));
    const conditions = carte.match(/integree[^\n]*\?/g) ?? [];
    /* La seule condition admise est celle du NOM affiché ; la mention, elle, est un `&&`. */
    expect(conditions).toHaveLength(1);
    expect(carte).toContain('const nomAffiche = p.integree === true ? nomImageIntegree(');
  });
});

describe('🔒 ⑤ ce lot ne touche ni au stockage, ni à la relève', () => {
  /**
   * 🔴 LES OCTETS SONT DÉJÀ LÀ — c'est le point 3 d'Arno, et c'est ce qui rend ce lot possible sans IMAP : une
   * image intégrée est une partie MIME ORDINAIRE, déposée comme n'importe quelle pièce jointe. Le marqueur
   * `integree` ne dit pas « elle n'est pas stockée », il dit « ses octets sont AUSSI dans le corps ».
   */
  it('🔒 aucune récupération n’est ajoutée par la règle', () => {
    const pur = LISIBILITE.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(pur).not.toMatch(/\bfetch\s*\(|imap|recuperer\s*\(/i);
  });

  /** 🔒 ET `imap.ts` N'EST PAS DANS LE LOT : la règle ne touche que le TRI, jamais le dépôt. */
  it('🔒 le dépôt des pièces n’est pas modifié', () => {
    expect(LISIBILITE).not.toContain('email/imap');
  });
});
