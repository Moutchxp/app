import { describe, it, expect } from 'vitest';
import {
  decouperTexteAImages, lireDataImage, MARQUE_CHARGE, mimeDuType, motDuRefus, octetsDeLaCharge,
  refusDeLImage, sansChargeBase64, sqlExtraitLisible, sqlSansChargeImage, TAILLE_IMAGE_MAX,
  tailleLisible, texteAUneImage, typeImageSur, vignetteImage,
} from './imagesIntegrees';
import { assainirHtml, corpsLisible, htmlVersTexte } from './htmlMail';
import { reecrireImages } from './imagesMail';
import { preparerBrouillon } from './redaction';

/**
 * ══ 🔴🔴 LOT IMAGES-INTEGREES — « UNE IMAGE S'AFFICHE TOUJOURS COMME UNE IMAGE, JAMAIS COMME DU CODE » ═════════
 *
 * Les sept essais demandés par Arno, un par bloc : `data:` dans le HTML, `data:` dans le texte brut, `cid:`, svg
 * refusé, image trop lourde, aperçu sans base64, moteur sans base64 — plus le défaut lui-même, celui du message
 * 57381, rejoué au caractère près.
 *
 * 🔒 Aucune donnée réelle : un pixel GIF inventé et des noms fictifs.
 */

/** Un vrai petit GIF transparent de 1 px — le plus court base64 d'image qui existe. */
const GIF_1PX = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const img = (src: string) => `<p>Bonjour</p><img src="${src}" alt="photo">`;
const relais = {
  piece: (id: number) => `/pieces/${id}`,
  relais: (r: number) => `/distante/${r}`,
  integree: (r: number) => `/integree/${r}`,
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE DÉFAUT D'ARNO — UNE BALISE COUPÉE N'EST PAS DU TEXTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le défaut du message 57381 : une balise coupée en deux', () => {
  /**
   * LE CAS RÉEL, RÉDUIT : le HTML du mail fait 2 327 574 caractères, la lecture coupe à 400 000, et la coupe tombe
   * DANS la balise `<img>` — dont la charge fait à elle seule plus de 2,3 Mo. `assainirHtml` ne trouvait pas de
   * « > » et rendait TOUT le reste en texte échappé : 398 159 caractères de base64 à l'écran.
   */
  it('🔴🔴 un `<img data:…>` coupé ne laisse AUCUN base64 à l’écran', () => {
    const coupe = `<p>Bonjour</p><img src="data:image/jpeg;base64,${'A'.repeat(5000)}`;  // pas de « > »
    const propre = assainirHtml(coupe);
    expect(propre).toContain('Bonjour');
    expect(propre).not.toContain('AAAA');
    expect(propre).not.toContain('base64');
    expect(propre).not.toContain('&lt;img');
  });

  it('🔴 la version TEXTE du même document n’en laisse pas non plus (aperçu, recherche, moteur)', () => {
    const coupe = `<p>Bonjour</p><img src="data:image/jpeg;base64,${'A'.repeat(5000)}`;
    const texte = htmlVersTexte(coupe);
    expect(texte).toBe('Bonjour');
  });

  /** ⚠️ ET UN « < » QUI N'EST PAS UNE BALISE RESTE DU TEXTE : « a < b » en fin de document n'est pas une coupure. */
  it('⚠️ « a < b » en fin de document reste lisible — on n’a pas jeté le bébé', () => {
    expect(assainirHtml('<p>2 < 3</p>')).toContain('2 &lt; 3');
    expect(assainirHtml('<p>fin</p> a < b')).toContain('a &lt; b');
    expect(htmlVersTexte('<p>fin</p> a < b')).toContain('a < b');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① `data:` DANS LE HTML
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① une image « data: » dans le HTML', () => {
  it('🔴 une petite image intacte reste telle quelle : les octets sont déjà là', () => {
    const h = assainirHtml(img(`data:image/gif;base64,${GIF_1PX}`));
    const sortie = reecrireImages(h, relais);
    expect(sortie).toContain(`data:image/gif;base64,${GIF_1PX}`);
    expect(sortie).toContain('<img');
  });

  /**
   * 🔴 UNE IMAGE DONT LA CHARGE A ÉTÉ RETIRÉE À LA LECTURE part vers le relais. C'est ce qui fait qu'une photo de
   * 2 Mo ne traverse plus la page : elle est demandée quand on la regarde.
   */
  it('🔴🔴 une image ALLÉGÉE part vers la route des images intégrées, à son rang', () => {
    const h = assainirHtml(img(`data:image/jpeg;base64,${MARQUE_CHARGE}`));
    expect(reecrireImages(h, relais)).toContain('src="/integree/0"');
  });

  it('🔴 le RANG compte TOUTES les images, intégrées comprises — les deux côtés comptent pareil', () => {
    const h = assainirHtml(
      `<img src="https://exemple.test/a.png">`
      + `<img src="data:image/jpeg;base64,${MARQUE_CHARGE}">`
      + `<img src="https://exemple.test/b.png">`);
    const sortie = reecrireImages(h, relais);
    expect(sortie).toContain('src="/distante/0"');
    expect(sortie).toContain('src="/integree/1"');
    expect(sortie).toContain('src="/distante/2"');
  });

  it('⚠️ sans route d’images intégrées, l’image allégée est DITE, jamais cassée ni codée', () => {
    const h = assainirHtml(img(`data:image/jpeg;base64,${MARQUE_CHARGE}`));
    const sortie = reecrireImages(h, { piece: relais.piece, relais: relais.relais });
    expect(sortie).toContain('data-absente');
    expect(sortie).not.toContain('base64');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② `data:` DANS LE TEXTE BRUT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② une image « data: » écrite dans le TEXTE BRUT', () => {
  /** MESURÉ : 20 messages portent « <img » dans leur `corps_texte`, dont 2 une image `data:`. */
  it('🔴 le texte se découpe autour de la balise, et rien d’autre n’est reconnu', () => {
    const t = `Bonjour\n<img src="data:image/png;base64,${GIF_1PX}">\nMerci`;
    const morceaux = decouperTexteAImages(t);
    expect(morceaux.map((m) => m.sorte)).toEqual(['texte', 'image', 'texte']);
    expect(morceaux[0].valeur).toBe('Bonjour\n');
    expect(morceaux[1].valeur).toContain('data:image/png');
    expect(texteAUneImage(t)).toBe(true);
  });

  it('⚠️ un texte SANS balise n’est pas découpé — on ne devient pas un lecteur de HTML', () => {
    expect(texteAUneImage('Bonjour, le robinet fuit.')).toBe(false);
    expect(decouperTexteAImages('un <b>gras</b> écrit à la main').every((m) => m.sorte === 'texte')).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ `cid:` — UNE IMAGE INTÉGRÉE PAR RÉFÉRENCE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('③ une image « cid: » est reliée à sa pièce', () => {
  it('🔴 résolue par le nom du fichier, elle pointe vers la pièce', () => {
    const h = assainirHtml(img('cid:logo.png@01DC579B.8FCB6050'));
    const sortie = reecrireImages(h, { ...relais, pieces: [{ pieceId: 42, nomFichier: 'logo.png' }] });
    expect(sortie).toContain('src="/pieces/42"');
  });

  it('⚠️ non retrouvée, elle est DITE — jamais une image cassée, jamais du code', () => {
    const h = assainirHtml(img('cid:inconnu.png@01DC'));
    const sortie = reecrireImages(h, { ...relais, pieces: [] });
    expect(sortie).toContain('data-absente');
    expect(sortie).toContain('image intégrée non retrouvée');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LA SÉCURITÉ — SVG REFUSÉ, TAILLE BORNÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ ce qui n’a pas le droit de s’afficher', () => {
  /**
   * 🔴🔴 UN SVG N'EST PAS UNE IMAGE, C'EST UN DOCUMENT : il porte `<script>`, `onload`, un `<foreignObject>`.
   * Arno : « PAS de svg en data:. »
   */
  it('🔴🔴 un svg en « data: » ne s’affiche jamais — une vignette le dit', () => {
    expect(typeImageSur('svg+xml')).toBe(false);
    const h = assainirHtml(img('data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+'));
    const sortie = reecrireImages(h, relais);
    expect(sortie).toContain('Image non affichable');
    expect(sortie).toContain('format non accepté');
    expect(sortie).not.toContain('svg+xml;base64,PHN2');
    expect(sortie).not.toContain('script');
  });

  it('🔴 les quatre formats acceptés, et eux seuls', () => {
    for (const t of ['jpeg', 'jpg', 'png', 'gif', 'webp']) expect(typeImageSur(t)).toBe(true);
    for (const t of ['svg+xml', 'bmp', 'tiff', 'x-icon', 'avif']) expect(typeImageSur(t)).toBe(false);
    expect(mimeDuType('jpg')).toBe('image/jpeg');
    expect(mimeDuType('PNG')).toBe('image/png');
  });

  /**
   * ⚠️ CET ESSAI APPELLE `reecrireImages` SANS PASSER PAR `assainirHtml`, ET C'EST VOULU. Une charge de plus de
   * 8 Mo dépasse `HTML_MAX` : l'assainissement la verrait comme une balise coupée et la jetterait — ce qui est la
   * bonne décision, mais ce n'est pas la règle qu'on éprouve ici. En production, la charge est de toute façon
   * retirée à la lecture, et c'est le relais qui mesure. On éprouve donc la règle de taille, seule.
   */
  it('🔴 une image TROP LOURDE devient une vignette qui la nomme, avec un lien pour l’ouvrir', () => {
    const charge = 'A'.repeat(Math.ceil((TAILLE_IMAGE_MAX + 1024) * 4 / 3));
    const h = img(`data:image/jpeg;base64,${charge}`);
    const sortie = reecrireImages(h, relais);
    expect(sortie).toContain('Image non affichable');
    expect(sortie).toContain('trop lourde');
    expect(sortie).toContain('href="/integree/0"');       // on peut quand même aller la chercher
    expect(sortie).not.toContain('AAAA');
  });

  it('🔴 une charge vide est « illisible », et sans lien : il n’y a rien à ouvrir', () => {
    const h = assainirHtml('<img src="data:image/png;base64,">');
    // ⚠️ l'assainissement garde la balise (le `src` est un `data:image/` valide) ; c'est la réécriture qui tranche.
    const sortie = reecrireImages(h, relais);
    expect(sortie).toContain('illisible');
    expect(sortie).not.toContain('href=');
  });

  it('⚠️ les tailles et les mots, écrits pour un humain', () => {
    expect(octetsDeLaCharge('AAAA')).toBe(3);
    expect(octetsDeLaCharge('AAA=')).toBe(2);
    expect(octetsDeLaCharge('')).toBe(0);
    expect(tailleLisible(0)).toBe('taille inconnue');
    expect(tailleLisible(900)).toBe('900 o');
    expect(tailleLisible(2048)).toBe('2 ko');
    expect(tailleLisible(1740426)).toBe('1,7 Mo');
    expect(motDuRefus('format')).toBe('format non accepté');
    expect(refusDeLImage({ type: 'png', charge: GIF_1PX, allegee: false })).toBeNull();
  });

  it('⚠️ la vignette ÉCHAPPE ce qu’elle reçoit et ne pose jamais de code', () => {
    const v = vignetteImage({ nom: 'photo.jpg', taille: '2 Mo', refus: 'taille', href: '/integree/3' });
    expect(v).toContain('Image non affichable');
    expect(v).toContain('(photo.jpg, 2 Mo — trop lourde)');
    expect(v).toContain('href="/integree/3"');
    expect(v).not.toContain('<script');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ PAS DE CODE AILLEURS — APERÇU, RECHERCHE, MOTEUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤ ni l’aperçu ni le moteur ne voient jamais de base64', () => {
  /**
   * 🔴🔴 CE N'EST PAS QU'UNE QUESTION DE VITESSE. Une charge base64 contient, par construction, à peu près toutes
   * les suites de lettres possibles : y chercher « MARTY » le trouve. Un mail se serait retrouvé rattaché au bien
   * d'un autre pour une coïncidence d'octets.
   */
  it('🔴🔴 le moteur lit le texte sans la charge — pas de fausse correspondance', () => {
    const texte = `Bonjour\n<img src="data:image/jpeg;base64,${'MARTYxyz'.repeat(500)}">\nMerci`;
    const lu = corpsLisible(texte, null);
    expect(lu).toContain('Bonjour');
    expect(lu).toContain('Merci');
    expect(lu).not.toContain('MARTYxyz');
    expect(lu.length).toBeLessThan(200);
  });

  it('🔴 et il lit AUSSI le HTML sans la charge quand le texte manque', () => {
    const lu = corpsLisible(null, `<p>Virement de ZAHRA</p><img src="data:image/png;base64,${'Q'.repeat(4000)}">`);
    expect(lu).toContain('ZAHRA');
    expect(lu).not.toContain('QQQQ');
  });

  it('⚠️ `sansChargeBase64` garde la mention, pas les octets', () => {
    expect(sansChargeBase64('voir data:image/png;base64,AAAABBBBCCCC fin')).toBe('voir data:image fin');
    expect(sansChargeBase64(null)).toBe('');
    expect(sansChargeBase64('rien à faire')).toBe('rien à faire');
  });

  /**
   * 🔴 LES DEUX EXPRESSIONS SQL sont éprouvées par leur FORME — elles tournent en base, pas ici. Ce qui compte est
   * qu'elles ne reconnaissent QUE du base64 : un « .+ » gourmand emporterait le reste du document.
   */
  it('🔴 les expressions SQL ne mordent que sur du base64', () => {
    const r = sqlSansChargeImage('corps_html');
    expect(r).toContain('data:image/[a-zA-Z0-9.+-]+;base64,');
    expect(r).toContain('[A-Za-z0-9+/=[:space:]]+');
    expect(r).not.toContain(".+'");
    expect(r).toContain('SVAVimageIntegree');
    const e = sqlExtraitLisible('m.corps_texte');
    expect(e).toContain('<img[^>]*>');
    expect(e).toContain('(image)');
    expect(e).toContain('<[^>]*>');                      // l'aperçu ne montre AUCUNE balise
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LA LECTURE D'UNE ADRESSE « data: »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑥ lire une adresse « data: » sans jamais jeter', () => {
  it('reconnaît le type, la charge, et la marque', () => {
    expect(lireDataImage(`data:image/JPEG;base64,${GIF_1PX}`))
      .toEqual({ type: 'jpeg', charge: GIF_1PX, allegee: false });
    expect(lireDataImage(`data:image/jpeg;base64,${MARQUE_CHARGE}`)?.allegee).toBe(true);
    // Les blancs d'un repli de ligne ne font pas partie de la charge.
    expect(lireDataImage('data:image/png;base64,AA AA\nBB')?.charge).toBe('AAAABB');
  });

  it('⚠️ tout ce qui n’en est pas rend `null` — jamais une exception', () => {
    expect(lireDataImage(null)).toBeNull();
    expect(lireDataImage('https://exemple.test/a.png')).toBeNull();
    expect(lireDataImage('cid:logo.png')).toBeNull();
    expect(lireDataImage('data:text/html;base64,PGI+')).toBeNull();
    expect(lireDataImage('data:image/png,PasDeBase64')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ RÉPONDRE ET TRANSFÉRER — L'IMAGE CITÉE PART COMME UNE IMAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑦ le brouillon généré : une image citée, jamais du code', () => {
  const origine = {
    messageId: 900, de: 'anna@exemple.test', deNom: 'Anna S.', objet: 'Travaux',
    recuLe: '2026-09-30T13:03:00Z',
    corps: `Bonjour\n<img src="data:image/jpeg;base64,${GIF_1PX}">\nMerci`,
    destA: null, destCc: null, destinatairesFondus: null,
  };
  const ctx = { adresseGestion: 'gestion@exemple.test' };

  /**
   * 🔴🔴 LE DÉFAUT : sans `origineHtml`, la citation HTML retombait sur la version TEXTE du message. Pour les 20
   * mails dont le corps texte porte une balise d'image, elle emportait donc la balise ÉCHAPPÉE — du code.
   */
  it('🔴🔴 la citation emporte une vraie balise d’image, pas la balise échappée', () => {
    const htmlDuCorps = `<p>Bonjour</p><img src="/api/admin/gestion/messages/900/integree?rang=0" alt="photo">`;
    const b = preparerBrouillon('repondre', origine, ctx, { origineHtml: htmlDuCorps });
    expect(b.citationHtml).toContain('<img');
    expect(b.citationHtml).toContain('integree?rang=0');
    expect(b.citationHtml).not.toContain('&lt;img');
    expect(b.citationHtml).not.toContain('base64');
  });

  it('🔴 un transfert emporte la même chose', () => {
    const htmlDuCorps = `<p>Bonjour</p><img src="/api/admin/gestion/messages/900/integree?rang=0">`;
    const b = preparerBrouillon('transferer', origine, ctx, { origineHtml: htmlDuCorps });
    expect(b.citationHtml).toContain('<img');
    expect(b.citationHtml).not.toContain('&lt;img');
  });

  /** ⚠️ SANS HTML D'ORIGINE, on retombe sur le texte — et le texte ne doit pas y poser de base64 non plus. */
  it('⚠️ sans HTML d’origine, la citation texte ne porte aucune charge', () => {
    const b = preparerBrouillon('repondre', origine, ctx, {});
    expect(b.citation ?? '').not.toContain(GIF_1PX.slice(0, 20));
  });
});
