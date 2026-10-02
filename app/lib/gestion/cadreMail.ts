/**
 * ══ 🔴🔴 LOT CADRE-ISOLE-MAILS — LE DOCUMENT D'UN MAIL REÇU, DANS SON PROPRE CADRE. MODULE PUR. ═══════════════
 *
 * DÉCISION D'ARNO (03/10/2026, option « a ») : afficher le corps des mails REÇUS dans un cadre isolé, pour garder
 * leurs `<style>` d'en-tête — 34 366 mails stockés en portent qui changent vraiment le rendu — et approcher
 * l'affichage de Gmail, sans aucun risque pour l'application.
 *
 * ═══ 🔒 POURQUOI CE CADRE EST SÛR, ET POURQUOI `allow-same-origin` N'Y CHANGE RIEN ════════════════════════════
 *
 * Le bac à sable retient `allow-same-origin` MAIS JAMAIS `allow-scripts`, et le document porte en plus une CSP
 * `script-src 'none'`. Mesuré dans Chrome le 03/10/2026, sur un cadre monté pour l'épreuve :
 *
 *     ① le `<script>` du mail n'a PAS tourné (témoin du parent intact, titre du cadre vide) ;
 *     ② son `onclick` n'a pas tourné non plus ;
 *     ③ son `<style>` s'applique DANS le cadre et ne touche PAS l'application ;
 *     ④ son `meta refresh` vers le dehors est bloqué (pas d'`allow-top-navigation`) ;
 *     ⑤ son formulaire est inerte (pas d'`allow-forms`, et `form-action 'none'`) ;
 *     ⑥ l'application, elle, PEUT mesurer le cadre et y brancher un clic.
 *
 * 🔴🔴 LE DANGER DE `allow-same-origin` N'EXISTE QUE COMBINÉ À `allow-scripts` : c'est cette PAIRE qui permet à un
 * cadre de retirer son propre bac à sable. Sans script — et il ne peut pas y en avoir — `allow-same-origin`
 * n'accorde un accès QUE DE L'APPLICATION VERS LE CADRE, jamais l'inverse. C'est précisément cet accès qui rend
 * possibles la hauteur automatique et le clic pour agrandir une image, qu'Arno veut garder.
 *
 * ⚠️ UN TEST GARDE-FOU (demandé par Arno) ÉCHOUE SI QUELQU'UN AJOUTE UN JOUR `allow-scripts`. C'est la seule
 * chose qui, ajoutée ici, transformerait un cadre sûr en cadre dangereux.
 */

/**
 * 🔴🔴 LE BAC À SABLE, ÉCRIT UNE SEULE FOIS. Trois jetons, et pas un de plus.
 *
 *   · `allow-same-origin` — pour que l'APPLICATION puisse mesurer le cadre et y brancher le clic des images ;
 *   · `allow-popups` et `allow-popups-to-escape-sandbox` — pour qu'un lien s'ouvre dans un vrai nouvel onglet,
 *     hors du bac à sable (sans le second, l'onglet ouvert hériterait du sandbox et n'afficherait rien).
 *
 * 🔒 `allow-scripts` N'Y EST PAS, ET N'Y SERA JAMAIS. Voir l'encadré ci-dessus, et le test garde-fou.
 */
export const SANDBOX_CADRE = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

/** Les jetons formellement interdits. Le test garde-fou les lit ici, pour qu'il n'y ait qu'une liste. */
export const SANDBOX_INTERDITS: readonly string[] = [
  'allow-scripts', 'allow-forms', 'allow-top-navigation', 'allow-top-navigation-by-user-activation',
  'allow-modals', 'allow-downloads', 'allow-pointer-lock', 'allow-presentation', 'allow-orientation-lock',
];

/**
 * LA CSP DU DOCUMENT DU CADRE.
 *
 * 🔴 `default-src 'none'` FERME TOUT, puis on rouvre le strict nécessaire : les styles en ligne (c'est tout
 * l'objet du lot) et les images selon la politique actuelle.
 *
 * ⚠️ `img-src` REPREND EXACTEMENT LA POLITIQUE D'IMAGES D'AUJOURD'HUI, sans la changer : `data:` (image intégrée),
 * et notre propre origine, par où passent `cid:` (pièce jointe) et le relais des images distantes. Les adresses
 * distantes ne sont PAS ouvertes ici : elles le sont, comme avant, par le relais — une image qu'on ne relaie pas
 * ne doit pas pouvoir signaler l'ouverture du mail à un serveur tiers.
 */
export const CSP_CADRE = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; "
  + "img-src data: 'self'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'";

/** La borne du CSS repris d'un mail. Une feuille de mail dépasse rarement quelques kilo-octets. */
export const CSS_MAX = 120_000;

/**
 * ══ 🔴 CE QU'ON REFUSE DANS LE CSS D'UN MAIL ══════════════════════════════════════════════════════════════════
 *
 * Les mêmes interdits que le filtre de styles en ligne, et pour les mêmes raisons : `@import` va chercher une
 * feuille au dehors, `url(` externe est une balise espion qui dit quand le mail est ouvert et depuis où,
 * `expression(` exécutait du script sur les vieux moteurs, `javascript:` parle de lui-même.
 *
 * ⚠️ MESURÉ EN BASE LE 03/10/2026 : 462 mails portent un `@import` dans leur `<style>`, 2 147 un `url(`. Ils ne
 * perdent que cela — le reste de leur feuille s'applique.
 *
 * ⚠️ `url(data:…)` RESTE PERMIS : il ne va chercher RIEN au dehors, et c'est ainsi qu'une police ou une petite
 * image de fond voyage DANS le mail. La CSP l'autorise aussi (`img-src data:`).
 */
const RE_IMPORT = /@import[^;]*;?/gi;
const RE_URL_EXTERNE = /url\s*\(\s*['"]?(?!data:)[^)]*\)/gi;
const RE_DANGER = /expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding/gi;

/**
 * LE CSS D'UN MAIL, FILTRÉ. PUR.
 *
 * ⚠️ ON NE RÉÉCRIT PAS LES SÉLECTEURS, et ce n'est pas un oubli : le cadre EST la portée. C'est précisément ce
 * qu'il apporte — un `body{…}` du mail peint le corps du mail, et rien de l'application.
 *
 * ⚠️ `</style` EST NEUTRALISÉ : sans cela, un mail refermerait notre balise et écrirait du HTML derrière elle.
 * C'est la seule évasion possible d'un bloc de style, et elle est fermée ici.
 */
export function cssDuMailFiltre(css: string | null | undefined): string {
  const brut = (css ?? '').slice(0, CSS_MAX);
  if (brut.trim() === '') return '';
  return brut
    .replace(RE_IMPORT, '')
    .replace(RE_URL_EXTERNE, 'none')
    .replace(RE_DANGER, '')
    // 🔴 AUCUNE SORTIE DE LA BALISE : ni `</style>`, ni une ouverture de balise quelconque.
    .replace(/<\/?[a-zA-Z]/g, '')
    .trim();
}

/**
 * LES BLOCS `<style>` D'UN HTML BRUT, EXTRAITS ET FILTRÉS, DANS L'ORDRE. PUR.
 *
 * ⚠️ ON LIT LE HTML **BRUT**, AVANT ASSAINISSEMENT, et il le faut : `assainirHtml` vide la balise `<style>`,
 * contenu compris (c'est sa règle, et elle ne change pas). L'extraction se fait donc en amont, sur la source.
 */
export function stylesDuMail(brut: string | null | undefined): string {
  const s = brut ?? '';
  const blocs = [...s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1]);
  return blocs.map((b) => cssDuMailFiltre(b)).filter((b) => b !== '').join('\n');
}

/**
 * ══ LA FEUILLE DE BASE DU CADRE — CELLE QUI REND LE MAIL LISIBLE SANS LE DÉNATURER ════════════════════════════
 *
 * 🔴 ELLE EST POSÉE **AVANT** CELLE DU MAIL : tout ce que le mail déclare l'emporte sur elle. Elle ne fait que
 * donner un point de départ raisonnable là où le mail ne dit rien.
 *
 * 🔴 FOND BLANC IMPOSÉ, EN THÈME SOMBRE COMME EN CLAIR (demande d'Arno, et c'est ce que fait Gmail) : un mail est
 * écrit pour du papier blanc, et ses couleurs n'ont de sens que là-dessus. `color-scheme: light` empêche en plus
 * le navigateur d'inverser quoi que ce soit de son côté.
 *
 * ⚠️ `overflow-y: hidden` SUR LE DOCUMENT : la hauteur du cadre est calculée par l'application, donc il n'y a
 * JAMAIS rien à faire défiler dedans. C'est la demande d'Arno (« aucune barre de défilement interne ») et la
 * cohérence avec le lot de la molette.
 *
 * ⚠️ `overflow-x: auto` SUR LES SEULS TABLEAUX : un tableau d'e-mailing plus large que la colonne doit pouvoir se
 * faire défiler latéralement plutôt que pousser toute la page.
 */
export const CSS_BASE_CADRE = `
  html{overflow-y:hidden}
  body{margin:0;padding:0;background:#fff;color:#1a1a1a;color-scheme:light;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    font-size:.9rem;line-height:1.5;overflow-wrap:anywhere}
  img{max-width:100%;height:auto}
  img[data-agrandir]{cursor:zoom-in}
  table{max-width:100%}
  a{overflow-wrap:anywhere}
`;

/**
 * LE DOCUMENT COMPLET DU CADRE. PUR.
 *
 * 🔴 L'ORDRE DES TROIS MORCEAUX EST LA SÛRETÉ ELLE-MÊME :
 *   ① la CSP, EN PREMIER dans le `<head>` — une méta-CSP ne vaut que pour ce qui la SUIT ;
 *   ② la feuille de base, puis celle du mail (le mail l'emporte) ;
 *   ③ le corps, DÉJÀ ASSAINI par `assainirHtml(..., 'reception')` — ce module n'assainit rien lui-même.
 *
 * ⚠️ `<base target="_blank">` FAIT OUVRIR TOUS LES LIENS DANS UN NOUVEL ONGLET, sans avoir à toucher à chaque
 * `<a>`. Les liens portent déjà `target="_blank" rel="noopener noreferrer"` depuis l'assainissement ; la base est
 * la ceinture qui va avec les bretelles, pour un lien qui n'en aurait pas.
 */
export function documentDuCadre(o: { corpsAssaini: string; cssDuMail?: string | null }): string {
  const css = (o.cssDuMail ?? '').trim();
  return '<!doctype html><html><head>'
    + `<meta http-equiv="Content-Security-Policy" content="${CSP_CADRE}">`
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<base target="_blank">'
    + `<style>${CSS_BASE_CADRE}</style>`
    + (css === '' ? '' : `<style>${css}</style>`)
    + '</head><body>'
    + o.corpsAssaini
    + '</body></html>';
}
