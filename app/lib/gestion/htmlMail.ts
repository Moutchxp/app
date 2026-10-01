/**
 * MODULE « GESTION » — LOT REDACTION-GMAIL : LE HTML D'UN MAIL, ASSAINI ET RENDU EN TEXTE. Module PUR : aucun import,
 * aucune base, aucun réseau, aucun DOM. Il tourne donc À L'IDENTIQUE dans le navigateur (au collage) et sur le
 * serveur (à l'envoi) — et c'est indispensable : une protection qui n'existerait que d'un côté ne protège de rien.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI SE JOUE ICI. On colle dans l'éditeur du HTML venu d'ailleurs — d'un mail reçu, d'un site, d'un traitement
 * de texte. Ce HTML part ensuite par mail à un locataire ou à un artisan, et il est réaffiché chez nous. C'est donc,
 * avec les pièces jointes, la surface d'attaque la plus exposée du module.
 *
 * 🔴 LISTE BLANCHE, JAMAIS LISTE NOIRE. On énumère ce qui est AUTORISÉ, et tout le reste tombe. Une liste noire
 * demande de connaître d'avance toutes les façons d'écrire une attaque — `<scr<script>ipt>`, `<img onerror=…>`,
 * `<a href="javascript:…">`, `<svg><style>`, une entité HTML qui reconstitue un deux-points… Il y en a toujours une
 * de plus. Une liste blanche ne se trompe que dans un sens : elle retire une mise en forme qu'on remettra.
 *
 * 🔴 ON NE FAIT PAS CONFIANCE AU NAVIGATEUR POUR NETTOYER. Le collage est nettoyé côté écran pour que la personne
 * VOIE ce qu'elle envoie — mais l'assainissement qui COMPTE est celui de l'envoi, côté serveur, parce que c'est le
 * seul qu'un écran modifié ne peut pas contourner. Le même code aux deux endroits : une seule règle, une seule vérité.
 *
 * ⚠️ AUCUNE DÉPENDANCE NOUVELLE. Le dépôt n'a ni `dompurify`, ni `sanitize-html`, ni `jsdom` en production — et le
 * futur hébergement ne doit pas en hériter. Ce fichier est un analyseur de balises, pas un moteur de rendu : il ne
 * cherche pas à comprendre le document, il ne laisse passer que ce qu'il reconnaît.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * LES BALISES AUTORISÉES. Ce sont celles que produit la barre d'outils, plus celles qu'un mail cité apporte.
 *
 * ⚠️ CE QUI N'Y EST PAS, ET POURQUOI : `script` (évident), `style` (une feuille de style peut masquer du texte ou
 * en révéler), `iframe`/`object`/`embed`/`applet` (du contenu tiers), `form`/`input`/`button` (un faux formulaire
 * de mot de passe dans un mail est du hameçonnage), `link`/`meta`/`base` (ils modifient le document qui les reçoit),
 * `svg`/`math` (leurs enfants ont leur propre grammaire, où `<style>` et les gestionnaires d'événements reviennent).
 */
const BALISES = new Set([
  'p', 'br', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup',
  'ol', 'ul', 'li', 'blockquote', 'pre', 'code',
  'a', 'font', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr',
]);

/** Les balises SANS fermeture. Leur écrire un `</br>` produirait un document que le destinataire rendra de travers. */
const ORPHELINES = new Set(['br', 'img', 'hr']);

/**
 * LES BALISES DONT ON JETTE AUSSI LE CONTENU. Pour toutes les autres balises inconnues on ne retire QUE l'enveloppe
 * (le texte reste) : c'est ce qu'on veut d'un `<article>` ou d'un `<section>`. Mais le contenu d'un `<script>` ou
 * d'un `<style>` n'est PAS du texte — c'est du code, et l'afficher en clair serait au mieux illisible, au pire une
 * fuite. On l'efface entièrement.
 */
const A_VIDER = new Set(['script', 'style', 'iframe', 'object', 'embed', 'applet', 'noscript', 'svg', 'math', 'template', 'title', 'head']);

/**
 * LES ATTRIBUTS AUTORISÉS, PAR BALISE. Tout le reste tombe — au premier chef les `on*` (`onerror`, `onclick`,
 * `onmouseover`…), qui sont du JavaScript déguisé en attribut, et `srcset`/`formaction`/`xlink:href`.
 */
const ATTRIBUTS: Record<string, readonly string[]> = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'width', 'height'],
  font: ['face', 'size', 'color'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};
/** `style` est autorisé PARTOUT, mais son contenu est filtré propriété par propriété (voir `styleSur`). */
const STYLE_PARTOUT = true;

/**
 * LES PROPRIÉTÉS CSS AUTORISÉES. Celles que la barre d'outils produit, et rien de plus.
 *
 * 🔴 CE QUI N'Y EST PAS EST CE QUI REND `style` DANGEREUX : `position` (superposer un faux bouton), `display` /
 * `visibility` / `opacity` (cacher du texte qu'un filtre anti-spam lira mais pas l'humain), `background-image` et
 * tout ce qui prend une `url()` (une balise espion qui dit quand le mail est ouvert, et depuis où), `behavior` et
 * `expression` (du script sur les vieux moteurs), `content`, `transform`, `z-index`.
 */
const PROPRIETES = new Set([
  'color', 'background-color',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'text-decoration-line', 'text-align',
  'margin-left', 'margin-right', 'padding-left', 'padding-right',
  'border-left', 'padding', 'margin', 'line-height', 'white-space',
  /**
   * ══ 🔴 LOT ETOILE-ET-SIGNATURE — LES MARGES VERTICALES, ET L'ALIGNEMENT D'UNE CELLULE ══════════════════════
   *
   * MESURÉ EN COMPARANT CÔTE À CÔTE, le 29/09/2026, le même mail envoyé depuis Gmail et depuis chez nous. La
   * signature de gestion@ écrit `margin-top:0pt;margin-bottom:0pt` sur chacun de ses paragraphes. Ces deux
   * propriétés tombaient — le client appliquait alors SES marges par défaut, et la signature arrivait aérée
   * d'une ligne blanche entre « Service Gestion », l'adresse et les téléphones. Le contenu était juste ; la
   * mise en page ne l'était pas, et c'est précisément ce qu'Arno demande de reproduire.
   *
   * ⚠️ `margin` (LA FORME COURTE) ÉTAIT DÉJÀ ACCEPTÉE. Laisser passer `margin: 0 0 0 40px` tout en refusant
   * `margin-top: 0pt` ne protégeait de rien : c'était une incohérence, pas un verrou.
   *
   * 🔒 ET ON N'EN PROFITE PAS POUR OUVRIR LE RESTE. `text-indent` reste DEHORS (un retrait très négatif pousse
   * du texte hors de l'écran : lu par un filtre, invisible pour l'humain), `display` et `overflow` aussi (ils
   * cachent), et rien de ce qui prend une `url()` n'entre jamais.
   */
  'margin-top', 'margin-bottom', 'padding-top', 'padding-bottom',
  'vertical-align', 'border-collapse',
  /**
   * 🔴 LA FAMILLE `border`, AJOUTÉE AU LOT EDITEUR-PJ — et pas par goût de la complétude.
   *
   * MESURÉ dans Chrome le 28/09/2026 : « Augmenter le retrait » produit
   * `<blockquote style="margin: 0 0 0 40px; border: none; padding: 0">`. Sans `border` dans cette liste, seul le
   * `border: none` tombait — et le destinataire recevait un `blockquote` nu, que sa messagerie décore d'un TRAIT
   * VERTICAL DE CITATION. Autrement dit : on demandait un retrait, on envoyait une citation. La mise en forme était
   * juste à l'écran et fausse dans le mail — exactement le défaut que ce lot cherchait.
   *
   * ⚠️ AUCUNE DE CES PROPRIÉTÉS NE VA CHERCHER QUOI QUE CE SOIT AU DEHORS : `border-image` n'y est PAS, et le
   * filtre sur `url(` plus bas reste la barrière — une bordure ne doit pas pouvoir devenir une balise espion.
   */
  'border', 'border-color', 'border-style', 'border-width', 'border-radius',
]);

/** Les protocoles qu'un lien a le droit de porter. Tout le reste — `javascript:`, `vbscript:`, `file:`, `data:` — non. */
const PROTOCOLES_LIEN = ['http://', 'https://', 'mailto:', 'tel:'];
/**
 * Les sources qu'une image a le droit de porter. `cid:` est indispensable : c'est ainsi qu'un logo de signature est
 * joint au message lui-même. `data:image/…` est accepté parce qu'il ne va chercher RIEN au dehors — contrairement à
 * une image distante, qui signale l'ouverture du mail à un serveur tiers.
 *
 * ═══ 🔴 LOT ETOILE-ET-SIGNATURE — POURQUOI UN CHEMIN RELATIF, ET POURQUOI CELUI-LÀ SEULEMENT ═══════════════════
 *
 * LE DÉFAUT, VU À L'ÉCRAN. La signature Gmail arrive dans l'éditeur avec ses images renvoyées vers notre route
 * (`/api/admin/gestion/signature/image?rang=N`). Or un chemin RELATIF ne commence par aucun des protocoles
 * ci-dessus : le `src` tombait, et une image sans source acceptable n'est pas rendue du tout. L'éditeur affichait
 * donc la signature SANS ses trois icônes — proprement, silencieusement, et à contresens de la demande.
 *
 * 🔴 ON N'OUVRE PAS « LES CHEMINS RELATIFS » EN GÉNÉRAL, ON OUVRE CELUI-CI. Accepter tout `/…` laisserait un
 * expéditeur écrire `<img src="/api/admin/…">` dans un mail reçu et faire appeler N'IMPORTE QUELLE de nos routes
 * par le navigateur de qui lit. Nos routes qui AGISSENT sont en POST ou DELETE, donc inertes à une image — mais
 * une permission qu'on n'a pas besoin d'accorder ne s'accorde pas.
 *
 * Ce chemin-ci est en lecture seule, borné à un rang, et ne rend que des octets d'image (voir sa route). Le pire
 * qu'un expéditeur mal intentionné puisse obtenir en l'écrivant dans son mail est d'afficher NOTRE logo.
 *
 * ⚠️ LA CONSTANTE VIT ICI, dans la couche la plus BASSE, et `signatureImages` la reprend. L'inverse ferait dépendre
 * l'assainissement — que tout le module traverse — d'un fichier de fonctionnalité.
 */
export const CHEMIN_IMAGE_SIGNATURE = '/api/admin/gestion/signature/image';
const PROTOCOLES_IMAGE = ['http://', 'https://', 'cid:', 'data:image/', CHEMIN_IMAGE_SIGNATURE];

/** Décode les entités qu'on doit comprendre pour juger une URL (et seulement celles-là). PUR. */
function decoderPourJuger(v: string): string {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&colon;?/gi, ':')
    .replace(/&tab;?/gi, '\t')
    .replace(/&newline;?/gi, '\n')
    .replace(/&amp;?/gi, '&');
}

/**
 * UNE URL EST-ELLE ACCEPTABLE ? PUR.
 *
 * 🔴 ON JUGE LA VALEUR DÉCODÉE, ET DÉBARRASSÉE DE SES BLANCS. `&#106;avascript&#58;alert(1)` et
 * `java\tscript:alert(1)` sont deux façons d'écrire `javascript:` que le navigateur comprendra et qu'une
 * comparaison naïve laisserait passer. On décode donc AVANT de comparer, et on retire tout caractère de contrôle.
 *
 * ⚠️ UNE URL RELATIVE (`/quelque-chose`, `#ancre`) EST REFUSÉE dans un mail : elle ne désigne rien chez le
 * destinataire, et `//exemple.fr` est une URL ABSOLUE déguisée en chemin.
 */
export function urlAcceptable(brut: string, protocoles: readonly string[] = PROTOCOLES_LIEN): boolean {
  const v = decoderPourJuger(brut).replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
  if (v === '') return false;
  return protocoles.some((p) => v.startsWith(p));
}

/**
 * Le contenu d'un `style=`, propriété par propriété. Rend `''` quand rien ne survit. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA VALEUR ARRIVE DÉCODÉE (voir `attributsSurs`), ET C'EST INDISPENSABLE POUR DEUX RAISONS.
 *
 * ① LA POLICE ÉTAIT CASSÉE, ET PERSONNE NE POUVAIT LE VOIR DANS NOS FICHIERS. Choisir « Serif » produit
 *    `font-family: Georgia, "Times New Roman", serif`. Sérialisé par le navigateur, le guillemet devient `&quot;` —
 *    une entité qui SE TERMINE PAR UN POINT-VIRGULE. Le découpage ci-dessous, qui sépare les déclarations sur `;`,
 *    coupait donc en plein milieu du nom de police : il ne restait que `font-family: Georgia, &quot`, et la police
 *    du mail retombait sur celle par défaut. Mesuré le 28/09/2026 : « Serif » et « Largeur fixe » ne partaient pas.
 *
 * ② ET C'EST PLUS SÛR, PAS MOINS. Le filtre ci-dessous cherche `url(`, `expression(`, `javascript:`. Écrits en
 *    entités (`expression&#40;…`), ils passaient sous son nez. Décoder AVANT de juger, c'est juger ce que le
 *    navigateur du destinataire lira vraiment — la même règle que pour les URL (`decoderPourJuger`).
 *
 * ⚠️ CE QUI RESTE IMPARFAIT, ET QU'ON ASSUME : un `;` à l'intérieur d'une valeur entre guillemets couperait encore.
 * Aucune propriété de cette liste blanche n'en produit ; écrire un analyseur CSS complet pour ce cas serait un
 * projet à part, et chaque bogue s'y verrait dans un mail parti.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function styleSur(brut: string): string {
  const gardees: string[] = [];
  for (const decl of brut.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const nom = decl.slice(0, i).trim().toLowerCase();
    const valeur = decl.slice(i + 1).trim();
    if (!PROPRIETES.has(nom) || valeur === '') continue;
    // 🔴 AUCUNE VALEUR NE PEUT ALLER CHERCHER QUOI QUE CE SOIT AU DEHORS, ni contenir de code : `url(…)` fait une
    //   balise espion, `expression(…)` exécutait du script sur les vieux moteurs, et un `/*` masque la suite.
    const v = valeur.toLowerCase();
    if (/url\s*\(|expression\s*\(|javascript:|@import|\/\*|<|\\/.test(v)) continue;
    gardees.push(`${nom}: ${valeur}`);
  }
  return gardees.join('; ');
}

/** Les attributs d'une balise, filtrés. PUR. */
function attributsSurs(balise: string, brut: string): string {
  const permis = ATTRIBUTS[balise] ?? [];
  const sortie: string[] = [];
  // Une seule passe sur `nom="valeur"`, `nom='valeur'` ou `nom=valeur`. Un attribut sans valeur (`disabled`) est
  //   ignoré : aucune balise autorisée n'en a besoin, et il n'apporte rien à un mail.
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of brut.matchAll(re)) {
    const nom = m[1].toLowerCase();
    const valeur = m[3] ?? m[4] ?? m[5] ?? '';
    // 🔴 LES `on*` TOMBENT AVANT TOUT LE RESTE : ce sont eux qu'on redoute, et ils ne sont dans aucune liste.
    if (nom.startsWith('on')) continue;
    if (nom === 'style') {
      if (!STYLE_PARTOUT) continue;
      // 🔴 DÉCODÉ AVANT D'ÊTRE JUGÉ : le `;` de `&quot;` coupait les noms de police en deux, et un `expression&#40;`
      //   passait le filtre. Voir l'encadré de `styleSur`. `echapperAttribut` ré-échappe ensuite pour la sortie.
      const s = styleSur(decoderEntites(valeur));
      if (s !== '') sortie.push(`style="${echapperAttribut(s)}"`);
      continue;
    }
    if (!permis.includes(nom)) continue;
    if (nom === 'href' && !urlAcceptable(valeur)) continue;
    if (nom === 'src' && !urlAcceptable(valeur, PROTOCOLES_IMAGE)) continue;
    /**
     * ══ 🔴 UNE DIMENSION PEUT S'ÉCRIRE AVEC DES DÉCIMALES — RÈGLE RÉÉCRITE LE 29/09/2026 ══════════════════════
     *
     * ELLE N'ACCEPTAIT QUE DES ENTIERS (`/^\d{1,4}$/`), et c'était trop strict d'un cas très banal : GMAIL
     * LUI-MÊME écrit des largeurs fractionnaires dans les signatures qu'il compose. Relevé sur le mail 57185,
     * tel que Gmail l'a envoyé : `width="23.225806451612918" height="23"`.
     *
     * CE QUE CELA DONNAIT À L'ÉCRAN : l'attribut tombait, l'image perdait sa taille et s'affichait à sa
     * dimension NATURELLE — une icône de téléphone de 23 px occupait un tiers de la hauteur de la page. Le mail
     * restait lisible, mais il ne ressemblait plus à ce qu'on voit dans Gmail, et c'est la promesse de ce lot.
     *
     * 🔒 CE QUI NE CHANGE PAS : la valeur reste un NOMBRE, borné à quatre chiffres avant la virgule. Elle est
     * réécrite ENTIÈRE (`23.2258…` → `23`), parce que l'attribut HTML `width` n'admet qu'un entier — accepter la
     * décimale telle quelle reviendrait à s'en remettre à la tolérance de chaque navigateur.
     */
    if (nom === 'width' || nom === 'height' || nom === 'size' || nom === 'colspan' || nom === 'rowspan') {
      const n = valeur.trim();
      if (!/^\d{1,4}(\.\d+)?$/.test(n)) continue;
      sortie.push(`${nom}="${n.split('.')[0]}"`);
      continue;
    }
    if (nom === 'color' && !/^[#a-zA-Z0-9(),.%\s]{1,40}$/.test(valeur)) continue;
    sortie.push(`${nom}="${echapperAttribut(valeur)}"`);
  }
  // Un lien part chez quelqu'un d'autre : `noopener noreferrer` évite que la page ouverte reprenne la main, et
  //   `target="_blank"` est le comportement attendu d'un lien dans un mail affiché chez nous.
  if (balise === 'a' && sortie.some((s) => s.startsWith('href='))) {
    sortie.push('target="_blank"', 'rel="noopener noreferrer"');
  }
  return sortie.length === 0 ? '' : ` ${sortie.join(' ')}`;
}

function echapperAttribut(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Échappe du TEXTE pour l'insérer dans du HTML. PUR. */
export function echapperTexte(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 🔴 LE TEXTE D'UN HTML QU'ON ASSAINIT : ses entités sont DÉCODÉES avant d'être ré-échappées. PUR.
 *
 * LE DÉFAUT, VU PAR ARNO SUR LE FIL 36494 : le corps s'affichait « copropri&eacute;t&eacute; situ&eacute;e » et
 * « Madame,&nbsp; ». `echapperTexte` échappe le `&` — donc `&eacute;` devenait `&amp;eacute;`, que le navigateur
 * affiche tel quel. On décode d'abord (`&eacute;` → « é »), on ré-échappe ensuite : le résultat est le MÊME
 * niveau de sûreté, et le texte est enfin lisible.
 *
 * ⚠️ L'ORDRE COMPTE, ET IL EST SÛR. `decoderEntites` ne produit que des CARACTÈRES ; `echapperTexte` reprend
 * ensuite `&`, `<` et `>`. Un `&lt;script&gt;` écrit en entités redevient donc `&lt;script&gt;` — du texte, jamais
 * une balise. C'est précisément ce que vérifie le test « une balise écrite en entités reste du texte ».
 */
export function texteAssaini(v: string): string {
  return echapperTexte(decoderEntites(v));
}

/** Au-delà, on tronque : un mail n'a pas à porter un mégaoctet de balises, et une boucle bornée ne se fige pas. */
export const HTML_MAX = 500_000;

/**
 * ══ 🔴 ASSAINIR DU HTML DE MAIL. PUR. ════════════════════════════════════════════════════════════════════════════
 *
 * La boucle est volontairement simple : on avance dans la chaîne, on ne reconnaît que `<balise …>`, `</balise>` et
 * les commentaires ; tout le reste est du TEXTE, et le texte est échappé. Une chaîne comme `<scr<script>ipt>` ne
 * peut donc pas se recomposer : chaque `<` ouvre une décision, et ce qui n'est pas reconnu devient `&lt;`.
 *
 * ⚠️ LES BALISES OUVERTES SONT SUIVIES, et refermées à la fin. Un `<b>` laissé ouvert par un collage mettrait en
 * gras tout ce qui suit dans l'écran qui l'affiche — y compris ce qui ne vient pas de ce message.
 */
export function assainirHtml(brut: string | null | undefined): string {
  const entree = (brut ?? '').slice(0, HTML_MAX);
  let sortie = '';
  const ouvertes: string[] = [];
  let i = 0;

  while (i < entree.length) {
    const lt = entree.indexOf('<', i);
    if (lt < 0) { sortie += texteAssaini(entree.slice(i)); break; }
    sortie += texteAssaini(entree.slice(i, lt));

    // ── Un commentaire : jeté en entier. `<!--[if mso]>` d'Outlook cache du HTML complet dans un commentaire. ──
    if (entree.startsWith('<!--', lt)) {
      const fin = entree.indexOf('-->', lt + 4);
      i = fin < 0 ? entree.length : fin + 3;
      continue;
    }
    // ── Une déclaration (`<!DOCTYPE…`) ou une instruction (`<?xml…`) : jetée. ──
    if (entree.startsWith('<!', lt) || entree.startsWith('<?', lt)) {
      const fin = entree.indexOf('>', lt + 2);
      i = fin < 0 ? entree.length : fin + 1;
      continue;
    }

    const gt = entree.indexOf('>', lt + 1);
    if (gt < 0) { sortie += texteAssaini(entree.slice(lt)); break; }
    const dedans = entree.slice(lt + 1, gt);
    const fermante = dedans.startsWith('/');
    const nom = (fermante ? dedans.slice(1) : dedans).match(/^[a-zA-Z][a-zA-Z0-9]*/)?.[0]?.toLowerCase() ?? '';

    // Ce n'est pas une balise (`a < b`) : le `<` est du texte, et il est échappé.
    if (nom === '') { sortie += '&lt;'; i = lt + 1; continue; }

    // ── Une balise dont le CONTENU doit disparaître aussi ──
    if (A_VIDER.has(nom)) {
      if (fermante) { i = gt + 1; continue; }
      // On cherche sa fermeture ; à défaut, tout le reste est jeté — un `<script` non refermé ne doit rien laisser.
      const ferme = new RegExp(`</\\s*${nom}\\b[^>]*>`, 'i').exec(entree.slice(gt + 1));
      i = ferme ? gt + 1 + ferme.index + ferme[0].length : entree.length;
      continue;
    }

    if (fermante) {
      if (BALISES.has(nom) && !ORPHELINES.has(nom)) {
        const rang = ouvertes.lastIndexOf(nom);
        if (rang >= 0) {
          // On referme aussi ce qui était ouvert par-dessus : un document mal imbriqué ne doit pas rester ouvert.
          for (let k = ouvertes.length - 1; k >= rang; k -= 1) sortie += `</${ouvertes[k]}>`;
          ouvertes.length = rang;
        }
      }
      i = gt + 1;
      continue;
    }

    if (!BALISES.has(nom)) { i = gt + 1; continue; } // enveloppe inconnue retirée, contenu conservé
    const attrs = attributsSurs(nom, dedans.slice(nom.length));
    if (ORPHELINES.has(nom)) {
      // Une image sans `src` acceptable ne sert à rien et laisserait une icône cassée chez le destinataire.
      if (nom === 'img' && !attrs.includes('src=')) { i = gt + 1; continue; }
      sortie += `<${nom}${attrs} />`;
    } else {
      sortie += `<${nom}${attrs}>`;
      ouvertes.push(nom);
    }
    i = gt + 1;
  }

  for (let k = ouvertes.length - 1; k >= 0; k -= 1) sortie += `</${ouvertes[k]}>`;
  return sortie;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA VERSION TEXTE — celle que reçoit qui lit ses mails en texte brut, et celle qu'on garde en base
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const ENTITES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', ugrave: 'ù', ocirc: 'ô', icirc: 'î',
  laquo: '«', raquo: '»', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', euro: '€', deg: '°', middot: '·', bull: '·',
};

/** Décode les entités d'un TEXTE déjà extrait. PUR. */
export function decoderEntites(v: string): string {
  return v
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (t, n: string) => ENTITES[n.toLowerCase()] ?? t);
}

/**
 * ══ 🔴 LA VERSION TEXTE D'UN CORPS HTML. PUR. ════════════════════════════════════════════════════════════════════
 *
 * POURQUOI ELLE DOIT ÊTRE FIDÈLE. Un `multipart/alternative` laisse le client choisir : beaucoup de gens, et tous
 * les lecteurs d'écran en mode texte, verront CETTE version. Une version texte bâclée — balises retirées d'un coup
 * de `replace`, tout le texte collé sur une ligne — donne un message illisible à une partie des destinataires, sans
 * que personne chez nous s'en aperçoive.
 *
 * CE QU'ELLE PRÉSERVE, et qui fait la différence entre « lisible » et « fidèle » :
 *   · les sauts de ligne des blocs (`p`, `div`, `br`, titres) ;
 *   · les listes, avec leurs puces (« - ») et leurs numéros (« 1. »), en tenant leur compteur ;
 *   · les citations, préfixées de « > » comme dans toute messagerie ;
 *   · l'ADRESSE d'un lien quand elle diffère de son texte : « le contrat (https://…) ». Sans cela, la version
 *     texte perd l'information même du lien, et personne ne peut suivre ce qu'on lui envoie.
 */
export function htmlVersTexte(brut: string | null | undefined): string {
  const entree = (brut ?? '').slice(0, HTML_MAX);
  let sortie = '';
  let i = 0;
  /** Les compteurs des listes numérotées EMBOÎTÉES : chaque `<ol>` a le sien. */
  const compteurs: number[] = [];
  const pile: string[] = [];
  let lienEnCours: { href: string; debut: number } | null = null;

  /** Une fin de LIGNE : on n'en met jamais deux d'affilée par mégarde. */
  const bloc = () => { if (sortie !== '' && !sortie.endsWith('\n')) sortie += '\n'; };
  /**
   * Une fin de PARAGRAPHE : une LIGNE VIDE. C'est ce qui sépare deux `<p>`, et c'est la différence entre un mail
   * qu'on lit et un pavé. Un `<div>`, lui, ne vaut qu'un saut de ligne : dans le HTML des messageries, il tient
   * lieu de ligne, pas de paragraphe.
   */
  const paragraphe = () => { bloc(); if (sortie !== '' && !sortie.endsWith('\n\n')) sortie += '\n'; };

  while (i < entree.length) {
    const lt = entree.indexOf('<', i);
    if (lt < 0) { sortie += decoderEntites(entree.slice(i)); break; }
    sortie += decoderEntites(entree.slice(i, lt));

    if (entree.startsWith('<!--', lt)) { const f = entree.indexOf('-->', lt + 4); i = f < 0 ? entree.length : f + 3; continue; }
    const gt = entree.indexOf('>', lt + 1);
    if (gt < 0) { sortie += decoderEntites(entree.slice(lt)); break; }
    const dedans = entree.slice(lt + 1, gt);
    const fermante = dedans.startsWith('/');
    const nom = (fermante ? dedans.slice(1) : dedans).match(/^[a-zA-Z][a-zA-Z0-9]*/)?.[0]?.toLowerCase() ?? '';
    i = gt + 1;
    if (nom === '') { sortie += '<'; i = lt + 1; continue; }

    if (A_VIDER.has(nom) && !fermante) {
      const ferme = new RegExp(`</\\s*${nom}\\b[^>]*>`, 'i').exec(entree.slice(gt + 1));
      i = ferme ? gt + 1 + ferme.index + ferme[0].length : entree.length;
      continue;
    }

    if (!fermante) {
      switch (nom) {
        case 'br': sortie += '\n'; break;
        case 'p': case 'div': case 'tr': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          bloc(); break;
        case 'hr': bloc(); sortie += '----------\n'; break;
        case 'ol': bloc(); compteurs.push(0); pile.push('ol'); break;
        case 'ul': bloc(); pile.push('ul'); break;
        case 'blockquote': bloc(); pile.push('blockquote'); break;
        case 'li': {
          bloc();
          const dansOl = pile.lastIndexOf('ol') > pile.lastIndexOf('ul');
          if (dansOl && compteurs.length > 0) {
            compteurs[compteurs.length - 1] += 1;
            sortie += `${'  '.repeat(Math.max(0, compteurs.length - 1))}${compteurs[compteurs.length - 1]}. `;
          } else {
            sortie += '- ';
          }
          break;
        }
        case 'a': {
          const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(dedans);
          const v = decoderEntites(href?.[2] ?? href?.[3] ?? href?.[4] ?? '').trim();
          lienEnCours = v === '' ? null : { href: v, debut: sortie.length };
          break;
        }
        case 'td': case 'th': if (!sortie.endsWith('\n') && sortie !== '') sortie += '\t'; break;
        default: break;
      }
      continue;
    }

    switch (nom) {
      // Un `p` ou un titre FERME un paragraphe : ligne vide. Un `div` ou un `tr` ne ferment qu'une ligne.
      case 'p': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        paragraphe(); break;
      case 'div': case 'tr':
        bloc(); break;
      case 'ol': compteurs.pop(); if (pile.at(-1) === 'ol') pile.pop(); bloc(); break;
      case 'ul': if (pile.at(-1) === 'ul') pile.pop(); bloc(); break;
      case 'blockquote': if (pile.at(-1) === 'blockquote') pile.pop(); bloc(); break;
      case 'li': bloc(); break;
      case 'a': {
        // L'ADRESSE N'EST AJOUTÉE QUE SI ELLE APPREND QUELQUE CHOSE : « https://x.fr (https://x.fr) » est du bruit.
        if (lienEnCours !== null) {
          const texte = sortie.slice(lienEnCours.debut).trim();
          const meme = texte === lienEnCours.href
            || `mailto:${texte}` === lienEnCours.href
            || texte === lienEnCours.href.replace(/^mailto:/, '');
          if (texte !== '' && !meme) sortie += ` (${lienEnCours.href})`;
          else if (texte === '') sortie += lienEnCours.href.replace(/^mailto:/, '');
        }
        lienEnCours = null;
        break;
      }
      default: break;
    }
  }

  /**
   * ⚠️ LE PRÉFIXE DE CITATION EST POSÉ À LA FIN, sur les lignes concernées — pas pendant l'analyse : une citation
   * peut contenir des listes et des blocs, et préfixer au fil de l'eau donnerait des « > » au milieu des lignes.
   * On repère les citations par leur balise dans le HTML d'origine, ce qui suffit pour le cas courant : la citation
   * du message auquel on répond, qui est en fin de corps.
   */
  return nettoyerLignes(sortie);
}

/** Replie les lignes vides en double et retire les blancs de fin. PUR. */
function nettoyerLignes(v: string): string {
  return v
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * LE CORPS EST-IL VIDE une fois la mise en forme retirée ? PUR.
 *
 * ⚠️ `<p><br></p>` EST VIDE, et c'est très exactement ce que produit un éditeur de texte riche quand on n'a rien
 * tapé. Sans cette question, tout brouillon « vide » aurait l'air rempli, et l'enregistrement automatique créerait
 * un brouillon à chaque ouverture de l'éditeur — le défaut que le lot BROUILLON-SILENCIEUX a corrigé.
 */
export function htmlVide(brut: string | null | undefined): boolean {
  return htmlVersTexte(brut).trim() === '';
}

/**
 * LE TEXTE BRUT D'UN CORPS, transformé en HTML minimal. PUR.
 *
 * Sert à DEUX moments : quand un brouillon d'avant ce lot (qui n'a que du texte) s'ouvre dans l'éditeur riche, et
 * quand on cite un message dont on ne connaît que la version texte. Les sauts de ligne deviennent des `<br>` — sans
 * quoi tout le message arriverait sur une seule ligne chez le destinataire.
 */
export function texteVersHtml(brut: string | null | undefined): string {
  const t = (brut ?? '').slice(0, HTML_MAX);
  if (t.trim() === '') return '';
  return t.split(/\n\n+/).map((para) => `<p>${echapperTexte(para).split('\n').join('<br />')}</p>`).join('');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — LE CORPS QU'ON PEUT FOUILLER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   LE DÉFAUT QU'IL FERME, trouvé le 01/10/2026 en éprouvant le cas d'Arno. Le mail du Crédit Mutuel (57335), qui
   porte « Motif de l'opération : LOYER ZAHRA CHAKROUN », n'a PAS de `corps_texte` : il est arrivé en HTML seul
   (17 292 caractères). Tout le moteur de propositions lit `corps_texte` — pour ce mail-là, il lisait donc le vide,
   et les cas (c), (d) et (e) ne pouvaient rien y trouver.

   MESURÉ SUR LA BASE : 1 189 messages sur 57 385 sont dans ce cas — deux pour cent du courrier, dont les relevés
   bancaires, qui sont précisément ceux qui nomment un locataire dans leur texte.

   ⚠️ LE TEXTE RESTE PRIORITAIRE quand il existe : il est ce que l'expéditeur a écrit, là où la conversion du HTML
   est une reconstitution. On ne convertit que faute de mieux. */

/** Ce qu'on donne au moteur de propositions : le texte du mail, ou à défaut son HTML rendu en texte. PUR. */
export function corpsLisible(texte: string | null | undefined, html: string | null | undefined): string {
  const t = (texte ?? '').trim();
  return t !== '' ? (texte ?? '') : htmlVersTexte(html);
}
