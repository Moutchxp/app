/**
 * MODULE « GESTION » — LOT 4b : LES DEUX GESTES. C'est le seul fichier du module qui écrit à la demande d'un humain
 * (la capture, elle, écrit ce qu'elle relève). IMPUR : base.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 TROIS RÈGLES, VALABLES POUR CHAQUE GESTE — et aucune n'est négociable :
 *
 * ① ON NE SUPPRIME JAMAIS. Affecter, détacher, classer sans suite, rouvrir : tout est un CHANGEMENT D'ÉTAT ou une LIGNE
 *    DE PLUS. Une affectation défaite reste en base, inactive et datée ; un fil classé sans suite garde ses messages.
 * ② TOUT GESTE EST RÉVERSIBLE, et la réversibilité est un geste à part entière — pas une manipulation de base à faire
 *    « au besoin ». Ce qui ne se défait pas d'un clic ne se fait pas d'un clic.
 * ③ TOUT GESTE EST JOURNALISÉ, avec QUI et QUAND, dans un journal append-only. Le nom de l'auteur est FIGÉ en texte à
 *    côté de son identifiant : il restera lisible des années après, même si le compte est désactivé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import { adresseProposee, nettoyerObjet } from './objet';
import { deplacementsDeMailsDisponibles } from './schema';

/**
 * LOT 4d-B2 — « cette affectation porte sur TOUT l'échange », en SQL.
 *
 * Depuis la migration 234, une affectation peut ne porter que sur UN mail. Les gestes d'échange (affecter, détacher)
 * doivent donc dire explicitement qu'ils ne s'occupent QUE des affectations d'échange — sans ce prédicat, détacher un
 * échange emporterait au passage les mails qu'on en avait sortis.
 *
 * ⚠️ La condition est VIDE tant que la 234 n'est pas appliquée : la colonne n'existe pas encore, et la nommer ferait
 * échouer la requête. La sonde se fait AVANT la transaction — dans une transaction, PostgreSQL l'abandonne à la
 * première erreur et aucun repli ne peut plus s'exécuter (piège mesuré au lot 4a).
 */
async function seulementLEchange(): Promise<string> {
  return (await deplacementsDeMailsDisponibles()) ? ' AND message_id IS NULL' : '';
}

/** Qui agit. `id` null = voie de secours (mot de passe partagé) : le libellé, lui, est TOUJOURS écrit. */
export interface Auteur { id: number | null; libelle: string }

export type Issue =
  | { ok: true; evenementId?: number; reference?: string }
  | { ok: false; motif: string };

/** Longueurs maximales — bornes de SÛRETÉ, jamais des règles métier : on refuse un payload absurde, pas une saisie. */
const MAX_COURT = 300;
const MAX_LONG = 2000;

/** Texte nettoyé et borné ; `null` si vide. PUR. */
export function texte(v: unknown, max = MAX_COURT): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s.slice(0, max);
}

/**
 * RÉFÉRENCE d'un événement : `GES-AAAA-NNNNNN`, par un compteur ATOMIQUE par année (`INSERT … ON CONFLICT DO UPDATE
 * … RETURNING`, verrou de ligne). Deux créations simultanées ne peuvent PAS obtenir le même numéro : c'est la base qui
 * tranche, jamais le code. Même patron que `demande_compteur` (053) et `certificat_compteur`.
 */
async function prochaineReference(q: typeof query, annee: number): Promise<string> {
  const { rows } = await q<{ dernier: number }>(
    `INSERT INTO gestion_compteur (annee, dernier) VALUES ($1, 1)
     ON CONFLICT (annee) DO UPDATE SET dernier = gestion_compteur.dernier + 1 RETURNING dernier`, [annee]);
  return `GES-${annee}-${String(rows[0].dernier).padStart(6, '0')}`;
}

/** Écrit une ligne de journal. Append-only garanti EN BASE par un trigger : personne ne peut la corriger après coup. */
async function journaliser(
  q: typeof query, entite: string, entiteId: number, action: string,
  auteur: Auteur, commentaire: string, avant: string | null = null, apres: string | null = null,
): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entite, entiteId, action, avant, apres, commentaire, auteur.id, auteur.libelle]);
}

export interface NouvelEvenement {
  objet: string;
  demandeurNom?: string | null;
  demandeurEmail?: string | null;
  adresseLibre?: string | null;
}

/**
 * AFFECTE un échange à un événement : un EXISTANT (`evenementId`) ou un NOUVEAU (`nouveau`). Tout se fait dans UNE
 * transaction — un événement créé sans son affectation serait une carte vide que personne n'aurait demandée.
 *
 * RÉAFFECTATION : l'affectation active précédente est DÉSACTIVÉE (jamais supprimée), une nouvelle ligne est créée, et
 * les deux faits sont journalisés. L'historique dit alors non seulement où est l'échange, mais où il est passé.
 * L'unicité « un fil n'a qu'UNE affectation active » est tenue EN BASE par un index unique partiel : même deux clics
 * simultanés ne peuvent pas en créer deux.
 */
export async function affecter(
  filId: number, cible: { evenementId?: number; nouveau?: NouvelEvenement }, auteur: Auteur, motif?: string | null,
): Promise<Issue> {
  // LOT 4c — le titre d'une carte NEUVE naît nettoyé de sa cascade de « Re: / TR: / Fwd: », quelle que soit la voie
  //   d'entrée (panneau, ou appel direct de la route). Les cartes DÉJÀ enregistrées gardent le leur : on ne réécrit
  //   aucune donnée posée, un titre est ce qu'un humain a validé ce jour-là.
  const objetNouveau = cible.nouveau ? texte(nettoyerObjet(texte(cible.nouveau.objet))) : null;
  if (cible.evenementId === undefined && objetNouveau === null) {
    return { ok: false, motif: 'Indiquez l’événement à rattacher, ou donnez un objet au nouvel événement.' };
  }
  const surLEchange = await seulementLEchange(); // sondé HORS transaction, cf. le commentaire de la fonction
  return withTransaction(async (q) => {
    const { rows: fil } = await q<{ id: number; etat: string }>(
      `SELECT id::int AS id, etat FROM gestion_fil WHERE id = $1`, [filId]);
    if (!fil[0]) return { ok: false, motif: 'Cet échange n’existe pas.' };

    let evenementId = cible.evenementId;
    let reference: string | undefined;
    if (evenementId === undefined) {
      const n = cible.nouveau!;
      reference = await prochaineReference(q, new Date().getFullYear());
      const { rows } = await q<{ id: number }>(
        `INSERT INTO gestion_evenement (reference, objet, demandeur_nom, demandeur_email, adresse_libre, ouvert_par, ouvert_par_libelle)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::int AS id`,
        [reference, objetNouveau, texte(n.demandeurNom), texte(n.demandeurEmail), texte(n.adresseLibre), auteur.id, auteur.libelle]);
      evenementId = rows[0].id;
      await journaliser(q, 'evenement', evenementId, 'ouverture', auteur, `carte ${reference} ouverte depuis un échange`);
    } else {
      const { rows } = await q<{ reference: string }>(
        `SELECT reference FROM gestion_evenement WHERE id = $1`, [evenementId]);
      if (!rows[0]) return { ok: false, motif: 'Cet événement n’existe pas.' };
      reference = rows[0].reference;
    }

    // ⚠️ ON REGARDE AVANT D'ÉCRIRE. `withTransaction` COMMITE dès que cette fonction REND une valeur (client.ts:52-54) :
    //   un refus rendu APRÈS un UPDATE serait un refus… qui aurait quand même écrit. Le piège a été reproduit sur base
    //   réelle (lot 4b) : rattacher un échange à l'événement où il est DÉJÀ répondait « déjà rattaché » tout en ayant
    //   désactivé son affectation ; l'échange restait à l'état « affecte » sans carte, invisible des DEUX côtés de
    //   l'écran. D'où l'ordre ici : LIRE (verrouillé), refuser si rien à faire, et n'écrire qu'ensuite.
    //   Le FOR UPDATE sérialise deux clics simultanés : le second voit l'état laissé par le premier, jamais l'ancien.
    const { rows: active } = await q<{ id: number; evenement_id: number }>(
      `SELECT id::int AS id, evenement_id::int AS evenement_id FROM gestion_affectation
        WHERE fil_id = $1 AND actif${surLEchange} FOR UPDATE`, [filId]);
    if (active[0] && active[0].evenement_id === evenementId) {
      return { ok: false, motif: 'Cet échange est déjà rattaché à cet événement.' };
    }

    // RÉAFFECTATION : on désactive l'ancienne AVANT d'insérer la nouvelle — l'index unique partiel l'exige, et c'est
    //   aussi l'ordre honnête : un échange n'est jamais « dans deux cartes à la fois », même une fraction de seconde.
    const { rows: ancienne } = active[0]
      ? await q<{ id: number; evenement_id: number }>(
        `UPDATE gestion_affectation SET actif = false, detache_le = now(), detache_par = $2, detache_par_libelle = $3,
                detache_motif = 'réaffecté à un autre événement'
          WHERE fil_id = $1 AND actif${surLEchange} RETURNING id::int AS id, evenement_id::int AS evenement_id`,
        [filId, auteur.id, auteur.libelle])
      : { rows: [] as { id: number; evenement_id: number }[] };
    if (ancienne[0]) {
      await journaliser(q, 'affectation', ancienne[0].id, 'detachement', auteur,
        `échange ${filId} détaché de l’événement ${ancienne[0].evenement_id} (réaffectation)`);
    }

    const { rows: nouvelle } = await q<{ id: number }>(
      `INSERT INTO gestion_affectation (fil_id, evenement_id, motif, affecte_par, affecte_par_libelle)
       VALUES ($1,$2,$3,$4,$5) RETURNING id::int AS id`,
      [filId, evenementId, texte(motif, MAX_LONG) ?? 'rattaché à la main depuis la file', auteur.id, auteur.libelle]);
    await q(`UPDATE gestion_fil SET etat = 'affecte', maj_le = now() WHERE id = $1`, [filId]);
    await journaliser(q, 'affectation', nouvelle[0].id, 'affectation', auteur,
      `échange ${filId} rattaché à l’événement ${reference}`, fil[0].etat, 'affecte');
    return { ok: true, evenementId, reference };
  });
}

/**
 * DÉTACHE un échange de son événement : il retourne dans la file. L'affectation n'est pas supprimée, elle est
 * DÉSACTIVÉE et datée — six mois après, on doit pouvoir dire où cet échange a été rangé, et par qui.
 */
export async function detacher(filId: number, auteur: Auteur, motif?: string | null): Promise<Issue> {
  // Détacher l'ÉCHANGE ne touche pas aux mails qu'on en avait sortis : ils appartiennent à leur carte, pas à celle-ci.
  const surLEchange = await seulementLEchange();
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: number; evenement_id: number }>(
      `UPDATE gestion_affectation SET actif = false, detache_le = now(), detache_par = $2, detache_par_libelle = $3,
              detache_motif = $4
        WHERE fil_id = $1 AND actif${surLEchange} RETURNING id::int AS id, evenement_id::int AS evenement_id`,
      [filId, auteur.id, auteur.libelle, texte(motif, MAX_LONG)]);
    if (!rows[0]) return { ok: false, motif: 'Cet échange n’est rattaché à aucun événement.' };
    await q(`UPDATE gestion_fil SET etat = 'a_classer', maj_le = now() WHERE id = $1`, [filId]);
    await journaliser(q, 'affectation', rows[0].id, 'detachement', auteur,
      `échange ${filId} détaché de l’événement ${rows[0].evenement_id} : il revient dans la file`, 'affecte', 'a_classer');
    return { ok: true, evenementId: rows[0].evenement_id };
  });
}

/**
 * CLASSE SANS SUITE : le geste porte sur TOUT l'échange, et le motif est FACULTATIF — exiger une justification pour
 * écarter une facture pour information ferait qu'on n'écarterait plus rien.
 *
 * ⚠️ CE N'EST PAS UNE SUPPRESSION, et ce n'est pas définitif : si un NOUVEAU message non exclu arrive plus tard dans cet
 * échange, il le RAMÈNE dans la file (décision d'Arno, tenue par la capture, et journalisée). Sans quoi une facture
 * mensuelle écartée une fois le resterait pour toujours, relance comprise.
 */
export async function classerSansSuite(filId: number, auteur: Auteur, motif?: string | null): Promise<Issue> {
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: number; etat: string }>(
      `UPDATE gestion_fil SET etat = 'sans_suite', sans_suite_le = now(), sans_suite_par = $2,
              sans_suite_par_libelle = $3, sans_suite_motif = $4, maj_le = now()
        WHERE id = $1 AND etat <> 'sans_suite' RETURNING id::int AS id, etat`,
      [filId, auteur.id, auteur.libelle, texte(motif, MAX_LONG)]);
    if (!rows[0]) return { ok: false, motif: 'Cet échange est déjà classé sans suite, ou n’existe pas.' };
    await journaliser(q, 'fil', filId, 'sans_suite', auteur,
      texte(motif, MAX_LONG) ?? 'classé sans suite, sans motif précisé', 'a_classer', 'sans_suite');
    return { ok: true };
  });
}

/** ROUVRE un échange classé sans suite : il revient dans la file. Le motif d'origine est effacé — il n'a plus cours. */
export async function rouvrir(filId: number, auteur: Auteur): Promise<Issue> {
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: number }>(
      `UPDATE gestion_fil SET etat = 'a_classer', sans_suite_le = NULL, sans_suite_par = NULL,
              sans_suite_par_libelle = NULL, sans_suite_motif = NULL, maj_le = now()
        WHERE id = $1 AND etat = 'sans_suite' RETURNING id::int AS id`, [filId]);
    if (!rows[0]) return { ok: false, motif: 'Cet échange n’est pas classé sans suite.' };
    await journaliser(q, 'fil', filId, 'reprise', auteur, 'rouvert à la main : l’échange revient dans la file', 'sans_suite', 'a_classer');
    return { ok: true };
  });
}

/**
 * DÉPLACE UN SEUL MAIL vers une autre carte que son échange (lot 4d-B2, migration 234).
 *
 * POURQUOI : un fil dérive. On parle d'un préavis de départ, et trois messages plus bas quelqu'un signale une fuite.
 * Sans ce geste, l'une des deux affaires se retrouve rangée sous le titre de l'autre.
 *
 * CE QUI SE PASSE VRAIMENT : rien n'est déplacé. Le mail reste EXACTEMENT là où la relève l'a écrit, dans son fil, avec
 * ses pièces ; on ajoute une affectation qui ne porte que sur LUI et qui prime sur celle de son échange. D'où la
 * réversibilité intégrale : `remettreMessage` désactive la ligne et tout retrouve sa place.
 *
 * ⚠️ LE FIL EST LU SUR LE MESSAGE, jamais reçu de l'appelant : la base ne peut pas vérifier par un CHECK qu'un
 * `message_id` appartient bien au `fil_id` de la même ligne (un CHECK n'interroge pas une autre table). C'est donc ici
 * que la cohérence se tient, et un test l'éprouve.
 *
 * LES RÉPONSES SUIVENT : voir `suivreLeMailDeplace`, appelée par la capture. Déplacer un mail sans emmener ses
 * réponses futures produirait, à la relève suivante, une conversation coupée en deux entre deux cartes.
 */
export async function deplacerMessage(messageId: number, evenementId: number, auteur: Auteur): Promise<Issue> {
  return withTransaction(async (q) => {
    // LIRE AVANT D'ÉCRIRE (withTransaction commite au retour, cf. db/client.ts:52-54) — et verrouiller, pour que deux
    //   clics simultanés se suivent au lieu de se croiser.
    const { rows: msg } = await q<{ id: number; fil_id: number; objet: string | null }>(
      `SELECT id::int AS id, fil_id::int AS fil_id, objet FROM gestion_message WHERE id = $1 FOR UPDATE`, [messageId]);
    if (!msg[0]) return { ok: false, motif: 'Ce message n’existe pas.' };

    const { rows: ev } = await q<{ reference: string }>(
      `SELECT reference FROM gestion_evenement WHERE id = $1`, [evenementId]);
    if (!ev[0]) return { ok: false, motif: 'Cet événement n’existe pas.' };

    const { rows: active } = await q<{ id: number; evenement_id: number }>(
      `SELECT id::int AS id, evenement_id::int AS evenement_id FROM gestion_affectation
        WHERE message_id = $1 AND actif FOR UPDATE`, [messageId]);
    if (active[0] && active[0].evenement_id === evenementId) {
      return { ok: false, motif: 'Ce mail est déjà rattaché à cet événement.' };
    }

    if (active[0]) {
      await q(
        `UPDATE gestion_affectation SET actif = false, detache_le = now(), detache_par = $2, detache_par_libelle = $3,
                detache_motif = 'redéplacé vers un autre événement'
          WHERE id = $1`, [active[0].id, auteur.id, auteur.libelle]);
      await journaliser(q, 'affectation', active[0].id, 'detachement', auteur,
        `mail ${messageId} retiré de l’événement ${active[0].evenement_id} (redéplacement)`);
    }

    const { rows: nouvelle } = await q<{ id: number }>(
      `INSERT INTO gestion_affectation (fil_id, evenement_id, message_id, motif, affecte_par, affecte_par_libelle)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::int AS id`,
      [msg[0].fil_id, evenementId, messageId, 'mail déplacé à la main depuis son échange', auteur.id, auteur.libelle]);
    await journaliser(q, 'affectation', nouvelle[0].id, 'affectation', auteur,
      `mail ${messageId} (« ${texte(msg[0].objet) ?? 'sans objet'} ») rattaché à l’événement ${ev[0].reference}, sans son échange`);
    return { ok: true, evenementId, reference: ev[0].reference };
  });
}

/** REMET un mail déplacé dans son échange. L'affectation n'est pas supprimée : désactivée et datée, comme partout ici. */
export async function remettreMessage(messageId: number, auteur: Auteur): Promise<Issue> {
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: number; evenement_id: number }>(
      `UPDATE gestion_affectation SET actif = false, detache_le = now(), detache_par = $2, detache_par_libelle = $3,
              detache_motif = 'remis dans son échange'
        WHERE message_id = $1 AND actif RETURNING id::int AS id, evenement_id::int AS evenement_id`,
      [messageId, auteur.id, auteur.libelle]);
    if (!rows[0]) return { ok: false, motif: 'Ce mail n’a pas été déplacé.' };
    await journaliser(q, 'affectation', rows[0].id, 'detachement', auteur,
      `mail ${messageId} remis dans son échange (il quitte l’événement ${rows[0].evenement_id})`);
    return { ok: true, evenementId: rows[0].evenement_id };
  });
}

/**
 * LA RÈGLE QUI ÉVITE LES CONVERSATIONS COUPÉES EN DEUX : un message qui RÉPOND à un mail déplacé va, lui aussi, dans
 * la carte où ce mail a été rangé. Appelée par la capture après l'écriture d'un message, avec les `Message-ID` que ses
 * en-têtes `In-Reply-To` et `References` citent.
 *
 * Sans elle, on déplace un mail aujourd'hui et la réponse de demain retombe dans l'échange d'origine : deux moitiés
 * d'une même conversation dans deux cartes, ce qui est pire que de n'avoir rien déplacé du tout.
 *
 * SILENCIEUSE PAR CONSTRUCTION : aucune citation, aucun mail déplacé cité, ou un mail déjà rattaché → elle ne fait
 * rien. Elle ne peut pas non plus écraser un rattachement posé à la main, puisqu'elle ne touche qu'un message SANS
 * affectation active.
 */
export async function suivreLeMailDeplace(
  q: RequeteTx, messageId: number, filId: number, citations: readonly string[],
): Promise<{ suivi: boolean; evenementId?: number }> {
  const cites = citations.map((c) => c.trim()).filter((c) => c !== '').slice(0, 50);
  if (cites.length === 0) return { suivi: false };

  const { rows } = await q<{ evenement_id: number; reference: string }>(
    `SELECT a.evenement_id::int AS evenement_id, e.reference
       FROM gestion_affectation a
       JOIN gestion_message m ON m.id = a.message_id
       JOIN gestion_evenement e ON e.id = a.evenement_id
      WHERE a.actif AND a.message_id IS NOT NULL AND m.message_id = ANY($1::text[])
      ORDER BY a.affecte_le DESC LIMIT 1`, [cites]);
  if (!rows[0]) return { suivi: false };

  const { rows: deja } = await q<{ id: number }>(
    `SELECT id FROM gestion_affectation WHERE message_id = $1 AND actif`, [messageId]);
  if (deja[0]) return { suivi: false };

  const { rows: nouvelle } = await q<{ id: number }>(
    `INSERT INTO gestion_affectation (fil_id, evenement_id, message_id, motif, affecte_par_libelle)
     VALUES ($1,$2,$3,$4,$5) RETURNING id::int AS id`,
    [filId, rows[0].evenement_id, messageId, 'réponse à un mail déplacé : suit le mail', 'automatique']);
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
     VALUES ('affectation', $1, 'affectation', $2, 'automatique')`,
    [nouvelle[0].id, `mail ${messageId} rattaché à ${rows[0].reference} : il répond à un mail déplacé vers cet événement`]);
  return { suivi: true, evenementId: rows[0].evenement_id };
}

/** Les champs d'une carte qu'un humain peut corriger. Tous facultatifs : on modifie ce qu'on veut, pas tout à la fois. */
export interface ChampsEvenement {
  objet?: string | null;
  demandeurNom?: string | null;
  demandeurEmail?: string | null;
  adresseLibre?: string | null;
}

/** Les trois états d'une carte. La liste est COURTE exprès (cf. migration 228) : on n'invente pas de workflow. */
export type EtatEvenement = 'a_traiter' | 'en_cours' | 'traite';
const ETATS: readonly EtatEvenement[] = ['a_traiter', 'en_cours', 'traite'];
export const estEtat = (v: unknown): v is EtatEvenement => typeof v === 'string' && (ETATS as readonly string[]).includes(v);

/**
 * MODIFIE ce que porte une carte (quoi / qui demande / adresse). Le pré-remplissage ne devine que ce qui est écrit dans
 * le mail : il fallait donc pouvoir CORRIGER à la main, sinon une proposition approximative serait devenue une vérité.
 *
 * Journalisé champ par champ, avec l'ANCIENNE et la NOUVELLE valeur : six mois après, on doit pouvoir dire qui a changé
 * l'adresse d'une carte, et ce qu'elle disait avant. L'objet ne peut pas être vidé (contrainte en base, et bon sens :
 * une carte sans titre n'est plus retrouvable) ; les autres champs, si — effacer une donnée fausse est légitime.
 */
export async function modifierEvenement(evenementId: number, champs: ChampsEvenement, auteur: Auteur): Promise<Issue> {
  const demande: [keyof ChampsEvenement, string, string | null][] = [];
  if (champs.objet !== undefined) {
    const objet = texte(champs.objet);
    if (objet === null) return { ok: false, motif: 'Le « quoi » ne peut pas être vide : sans lui la carte devient introuvable.' };
    demande.push(['objet', 'objet', objet]);
  }
  if (champs.demandeurNom !== undefined) demande.push(['demandeurNom', 'demandeur_nom', texte(champs.demandeurNom)]);
  if (champs.demandeurEmail !== undefined) demande.push(['demandeurEmail', 'demandeur_email', texte(champs.demandeurEmail)]);
  if (champs.adresseLibre !== undefined) demande.push(['adresseLibre', 'adresse_libre', texte(champs.adresseLibre)]);
  if (demande.length === 0) return { ok: false, motif: 'Rien à modifier.' };

  return withTransaction(async (q) => {
    // LIRE AVANT D'ÉCRIRE : `withTransaction` commite au retour (db/client.ts:52-54), donc un refus rendu après une
    //   écriture serait un refus qui a écrit. Et la lecture sert aussi au journal : sans l'AVANT, une trace ne dit rien.
    const { rows: avant } = await q<Record<string, string | null>>(
      `SELECT objet, demandeur_nom, demandeur_email, adresse_libre, reference FROM gestion_evenement
        WHERE id = $1 FOR UPDATE`, [evenementId]);
    if (!avant[0]) return { ok: false, motif: 'Cet événement n’existe pas.' };

    // Seuls les champs qui CHANGENT VRAIMENT sont écrits et journalisés : rouvrir un formulaire et le valider sans
    //   rien toucher ne doit pas remplir le journal de lignes qui ne racontent rien.
    const changes = demande.filter(([, colonne, valeur]) => (avant[0][colonne] ?? null) !== valeur);
    if (changes.length === 0) return { ok: true, evenementId };

    const set = changes.map(([, colonne], i) => `${colonne} = $${i + 2}`).join(', ');
    await q(`UPDATE gestion_evenement SET ${set}, maj_le = now() WHERE id = $1`,
      [evenementId, ...changes.map(([, , valeur]) => valeur)]);
    for (const [nom, colonne, valeur] of changes) {
      await journaliser(q, 'evenement', evenementId, 'modification', auteur,
        `${nom} modifié sur ${avant[0].reference}`, avant[0][colonne] ?? null, valeur);
    }
    return { ok: true, evenementId };
  });
}

/**
 * CHANGE L'ÉTAT d'une carte. « traité » pose la DATE DE TRAITEMENT et le nom de celui qui l'a posée ; revenir en
 * arrière les efface — la base l'EXIGE (`gestion_evenement_traite_chk` : l'état et la date vont ensemble, migration
 * 228). Cette contrainte est une bonne nouvelle : elle rend impossible une carte « traitée » sans date, c'est-à-dire
 * introuvable dans l'historique.
 *
 * Revenir de « traité » à « en cours » est un geste NORMAL, pas une réparation : un dossier se rouvre.
 */
export async function changerEtatEvenement(evenementId: number, etat: EtatEvenement, auteur: Auteur): Promise<Issue> {
  return withTransaction(async (q) => {
    const { rows } = await q<{ etat: string; reference: string }>(
      `SELECT etat, reference FROM gestion_evenement WHERE id = $1 FOR UPDATE`, [evenementId]);
    if (!rows[0]) return { ok: false, motif: 'Cet événement n’existe pas.' };
    if (rows[0].etat === etat) return { ok: false, motif: `Cet événement est déjà « ${etat} ».` };

    await q(
      `UPDATE gestion_evenement
          SET etat = $2,
              traite_le = CASE WHEN $2 = 'traite' THEN now() ELSE NULL END,
              traite_par = CASE WHEN $2 = 'traite' THEN $3::bigint ELSE NULL END,
              traite_par_libelle = CASE WHEN $2 = 'traite' THEN $4 ELSE NULL END,
              maj_le = now()
        WHERE id = $1`, [evenementId, etat, auteur.id, auteur.libelle]);
    await journaliser(q, 'evenement', evenementId, 'etat', auteur,
      `état de ${rows[0].reference} changé à la main`, rows[0].etat, etat);
    return { ok: true, evenementId };
  });
}

/** Les événements OUVERTS, pour le sélecteur « rattacher à un événement existant ». Les plus récents d'abord. */
export async function listerEvenementsOuverts(limite = 50): Promise<{ id: number; reference: string; objet: string }[]> {
  const { rows } = await query<{ id: number; reference: string; objet: string }>(
    `SELECT id::int AS id, reference, objet FROM gestion_evenement
      WHERE traite_le IS NULL ORDER BY ouvert_le DESC, id DESC LIMIT $1`, [limite]);
  return rows;
}

/**
 * Ce qu'on sait d'un échange pour PRÉ-REMPLIR une nouvelle carte : son objet, et l'interlocuteur du dernier message
 * REÇU (celui qui demande — pas nous). Rien n'est deviné au-delà de ce que le mail contient, et tout reste modifiable
 * à l'écran : la proposition est une commodité, jamais une vérité.
 */
export async function preremplir(filId: number): Promise<NouvelEvenement | null> {
  const { rows } = await query<{ objet: string | null; nom: string | null; email: string | null; corps: string | null }>(
    `SELECT f.objet_initial AS objet,
            (SELECT nullif(btrim(m.de_nom), '') FROM gestion_message m
              WHERE m.fil_id = f.id AND m.sens = 'recu' AND m.exclu_le IS NULL
              ORDER BY m.recu_le DESC LIMIT 1) AS nom,
            (SELECT m.de_adresse FROM gestion_message m
              WHERE m.fil_id = f.id AND m.sens = 'recu' AND m.exclu_le IS NULL
              ORDER BY m.recu_le DESC LIMIT 1) AS email,
            (SELECT left(m.corps_texte, 2000) FROM gestion_message m
              WHERE m.fil_id = f.id AND m.sens = 'recu' AND m.exclu_le IS NULL
              ORDER BY m.recu_le ASC LIMIT 1) AS corps
       FROM gestion_fil f WHERE f.id = $1`, [filId]);
  const r = rows[0];
  if (!r) return null;
  // LOT 4c — l'objet est débarrassé de sa cascade de « Re: / TR: / Fwd: », et l'adresse est LUE dans le mail quand elle
  //   y est écrite (sinon le champ reste vide). Les deux passent par des fonctions PURES, éprouvées sur des objets réels.
  //   On nettoie à la SOURCE : la carte créée à partir de cette proposition naît donc avec un titre propre, sans qu'on
  //   ait jamais à réécrire une donnée déjà enregistrée.
  const objet = nettoyerObjet(r.objet);
  return {
    objet: objet || '(sans objet)',
    demandeurNom: r.nom,
    demandeurEmail: r.email,
    adresseLibre: adresseProposee(r.objet, r.corps),
  };
}
