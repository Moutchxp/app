import 'server-only';
/**
 * Module INTERNAUTE — LOT 4 : CYCLE DE VIE (serveur only). Effacement asymétrique, rectification, purge à échéance.
 *
 * Utilise le pool applicatif `app/lib/db/client.ts` (JAMAIS `poolAnalytics`). AUCUN import `app/lib/analytics/*`
 * ni moteur → cloisonnement M2 respecté. Le moteur n'est jamais rappelé → golden intact.
 *
 * ⚠️ RÈGLE ASYMÉTRIQUE D'EFFACEMENT (invariant central) : un effacement ANONYMISE l'identité (bloc A : PII → NULL,
 * `efface_a` posé) et SUPPRIME le projet (bloc C : lignes `internaute_projet`), mais NE TOUCHE JAMAIS les preuves
 * de consentement (bloc B : `internaute_consentement`, append-only). La ligne `internaute` est CONSERVÉE (anonymisée)
 * → son UUID reste le pivot des preuves B → intégrité référentielle intacte ET preuve conservée pour un contrôle.
 * Après effacement, le profil disparaît des extractions (filtre `efface_a IS NULL` dans `extractionRepo.ts`).
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import type { ChampsRectification } from './rectification';
import { assurerTexteConsentement, insererConsentement } from './socle';
import { texteCourant, type CleFinalite } from './textesConsentement';

/** Levée si la rectification d'email heurte l'unicité applicative (`lower(email)`). */
export class ErreurEmailDuplique extends Error {
  constructor() {
    super('email déjà utilisé par un autre internaute');
    this.name = 'ErreurEmailDuplique';
  }
}

function estCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === code;
}

/** Journal append-only des opérations de cycle de vie (accountability). `details` NE contient JAMAIS de PII. */
async function journaliserCycleVie(
  q: RequeteTx,
  auteurId: number | null,
  action: 'effacement' | 'rectification' | 'purge_auto' | 'retrait_consentement',
  cibleId: string,
  details: Record<string, unknown> | null,
): Promise<void> {
  await q(
    `INSERT INTO internaute_cycle_vie_log (utilisateur_id, action, cible_internaute_id, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [auteurId, action, cibleId, details ? JSON.stringify(details) : null],
  );
}

/**
 * ANONYMISATION EN PLACE de l'IDENTITÉ d'un ou plusieurs profils : NULLifie les PII (A) et pose `efface_a`. NE SUPPRIME
 * PLUS le projet (Commit 4) — le certificat/PDF SURVIT (vérifiable par jeton) ; de toute façon la FK `certificat.projet_id`
 * (NO ACTION) INTERDIT de supprimer un projet porteur de certificat (l'ancien DELETE échouait en 503). NE TOUCHE PAS
 * `internaute_consentement` (B) — la preuve survit. Idempotent (`WHERE efface_a IS NULL`). Un UPDATE d'identité ne heurte
 * AUCUNE FK (la ligne internaute reste, seules ses PII passent à NULL).
 *
 * CREDENTIAL (Commit B) : SUPPRIME aussi `internaute_auth` — une identité effacée ne doit conserver AUCUN moyen de
 * connexion (le hash de mot de passe ne survit pas à un compte effacé). C'est le point de passage UNIQUE de tout
 * effacement d'identité de `cycleVie` (admin `effacerInternaute` + purge) → la suppression du credential y est centralisée.
 */
async function anonymiserEnPlace(q: RequeteTx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await q(
    `UPDATE internaute
       SET prenom = NULL, nom = NULL, email = NULL, telephone = NULL, efface_a = now(), maj_a = now()
     WHERE id = ANY($1::uuid[]) AND efface_a IS NULL`,
    [ids],
  );
  // CREDENTIAL (Commit B) : DELETE EXPLICITE. La ligne `internaute` n'est JAMAIS supprimée (anonymisation en place) → la
  // FK `internaute_auth ... ON DELETE CASCADE` ne se déclenche PAS ; sans ce DELETE, le hash survivrait à l'effacement.
  // No-op si l'internaute n'a pas de compte (cas nominal d'une purge / d'un non-titulaire).
  await q(`DELETE FROM internaute_auth WHERE internaute_id = ANY($1::uuid[])`, [ids]);
  // Projet (bloc C) : CONSERVÉ — rattaché à l'UUID désormais SANS PII ; le certificat le référence et doit rester
  // vérifiable → JAMAIS supprimé. Bloc B (`internaute_consentement`) : intact (append-only, preuve conservée).
}

/**
 * EFFACEMENT SUR DEMANDE d'un profil (droit à l'effacement). Transactionnel, admin-only (garde en amont dans la route).
 * Anonymise l'IDENTITÉ en CONSERVANT projet + certificat (Commit 4 : le PDF reste vérifiable ; RÉPARE le 503 qui frappait
 * tout porteur de certificat via l'ancien DELETE de projet). Renvoie `{ efface: false }` si l'id n'existe pas. Preuve B conservée.
 */
export async function effacerInternaute(id: string, auteurId: number | null): Promise<{ efface: boolean }> {
  return withTransaction(async (q) => {
    const existe = await q(`SELECT 1 FROM internaute WHERE id = $1`, [id]);
    if (existe.rows.length === 0) return { efface: false };
    await anonymiserEnPlace(q, [id]);
    await journaliserCycleVie(q, auteurId, 'effacement', id, { strategie: 'anonymisation_identite', projet: 'conserve', preuve_b: 'conservee' });
    return { efface: true };
  });
}

/**
 * EFFACEMENT AUTOMATIQUE de l'identité de LIVRAISON (Commit 4 — A2). Appelé UNIQUEMENT après un envoi CONFIRMÉ du
 * certificat (statut `certificat_acheminement='envoye'`, cf. `publierEnvoiCertificat`) — JAMAIS avant : un envoi raté ne
 * doit pas effacer l'identité et laisser l'internaute sans certificat livré. Si l'internaute est NON-CONSENTANT (0
 * consentement actif), anonymise IMMÉDIATEMENT son identité (nom/prénom/e-mail/téléphone → NULL) en CONSERVANT projet +
 * certificat (vérifiable par jeton). Un CONSENTANT n'est JAMAIS effacé automatiquement (droit à l'oubli sur demande admin
 * uniquement). `auteurId = null` (acte automatique). BEST-EFFORT : ne throw JAMAIS (ne perturbe ni l'envoi ni l'émission).
 */
export async function effacerIdentiteLivraisonSiEligible(internauteId: string): Promise<void> {
  try {
    // NON-CONSENTANT ? 0 consentement actif (identique à l'exclusion de la vue `internaute_commercial`, Commit 1).
    const consent = await query(
      `SELECT 1 FROM internaute_consentement_actif WHERE internaute_id = $1 AND actif = true LIMIT 1`,
      [internauteId],
    );
    if (consent.rows.length > 0) return; // CONSENTANT → aucun effacement automatique

    // TITULAIRE DE COMPTE ? (Commit B) La seule présence d'une ligne `internaute_auth` EXCLUT l'auto-effacement : créer
    // un compte établit une relation de SERVICE (base légale distincte du marketing) qui prime — un titulaire, MÊME sans
    // consentement, n'est JAMAIS anonymisé automatiquement. Fiable ICI car le compte est créé AVANT l'envoi du certificat
    // (parcours produit), donc AVANT ce point. Le droit à l'oubli d'un titulaire passe par la voie ADMIN (`effacerInternaute`),
    // qui — via `anonymiserEnPlace` — SUPPRIME aussi le credential. Formulé `NOT EXISTS (ligne internaute_auth)`.
    const compte = await query(
      `SELECT 1 FROM internaute_auth WHERE internaute_id = $1 LIMIT 1`,
      [internauteId],
    );
    if (compte.rows.length > 0) return; // TITULAIRE DE COMPTE → jamais d'auto-effacement

    await withTransaction(async (q) => {
      await anonymiserEnPlace(q, [internauteId]); // identité NULL + efface_a ; projet + certificat CONSERVÉS
      await journaliserCycleVie(q, null, 'effacement', internauteId, {
        strategie: 'anonymisation_identite',
        auto: true,
        contexte: 'livraison_non_consentant',
        projet: 'conserve',
        preuve_b: 'conservee',
      });
    });
  } catch (e) {
    // Best-effort : ne throw JAMAIS. Un échec laisse l'identité NON effacée (rattrapable par effacement admin / purge).
    console.error('[cycle-vie] effacement identité livraison indisponible', (e as Error)?.name ?? 'Erreur');
  }
}

const COLONNES_RECTIFIABLES: Record<keyof ChampsRectification, string> = {
  prenom: 'prenom',
  nom: 'nom',
  email: 'email',
  telephone: 'telephone',
};

/**
 * RECTIFICATION d'identité (droit de rectification, bloc A uniquement). Transactionnel, admin-only. Ne touche NI
 * les preuves B NI le moteur. Refuse sur un profil déjà effacé (`efface_a` non NULL → rien à rectifier). Lève
 * `ErreurEmailDuplique` si l'email heurte l'unicité. `{ rectifie: false }` si l'id n'existe pas / est effacé.
 */
export async function rectifierInternaute(
  id: string,
  champs: ChampsRectification,
  auteurId: number | null,
): Promise<{ rectifie: boolean }> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [cle, valeur] of Object.entries(champs)) {
    const colonne = COLONNES_RECTIFIABLES[cle as keyof ChampsRectification];
    if (!colonne) continue; // whitelist stricte : jamais de nom de colonne dérivé de l'entrée
    params.push(valeur);
    sets.push(`${colonne} = $${params.length}`);
  }
  if (sets.length === 0) return { rectifie: false };
  sets.push('maj_a = now()');

  try {
    return await withTransaction(async (q) => {
      const r = await q<{ id: string }>(
        `UPDATE internaute SET ${sets.join(', ')} WHERE id = $1 AND efface_a IS NULL RETURNING id`,
        params,
      );
      if (r.rows.length === 0) return { rectifie: false };
      // Journal SANS PII : on trace QUELS champs ont changé, jamais leurs valeurs.
      await journaliserCycleVie(q, auteurId, 'rectification', id, { champs: Object.keys(champs) });
      return { rectifie: true };
    });
  } catch (e) {
    if (estCode(e, '23505')) throw new ErreurEmailDuplique();
    throw e;
  }
}

/** Consentement souhaité à l'Écran B (case cochée), par finalité + version du texte affiché (catalogue). */
export interface SouhaitConsentement {
  finalite: CleFinalite;
  version: number;
}

/**
 * COMPLÉTION DU PARCOURS (Écran B) sur un profil EXISTANT (créé à l'Écran A). UNE transaction :
 *  1. UPDATE identité (email/tél — les coordonnées de B FONT FOI) + `parcours='complet'` + `maj_a`, profil non
 *     effacé (`efface_a IS NULL`) — whitelist STRICTE `COLONNES_RECTIFIABLES` pour les coordonnées ;
 *  2. RÉCONCILIATION des consentements du `scope` (finalités PRÉSENTÉES à l'Écran B, aujourd'hui F2 seulement), ACCORD-ONLY :
 *     coché & inactif → nouvelle ligne 'accorde' ; tout le reste (déjà actif, ou ABSENT du corps) → RIEN. Le TUNNEL NE
 *     RETIRE JAMAIS (règle produit) — l'absence d'une finalité ne produit AUCUN 'retire' ; le retrait passe par les voies
 *     dédiées hors tunnel (admin, lien e-mail). JAMAIS d'UPDATE d'une preuve. Les finalités HORS `scope` (ex. F1, décidé à
 *     l'Écran A) ne sont de toute façon jamais touchées ici ;
 *  3. journal 'rectification' (champs changés + `parcours`), SANS valeurs.
 * Le consentement reste rattaché à l'UUID STABLE : changer la coordonnée n'altère aucune preuve. `{ complete:false }`
 * si l'id n'existe pas / est effacé. Lève `ErreurEmailDuplique` sur collision d'email (unicité applicative).
 */
export async function completerParcours(
  id: string,
  coords: ChampsRectification,
  souhaites: SouhaitConsentement[],
  scope: readonly CleFinalite[],
  projetId: number | null,
  auteurId: number | null,
): Promise<{ complete: boolean }> {
  const sets: string[] = ["parcours = 'complet'", 'maj_a = now()'];
  const params: unknown[] = [id];
  for (const [cle, valeur] of Object.entries(coords)) {
    const colonne = COLONNES_RECTIFIABLES[cle as keyof ChampsRectification];
    if (!colonne) continue; // whitelist stricte : jamais de nom de colonne dérivé de l'entrée
    params.push(valeur);
    sets.push(`${colonne} = $${params.length}`);
  }
  try {
    return await withTransaction(async (q) => {
      const r = await q<{ id: string }>(
        `UPDATE internaute SET ${sets.join(', ')} WHERE id = $1 AND efface_a IS NULL RETURNING id`,
        params,
      );
      if (r.rows.length === 0) return { complete: false }; // introuvable ou déjà effacé
      // RÉCONCILIATION ACCORD-ONLY, LIMITÉE au `scope`. RÈGLE PRODUIT (fondateur, non négociable) : un consentement est
      // DÉFINITIVEMENT ACQUIS via l'application ; LE TUNNEL NE PEUT QU'ACCORDER, JAMAIS RETIRER. Un retrait n'existe que
      // hors tunnel, par deux voies dédiées (page admin internautes ; lien de désabonnement dans l'e-mail) — celles-là
      // appellent `insererConsentement(... 'retire')` (conservé dans socle.ts), PAS ce chemin.
      // ⚠️ NE PAS RÉ-AJOUTER de branche de retrait ici : l'ABSENCE d'une finalité dans le corps NE DOIT JAMAIS produire un
      // 'retire'. Ce n'est pas un oubli — c'est la garantie, INTERNE à la fonction (indépendante du scope et de l'appelant),
      // qu'aucun internaute ne perd un consentement acquis parce qu'il revient et ne re-coche pas la même case.
      const actifs = await q<{ finalite: string; actif: boolean }>(
        `SELECT finalite, actif FROM internaute_consentement_actif WHERE internaute_id = $1`,
        [id],
      );
      const estActif = new Map(actifs.rows.map((row) => [row.finalite, row.actif === true]));
      const souhaite = new Map(souhaites.map((s) => [s.finalite, s.version]));
      for (const finalite of scope) {
        const veut = souhaite.has(finalite);
        const actif = estActif.get(finalite) === true;
        // SEUL cas traité : coché & pas encore actif → nouvelle preuve 'accorde'. Tout le reste (déjà actif, ou absent)
        // → RIEN : jamais de doublon, et surtout jamais de retrait par absence.
        if (veut && !actif) {
          const texteId = await assurerTexteConsentement(q, finalite, souhaite.get(finalite) ?? texteCourant(finalite)?.version ?? 1);
          await insererConsentement(q, id, finalite, texteId, 'accorde');
        }
      }
      // STATUT CERTIFICAT PAR ANALYSE (migration 029) : marque l'analyse VALIDÉE à l'Écran B. GARDE IDOR STRICTE :
      // `WHERE id = projetId AND internaute_id = id` (id = UUID du jeton) → un internaute ne peut marquer QUE SES projets ;
      // un projetId d'un tiers ne matche rien (0 ligne, silencieux). NULL → rien à marquer.
      if (projetId != null) {
        await q(
          `UPDATE internaute_projet SET certificat_envoye = true WHERE id = $1 AND internaute_id = $2`,
          [projetId, id],
        );
      }
      await journaliserCycleVie(q, auteurId, 'rectification', id, { champs: Object.keys(coords), parcours: 'complet' });
      return { complete: true };
    });
  } catch (e) {
    if (estCode(e, '23505')) throw new ErreurEmailDuplique();
    throw e;
  }
}

/** Durée de rétention (jours) par clé. Absente → lève (fail-safe : on ne purge JAMAIS sans durée configurée). */
async function lireRetentionJours(cle: string): Promise<number> {
  const r = await query<{ jours: number }>(`SELECT jours FROM internaute_retention WHERE cle = $1`, [cle]);
  const j = r.rows[0]?.jours;
  if (typeof j !== 'number' || j <= 0) throw new Error(`rétention '${cle}' absente/invalide — purge annulée`);
  return j;
}

/**
 * PURGE À ÉCHÉANCE (déclenchable manuellement en LOCAL — pas de cron). Anonymise (règle asymétrique) les profils
 * dont la rétention identité+projet est DÉPASSÉE ET qui n'ont AUCUNE finalité active. La preuve B est conservée.
 * Renvoie le nombre de profils purgés. `auteurId` = admin déclencheur (ou NULL pour un déclenchement automatisé).
 */
export async function purgerEchus(auteurId: number | null = null): Promise<{ purges: number }> {
  const jours = await lireRetentionJours('identite_projet_jours');
  return withTransaction(async (q) => {
    const cand = await q<{ id: string }>(
      `SELECT i.id FROM internaute i
       WHERE i.efface_a IS NULL
         AND i.cree_a < now() - make_interval(days => $1)
         AND NOT EXISTS (
           SELECT 1 FROM internaute_consentement_actif ca WHERE ca.internaute_id = i.id AND ca.actif = true
         )
         -- TITULAIRE DE COMPTE (Commit B) : jamais purgé automatiquement. Même règle absolue que l'auto-effacement — un
         -- titulaire ne doit JAMAIS être anonymisé automatiquement (le compte = base légale SERVICE qui justifie la
         -- conservation), et anonymiser un titulaire NULLifierait son e-mail → login impossible (compte mort).
         AND NOT EXISTS (
           SELECT 1 FROM internaute_auth a WHERE a.internaute_id = i.id
         )`,
      [jours],
    );
    const ids = cand.rows.map((r) => r.id);
    if (ids.length === 0) return { purges: 0 };
    await anonymiserEnPlace(q, ids);
    for (const id of ids) await journaliserCycleVie(q, auteurId, 'purge_auto', id, { retention_jours: jours });
    return { purges: ids.length };
  });
}

/** Durées de rétention paramétrables (lecture, pour l'admin). */
export async function lireRetention(): Promise<{ cle: string; jours: number; description: string | null }[]> {
  const r = await query<{ cle: string; jours: number; description: string | null }>(
    `SELECT cle, jours, description FROM internaute_retention ORDER BY cle`,
  );
  return r.rows;
}

/** Contexte RGPD d'un retrait de consentement. Enum fermé (jamais de PII). `motif` = métadonnée admin OPTIONNELLE et
 *  courte (jamais l'identité de l'internaute — convention `rectifierInternaute` : on trace le contexte, pas les PII). */
export interface ContexteRetrait {
  aLaDemandeDe: 'internaute' | 'admin';
  motif?: string;
}

/**
 * RETRAIT d'un consentement (bloc B), HORS TUNNEL uniquement (page admin ; demain le lien e-mail). RÈGLE PRODUIT
 * (fondateur, non négociable) : l'admin PEUT retirer, ne PEUT JAMAIS ré-accorder — accorder est un acte de l'internaute
 * via le tunnel. GARANTIE DANS LE CODE, pas seulement en commentaire :
 *  - la fonction n'a AUCUN paramètre `etat` : elle passe le LITTÉRAL 'retire' à `insererConsentement`. Le `canal` est un
 *    paramètre TRAILING (défaut 'admin' ; 'email' pour la voie désabonnement) — il ne renseigne QUE la PROVENANCE de la
 *    décision, jamais son état. Aucun chemin n'insère 'accorde' d'ici : la garde tient parce que 'retire' reste littéral.
 *  - elle n'écrit QU'UNE ligne dans `internaute_consentement`. Elle ne touche NI `efface_a`, NI `internaute_projet`, NI
 *    les PII — et surtout PAS `opposition_recontact` (cf. garde ci-dessous).
 *
 * IDEMPOTENT : retirer une finalité DÉJÀ inactive n'insère RIEN → `{ retire:false, raison:'deja_inactif' }`. Choix
 * assumé : l'état voulu (finalité inactive) est déjà atteint ; un doublon 'retire' polluerait la chaîne append-only de
 * preuves sans rien changer. La route en fait un succès (200), pas une erreur. Profil inexistant/effacé → 'introuvable'.
 *
 * RETOUR GARANTI : après retrait, l'internaute revient par le tunnel (CAS 2 append-only) → nouvelle ligne 'accorde',
 * plus récente → la vue le repasse actif. Rien ici ne l'empêche (aucun flag posé, aucune PII touchée).
 */
export async function retirerConsentement(
  internauteId: string,
  finalite: CleFinalite,
  auteurId: number | null,
  contexte: ContexteRetrait,
  canal: string = 'admin', // PROVENANCE de la décision (défaut 'admin' → appelant admin inchangé ; 'email' = voie désabonnement)
): Promise<{ retire: boolean; raison?: 'introuvable' | 'deja_inactif' }> {
  return withTransaction(async (q) => {
    // Profil doit exister ET non effacé (comme `completerParcours`) : rien à retirer sur un dossier effacé.
    const prof = await q<{ id: string }>(`SELECT id FROM internaute WHERE id = $1 AND efface_a IS NULL`, [internauteId]);
    if (prof.rows.length === 0) return { retire: false, raison: 'introuvable' };

    // État actuel de CETTE finalité (vue = décision la plus récente).
    const etatActuel = await q<{ actif: boolean }>(
      `SELECT actif FROM internaute_consentement_actif WHERE internaute_id = $1 AND finalite = $2`,
      [internauteId, finalite],
    );
    if (etatActuel.rows[0]?.actif !== true) return { retire: false, raison: 'deja_inactif' };

    // SEULE écriture consentement : une ligne 'retire' (LITTÉRAL, jamais un paramètre). `canal` n'est QUE la provenance
    // (paramètre, défaut 'admin') → il ne peut pas transformer un retrait en accord ; l'`etat` reste figé à 'retire'.
    const texteId = await assurerTexteConsentement(q, finalite, texteCourant(finalite)?.version ?? 1);
    await insererConsentement(q, internauteId, finalite, texteId, 'retire', canal);

    // ⚠️ `opposition_recontact` VOLONTAIREMENT NON TOUCHÉE. C'est un filtre AND de l'extraction F1 (extraction.ts) : la
    //    poser à true bloquerait le RETOUR par le tunnel (l'internaute re-consent mais reste filtré hors extraction) →
    //    violation directe de la règle « rien ne doit l'empêcher de revenir ». Ne PAS l'écrire ici : ce n'est PAS un oubli.
    //    Aucune autre écriture non plus (ni efface_a, ni internaute_projet, ni PII).

    // Journal RGPD (accountability) : QUI (`auteurId`), QUAND (`ts`), quelle finalité, à la demande de qui, motif. JAMAIS de PII.
    await journaliserCycleVie(q, auteurId, 'retrait_consentement', internauteId, {
      finalite,
      a_la_demande_de: contexte.aLaDemandeDe,
      motif: contexte.motif ?? null,
    });
    return { retire: true };
  });
}
