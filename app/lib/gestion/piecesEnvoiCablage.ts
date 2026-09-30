/**
 * ⚠️ CE FICHIER EST LE MÊME QUE `piecesEnvoiReel.ts`, SANS `import 'server-only'` — motif F1 du dépôt.
 *
 * Le travailleur de fond de la file d’envoi assemble les pièces d’un message, et il tourne aussi sous `tsx`.
 *
 * 🔴 `server-only` LÈVE HORS DU BUNDLE react-server. Une CLI lancée par `tsx` (ici : la relève continue, démarrée
 * par launchd) qui atteindrait le fichier d'origine MOURRAIT AU CHARGEMENT, sans rapport apparent avec ce qu'elle
 * fait. C'est le bug 0d57224, et le garde `app/lib/garde/serverOnly.guard.test.ts` l'a attrapé pendant ce lot.
 *
 * ⚠️ NE PAS RETIRER `import 'server-only'` DU FICHIER D'ORIGINE pour « simplifier » : il protège les chemins où il
 * doit protéger. On sépare, on ne désarme pas.
 */
import { lireOriginalGmailOctets, chercherParMessageId } from './google';
import { listerPiecesPourEnvoi } from './brouillonPieceRepoBase';
import { ancresDuFil } from './lectureGmail';
import { query } from '../db/client';
import type { PieceAEnvoyer } from './envoiGmail';
import type { DemandeEnvoi } from './envoi';

/**
 * MODULE « GESTION » — LOT 5-PJ-ENVOI : CÂBLAGE RÉEL des pièces jointes d'un envoi. Même rôle que `depotDriveReel`
 * pour le Drive : tenir les I/O à un seul endroit, pour que `envoi.ts` reste éprouvable sans réseau ni stockage.
 *
 * DEUX SOURCES, ET UNE SEULE EST DISTANTE :
 *   ① les pièces du BROUILLON — fichiers ajoutés (stockage objet) ou pièces reprises d'un message d'origine
 *      (déjà chez nous). Dans les deux cas, on lit NOS octets ;
 *   ② pour la voie `transferer_piece`, l'ORIGINAL COMPLET, tiré de Gmail au moment de l'envoi (`lireOriginalGmail`).
 *      Il n'est stocké nulle part chez nous : le rapatrier à l'envoi, c'est joindre le message tel qu'il est
 *      AUJOURD'HUI dans la boîte, et ne rien garder d'une copie qui vieillirait.
 *
 * 🔴 UNE LECTURE QUI ÉCHOUE LÈVE. C'est voulu : `envoi.ts` transforme l'exception en refus clair et n'envoie RIEN.
 * Un transfert dont la pièce manque, parti quand même, ne se découvre que chez le correspondant.
 */

/** Le nom du fichier .eml joint. L'objet du message d'origine le rend reconnaissable dans la liste des pièces. */
export function nomEml(objet: string | null | undefined): string {
  const base = (objet ?? '').trim().replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
  return `${base === '' ? 'message' : base}.eml`;
}

async function objetDuMessage(messageId: number): Promise<string | null> {
  const { rows } = await query<{ objet: string | null }>(
    `SELECT objet FROM gestion_message WHERE id = $1`, [messageId]);
  return rows[0]?.objet ?? null;
}

export interface DepsPiecesEnvoi {
  /** Le jeton de gestion@, pour aller chercher l'original. `null` = connexion Google absente. */
  jeton(): Promise<string | null>;
  /** Les pièces du brouillon, avec de quoi lire leurs octets. */
  duBrouillon(brouillonId: number): Promise<{
    nom: string; typeMime: string | null; cleStockage: string | null; cleStockagePiece: string | null;
    taille?: number; pieceId?: number | null;
  }[]>;
  /**
   * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — LES OCTETS D'UNE PIÈCE, PAR LE LECTEUR CENTRAL ═════════════════════════════
   *
   * CE QUI ÉTAIT ÉCRIT ICI : `octets(cle: string): Promise<Buffer>`, câblé sur `recuperer` — c'est-à-dire MinIO,
   * et RIEN d'autre.
   *
   * 🔴 CE QUE ÇA DONNAIT : depuis le vidage de la nuit du 29/09 (26 522 pièces vidées, copie Drive vérifiée),
   * transférer un mail ancien rendait « Gmail a refusé l'envoi : Les pièces jointes n'ont pas pu être lues :
   * The specified key does not exist. » L'AFFICHAGE savait basculer sur la copie Drive depuis le lot DRIVE-3 ;
   * l'ENVOI ne le savait pas. Deux chemins pour la même question, un seul au courant.
   *
   * La dépendance prend donc maintenant la PIÈCE, pas une clé : c'est `lireOctetsPiece` qui décide de la source
   * (MinIO → copie Drive vérifiée → message d'origine dans Gmail), et lui seul.
   */
  octets(p: {
    nom: string; cleStockage: string | null; cleStockagePiece: string | null;
    taille?: number; pieceId?: number | null;
  }): Promise<Buffer>;
  /** Le `Message-ID` RFC du message d'origine — l'ancre vers Gmail. */
  ancre(messageId: number): Promise<string | null>;
  /** Retrouve le message dans Gmail, puis rapatrie son original brut. */
  original(jeton: string, messageIdRfc: string): Promise<Buffer | null>;
  /** L'objet du message d'origine, pour nommer le .eml. */
  objet(messageId: number): Promise<string | null>;
}

/**
 * LES PIÈCES D'UN ENVOI, prêtes à être mises dans le message. PUR quant à la décision — tout est injecté.
 */
export async function piecesDeLEnvoi(d: DemandeEnvoi, deps: DepsPiecesEnvoi): Promise<PieceAEnvoyer[]> {
  const pieces: PieceAEnvoyer[] = [];

  /**
   * ① LES PIÈCES DU BROUILLON — ajoutées à la main, ou reprises d'un message d'origine.
   *
   * ══ 🔴🔴 LOT PJ-APRES-VIDEAGE — PLUS AUCUNE PIÈCE N'EST SILENCIEUSEMENT SAUTÉE ══════════════════════════════
   *
   * CE QUI ÉTAIT ÉCRIT ICI, ET QUI VIOLAIT LA RÈGLE :
   *     if (cle === null) continue; // …et elle ne fait rien échouer
   *
   * 🔴 C'ÉTAIT UN ENVOI PARTIEL, ET IL ÉTAIT MUET. Une pièce dont on ne trouvait pas la clé disparaissait du
   * message sans que rien ne le dise — ni à l'écran, ni dans le journal. Le correspondant recevait un transfert
   * amputé, et personne chez nous ne pouvait le savoir. La règle du module dit l'inverse en toutes lettres :
   * « une lecture qui échoue LÈVE ; `envoi.ts` transforme l'exception en refus clair et n'envoie RIEN ».
   *
   * Désormais, `deps.octets` reçoit la PIÈCE et cherche partout où elle peut être. S'il ne la trouve nulle part,
   * il lève — avec le NOM du fichier — et le message ne part pas.
   */
  if (d.brouillonId !== null) {
    for (const p of await deps.duBrouillon(d.brouillonId)) {
      pieces.push({ nom: p.nom, typeMime: p.typeMime, octets: await deps.octets(p) });
    }
  }

  // ② L'ORIGINAL COMPLET, pour la seule voie qui le demande.
  if (d.voie === 'transferer_piece' && d.repondAMessageId !== null) {
    const jeton = await deps.jeton();
    if (jeton === null) throw new Error('la connexion Google de gestion@ n’est pas faite');
    const ancre = await deps.ancre(d.repondAMessageId);
    if (ancre === null) throw new Error('le message d’origine n’a pas de Message-ID connu');
    const brut = await deps.original(jeton, ancre);
    if (brut === null) throw new Error('le message d’origine n’a pas été retrouvé dans Gmail');
    pieces.push({
      nom: nomEml(await deps.objet(d.repondAMessageId)),
      typeMime: 'message/rfc822',
      octets: brut,
    });
  }

  return pieces;
}

/** Le câblage RÉEL. `envoi.ts` ne voit que `piecesDeLEnvoi`, qui ne voit que ces dépendances. */
export function depsPiecesEnvoi(jeton: () => Promise<string | null>): DepsPiecesEnvoi {
  return {
    jeton,
    duBrouillon: listerPiecesPourEnvoi,
    /**
     * 🔴 LE LECTEUR CENTRAL, et rien d'autre. Il essaie MinIO, puis NOTRE copie Drive vérifiée, puis la pièce du
     * message d'origine dans Gmail. Il lève, en nommant le fichier, quand aucune source ne répond.
     *
     * ⚠️ UNE PIÈCE AJOUTÉE À LA MAIN (`pieceId` nul) N'A QUE LE STOCKAGE OBJET : ni copie Drive, ni message
     * d'origine. Le lecteur le dit dans son motif plutôt que d'échouer sans raison visible.
     */
    octets: async (p) => {
      const { lireOctetsPiece } = await import('./octetsPiece');
      const { depsOctetsPiece, lirePiecesALire } = await import('./octetsPieceCablage');
      const connue = p.pieceId == null ? null : (await lirePiecesALire([p.pieceId])).get(p.pieceId) ?? null;
      const aLire = connue ?? {
        pieceId: p.pieceId ?? null,
        nomFichier: p.nom,
        cleStockage: p.cleStockage ?? p.cleStockagePiece,
        stockageVide: false,
        driveFileId: null,
        md5Attendu: null,
        tailleAttendue: p.taille ?? null,
        messageIdRfc: null,
      };
      // ⚠️ La clé PROPRE du brouillon prime quand elle existe : c'est une COPIE faite pour ce message-là.
      const avecCle = p.cleStockage === null ? aLire : { ...aLire, cleStockage: p.cleStockage, stockageVide: false };
      const r = await lireOctetsPiece(avecCle, depsOctetsPiece(jeton));
      if (!r.ok) throw new Error(r.motif);
      return r.octets;
    },
    ancre: async (messageId: number) => {
      const { rows } = await query<{ message_id: string | null }>(
        `SELECT message_id FROM gestion_message WHERE id = $1`, [messageId]);
      return rows[0]?.message_id ?? null;
    },
    original: async (jetonAcces: string, messageIdRfc: string) => {
      const trouve = await chercherParMessageId(jetonAcces, messageIdRfc, { fetch });
      if (!trouve.ok || trouve.valeur === null) return null;
      // EN OCTETS : un original n'est pas garanti valide en UTF-8, et le décoder abîmerait le .eml en silence.
      const brut = await lireOriginalGmailOctets(jetonAcces, trouve.valeur.id, { fetch });
      return brut.ok ? brut.valeur : null;
    },
    objet: objetDuMessage,
  };
}

/** Réexporté pour que rien d'autre n'ait à connaître `lectureGmail` : une seule porte vers les ancres d'un fil. */
export { ancresDuFil };
