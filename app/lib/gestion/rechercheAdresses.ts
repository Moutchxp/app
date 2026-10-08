/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 CHERCHER UN MAIL PAR UNE ADRESSE — LOT RECHERCHE-MAILS-PAR-ADRESSE (08/10/2026) ════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   « Pouvoir taper une adresse e-mail (ou un morceau : “gohudif”, “@gmail.com”, “manomano”) et retrouver tous
 *     les mails affichés où cette adresse apparaît. But : repérer les adresses “non affectées” et les relier à
 *     leurs parties. […] La recherche doit aussi porter sur TOUTES les adresses de chaque mail : expéditeur
 *     (From), destinataires (To), copie (Cc), copie cachée (Bcc) si connue, Répondre-à (Reply-To) ; et les
 *     adresses écrites dans le corps (ex. historique cité “De : … <x@y.fr>”, messages transférés).
 *     Correspondance partielle, sans tenir compte des majuscules/accents. […] Dans la liste des résultats,
 *     montre POURQUOI le mail correspond : l'adresse trouvée est surlignée, avec une petite étiquette de son
 *     rôle (“expéditeur”, “destinataire”, “en copie”, “dans le texte”). »
 *
 * ══ 🔴🔴 CE QUE LA RECHERCHE FOUILLAIT AVANT CE LOT, ET CE QUI LUI MANQUAIT ═════════════════════════════════════
 *
 * `matiereDuMail` (`historiqueBien.ts`) assemblait CINQ champs : l'objet, l'EXTRAIT du corps (240 caractères,
 * `EXTRAIT_MAX`), le nom de l'expéditeur, son adresse, et le nom des pièces jointes. Autrement dit : une seule
 * des cinq familles d'adresses d'un mail — celle de l'expéditeur — et 240 caractères de corps.
 *
 * 🔴 CE QUE CELA RATAIT, ET C'EST EXACTEMENT LE BESOIN D'ARNO : une adresse qui n'apparaît QU'EN COPIE, ou QUE
 * dans un historique cité plus bas dans le fil. Or ce sont précisément celles-là qu'on cherche quand on traque
 * une adresse « non affectée » : si elle était en expéditeur, elle serait déjà rattachée depuis longtemps.
 *
 * ══ 🔴🔴 POURQUOI UN RÔLE DE RECHERCHE DISTINCT DE `RoleAdresse` ════════════════════════════════════════════════
 *
 * `adressesMessage.ts` porte déjà un vocabulaire de rôles — `'expediteur' | 'destinataire' | 'copie' |
 * 'repondre_a' | 'transfere'` —, et il est LE calcul du rattachement : c'est lui qui décide si un mail entre
 * dans la sélection d'une partie. Deux raisons de ne pas s'y greffer :
 *   · il EXCLUT le Cci à dessein (« on ne sait pas s'il a été lu […] le faire entrer dans l'historique donnerait
 *     à voir ce que personne n'a vu »), alors qu'Arno demande de le CHERCHER quand on le connaît. Chercher
 *     n'est pas rattacher : on ne fait apparaître aucune adresse, on retrouve un mail qu'on a déjà sous les yeux ;
 *   · ajouter une variante à cette union toucherait un type que le moteur de rattachement parcourt de façon
 *     exhaustive. Une recherche n'a pas à faire bouger le rattachement.
 *
 * 🔒 Module PUR : aucune base, aucun réseau, aucun `Date`.
 */

/**
 * Le rôle sous lequel une adresse a été trouvée. Les quatre premiers mots sont ceux d'Arno.
 *
 * ⚠️ `copie_cachee` ET `repondre_a` N'ÉTAIENT PAS DANS SA LISTE D'EXEMPLES mais sont dans sa demande (« copie
 * cachée (Bcc) si connue, Répondre-à (Reply-To) ») : ils ont donc leur étiquette, plutôt que d'être rangés sous
 * « en copie », qui dirait autre chose.
 */
export type RoleRecherche =
  | 'expediteur' | 'destinataire' | 'copie' | 'copie_cachee' | 'repondre_a' | 'texte';

/** L'étiquette lisible d'un rôle — et c'est le SEUL endroit où ces mots sont écrits. */
export const MOT_ROLE_RECHERCHE: Readonly<Record<RoleRecherche, string>> = {
  expediteur: 'expéditeur',
  destinataire: 'destinataire',
  copie: 'en copie',
  copie_cachee: 'en copie cachée',
  repondre_a: 'répondre à',
  texte: 'dans le texte',
};

/**
 * 🔴 L'ORDRE DES RÔLES À L'ÉCRAN, et il n'est pas alphabétique : il va du plus engageant au plus incident.
 * Une adresse en expéditeur dit « cette personne a écrit » ; la même citée dans un texte dit seulement « son
 * nom passe par là ». Montrer les secondes en premier ferait conclure trop vite.
 */
const RANG_ROLE: Readonly<Record<RoleRecherche, number>> = {
  expediteur: 0, destinataire: 1, copie: 2, copie_cachee: 3, repondre_a: 4, texte: 5,
};

/** Une adresse d'un mail, avec le rôle par lequel elle y figure. */
export interface AdresseDuMail {
  adresse: string;
  role: RoleRecherche;
}

/** Une adresse qui correspond à ce qu'on cherche, prête à être affichée. */
export interface AdresseTrouvee extends AdresseDuMail {
  /** L'étiquette lisible, pour n'avoir pas à la recalculer à l'écran. */
  mot: string;
}

/**
 * ══ 🔴🔴 LES ADRESSES ÉCRITES DANS UN CORPS DE MAIL. PUR. ════════════════════════════════════════════════════
 *
 * ARNO : « et les adresses écrites dans le corps (ex. historique cité “De : … <x@y.fr>”, messages transférés) ».
 *
 * 🔴 UNE EXPRESSION, ET NON UN ANALYSEUR DE MAIL. On ne cherche pas à comprendre la structure du fil cité —
 * `adressesMessage.ts` le fait déjà pour le RATTACHEMENT, avec ses marqueurs de transfert, et c'est un travail
 * d'orfèvre qui rend UNE adresse, celle de l'expéditeur transféré. Ici on veut l'inverse : TOUTES les adresses
 * qui traînent dans le texte, sans hiérarchie, pour qu'une recherche les retrouve.
 *
 * ⚠️ LE HTML EST TRAITÉ COMME DU TEXTE, ET C'EST SUFFISANT : une adresse y apparaît en clair dans un
 * `mailto:`, dans le texte d'un lien ou dans un bloc cité. Désassembler le HTML pour n'en garder que le texte
 * coûterait un analyseur entier pour retrouver les mêmes adresses.
 *
 * ⚠️ LES FAUSSES ADRESSES DU HTML SONT ÉCARTÉES : `logo@2x.png`, `image@3x.jpg` sont des noms de fichiers que
 * l'expression attraperait (`@`, un point, des lettres). La liste d'extensions ci-dessous les retire — mesurée
 * sur les corps réels, c'est la seule famille de faux positifs qui revient.
 *
 * ⚠️ BORNÉ À 50 ADRESSES : un fil de vingt réponses en porte facilement trente. Au-delà, ce n'est plus un mail,
 * c'est une liste de diffusion, et les cinquante premières suffisent à le retrouver.
 */
const FINS_DE_FICHIER = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'css', 'js', 'pdf', 'doc', 'docx',
]);

const MOTIF_ADRESSE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export const ADRESSES_TEXTE_MAX = 50;

export function adressesDuTexte(corps: string | null | undefined): string[] {
  const s = corps ?? '';
  if (s === '') return [];
  const vues = new Set<string>();
  for (const brut of s.match(MOTIF_ADRESSE) ?? []) {
    const a = brut.toLowerCase().replace(/[.'-]+$/, '');
    const fin = a.slice(a.lastIndexOf('.') + 1);
    if (FINS_DE_FICHIER.has(fin)) continue;
    vues.add(a);
    if (vues.size >= ADRESSES_TEXTE_MAX) break;
  }
  return [...vues];
}

/**
 * ══ 🔴🔴 TOUTES LES ADRESSES D'UN MAIL, AVEC LEUR RÔLE. PUR. ═════════════════════════════════════════════════
 *
 * 🔴 UNE MÊME ADRESSE PEUT PARAÎTRE SOUS DEUX RÔLES — expéditeur d'un mail ET citée plus bas dans le fil qu'il
 * reprend. Ce sont deux faits, et le second explique souvent le premier. Le dédoublonnage porte donc sur le
 * COUPLE (adresse, rôle), comme dans `releverAdresses`.
 *
 * ⚠️ LE RÔLE LE PLUS ENGAGEANT L'EMPORTE À ADRESSE ÉGALE : si une adresse est à la fois expéditeur et citée
 * dans le texte, l'écran montre « expéditeur ». Sans cela, un mail d'un locataire qui reprend son propre fil
 * afficherait « dans le texte » — vrai, et trompeur.
 */
export interface MailAChercher {
  de: string;
  deNom?: string | null;
  a?: readonly { adresse: string }[];
  cc?: readonly { adresse: string }[];
  cci?: readonly { adresse: string }[];
  repondreA?: readonly { adresse: string }[];
  adressesTexte?: readonly string[];
}

export function adressesDuMail(m: MailAChercher): AdresseDuMail[] {
  const parAdresse = new Map<string, RoleRecherche>();
  const poser = (brut: string, role: RoleRecherche): void => {
    const a = brut.trim().toLowerCase();
    if (a === '') return;
    const connu = parAdresse.get(a);
    if (connu !== undefined && RANG_ROLE[connu] <= RANG_ROLE[role]) return;
    parAdresse.set(a, role);
  };
  poser(m.de, 'expediteur');
  for (const p of m.a ?? []) poser(p.adresse, 'destinataire');
  for (const p of m.cc ?? []) poser(p.adresse, 'copie');
  for (const p of m.cci ?? []) poser(p.adresse, 'copie_cachee');
  for (const p of m.repondreA ?? []) poser(p.adresse, 'repondre_a');
  for (const a of m.adressesTexte ?? []) poser(a, 'texte');
  return [...parAdresse.entries()]
    .map(([adresse, role]) => ({ adresse, role }))
    .sort((x, y) => RANG_ROLE[x.role] - RANG_ROLE[y.role] || x.adresse.localeCompare(y.adresse));
}

/**
 * ══ 🔴🔴 CELLES QUI CORRESPONDENT À CE QU'ON CHERCHE. PUR. ═══════════════════════════════════════════════════
 *
 * ARNO : « Correspondance partielle, sans tenir compte des majuscules/accents. » Et : « montre POURQUOI le mail
 * correspond ».
 *
 * 🔴 UN MOT SUFFIT À RETENIR UNE ADRESSE, et c'est VOLONTAIREMENT plus large que la règle « tous les mots
 * présents » de la recherche elle-même. Les deux ne répondent pas à la même question : la recherche décide si
 * le MAIL reste affiché (tous les mots, n'importe où — objet, texte, pièces, adresses) ; cette fonction-ci
 * décide quelles ADRESSES sont montrées comme explication. Exiger les deux mots dans la même adresse
 * n'expliquerait plus rien dès qu'on tape « gohudif facture ».
 *
 * ⚠️ LES ADRESSES SONT DÉJÀ EN MINUSCULES, mais les mots cherchés passent par `normaliser` : c'est le même
 * traitement que la recherche (accents retirés), sans quoi « frédéric@… » ne répondrait pas à « frederic ».
 */
export function adressesTrouvees(
  m: MailAChercher, mots: readonly string[], normaliser: (s: string) => string,
): AdresseTrouvee[] {
  if (mots.length === 0) return [];
  const cherches = mots.map((x) => normaliser(x)).filter((x) => x !== '');
  if (cherches.length === 0) return [];
  return adressesDuMail(m)
    .filter((x) => cherches.some((mot) => normaliser(x.adresse).includes(mot)))
    .map((x) => ({ ...x, mot: MOT_ROLE_RECHERCHE[x.role] }));
}
