import { describe, it, expect } from 'vitest';
import {
  aUneTaille, appliquerTaille, consigneDeTaille, dimensionsDeLaBalise, dimensionsParRang,
  HAUTEUR_ICONE, ICONE_MAX_PX, proprieteDuStyle,
} from './tailleImageMail';
import { reecrireImages, type PieceIntegree } from './imagesMail';

/**
 * ══ 🔴🔴 LOT SIGNATURE-ECHELLE — UNE ICÔNE DE SIGNATURE RESTE UNE ICÔNE ══════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), fil 36671 : « les icônes de la signature Service Gestion (épingle, mobile,
 * téléphone) s'affichent désormais, mais ÉNORMES — plusieurs centaines de pixels — au lieu de leur petite taille
 * d'origine, environ 20 px, alignées sur la ligne de texte. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ SUR LES DEUX MESSAGES ════════════════════════════════════════════════════════════
 *
 *   · 57464, NOTRE ENVOI : `<img width="20" height="20" src="data:image/png;base64,…">` — tailles justes.
 *   · 57465, LA RÉPONSE D'ARNO depuis Gmail, qui CITE notre signature :
 *     `<img src="cid:1d0ecfbd47378a46_0.0.1" style="width:240px;max-width:100%">`
 *     🔴 GMAIL A RETIRÉ `width`/`height` ET IMPOSÉ `width:240px`. Ce message ne porte AUCUNE pièce (0 en base) :
 *     ses trois `cid:` sont résolus par la CONVERSATION, sur les pièces 27118/27119/27120 de notre envoi.
 *
 * ⚠️ NI NOTRE NETTOYAGE NI LA RÉÉCRITURE DU `cid:` N'Y SONT POUR QUELQUE CHOSE, et il fallait le vérifier :
 * `width`/`height` sont des attributs autorisés sur `img`, `width`/`height`/`max-width` des propriétés autorisées
 * du profil « reception », et `remplacerSrc` ne touche qu'au `src`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les balises RÉELLES des deux messages, recopiées telles quelles. */
const NOTRE_ENVOI = '<img width="20" height="20" src="data:image/png;base64,iVBOR" '
  + 'style="margin-top: 0px; margin-left: 0px">';
const CITATION_GMAIL = '<img src="cid:1d0ecfbd47378a46_0.0.1" style="width:240px;max-width:100%">';
const SIGNATURE = { nomFichier: 'signature-1.png', typeMime: 'image/png', tailleOctets: 1933 };
const PHOTO = { nomFichier: 'chantier.jpg', typeMime: 'image/jpeg', tailleOctets: 820_000 };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LIRE CE QU'UNE BALISE DIT DE SA TAILLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① ce que la balise dit de sa taille', () => {
  it('🔴 les attributs', () => {
    expect(dimensionsDeLaBalise(NOTRE_ENVOI)).toEqual({ largeur: 20, hauteur: 20 });
  });

  it('🔴🔴 le style, et c’est lui qui compte dans le cas d’Arno', () => {
    expect(dimensionsDeLaBalise(CITATION_GMAIL)).toEqual({ largeur: 240, hauteur: null });
  });

  /**
   * 🔴🔴 LE `style` L'EMPORTE SUR L'ATTRIBUT, parce que c'est ce que fait le navigateur. Lire l'attribut d'abord
   * aurait fait croire que la balise demandait 20 px alors que son style en impose 240 — et l'on aurait conclu
   * qu'il n'y avait rien à corriger.
   */
  it('🔴🔴 le style l’emporte sur l’attribut', () => {
    expect(dimensionsDeLaBalise('<img width="20" height="20" style="width:240px;height:240px">'))
      .toEqual({ largeur: 240, hauteur: 240 });
  });

  /** ⚠️ ON NE LIT QUE DES PIXELS : un `80%` est une consigne relative légitime, qu'on laisse passer sans la juger. */
  it('⚠️ un pourcentage n’est pas une mesure en pixels, mais c’est bien une taille', () => {
    expect(dimensionsDeLaBalise('<img style="width:80%">')).toEqual({ largeur: null, hauteur: null });
    expect(aUneTaille('<img style="width:80%">')).toBe(true);
    expect(aUneTaille('<img src="x">')).toBe(false);
  });

  it('⚠️ une propriété se lit dans le style sans se confondre avec une autre', () => {
    expect(proprieteDuStyle(CITATION_GMAIL, 'max-width')).toBe('100%');
    expect(proprieteDuStyle(CITATION_GMAIL, 'width')).toBe('240px');
    expect(proprieteDuStyle(CITATION_GMAIL, 'height')).toBeNull();
  });

  it('🔴 les dimensions de chaque image, dans l’ordre du document', () => {
    const html = `<p>${NOTRE_ENVOI}</p><p>${CITATION_GMAIL}</p><img src="x">`;
    expect(dimensionsParRang(html)).toEqual([
      { largeur: 20, hauteur: 20 }, { largeur: 240, hauteur: null }, { largeur: null, hauteur: null },
    ]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE CAS D'ARNO, DE BOUT EN BOUT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② l’icône citée retrouve sa taille', () => {
  /**
   * 🔴🔴 LA RÈGLE ① : les dimensions de l'AUTEUR font foi devant celles d'un client citant. 20 ≤ 64, donc c'est
   * une icône, donc on impose 20 × 20 — exactement ce qu'Arno voit dans le message d'origine.
   */
  it('🔴🔴 240 px imposés par Gmail → 20 × 20, la taille de notre envoi', () => {
    const c = consigneDeTaille({ balise: CITATION_GMAIL, origine: { largeur: 20, hauteur: 20 }, piece: SIGNATURE });
    expect(c).toEqual({ sorte: 'origine', largeur: 20, hauteur: 20 });
    const sortie = appliquerTaille(CITATION_GMAIL, c);
    expect(sortie).toContain('width:20px');
    expect(sortie).toContain('height:20px');
    expect(sortie).toContain('width="20"');
    expect(sortie).toContain('height="20"');
    expect(sortie).not.toContain('240');
  });

  /**
   * 🔴🔴 `max-width:100%` N'EST JAMAIS RETIRÉ : c'est la borne qui empêche une image de déborder du mail. On ne
   * remplace que `width` et `height`.
   */
  it('🔴🔴 la borne de largeur du mail survit', () => {
    const sortie = appliquerTaille(CITATION_GMAIL,
      consigneDeTaille({ balise: CITATION_GMAIL, origine: { largeur: 20, hauteur: 20 }, piece: SIGNATURE }));
    expect(sortie).toContain('max-width:100%');
  });

  /** ⚠️ ET LE `src` N'EST PAS TOUCHÉ : c'est `remplacerSrc` qui s'en occupe, juste après. */
  it('⚠️ l’adresse de l’image est laissée intacte', () => {
    const sortie = appliquerTaille(CITATION_GMAIL,
      consigneDeTaille({ balise: CITATION_GMAIL, origine: { largeur: 20, hauteur: 20 }, piece: SIGNATURE }));
    expect(sortie).toContain('src="cid:1d0ecfbd47378a46_0.0.1"');
  });

  /** ⚠️ DÉJÀ À LA BONNE TAILLE ⇒ ON NE RÉÉCRIT RIEN : une balise identique ferait du bruit pour rien. */
  it('⚠️ une balise déjà juste n’est pas réécrite', () => {
    expect(consigneDeTaille({
      balise: '<img width="20" height="20" src="cid:x">', origine: { largeur: 20, hauteur: 20 }, piece: SIGNATURE,
    })).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 UNE IMAGE DE CONTENU N'EST JAMAIS TOUCHÉE — LA BORNE D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ une photo garde sa taille', () => {
  /**
   * 🔴🔴 LA SYMÉTRIE DU DÉFAUT, ET ON NE LA COMMET PAS. Si une photo de 1 200 px est citée à 240 px par Gmail,
   * la « rendre à sa taille d'origine » la ferait bondir à 1 200 px dans la citation. Arno demande qu'une image
   * de contenu ne soit jamais réduite à tort ; l'agrandir à tort serait le même défaut, à l'envers.
   */
  it('🔴🔴 une origine qui n’est pas une icône ne s’impose pas', () => {
    expect(consigneDeTaille({
      balise: '<img src="cid:x" style="width:240px">', origine: { largeur: 1200, hauteur: 900 }, piece: PHOTO,
    })).toBeNull();
  });

  /** 🔴 LA BORNE EST À 64 px, et elle se lit : 64 passe, 65 ne passe pas. */
  it('🔴 la borne de l’icône est exacte', () => {
    const avec = (px: number) => consigneDeTaille({
      balise: '<img src="cid:x" style="width:240px">', origine: { largeur: px, hauteur: px }, piece: SIGNATURE,
    });
    expect(avec(ICONE_MAX_PX)).not.toBeNull();
    expect(avec(ICONE_MAX_PX + 1)).toBeNull();
  });

  /** ⚠️ UNE PHOTO SANS AUCUNE DIMENSION RESTE INTACTE : la largeur du mail la borne déjà en CSS. */
  it('⚠️ une photo sans dimensions n’est pas rapetissée', () => {
    expect(consigneDeTaille({ balise: '<img src="cid:x">', origine: null, piece: PHOTO })).toBeNull();
  });

  it('⚠️ une image sans pièce connue n’est jamais touchée', () => {
    expect(consigneDeTaille({ balise: '<img src="cid:x">', origine: null, piece: null })).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE REPLI : UNE ICÔNE DE SIGNATURE SANS AUCUNE DIMENSION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ une icône de signature sans dimensions prend la hauteur d’une ligne', () => {
  /**
   * 🔴 SANS CELA, LE NAVIGATEUR L'AFFICHE À SA TAILLE NATURELLE — une icône à double densité de 40 ou 80 px au
   * milieu d'un texte de 13 px. `1.2em` suit la taille du texte : l'icône s'aligne sur la ligne au lieu de la
   * pousser.
   */
  it('🔴🔴 hauteur bornée à une ligne, largeur libre pour garder les proportions', () => {
    const balise = '<img src="cid:abc">';
    const c = consigneDeTaille({ balise, origine: null, piece: SIGNATURE });
    expect(c).toEqual({ sorte: 'icone' });
    const sortie = appliquerTaille(balise, c);
    expect(sortie).toContain(`height:${HAUTEUR_ICONE}`);
    expect(sortie).toContain('width:auto');
  });

  /** 🔴 MAIS SEULEMENT SI RIEN NE DIT SA TAILLE : une consigne explicite, même en pourcentage, est respectée. */
  it('🔴 une taille déjà donnée est respectée', () => {
    expect(consigneDeTaille({ balise: '<img src="cid:x" style="width:80%">', origine: null, piece: SIGNATURE }))
      .toBeNull();
    expect(consigneDeTaille({ balise: '<img src="cid:x" width="32">', origine: null, piece: SIGNATURE }))
      .toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA RÉÉCRITURE DE LA BALISE, DANS LE DÉTAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⚠️ ⑤ réécrire une balise sans rien casser', () => {
  /**
   * 🔴 ON ÉCRIT DANS LE `style` **ET** DANS LES ATTRIBUTS, et il faut les deux : le style l'emporte dans le
   * navigateur, donc laisser `width:240px` en place aurait annulé un attribut `width="20"` parfaitement posé.
   */
  it('🔴🔴 le style ET les attributs sont posés ensemble', () => {
    const sortie = appliquerTaille('<img style="width:240px" width="240" src="x">',
      { sorte: 'origine', largeur: 20, hauteur: 20 });
    expect(sortie).toMatch(/style="[^"]*width:20px/);
    expect(sortie).toContain('width="20"');
    expect((sortie.match(/width=/g) ?? [])).toHaveLength(1);
  });

  it('⚠️ les autres propriétés du style survivent', () => {
    const sortie = appliquerTaille(NOTRE_ENVOI, { sorte: 'origine', largeur: 20, hauteur: 20 });
    expect(sortie).toContain('margin-top: 0px');
    expect(sortie).toContain('margin-left: 0px');
  });

  it('⚠️ une balise auto-fermante le reste', () => {
    const sortie = appliquerTaille('<img src="x" />', { sorte: 'icone' });
    expect(sortie.endsWith('/>')).toBe(true);
    expect(sortie).toContain('src="x"');
  });

  it('⚠️ sans consigne, la balise ressort à l’identique', () => {
    expect(appliquerTaille(CITATION_GMAIL, null)).toBe(CITATION_GMAIL);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔴🔴 DE BOUT EN BOUT, SUR LE CORPS RÉEL DU MESSAGE 57465
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑥ le corps d’Arno, réécrit', () => {
  /** Le corps du 57465 tel qu'il est en base, réduit à ses trois images citées. */
  const CORPS = '<div>Bonjour,</div>'
    + '<img src="cid:1d0ecfbd47378a46_0.0.1" style="width:240px;max-width:100%">'
    + '<img src="cid:1d0ecfbd47378a46_0.0.2" style="width:240px;max-width:100%">'
    + '<img src="cid:1d0ecfbd47378a46_0.0.3" style="width:240px;max-width:100%">';

  /**
   * LES PIÈCES DE LA CONVERSATION : celles du 57464, avec la taille que NOTRE envoi leur donnait. Le 57465 n'a
   * aucune pièce à lui (0 en base), donc le troisième temps de `resoudreCids` — le rang — les apparie.
   */
  const CONVERSATION: PieceIntegree[] = [1, 2, 3].map((n) => ({
    pieceId: 27117 + n, nomFichier: `signature-${n}.png`, typeMime: 'image/png',
    tailleOctets: [1933, 835, 1600][n - 1], dimensions: { largeur: 20, hauteur: 20 },
  }));

  const reecrire = (conversation: PieceIntegree[]) => reecrireImages(CORPS, {
    pieces: [], conversation, piece: (id) => `/api/admin/gestion/pieces/${id}`, relais: null,
  });

  it('🔴🔴 les trois icônes reviennent à 20 × 20, et pointent sur nos pièces', () => {
    const sortie = reecrire(CONVERSATION);
    expect((sortie.match(/width:20px/g) ?? [])).toHaveLength(3);
    expect(sortie).not.toContain('240px');
    expect(sortie).toContain('/api/admin/gestion/pieces/27118');
    expect(sortie).toContain('/api/admin/gestion/pieces/27120');
  });

  /**
   * 🔴🔴 SANS LES DIMENSIONS D'ORIGINE, RIEN NE CHANGE — à la lettre. C'est la garantie de non-régression : un
   * échange dont on ne connaît pas la taille d'origine s'affiche exactement comme avant ce lot.
   */
  it('🔴🔴 sans dimensions d’origine, le corps est celui d’avant ce lot', () => {
    const sortie = reecrire(CONVERSATION.map((p) => ({ ...p, dimensions: null })));
    expect((sortie.match(/width:240px/g) ?? [])).toHaveLength(3);
    expect(sortie).toContain('/api/admin/gestion/pieces/27118');
  });
});
