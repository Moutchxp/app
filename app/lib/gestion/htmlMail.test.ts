import { describe, it, expect } from 'vitest';
import {
  assainirHtml, decoderEntites, echapperTexte, htmlVersTexte, htmlVide, styleSur, texteVersHtml, urlAcceptable,
} from './htmlMail';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LOT REDACTION-GMAIL — LE HTML D'UN MAIL. C'est, avec les pièces jointes, la surface d'attaque la plus exposée du
 * module : on colle du HTML venu d'un mail reçu ou d'un site, il repart chez un locataire, et il est réaffiché chez
 * nous. Ce fichier éprouve la liste blanche par l'attaque, pas par l'exemple.
 *
 * 🔴 CHAQUE CAS CI-DESSOUS EST UNE FAÇON CONNUE DE CONTOURNER UN NETTOYAGE NAÏF. Ils sont écrits pour ÉCHOUER si
 * quelqu'un remplace un jour la liste blanche par une liste noire « plus simple ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴 ① ce qui ne doit JAMAIS survivre', () => {
  it('un script est effacé — balise ET contenu', () => {
    const r = assainirHtml('<p>Bonjour</p><script>alert(1)</script><p>Suite</p>');
    expect(r).not.toContain('alert');
    expect(r).not.toContain('script');
    expect(r).toContain('Bonjour');
    expect(r).toContain('Suite');
  });

  /**
   * 🔴 Retirer « <script> » par un `replace` laisse « <scr<script>ipt> » se RECOMPOSER en une balise vivante. Ici,
   * chaque `<` ouvre une décision : ce qui n'est pas reconnu devient du TEXTE ÉCHAPPÉ.
   *
   * ⚠️ CE QU'ON EXIGE N'EST PAS QUE « alert(1) » DISPARAISSE — c'est qu'il ne soit plus du CODE. Le mot peut très
   * légitimement rester à l'écran (quelqu'un peut écrire « alert(1) » dans un mail) ; ce qui ne doit plus exister,
   * c'est une balise capable de l'exécuter, et un `<` qui ne soit pas échappé.
   */
  it('🔴 la balise imbriquée qui se recompose (`<scr<script>ipt>`)', () => {
    const r = assainirHtml('<scr<script>ipt>alert(1)</scr</script>ipt>');
    expect(r.toLowerCase()).not.toContain('<script');
    expect(r).not.toMatch(/<[a-zA-Z]/);        // plus aucune balise vivante
    expect(r).not.toContain('<');              // et pas un seul chevron non échappé
  });

  it('un gestionnaire d’événement tombe, la balise reste', () => {
    const r = assainirHtml('<img src="https://x.fr/a.png" onerror="alert(1)" alt="a" />');
    expect(r).not.toContain('onerror');
    expect(r).not.toContain('alert');
    expect(r).toContain('src="https://x.fr/a.png"');
  });

  it('un gestionnaire écrit en MAJUSCULES ou espacé tombe aussi', () => {
    expect(assainirHtml('<p ONCLICK="x()">a</p>')).not.toContain('ONCLICK');
    expect(assainirHtml('<p onmouseover = "x()">a</p>').toLowerCase()).not.toContain('onmouseover');
  });

  it('🔴 `javascript:` sous toutes ses écritures', () => {
    for (const mauvais of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      '&#106;avascript:alert(1)',
      'javascript&colon;alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
    ]) {
      expect(urlAcceptable(mauvais), mauvais).toBe(false);
      expect(assainirHtml(`<a href="${mauvais}">clic</a>`), mauvais).not.toContain('href');
    }
  });

  it('les URL acceptables passent, et le texte du lien reste dans tous les cas', () => {
    for (const bon of ['https://exemple.fr/a', 'http://exemple.fr', 'mailto:jean@exemple.fr', 'tel:+33123456789']) {
      expect(urlAcceptable(bon), bon).toBe(true);
    }
    // Même refusé, le lien ne fait pas disparaître ce qu'on lisait.
    expect(assainirHtml('<a href="javascript:alert(1)">le contrat</a>')).toContain('le contrat');
  });

  it('une URL RELATIVE est refusée : elle ne désigne rien chez le destinataire', () => {
    expect(urlAcceptable('/contrats/1')).toBe(false);
    expect(urlAcceptable('#ancre')).toBe(false);
    expect(urlAcceptable('//exemple.fr/a')).toBe(false); // absolue déguisée en chemin
  });

  it('feuille de style, iframe, formulaire, svg : effacés avec leur contenu', () => {
    for (const mauvais of [
      '<style>body{display:none}</style>',
      '<iframe src="https://mal.fr"></iframe>',
      '<object data="x"></object>',
      '<svg><style>*{x}</style></svg>',
      '<noscript>rien</noscript>',
    ]) {
      const r = assainirHtml(`<p>avant</p>${mauvais}<p>après</p>`);
      expect(r, mauvais).toContain('avant');
      expect(r, mauvais).toContain('après');
      expect(r.toLowerCase(), mauvais).not.toMatch(/<(style|iframe|object|svg|noscript)/);
    }
  });

  /** Un `<script` jamais refermé ne doit RIEN laisser derrière lui. */
  it('un script non refermé emporte tout ce qui suit', () => {
    const r = assainirHtml('<p>avant</p><script>alert(1)');
    expect(r).toContain('avant');
    expect(r).not.toContain('alert');
  });

  it('un formulaire perd son enveloppe (son texte reste, il n’est pas dangereux)', () => {
    const r = assainirHtml('<form action="https://mal.fr"><input name="mdp" />Mot de passe</form>');
    expect(r.toLowerCase()).not.toContain('<form');
    expect(r.toLowerCase()).not.toContain('<input');
    expect(r).toContain('Mot de passe');
  });

  it('un commentaire conditionnel Outlook est jeté en entier', () => {
    const r = assainirHtml('<p>a</p><!--[if mso]><script>alert(1)</script><![endif]--><p>b</p>');
    expect(r).not.toContain('alert');
    expect(r).toContain('a');
    expect(r).toContain('b');
  });
});

describe('🔴 ② `style` : ce qui passe, et ce qui ne passe jamais', () => {
  it('les propriétés de la barre d’outils passent', () => {
    expect(styleSur('color: #a30402; font-weight: bold; text-align: center'))
      .toBe('color: #a30402; font-weight: bold; text-align: center');
  });

  /**
   * 🔴 CE QUI REND `style` DANGEREUX : cacher du texte, et aller chercher une image au dehors — une balise espion
   * qui dit à un tiers quand le mail est ouvert, et depuis quelle adresse.
   */
  it('🔴 ni masquage, ni positionnement, ni `url()`', () => {
    expect(styleSur('display: none')).toBe('');
    expect(styleSur('visibility: hidden')).toBe('');
    expect(styleSur('opacity: 0')).toBe('');
    expect(styleSur('position: absolute; top: 0')).toBe('');
    expect(styleSur('background-image: url(https://espion.fr/p.gif)')).toBe('');
    expect(styleSur('color: red; background: url("https://espion.fr/p.gif")')).toBe('color: red');
    expect(styleSur('width: expression(alert(1))')).toBe('');
  });

  /**
   * 🔴 LOT ETOILE-ET-SIGNATURE — LES MARGES VERTICALES PASSENT, ET IL LE FAUT. Mesuré en comparant côte à côte le
   * même mail envoyé depuis Gmail et depuis chez nous : la signature de gestion@ écrit `margin-top:0pt` sur
   * chacun de ses paragraphes. Ces propriétés tombaient, le client appliquait SES marges, et la signature
   * arrivait aérée d'une ligne blanche de trop entre chaque bloc.
   *
   * ⚠️ `margin` (forme courte) ÉTAIT DÉJÀ ACCEPTÉE : refuser la forme longue ne protégeait de rien.
   */
  it('🔴 les marges verticales et l’alignement d’une cellule survivent', () => {
    expect(styleSur('margin-top:0pt;margin-bottom:0pt')).toContain('margin-top: 0pt');
    expect(styleSur('margin-top:0pt;margin-bottom:0pt')).toContain('margin-bottom: 0pt');
    expect(styleSur('vertical-align:middle')).toContain('vertical-align: middle');
    expect(styleSur('border-collapse:collapse')).toContain('border-collapse: collapse');
  });

  /** 🔒 ET CE QUI CACHE RESTE DEHORS : un retrait très négatif pousse du texte hors de l'écran. */
  it('🔒 ce qui permet de CACHER du texte ne passe toujours pas', () => {
    for (const mauvais of ['text-indent: -9999px', 'display: none', 'overflow: hidden', 'position: absolute',
      'visibility: hidden', 'opacity: 0', 'z-index: 9', 'background-image: url(http://x.fr/p.gif)']) {
      expect(styleSur(mauvais)).toBe('');
    }
    expect(styleSur('color: red; /* ruse */ position: fixed')).toBe('color: red');
  });

  it('un `style` entièrement refusé ne laisse pas d’attribut vide', () => {
    expect(assainirHtml('<p style="display:none">caché</p>')).toBe('<p>caché</p>');
  });
});

describe('🔴 ③ les images', () => {
  it('`cid:` est accepté — c’est ainsi qu’un logo de signature voyage avec le message', () => {
    expect(assainirHtml('<img src="cid:logo123" alt="SVAV" />')).toContain('src="cid:logo123"');
  });

  it('`data:image` est accepté (il ne va rien chercher au dehors), les autres `data:` non', () => {
    expect(assainirHtml('<img src="data:image/png;base64,iVBOR" />')).toContain('data:image/png');
    expect(assainirHtml('<img src="data:text/html,<script>alert(1)</script>" />')).not.toContain('data:text/html');
  });

  it('une image sans source acceptable n’est pas rendue du tout', () => {
    expect(assainirHtml('<img src="javascript:alert(1)" />')).toBe('');
    expect(assainirHtml('<img />')).toBe('');
  });

  /**
   * 🔴 LOT LECTURE-HTML-FIL-TROMBONE — UNE LARGEUR FRACTIONNAIRE EST UNE LARGEUR. La règle n'acceptait que des
   * entiers ; GMAIL LUI-MÊME en écrit avec des décimales dans les signatures qu'il compose. Relevé sur le mail
   * 57185 tel qu'il est arrivé : `width="23.225806451612918"`. L'attribut tombait, et l'icône de téléphone de
   * 23 px s'affichait à sa taille naturelle — un tiers de la hauteur de la page.
   *
   * ⚠️ ELLE EST RÉÉCRITE ENTIÈRE : l'attribut HTML `width` n'admet qu'un entier, et s'en remettre à la tolérance
   * de chaque navigateur ferait dépendre le rendu du navigateur qui lit.
   */
  it('🔴 une dimension à décimales (celles de Gmail) est gardée, arrondie à l’entier', () => {
    const out = assainirHtml('<img src="https://x.fr/a.png" width="23.225806451612918" height="23">');
    expect(out).toContain('width="23"');
    expect(out).toContain('height="23"');
  });

  it('une dimension entière passe inchangée, et une dimension qui n’en est pas une tombe', () => {
    expect(assainirHtml('<img src="https://x.fr/a.png" width="198" height="43">')).toContain('width="198"');
    // 🔒 CE QUI NE CHANGE PAS : ce doit rester un NOMBRE, borné à quatre chiffres avant la virgule.
    for (const mauvais of ['100%', '12px', '-5', '12345', 'auto', 'e1', '1e3']) {
      expect(assainirHtml(`<img src="https://x.fr/a.png" width="${mauvais}">`)).not.toContain('width=');
    }
  });
});

describe('④ ce qui doit survivre — la mise en forme de la barre d’outils', () => {
  it('gras, italique, souligné, barré, couleur, police, alignement, listes, citation, retrait', () => {
    const riche = '<p><b>gras</b> <i>italique</i> <u>souligné</u> <s>barré</s></p>'
      + '<p style="text-align: center"><font face="Georgia" size="4" color="#a30402">police</font></p>'
      + '<ul><li>puce</li></ul><ol><li>un</li></ol>'
      + '<blockquote>cité</blockquote><div style="margin-left: 40px">retrait</div>';
    const r = assainirHtml(riche);
    for (const attendu of ['<b>', '<i>', '<u>', '<s>', 'text-align: center', 'face="Georgia"',
      '<ul>', '<ol>', '<li>', '<blockquote>', 'margin-left: 40px']) {
      expect(r, attendu).toContain(attendu);
    }
  });

  it('un lien conservé part en nouvel onglet, sans rendre la main à la page ouverte', () => {
    const r = assainirHtml('<a href="https://exemple.fr">le contrat</a>');
    expect(r).toContain('href="https://exemple.fr"');
    expect(r).toContain('rel="noopener noreferrer"');
    expect(r).toContain('target="_blank"');
  });

  /** ⚠️ Une balise laissée ouverte mettrait en gras tout ce qui suit dans l'écran qui l'affiche. */
  it('🔴 les balises laissées ouvertes sont refermées', () => {
    expect(assainirHtml('<b>gras')).toBe('<b>gras</b>');
    expect(assainirHtml('<div><p>a')).toBe('<div><p>a</p></div>');
  });

  it('un document mal imbriqué est remis d’aplomb', () => {
    expect(assainirHtml('<b><i>x</b></i>')).toBe('<b><i>x</i></b>');
  });

  it('le texte qui ressemble à du HTML est échappé, jamais interprété', () => {
    expect(assainirHtml('2 < 3 et 5 > 4')).toContain('2 &lt; 3');
    expect(echapperTexte('<b>&')).toBe('&lt;b&gt;&amp;');
  });

  it('une entrée vide ou absente ne casse rien', () => {
    expect(assainirHtml(null)).toBe('');
    expect(assainirHtml(undefined)).toBe('');
    expect(assainirHtml('')).toBe('');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT EDITEUR-PJ — CE QUE LA BARRE D'OUTILS PRODUIT VRAIMENT, ET QUI SE PERDAIT À L'ENVOI.
 *
 * Arno : « des options ne marchent pas ». Chaque commande a été exercée dans Chrome le 28/09/2026 et le HTML
 * RÉELLEMENT produit a été relevé — c'est lui qui est éprouvé ici, pas une forme idéale écrite de mémoire. Deux
 * mises en forme étaient justes à l'écran et fausses dans le mail :
 *
 *   ① LA POLICE. `font-family: Georgia, "Times New Roman", serif` est sérialisé par le navigateur en
 *      `&quot;…&quot;`. Cette entité SE TERMINE PAR UN POINT-VIRGULE : le découpage des déclarations coupait en
 *      plein milieu du nom de police, et il ne partait que `font-family: Georgia, &quot`. « Serif » et « Largeur
 *      fixe » n'arrivaient donc jamais chez le destinataire.
 *
 *   ② LE RETRAIT. « Augmenter le retrait » produit un `blockquote` avec `border: none`. `border` n'étant pas
 *      autorisé, seul lui tombait — et le destinataire voyait le TRAIT VERTICAL DE CITATION que sa messagerie
 *      ajoute d'office à un `blockquote` nu. On demandait un retrait, on envoyait une citation.
 *
 * 🔴 ET LE DÉCODAGE REND LE FILTRE PLUS STRICT, PAS PLUS PERMISSIF : `expression&#40;…` passait sous son nez.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT EDITEUR-PJ — les formes EXACTES relevées dans Chrome', () => {
  /** Les six commandes qui produisent un `span` de style : relevées telles quelles dans le navigateur. */
  it('gras, italique, souligné, barré, taille et couleur survivent tels que Chrome les écrit', () => {
    const cas: [string, string][] = [
      ['font-weight: bold', '<p><span style="font-weight: bold;">x</span></p>'],
      ['font-style: italic', '<p><span style="font-style: italic;">x</span></p>'],
      // ⚠️ Chrome écrit `text-decoration-line`, PAS `text-decoration` : les deux doivent être autorisés.
      ['text-decoration-line: underline', '<p><span style="text-decoration-line: underline;">x</span></p>'],
      ['text-decoration-line: line-through', '<p><span style="text-decoration-line: line-through;">x</span></p>'],
      ['font-size: xx-large', '<p><span style="font-size: xx-large;">x</span></p>'],
      ['color: rgb(163, 4, 2)', '<p><span style="color: rgb(163, 4, 2);">x</span></p>'],
      // Le SURLIGNAGE, ajouté à la barre par ce lot : `hiliteColor` produit un `background-color`.
      ['background-color: rgb(255, 242, 168)', '<p><span style="background-color: rgb(255, 242, 168);">x</span></p>'],
    ];
    for (const [attendu, html] of cas) expect(assainirHtml(html), attendu).toContain(attendu);
  });

  it('🔴 ① LA POLICE ARRIVE ENTIÈRE — le `;` de `&quot;` ne coupe plus le nom en deux', () => {
    const chrome = '<p><span style="font-family: Georgia, &quot;Times New Roman&quot;, serif;">x</span></p>';
    const r = assainirHtml(chrome);
    expect(r).toContain('Times New Roman');
    expect(r).toContain('serif');
    // Le défaut se reconnaissait à cette chaîne exacte : la déclaration tronquée juste après l'entité.
    expect(r).not.toContain('&amp;quot');
  });

  it('…et la police à largeur fixe aussi, qui porte le même guillemet', () => {
    const r = assainirHtml('<span style="font-family: &quot;Courier New&quot;, Courier, monospace;">x</span>');
    expect(r).toContain('Courier New');
    expect(r).toContain('monospace');
  });

  it('🔴 ② LE RETRAIT RESTE UN RETRAIT : `border: none` survit, donc pas de trait de citation chez le destinataire', () => {
    const chrome = '<blockquote style="margin: 0px 0px 0px 40px; border: none; padding: 0px;"><p>x</p></blockquote>';
    const r = assainirHtml(chrome);
    expect(r).toContain('border: none');
    expect(r).toContain('margin: 0px 0px 0px 40px');
  });

  it('les alignements, y compris « justifier », partent sur le bloc', () => {
    for (const v of ['left', 'center', 'right', 'justify']) {
      expect(assainirHtml(`<p style="text-align: ${v};">x</p>`)).toContain(`text-align: ${v}`);
    }
  });

  it('🔴 le décodage RESSERRE le filtre : une propriété dangereuse écrite en entités est maintenant vue et refusée', () => {
    // Avant le décodage, `expression&#40;` n'était pas reconnu comme `expression(` et traversait le filtre.
    expect(styleSur(decoderEntites('color: expression&#40;alert(1)&#41;'))).toBe('');
    expect(styleSur(decoderEntites('background-color: url&#40;//espion.fr/p.gif&#41;'))).toBe('');
    // …et une déclaration honnête n'est pas touchée pour autant.
    expect(styleSur(decoderEntites('color: #a30402'))).toBe('color: #a30402');
  });

  it('🔴 aucune bordure ne peut aller chercher une image au dehors', () => {
    expect(assainirHtml('<p style="border-image: url(//espion.fr/p.gif);">x</p>')).not.toContain('espion');
    expect(assainirHtml('<p style="border: 1px solid url(//espion.fr/p.gif);">x</p>')).not.toContain('espion');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 ⑤ LA VERSION TEXTE — celle que reçoit une partie des destinataires.
 *
 * Un `multipart/alternative` laisse le client choisir : beaucoup de gens verront CETTE version. Une version bâclée
 * (balises retirées d'un coup de `replace`, tout collé sur une ligne) donne un message illisible à une partie des
 * destinataires sans que personne chez nous s'en aperçoive — c'est un défaut qui ne se voit jamais d'ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 ⑤ la version texte est FIDÈLE, pas seulement « sans balises »', () => {
  it('les blocs et les sauts de ligne sont préservés', () => {
    expect(htmlVersTexte('<p>Bonjour Madame,</p><p>Le plombier passera mardi.<br />Cordialement,</p>'))
      .toBe('Bonjour Madame,\n\nLe plombier passera mardi.\nCordialement,');
  });

  it('une liste à puces garde ses puces', () => {
    expect(htmlVersTexte('<ul><li>robinet</li><li>joint</li></ul>')).toBe('- robinet\n- joint');
  });

  it('🔴 une liste numérotée tient son COMPTEUR — « 1. 2. 3. », jamais « 1. 1. 1. »', () => {
    expect(htmlVersTexte('<ol><li>un</li><li>deux</li><li>trois</li></ol>')).toBe('1. un\n2. deux\n3. trois');
  });

  /**
   * 🔴 L'ADRESSE D'UN LIEN EST ÉCRITE quand elle diffère du texte : sans cela, la version texte perd l'information
   * même du lien, et le destinataire ne peut pas suivre ce qu'on lui envoie.
   */
  it('🔴 l’adresse d’un lien est écrite quand elle apprend quelque chose', () => {
    expect(htmlVersTexte('<p>Voir <a href="https://exemple.fr/c">le contrat</a>.</p>'))
      .toBe('Voir le contrat (https://exemple.fr/c).');
  });

  it('…et PAS quand elle répète le texte — ce serait du bruit', () => {
    expect(htmlVersTexte('<a href="https://exemple.fr">https://exemple.fr</a>')).toBe('https://exemple.fr');
    expect(htmlVersTexte('<a href="mailto:jean@x.fr">jean@x.fr</a>')).toBe('jean@x.fr');
  });

  it('les entités sont décodées — « &eacute; » n’a rien à faire dans un mail texte', () => {
    expect(htmlVersTexte('<p>caf&eacute; &amp; th&eacute;</p>')).toBe('café & thé');
    expect(decoderEntites('&#233;t&#xE9;')).toBe('été');
  });

  it('le contenu d’un script ne se retrouve JAMAIS dans la version texte', () => {
    expect(htmlVersTexte('<p>a</p><script>alert(1)</script>')).toBe('a');
    expect(htmlVersTexte('<style>body{x}</style><p>b</p>')).toBe('b');
  });

  it('les lignes vides en excès sont repliées, et les blancs de fin retirés', () => {
    expect(htmlVersTexte('<p>a</p><p></p><p></p><p>b</p>   ')).toBe('a\n\nb');
  });

  it('un tableau garde ses colonnes séparées, et ses lignes distinctes', () => {
    expect(htmlVersTexte('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>')).toBe('a\tb\nc');
  });
});

describe('⑥ vide, et aller-retour texte', () => {
  /** ⚠️ `<p><br></p>` est EXACTEMENT ce qu'un éditeur riche produit quand on n'a rien tapé. */
  it('🔴 ce qu’un éditeur riche produit à vide EST vide', () => {
    expect(htmlVide('<p><br /></p>')).toBe(true);
    expect(htmlVide('<div><br></div>')).toBe(true);
    expect(htmlVide('<p>&nbsp;</p>')).toBe(true);
    expect(htmlVide('')).toBe(true);
    expect(htmlVide(null)).toBe(true);
    expect(htmlVide('<p>a</p>')).toBe(false);
  });

  it('un corps texte d’avant ce lot devient du HTML qui garde ses paragraphes', () => {
    expect(texteVersHtml('Bonjour,\nLe plombier passera.\n\nCordialement'))
      .toBe('<p>Bonjour,<br />Le plombier passera.</p><p>Cordialement</p>');
    expect(texteVersHtml('')).toBe('');
  });

  it('le texte converti puis relu redonne le même texte', () => {
    const t = 'Bonjour Madame,\nLe plombier passera mardi.\n\nCordialement';
    expect(htmlVersTexte(texteVersHtml(t))).toBe(t);
  });

  it('le HTML converti en texte ne contient plus jamais de balise', () => {
    expect(htmlVersTexte(assainirHtml('<p><b>a</b> <a href="https://x.fr">b</a></p>'))).not.toMatch(/<[a-z]/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT BIEN-RATTACHE — LES ENTITÉS D'UN MAIL SONT LISIBLES, ET RESTENT SÛRES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴 les entités HTML d’un mail reçu', () => {
  /**
   * LE DÉFAUT, VU PAR ARNO SUR LE FIL 36494 : le corps s'affichait « copropri&eacute;t&eacute; situ&eacute;e » et
   * « Madame,&nbsp; ». `echapperTexte` échappait le `&`, donc `&eacute;` devenait `&amp;eacute;` — affiché tel quel.
   */
  it('🔴 une entité nommée redevient son caractère, au lieu d’être affichée telle quelle', () => {
    expect(assainirHtml('<p>copropri&eacute;t&eacute; situ&eacute;e</p>')).toBe('<p>copropriété située</p>');
    expect(assainirHtml('<p>Madame,&nbsp;</p>')).toContain('Madame,');
    expect(assainirHtml('<p>Madame,&nbsp;</p>')).not.toContain('&amp;');
  });

  it('une entité NUMÉRIQUE aussi — « &#8203; » ne doit pas s’écrire en toutes lettres', () => {
    expect(assainirHtml('<p>a&#8203;b</p>')).not.toContain('&#8203;');
    expect(assainirHtml('<p>2&#8364;</p>')).toContain('€');
  });

  /**
   * 🔴 ET LA SÛRETÉ NE BOUGE PAS. On décode d'abord, on ré-échappe ensuite : une balise écrite en entités
   * redevient du TEXTE échappé, jamais une balise. C'est la seule chose qui rendait ce changement acceptable.
   */
  it('🔴 une BALISE écrite en entités reste du TEXTE, et ne devient jamais du code', () => {
    const r = assainirHtml('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(r).not.toContain('<script');
    expect(r).toContain('&lt;script&gt;');
  });

  it('🔴 une entité qui cache un « & » ne casse pas l’échappement du texte qui suit', () => {
    expect(assainirHtml('<p>a &amp; b &lt; c</p>')).toBe('<p>a &amp; b &lt; c</p>');
  });

  it('un « & » nu reste échappé — il n’y a pas d’entité à décoder', () => {
    expect(assainirHtml('<p>Dupont & Fils</p>')).toBe('<p>Dupont &amp; Fils</p>');
  });
});
