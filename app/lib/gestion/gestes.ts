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
import { query, withTransaction } from '../db/client';

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
  const objetNouveau = cible.nouveau ? texte(cible.nouveau.objet) : null;
  if (cible.evenementId === undefined && objetNouveau === null) {
    return { ok: false, motif: 'Indiquez l’événement à rattacher, ou donnez un objet au nouvel événement.' };
  }
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
        WHERE fil_id = $1 AND actif FOR UPDATE`, [filId]);
    if (active[0] && active[0].evenement_id === evenementId) {
      return { ok: false, motif: 'Cet échange est déjà rattaché à cet événement.' };
    }

    // RÉAFFECTATION : on désactive l'ancienne AVANT d'insérer la nouvelle — l'index unique partiel l'exige, et c'est
    //   aussi l'ordre honnête : un échange n'est jamais « dans deux cartes à la fois », même une fraction de seconde.
    const { rows: ancienne } = active[0]
      ? await q<{ id: number; evenement_id: number }>(
        `UPDATE gestion_affectation SET actif = false, detache_le = now(), detache_par = $2, detache_par_libelle = $3,
                detache_motif = 'réaffecté à un autre événement'
          WHERE fil_id = $1 AND actif RETURNING id::int AS id, evenement_id::int AS evenement_id`,
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
  return withTransaction(async (q) => {
    const { rows } = await q<{ id: number; evenement_id: number }>(
      `UPDATE gestion_affectation SET actif = false, detache_le = now(), detache_par = $2, detache_par_libelle = $3,
              detache_motif = $4
        WHERE fil_id = $1 AND actif RETURNING id::int AS id, evenement_id::int AS evenement_id`,
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
  const { rows } = await query<{ objet: string | null; nom: string | null; email: string | null }>(
    `SELECT f.objet_initial AS objet,
            (SELECT nullif(btrim(m.de_nom), '') FROM gestion_message m
              WHERE m.fil_id = f.id AND m.sens = 'recu' AND m.exclu_le IS NULL
              ORDER BY m.recu_le DESC LIMIT 1) AS nom,
            (SELECT m.de_adresse FROM gestion_message m
              WHERE m.fil_id = f.id AND m.sens = 'recu' AND m.exclu_le IS NULL
              ORDER BY m.recu_le DESC LIMIT 1) AS email
       FROM gestion_fil f WHERE f.id = $1`, [filId]);
  const r = rows[0];
  if (!r) return null;
  return { objet: r.objet ?? '(sans objet)', demandeurNom: r.nom, demandeurEmail: r.email, adresseLibre: null };
}
