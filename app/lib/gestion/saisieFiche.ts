/**
 * ══ 🔴🔴 LOT FICHE-SAISIE-UNIFORME — LE FORMAT DES CHAMPS D'UNE FICHE DE PERSONNE. Module PUR. ════════════════
 *
 * ARNO (01/10/2026) : « NOM tout en MAJUSCULES, accents conservés (“JULLIEN-GARRIDO”, “D'ERSU”). PRÉNOM première
 * lettre de chaque partie en majuscule, le reste en minuscules, y compris les prénoms composés et les
 * apostrophes (“Jean-François”, “Marie-France”). VILLE tout en MAJUSCULES. CODE POSTAL 5 chiffres pour la
 * France. »
 *
 * ═══ 🔴 UNE SEULE ÉCRITURE DU FORMAT, POUR TROIS USAGES ═════════════════════════════════════════════════════
 *
 *   ① la SAISIE — ce qu'on voit se former sous ses doigts en tapant ;
 *   ② l'ENREGISTREMENT — ce qui part en base, et c'est la seule vérité durable ;
 *   ③ l'AFFICHAGE des fiches importées de WIPPIMMO, « même mise en forme À L'AFFICHAGE, tout de suite ».
 *
 * 🔴 ET SURTOUT PAS TROIS. Un format appliqué à la frappe mais pas à l'enregistrement laisse en base ce qu'on
 * croyait avoir corrigé ; appliqué à l'affichage mais pas à la saisie, il fait « sauter » le texte au
 * rechargement. Les trois lisent donc les mêmes fonctions, et c'est tout l'objet de ce fichier.
 *
 * ⚠️ AUCUNE RÉÉCRITURE DE MASSE (Arno) : l'affichage met en forme ce qu'il lit, sans rien écrire. La base n'est
 * touchée que lorsqu'une fiche est ENREGISTRÉE — c'est-à-dire quand quelqu'un a regardé ce qu'elle contient.
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LES MOTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * NOM : TOUT EN MAJUSCULES, ACCENTS CONSERVÉS.
 *
 * ⚠️ `toLocaleUpperCase('fr')` ET NON `toUpperCase()`. La version neutre convient ici, mais la locale est
 * explicite pour la même raison qu'ailleurs dans ce dépôt : elle dit dans quelle langue on lit. Les accents
 * SURVIVENT (« é » → « É ») — les retirer donnerait « JULLIEN-GARRIDO » d'un côté et « DERSU » de l'autre, et
 * c'est le nom d'une personne.
 *
 * ⚠️ LES ESPACES INTERNES SONT RÉDUITS, jamais les tirets ni les apostrophes : « D'ERSU », « JULLIEN-GARRIDO »
 * et « LE  GOFF » (double espace collé au copier-coller) doivent tous rendre ce qu'on attend. PUR.
 */
export function nomFormate(brut: string | null | undefined): string {
  return (brut ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('fr');
}

/**
 * ══ 🔴🔴 LA MÊME RÈGLE, MAIS PENDANT QU'ON TAPE — DÉFAUT TROUVÉ À L'ÉCRAN ═══════════════════════════════════
 *
 * ÉPROUVÉ SUR proprietaire-146 le 01/10/2026 : en tapant « _test jullien-garrido », le champ affichait
 * « _TESTJULLIEN-GARRIDO ». L'ESPACE ÉTAIT IMPOSSIBLE À TAPER.
 *
 * 🔴 LA CAUSE : `nomFormate` fait aussi le ménage des espaces (`trim`, doubles espaces réduits). Appliqué à
 * CHAQUE frappe, il supprime l'espace FINAL au moment même où on vient de l'appuyer — et la lettre suivante se
 * colle au mot précédent. Le défaut ne se voit pas en test unitaire : la fonction est juste, c'est le MOMENT de
 * son application qui ne l'était pas.
 *
 * 🔴 D'OÙ DEUX FONCTIONS, ET LA DIFFÉRENCE TIENT EN UN MOT : pendant la frappe on ne touche QU'À LA CASSE ; le
 * ménage des espaces attend l'enregistrement, quand la personne a fini d'écrire.
 */
export function nomEnSaisie(brut: string): string {
  return brut.toLocaleUpperCase('fr');
}

/**
 * PRÉNOM : première lettre de CHAQUE partie en majuscule, le reste en minuscules.
 *
 * 🔴 « CHAQUE PARTIE » SE DÉFINIT PAR SES SÉPARATEURS, et il y en a trois : l'espace, le trait d'union, et
 * l'apostrophe (droite ou typographique). « jean-françois » → « Jean-François », « marie france » →
 * « Marie France », « d'artagnan » → « D'Artagnan ». Une règle qui ne couperait qu'aux espaces rendrait
 * « Jean-françois », c'est-à-dire une faute visible sur chaque fiche.
 *
 * ⚠️ ON MINUSCULE D'ABORD, PUIS ON RELÈVE. Sans cela, « JEAN-FRANÇOIS » tapé en verrouillage majuscule
 * resterait tel quel : la règle doit corriger la saisie, pas seulement la compléter.
 *
 * ⚠️ VIDE AUTORISÉ — une société n'a pas de prénom, et c'est la règle actuelle (`civiliteDesigneSociete`). PUR.
 */
export function prenomFormate(brut: string | null | undefined): string {
  return capitaliserParties((brut ?? '').replace(/\s+/g, ' ').trim());
}

/** La même règle pendant la frappe : la casse seule, les espaces intacts. Voir `nomEnSaisie`. */
export function prenomEnSaisie(brut: string): string {
  return capitaliserParties(brut);
}

/** La capitalisation elle-même, sans aucun ménage d'espaces. PUR. */
function capitaliserParties(s: string): string {
  return s.toLocaleLowerCase('fr').replace(/(^|[\s\-'’])(\p{L})/gu, (_m, sep: string, lettre: string) =>
    sep + lettre.toLocaleUpperCase('fr'));
}

/** COMMUNE : tout en majuscules, accents conservés — même règle que le nom, et pour la même raison. PUR. */
export function communeFormatee(brut: string | null | undefined): string {
  return nomFormate(brut);
}

/** La commune pendant la frappe : la casse seule — « SAINT ETIENNE » doit pouvoir s'écrire. Voir `nomEnSaisie`. */
export function communeEnSaisie(brut: string): string {
  return nomEnSaisie(brut);
}

/**
 * CODE POSTAL : cinq chiffres.
 *
 * ⚠️ ON NETTOIE, ON NE REFUSE PAS. Les espaces et les tirets d'un « 92 800 » collé depuis un mail disparaissent ;
 * ce qui reste est tronqué à cinq chiffres. Refuser la frappe aurait empêché de taper le deuxième chiffre.
 */
export function codePostalFormate(brut: string | null | undefined): string {
  return (brut ?? '').replace(/\D/g, '').slice(0, 5);
}

/** Vrai pour un code postal français complet. Vide n'est PAS valide — mais c'est `manquesDeLaFiche` qui le dit. */
export function codePostalComplet(brut: string | null | undefined): boolean {
  return /^\d{5}$/.test((brut ?? '').trim());
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA CIVILITÉ — UNE LISTE, PLUS UN TEXTE LIBRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 « LISTE AU LIEU DU TEXTE LIBRE » (Arno), ET DANS SON ORDRE ═════════════════════════════════════════
 *
 * 🔴 POURQUOI UNE LISTE CHANGE QUELQUE CHOSE. La civilité pilote une règle : `civiliteDesigneSociete` décide si
 * le prénom est exigé. En texte libre, « S.C.I. », « Sci », « sci » et « SCI » sont quatre valeurs — et l'une
 * d'elles finira par ne pas être reconnue, le jour où quelqu'un tapera vite. La liste ferme ce trou.
 *
 * ⚠️ « AUTRE » GARDE LA PORTE OUVERTE, avec son petit champ libre : une liste sans échappatoire oblige à ranger
 * une succession ou un office notarial dans une case fausse, ce qui est pire qu'une case vide.
 */
export const CIVILITE_AUTRE = 'Autre';

export const CIVILITES: readonly string[] = [
  'M.', 'Mme', 'M. et Mme', 'SCI', 'SARL', 'SAS', 'SNC', 'Société', 'Indivision', CIVILITE_AUTRE,
];

/**
 * LA CIVILITÉ RETENUE : celle de la liste, ou le texte libre quand on a choisi « Autre ».
 *
 * ⚠️ « Autre » NE PART JAMAIS EN BASE TEL QUEL : il ne désigne personne. Vide, on rend la chaîne vide, et
 * `manquesDeLaFiche` dira que la civilité manque — ce qui est vrai.
 */
export function civiliteRetenue(choix: string, libre: string): string {
  if (choix !== CIVILITE_AUTRE) return choix.trim();
  return libre.replace(/\s+/g, ' ').trim();
}

/**
 * CE QUE LA LISTE DOIT AFFICHER pour une civilité déjà en base (fiche importée, ou saisie d'avant ce lot).
 *
 * 🔴 ON RECONNAÎT LA VALEUR SANS LA RÉÉCRIRE. « M. » et « Mr », « MME » et « Mme » : la comparaison ignore la
 * casse, les points et les accents. Ce qui ne ressemble à rien de connu tombe dans « Autre », avec son texte
 * d'origine intact dans le champ libre — on ne perd jamais ce qui était écrit. PUR.
 */
export function civiliteDeLaListe(valeur: string | null | undefined): { choix: string; libre: string } {
  const brut = (valeur ?? '').trim();
  if (brut === '') return { choix: '', libre: '' };
  const cle = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
  const trouve = CIVILITES.find((c) => c !== CIVILITE_AUTRE && cle(c) === cle(brut));
  return trouve === undefined ? { choix: CIVILITE_AUTRE, libre: brut } : { choix: trouve, libre: '' };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA FICHE MISE EN FORME, D'UN SEUL GESTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ChampsFiche {
  civilite: string;
  nom: string;
  prenom: string;
  adresse: string;
  codePostal: string;
  commune: string;
}

/**
 * LA MISE EN FORME COMPLÈTE, appliquée à l'enregistrement ET à l'affichage.
 *
 * ⚠️ L'ADRESSE N'EST PAS TOUCHÉE. Arno n'en a rien dit, et pour cause : « 12 bis rue de l'Église » ne se met pas
 * en majuscules sans devenir illisible, ni en capitales initiales sans casser « bis ». On la laisse telle qu'elle
 * est tapée — ou telle que la Base Adresse Nationale la rend, ce qui est déjà une forme normalisée.
 */
export function ficheFormatee<T extends ChampsFiche>(f: T): T {
  return {
    ...f,
    nom: nomFormate(f.nom),
    prenom: prenomFormate(f.prenom),
    commune: communeFormatee(f.commune),
    codePostal: codePostalFormate(f.codePostal),
  };
}

/**
 * ══ 🔴 LE NOM AFFICHÉ D'UNE CARTE, MIS EN FORME À LA LECTURE ════════════════════════════════════════════════
 *
 * Arno : « Affichage des fiches existantes (import WIPPIMMO) : même mise en forme À L'AFFICHAGE, tout de suite. »
 *
 * 🔴 LE PROBLÈME QUE ÇA RÉSOUT : le nom affiché d'un propriétaire est RECOMPOSÉ EN BASE (`nom_complet`), et il
 * porte donc la casse de l'import — « Jullien - Garrido Cédric ». On ne peut pas le reformater en bloc sans
 * réécrire 310 lignes ; on le met en forme au moment de l'écrire à l'écran.
 *
 * ⚠️ ON SE SERT DU NOM ET DU PRÉNOM QUAND ON LES A, et du nom affiché seulement à défaut. Découper « NOM Prénom »
 * à l'aveugle reviendrait à deviner où finit le nom — et « JULLIEN - GARRIDO Cédric » a trois mots avant le
 * prénom. Les colonnes, elles, ne se trompent pas.
 */
export function nomAfficheFormate(p: {
  nom?: string | null; prenom?: string | null; nomAffiche?: string | null;
}): string {
  const nom = nomFormate(p.nom);
  const prenom = prenomFormate(p.prenom);
  if (nom === '') return (p.nomAffiche ?? '').trim();
  return prenom === '' ? nom : `${nom} ${prenom}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ « CRÉÉ LE », ET LA MENTION « IMPORTÉE »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 COMMENT ON SAIT QU'UNE FICHE VIENT DE L'IMPORT — SANS MIGRATION ════════════════════════════════════
 *
 * Arno : « Ajoute “Créé le JJ/MM/AAAA” affiché sur la carte, rempli automatiquement à la création et non
 * modifiable. Pour les fiches importées : la date de l'import, avec la mention “importée”. »
 *
 * 🔴 LES DEUX DATES EXISTENT DÉJÀ EN BASE (`cree_le`, `importe_le`, depuis la création des tables) : ce lot
 * n'ajoute AUCUNE colonne pour cela. Restait à distinguer les deux origines — et le marqueur existait lui aussi,
 * sans qu'on l'ait jamais nommé : une fiche créée DANS l'application reçoit une clé « app-<horodatage>-<hasard> »
 * (voir `annuaireEditionRepo`), là où l'import porte le vrai numéro WIPPIMMO.
 *
 * ⚠️ ON NE DEVINE PAS PAR LES DATES. À l'import, `cree_le` et `importe_le` valent tous deux « maintenant » : les
 * comparer ne dirait rien. La clé, elle, ne ment pas.
 */
export const PREFIXE_CLE_APP = 'app-';

export function ficheImportee(wippimmoId: string | null | undefined): boolean {
  return !(wippimmoId ?? '').startsWith(PREFIXE_CLE_APP);
}

/** `2026-10-01T…` → `01/10/2026`. Chaîne vide si la date manque ou ne se lit pas. PUR. */
export function dateCourte(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim());
  return m === null ? '' : `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * LA MENTION DE LA CARTE. « Créé le 01/10/2026 » ou « Importée le 28/09/2026 ».
 *
 * ⚠️ RIEN N'EST INVENTÉ QUAND LA DATE MANQUE : on rend la chaîne vide, et la carte n'affiche pas la ligne. Une
 * date fausse sur une fiche est pire qu'une date absente — c'est elle qu'on citera dans un litige.
 */
export function mentionCreation(o: {
  creeLe: string | null | undefined;
  importeLe: string | null | undefined;
  wippimmoId: string | null | undefined;
}): string {
  const importee = ficheImportee(o.wippimmoId);
  const jour = dateCourte(importee ? o.importeLe : o.creeLe);
  if (jour === '') return '';
  return importee ? `Importée le ${jour}` : `Créée le ${jour}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ L'ADRESSE CHOISIE DANS LA BASE ADRESSE NATIONALE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'une proposition de la BAN apporte, réduit aux trois champs qu'elle remplit. */
export interface AdresseProposee {
  /** Le libellé complet, tel que la BAN l'écrit : c'est lui qu'on affiche dans la liste. */
  etiquette: string;
  /** Numéro + voie, sans la commune ni le code postal. */
  voie: string;
  codePostal: string;
  commune: string;
}

/**
 * ══ 🔴 CE QU'ON RETIENT D'UNE RÉPONSE DE LA BASE ADRESSE NATIONALE ═══════════════════════════════════════════
 *
 * Arno : « Un choix remplit Adresse (numéro + voie), Code postal et Commune (en majuscules). »
 *
 * ⚠️ `name` ET NON `label`. `label` vaut « 1 Rue de l'Essai 92800 Puteaux » — le recopier dans le champ Adresse
 * y remettrait le code postal et la commune, qui ont leurs propres champs juste en dessous. `name` est la seule
 * partie « numéro + voie », et c'est exactement ce qu'Arno demande.
 *
 * ⚠️ UNE PROPOSITION SANS `name` (une commune seule, un lieu-dit) N'EST PAS ÉCARTÉE : on retombe sur `label`,
 * amputé du code postal et de la commune quand ils s'y trouvent. Mieux vaut une voie approximative qu'une ligne
 * de liste qui ne remplit rien quand on clique dessus. PUR.
 */
export function adresseDepuisBan(p: {
  label?: string; name?: string; postcode?: string; city?: string;
}): AdresseProposee | null {
  const etiquette = (p.label ?? '').trim();
  const codePostal = codePostalFormate(p.postcode);
  const commune = communeFormatee(p.city);
  let voie = (p.name ?? '').trim();
  if (voie === '') {
    voie = etiquette
      .replace(new RegExp(`\\s*${codePostal}\\s*$`), '')
      .replace(new RegExp(`\\s*${codePostal}\\s+.*$`), '')
      .trim();
  }
  if (etiquette === '' && voie === '') return null;
  return { etiquette: etiquette || voie, voie, codePostal, commune };
}

/**
 * ⚠️ « SAISIE LIBRE TOUJOURS POSSIBLE » (Arno) : adresse étrangère, lieu-dit, BAN indisponible. « Dans ce cas,
 * pas de blocage : un petit “adresse non vérifiée” discret. » Ce mot-ci est ce petit mot — il INFORME, il
 * n'interdit rien, et il ne s'affiche que lorsqu'une adresse a été tapée SANS être choisie dans la liste.
 */
export const MOT_ADRESSE_NON_VERIFIEE = 'adresse non vérifiée';
