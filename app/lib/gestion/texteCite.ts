import { ligneEstAdresseAgence } from './adressesAgence';

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — CE QUI, DANS UN MAIL, A VRAIMENT ÉTÉ ÉCRIT PAR SON AUTEUR. PUR. ════
 *
 * ═══ LA QUESTION, ET POURQUOI ELLE DÉCIDE D'UN CLASSEMENT ═══════════════════════════════════════════════════════
 *
 * La règle (d) du moteur de propositions est le dernier filet : « aucune adresse connue — alors cherchons si le
 * TEXTE cite l'adresse ou le n° de lot d'un bien ». Elle sauve les mails d'un syndic ou d'un artisan, qui citent
 * le logement en toutes lettres sans qu'aucune de leurs adresses ne soit à l'annuaire.
 *
 * 🔴 ENCORE FAUT-IL QUE LE TEXTE SOIT CELUI DE L'AUTEUR. Un mail de réponse traîne derrière lui tout l'échange
 * précédent, signatures comprises. Le 01/10/2026, sur le mail 57306, c'est NOTRE PROPRE SIGNATURE citée en dessous
 * (« Service Gestion, 2 rue Mars et Roty, 92800 Puteaux ») qui faisait proposer le lot 494 à Mme THAI — 2 226
 * propositions dans la base pour cette seule raison. Le mail ne parlait pas du local de Puteaux : il en portait
 * l'écho.
 *
 * ═══ 🔴 CE QUE CE MODULE RETIRE, DANS CET ORDRE ═════════════════════════════════════════════════════════════════
 *   ① les conteneurs HTML de citation (`blockquote`, `gmail_quote`) — quand le corps est du HTML ;
 *   ② tout ce qui suit l'ANNONCE d'une citation (« Le … a écrit : », « On … wrote: », « Message d'origine ») ;
 *   ③ les lignes préfixées de « > », la marque de citation du texte brut ;
 *   ④ les adresses internet — une adresse postale glissée dans un lien (le plan Google de notre signature) n'est
 *      pas une phrase que quelqu'un a écrite ;
 *   ⑤ les lignes qui ne sont QUE l'adresse postale de l'agence (voir `adressesAgence`).
 *
 * ⚠️ CE QU'ON PERD, ET POURQUOI ON L'ACCEPTE. Celui qui répond SOUS la citation (« bottom-posting ») voit son
 * texte retiré avec elle. On y perd au pire une proposition de la règle (d), la plus faible des quatre — un clic.
 * Garder la citation coûtait l'inverse : des propositions FAUSSES, qui, elles, se posent toutes seules et finissent
 * dans l'historique d'un client. Entre une proposition manquante et une proposition fausse, Arno a tranché depuis
 * le premier jour.
 *
 * ⚠️ RIEN N'EST RETIRÉ DE L'OBJET NI DES NOMS DE PIÈCES : un objet n'est jamais une citation, et le nom d'un
 * fichier non plus.
 */

/**
 * LES ANNONCES DE CITATION, dans les formes que produisent Gmail, Outlook et Thunderbird, en français comme en
 * anglais. Ce qui suit la PREMIÈRE d'entre elles n'est plus le texte de l'auteur.
 *
 * ⚠️ « Le … a écrit : » SE COUPE SUR PLUSIEURS LIGNES dans les mails réels (mesuré sur le mail 57306 : « a » finit
 * une ligne et « écrit : » commence la suivante). Les motifs acceptent donc les sauts de ligne au milieu.
 */
const ANNONCES_DE_CITATION: readonly RegExp[] = [
  /(?:^|\n)[^\n]{0,20}\b(?:le|on)\b[\s\S]{0,200}?\b(?:a\s+[ée]crit|wrote)\s*:/i,
  /(?:^|\n)\s*-{2,}\s*(?:message\s+d['’]origine|original\s+message)\s*-{2,}/i,
  /(?:^|\n)\s*-{2,}\s*(?:message\s+transf[ée]r[ée]|forwarded\s+message)\s*-{2,}/i,
  /(?:^|\n)\s*_{10,}\s*\n\s*de\s*:/i,
];

/** Les conteneurs HTML qu'un client de messagerie emploie pour la citation. */
const BLOCS_HTML: readonly RegExp[] = [
  /<blockquote[\s\S]*$/i,
  /<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i,
  /<div[^>]*id="[^"]*(?:divRplyFwdMsg|appendonsend)[^"]*"[\s\S]*$/i,
];

/** Une adresse internet, sous les formes qu'on rencontre dans un corps de mail. */
const LIENS = /(?:https?:\/\/|www\.)\S+/gi;

/**
 * TOUT CE QUI SUIT LA PREMIÈRE ANNONCE DE CITATION EST RETIRÉ. PUR.
 *
 * ⚠️ LA PREMIÈRE, ET NON LA DERNIÈRE : un fil répondu cinq fois en contient cinq, emboîtées. La première marque le
 * début de l'écho ; tout ce qui vient après appartient à quelqu'un d'autre, ou à nous-mêmes la semaine dernière.
 */
export function retirerBlocsCites(texte: string | null | undefined): string {
  let t = texte ?? '';
  for (const bloc of BLOCS_HTML) t = t.replace(bloc, ' ');
  let coupe = -1;
  for (const annonce of ANNONCES_DE_CITATION) {
    const trouve = annonce.exec(t);
    if (trouve !== null && (coupe < 0 || trouve.index < coupe)) coupe = trouve.index;
  }
  if (coupe >= 0) t = t.slice(0, coupe);
  // ③ Les lignes citées « à la Gmail ». Elles survivent parfois à la coupe (citation sans annonce).
  return t.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n');
}

/** ⑤ LES LIGNES DE SIGNATURE DE L'AGENCE — celles qui ne portent que son adresse postale. PUR. */
export function retirerSignatureAgence(texte: string | null | undefined): string {
  return (texte ?? '').split('\n').filter((l) => !ligneEstAdresseAgence(l)).join('\n');
}

/**
 * 🔴 LE TEXTE SUR LEQUEL UNE PROPOSITION PEUT SE FONDER. PUR.
 *
 * C'est la seule fonction que les appelants emploient : les quatre autres sont ses étapes, exportées pour qu'on
 * puisse les éprouver une par une.
 */
export function texteNonCite(texte: string | null | undefined): string {
  return retirerSignatureAgence(retirerBlocsCites(texte).replace(LIENS, ' '));
}
