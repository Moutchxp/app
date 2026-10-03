import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { chargesImagesDuCorps, estPoseeDansLeCorps } from './imageDansLeCorps';
import { empreintesDesImagesDuCorps } from './imageDansLeCorpsReel';
import { estImageDeSignature, sqlEstVraiePiece, trierPieces } from './lisibilite';

/**
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES, POINT 3 — UNE IMAGE INTÉGRÉE N'EST PAS UNE PIÈCE JOINTE ══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Critère : Content-Disposition inline ET référencée par un cid: du HTML, ou image
 * de signature connue. Une vraie pièce jointe (attachment, ou image non référencée dans le corps) reste comptée,
 * même si c'est une photo. »
 *
 * ═══ 🔴 COMMENT ON LIT CE CRITÈRE SANS LE `Content-Disposition` ═════════════════════════════════════════════════
 *
 * Il n'est rangé nulle part : le seul fichier qui analyse les parties d'un mail est `app/lib/email/imap.ts`, hors
 * périmètre. Mais mailparser, qui fait cette analyse, REMPLACE les parties `related` par leurs octets dans le HTML
 * qu'il rend. Une image inline arrive donc chez nous DEUX fois : comme pièce, et comme `data:image/…;base64,…`
 * dans le corps. D'où le critère, qui dit exactement la même chose :
 *
 *     une image dont les OCTETS SONT DÉJÀ POSÉS DANS LE CORPS est une image intégrée.
 *
 * ÉPROUVÉ SUR LA VRAIE BASE, aux deux bouts : message 57424 (`image001.png` 909 o, `image002.gif` 184 414 o d'un
 * correspondant) et message 57464 (nos `signature-1/2/3.png`). Dans les deux cas les empreintes sha256 des pièces
 * se retrouvent À L'IDENTIQUE parmi celles des `data:` du corps, et les PDF joints n'y sont pas.
 *
 * RECENSEMENT DU 03/10/2026 : 14 865 pièces image/*, dont 11 812 posées dans le corps.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'base64')).digest('hex');
/** Un PNG minuscule mais VALIDE en base64 — on hache des octets réels, pas une chaîne inventée. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

describe('🔴 relever les images posées dans le corps', () => {
  it('une image `data:` est relevée, charge comprise', () => {
    expect(chargesImagesDuCorps(`<img src="data:image/png;base64,${PNG}">`)).toEqual([PNG]);
  });

  /**
   * 🔴🔴 LE BASE64 REPLIÉ SUR PLUSIEURS LIGNES EST LE CAS ORDINAIRE — c'est ce que fait Outlook. S'arrêter au
   * premier retour chariot ne lirait qu'un morceau d'image, donc une empreinte fausse, donc une pièce comptée à
   * tort. Les blancs sont retirés ICI, une fois.
   */
  it('🔴🔴 une charge repliée sur plusieurs lignes est lue ENTIÈRE', () => {
    const replie = `${PNG.slice(0, 20)}\n   ${PNG.slice(20)}`;
    expect(chargesImagesDuCorps(`<img src="data:image/png;base64,${replie}">`)).toEqual([PNG]);
  });

  it('plusieurs images, dans l’ordre du document', () => {
    const html = `<img src="data:image/png;base64,${PNG}"><p>x</p><img src="data:image/gif;base64,${GIF}">`;
    expect(chargesImagesDuCorps(html)).toEqual([PNG, GIF]);
  });

  it('un corps vide, absent ou sans image ne rend rien', () => {
    expect(chargesImagesDuCorps('')).toEqual([]);
    expect(chargesImagesDuCorps(null)).toEqual([]);
    expect(chargesImagesDuCorps('<p>bonjour</p><img src="https://x.test/a.png">')).toEqual([]);
  });

  /** ⚠️ UNE IMAGE DISTANTE N'EST PAS POSÉE DANS LE CORPS : elle y est seulement DÉSIGNÉE. */
  it('⚠️ une `data:` qui n’est pas une image n’entre pas', () => {
    expect(chargesImagesDuCorps('<a href="data:text/plain;base64,QUJD">x</a>')).toEqual([]);
  });
});

describe('🔴🔴 l’empreinte décide, et elle seule', () => {
  it('🔴🔴 une pièce dont les octets sont dans le corps est reconnue', () => {
    const empreintes = empreintesDesImagesDuCorps(`<img src="data:image/png;base64,${PNG}">`);
    expect(estPoseeDansLeCorps(sha(PNG), empreintes)).toBe(true);
    expect(estPoseeDansLeCorps(sha(GIF), empreintes)).toBe(false);
  });

  /** ⚠️ LA CASSE DE L'EMPREINTE NE CHANGE RIEN : certaines colonnes la gardent en majuscules. */
  it('⚠️ l’empreinte se compare sans tenir compte de la casse', () => {
    const empreintes = empreintesDesImagesDuCorps(`<img src="data:image/png;base64,${PNG}">`);
    expect(estPoseeDansLeCorps(sha(PNG).toUpperCase(), empreintes)).toBe(true);
  });

  /**
   * 🔴🔴 SANS EMPREINTE, LA RÉPONSE EST « NON » — et c'est la bonne. Ne pas savoir n'est pas une raison de retirer
   * une pièce d'un compteur : 39 pièces de la base sont dans ce cas, et elles doivent rester comptées.
   */
  it('🔴🔴 une pièce sans empreinte reste une pièce jointe', () => {
    const empreintes = empreintesDesImagesDuCorps(`<img src="data:image/png;base64,${PNG}">`);
    expect(estPoseeDansLeCorps(null, empreintes)).toBe(false);
    expect(estPoseeDansLeCorps('', empreintes)).toBe(false);
    expect(estPoseeDansLeCorps('   ', empreintes)).toBe(false);
  });
});

describe('🔴🔴 ce que le tri des pièces en fait', () => {
  const piece = (o: Partial<Parameters<typeof estImageDeSignature>[0]> = {}) => ({
    nomFichier: 'photo.jpg', typeMime: 'image/jpeg', tailleOctets: 2_000_000, ...o,
  });

  /** 🔴🔴 LE CAS QUE LA RÈGLE DE NOM/TAILLE RATAIT : une image de 150 ko posée dans le corps. */
  it('🔴🔴 une grande image POSÉE DANS LE CORPS n’est pas une pièce jointe', () => {
    const p = piece({ nomFichier: 'Image (9).jpeg', tailleOctets: 148_684, integree: true });
    expect(estImageDeSignature(p)).toBe(true);
    expect(trierPieces([p]).vraies).toEqual([]);
  });

  /**
   * 🔴🔴 ET LA RÈGLE D'ARNO DANS L'AUTRE SENS : « une vraie pièce jointe reste comptée, même si c'est une photo ».
   * Une photo de 2 Mo qui n'est PAS dans le corps reste une pièce jointe.
   */
  it('🔴🔴 une photo jointe, non posée dans le corps, reste comptée', () => {
    const p = piece({ nomFichier: 'IMG_9215.JPG', tailleOctets: 2_379_308, integree: false });
    expect(estImageDeSignature(p)).toBe(false);
    expect(trierPieces([p]).vraies).toHaveLength(1);
  });

  /** ⚠️ UN DOCUMENT N'EST JAMAIS CONCERNÉ, quelle que soit la marque : la règle ne vise que les images. */
  it('⚠️ un PDF reste un PDF', () => {
    const p = piece({ nomFichier: 'bail.pdf', typeMime: 'application/pdf', integree: true });
    expect(estImageDeSignature(p)).toBe(false);
  });

  /**
   * 🔴🔴 LES DEUX RÈGLES SE RÉUNISSENT, ELLES NE SE REMPLACENT PAS. Le recensement du 03/10/2026 dit pourquoi :
   * la règle exacte seule REMETTRAIT 871 pictos au compte (des `wink.png` de 3 ko que le mail désigne par une
   * adresse distante). L'union n'écarte donc jamais MOINS qu'avant ce lot.
   */
  it('🔴🔴 sans marque, la règle de nom/taille continue de s’appliquer', () => {
    expect(estImageDeSignature(piece({ nomFichier: 'wink.png', typeMime: 'image/png', tailleOctets: 3834 })))
      .toBe(true);
    expect(estImageDeSignature(piece({ nomFichier: 'image001.png', typeMime: 'image/png', tailleOctets: 900_000 })))
      .toBe(true);
    // ⚠️ `null` et `undefined` se lisent tous deux « non décidé » : le comportement d'avant ce lot, à la lettre.
    expect(estImageDeSignature(piece({ integree: null }))).toBe(false);
    expect(estImageDeSignature(piece({ integree: undefined }))).toBe(false);
  });
});

/**
 * ══ 🔴🔴 LA MÊME RÈGLE EN SQL — une seule définition, rendue dans deux langues ═══════════════════════════════════
 *
 * C'est la garantie centrale du module : la liste pagine, donc elle doit filtrer dans le `WHERE` ; l'écran, lui,
 * trie en TypeScript. Deux écritures « équivalentes » finiraient par compter autrement, et l'on passerait des
 * heures à savoir laquelle a raison.
 */
describe('🔴🔴 le SQL dit la même chose que le TypeScript', () => {
  it('🔴🔴 avec la migration 296, la colonne entre dans la condition', () => {
    const sql = sqlEstVraiePiece('p', true);
    expect(sql).toContain('coalesce(p.integree, false)');
    expect(sql).toContain("p.nom_fichier NOT LIKE '._%'");
  });

  /** 🔴 SANS LA MIGRATION, LA COLONNE N'EST NOMMÉE NULLE PART — patron du dépôt, et une épreuve le scelle. */
  it('🔴 sans la migration 296, le SQL est mot pour mot celui d’avant ce lot', () => {
    expect(sqlEstVraiePiece('p', false)).not.toContain('integree');
    expect(sqlEstVraiePiece('p')).toBe(sqlEstVraiePiece('p', false));
  });

  /** ⚠️ ET L'ALIAS EST RESPECTÉ PARTOUT : les compteurs n'emploient pas tous le même. */
  it('⚠️ l’alias passe dans toutes les parties de la condition', () => {
    const sql = sqlEstVraiePiece('pc', true);
    expect(sql).toContain('coalesce(pc.integree, false)');
    expect(sql).not.toContain('p.integree');
  });
});
