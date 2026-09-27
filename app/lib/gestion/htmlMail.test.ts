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
