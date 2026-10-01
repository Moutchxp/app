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

/** La règle d'exclusion qui marque un « Document CRITERIMMO ». Déclarée ICI, dans le module PUR, pour que le
 *  moteur, la projection, les scripts et le garde-fou de la base partagent UNE seule définition. */
export const REGLE_EXCLUSION_DOCUMENT = 5;

/** Le marqueur que le logiciel de gestion met dans l'objet de tous ses envois automatiques. */
export const MARQUEUR_DOCUMENT = 'Document CRITERIMMO';

/**
 * ══ 🔴🔴 LOT DOCUMENTS-HORS-BIENS — « CE MAIL EST-IL UN DOCUMENT AUTOMATIQUE QUE NOUS AVONS ENVOYÉ ? » PUR ═════
 *
 * CONSTAT D'ARNO (01/10/2026), sur la fiche du lot 176 (25 rue Edith Cavell) : le bloc « Vie du bien » affichait
 * nos propres « Document CRITERIMMO » — quittances, avis mensuels, révisions — avec un badge « Auto ».
 *
 * RÈGLE D'ARNO : « Les “Document CRITERIMMO” concernent des PERSONNES, pas le bien. Ils vont UNIQUEMENT dans le
 * dossier “Documents automatiques” de la fiche locataire ou propriétaire. JAMAIS dans la fiche d'un bien, ni dans
 * “Vie du bien”, ni dans aucun historique ou compteur de bien. »
 *
 * 🔴 TROIS CONDITIONS, ET LES TROIS COMPTENT :
 *   ① c'est NOUS qui l'envoyons (`sens = 'envoye'`) — une RÉPONSE humaine à un document est du vrai courrier
 *     client, elle garde ses biens, et c'est une demande explicite d'Arno ;
 *   ② l'objet porte le marqueur, OU la règle d'exclusion n° 5 l'a écarté — les deux, parce qu'un document peut
 *     être visible (sorti en Réception par le lot précédent) sans cesser d'être un document ;
 *   ③ rien d'autre : ni l'adresse, ni la pièce jointe, ni le contenu n'entrent dans cette décision.
 *
 * ⚠️ `Re:` ET `Fwd:` SONT COMPRIS DANS LE MARQUEUR. Un « Fwd: Document CRITERIMMO — … » que NOUS transférons
 * reste un de nos documents ; c'est le `sens` qui fait la différence, jamais le préfixe.
 */
export function estDocumentEnvoye(m: {
  sens: string | null | undefined;
  objet: string | null | undefined;
  /** `exclu_par_regle_id` du message. `null` quand le document est visible dans la Réception. */
  exclusionRegleId?: number | null;
}): boolean {
  if ((m.sens ?? '') !== 'envoye') return false;
  if ((m.exclusionRegleId ?? 0) === REGLE_EXCLUSION_DOCUMENT) return true;
  return (m.objet ?? '').toLowerCase().includes(MARQUEUR_DOCUMENT.toLowerCase());
}

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

/** Par quoi la fiche a été reconnue. Deux voies, et l'écran comme le rapport doivent pouvoir les distinguer. */
export type VoieAttribution =
  /** L'adresse du destinataire est contact de la fiche. */
  | 'adresse'
  /** L'objet du mail porte le nom complet de la fiche, et d'une seule (décision d'Arno du 01/10/2026). */
  | 'nom';

export type Attribution =
  | {
    sorte: 'fiche'; fiche: FicheDestinataire; multiBiens: boolean; voie: VoieAttribution;
    /** Le document part chez le garant, et la fiche est celle du locataire garanti. */
    garant: boolean;
    /**
     * Ce qui avait fait échouer l'adresse, quand c'est le NOM qui a sauvé le document. `null` quand l'adresse a
     * suffi. Arno a demandé le détail « par cause » : sans ce report, on saurait combien de documents le nom
     * rattrape, jamais lesquels — et donc jamais si compléter l'annuaire suffirait à s'en passer.
     */
    motifAdresse: MotifNonAttribue | null;
  }
  | { sorte: 'non_attribue'; motif: MotifNonAttribue; garant: boolean };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE NOM DANS L'OBJET — DÉCISION D'ARNO DU 01/10/2026
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 METTRE DEUX NOMS SOUS LA MÊME FORME POUR LES COMPARER. PUR. ═════════════════════════════════════════════
 *
 * ARNO : « correspondance exacte du nom de la fiche, accents, casse et tirets indifférents ».
 *
 * On enlève donc, dans cet ordre : les accents (décomposition Unicode puis retrait des diacritiques), la casse,
 * puis TOUT ce qui n'est ni lettre ni chiffre — tirets et apostrophes compris, mais aussi la barre oblique et les
 * points. Une seule espace sépare les mots.
 *
 * ⚠️ POURQUOI SI LARGE. Les noms réels de l'annuaire contiennent `VALET / RAEPSAET Damien et Michelle`,
 * `BAGHUELOU Jean-René`, `POKROVSKAIA POLIVANOV Kristina et Lev`. Les objets, eux, écrivent parfois le même nom
 * sans la barre oblique ou sans le trait d'union. Normaliser moins, c'est perdre ces documents ; normaliser plus
 * (retirer les espaces, par exemple) ferait se toucher des noms qui n'ont rien à voir.
 */
export function normaliserNom(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Les noms de fiches, mis sous leur forme comparable. Une forme peut désigner PLUSIEURS fiches — c'est le point. */
export type IndexNoms = ReadonlyMap<string, readonly FicheDestinataire[]>;

/**
 * 🔴 UN NOM D'UN SEUL MOT N'EST PAS UN NOM. « Dupont » seul se retrouverait dans trop d'objets qui ne parlent pas
 * de lui ; il faut au moins deux mots (un patronyme et un prénom, ou une raison sociale composée) pour qu'une
 * correspondance veuille dire quelque chose. Mesuré : sur 818 fiches, 14 portent un nom d'un seul mot.
 */
export const MOTS_MINIMUM_POUR_UN_NOM = 2;

/** Range les fiches de l'annuaire par forme comparable de leur nom. PUR. */
export function indexerNoms(annuaire: AnnuaireAdresses): IndexNoms {
  const index = new Map<string, FicheDestinataire[]>();
  for (const fiches of annuaire.values()) {
    for (const f of fiches) {
      const n = normaliserNom(f.libelle);
      if (n === '' || n.split(' ').length < MOTS_MINIMUM_POUR_UN_NOM) continue;
      const deja = index.get(n) ?? [];
      if (!deja.some((x) => x.sorte === f.sorte && x.cle === f.cle)) index.set(n, [...deja, f]);
    }
  }
  return index;
}

/**
 * ══ 🔴🔴 QUELLES FICHES L'OBJET NOMME-T-IL ? PUR. ══════════════════════════════════════════════════════════════
 *
 * 🔴 LA COMPARAISON SE FAIT SUR DES MOTS ENTIERS, et c'est ce qui la rend sûre. L'objet et le nom sont normalisés,
 * puis entourés d'une espace : on cherche « ␣martin paul␣ » dans « ␣quittance martin paul mars 2026␣ ». Sans ces
 * deux espaces, la fiche « MARTIN Paul » serait reconnue dans « MARTINEZ Paula », ce qui rangerait un document
 * chez la mauvaise personne — exactement ce qu'on veut rendre impossible.
 *
 * ⚠️ PLUSIEURS FICHES PEUVENT ÊTRE NOMMÉES, et pas seulement parce que l'objet cite deux personnes : la fiche
 * « REAL Luis » serait aussi reconnue dans un objet qui nomme « REAL Luis Carlos ». Arno a tranché pour les deux
 * cas d'un seul mot : « si le nom correspond à plusieurs fiches → pas de certitude ». On ne choisit donc PAS le
 * nom le plus long — on rend tout ce qu'on a trouvé, et l'appelant refuse.
 */
export function fichesNommeesDans(objet: string | null | undefined, index: IndexNoms): FicheDestinataire[] {
  const o = ` ${normaliserNom(objet)} `;
  if (o.trim() === '') return [];
  const trouvees = new Map<string, FicheDestinataire>();
  for (const [nom, fiches] of index) {
    if (!o.includes(` ${nom} `)) continue;
    for (const f of fiches) trouvees.set(`${f.sorte}:${f.cle}`, f);
  }
  return [...trouvees.values()];
}

/**
 * ══ 🔴🔴 LES NOMS DE PERSONNES LUS DANS UN OBJET, SANS RIEN SAVOIR DE L'ANNUAIRE. PUR. ═════════════════════════
 *
 * ⚠️ CE N'EST PAS `fichesNommeesDans`, ET LA DIFFÉRENCE EST TOUT L'INTÉRÊT. L'autre fonction reconnaît des fiches
 * CONNUES ; celle-ci lit des noms que l'annuaire IGNORE — « Août 2025 BAROUK Alexis » quand aucune fiche ne
 * s'appelle BAROUK. C'est précisément ce qu'Arno demande dans sa liste : « noms lus dans les objets », pour savoir
 * qui se cache derrière une adresse inconnue et compléter l'annuaire.
 *
 * Un nom = un mot de TROIS LETTRES ou plus tout en capitales (le patronyme, tel que le logiciel de gestion
 * l'écrit), suivi des mots capitalisés qui le prolongent (le prénom). « BAROUK Alexis », « VALET RAEPSAET Damien ».
 *
 * 🔴 UN LEXIQUE DE SIGLES, SANS QUOI LA LISTE SE REMPLIT DE BRUIT. « MRH », « PNO », « RIB », « VIR » sont écrits
 * en capitales et ne désignent personne. La liste est courte et relevée sur les objets réels : mieux vaut laisser
 * passer un sigle rare que d'écarter un patronyme.
 */
const SIGLES_QUI_NE_SONT_PAS_DES_NOMS: readonly string[] = [
  // Sigles du logiciel de gestion et du métier
  'CRITERIMMO', 'MRH', 'RMH', 'PNO', 'RIB', 'DPR', 'VIR', 'GED', 'VISALE', 'TVA', 'SCI', 'SARL', 'SAS',
  'SCCV', 'EDF', 'GRDF', 'IBAN', 'BIC', 'EDL', 'EDLE', 'DPE', 'ERP', 'CAF', 'APL', 'SDC', 'ASL', 'CRG',
  'DDT', 'SEG', 'REN', 'TRX',
  // Mots courants que le logiciel écrit en capitales — ils ne désignent personne
  'ASSURANCE', 'BAIL', 'CAUTION', 'GARANT', 'OFFRE', 'EXCLUSIVE', 'BAILLEURS', 'INVESTISSEURS', 'RELANCE',
  'QUITTANCE', 'DECOMPTE', 'AVIS', 'RAPPEL', 'MISE', 'DEMEURE', 'DOCUMENT', 'FACTURE', 'TRAVAUX', 'DEVIS',
  'LOCATAIRE', 'PROPRIETAIRE', 'CHARGES', 'LOYER', 'PREAVIS', 'CONGE', 'ATTESTATION', 'REGULARISATION',
  'NOTIFICATION', 'DEMANDE', 'COMMANDE', 'ANNULATION', 'INTERVENTION', 'HONORAIRES', 'REMBOURSEMENT',
];

/**
 * ⚠️ LES MOIS ARRÊTENT UN NOM. Les objets s'écrivent « Novembre 2025 BAROUK Alexis » mais aussi « BAROUK Alexis
 * Novembre » : sans cette coupure, la seconde forme donne un nom par mois pour la même personne, et la liste
 * d'Arno se remplit de « BAROUK Alexis Octobre », « BAROUK Alexis Novembre »… pour un seul locataire.
 */
const MOIS: readonly string[] = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

export function nomsPropresDans(objet: string | null | undefined): string[] {
  const s = objetCourt(objet);
  if (s === '') return [];
  const trouves: string[] = [];
  // Le patronyme en capitales, accents compris ; puis les mots capitalisés qui suivent (le prénom).
  const re = /\b([A-ZÀ-ÖØ-Þ]{3,}(?:[ -][A-ZÀ-ÖØ-Þ]{2,})*)((?:[ -](?:[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]+))*)/g;
  for (const m of s.matchAll(re)) {
    // La tête peut compter plusieurs mots en capitales (« VALET RAEPSAET ») : aucun ne doit être un sigle.
    const motsTete = m[1].trim().split(/[ -]+/).filter((x) => !SIGLES_QUI_NE_SONT_PAS_DES_NOMS.includes(
      normaliserNom(x).toUpperCase()));
    if (motsTete.length === 0) continue;
    const queue: string[] = [];
    for (const mot of (m[2] ?? '').trim().split(/[ -]+/).filter((x) => x !== '')) {
      if (MOIS.includes(normaliserNom(mot))) break;
      queue.push(mot);
    }
    const complet = [...motsTete, ...queue].join(' ').trim();
    if (complet !== '' && !trouves.includes(complet)) trouves.push(complet);
  }
  return trouves;
}

/**
 * ══ 🔴 « FICHE PROBABLE » — UNE RESSEMBLANCE, JAMAIS UNE CERTITUDE. PUR. ═══════════════════════════════════════
 *
 * Les fiches qui PARTAGENT LE PATRONYME d'un nom lu dans un objet. « BAROUK Alexis » rapprochera la fiche
 * « BAROUK Alexandre » s'il en existe une.
 *
 * 🔴 CELA NE RANGE RIEN, ET NE DOIT JAMAIS RIEN RANGER. Ce rapprochement sert uniquement la liste qu'Arno
 * complétera à la main : c'est lui qui dira si BAROUK Alexis et BAROUK Alexandre sont la même personne. Le
 * rangement automatique, lui, n'accepte que la correspondance EXACTE du nom complet — et c'est ce qui le rend sûr.
 */
export function fichesProchesDe(nomLu: string, index: IndexNoms): FicheDestinataire[] {
  const patronyme = normaliserNom(nomLu).split(' ')[0] ?? '';
  if (patronyme.length < 3) return [];
  const proches = new Map<string, FicheDestinataire>();
  for (const [nom, fiches] of index) {
    if ((nom.split(' ')[0] ?? '') !== patronyme) continue;
    for (const f of fiches) proches.set(`${f.sorte}:${f.cle}`, f);
  }
  return [...proches.values()];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES DOCUMENTS DE GARANT — DÉCISION D'ARNO DU 01/10/2026
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 LES SOUS-TYPES « GARANT », RELEVÉS EN BASE (Arno a demandé la liste) ════════════════════════════════════
 *
 * Mesuré le 01/10/2026 sur les 28 275 « Document CRITERIMMO » envoyés — 222 documents au total, réponses et
 * transferts compris :
 *
 *     RMH21 — Notification garant Rappel simple MRH ........ 136
 *     RMH31 — Notification garant Mise en demeure MRH ....... 35
 *     R21   — Rappel garant ................................. 31
 *     R42   — Mise à l'huissier - Garant ..................... 1
 *     CAUTION GARANT ME ...................................... 1
 *     Acte de cautionnement VISALE ........................... 1
 *
 * ⚠️ LES CODES SEULS NE SUFFISENT PAS, et le mot seul non plus : on exige donc l'un OU l'autre. « R21 » pourrait
 * apparaître ailleurs ; « garant » aussi (dans « garantie décennale », d'où l'exclusion explicite plus bas).
 */
export const SOUS_TYPES_GARANT: readonly { code: string; libelle: string }[] = [
  { code: 'RMH21', libelle: 'Notification garant — rappel simple MRH' },
  { code: 'RMH31', libelle: 'Notification garant — mise en demeure MRH' },
  { code: 'R21', libelle: 'Rappel garant' },
  { code: 'R42', libelle: 'Mise à l’huissier — garant' },
];

/** La mention qu'un document de garant porte dans la fiche du locataire. Écrite une fois. */
export const MENTION_GARANT = 'envoyé au garant';

/**
 * CE DOCUMENT PART-IL CHEZ UN GARANT ? PUR.
 *
 * ⚠️ « GARANTIE » N'EST PAS « GARANT ». Une « garantie décennale », une « garantie locative » ou un « garantie de
 * loyers impayés » parlent d'un contrat, pas d'une personne qui se porte caution. La frontière de mot `\b` ne
 * suffit pas (« garantie » commence par « garant ») : il faut que le mot s'arrête là.
 */
export function estDocumentGarant(objet: string | null | undefined): boolean {
  const s = (objet ?? '').toLowerCase();
  if (/\bgarant(?!i)\w*/.test(s) && !/\bgarantie/.test(s)) return true;
  if (/\bcautionnement\b|\bcaution\b/.test(s)) return true;
  return SOUS_TYPES_GARANT.some((t) => new RegExp(`\\b${t.code.toLowerCase()}\\b`).test(s));
}

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
  /** L'objet du mail — c'est en lui qu'on cherche le nom quand l'adresse n'a pas suffi. */
  objet?: string | null;
  /** Les noms de fiches, indexés une fois pour toute la passe. Absent ⇒ la voie du nom n'est pas tentée. */
  indexNoms?: IndexNoms;
}): Attribution {
  const garant = estDocumentGarant(o.objet);
  const parAdresse = attribuerParAdresse(o);
  if (parAdresse.sorte === 'fiche') return { ...parAdresse, voie: 'adresse', garant, motifAdresse: null };

  /**
   * ══ 🔴🔴 LE REPLI PAR LE NOM — DÉCISION D'ARNO DU 01/10/2026 ═════════════════════════════════════════════════
   *
   * « Si l'objet contient le nom complet d'UNE SEULE fiche, le document est rangé dans cette fiche avec certitude,
   * même si l'adresse ne suffisait pas. Cela vaut pour les quatre causes, et aussi pour les transferts à nos
   * propres adresses. Si le nom correspond à plusieurs fiches → pas de certitude. »
   *
   * 🔴 LE NOM NE CONTREDIT JAMAIS L'ADRESSE : il n'est consulté QUE lorsque l'adresse n'a rien conclu. Une adresse
   * qui désigne une fiche est un fait ; un nom dans un objet est une lecture. Entre les deux, le fait gagne, et
   * l'ordre de ces deux appels est tout ce qui le garantit.
   *
   * ⚠️ IL S'APPLIQUE AUSSI À `nos_adresses`, c'est-à-dire aux transferts internes (« Fwd: Document CRITERIMMO —
   * Août 2026 POURALI Ehsan »), qu'Arno a nommés explicitement. Mesuré : 304 documents y sont gagnés.
   */
  if (o.indexNoms === undefined) return { ...parAdresse, garant };
  const nommees = fichesNommeesDans(o.objet, o.indexNoms);
  if (nommees.length !== 1) return { ...parAdresse, garant };

  const fiche = nommees[0];
  return {
    sorte: 'fiche', fiche, voie: 'nom', garant, motifAdresse: parAdresse.motif,
    multiBiens: fiche.sorte === 'proprietaire' && fiche.nbBiens > 1,
  };
}

/** L'attribution par la seule ADRESSE du destinataire — la règle d'origine, inchangée. PUR. */
function attribuerParAdresse(o: {
  destinataires: readonly string[];
  annuaire: AnnuaireAdresses;
  nosAdresses: readonly string[];
}): { sorte: 'fiche'; fiche: FicheDestinataire; multiBiens: boolean } | { sorte: 'non_attribue'; motif: MotifNonAttribue } {
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
  /**
   * 🔴 LE DOCUMENT EST PARTI CHEZ LE GARANT, et la fiche est celle du locataire garanti (décision d'Arno du
   * 01/10/2026). L'écran le DIT : sans la mention, la ligne se lirait « on a écrit au locataire », ce qui est faux
   * et change le sens d'une mise en demeure.
   */
  garant: boolean;
}

/** La phrase d'une fiche sans aucun document. Écrite une fois : l'écran ne doit pas l'inventer deux fois. */
export const AUCUN_DOCUMENT = 'Aucun document automatique';
