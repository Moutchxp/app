/**
 * MODULE « GESTION » — LOT 5-DEST : UNE PASSE DE COMPLÉTION, orchestrée par INJECTION. Aucun import lourd (ni `pg`, ni
 * `imapflow`) : ce fichier se teste en entier avec des doublures, sans boîte et sans base.
 *
 * L'ORDRE DES ÉTAPES EST LE MÊME QUE CELUI DE LA RELÈVE, et pour les mêmes raisons déjà payées :
 *   ① la SONDE DE SCHÉMA d'abord, HORS TRANSACTION — une migration non appliquée doit donner un message clair, jamais
 *      une transaction abandonnée ni un écran mort (piège du lot 4a) ;
 *   ② le VERROU ensuite — le même que la relève : les deux lisent la même boîte et écrivent les mêmes lignes, elles ne
 *      doivent jamais tourner ensemble ;
 *   ③ ÉCRIRE AU FIL DE L'EAU, lot par lot — une coupure au bout de trois heures doit laisser acquis tout ce qui
 *      précède. C'est ce qui rend l'opération reprenable sans rien mémoriser : la prochaine passe relit simplement
 *      `WHERE dest_a IS NULL`, qui est devenu plus petit.
 */
import {
  exemple, passeMuette, rapportVide, repartir, valeursAEcrire, EXEMPLES_MAX,
  type AEcrire, type IssueCompletion, type LigneACompleter, type RapportCompletion,
} from './completion';
import type { ClientEntetes } from './clientEntetes';

/** Combien d'UID par aller-retour de lecture. Un seul `FETCH` pour deux cents messages, au lieu de deux cents appels. */
export const LOT_LECTURE = 200;

/** Combien de lignes par transaction d'écriture. Assez pour être rapide, assez peu pour qu'une coupure perde peu. */
export const LOT_ECRITURE = 200;

/** Tout ce que la passe touche au monde extérieur. Injecté → testable sans boîte ni base. */
export interface DepsCompletion {
  /** La migration 235 est-elle appliquée ? Posée HORS transaction, avant tout le reste. */
  schemaPret(): Promise<boolean>;
  /** Le dossier IMAP à ouvrir (lu dans `gestion_config`, jamais en dur). */
  dossier(): Promise<string>;
  acquerirVerrou(): Promise<boolean>;
  libererVerrou(): Promise<void>;
  /** `null` = aucun compte IMAP configuré : ce n'est pas une erreur, il n'y a simplement rien à faire. */
  creerClient(): Promise<ClientEntetes | null>;
  lireACompleter(limite: number): Promise<LigneACompleter[]>;
  compterRestantes(): Promise<number>;
  ecrireLot(lot: readonly AEcrire[]): Promise<{ completes: number; dejaFaits: number }>;
  journaliser(r: RapportCompletion): Promise<void>;
  journal?(ligne: string): void;
}

/** Ce que la ligne de commande demande d'une passe. Aucune de ces valeurs n'est un réglage : rien n'est écrit en base. */
export interface OptionsCompletion {
  /** Nombre maximum de lignes traitées par CETTE passe. */
  plafond: number;
}

/** Découpe une liste en tranches. PUR. */
export function trancher<T>(liste: readonly T[], taille: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille));
  return out;
}

/**
 * UNE passe. Ne relance jamais d'elle-même : l'appelant (la CLI) décide quoi faire de l'issue — c'est la même
 * répartition des rôles que la relève, et c'est elle qui permet de tester la boucle sans jamais ouvrir une boîte.
 */
export async function executerCompletion(
  deps: DepsCompletion, appliquer: boolean, options: OptionsCompletion,
): Promise<IssueCompletion> {
  const dire = deps.journal ?? ((): void => {});

  if (!await deps.schemaPret()) {
    return {
      resultat: 'inactif', rapport: null,
      raison: 'la migration 235 (destinataires séparés) n’est pas appliquée : il n’y a pas de colonne à compléter.',
    };
  }
  if (!await deps.acquerirVerrou()) {
    return { resultat: 'occupe', rapport: null, raison: 'une autre opération de gestion est en cours (relève ou complétion).' };
  }

  const r = rapportVide();
  let client: ClientEntetes | null = null;
  try {
    client = await deps.creerClient();
    if (client === null) {
      return { resultat: 'inactif', rapport: null, raison: 'aucun compte IMAP configuré : rien à lire.' };
    }
    await client.ouvrir();
    const chemin = await deps.dossier();
    await client.ouvrirDossier(chemin);
    dire(`dossier « ${chemin} » ouvert en LECTURE SEULE (aucun drapeau posé, aucun corps téléchargé).`);

    const lignes = await deps.lireACompleter(options.plafond);
    r.lus = lignes.length;
    if (lignes.length === 0) {
      r.resteNull = await deps.compterRestantes();
      return { resultat: 'ok', rapport: r, raison: 'plus aucun message sans destinataires analysés.' };
    }

    const { parUid, parMessageId } = repartir(lignes, client.uidValidite());
    dire(`${lignes.length} message(s) à compléter : ${parUid.length} par UID, ${parMessageId.length} par Message-ID.`);

    /** Écrit (ou simule) un paquet, et range les compteurs. Appelé au fil de l'eau, jamais à la toute fin. */
    const vider = async (paquet: AEcrire[]): Promise<void> => {
      for (const a of paquet) if (r.exemples.length < EXEMPLES_MAX) r.exemples.push(exemple(a));
      if (!appliquer) { r.completes += paquet.length; return; } // SIMULATION : on compte ce qui SERAIT écrit
      const issue = await deps.ecrireLot(paquet);
      r.completes += issue.completes;
      r.dejaFaits += issue.dejaFaits;
    };

    let tampon: AEcrire[] = [];
    const pousser = async (a: AEcrire): Promise<void> => {
      tampon.push(a);
      if (tampon.length >= LOT_ECRITURE) { await vider(tampon); tampon = []; }
    };

    // ── ① LE CHEMIN RAPIDE : par UID, deux cents messages par aller-retour ──
    for (const tranche of trancher(parUid, LOT_LECTURE)) {
      const entetes = await client.entetesDesUids(tranche.map((t) => t.uid));
      r.demandes += tranche.length; // on a DEMANDÉ : c'est ce dénominateur-là qui juge le serveur (cf. `passeMuette`)
      for (const t of tranche) {
        const e = entetes.get(t.uid);
        // Le serveur n'a rien servi pour cet UID. DEUX causes possibles, indiscernables d'ici : le message a disparu
        //   du dossier, ou le fournisseur a cessé de servir (limite de téléchargement). C'est le compteur
        //   `entetesObtenus` — nul sur TOUTE la passe — qui départage, via `passeMuette`.
        if (e === undefined) { r.introuvables += 1; continue; }
        r.entetesObtenus += 1;
        await pousser(valeursAEcrire(t.id, e));
      }
    }

    // ── ② LE RECOURS : par Message-ID, pour les messages capturés avant la migration 231 (aucun UID mémorisé) ──
    for (const l of parMessageId) {
      const uids = await client.uidsDuMessageId(l.messageId.trim().replace(/^</, '').replace(/>$/, '').trim());
      if (uids.length === 0) { r.introuvables += 1; continue; }
      // ⚠️ PLUSIEURS RÉPONSES = ON NE CHOISIT PAS. Écrire les destinataires du mauvais message dans une ligne qu'on ne
      //   pourra plus distinguer ensuite serait une corruption définitive. `NULL` reste la bonne réponse : « on ne sait pas ».
      if (uids.length > 1) { r.ambigus += 1; continue; }
      const entetes = await client.entetesDesUids(uids);
      r.demandes += 1;
      const e = entetes.get(uids[0]);
      if (e === undefined) { r.introuvables += 1; continue; }
      r.entetesObtenus += 1;
      await pousser(valeursAEcrire(l.id, e));
    }

    if (tampon.length > 0) await vider(tampon);

    r.resteNull = await deps.compterRestantes();
    if (appliquer && r.completes > 0) await deps.journaliser(r);

    // Une passe MUETTE n'est pas un succès : le serveur annonçait des messages et n'en a servi aucun. La dire « ok »
    //   ferait croire à un progrès et empêcherait toute attente — c'est la leçon des nuits des 23 et 24/09/2026.
    if (passeMuette(r)) {
      return { resultat: 'erreur', rapport: r, raison: 'le serveur n’a servi les en-têtes d’AUCUN message de cette passe.' };
    }
    return { resultat: 'ok', rapport: r, raison: `${r.completes} message(s) complété(s).` };
  } catch (e) {
    r.echecs += 1;
    // ⚠️ MESURER LE RESTE MÊME QUAND LA PASSE ÉCHOUE. Sans cela, `resteNull` gardait sa valeur initiale — zéro — et le
    //   compte rendu annonçait « reste à compléter : 0 » au milieu d'un échec, avec 25 000 lignes encore à faire. Un
    //   chiffre faux est pire qu'un chiffre absent : il fait croire que c'est fini. (Défaut vu en vrai le 25/09/2026.)
    try { r.resteNull = await deps.compterRestantes(); } catch { /* la base aussi est peut-être injoignable : on n'insiste pas */ }
    // 🔴 UNE PASSE QUI A ÉCRIT LAISSE UNE TRACE, MÊME SI ELLE FINIT MAL. Mesuré le 25/09/2026 : une passe a écrit
    //   800 lignes puis s'est interrompue, et le journal n'en a rien su — 800 messages modifiés sans trace, alors que
    //   le module tout entier repose sur le principe que tout geste est journalisé. Au mieux-effort : si le journal
    //   échoue aussi, c'est l'erreur d'ORIGINE qu'on rapporte, jamais celle du journal qui la masquerait.
    if (appliquer && r.completes > 0) {
      try { await deps.journaliser(r); } catch { /* best-effort : ne jamais remplacer la vraie cause par celle-ci */ }
    }
    return { resultat: 'erreur', rapport: r, raison: e instanceof Error ? e.message : String(e) };
  } finally {
    // Refermer et RENDRE LE VERROU, quoi qu'il arrive : un verrou consultatif oublié bloquerait aussi la relève.
    try { await client?.fermer(); } catch { /* best-effort */ }
    await deps.libererVerrou();
  }
}
