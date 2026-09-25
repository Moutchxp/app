/**
 * MODULE « GESTION » — LOT ANNUAIRE-1 : LIRE WIPPIMMO SANS SE TROMPER. Module PUR (aucune base, aucun réseau,
 * aucune I/O) et CLIENT-SAFE : l'écran s'en sert pour comprendre ce qu'on tape, l'import pour écrire.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UNE SEULE FORME CANONIQUE PAR GRANDEUR, DÉCIDÉE ICI ET NULLE PART AILLEURS. Le même nom s'écrit
 * « JULLIEN - GARRIDO Cédric » dans un export et « Jullien-Garrido » dans un autre ; le même numéro
 * « 06 32 79 39 24 », « 06.32.79.39.24 » ou « +33632793924 » ; le même e-mail avec une majuscule. Si chaque appelant
 * normalisait à sa façon, l'import créerait des doublons ET la recherche ne les retrouverait pas — deux défauts qui
 * se cachent l'un l'autre. La forme canonique est donc écrite UNE fois, ici, et stockée telle quelle en base.
 *
 * 🔴 CE QUI EST MESURÉ SUR LES VRAIS EXPORTS (25/09/2026), et qui explique chaque règle :
 *   · une cellule peut porter PLUSIEURS valeurs : « a@x;b@y » (45 bailleurs, 134 locataires), « 06.. ; 06.. »,
 *     « 06.. / 06.. » — et parfois DEUX FOIS LA MÊME (« 0667698249 ; 0667698249 ») ;
 *   · les dates sont toutes en JJ/MM/AAAA (365/365 mesuré) ;
 *   · la colonne « Télécoms » des bailleurs est VIDE sur les 307 lignes, « Fin gest. » sur les 365 lots. On les lit
 *     quand même : le jour où elles se remplissent, rien n'est à changer.
 *
 * ⚠️ ON NE JETTE JAMAIS CE QU'ON N'A PAS SU LIRE. Un numéro qui ne se normalise pas garde sa forme brute et reste
 * affiché : c'est peut-être un numéro étranger, une extension, ou une note. Le perdre serait pire que l'afficher mal.
 *
 * 🔴 POURQUOI PAS `libphonenumber-js`, POURTANT DÉJÀ DÉPENDANCE DU PROJET. Mesuré le 25/09/2026 : sous `tsx` (le
 * lanceur de TOUTES les commandes `app/scripts/*.ts`, donc de l'import), ses métadonnées JSON se résolvent en un
 * module de forme `{ default }` et la bibliothèque meurt sur « `metadata` argument was passed but it's not a valid
 * metadata ». Elle fonctionne sous webpack et sous vitest — c'est précisément ce qui rend le piège coûteux : les
 * tests seraient VERTS et l'import réel tomberait sur la première ligne. On ne fait pas reposer la normalisation
 * des coordonnées de 800 personnes sur une dépendance qui se comporte différemment selon le lanceur.
 * (`app/lib/internaute/formatTelephone.ts` continue de l'employer : il ne vit, lui, que dans le navigateur.)
 *
 * Le plan de numérotation français tient en quatre lignes, et il est ici EN TOUTES LETTRES.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'indicatif de la France. Tous les biens gérés y sont ; un numéro écrit sans indicatif est donc français. */
export const INDICATIF_FR = '33';

/**
 * LA FORME NORMALISÉE D'UN TEXTE : minuscules, sans accent, sans ponctuation, espaces réduits à un seul.
 *
 * C'est elle qu'on stocke dans les colonnes `*_normalise` et qu'on interroge. Elle est volontairement BRUTALE —
 * « JULLIEN - GARRIDO » et « jullien garrido » doivent tomber sur la même chaîne, sinon chercher « garrido » ne
 * trouve rien. La ponctuation devient une espace (jamais rien) : « Jullien-Garrido » fait DEUX mots, pas un.
 */
export function normaliserTexte(brut: string | null | undefined): string {
  return (brut ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // les accents, retirés après décomposition
    .replace(/[’']/g, ' ')             // « d'Ersu » → « d ersu » : l'apostrophe sépare, elle ne colle pas
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * LES SÉPARATEURS D'UNE CELLULE MULTIPLE, mesurés dans les exports : point-virgule, virgule, barre oblique, et le
 * mot « et » entouré d'espaces.
 *
 * ⚠️ LA VIRGULE EST AMBIGUË et c'est assumé : elle sépare deux e-mails, mais elle vit aussi dans une adresse
 * postale. On ne découpe donc JAMAIS une adresse — seulement les cellules de contacts, où l'appelant le demande.
 */
const SEPARATEURS = /\s*(?:;|\/|,|\bet\b)\s*/i;

/** Découpe une cellule en valeurs. Vide → tableau vide. Les doublons EXACTS sont conservés ici : c'est la
 *  normalisation, plus bas, qui décide que deux écritures désignent la même chose. PUR. */
export function decouperCellule(brut: string | null | undefined): string[] {
  const s = (brut ?? '').trim();
  if (s === '') return [];
  return s.split(SEPARATEURS).map((x) => x.trim()).filter((x) => x !== '');
}

/**
 * UN TÉLÉPHONE EN E.164 (`+33632793924`), ou `null` si ce n'en est pas un.
 *
 * LES QUATRE ÉCRITURES RENCONTRÉES, et elles tombent toutes sur la même chaîne — c'est exactement ce qu'il faut
 * pour qu'un numéro tapé dans le champ de recherche retrouve celui qui a été importé :
 *   · national  « 06 32 79 39 24 », « 06.32.79.39.24 », « 0632793924 »  → `+33632793924`
 *   · sans le 0 « 632793924 »                                          → `+33632793924`
 *   · international « +33 6 32 79 39 24 »                              → `+33632793924`
 *   · international à la française « 0033632793924 »                   → `+33632793924`
 *
 * ⚠️ UN NUMÉRO ÉTRANGER EST ACCEPTÉ TEL QUEL s'il porte son indicatif (8 à 15 chiffres, la borne de la norme
 * E.164). On ne prétend PAS vérifier le plan de numérotation de 200 pays : on range, on ne juge pas. Ce qui est
 * vérifié, et sévèrement, c'est le français — parce que c'est celui qu'on cherchera.
 */
export function normaliserTelephone(brut: string | null | undefined): string | null {
  const s = (brut ?? '').trim();
  if (s === '') return null;
  // Tout ce qui sépare à l'œil (espaces, points, tirets, parenthèses, espace insécable) ne sépare rien pour nous.
  // ⚠️ La barre oblique n'est PAS retirée : elle SÉPARE deux numéros (« 06.. / 06.. », mesuré). La retirer ici
  //   collerait deux numéros en un seul, illisible, et ferait disparaître les deux.
  const compact = s.replace(/[\s.\-() ]/g, '');
  // « 0033… » est la forme internationale écrite à la française ; c'est un « + » déguisé.
  const avecPlus = compact.replace(/^00(?=\d)/, '+');

  if (avecPlus.startsWith('+')) {
    const chiffres = avecPlus.slice(1);
    if (!/^\d{8,15}$/.test(chiffres)) return null;
    if (chiffres.startsWith(INDICATIF_FR)) {
      const national = chiffres.slice(INDICATIF_FR.length);
      // 9 chiffres après l'indicatif, et JAMAIS un 0 en tête : « +330632793924 » est une faute de saisie courante,
      //   qu'on rattrape plutôt que de la refuser (le 0 national n'a pas sa place après un indicatif).
      const sansZero = national.replace(/^0+/, '');
      return /^[1-9]\d{8}$/.test(sansZero) ? `+${INDICATIF_FR}${sansZero}` : null;
    }
    return `+${chiffres}`;
  }

  if (!/^\d+$/.test(avecPlus)) return null;
  // National : 10 chiffres commençant par 0, le second n'étant pas 0 (il n'existe pas de numéro « 00… »).
  if (/^0[1-9]\d{8}$/.test(avecPlus)) return `+${INDICATIF_FR}${avecPlus.slice(1)}`;
  // Le même, saisi sans son 0 de tête — fréquent dans les fichiers repris d'un tableur qui a mangé le zéro.
  if (/^[1-9]\d{8}$/.test(avecPlus)) return `+${INDICATIF_FR}${avecPlus}`;
  return null;
}

/** Un e-mail en minuscules, ou `null` si ce n'en est pas un. Volontairement permissif sur la forme : on refuse ce
 *  qui n'a manifestement pas d'arobase ou pas de point après, jamais ce qui est seulement inhabituel. PUR. */
export function normaliserEmail(brut: string | null | undefined): string | null {
  const s = (brut ?? '').trim().toLowerCase();
  if (s === '') return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

/** Une date JJ/MM/AAAA → `AAAA-MM-JJ`, ou `null`. Rejette le 31/02 : une date impossible lue comme une autre
 *  fausserait une ancienneté de relation commerciale. PUR. */
export function lireDateFr(brut: string | null | undefined): string | null {
  const s = (brut ?? '').trim();
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (!m) return null;
  const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || j < 1 || j > 31) return null;
  const d = new Date(Date.UTC(a, mo - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return null;
  return `${String(a).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/** Un contact normalisé, prêt à écrire. `valeurBrute` est ce qui était dans la cellule : c'est elle qu'on AFFICHE,
 *  parce qu'un numéro reformaté n'est plus reconnu par celui qui l'a saisi. */
export interface ContactAnnuaire {
  sorte: 'telephone' | 'email';
  /** Forme canonique : E.164, ou minuscules. */
  valeur: string;
  valeurBrute: string;
  /** L'ordre dans la cellule. Le rang 0 est le principal. */
  rang: number;
}

/**
 * LES CONTACTS D'UNE OU PLUSIEURS CELLULES, découpés, normalisés, dédoublonnés, dans l'ordre de saisie.
 *
 * 🔴 CE QUI NE SE NORMALISE PAS N'EST PAS JETÉ : un numéro que `libphonenumber-js` refuse est conservé avec, pour
 * valeur canonique, sa forme sans séparateur. Il ne sera pas trouvé par une recherche en +33, mais il sera AFFICHÉ —
 * et quelqu'un pourra le corriger dans WIPPIMMO. Le silence, lui, ne se corrige pas.
 */
export function contactsDeCellules(
  cellules: { sorte: 'telephone' | 'email'; texte: string | null | undefined }[],
): ContactAnnuaire[] {
  const out: ContactAnnuaire[] = [];
  const vus = new Set<string>();
  for (const { sorte, texte } of cellules) {
    for (const brut of decouperCellule(texte)) {
      const valeur = sorte === 'email'
        ? normaliserEmail(brut)
        : normaliserTelephone(brut) ?? repliTelephone(brut);
      if (valeur === null) continue;
      const cle = `${sorte}:${valeur}`;
      if (vus.has(cle)) continue;          // « 0667698249 ; 0667698249 » ne fait qu'une ligne
      vus.add(cle);
      out.push({ sorte, valeur, valeurBrute: brut, rang: out.filter((c) => c.sorte === sorte).length });
    }
  }
  return out;
}

/** Repli d'un téléphone illisible : les seuls chiffres (avec un « + » de tête s'il y était). `null` si aucun
 *  chiffre — ce n'était alors pas un numéro du tout, mais une note. PUR. */
function repliTelephone(brut: string): string | null {
  const plus = brut.trim().startsWith('+') ? '+' : '';
  const chiffres = brut.replace(/\D/g, '');
  return chiffres.length >= 6 ? plus + chiffres : null;
}

/** « NOM Prénom », la forme que `Lots.Propriétaire` écrit et que l'écran affiche. PUR. */
export function nomComplet(nom: string, prenom: string | null | undefined): string {
  return [nom.trim(), (prenom ?? '').trim()].filter((x) => x !== '').join(' ');
}

/**
 * LA CLÉ DE RAPPROCHEMENT D'UN PROPRIÉTAIRE. Mesuré sur les vrais exports : `Lots.Propriétaire` normalisé est égal
 * à `Nom prop. + ' ' + Prénom prop.` normalisé pour les 270 propriétaires cités — c'est donc une ÉGALITÉ, pas un
 * rapprochement approché, et on n'introduit surtout pas de score ici : un score trouverait des couples là où il n'y
 * en a pas.
 */
export function cleProprietaire(nom: string, prenom: string | null | undefined): string {
  return normaliserTexte(nomComplet(nom, prenom));
}

/**
 * LA CLÉ DE PERSONNE D'UN LOCATAIRE — ce qui décide que deux baux appartiennent au MÊME locataire.
 *
 * 🔴 NOM NORMALISÉ **ET** UN CONTACT CERTAIN, jamais le nom seul. Mesuré : 23 noms portés par plusieurs lignes,
 * dont 22 avec le même e-mail — une personne, plusieurs baux. Le 23ᵉ n'a pas le même e-mail : il reste DEUX
 * personnes, et c'est voulu. Fusionner sur le seul nom mettrait les coordonnées d'un inconnu sur le bail d'un autre.
 *
 * Sans aucun contact, la clé retombe sur l'identifiant WIPPIMMO de la ligne : cette personne-là ne se regroupe avec
 * personne, ce qui est la bonne réponse quand on ne sait pas.
 */
export function clePersonne(nomNormalise: string, contacts: readonly ContactAnnuaire[], wippimmoId: string): string {
  const email = contacts.find((c) => c.sorte === 'email');
  const tel = contacts.find((c) => c.sorte === 'telephone');
  const ancre = email?.valeur ?? tel?.valeur ?? null;
  return ancre === null ? `${nomNormalise}#id:${wippimmoId}` : `${nomNormalise}#${ancre}`;
}

/** La plus ancienne des dates fournies (format ISO), ou `null`. Sert à DÉRIVER la date de début de relation
 *  commerciale d'un propriétaire à partir des « Déb gest. » de ses lots. PUR. */
export function plusAncienne(dates: readonly (string | null)[]): string | null {
  const vues = dates.filter((d): d is string => d !== null).sort();
  return vues[0] ?? null;
}
