/**
 * MODULE « GESTION » — LOT 5-DEST : ACCÈS IMAP EN EN-TÊTES SEULS. Chargé DYNAMIQUEMENT (il tire `imapflow`), jamais
 * importé par un test ni par un écran.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 POURQUOI CE CLIENT EXISTE À CÔTÉ DE `app/lib/email/imap.ts`, QUI N'EST PAS MODIFIÉ.
 *
 * `imap.ts` sait déjà lire des en-têtes (`telechargerEntetes`), mais d'une façon qui ne convient pas ici, pour deux
 * raisons précises :
 *   ① il demande TOUS les en-têtes (`BODY.PEEK[HEADER]`), là où ce lot n'a besoin que de quatre lignes. Sur 27 833
 *      messages, la différence n'est pas cosmétique : c'est le volume téléchargé, donc la limite journalière du
 *      fournisseur, donc le nombre de nuits que l'opération prend ;
 *   ② il lit UN message par appel (`fetchOne`). Un aller-retour par message contre un aller-retour par CENTAINE, sur
 *      des dizaines de milliers de lignes, ce n'est pas le même ordre de grandeur de durée.
 * `imap.ts` appartient au module Permis et n'est pas modifiable dans ce lot ; ce client vit donc ici, dans le module
 * Gestion, et ne sert qu'à lui.
 *
 * 🔒 LECTURE STRICTE, exactement la même règle que la relève : le dossier est ouvert en `readOnly` (EXAMINE), donc
 * AUCUN drapeau n'est posé (pas même `\Seen`), rien n'est déplacé, rien n'est supprimé, rien n'est envoyé. Les lectures
 * passent par `BODY.PEEK[…]` — le `PEEK` est précisément ce qui empêche le serveur de marquer un message comme lu.
 * Aucune méthode d'écriture (`messageFlagsAdd`, `messageMove`, `messageDelete`, `append`) n'est appelée, et il n'en
 * existe aucune sur l'objet rendu : ce qui n'est pas exposé ne peut pas être appelé par erreur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { ImapFlow } from 'imapflow';
import type { CompteImap } from '../email';
import { analyserBlocEntetes, CHAMPS_DESTINATAIRES } from './entetes';
import { lireReponseRecherche } from './completion';

/** Contrat minimal dont la complétion a besoin. Volontairement PLUS ÉTROIT que `ClientDossier` : ce lot ne lit rien d'autre. */
export interface ClientEntetes {
  ouvrir(): Promise<void>;
  ouvrirDossier(chemin: string): Promise<void>;
  /** UIDVALIDITY du dossier ouvert. `null` tant qu'aucun dossier ne l'est. */
  uidValidite(): string | null;
  /** En-têtes de destinataires de plusieurs UID, en UN aller-retour. Un UID que le serveur ne sert pas est ABSENT de la Map. */
  entetesDesUids(uids: readonly number[]): Promise<Map<number, Record<string, string>>>;
  /** Les UID dont l'en-tête `Message-ID` correspond. Zéro = introuvable, plus d'un = ambigu : l'appelant tranche. */
  uidsDuMessageId(messageId: string): Promise<number[]>;
  fermer(): Promise<void>;
}

/** Fabrique le client. `surErreur` est OBLIGATOIRE de fait : sans écouteur, un « error » d'imapflow TUE le processus. */
export function creerClientEntetes(compte: CompteImap, surErreur?: (e: Error) => void): ClientEntetes {
  const client = new ImapFlow({
    host: compte.host,
    port: compte.port,
    secure: compte.tls,
    auth: { user: compte.user, pass: compte.pass },
    logger: false,
  });
  // ⚠️ `ImapFlow.emitError` émet « error » SANS vérifier qu'un écouteur existe : un EventEmitter Node qui émet
  //   « error » sans écouteur JETTE, et le processus meurt. Même piège, même remède que le lot 3-ter.
  if (surErreur) client.on('error', surErreur);

  let uidValidity: string | null = null;
  // Le dossier ouvert, mémorisé pour pouvoir le RÉOUVRIR si le serveur le désélectionne en cours de route.
  let chemincourant: string | null = null;

  const ouvrirVraiment = async (chemin: string): Promise<void> => {
    const boite = await client.mailboxOpen(chemin, { readOnly: true }); // EXAMINE : aucune modification de la boîte
    const nouvelle = boite?.uidValidity !== undefined ? String(boite.uidValidity) : null;
    // ⚠️ UNE RÉOUVERTURE QUI CHANGE L'UIDVALIDITY N'EST PAS UNE RÉOUVERTURE : le serveur a réattribué les UID, et
    //   tous ceux qu'on tient en mémoire désignent désormais d'autres messages. Mieux vaut arrêter la passe.
    if (uidValidity !== null && nouvelle !== null && nouvelle !== uidValidity) {
      throw new Error(`l’UIDVALIDITY du dossier a changé (${uidValidity} → ${nouvelle}) : les UID connus ne valent plus rien.`);
    }
    uidValidity = nouvelle;
    chemincourant = chemin;
  };

  return {
    async ouvrir(): Promise<void> {
      await client.connect();
    },
    async ouvrirDossier(chemin: string): Promise<void> {
      await ouvrirVraiment(chemin);
    },
    uidValidite(): string | null {
      return uidValidity;
    },
    async entetesDesUids(uids: readonly number[]): Promise<Map<number, Record<string, string>>> {
      const map = new Map<number, Record<string, string>>();
      if (uids.length === 0) return map;
      // `headers: [...]` → `BODY.PEEK[HEADER.FIELDS (TO CC BCC REPLY-TO)]` : quatre lignes, jamais le corps, jamais une
      //   pièce jointe, et aucun drapeau posé. Un UID disparu depuis la capture n'apparaît simplement pas dans le flux.
      for await (const msg of client.fetch(uids.join(','), { headers: [...CHAMPS_DESTINATAIRES] }, { uid: true })) {
        if (!msg.headers) continue; // le serveur n'a rien servi pour cet UID : compté « introuvable » par l'appelant
        map.set(msg.uid, analyserBlocEntetes(msg.headers.toString('utf8')));
      }
      return map;
    },
    async uidsDuMessageId(messageId: string): Promise<number[]> {
      // SEARCH HEADER : le seul recours pour les messages capturés avant la migration 231, qui n'ont pas d'UID mémorisé.
      const chercher = async (): Promise<unknown> => client.search({ header: { 'message-id': messageId } }, { uid: true });

      const premiere = lireReponseRecherche(await chercher());
      if (premiere.sorte === 'resultats') return premiere.uids;

      // DOSSIER PERDU — le serveur nous a désélectionné le dossier (mesuré en conditions réelles le 25/09/2026, après
      //   941 lectures). On le ROUVRE et on rejoue UNE fois : c'est une panne d'état, pas une réponse, et la
      //   traiter en « introuvable » marquerait des messages perdus sans que la boîte ait seulement été interrogée.
      if (chemincourant === null) throw new Error('le dossier n’est plus sélectionné, et aucun chemin n’est mémorisé pour le rouvrir.');
      await ouvrirVraiment(chemincourant);
      const seconde = lireReponseRecherche(await chercher());
      if (seconde.sorte === 'resultats') return seconde.uids;
      // Deux fois de suite : ce n'est plus un incident, c'est la connexion. On le DIT, la passe s'arrête et reprendra.
      throw new Error('le dossier reste introuvable après réouverture : la connexion à la boîte n’est plus utilisable.');
    },
    async fermer(): Promise<void> {
      try { await client.logout(); } catch { /* best-effort : refermer une connexion morte ne doit rien faire échouer */ }
    },
  };
}
