/**
 * ══ 🔴🔴 LOT EVENEMENTS-TABLEAU-DE-BORD — LE PORTEFEUILLE D'ÉVÉNEMENTS, EN CHIFFRES. Module PUR ═══════════════
 *
 * Aucune I/O, aucune base, aucun réseau, aucun React : importable depuis un `'use client'` sans risque (règle du
 * module depuis l'incident du 24/09/2026, consignée dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (09/10/2026) : un tableau de bord replié par défaut, et déplié : volumes, flux sur 12 mois,
 * délais (moyenne ET médiane), argent, points d'attention — « chacun avec son effectif (n = …) pour qu'un
 * chiffre bâti sur 2 événements ne passe pas pour une tendance ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ 🔴🔴 POURQUOI LE CALCUL VIT ICI, ET NON DANS LE SQL ══════════════════════════════════════════════════════
 *
 * Le SQL rend des FAITS — un événement, ses dates, ses montants — et ce module les PLIE en indicateurs. Deux
 * raisons, et la seconde est la vraie :
 *   ① une moyenne, une médiane et un effectif écrits en SQL ne s'éprouvent qu'avec une base ; écrits ici, ils
 *      s'éprouvent sur un jeu de dates connues, en mémoire, en une milliseconde ;
 *   ② un chiffre faux dans un tableau de bord ne se voit PAS. Personne ne recompte 12 mois de flux à la main.
 *      La seule défense est une épreuve qui tient chaque indicateur sur des données dont on connaît la réponse.
 *
 * ⚠️ LE VOLUME LE PERMET, et c'est mesuré : l'application compte 2 événements réels ce jour, 37 cartes
 * d'ouverture dans toute la base. Le jour où le portefeuille se comptera en dizaines de milliers, ce pli
 * descendra dans le SQL — et l'épreuve, elle, restera valable pour l'arbitrer.
 */

import { TYPES_EVENEMENT, NIVEAUX_URGENCE } from './evenementQualite';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES FAITS — ce que le serveur rend, un enregistrement par événement
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Les faits d'UN événement. Toutes les dates sont des instants ISO (ce que `pg` rend), ou `null` quand le fait
 * n'a pas eu lieu.
 *
 * 🔴 CE SONT LES DATES DES CARTES, et non leur horodatage de création (Arno). La distinction n'est pas théorique :
 * une carte « Devis reçu » posée aujourd'hui pour un devis du 12 septembre doit compter au 12 septembre, sinon
 * tous les délais se tassent vers zéro à mesure qu'on rattrape la saisie.
 */
export interface FaitsEvenement {
  id: number;
  /** La catégorie de l'événement (`travaux`, `fuite_eau`…), ou `null` : « non précisé ». */
  type: string | null;
  /** Le niveau d'urgence (`normale`, `haute`, `urgent`), ou `null` : aucun niveau enregistré. */
  urgence: string | null;
  /** Ouvert AU SENS DE LA FRISE (lot ETAT-PAR-LA-FRISE) : il reste une période sans borne haute. */
  ouvert: boolean;
  /** La PREMIÈRE borne ouvrante — le début de la première période. C'est « l'ouverture » de tous les délais. */
  ouvertureLe: string | null;
  /** La DERNIÈRE borne fermante quand l'événement est clos, `null` sinon. */
  clotureLe: string | null;
  /** La première carte « Devis reçu ». */
  premierDevisLe: string | null;
  /** La première carte « Devis accepté ». */
  acceptationLe: string | null;
  /** La première carte d'intervention (« Intervention » ou « Rendez-vous eu lieu »). */
  interventionLe: string | null;
  /** Montant cumulé des devis reçus QUI ATTENDENT encore (ni acceptés ni refusés après eux). */
  montantAttenteCents: number;
  /** Montant cumulé des devis reçus SUIVIS d'une acceptation. */
  montantAccepteCents: number;
  /** Combien de devis en attente (des CARTES, pas des événements). */
  nbDevisEnAttente: number;
  /** Combien de devis acceptés (cartes). */
  nbDevisAcceptes: number;
  /** Combien de devis refusés (cartes). */
  nbDevisRefuses: number;
  /** Combien de cartes « Réouverture » : un événement rouvert au moins une fois en porte au moins une. */
  nbReouvertures: number;
  /** La carte vive la plus récente de la frise — à défaut, l'ouverture. C'est le signal « des nouvelles ». */
  derniereActiviteLe: string | null;
  /** Une mission Monga est reliée à cet événement (lien vif). */
  avecMonga: boolean;
  /** Un bien (lot) est rattaché à l'événement. */
  avecBien: boolean;
}

/** Une période d'ouverture : `au === null` = encore ouverte. Le pli de `etatParLaFrise`, tel quel. */
export interface PeriodeEvenement {
  evenementId: number;
  du: string;
  au: string | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES INDICATEURS — ce que l'écran affiche
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Un délai : son effectif, sa moyenne et sa médiane, en JOURS.
 *
 * 🔴🔴 `n` N'EST PAS DÉCORATIF, c'est la demande même d'Arno : « chacun avec son effectif (n = …) pour qu'un
 * chiffre bâti sur 2 événements ne passe pas pour une tendance ». Un délai sans son effectif est une opinion.
 *
 * ⚠️ `null` QUAND `n === 0`, JAMAIS `0` : « pas encore de données » et « zéro jour » sont deux choses, et c'est
 * la seconde qu'un `0` ferait lire. Arno l'écrit en toutes lettres : « afficher “— (pas encore de données)”
 * plutôt qu'un 0 trompeur ».
 */
export interface Delai {
  n: number;
  moyenneJours: number | null;
  medianeJours: number | null;
}

/** Les quatre délais demandés, pour un ensemble d'événements. */
export interface Delais {
  premierDevis: Delai;
  acceptation: Delai;
  intervention: Delai;
  cloture: Delai;
}

/** Un compte nommé : la brique de toutes les répartitions. `cle` sert aussi de filtre au clic. */
export interface CompteNomme {
  cle: string;
  mot: string;
  n: number;
}

/** Un mois du flux : combien d'événements s'y sont ouverts, combien s'y sont clos. */
export interface MoisDuFlux {
  /** `AAAA-MM`, en heure de Paris. */
  mois: string;
  /** « oct. 2026 » — écrit ici pour que l'écran n'ait pas à refaire le calendrier. */
  mot: string;
  /**
   * 🔴 LE MOT COURT DE L'AXE : « oct. », et « janv. 26 » au passage d'année.
   *
   * VU À L'ÉCRAN : douze fois « oct. 2026 » sous douze colonnes de 22 px se chevauchent en une bouillie
   * illisible. L'année ne se répète donc qu'au moment où elle change — c'est la convention de tous les axes
   * de temps, et elle dit plus en prenant moins de place.
   */
  motCourt: string;
  ouverts: number;
  clos: number;
}

/**
 * ══ 🔴🔴 CHAQUE CHIFFRE CLIQUABLE EMPORTE LA LISTE DE CE QU'IL COMPTE ═══════════════════════════════════════
 *
 * ARNO : « Chaque chiffre du point a), d), e) est CLIQUABLE et applique le filtre correspondant. »
 *
 * 🔴 LE FILTRE EST UN ENSEMBLE D'IDENTIFIANTS, ET NON UN PRÉDICAT RECOPIÉ. C'est le seul moyen que le chiffre
 * et la liste qu'il ouvre disent la MÊME chose : si « 4 devis en attente » et le filtre « Devis en attente »
 * étaient deux calculs, ils finiraient par différer d'un — et c'est le tableau de bord qu'on croirait faux.
 * Ici, le chiffre EST la taille de l'ensemble, par construction.
 *
 * ⚠️ LE VOLUME LE PERMET, et c'est le même argument que pour le pli : 2 événements réels aujourd'hui. Le jour
 * où le portefeuille se comptera en dizaines de milliers, ces listes deviendront des prédicats SQL — et le
 * chiffre devra alors être compté par la même requête, sous peine de rouvrir exactement ce défaut-là.
 */
export type IdsParFiltre = Record<string, number[]>;

/** La clé de filtre d'une répartition : `type:travaux`, `urgence:urgent`… Écrite une fois, lue des deux côtés. */
export function cleFiltreType(cle: string): string { return `type:${cle}`; }
export function cleFiltreUrgence(cle: string): string { return `urgence:${cle}`; }

export interface TableauBordEvenements {
  /** Pour chaque chiffre cliquable, les événements qu'il compte. Voir l'encadré de `IdsParFiltre`. */
  idsParFiltre: IdsParFiltre;
  volumes: {
    enCours: number;
    clos: number;
    total: number;
    parType: CompteNomme[];
    parUrgence: CompteNomme[];
    avecMonga: number;
    sansMonga: number;
  };
  flux: MoisDuFlux[];
  delais: {
    global: Delais;
    parType: { cle: string; mot: string; delais: Delais }[];
  };
  argent: {
    attenteCents: number;
    attenteN: number;
    accepteCents: number;
    accepteN: number;
    refusesN: number;
  };
  attention: {
    devisEnAttente: number;
    sansNouvelles: number;
    infosManquantes: number;
    reouvertures: number;
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES RÈGLES NOMMÉES — chacune écrite une fois, et éprouvable séparément
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 « SANS NOUVELLES DEPUIS PLUS DE 15 JOURS » ════════════════════════════════════════════════════════════
 *
 * Le seuil est ici, nommé, et non répété dans trois conditions. Arno l'écrit « > 15 j » : c'est STRICTEMENT
 * plus de 15 jours — à 15 jours pile, l'événement n'y est pas encore.
 */
export const SEUIL_SANS_NOUVELLES_JOURS = 15;

/**
 * Un événement OUVERT dont la dernière carte remonte à plus de 15 jours. PUR.
 *
 * ⚠️ UN ÉVÉNEMENT CLOS N'EST JAMAIS « SANS NOUVELLES » : on n'en attend plus. Sans cette condition, la liste se
 * remplirait de dossiers réglés et cesserait d'être regardée — c'est ainsi que meurt un indicateur d'attention.
 */
export function sansNouvelles(f: FaitsEvenement, maintenant: Date): boolean {
  if (!f.ouvert) return false;
  const repere = f.derniereActiviteLe ?? f.ouvertureLe;
  if (repere === null) return false;
  return ecartJours(repere, maintenant.toISOString()) > SEUIL_SANS_NOUVELLES_JOURS;
}

/**
 * ══ 🔴🔴 « INFOS MANQUANTES » — LA DÉFINITION EST ICI, ET ELLE EST ÉCRITE ═══════════════════════════════════
 *
 * Arno nomme l'indicateur sans le définir. Trois manques se constatent SANS INTERPRÉTATION, et chacun empêche
 * un geste réel :
 *   · pas de TYPE → l'événement n'entre dans aucune répartition, et sa capsule reste muette ;
 *   · pas d'URGENCE → rien ne dit s'il faut s'en occuper aujourd'hui (« Aucun niveau enregistré ») ;
 *   · pas de BIEN rattaché → on ne sait pas de quel logement il s'agit, et la fiche du bien ne le montrera pas.
 *
 * 🔴 CE QU'ON N'Y MET PAS, ET POURQUOI : ni le demandeur ni l'adresse libre. Le bien rattaché porte déjà
 * l'adresse, et une adresse libre vide sur un événement rattaché n'est pas un manque — c'est un doublon qu'on
 * s'épargne. Compter un champ facultatif comme manquant ferait un indicateur qui ne descend jamais à zéro, et
 * qu'on cesse donc de regarder.
 */
export function infosManquantes(f: FaitsEvenement): boolean {
  return f.type === null || f.urgence === null || !f.avecBien;
}

/** L'écart en jours entre deux instants ISO. Négatif possible — ce n'est pas à cette fonction d'en juger. */
export function ecartJours(du: string, au: string): number {
  return (Date.parse(au) - Date.parse(du)) / 86_400_000;
}

/**
 * La moyenne et la médiane d'une série, arrondies au dixième de jour. PUR.
 *
 * 🔴 LA MÉDIANE EST DEMANDÉE À CÔTÉ DE LA MOYENNE, et ce n'est pas un ornement : sur douze dossiers dont un
 * traîne depuis huit mois, la moyenne dit « 70 jours » et la médiane « 9 ». Les deux sont vraies ; une seule
 * décrit le travail ordinaire. Les montrer ensemble est la seule façon de ne pas choisir à la place du lecteur.
 *
 * ⚠️ SÉRIE VIDE ⇒ `null`, JAMAIS `0` : voir l'encadré de `Delai`.
 */
export function delaiDe(valeurs: readonly number[]): Delai {
  const n = valeurs.length;
  if (n === 0) return { n: 0, moyenneJours: null, medianeJours: null };
  const somme = valeurs.reduce((a, b) => a + b, 0);
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(n / 2);
  const mediane = n % 2 === 1 ? triees[milieu] : (triees[milieu - 1] + triees[milieu]) / 2;
  return { n, moyenneJours: arrondiDixieme(somme / n), medianeJours: arrondiDixieme(mediane) };
}

/** Un dixième de jour, soit environ deux heures et demie : la précision qu'un délai mérite, et pas plus. */
function arrondiDixieme(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Le mois d'un instant, en heure de Paris : `AAAA-MM`. */
export function moisDe(iso: string): string {
  const d = new Date(iso);
  /* ⚠️ `fr-CA` REND « AAAA-MM-JJ », ce qui se tronque sans ambiguïté — `fr-FR` rendrait « JJ/MM/AAAA ». Le
     fuseau est NOMMÉ : un mois calculé en UTC classerait le 1er octobre à 00h30 de Paris dans septembre. */
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).slice(0, 7);
}

/** « oct. 2026 » — le mot d'un mois `AAAA-MM`, pour l'info-bulle et le libellé accessible. */
export function motDuMois(mois: string): string {
  const [a, m] = mois.split('-');
  const d = new Date(Date.UTC(Number(a), Number(m) - 1, 15, 12));
  return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: 'short' });
}

/**
 * Le mot COURT de l'axe : « oct. », et « janv. 26 » quand l'année change (ou pour le premier mois montré).
 *
 * ⚠️ `premier` EXISTE POUR QUE L'AXE NE COMMENCE PAS SANS ANNÉE : sur douze mois glissants, la colonne la plus
 * à gauche appartient souvent à l'année d'avant, et rien ne le dirait.
 */
export function motCourtDuMois(mois: string, premier = false): string {
  const [a, m] = mois.split('-');
  const d = new Date(Date.UTC(Number(a), Number(m) - 1, 15, 12));
  const court = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', month: 'short' });
  return (m === '01' || premier) ? `${court} ${a.slice(2)}` : court;
}

/**
 * Les douze mois glissants qui se terminent par celui de `maintenant`, du plus ancien au plus récent.
 *
 * ⚠️ DOUZE MOIS GLISSANTS, ET NON L'ANNÉE CIVILE : en janvier, une année civile ne montrerait qu'un mois. C'est
 * ce qu'Arno demande (« sur 12 mois glissants »), et c'est la seule forme qui dit toujours la même chose.
 */
export function douzeMois(maintenant: Date): string[] {
  const mois: string[] = [];
  const courant = moisDe(maintenant.toISOString());
  const [a, m] = courant.split('-').map(Number);
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(a, m - 1 - i, 15, 12));
    mois.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return mois;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE PLI — des faits aux indicateurs
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le délai entre l'ouverture et un jalon, quand les deux existent et que le jalon ne précède pas l'ouverture. */
function delaiVers(f: FaitsEvenement, jalon: string | null): number | null {
  if (f.ouvertureLe === null || jalon === null) return null;
  const j = ecartJours(f.ouvertureLe, jalon);
  /* ⚠️ UN JALON ANTÉRIEUR À L'OUVERTURE EST ÉCARTÉ, et c'est une décision : il existe (une carte peut porter
     n'importe quelle date, saisie à la main), mais un délai négatif n'a pas de sens dans une moyenne — il
     tirerait les chiffres vers le bas sans que rien ne le signale. Il est compté nulle part plutôt que faux. */
  return j < 0 ? null : j;
}

function delaisDe(faits: readonly FaitsEvenement[]): Delais {
  const serie = (jalon: (f: FaitsEvenement) => string | null): Delai =>
    delaiDe(faits.map((f) => delaiVers(f, jalon(f))).filter((v): v is number => v !== null));
  return {
    premierDevis: serie((f) => f.premierDevisLe),
    acceptation: serie((f) => f.acceptationLe),
    intervention: serie((f) => f.interventionLe),
    cloture: serie((f) => f.clotureLe),
  };
}

/** Le mot d'un type d'événement, « Non précisé » pour la clé vide. */
export const CLE_SANS_TYPE = 'sans_type';
export const CLE_SANS_URGENCE = 'sans_urgence';

/**
 * LE TABLEAU DE BORD, à partir des faits et des périodes. PUR.
 *
 * ⚠️ `maintenant` EST UN PARAMÈTRE, jamais `new Date()` pris au vol : c'est ce qui rend « sans nouvelles » et
 * « 12 mois glissants » éprouvables, et c'est la convention de tout le module.
 */
export function tableauBordEvenements(
  faits: readonly FaitsEvenement[],
  periodes: readonly PeriodeEvenement[],
  maintenant: Date,
): TableauBordEvenements {
  const mois = douzeMois(maintenant);
  const ouvertsParMois = new Map<string, number>();
  const closParMois = new Map<string, number>();
  for (const p of periodes) {
    const mo = moisDe(p.du);
    ouvertsParMois.set(mo, (ouvertsParMois.get(mo) ?? 0) + 1);
    if (p.au !== null) {
      const mc = moisDe(p.au);
      closParMois.set(mc, (closParMois.get(mc) ?? 0) + 1);
    }
  }

  /**
   * 🔴 CHAQUE ENSEMBLE EST POSÉ ICI, À CÔTÉ DU CHIFFRE QU'IL EXPLIQUE, et c'est ce qui les tient égaux : le
   * chiffre affiché est la LONGUEUR de la liste enregistrée, jamais un second comptage.
   */
  const ids: IdsParFiltre = {};
  const retenir = (cle: string, predicat: (f: FaitsEvenement) => boolean): number => {
    const liste = faits.filter(predicat).map((f) => f.id);
    ids[cle] = liste;
    return liste.length;
  };

  const parCle = (liste: readonly { cle: string; mot: string }[], sans: { cle: string; mot: string },
    valeur: (f: FaitsEvenement) => string | null, cleFiltre: (c: string) => string): CompteNomme[] => [
    ...liste.map((t) => ({ cle: t.cle, mot: t.mot, n: retenir(cleFiltre(t.cle), (f) => valeur(f) === t.cle) })),
    { ...sans, n: retenir(cleFiltre(sans.cle), (f) => valeur(f) === null) },
  ];

  const volumes = {
    enCours: retenir('encours', (f) => f.ouvert),
    clos: retenir('clos', (f) => !f.ouvert),
    total: retenir('tous', () => true),
    parType: parCle(TYPES_EVENEMENT, { cle: CLE_SANS_TYPE, mot: 'Non précisé' }, (f) => f.type, cleFiltreType),
    parUrgence: parCle(
      NIVEAUX_URGENCE.map((n) => ({ cle: n.cle, mot: n.mot })),
      { cle: CLE_SANS_URGENCE, mot: 'Aucun niveau' }, (f) => f.urgence, cleFiltreUrgence,
    ),
    avecMonga: retenir('monga', (f) => f.avecMonga),
    sansMonga: retenir('sans-monga', (f) => !f.avecMonga),
  };
  const attention = {
    /* 🔴 DES ÉVÉNEMENTS, ET NON DES CARTES : « 4 devis en attente » dans la ligne de synthèse doit désigner
       quatre DOSSIERS à relancer. Le nombre de cartes, lui, vit dans le bloc « Argent », à côté du montant. */
    devisEnAttente: retenir('devis-attente', (f) => f.nbDevisEnAttente > 0),
    sansNouvelles: retenir('sans-nouvelles', (f) => sansNouvelles(f, maintenant)),
    infosManquantes: retenir('infos-manquantes', (f) => infosManquantes(f)),
    reouvertures: retenir('reouverts', (f) => f.nbReouvertures > 0),
  };
  /* Les deux ensembles de l'argent : ils n'ont pas de chiffre d'événements à eux, mais le clic les demande. */
  retenir('devis-acceptes', (f) => f.nbDevisAcceptes > 0);
  retenir('devis-refuses', (f) => f.nbDevisRefuses > 0);

  return {
    idsParFiltre: ids,
    volumes,
    flux: mois.map((m, i) => ({
      mois: m, mot: motDuMois(m), motCourt: motCourtDuMois(m, i === 0),
      ouverts: ouvertsParMois.get(m) ?? 0,
      clos: closParMois.get(m) ?? 0,
    })),
    delais: {
      global: delaisDe(faits),
      /* ⚠️ LES TYPES SANS AUCUN ÉVÉNEMENT SORTENT DE LA LISTE : quatre colonnes de tirets n'apprennent rien, et
         font défiler. Le type « non précisé », lui, reste s'il est peuplé — c'est une information. */
      parType: [...TYPES_EVENEMENT, { cle: CLE_SANS_TYPE, mot: 'Non précisé' }]
        .map((t) => ({
          cle: t.cle, mot: t.mot,
          faits: faits.filter((f) => (f.type ?? CLE_SANS_TYPE) === t.cle),
        }))
        .filter((t) => t.faits.length > 0)
        .map((t) => ({ cle: t.cle, mot: t.mot, delais: delaisDe(t.faits) })),
    },
    argent: {
      attenteCents: faits.reduce((s, f) => s + f.montantAttenteCents, 0),
      attenteN: faits.reduce((s, f) => s + f.nbDevisEnAttente, 0),
      accepteCents: faits.reduce((s, f) => s + f.montantAccepteCents, 0),
      accepteN: faits.reduce((s, f) => s + f.nbDevisAcceptes, 0),
      refusesN: faits.reduce((s, f) => s + f.nbDevisRefuses, 0),
    },
    attention,
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA LIGNE REPLIÉE — une phrase, et c'est tout ce qu'on voit par défaut
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 CETTE RÉPONSE EST-ELLE UN TABLEAU DE BORD ? ════════════════════════════════════════════════════════
 *
 * 🔴 TROUVÉ EN ÉPROUVANT, ET C'ÉTAIT GRAVE : l'écran acceptait TOUT ce que la route rendait, et appelait
 * `ligneDeSynthese` dessus. Une réponse d'une autre forme — une route qui change, une doublure de test, un
 * intermédiaire qui rend du JSON à lui — et c'est `Cannot read properties of undefined` : LA PAGE ENTIÈRE
 * tombe, pour un panneau de chiffres qu'on aurait très bien pu ne pas afficher.
 *
 * 🔴 ON VÉRIFIE LA FORME, PAS LE CONTENU : les cinq blocs attendus, et un nombre là où il doit y en avoir un.
 * Cela suffit à garantir que tout ce que l'écran lit ensuite existe, sans réécrire le type en vérifications.
 *
 * ⚠️ UNE RÉPONSE REFUSÉE N'EST PAS UNE ERREUR SILENCIEUSE : l'écran affiche « Tableau de bord indisponible »,
 * ce qui est vrai, et le reste de la page continue de fonctionner.
 */
export function estTableauBord(v: unknown): v is TableauBordEvenements {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Partial<TableauBordEvenements>;
  return typeof d.volumes?.total === 'number'
    && Array.isArray(d.volumes.parType) && Array.isArray(d.volumes.parUrgence)
    && Array.isArray(d.flux)
    && typeof d.delais?.global?.premierDevis?.n === 'number' && Array.isArray(d.delais.parType)
    && typeof d.argent?.attenteCents === 'number'
    && typeof d.attention?.devisEnAttente === 'number'
    && typeof d.idsParFiltre === 'object' && d.idsParFiltre !== null;
}

/** Un jour écrit : « 6 j », « 6,4 j ». `null` ⇒ le tiret parlant, jamais un zéro. */
export function motJours(j: number | null): string {
  if (j === null) return '—';
  return `${j.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;
}

/** Le mot d'une donnée absente, écrit une fois pour tout l'écran. */
export const MOT_SANS_DONNEES = '— (pas encore de données)';

/**
 * La ligne de synthèse, telle qu'Arno l'a écrite :
 * « 12 en cours · 3 urgents · 4 devis en attente · 2 sans nouvelles > 15 j · ouverture → 1er devis : 6 j en
 * moyenne ». PUR.
 *
 * ⚠️ LE DERNIER MORCEAU DISPARAÎT QUAND IL N'Y A PAS DE DEVIS : une ligne qui se termine par « — en moyenne »
 * ferait douter du reste. Les quatre comptes, eux, restent toujours — un zéro compté est une information.
 */
export function ligneDeSynthese(tb: TableauBordEvenements): string {
  const urgents = tb.volumes.parUrgence.find((u) => u.cle === 'urgent')?.n ?? 0;
  const morceaux = [
    `${tb.volumes.enCours} en cours`,
    `${urgents} urgent${urgents > 1 ? 's' : ''}`,
    `${tb.attention.devisEnAttente} devis en attente`,
    `${tb.attention.sansNouvelles} sans nouvelles > ${SEUIL_SANS_NOUVELLES_JOURS} j`,
  ];
  const d = tb.delais.global.premierDevis;
  if (d.moyenneJours !== null) {
    morceaux.push(`ouverture → 1er devis : ${motJours(d.moyenneJours)} en moyenne`);
  }
  return morceaux.join(' · ');
}
