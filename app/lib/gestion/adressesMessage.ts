/**
 * MODULE « GESTION » — LOT DRIVE-2-bis : TOUTES LES ADRESSES D'UN MESSAGE. Module PUR (aucune base, aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE EST ÉCRIT POUR LES LOTS SUIVANTS AUTANT QUE POUR CELUI-CI. L'objectif annoncé est de reconstituer,
 * logement par logement, l'historique complet des échanges avec chaque partie — mails AVEC et SANS pièce jointe.
 * Il couvre donc TOUS les messages, et retient chaque adresse avec son RÔLE : qui écrit, à qui, qui est en copie,
 * où il faut répondre, et — quand le mail est un transfert — QUI L'AVAIT ÉCRIT AU DÉPART.
 *
 * 🔴 L'EXPÉDITEUR D'ORIGINE D'UN TRANSFERT EST LU DANS LE CORPS, ET PRUDEMMENT. Mesuré : 1 972 messages sur 56 802
 * portent un bloc de transfert. Ces mails-là sont précieux — c'est souvent par eux qu'un artisan ou un syndic
 * entre dans un dossier — mais le corps d'un mail n'est pas un en-tête : on n'y lit que ce qui ressemble
 * FRANCHEMENT à un bloc de transfert, et on s'abstient au moindre doute. Une adresse inventée ici rattacherait un
 * mail au mauvais logement, et personne ne le verrait.
 *
 * 🔴 NOS ADRESSES SONT RETENUES, MAIS MARQUÉES. `gestion@` est des deux côtés de presque tous les mails : s'en
 * servir comme clé rattacherait tout au même endroit. On les garde quand même — elles font partie de l'échange, et
 * le lot RATTACHEMENT-1 aura besoin de savoir qui a écrit à qui.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { normaliserEmail } from './annuaire';
import { DOMAINES_MAISON } from './triPieces';

export type RoleAdresse = 'expediteur' | 'destinataire' | 'copie' | 'repondre_a' | 'transfere';

export interface AdresseRelevee {
  adresse: string;
  /** Telle qu'elle était écrite, nom d'affichage compris. On n'invente rien, on n'efface rien. */
  adresseBrute: string;
  role: RoleAdresse;
  interne: boolean;
}

/** Ce qu'un message donne à lire. Les colonnes `dest_*` arrivent en JSON ; l'appelant les a déjà décodées. */
export interface MessageALire {
  de: string;
  destA: readonly string[];
  destCc: readonly string[];
  repondreA: readonly string[];
  corps: string;
}

// ── EXTRAIRE UNE ADRESSE D'UNE CHAÎNE ─────────────────────────────────────────────────────────────────────────────

/**
 * L'adresse contenue dans « Jean Dupont <jean@fictif.fr> », « <jean@fictif.fr> » ou « jean@fictif.fr ».
 *
 * ⚠️ ON PRÉFÈRE CE QUI EST ENTRE CHEVRONS quand il y en a : un nom d'affichage peut contenir une adresse
 * (« contact@ancien.fr (ne plus utiliser) <vrai@fictif.fr> ») et c'est la seconde qui vaut.
 */
export function adresseDe(brut: string): string | null {
  const s = (brut ?? '').trim();
  if (s === '') return null;
  const chevrons = /<([^<>]+)>\s*$/.exec(s) ?? /<([^<>]+)>/.exec(s);
  if (chevrons !== null) {
    const a = normaliserEmail(chevrons[1]);
    if (a !== null) return a;
  }
  const direct = normaliserEmail(s);
  if (direct !== null) return direct;
  // Dernier recours : la première chose qui ressemble à une adresse dans la chaîne.
  const trouve = /[^\s<>(),;:"]+@[^\s<>(),;:"]+\.[a-z]{2,}/i.exec(s);
  return trouve === null ? null : normaliserEmail(trouve[0]);
}

/** Une de NOS adresses ? Le partenaire interne (comptabilité externalisée) en fait partie : il est des deux côtés. */
export function estInterne(adresse: string, adresseGestion: string, partenaires: readonly string[] = []): boolean {
  const a = adresse.trim().toLowerCase();
  if (a === (adresseGestion ?? '').trim().toLowerCase()) return true;
  if (partenaires.some((p) => (p ?? '').trim().toLowerCase() === a)) return true;
  const domaine = a.slice(a.indexOf('@') + 1);
  return DOMAINES_MAISON.some((d) => domaine === d || domaine.endsWith(`.${d}`));
}

// ── LE BLOC DE TRANSFERT ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * LES MARQUEURS D'UN BLOC DE TRANSFERT, dans les formes que produisent Gmail, Outlook et Thunderbird, en français
 * comme en anglais. On ne cherche une adresse qu'APRÈS l'un d'eux.
 */
const MARQUEURS_TRANSFERT = [
  /-{2,}\s*(?:message\s+transf[ée]r[ée]|forwarded\s+message)\s*-{2,}/i,
  /^\s*-{5,}\s*message\s+d['’]origine\s*-{5,}/im,
  /^\s*d[ée]but\s+du\s+message\s+transf[ée]r[ée]\s*:/im,
  /^\s*-{5,}\s*original\s+message\s*-{5,}/im,
];

/**
 * Une ligne « De : … » qui suit un marqueur. On accepte « De », « From », « Expéditeur », avec ou sans accent,
 * suivis de deux-points — et RIEN d'autre : « Demande de devis » ne doit pas passer pour un expéditeur.
 */
const LIGNE_DE = /^\s*(?:de|from|exp[ée]diteur)\s*:\s*(.+)$/im;

/**
 * L'EXPÉDITEUR D'ORIGINE D'UN MAIL TRANSFÉRÉ, ou `null`.
 *
 * 🔴 TROIS CONDITIONS, TOUTES EXIGÉES, et c'est ce qui rend la lecture prudente :
 *   ① le corps porte un MARQUEUR de transfert reconnaissable ;
 *   ② une ligne « De : » suit ce marqueur (et non ailleurs dans le mail — une signature en contient parfois) ;
 *   ③ cette ligne contient une adresse lisible.
 * Au moindre manque, on rend `null`. Une adresse inventée ici rattacherait un mail au mauvais logement, et
 * personne ne s'en apercevrait — mieux vaut ne rien dire.
 *
 * ⚠️ ON NE LIT QUE LE PREMIER BLOC. Un fil transféré plusieurs fois en contient plusieurs, emboîtés ; le premier
 * est celui du transfert le plus récent, le seul dont on puisse affirmer qu'il a été transféré PAR ce message.
 */
export function expediteurTransfere(corps: string): { adresse: string; brut: string } | null {
  const texte = corps ?? '';
  if (texte.trim() === '') return null;

  let debut = -1;
  for (const m of MARQUEURS_TRANSFERT) {
    const trouve = m.exec(texte);
    if (trouve !== null && (debut < 0 || trouve.index < debut)) debut = trouve.index + trouve[0].length;
  }
  if (debut < 0) return null;

  // On ne regarde que les quelques lignes qui suivent le marqueur : au-delà, c'est le corps du mail transféré,
  // et une adresse y apparaît pour mille raisons qui n'en font pas l'expéditeur.
  const apres = texte.slice(debut, debut + 1200);
  const ligne = LIGNE_DE.exec(apres);
  if (ligne === null) return null;

  const brut = ligne[1].trim();
  const adresse = adresseDe(brut);
  return adresse === null ? null : { adresse, brut };
}

// ── LE RELEVÉ COMPLET ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * TOUTES LES ADRESSES D'UN MESSAGE, dédoublonnées par (adresse, rôle). PUR.
 *
 * ⚠️ UNE MÊME ADRESSE PEUT APPARAÎTRE SOUS DEUX RÔLES (expéditeur d'un mail, en copie d'un autre) : ce sont deux
 * faits différents, et on les garde tous les deux. Le dédoublonnage ne porte que sur le COUPLE.
 *
 * ⚠️ LE Cci N'EST PAS RELEVÉ. On ne sait pas s'il a été lu par son destinataire, et il n'apparaît pas dans le mail
 * reçu par les autres : le faire entrer dans l'historique d'un échange donnerait à voir ce que personne n'a vu.
 */
export function releverAdresses(
  m: MessageALire,
  adresseGestion: string,
  partenaires: readonly string[] = [],
): AdresseRelevee[] {
  const out: AdresseRelevee[] = [];
  const vus = new Set<string>();

  const ajouter = (brut: string, role: RoleAdresse): void => {
    const adresse = adresseDe(brut);
    if (adresse === null) return;
    const cle = `${adresse}|${role}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    out.push({
      adresse, adresseBrute: (brut ?? '').trim().slice(0, 320), role,
      interne: estInterne(adresse, adresseGestion, partenaires),
    });
  };

  ajouter(m.de, 'expediteur');
  for (const a of m.destA) ajouter(a, 'destinataire');
  for (const a of m.destCc) ajouter(a, 'copie');
  for (const a of m.repondreA) ajouter(a, 'repondre_a');

  const transfere = expediteurTransfere(m.corps);
  if (transfere !== null) ajouter(transfere.brut, 'transfere');

  return out;
}

// ── LA RECONNAISSANCE PAR L'ANNUAIRE ──────────────────────────────────────────────────────────────────────────────

export interface ContactConnu {
  email: string;
  role: 'proprietaire' | 'locataire';
  sujetId: number;
  /** Clé WIPPIMMO du propriétaire, quand c'en est un. */
  proprietaireCle?: string | null;
}

export interface OccupationConnue {
  locataireId: number;
  lotCle: string | null;
  proprietaireCle: string | null;
  entree: string | null;
  sortie: string | null;
}

export interface Reconnaissance {
  partie: 'proprietaire' | 'locataire' | null;
  proprietaireCle: string | null;
  locataireId: number | null;
  /** Le lot occupé À LA DATE DU MAIL. `null` si aucun bail ne couvre cette date, ou si l'adresse est inconnue. */
  lotCle: string | null;
  motif: string;
}

const INCONNUE: Reconnaissance = {
  partie: null, proprietaireCle: null, locataireId: null, lotCle: null, motif: 'adresse inconnue de l’annuaire',
};

/**
 * QUE DIT L'ANNUAIRE DE CETTE ADRESSE, À LA DATE DE CE MAIL ? PUR.
 *
 * 🔴 UNE ADRESSE INTERNE N'EST JAMAIS RECONNUE COMME UNE PARTIE, même si elle figure par accident dans l'annuaire.
 * Le motif le dit, pour qu'on ne cherche pas l'erreur ailleurs.
 *
 * 🔴 LA DATE DÉCIDE. Un locataire qui occupait le lot 100 en 2021 et le lot 101 depuis 2023 doit voir son mail de
 * 2021 rattaché au 100. S'il occupait PLUSIEURS lots ce jour-là, on ne choisit pas : `lotCle` reste nul et le
 * motif l'explique — la proposition de tri saura quoi en faire.
 */
export function reconnaitre(
  a: AdresseRelevee,
  dateMail: string,
  contacts: readonly ContactConnu[],
  occupations: readonly OccupationConnue[],
): Reconnaissance {
  if (a.interne) {
    return { ...INCONNUE, motif: 'adresse interne : jamais employée comme clé de rattachement' };
  }
  const trouves = contacts.filter((c) => c.email === a.adresse);
  if (trouves.length === 0) return INCONNUE;

  // Un propriétaire prime : c'est le rattachement le plus stable (un bailleur ne déménage pas de son bien).
  const proprio = trouves.find((c) => c.role === 'proprietaire');
  if (proprio !== undefined) {
    return {
      partie: 'proprietaire', proprietaireCle: proprio.proprietaireCle ?? null, locataireId: null, lotCle: null,
      motif: 'adresse d’un propriétaire',
    };
  }

  const loc = trouves[0];
  const jour = (dateMail ?? '').slice(0, 10);
  const siennes = occupations.filter((o) => o.locataireId === loc.sujetId && o.lotCle !== null);
  const aLaDate = siennes.filter((o) => {
    if (o.entree !== null && jour < o.entree.slice(0, 10)) return false;
    if (o.sortie !== null && jour > o.sortie.slice(0, 10)) return false;
    return true;
  });

  if (aLaDate.length === 1) {
    return {
      partie: 'locataire', proprietaireCle: aLaDate[0].proprietaireCle, locataireId: loc.sujetId,
      lotCle: aLaDate[0].lotCle, motif: 'locataire, et il occupait ce bien à la date du mail',
    };
  }
  if (aLaDate.length > 1) {
    const proprios = new Set(aLaDate.map((o) => o.proprietaireCle).filter((x): x is string => x !== null));
    return {
      partie: 'locataire', proprietaireCle: proprios.size === 1 ? [...proprios][0] : null,
      locataireId: loc.sujetId, lotCle: null,
      motif: `locataire de ${aLaDate.length} biens à cette date — aucun lot n’est tranché`,
    };
  }
  return {
    partie: 'locataire', proprietaireCle: null, locataireId: loc.sujetId, lotCle: null,
    motif: siennes.length === 0
      ? 'locataire sans aucun bail sur un lot géré'
      : 'locataire, mais aucun bail en cours à la date du mail',
  };
}
