/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — À QUI EST DESTINÉ CE DOCUMENT ? ════════════════════════════════════════
 *
 * DÉCISION D'ARNO (01/10/2026) : « Les documents automatiques ne se rangent PAS par bien mais par PERSONNE : une
 * fiche propriétaire (quel que soit le nombre de personnes dedans) ou une fiche locataire. »
 *
 * ═══ CE QU'UNE « FICHE » EST, ET POURQUOI C'EST LA BONNE UNITÉ ══════════════════════════════════════════════════
 *
 * Une fiche = UNE ligne de l'annuaire, quel que soit le nombre de personnes dedans. Vérifié sur la base : une
 * indivision (« TEIXEIRA José et Marie-Alice ») occupe UNE ligne, pas deux. 308 fiches propriétaires, 510 fiches
 * locataires.
 *
 * 🔴 ET POURQUOI PAS LE BIEN. Mesuré : sur 1 729 documents destinés à un propriétaire à plusieurs biens, AUCUN ne
 * nomme un lot. Le contenu est derrière un lien WIPPIMMO qu'on n'ouvre pas ; un « Décompte N°222273 » est un
 * relevé de COMPTE, qui couvre par nature tous les biens de la fiche. Le ranger dans un logement serait inventer
 * une précision que le document n'a pas.
 *
 * 🔴 MODULE PUR : aucun import, aucune base, aucun réseau. Il reçoit les destinataires et l'annuaire, il décide.
 */

/** La règle qui NOMME ces liens, et la seule que la base accepte vers une fiche (migration 291). */
export const REGLE_DOCUMENT_AUTO = 'document_auto';

/** Une fiche de l'annuaire, réduite à ce qui sert ici. */
export interface FicheDestinataire {
  sorte: 'proprietaire' | 'locataire';
  /** La CLÉ de la fiche — celle qui survit à un réimport, jamais l'identifiant interne. */
  cle: string;
  libelle: string;
  /** Combien de biens la fiche porte. 0 ou 1 ⇒ document du bien ; 2 et plus ⇒ compte rendu multi-biens. */
  nbBiens: number;
}

/**
 * CE QU'ON SAIT D'UNE ADRESSE : les fiches dont elle est contact. Plusieurs quand une même adresse sert à deux
 * fiches (une personne à la fois propriétaire et locataire, un membre de deux indivisions).
 */
export type AnnuaireAdresses = ReadonlyMap<string, readonly FicheDestinataire[]>;

/** Pourquoi un document n'est pas attribuable. */
export type MotifNonAttribue =
  /** Aucun destinataire extérieur : le document n'est adressé qu'à nous (transfert interne). */
  | 'nos_adresses'
  /** Aucune des adresses n'est contact d'une fiche (garant, conjoint, adresse professionnelle). */
  | 'adresse_inconnue'
  /** Une même adresse appartient à plusieurs fiches. */
  | 'adresse_partagee'
  /** Les destinataires relèvent de fiches différentes. */
  | 'fiches_differentes';

export type Attribution =
  | { sorte: 'fiche'; fiche: FicheDestinataire; multiBiens: boolean }
  | { sorte: 'non_attribue'; motif: MotifNonAttribue };

/** Nos propres adresses : elles ne désignent personne. */
export function estNotreAdresse(adresse: string, nos: readonly string[]): boolean {
  const a = (adresse ?? '').trim().toLowerCase();
  if (a === '') return true;
  return nos.some((n) => {
    const x = n.trim().toLowerCase();
    return x.startsWith('@') ? a.endsWith(x) : a === x;
  });
}

/**
 * ══ 🔴🔴 À QUELLE FICHE CE DOCUMENT EST-IL DESTINÉ ? PUR. ═══════════════════════════════════════════════════════
 *
 * 🔴 UNE SEULE FICHE, OU RIEN. Arno : « seuls les documents dont la fiche destinataire est CERTAINE sont rangés
 * automatiquement ». Un document qu'on rangerait « à peu près » chez quelqu'un est pire qu'un document non rangé :
 * il donne une certitude fausse, et personne ne reviendra le vérifier.
 *
 * ⚠️ LES QUATRE MOTIFS DE REFUS SONT DISTINGUÉS, et ce n'est pas du luxe : ils appellent des gestes différents.
 * « adresse inconnue » se corrige en ajoutant une adresse à une fiche (et le document se range alors tout seul) ;
 * « fiches différentes » demande de trancher à la main.
 */
export function attribuer(o: {
  /** Les destinataires du document (`À :`), dans l'ordre. */
  destinataires: readonly string[];
  annuaire: AnnuaireAdresses;
  /** Nos adresses, en clair (`gestion@criterimmo.fr`) ou en domaine (`@criterimmo.fr`). */
  nosAdresses: readonly string[];
}): Attribution {
  const dehors = o.destinataires
    .map((a) => (a ?? '').trim().toLowerCase())
    .filter((a) => a !== '' && !estNotreAdresse(a, o.nosAdresses));
  if (dehors.length === 0) return { sorte: 'non_attribue', motif: 'nos_adresses' };

  const connues = dehors.map((a) => ({ a, f: o.annuaire.get(a) })).filter((x) => x.f !== undefined && x.f.length > 0);
  if (connues.length === 0) return { sorte: 'non_attribue', motif: 'adresse_inconnue' };

  const parCle = new Map<string, FicheDestinataire>();
  for (const x of connues) for (const f of x.f as readonly FicheDestinataire[]) parCle.set(`${f.sorte}:${f.cle}`, f);

  if (parCle.size > 1) {
    /**
     * Deux causes qui se ressemblent et qu'il faut séparer : UNE adresse qui appartient à deux fiches, ou DEUX
     * destinataires de fiches différentes. La première se corrige dans l'annuaire, la seconde à la main.
     */
    const uneAdressePlusieursFiches = connues.some((x) => (x.f as readonly FicheDestinataire[]).length > 1);
    return {
      sorte: 'non_attribue',
      motif: uneAdressePlusieursFiches && connues.length === 1 ? 'adresse_partagee' : 'fiches_differentes',
    };
  }

  const fiche = [...parCle.values()][0];
  /**
   * 🔴 « COMPTE RENDU MULTI-BIENS » : un propriétaire à plusieurs biens reçoit UN document pour l'ensemble. On le
   * range donc chez lui, SANS bien — c'est exactement la catégorie qu'Arno a nommée. Un locataire, lui, occupe un
   * logement à la fois : son document se rattache au bien occupé à la date d'envoi, et ce rattachement-là existe
   * déjà (le moteur le pose par l'adresse).
   */
  return { sorte: 'fiche', fiche, multiBiens: fiche.sorte === 'proprietaire' && fiche.nbBiens > 1 };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE SOUS-TYPE LISIBLE — « Quittance », « Décompte », « Relance »…
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE SOUS-TYPE D'UN DOCUMENT, tel qu'il s'affiche dans la fiche. PUR.
 *
 * 🔴 DES MOTS, PAS DES CODES. L'objet porte « RMH10 », « D20 », « R32 » — des codes du logiciel de gestion, que
 * personne ne lit. L'écran affiche « Assurance », « Préavis », « Mise en demeure ». Le code reste dans l'objet,
 * juste à côté : on traduit, on ne cache pas.
 */
export const SOUS_TYPES: readonly string[] = [
  'Quittance', 'Décompte', 'Avis d’échéance', 'Relance', 'Assurance', 'Préavis',
  'Taxe foncière', 'Régularisation', 'Revenus fonciers', 'Remboursement', 'Vie de l’agence', 'Autre',
];

export function sousTypeLisible(objet: string | null | undefined): string {
  const s = (objet ?? '').toLowerCase();
  if (/quittance/.test(s)) return 'Quittance';
  if (/d[ée]compte|relev[ée] de factures/.test(s)) return 'Décompte';
  if (/\brmh\d|attestation\s+(?:d.)?assurance|assurance habitation/.test(s)) return 'Assurance';
  if (/\bd\d{2}\b|pr[ée]avis/.test(s)) return 'Préavis';
  if (/taxe fonci/.test(s)) return 'Taxe foncière';
  if (/revenus fonciers|cerfa/.test(s)) return 'Revenus fonciers';
  if (/r[ée]gularisation de charges/.test(s)) return 'Régularisation';
  if (/remboursement|\brmbt\b/.test(s)) return 'Remboursement';
  if (/\br\d{2}\b|relance|mise en demeure|rappel locataire/.test(s)) return 'Relance';
  if (/bonne ann[ée]e|changement d.adresse|mise à jour de nos coordonn|\boffre\b/.test(s)) return 'Vie de l’agence';
  if (/\b(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s*20\d\d/
    .test(s)) return 'Avis d’échéance';
  return 'Autre';
}

/** L'objet d'un document, débarrassé du préfixe « Document CRITERIMMO - ». PUR. */
export function objetCourt(objet: string | null | undefined): string {
  let s = (objet ?? '').replace(/\s+/g, ' ').trim();
  for (let avant = ''; avant !== s;) {
    avant = s;
    s = s.replace(/^(?:re|r[ée]p(?:onse)?|fwd?|tr|fw)\s*(?:\[\d+\])?\s*:\s*/i, '');
  }
  return s.replace(/^document criterimmo\s*[-–—:]\s*/i, '').trim();
}

/** Les années présentes dans une liste de documents, de la plus récente à la plus ancienne. PUR. */
export function anneesDe(dates: readonly string[]): string[] {
  return [...new Set(dates.map((d) => (d ?? '').slice(0, 4)).filter((a) => /^\d{4}$/.test(a)))]
    .sort((a, b) => b.localeCompare(a));
}

/**
 * UN DOCUMENT TEL QUE LA FICHE L'AFFICHE. Déclaré ICI, dans le module PUR, et non dans le dépôt : l'écran est un
 * composant client, et importer un type depuis un module qui tire `pg` ferait entrer la base dans le navigateur.
 */
export interface DocumentDeFiche {
  messageId: number;
  filId: number;
  /** Date d'envoi, au format ISO court. */
  le: string;
  /** « Quittance », « Décompte », « Assurance »… — le mot, jamais le code. */
  sousType: string;
  /** L'objet, sans le préfixe « Document CRITERIMMO - ». */
  objet: string;
}

/** La phrase d'une fiche sans aucun document. Écrite une fois : l'écran ne doit pas l'inventer deux fois. */
export const AUCUN_DOCUMENT = 'Aucun document automatique';
