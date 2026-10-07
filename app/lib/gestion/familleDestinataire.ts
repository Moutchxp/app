import { estAncienLocataire, type CategoriePartie } from './historiqueBien';
import type { ContactAffiche, FicheLot } from './annuaireRepo';
import type { PersonneDuMail } from './adressesMessage';

/**
 * ══ 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — À QUELLE FAMILLE AVONS-NOUS ENVOYÉ CETTE PIÈCE ? ═════════════════════════
 *
 * Module PUR : aucune base, aucun réseau, aucun DOM, aucun React. Il répond à une seule question — « cette pièce
 * sortante est partie vers quelles familles de destinataires ? » — et il la répond pour TOUS les écrans qui
 * montrent une miniature de pièce jointe.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026) : « uniquement pour une pièce jointe d'un message ENVOYÉ depuis
 * gestion@criterimmo.fr. […] tous les destinataires du message qui porte la pièce (À, Cc et Cci si on le
 * connaît), sans gestion@criterimmo.fr lui-même. […] une capsule par famille présente parmi les destinataires,
 * jamais deux fois la même famille, dans l'ordre Propriétaire, Locataire, Tiers indépendant, Interne, Extérieur. »
 *
 * ═══ 🔴🔴 CE QU'IL REMPLACE, ET POURQUOI CE N'EST PAS UNE SECONDE ÉCRITURE ═══════════════════════════════════════
 *
 * Le lot HISTORIQUE-BIEN-14 (point 2) avait posé `partiesDestinataires` dans `historiqueBien.ts` : des LIGNES
 * « → envoyé à la partie propriétaire », une par partie, chacune avec son propre « i ». Arno les remplace par des
 * CAPSULES, ajoute une famille (INTERNE), renomme « non affecté » en EXTÉRIEUR, et ne veut plus qu'UN « i » pour
 * toute la pièce. L'ancienne fonction est donc SUPPRIMÉE, pas doublée — voir l'encadré de retrait là-bas.
 *
 * 🔴 LE CHANGEMENT DE FOND EST L'INTERNE. L'ancienne règle ÉCARTAIT toute adresse des nôtres : « nous mettre en
 * copie de notre propre envoi n'est pas envoyer à une partie ». Arno tranche autrement : un collègue destinataire
 * EST une information, et elle a sa capsule. Seule la BOÎTE elle-même (`gestion@criterimmo.fr`) reste écartée —
 * s'y mettre en copie n'apprend rien, et la compter aurait collé « Envoyé en interne » sous la moitié des pièces.
 *
 * ═══ 🔴🔴 LA FAMILLE D'UNE ADRESSE, DANS L'ORDRE DE PRIORITÉ D'ARNO ══════════════════════════════════════════════
 *   a. INTERNE — `estAdresseInterne` : @sansvisavis.com, @criterimmo.fr, gestion.criterimmo@gmail.com. C'est
 *      EXACTEMENT ce qui classe une adresse « Notre agence » dans le bloc PARTIES (`grouperParCategorie` écarte
 *      sur `i.interne`, qui vient de la même règle) : les deux critères d'Arno n'en font donc qu'un, et il est
 *      déjà écrit une seule fois dans le dépôt. Il PASSE AVANT le bloc PARTIES, comme demandé — six de nos fiches
 *      WIPPIMMO portent une de nos adresses, et sans cette priorité un mail interne deviendrait « propriétaire ».
 *   b. Sinon, la catégorie de l'adresse dans le bloc PARTIES du bien rattaché, lue par le MÊME calcul que celui
 *      qui remplit ce bloc (`categoriesDuBien`, juste en dessous).
 *   c. Sinon — pas de bien, ou adresse absente des Parties — EXTÉRIEUR.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Les six familles. L'ordre de ce tableau EST l'ordre d'affichage demandé par Arno.
 *
 * 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — « Ordre : Propriétaire, Locataire, Ancien locataire, Tiers indépendant,
 * Interne, Extérieur. » L'ancien locataire est JUSTE APRÈS le locataire en place, et c'est là qu'il doit être :
 * les deux parlent du même logement, et c'est leur voisinage qui fait lire la distinction.
 */
export const ORDRE_FAMILLES = [
  'proprietaire', 'locataire', 'ancien_locataire', 'independant', 'interne', 'exterieur',
] as const;

export type FamilleDestinataire = (typeof ORDRE_FAMILLES)[number];

/**
 * Le ton d'une famille. `neutre` n'est pas une couleur : c'est l'absence de fond, demandée par Arno pour
 * l'extérieur (« sans fond, bord fin, texte gris »). La feuille le traduit ; ce module ne connaît pas de couleur.
 */
export type TonFamille = 'rouge' | 'vert' | 'violet' | 'bleu' | 'gris' | 'neutre';

const TONS: Record<FamilleDestinataire, TonFamille> = {
  proprietaire: 'rouge',
  locataire: 'vert',
  /* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — le MÊME violet que le liseré de ses mails et que sa capsule d'Annuaire.
     Le ton vient du même vocabulaire (`tonDuGroupe('ancien_locataire')`), et la feuille le peint au même jeton. */
  ancien_locataire: 'violet',
  independant: 'bleu',
  interne: 'gris',
  exterieur: 'neutre',
};

/**
 * LE MOT DE LA CAPSULE, dans les mots d'Arno, au caractère près.
 *
 * ⚠️ « Destinataire extérieur » NE COMMENCE PAS PAR « Envoyé », et c'est exact : les quatre autres disent où la
 * pièce est allée, celle-ci dit qu'on ne sait pas qui est cette personne pour ce dossier. « Envoyé vers
 * extérieur » aurait nommé une famille qui n'en est pas une.
 */
const MOTS: Record<FamilleDestinataire, string> = {
  proprietaire: 'Envoyé vers propriétaire',
  locataire: 'Envoyé vers locataire',
  /* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — mot pour mot la demande d'Arno, et DISTINCT de « Envoyé vers locataire »,
     qui reste réservé au locataire EN PLACE. Les deux capsules peuvent paraître sous la même pièce : c'est
     exactement le cas qu'on veut pouvoir lire d'un coup d'œil. */
  ancien_locataire: 'Envoyé vers ancien locataire',
  independant: 'Envoyé à tiers indépendant',
  interne: 'Envoyé en interne',
  exterieur: 'Destinataire extérieur',
};

/** Le titre de la famille dans la bulle du « i » — court, parce qu'il précède une liste d'adresses. */
const TITRES: Record<FamilleDestinataire, string> = {
  proprietaire: 'Propriétaire',
  locataire: 'Locataire',
  /* 🔴 LA SECTION DE LA BULLE DU « i » (Arno : « La bulle du “i” a sa section “Ancien locataire” »). */
  ancien_locataire: 'Ancien locataire',
  independant: 'Tiers indépendant',
  interne: 'Interne',
  exterieur: 'Extérieur',
};

export const motFamille = (f: FamilleDestinataire): string => MOTS[f];
export const titreFamille = (f: FamilleDestinataire): string => TITRES[f];
export const tonFamille = (f: FamilleDestinataire): TonFamille => TONS[f];

/**
 * LA FAMILLE D'UNE CATÉGORIE DU BLOC PARTIES. PURE.
 *
 * ⚠️ `a_repartir` DEVIENT `exterieur`, ET C'EST LE MÊME FAIT DIT AUTREMENT : « à répartir » est le mot du bloc
 * Parties, qui invite à ranger ; « extérieur » est le mot de la capsule, qui dit ce qu'on sait au moment de
 * l'envoi. Les deux désignent la même absence de rangement, et il n'y a qu'une donnée derrière.
 */
export function familleDeCategorie(c: CategoriePartie | 'a_repartir' | undefined): FamilleDestinataire {
  /* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — `ancien_locataire` TRAVERSE TEL QUEL, comme les trois autres : la famille
     de la capsule EST la catégorie du bloc Parties, et c'est ce qui garantit qu'elles ne pourront pas diverger. */
  if (c === 'proprietaire' || c === 'locataire' || c === 'ancien_locataire' || c === 'independant') return c;
  return 'exterieur';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES CATÉGORIES DU BLOC PARTIES, ÉCRITES UNE SEULE FOIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ARNO : « lue par EXACTEMENT le même calcul que celui qui remplit ce bloc. Pas de seconde requête qui reclasse à
   sa façon. »

   🔴 CE CALCUL EXISTAIT, MAIS PAS À UN SEUL ENDROIT. Sa moitié « fiche » vivait dans `Annuaire.tsx`, un composant
   de NAVIGATEUR — inaccessible à tout autre écran sans le recopier. Sa moitié « rangements » et la règle de
   fusion vivaient dans `HistoriqueDuBien.tsx`, un autre composant. Les deux sont descendues ici, et les deux
   écrans les importent : le bloc Parties et les capsules ne peuvent plus diverger, parce qu'ils lisent la même
   fonction.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * CE QU'IL FAUT D'UNE FICHE DE BIEN POUR EN TIRER SES PARTIES.
 *
 * ⚠️ STRUCTUREL ET `readonly`, ET NON `Pick<FicheLot, …>` : la fiche arrive d'une réponse JSON (la fenêtre des
 * pièces jointes) ou d'un état React (l'écran Annuaire), et les deux la tiennent en lecture seule. Un `Pick` du
 * type complet aurait exigé des tableaux mutables, pour une fonction qui ne fait que les lire.
 *
 * ⚠️ `FicheLot` RESTE IMPORTÉ EN TYPE SEUL, pour que ce contrat ne puisse pas s'écarter du sien : le compilateur
 * refuse `FicheLot` si l'une de ces quatre listes change de forme là-bas.
 */
export interface FicheAvecParties {
  proprietaires: readonly { contacts: readonly ContactAffiche[] }[];
  proprietaireContacts: readonly ContactAffiche[];
  occupants: readonly { contacts: readonly ContactAffiche[] }[];
  /**
   * 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — `sortie` EST DÉSORMAIS DANS LE CONTRAT, et c'est elle qui décide de la
   * couleur. Sans elle, cette fonction rangeait TOUTES les occupations (passées comprises) en « locataire », et
   * un ancien locataire portait le vert du locataire en place.
   */
  occupations: readonly { sortie: string | null; contacts: readonly ContactAffiche[] }[];
}

/** 🔴 LE GARDE : si `FicheLot` cesse de satisfaire ce contrat, la compilation le dit ici et nulle part ailleurs. */
export type _FicheLotSatisfaitLeContrat = FicheLot extends FicheAvecParties ? true : never;

/**
 * ══ 🔴 CE QUE LA **FICHE** DU BIEN SAIT DE SES PARTIES ═══════════════════════════════════════════════════════════
 *
 * Les propriétaires du bien donnent « Propriétaire » ; les occupants EN PLACE donnent « Locataire » ; les
 * occupations CLOSES donnent « Ancien locataire ». Tout le reste — assureur, syndic, artisan, voisin — n'est pas
 * connu d'ici.
 *
 * 🔴🔴 LOT ANCIENS-LOCATAIRES-VIOLET — C'EST **ICI** QUE LA RÈGLE UNIQUE S'APPLIQUE, et à un seul endroit.
 * `estAncienLocataire` (module `historiqueBien`, l'unique juge) sépare les deux, et toute la chaîne de couleurs
 * en découle sans rien savoir des baux : le liseré d'un mail, les traits de la frise, la pastille d'une adresse,
 * le liseré d'un groupe de pièces jointes et la capsule d'un statut d'envoi lisent cette carte, et elle seule.
 *
 * 🔴 CE QU'ELLE NE REND **PAS**. Elle ne connaît que les deux catégories que la fiche PORTE : la table
 * `gestion_message_adresse` a une colonne `partie` limitée à `proprietaire | locataire`. La troisième —
 * « Indépendant » — ne vit que dans `gestion_partie_categorie` (migration 304), lue par
 * `/api/admin/gestion/historique/parties`, et c'est `categoriesDuBien` qui fusionne les deux.
 *
 * ⚠️ LE PREMIER POSÉ GAGNE : une adresse partagée (un couple propriétaire-occupant) ne doit pas changer de groupe
 * selon l'ordre de lecture. Les propriétaires sont posés d'abord, exprès.
 * ⚠️ LES CLÉS SONT EN MINUSCULES : la table porte la forme canonique, et une comparaison sensible à la casse
 * aurait rangé « Jean.PONS@… » à l'écart alors que l'annuaire le connaît.
 */
export function categoriesDeLaFiche(f: FicheAvecParties): ReadonlyMap<string, CategoriePartie> {
  const m = new Map<string, CategoriePartie>();
  const poser = (contacts: readonly ContactAffiche[], c: CategoriePartie): void => {
    for (const x of contacts) {
      if (x.sorte !== 'email') continue;
      const a = x.valeur.trim().toLowerCase();
      if (a !== '' && !m.has(a)) m.set(a, c);
    }
  };
  for (const p of f.proprietaires) poser(p.contacts, 'proprietaire');
  poser(f.proprietaireContacts, 'proprietaire');
  /* ⚠️ LES OCCUPANTS EN PLACE SONT POSÉS **AVANT** LES OCCUPATIONS, et l'ordre compte ici plus qu'ailleurs : une
     personne qui a quitté le logement puis y est revenue porte les deux états, et c'est « en place » qui doit
     gagner. Le premier posé l'emporte (règle du dessus) — d'où cet ordre, qui n'est pas celui du hasard. */
  for (const p of f.occupants) poser(p.contacts, 'locataire');
  for (const o of f.occupations) poser(o.contacts, estAncienLocataire(o) ? 'ancien_locataire' : 'locataire');
  return m;
}


/**
 * ══ 🔴🔴 LA CARTE DES CATÉGORIES DU BIEN — LA FICHE L'EMPORTE SUR LES RANGEMENTS ════════════════════════════════
 *
 * ⚠️ DANS CETTE FUSION, LA FICHE GAGNE, et c'est voulu : un propriétaire ou un occupant de CETTE fiche est un
 * CLIENT, et aucun rangement de parties — fût-il « vérifié » — ne doit le faire basculer dans un autre groupe. Un
 * client n'est jamais un contact (règle d'Arno) ; la fiche est l'autorité sur les siens.
 *
 * ⚠️ C'EST LA RÈGLE QUI REMPLISSAIT DÉJÀ LE BLOC PARTIES (`categoriesFusionnees`, `HistoriqueDuBien`), descendue
 * ici mot pour mot. L'écrire une seconde fois pour les capsules aurait donné deux vérités sur la même personne.
 */
export function fusionnerCategories(
  deLaFiche: ReadonlyMap<string, CategoriePartie>,
  rangees: ReadonlyMap<string, CategoriePartie>,
): ReadonlyMap<string, CategoriePartie> {
  const m = new Map<string, CategoriePartie>(rangees);
  for (const [a, c] of deLaFiche) m.set(a, c);
  return m;
}

/**
 * LA MÊME FUSION, QUAND ON A LA FICHE PLUTÔT QUE SA CARTE.
 *
 * ⚠️ DEUX PORTES, UNE SEULE RÈGLE : l'écran « Historique du bien » reçoit la carte DÉJÀ calculée par la fiche
 * (elle lui est passée en propriété), tandis que la fenêtre des pièces jointes reçoit la fiche brute d'une
 * réponse JSON. Les deux doivent fusionner de la même façon — c'est `fusionnerCategories` qui le fait, et
 * celle-ci ne fait que lui préparer son premier argument.
 */
export function categoriesDuBien(
  fiche: FicheAvecParties | null,
  rangees: ReadonlyMap<string, CategoriePartie> = new Map(),
): ReadonlyMap<string, CategoriePartie> {
  return fusionnerCategories(fiche === null ? new Map() : categoriesDeLaFiche(fiche), rangees);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES FAMILLES D'UN MESSAGE SORTANT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une adresse à qui la pièce est partie, avec le champ par lequel elle l'a reçue. */
export interface AdresseDeFamille {
  /** « À », « Cc » ou « Cci » — les trois ne veulent pas dire la même chose, et la bulle les distingue. */
  champ: 'À' | 'Cc' | 'Cci';
  nom: string | null;
  adresse: string;
}

/** Une famille présente parmi les destinataires : son mot, son ton, son titre, et le détail de ses adresses. */
export interface FamilleVue {
  famille: FamilleDestinataire;
  ton: TonFamille;
  /** Le mot de la capsule. Écrit ici, jamais à l'écran. */
  mot: string;
  /** Le titre de la famille dans la bulle. */
  titre: string;
  adresses: AdresseDeFamille[];
}

/** Ce qu'il faut savoir d'un message pour en tirer ses familles. `cci` est facultatif : on ne l'a pas partout. */
export interface MessagePourFamilles {
  sens: 'recu' | 'envoye';
  a: readonly PersonneDuMail[];
  cc: readonly PersonneDuMail[];
  cci?: readonly PersonneDuMail[];
}

export interface ReglesFamilles {
  /** Nos adresses — `estAdresseInterne`, la règle centrale du dépôt. Jamais une liste de domaines recopiée. */
  estInterne: (adresse: string) => boolean;
  /** La boîte elle-même (`gestion@criterimmo.fr`), écartée des destinataires. Vient de la configuration. */
  adresseBoite: string;
}

/**
 * ══ 🔴🔴 LES FAMILLES DESTINATAIRES D'UN MESSAGE. PURE. ══════════════════════════════════════════════════════════
 *
 * Rend un tableau VIDE pour tout message reçu : la question ne se pose que pour nos envois (Arno, point 1).
 *
 * ⚠️ « À » PUIS « Cc » PUIS « Cci », et dans l'ordre des en-têtes à l'intérieur de chaque champ : c'est l'ordre
 * dans lequel on lit un en-tête de courrier, et le destinataire direct d'abord.
 *
 * ⚠️ UNE ADRESSE RÉPÉTÉE (en « À » puis en « Cc », ce qui arrive) N'EST COMPTÉE QU'UNE FOIS, au premier champ où
 * elle paraît : la bulle doit lister des gens, pas des lignes d'en-tête.
 *
 * ⚠️ UNE FAMILLE NE PARAÎT QU'UNE FOIS (Arno) : deux locataires destinataires donnent UNE capsule verte et deux
 * adresses dans la bulle. La question posée par la capsule est « vers qui », pas « combien ».
 */
export function famillesDestinataires(
  m: MessagePourFamilles,
  categories: ReadonlyMap<string, CategoriePartie>,
  regles: ReglesFamilles,
): FamilleVue[] {
  if (m.sens !== 'envoye') return [];
  const boite = regles.adresseBoite.trim().toLowerCase();
  const vues = new Set<string>();
  const par = new Map<FamilleDestinataire, AdresseDeFamille[]>();
  const poser = (p: PersonneDuMail, champ: 'À' | 'Cc' | 'Cci'): void => {
    const a = p.adresse.trim();
    const cle = a.toLowerCase();
    if (cle === '' || vues.has(cle) || cle === boite) return;
    vues.add(cle);
    /* 🔴 L'INTERNE PASSE AVANT LES PARTIES (Arno, priorité a). Sans cela, nos six fiches WIPPIMMO qui portent une
       de nos adresses feraient passer un mail entre collègues pour un envoi au propriétaire. */
    const famille: FamilleDestinataire = regles.estInterne(a)
      ? 'interne'
      : familleDeCategorie(categories.get(cle));
    par.set(famille, [...(par.get(famille) ?? []), { champ, nom: p.nom, adresse: a }]);
  };
  for (const p of m.a) poser(p, 'À');
  for (const p of m.cc) poser(p, 'Cc');
  for (const p of m.cci ?? []) poser(p, 'Cci');
  return ORDRE_FAMILLES
    .filter((f) => (par.get(f) ?? []).length > 0)
    .map((f) => ({
      famille: f, ton: TONS[f], mot: MOTS[f], titre: TITRES[f], adresses: par.get(f) ?? [],
    }));
}

/**
 * ══ 🔴 LA BULLE DU « i », EN TEXTE — pour l'attribut `title`, qui ne sait pas porter de balises ════════════════
 *
 * Arno : « une bulle liste toutes les adresses qui ont reçu cette pièce, GROUPÉES par famille avec le titre de
 * famille dans sa couleur. […] Adresses en entier, sans troncature. »
 *
 * 🔴 LA COULEUR NE PEUT PAS VIVRE DANS UN `title`, et c'est pour cela que l'écran rend AUSSI un vrai panneau :
 * celui-ci porte les titres en couleur, celui-là sert la souris. Les deux disent le même texte, et il est écrit
 * ici une seule fois — deux rédactions auraient fini par différer d'une adresse.
 *
 * ⚠️ LE NOM **ET** L'ADRESSE quand les deux existent : deux « Jean PONS » dans un dossier de famille ne se
 * distinguent que par elle. Sans nom, l'adresse seule — jamais un « (sans nom) » inventé.
 */
export function detailFamilles(familles: readonly FamilleVue[]): string {
  return familles
    .map((f) => `${f.titre} : ${f.adresses.map(mentionDansFamille).join(', ')}`)
    .join('\n');
}

/** « Jean PONS <jean@x.fr> », ou l'adresse seule. PURE. */
export function mentionAdresse(d: AdresseDeFamille): string {
  const nom = (d.nom ?? '').trim();
  return nom === '' ? d.adresse : `${nom} <${d.adresse}>`;
}

/**
 * ══ 🔴 LA MENTION DANS LA BULLE — ET LE CHAMP, QUAND IL N'EST PAS « À » ══════════════════════════════════════════
 *
 * Arno a donné le format de la bulle : « Propriétaire : a@x.fr », sans champ. Mais le champ EXISTAIT dans
 * l'ancienne info-bulle (« À : … », « Cc : … »), et le perdre serait un retrait — or « À » et « Cc » ne veulent
 * pas dire la même chose, et c'est parfois toute la question devant une pièce sensible.
 *
 * 🔴 LE COMPROMIS EST EXACT, ET IL NE DÉNATURE RIEN : un destinataire direct s'écrit comme Arno l'a écrit, sans
 * rien en plus ; une copie et une copie cachée le DISENT, entre parenthèses. Son exemple se rend donc au
 * caractère près, et l'information qui existait reste là.
 */
export function mentionDansFamille(d: AdresseDeFamille): string {
  return d.champ === 'À' ? mentionAdresse(d) : `${mentionAdresse(d)} (${d.champ})`;
}
