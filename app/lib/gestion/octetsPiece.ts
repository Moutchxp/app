import { createHash } from 'node:crypto';

/**
 * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — LIRE LES OCTETS D'UNE PIÈCE REÇUE. UNE SEULE FONCTION, PARTOUT ════════════════════
 *
 * IMPUR quant aux I/O, mais tout est INJECTÉ : la DÉCISION — quelle source, dans quel ordre, quand refuser — est
 * éprouvable sans réseau, sans MinIO, sans Drive et sans Gmail.
 *
 * ═══ 🔴 CE QUE ÇA RÉPARE, ET CE QUI A ÉTÉ MESURÉ ════════════════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO, fil 3494 : transférer le mail avec ses 12 pièces rendait « Gmail a refusé l'envoi : Les pièces
 * jointes n'ont pas pu être lues : The specified key does not exist. »
 *
 * CAUSE ÉTABLIE, mesurée en base le 30/09/2026 : les 12 pièces de ce fil sont VIDÉES de MinIO
 * (`gestion_piece_vidage`) et possèdent toutes une copie Drive VÉRIFIÉE avec son empreinte. L'AFFICHAGE et le
 * TÉLÉCHARGEMENT savaient basculer sur cette copie (route `pieces/[id]`, depuis le lot DRIVE-3). Le chemin
 * d'ENVOI, lui, ne le savait pas : `depsPiecesEnvoi` câblait `octets: recuperer`, c'est-à-dire MinIO et rien
 * d'autre. Deux chemins pour la même question, un seul au courant du vidage.
 *
 * 🔴 D'OÙ CE MODULE : « lire les octets d'une pièce » s'écrit UNE fois, et tout le monde l'appelle. Une seconde
 * écriture, même juste aujourd'hui, redeviendrait fausse au prochain changement de stockage — et ne le dirait
 * pas plus que la première fois.
 *
 * ═══ L'ORDRE DE LECTURE, ET POURQUOI CET ORDRE ═════════════════════════════════════════════════════════════════
 *
 *   ① MINIO, s'il a encore l'objet. C'est la source d'origine, la plus rapide, et celle dont les octets n'ont
 *      jamais quitté la maison.
 *   ② LA COPIE DRIVE, dans NOTRE dossier « 00 Arrivée des mails », TAILLE ET EMPREINTE VÉRIFIÉES. C'est la copie
 *      que le vidage a exigée avant d'effacer : elle existe précisément pour ce cas.
 *   ③ EN DERNIER RECOURS, LA PIÈCE DU MESSAGE D'ORIGINE DANS GMAIL. Elle n'a pas bougé de la boîte ; elle coûte
 *      un rapatriement complet du message, d'où sa place en dernier.
 *
 * ═══ 🔒 CE QUE CE MODULE NE PEUT PAS FAIRE, PAR CONSTRUCTION ════════════════════════════════════════════════════
 *
 * 🔴🔴 IL NE PEUT PAS LIRE « Documents clients scannés ». L'identifiant Drive ne vient JAMAIS d'ici : il est
 * fourni par l'appelant, qui le tire de `gestion_piece_drive` avec `origine = 'copie'` ET `verifie_le IS NOT
 * NULL` — c'est-à-dire un fichier que le programme a lui-même créé dans « 00 Arrivée des mails ». Un dépôt
 * manuel dans un dossier client n'autorise aucune lecture de remplacement. La garantie ne tient pas à une
 * promesse mais à l'ORIGINE de l'identifiant, et une épreuve la vérifie.
 *
 * 🔒 LECTURE SEULE de bout en bout : aucune des trois sources n'est écrite, ni effacée, ni déplacée.
 *
 * ═══ 🔴 ET SI AUCUNE SOURCE NE RÉPOND : ON REFUSE, EN NOMMANT LA PIÈCE ══════════════════════════════════════════
 *
 * Jamais un envoi partiel. Jamais une pièce silencieusement absente. Le motif porte le NOM du fichier et dit
 * quelles sources ont été essayées — sans quoi « les pièces n'ont pas pu être lues » ne dit ni laquelle ni
 * pourquoi, ce qui est exactement le message qu'Arno a reçu.
 */

/** Ce qu'il faut savoir d'une pièce pour aller chercher ses octets. */
export interface PieceALire {
  /** L'identifiant de la pièce, pour le journal et les messages d'erreur. */
  pieceId: number | null;
  /** 🔴 LOT NOM-UNIQUE-DES-PIECES — le nom D'USAGE : c'est lui qu'on écrit dans un refus, parce que c'est lui
   *  qu'on voit à l'écran. Chercher « scan_0042.pdf » dans un message d'erreur quand on lit « Quittance » ne
   *  désigne rien pour la personne qui le lit. */
  nomFichier: string;
  /**
   * 🔴🔴 LE NOM D'ORIGINE, ET IL SERT À UNE SEULE CHOSE : retrouver la pièce dans le message Gmail. Gmail ne
   * permet pas de renommer une pièce jointe — là-bas, elle porte TOUJOURS le nom sous lequel elle est arrivée.
   * Y chercher le nom d'usage ne trouverait rien, et la pièce serait déclarée introuvable alors qu'elle est là.
   *
   * ⚠️ FACULTATIF : les appelants qui ne renomment pas (une pièce ajoutée à la main) n'en ont pas, et le dernier
   * recours retombe alors sur le nom d'usage — qui est le même.
   */
  nomOrigine?: string | null;
  /** La clé MinIO. `null` = la pièce n'a jamais été déposée sur le stockage objet. */
  cleStockage: string | null;
  /** MinIO a-t-il été VIDÉ de cet objet ? Vrai ⇒ on ne l'essaie même pas. */
  stockageVide: boolean;
  /**
   * 🔒 L'identifiant de NOTRE copie, dans « 00 Arrivée des mails ». L'appelant ne doit en fournir aucun autre :
   * voir l'encadré ci-dessus.
   */
  driveFileId: string | null;
  /** L'empreinte enregistrée à la copie. Comparée à ce que Drive rend — un fichier remplacé est REFUSÉ. */
  md5Attendu: string | null;
  /** La taille connue, en octets. Comparée elle aussi quand on l'a : deux gardes valent mieux qu'un. */
  tailleAttendue: number | null;
  /**
   * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — LE TYPE ANNONCÉ, second repère quand le nom ne désigne rien.
   *
   * ⚠️ FACULTATIF, et il ne sert QUE pour une pièce « (sans nom) » : une partie MIME sans nom ne peut pas être
   * retrouvée par son nom chez Gmail (voir le dernier recours). Absent ⇒ comportement d'avant ce lot.
   */
  typeMime?: string | null;
  /**
   * Le `Message-ID` RFC du message qui portait la pièce — l'ancre vers Gmail, pour le dernier recours.
   * `null` ⇒ ce recours n'est pas tenté (et le motif le dit).
   */
  messageIdRfc: string | null;
}

export type SourceOctets = 'minio' | 'drive' | 'gmail';

export type IssueOctetsPiece =
  | { ok: true; octets: Buffer; source: SourceOctets; md5: string }
  | { ok: false; motif: string; nomFichier: string; essais: string[] };

export interface DepsOctetsPiece {
  /** MinIO. Lève quand l'objet n'existe plus — c'est ce que fait `recuperer`. */
  minio(cle: string): Promise<Buffer>;
  /**
   * 🔒 NOTRE copie Drive, en lecture seule. Rend les octets ET l'empreinte RECALCULÉE sur ce qui a été reçu, pas
   * celle des métadonnées : c'est ce qui permet de refuser un fichier remplacé.
   */
  drive(driveFileId: string): Promise<{ ok: true; octets: Buffer; md5: string } | { ok: false; motif: string }>;
  /**
   * DERNIER RECOURS : la pièce nommée, dans le message d'origine tel qu'il est AUJOURD'HUI dans Gmail.
   * Absent ⇒ ce recours n'existe pas pour cet appelant, et le motif le dira.
   */
  gmail?(messageIdRfc: string, nomFichier: string, repere?: {
    typeMime?: string | null; taille?: number | null;
  }): Promise<Buffer | null>;
}

const md5De = (b: Buffer): string => createHash('md5').update(b).digest('hex');

/**
 * ══ LES OCTETS D'UNE PIÈCE, quelle que soit la source qui les a encore ══════════════════════════════════════════
 *
 * ⚠️ CHAQUE ÉCHEC EST NOTÉ ET RENDU. On n'arrête pas à la première source qui manque : on descend, et si l'on
 * arrive au bout on dit CE QU'ON A ESSAYÉ. Un refus qui ne dit pas ce qu'il a tenté oblige à rouvrir le code.
 */
export async function lireOctetsPiece(brute: PieceALire, deps: DepsOctetsPiece): Promise<IssueOctetsPiece> {
  const essais: string[] = [];

  /**
   * ══ ⚠️ « ABSENT » ET « NUL » SONT LA MÊME CHOSE ICI, ET IL FAUT L'ÉCRIRE ═══════════════════════════════════════
   *
   * Les appelants construisent la pièce depuis des sources variées — une ligne de base, un brouillon, un objet
   * assemblé à la main. Un champ OUBLIÉ y vaut `undefined`, pas `null`.
   *
   * 🔴 SANS CETTE NORMALISATION, `undefined` PRENAIT LA MAUVAISE BRANCHE, EN SILENCE : `p.driveFileId !== null`
   * est VRAI pour `undefined`, donc on partait lire le Drive avec un identifiant vide ; et `verifierTaille`
   * comparait la taille reçue à `undefined`, ce qui n'est jamais égal — toute pièce était donc déclarée de la
   * mauvaise taille et REFUSÉE. Le refus, lui, était parfaitement clair : « la taille ne correspond pas
   * (15 octets reçus, undefined attendus) ». C'est le genre de défaut qui ne se voit qu'une fois écrit.
   *
   * On ne durcit pas le type pour autant : `?? null` coûte une ligne et ferme la question pour tous les appelants,
   * présents et à venir.
   */
  const p: PieceALire = {
    pieceId: brute.pieceId ?? null,
    nomFichier: brute.nomFichier,
    nomOrigine: (brute.nomOrigine ?? '').trim() === '' ? brute.nomFichier : brute.nomOrigine,
    cleStockage: brute.cleStockage ?? null,
    stockageVide: brute.stockageVide === true,
    driveFileId: brute.driveFileId ?? null,
    md5Attendu: brute.md5Attendu ?? null,
    tailleAttendue: brute.tailleAttendue ?? null,
    /**
     * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — CE CHAMP MANQUAIT ICI, ET SON ABSENCE A COÛTÉ DEUX ESSAIS.
     *
     * Cette normalisation RECOPIE CHAMP PAR CHAMP : tout champ oublié vaut donc `undefined` POUR LA SUITE DE LA
     * FONCTION, même quand l'appelant l'avait parfaitement renseigné. Le dernier recours recevait `typeMime`
     * absent, son repère de type valait la chaîne vide, et il rendait `null` sans jamais regarder les pièces du
     * message — alors que les octets étaient là. Le refus disait « la pièce n'y a pas été retrouvée », ce qui
     * était vrai et n'apprenait rien.
     *
     * ⚠️ TOUT CHAMP AJOUTÉ À `PieceALire` DOIT ÊTRE AJOUTÉ ICI. C'est le prix de la normalisation explicite ;
     * l'oubli ne provoque aucune erreur de typage, seulement une branche qui se tait.
     */
    typeMime: brute.typeMime ?? null,
    messageIdRfc: brute.messageIdRfc ?? null,
  };

  // ── ① MINIO ─────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * ⚠️ ON NE L'ESSAIE PAS QUAND ON SAIT QU'IL EST VIDE. `gestion_piece_vidage` l'enregistre : demander un objet
   * dont on sait qu'il n'est plus là coûte un aller-retour et un message d'erreur dans les journaux, pour une
   * réponse qu'on connaît déjà.
   */
  if (p.cleStockage !== null && !p.stockageVide) {
    try {
      const octets = await deps.minio(p.cleStockage);
      const verdict = verifierTaille(octets, p.tailleAttendue);
      if (verdict === null) return { ok: true, octets, source: 'minio', md5: md5De(octets) };
      essais.push(`stockage objet : ${verdict}`);
    } catch (e) {
      essais.push(`stockage objet : ${motif(e)}`);
    }
  } else {
    essais.push(p.cleStockage === null
      ? 'stockage objet : cette pièce n’y a jamais été déposée'
      : 'stockage objet : vidé (la copie Drive fait foi)');
  }

  // ── ② LA COPIE DRIVE, VÉRIFIÉE ──────────────────────────────────────────────────────────────────────────────
  if (p.driveFileId !== null) {
    try {
      const r = await deps.drive(p.driveFileId);
      if (!r.ok) {
        essais.push(`copie Drive : ${r.motif}`);
      } else if (p.md5Attendu !== null && r.md5.toLowerCase() !== p.md5Attendu.toLowerCase()) {
        /**
         * 🔴 UN FICHIER REMPLACÉ DANS LE DRIVE EST REFUSÉ, jamais servi. Il porterait le même nom et d'autres
         * octets : les joindre sans rien dire serait le pire des silences — on enverrait au correspondant un
         * document qui n'est pas celui qu'on croit envoyer.
         */
        essais.push('copie Drive : le fichier ne porte plus la même empreinte que la pièce d’origine');
      } else {
        const verdict = verifierTaille(r.octets, p.tailleAttendue);
        if (verdict === null) return { ok: true, octets: r.octets, source: 'drive', md5: r.md5 };
        essais.push(`copie Drive : ${verdict}`);
      }
    } catch (e) {
      essais.push(`copie Drive : ${motif(e)}`);
    }
  } else {
    essais.push('copie Drive : aucune copie vérifiée n’est enregistrée pour cette pièce');
  }

  // ── ③ DERNIER RECOURS : LA PIÈCE DU MESSAGE D'ORIGINE, DANS GMAIL ───────────────────────────────────────────
  if (deps.gmail === undefined) {
    essais.push('message d’origine : non consulté par cet écran');
  } else if (p.messageIdRfc === null) {
    essais.push('message d’origine : son identifiant n’est pas connu');
  } else {
    try {
      // 🔴 LE NOM D'ORIGINE, JAMAIS LE NOM D'USAGE : dans Gmail la pièce n'a jamais changé de nom.
      /**
       * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — UNE PIÈCE SANS NOM SE RECONNAÎT AUTREMENT ═══════════════
       *
       * ⚠️ CAUSE EXACTE DE 7 ÉCHECS DE RATTRAPAGE, MESURÉE : la recherche chez Gmail compare les NOMS DE FICHIER
       * (`piece.filename`). Une partie MIME sans nom est enregistrée « (sans nom) » chez nous — la comparaison
       * `'' === '(sans nom)'` ne peut JAMAIS aboutir, et la pièce était déclarée introuvable alors qu'elle est là.
       * Trois des onze photos d'Arno étaient dans ce cas, et quatre pièces du lot précédent aussi.
       *
       * 🔴 ON DONNE DONC UN SECOND REPÈRE : le type et la taille attendus. Le câblage ne s'en sert QUE si le nom
       * ne désigne rien — un nom qui désigne reste la clé, et il est plus sûr qu'un couple (type, taille).
       *
       * ⚠️ LE REPÈRE EST FACULTATIF POUR L'APPELANT : un câblage qui ne le lit pas se comporte exactement comme
       * avant ce lot.
       */
      const octets = await deps.gmail(p.messageIdRfc, p.nomOrigine ?? p.nomFichier, {
        typeMime: p.typeMime ?? null, taille: p.tailleAttendue,
      });
      if (octets === null) {
        essais.push('message d’origine : la pièce n’y a pas été retrouvée');
      } else {
        const verdict = verifierTaille(octets, p.tailleAttendue);
        if (verdict === null) return { ok: true, octets, source: 'gmail', md5: md5De(octets) };
        essais.push(`message d’origine : ${verdict}`);
      }
    } catch (e) {
      essais.push(`message d’origine : ${motif(e)}`);
    }
  }

  return {
    ok: false,
    nomFichier: p.nomFichier,
    essais,
    motif: `« ${p.nomFichier} » est introuvable : ${essais.join(' ; ')}.`,
  };
}

/**
 * LA TAILLE REÇUE EST-ELLE CELLE QU'ON ATTEND ? Rend `null` quand tout va bien, le motif sinon. PUR.
 *
 * ⚠️ UNE TAILLE INCONNUE (`null`) NE FAIT RIEN ÉCHOUER : on ne refuse pas une pièce parce qu'on a oublié de
 * mesurer la précédente. La garde sert quand on SAIT, pas quand on suppose.
 *
 * 🔴 ET UNE TAILLE NULLE EST TOUJOURS UN ÉCHEC, même si personne ne l'attendait : zéro octet n'est pas un
 * document, et c'est exactement ce qu'un correspondant reçoit quand on croit lui avoir envoyé quelque chose.
 */
export function verifierTaille(octets: Buffer, attendue: number | null): string | null {
  if (octets.byteLength === 0) return 'la source a rendu un fichier vide';
  // ⚠️ `== null` ATTRAPE AUSSI `undefined` — un champ oublié est une taille INCONNUE, pas une taille de zéro.
  //   `Number.isFinite` écarte `NaN`, que `Number(null)` et une colonne illisible produisent tous les deux.
  if (attendue == null || !Number.isFinite(attendue) || attendue <= 0) return null;
  if (octets.byteLength === attendue) return null;
  return `la taille ne correspond pas (${octets.byteLength} octets reçus, ${attendue} attendus)`;
}

/** Le motif LISIBLE d'une exception. « [object Object] » n'apprend rien à qui lit un bandeau. PUR. */
function motif(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // `The specified key does not exist` est le mot de MinIO pour « l'objet a été vidé ». On le traduit.
  if (/specified key does not exist/i.test(m)) return 'l’objet a été vidé du stockage';
  return m.slice(0, 160);
}

/**
 * ══ 🔴 LIRE LES OCTETS DE PLUSIEURS PIÈCES — TOUT OU RIEN ═══════════════════════════════════════════════════════
 *
 * Demande d'Arno : « Si aucune source n'est trouvée : échec clair avec le nom de la pièce. Jamais d'envoi
 * partiel. »
 *
 * 🔴 ON LÈVE À LA PREMIÈRE PIÈCE INTROUVABLE, et le message porte SON nom. Rendre la liste incomplète ferait
 * partir un message auquel il manque un document — et ce manque ne se découvrirait que chez le correspondant,
 * des jours plus tard. C'est précisément ce qui est arrivé, et la règle existe pour cela.
 *
 * ⚠️ EN SÉRIE, PAS EN PARALLÈLE : douze rapatriements Drive simultanés se disputeraient la bande passante du
 * serveur pour un gain nul — on attend de toute façon la plus lente.
 */
export async function lireOctetsDesPieces(
  pieces: readonly PieceALire[], deps: DepsOctetsPiece,
): Promise<{ piece: PieceALire; octets: Buffer; source: SourceOctets }[]> {
  const out: { piece: PieceALire; octets: Buffer; source: SourceOctets }[] = [];
  for (const p of pieces) {
    const r = await lireOctetsPiece(p, deps);
    if (!r.ok) throw new ErreurPieceIntrouvable(r.motif, p.nomFichier, r.essais);
    out.push({ piece: p, octets: r.octets, source: r.source });
  }
  return out;
}

/**
 * L'échec d'une lecture de pièce, avec de quoi l'expliquer À L'ÉCRAN.
 *
 * 🔴 UNE CLASSE, ET PAS UNE `Error` NUE : l'appelant doit pouvoir distinguer « une pièce manque » d'une panne de
 * réseau, et afficher le NOM du fichier plutôt qu'un message technique. C'est ce que `envoi.ts` transforme en
 * refus clair — et c'est ce qui manquait au bandeau qu'Arno a vu.
 */
export class ErreurPieceIntrouvable extends Error {
  constructor(message: string, readonly nomFichier: string, readonly essais: readonly string[]) {
    super(message);
    this.name = 'ErreurPieceIntrouvable';
  }
}
