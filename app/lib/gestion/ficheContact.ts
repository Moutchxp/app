/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LA FICHE D'UN CONTACT : SES RÈGLES, ET ELLES SEULES ═════════════════════
 *
 * Module PUR : aucune base, aucun réseau, aucun React, aucun `pg`. Il est importé par des composants `'use
 * client'` ET par le dépôt — c'est précisément ce qui garantit qu'une règle y est écrite UNE fois (règle du
 * module depuis l'incident du 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Le formulaire du “+” doit être le MÊME que celui des clients
 * (“Nouvelle fiche” / “Modifier la fiche”), le MÊME composant, pas une copie : civilité, nom, prénom, qualité,
 * adresse, code postal, commune, “Téléphones et e-mails” (plusieurs lignes, ordre ↑↓, ✕, “+ Téléphone”,
 * “+ E-mail”), note libre, catégorie (Propriétaire / Locataire / Tiers indépendant, pré-choisie). Pré-rempli
 * depuis le pré-remplissage : nom et prénom séparés si possible, e-mail, téléphone et adresse trouvés dans la
 * signature. POUR UN CONTACT, SEULS LE NOM ET AU MOINS UN E-MAIL SONT OBLIGATOIRES ; les autres champs sont
 * facultatifs, sans message rouge. LES RÈGLES DES CLIENTS NE CHANGENT PAS. »
 *
 * ═══ 🔴 CE FICHIER EXISTE POUR LA DERNIÈRE PHRASE ════════════════════════════════════════════════════════════════
 *
 * `manquesDeLaFiche` (annuaireEdition) exige HUIT champs : civilité, nom, prénom, adresse, code postal, commune,
 * au moins un téléphone et au moins un e-mail. C'est la règle d'un CLIENT, arbitrée par Arno le 29/09/2026, et
 * elle ne bouge pas. Un contact, lui, est souvent connu par son seul courrier : on a son adresse e-mail, parfois
 * son nom, rarement son code postal. Lui appliquer la règle des clients aurait rendu le « + » inutilisable —
 * « Enregistrer » grisé, six mentions rouges, pour une carte dont le but est d'apprendre à l'automatisation qui
 * parle de ce logement.
 *
 * 🔴 DEUX RÈGLES SÉPARÉES, ET NON UN PARAMÈTRE DANS CELLE DES CLIENTS. J'ai failli ajouter un `sorte` à
 * `manquesDeLaFiche` : il aurait fallu lire huit conditions pour savoir laquelle s'applique à qui, et la première
 * fois qu'on aurait touché la règle d'un contact, celle d'un client aurait bougé d'un pixel. Ce qui est PARTAGÉ
 * est le FORMULAIRE (un seul composant, comme Arno l'exige) ; ce qui diffère est l'exigence, et elle se lit ici
 * en six lignes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { CoordonneeSaisie } from './annuaireEdition';
import { libellePropre, notePropre, texteOuRien } from './annuaireEdition';

/** Les deux titres du formulaire d'un contact. Écrits UNE fois : l'écran et les épreuves disent le même mot. */
export const TITRE_CONTACT_NOUVEAU = 'Nouveau contact';
export const TITRE_CONTACT_MODIFIER = 'Modifier ce contact';

/**
 * ══ 🔴🔴 CE QUI MANQUE À UN CONTACT — LE NOM, ET AU MOINS UN E-MAIL ══════════════════════════════════════════════
 *
 * Même forme que `manquesDeLaFiche` (une carte par champ, posée SOUS son champ) parce que le formulaire est le
 * même et qu'il sait déjà afficher ce dictionnaire. Seul le CONTENU de la règle change.
 *
 * 🔴 AU MOINS UN E-MAIL, ET PAS « L'ADRESSE DE LA CAPSULE SUFFIT ». Elle suffirait aujourd'hui — le formulaire la
 * pré-remplit toujours. Mais rien n'empêche de la retirer d'un clic sur « ✕ », et une carte de contact sans
 * aucune adresse e-mail ne sert plus à rien : c'est par l'adresse que l'automatisation reconnaît ses mails. La
 * règle protège donc le BUT de la carte, et pas une case de formulaire.
 *
 * ⚠️ AUCUNE EXIGENCE DE TÉLÉPHONE, et c'est une différence VOULUE avec les clients : mesuré le 05/10/2026, 83 %
 * des contacts qui ont écrit laissent un numéro dans leur signature — donc 17 % n'en laissent pas, et on ne va
 * pas refuser de garder ce qu'on sait d'eux pour un champ qu'on n'a pas.
 *
 * ⚠️ ON JUGE LA SAISIE, PAS SA VALIDITÉ DE FOND. « Est-ce une vraie adresse e-mail » reste l'affaire de
 * `verifierCoordonnees`, à l'enregistrement, avec son motif à elle. Ici une seule question : a-t-on tapé
 * quelque chose ? Mêler les deux donnerait deux endroits où lire la même règle. PUR.
 */
export function manquesDuContact(f: {
  nom: string; coordonnees: readonly CoordonneeSaisie[];
}): Record<string, string> {
  const manque: Record<string, string> = {};
  const vide = (v: string): boolean => (v ?? '').trim() === '';

  if (vide(f.nom)) manque.nom = 'Le nom est obligatoire.';
  if (!f.coordonnees.some((c) => c.sorte === 'email' && !vide(c.valeur))) {
    manque.email = 'Il faut au moins une adresse e-mail : c’est par elle qu’on reconnaît ses mails.';
  }
  return manque;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES COORDONNÉES D'UNE CARTE — UN TABLEAU ORDONNÉ, RELU SANS JAMAIS RIEN DEVINER
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une coordonnée telle que la carte la garde. L'ORDRE DU TABLEAU EST L'ORDRE AFFICHÉ — il n'y a rien à trier. */
export interface CoordonneeDeCarte {
  sorte: 'telephone' | 'email';
  /** Le libellé du type (« Mobile », « Fixe », « E-mail »). `null` = l'écran écrira le mot générique. */
  libelle: string | null;
  valeur: string;
}

/**
 * ══ 🔴 RELIRE LE `jsonb` DE LA MIGRATION 306 — ET IGNORER CE QUI N'EST PAS LISIBLE ═══════════════════════════════
 *
 * 🔴 UNE LIGNE ILLISIBLE EST IGNORÉE, JAMAIS DEVINÉE. La base contraint la FORME (un tableau — `CHECK` de la
 * 306) ; le contenu, lui, vient d'un `jsonb` que rien n'oblige à ressembler à quoi que ce soit. Deviner la sorte
 * d'une ligne sans sorte aurait rangé un numéro parmi les e-mails, et c'est une carte qui ment ensuite pour
 * toujours. Sauter la ligne laisse voir qu'il manque quelque chose.
 *
 * ⚠️ UNE VALEUR VIDE NE FAIT PAS UNE COORDONNÉE : la liste du formulaire porte des lignes vides pendant la
 * saisie, et les garder ferait afficher des rubriques sans rien dedans.
 */
export function coordonneesDeLaCarte(brut: unknown): CoordonneeDeCarte[] {
  if (!Array.isArray(brut)) return [];
  const out: CoordonneeDeCarte[] = [];
  for (const x of brut) {
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    const sorte = o.sorte === 'email' ? 'email' : o.sorte === 'telephone' ? 'telephone' : null;
    const valeur = typeof o.valeur === 'string' ? o.valeur.trim() : '';
    if (sorte === null || valeur === '') continue;
    out.push({ sorte, valeur, libelle: libellePropre(typeof o.libelle === 'string' ? o.libelle : null) });
  }
  return out;
}

/**
 * CE QUI PART EN BASE : la liste saisie, dans son ordre, sans les lignes vides.
 *
 * 🔴 LA LISTE COMPLÈTE PART À CHAQUE ENREGISTREMENT, c'est la règle du formulaire des clients (lot
 * FICHES-RETOUCHES) et on ne va pas en inventer une autre : ajouter, retirer et réordonner sont ainsi le MÊME
 * geste, et l'écran n'a pas de différentiel à calculer — donc pas d'occasion de se tromper un jour sur l'ordre.
 */
export function coordonneesPourLaBase(saisies: readonly CoordonneeSaisie[]): CoordonneeDeCarte[] {
  return saisies
    .filter((c) => c.valeur.trim() !== '')
    .map((c) => ({
      sorte: c.sorte === 'email' ? 'email' as const : 'telephone' as const,
      valeur: c.valeur.trim(),
      libelle: libellePropre(c.libelle),
    }));
}

/**
 * ══ 🔴🔴 CE QUI PART AU SERVEUR, ÉCRIT UNE SEULE FOIS ════════════════════════════════════════════════════════════
 *
 * Les deux endroits qui enregistrent un contact — le « + » du bloc du bas et le crayon d'une carte du haut —
 * reçoivent le MÊME objet du formulaire, et doivent donc en faire le même corps de requête. Deux traductions
 * jumelles auraient divergé au premier champ ajouté : l'un aurait envoyé la qualité, l'autre l'aurait oubliée,
 * et personne ne l'aurait vu avant de rouvrir la fiche.
 *
 * 🔴 UN CHAMP VIDE DEVIENT `null`, JAMAIS `''`. Le serveur en ferait `null` de toute façon (`texteCourt`), mais
 * envoyer `''` ferait croire, en lisant le corps d'une requête, qu'on a saisi quelque chose de vide — et c'est
 * le genre de différence qu'on finit par comparer. `null` dit « rien », et c'est ce que la base garde.
 *
 * ⚠️ `adresse` DEVIENT `adressePostale` ICI, et c'est le seul endroit où le mot change : le formulaire appelle
 * « adresse » son champ postal (il ne connaît que des clients, dont l'adresse EST postale), la carte d'un contact
 * appelle « adresse » son adresse e-mail. Les confondre créerait une carte dont l'identité est une rue.
 */
export function ficheAEnvoyer(champs: {
  civilite?: string | null; nom?: string; prenom?: string | null; qualite?: string | null;
  adresse?: string | null; codePostal?: string | null; commune?: string | null; note?: string | null;
  coordonnees?: readonly CoordonneeSaisie[];
}): {
  nom: string | null; civilite: string | null; prenom: string | null; qualite: string | null;
  adressePostale: string | null; codePostal: string | null; commune: string | null; note: string | null;
  coordonnees: CoordonneeDeCarte[];
} {
  return {
    nom: texteOuRien(champs.nom, 200),
    civilite: texteOuRien(champs.civilite, 60),
    prenom: texteOuRien(champs.prenom, 200),
    qualite: texteOuRien(champs.qualite, 200),
    adressePostale: texteOuRien(champs.adresse, 300),
    codePostal: texteOuRien(champs.codePostal, 10),
    commune: texteOuRien(champs.commune, 120),
    /* ⚠️ LA NOTE GARDE SES RETOURS À LA LIGNE : c'est une note, pas un titre. D'où `notePropre` et non
       `texteOuRien`, qui écrase les blancs — la même distinction que pour une note de client. */
    note: notePropre(champs.note),
    coordonnees: coordonneesPourLaBase(champs.coordonnees ?? []),
  };
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — L'IDENTITÉ D'UN CONTACT CRÉÉ DEPUIS LE CARROUSEL ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Les cartes “+ Ajouter un propriétaire” et “+ Ajouter un occupant” deviennent
 * “Ajouter un contact” […] Le choix contact ouvre le formulaire de contact du lot 8. »
 *
 * 🔴 UNE CARTE DE CONTACT EST IDENTIFIÉE PAR SON ADRESSE E-MAIL — c'est la clé de la table, et c'est par elle
 * que la capsule du bloc du bas retrouve sa carte. Créée depuis le bloc, cette adresse est celle de la CAPSULE
 * d'où l'on clique. Créée depuis le CARROUSEL, il n'y a pas de capsule : l'identité ne peut venir que de ce
 * qu'Arno saisit, c'est-à-dire du premier e-mail de la liste.
 *
 * 🔴 LE **PREMIER**, ET NON « UN » : la liste est ordonnée à la main (↑↓), et son premier e-mail est celui
 * qu'Arno a mis en tête. Prendre le dernier, ou le plus court, aurait fait dépendre l'identité d'une règle que
 * personne ne voit.
 *
 * ⚠️ `null` QUAND IL N'Y EN A AUCUN, et le formulaire refuse alors d'être validé (`manquesDuContact` exige au
 * moins un e-mail). Les deux disent la même chose pour la même raison : sans adresse, la carte ne sert à rien —
 * c'est par elle que l'automatisation reconnaît ses mails.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function premierEmail(coordonnees: readonly CoordonneeDeCarte[]): string | null {
  return texteOuRien(coordonnees.find((c) => c.sorte === 'email')?.valeur ?? null, 320);
}

/**
 * ══ 🔴 LE PREMIER TÉLÉPHONE — ET POURQUOI LA COLONNE `telephone` RESTE ÉCRITE ════════════════════════════════════
 *
 * `gestion_contact_carte.telephone` existe depuis la migration 304 et elle est lue AILLEURS que par la carte : le
 * report d'un changement de côté la recopie (`faireSuivreLaCarte`), et la proposition automatique l'alimente
 * depuis la signature. La laisser vide quand la liste porte un numéro aurait fait perdre ce numéro au premier
 * glissement d'un côté à l'autre — c'est-à-dire exactement le défaut que ce report existe pour empêcher.
 *
 * ⚠️ ELLE EST DONC **DÉRIVÉE**, ET NON UNE SECONDE VÉRITÉ : la liste décide, la colonne suit. C'est pour cela
 * qu'elle est calculée ici, par la même fonction pour l'écriture et pour la relecture, et nulle part ailleurs.
 */
export function premierTelephone(coordonnees: readonly CoordonneeDeCarte[]): string | null {
  return texteOuRien(coordonnees.find((c) => c.sorte === 'telephone')?.valeur ?? null, 60);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE PRÉ-REMPLISSAGE — DÉCOUPER « Jessica TADEU » EN PRÉNOM ET NOM, QUAND C'EST POSSIBLE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 « NOM ET PRÉNOM SÉPARÉS SI POSSIBLE » — ET « SI POSSIBLE » EST LA MOITIÉ DE LA DEMANDE ══════════════════
 *
 * Le courrier ne porte qu'UN champ : « Jessica TADEU <…> », « MDRC SYNDIC <…> », « Puro Flow Paris <…> ». Deux
 * de ces trois ne se coupent pas, et les couper quand même donnerait prénom « Puro », nom « Flow Paris » — une
 * fiche fausse, qu'un humain devra défaire.
 *
 * LES QUATRE CAS, DANS CET ORDRE :
 *   ① UN SEUL MOT → tout dans le NOM. Rien à deviner.
 *   ② DES MOTS EN CAPITALES ET D'AUTRES NON → les CAPITALES sont le nom, le reste le prénom, DANS LEUR ORDRE
 *     D'ORIGINE. C'est la convention de ce dépôt (`nomFormate` met le nom en capitales) et celle des signatures
 *     françaises : « Jessica TADEU » comme « TADEU Jessica » se lisent sans ambiguïté.
 *   ③ EXACTEMENT DEUX MOTS, sans indice de capitales → « Prénom Nom », l'ordre des en-têtes de courrier
 *     (« Fanny Rosky », « esteban fardeau »).
 *   ④ TROIS MOTS OU PLUS, sans indice → tout dans le NOM. C'est presque toujours une société (« Puro Flow
 *     Paris », « Cabinet Jean Mercier »), et un prénom inventé là serait recopié dans tous les courriers.
 *
 * ⚠️ UN MOT EN CAPITALES D'UNE SEULE LETTRE N'EN EST PAS UN : « J. Mercier » ne doit pas donner nom « J. ».
 *
 * 🔴 UNE CIVILITÉ EN TÊTE EST UNE CIVILITÉ, PAS UN PRÉNOM, et c'est la MESURE qui l'a imposé : sur les 398 noms
 * d'en-tête des adresses à carte du 05/10/2026, « MADAME ROUDAUT », « MADAME BERREBI », « MONSIEUR TROSSELY » et
 * « Mr Ramdani » donnaient prénom = « MADAME » / « MONSIEUR » / « Mr ». Le formulaire a un champ « Civilité » :
 * le mot va là, et le prénom reste vide — ce qui est la vérité.
 *
 * ═══ ⚠️ CE QUE LA MESURE DIT AUSSI, ET QU'ON N'ESSAIE PAS DE CORRIGER ════════════════════════════════════════════
 *
 * Répartition réelle des 398 noms : 28 en un seul mot, **185 avec un signal de capitales**, **149 à deux mots**,
 * 36 gardés en bloc. Les deux grandes familles se coupent juste dans la très grande majorité des cas — et faux
 * dans quelques-uns, que voici en toutes lettres :
 *   · « Cabinet MC Immo » → nom « MC », prénom « Cabinet Immo » (une société, pas une personne) ;
 *   · « Aguado Christelle », « Tarabay Serge » → nom et prénom INVERSÉS (ordre « Nom Prénom » sans capitales) ;
 *   · « ARX FRANCE », « IR RENOV », « agence agpf » → deux mots, mais une société.
 *
 * On ne va pas plus loin, et c'est une décision : ce pré-remplissage s'affiche dans un formulaire qu'un humain
 * valide champ par champ, et une heuristique de plus (un dictionnaire de prénoms, une liste de mots de société)
 * se tromperait ailleurs, sans qu'on puisse dire où. « Si possible » est la demande ; la validation est à Arno.
 *
 * ⚠️ RIEN N'EST MIS EN FORME ICI. Le formulaire applique `nomFormate` / `prenomFormate` sous les doigts — deux
 * mises en forme pour un champ auraient fini par ne plus s'accorder. Cette fonction DÉCOUPE, c'est tout. PUR.
 */
/** La clé de comparaison d'un mot de civilité : sans accents, sans ponctuation, en minuscules. */
function cleDeCivilite(mot: string): string {
  return mot.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * ══ 🔴 LES MOTS DE CIVILITÉ QU'UN EN-TÊTE DE COURRIER EMPLOIE ════════════════════════════════════════════════════
 *
 * 🔴 LES VALEURS SONT CELLES DE LA LISTE DES CLIENTS (`CIVILITES`), et le cas ci-dessous le vérifie : une
 * civilité qui ne serait pas dans la liste tomberait dans « Autre » à l'ouverture du formulaire, avec son texte
 * en champ libre — c'est-à-dire qu'on aurait rangé « MADAME » dans une case « préciser la civilité ».
 *
 * ⚠️ LES FORMES LONGUES SONT LÀ PARCE QUE LA MESURE LES A TROUVÉES : « MADAME ROUDAUT », « MONSIEUR TROSSELY ».
 * `civiliteDeLaListe` ne les reconnaît pas (elle compare à « Mme » et « M. »), et c'est normal : elle relit une
 * valeur déjà rangée en base, pas un en-tête de courrier.
 */
const CIVILITES_EN_TETE: ReadonlyMap<string, string> = new Map([
  ['m', 'M.'], ['mr', 'M.'], ['monsieur', 'M.'],
  ['mme', 'Mme'], ['madame', 'Mme'], ['mlle', 'Mme'], ['melle', 'Mme'], ['mademoiselle', 'Mme'],
]);

export function couperNomEtPrenom(
  brut: string | null | undefined,
): { nom: string; prenom: string; civilite: string } {
  let mots = (brut ?? '').replace(/\s+/g, ' ').trim().split(' ').filter((m) => m !== '');

  /**
   * 🔴 LA CIVILITÉ SORT D'ABORD, et seulement si quelque chose la suit : « M. » tout seul n'est pas un nom, et le
   * retirer laisserait une fiche vide là où on avait au moins cela à montrer.
   */
  let civilite = '';
  if (mots.length >= 2) {
    /* ⚠️ ON NE PASSE PAS PAR `civiliteDeLaListe` : elle reconnaît « Mme » mais pas « MADAME », et ce sont les
       formes LONGUES que les en-têtes de courrier emploient (mesuré : « MADAME ROUDAUT », « MONSIEUR
       TROSSELY »). Ce qu'elle rend, en revanche, est bien une valeur de SA liste — voir `CIVILITES_EN_TETE`. */
    const premier = CIVILITES_EN_TETE.get(cleDeCivilite(mots[0]));
    /* ① « M. et Mme BASUYAUX » : trois mots pour une seule civilité, et elle est dans la liste des clients. */
    const second = mots.length >= 4 ? CIVILITES_EN_TETE.get(cleDeCivilite(mots[2])) : undefined;
    if (premier !== undefined && second !== undefined && cleDeCivilite(mots[1]) === 'et' && premier !== second) {
      civilite = 'M. et Mme';
      mots = mots.slice(3);
    } else if (premier !== undefined) {
      civilite = premier;
      mots = mots.slice(1);
    }
  }

  if (mots.length === 0) return { nom: '', prenom: '', civilite };
  if (mots.length === 1) return { nom: mots[0], prenom: '', civilite };

  const capitale = (m: string): boolean => {
    const lettres = m.replace(/[^\p{L}]/gu, '');
    return lettres.length >= 2 && lettres === lettres.toLocaleUpperCase('fr');
  };
  const majs = mots.filter(capitale);
  if (majs.length > 0 && majs.length < mots.length) {
    return { nom: majs.join(' '), prenom: mots.filter((m) => !capitale(m)).join(' '), civilite };
  }
  if (mots.length === 2) return { prenom: mots[0], nom: mots[1], civilite };
  return { nom: mots.join(' '), prenom: '', civilite };
}
