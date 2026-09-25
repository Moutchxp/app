/**
 * MODULE « GESTION » — LOT 5-PJ-C : la mémoire des comptes Google des collaborateurs. Module SERVEUR.
 *
 * 🔒 PÉRIMÈTRE D'ÉCRITURE : la table `gestion_google_compte`, et une ligne de `gestion_journal` par geste. Rien
 * d'autre. Aucun droit n'est recopié ici — c'est tout l'enjeu du lot : Google reste seul juge de ce que chacun voit.
 *
 * 🔒 LE JETON N'EST JAMAIS RENDU EN CLAIR PAR CE MODULE, sauf à `jetonCollaborateur`, qui en a besoin pour le
 * rafraîchir. Il n'apparaît dans aucune réponse HTTP, aucun journal, aucun message d'erreur.
 */
import { query } from '../db/client';
import { chiffrer, dechiffrer } from './coffre';
import { comptesGoogleDisponibles, journalCompteGoogleDisponible } from './schema';

export interface CompteGoogleCollaborateur {
  utilisateurId: number;
  email: string;
  /** Le jeton DÉCHIFFRÉ. N'existe que le temps d'un rafraîchissement. */
  refreshToken: string;
  derniereErreur: string | null;
}

/** Le compte relié par ce collaborateur, s'il y en a un. `null` = jamais connecté (ou migration absente). */
export async function lireCompteDe(utilisateurId: number): Promise<CompteGoogleCollaborateur | null> {
  if (!await comptesGoogleDisponibles()) return null;
  const { rows } = await query<{ email: string; refresh_token_chiffre: string; derniere_erreur: string | null }>(
    `SELECT email, refresh_token_chiffre, derniere_erreur FROM gestion_google_compte WHERE utilisateur_id = $1`,
    [utilisateurId],
  );
  const c = rows[0];
  if (!c) return null;
  try {
    return {
      utilisateurId, email: c.email, refreshToken: dechiffrer(c.refresh_token_chiffre),
      derniereErreur: c.derniere_erreur,
    };
  } catch (e) {
    // Clé changée, ou contenu abîmé : la ligne existe mais ne vaut rien. On rend l'état « à reconnecter » plutôt
    //   que de laisser une exception remonter jusqu'à l'écran — recliquer sur le bouton suffit à réparer.
    return {
      utilisateurId, email: c.email, refreshToken: '',
      derniereErreur: e instanceof Error ? e.message : 'jeton illisible',
    };
  }
}

/** Le compte relié, SANS le jeton — pour afficher « connecté en tant que … » sans jamais déchiffrer. */
export async function lireEmailDe(utilisateurId: number): Promise<{ email: string; derniereErreur: string | null } | null> {
  if (!await comptesGoogleDisponibles()) return null;
  const { rows } = await query<{ email: string; derniere_erreur: string | null }>(
    `SELECT email, derniere_erreur FROM gestion_google_compte WHERE utilisateur_id = $1`, [utilisateurId]);
  const c = rows[0];
  return c ? { email: c.email, derniereErreur: c.derniere_erreur } : null;
}

/**
 * RELIE (ou remplace) le compte Google d'un collaborateur.
 *
 * `ON CONFLICT … DO UPDATE` : un collaborateur qui reclique se reconnecte, il ne crée pas un second compte. La
 * dernière erreur est EFFACÉE au passage — c'est précisément ce que la reconnexion vient réparer.
 */
export async function relierCompte(o: {
  utilisateurId: number; email: string; refreshToken: string; portees: readonly string[]; auteurLibelle: string;
}): Promise<boolean> {
  if (!await comptesGoogleDisponibles()) return false;
  await query(
    `INSERT INTO gestion_google_compte (utilisateur_id, email, refresh_token_chiffre, portees)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (utilisateur_id) DO UPDATE
        SET email = EXCLUDED.email, refresh_token_chiffre = EXCLUDED.refresh_token_chiffre,
            portees = EXCLUDED.portees, maj_le = now(), derniere_erreur = NULL`,
    [o.utilisateurId, o.email, chiffrer(o.refreshToken), o.portees.join(' ')],
  );
  await journaliser(o.utilisateurId, 'connexion_google', null, o.email,
    `${o.auteurLibelle} a relié son compte Google ${o.email} à la tuile Gestion. `
    + `Le parcours du Drive et les dépôts se feront désormais avec SES droits Google.`, o.auteurLibelle);
  return true;
}

/**
 * DÉLIE le compte. C'est la SEULE suppression de tout le module, et elle est voulue : un jeton qu'on garde après
 * « Déconnecter » est un accès qu'on continue d'avoir alors que la personne a demandé le contraire. Le GESTE, lui,
 * reste au journal — c'est la trace qui compte, pas le secret.
 */
export async function delierCompte(utilisateurId: number, auteurLibelle: string): Promise<boolean> {
  if (!await comptesGoogleDisponibles()) return false;
  const { rows } = await query<{ email: string }>(
    `DELETE FROM gestion_google_compte WHERE utilisateur_id = $1 RETURNING email`, [utilisateurId]);
  const email = rows[0]?.email;
  if (email === undefined) return false;
  await journaliser(utilisateurId, 'deconnexion_google', email, null,
    `${auteurLibelle} a délié son compte Google ${email}. Le jeton a été EFFACÉ de la base ; les boutons Drive `
    + `reproposent la connexion. Aucun fichier déjà déposé n'est touché.`, auteurLibelle);
  return true;
}

/**
 * NOTE que Google a refusé le jeton. Écrit à chaque refus, pour que l'écran propose une RECONNEXION plutôt qu'une
 * erreur technique. Au mieux-effort : ne jamais faire échouer l'action à cause de la note qui l'explique.
 */
export async function noterErreurCompte(utilisateurId: number, motif: string): Promise<void> {
  if (!await comptesGoogleDisponibles()) return;
  try {
    await query(
      `UPDATE gestion_google_compte SET derniere_erreur = left($2, 300), maj_le = now() WHERE utilisateur_id = $1`,
      [utilisateurId, motif]);
  } catch (e) {
    console.error('[gestion/google] impossible de noter le refus du jeton', e);
  }
}

/** Les domaines acceptés, lus en CONFIGURATION. Jamais en dur : ajouter un domaine ne doit demander aucun code. */
export async function lireDomainesAutorises(): Promise<string> {
  if (!await comptesGoogleDisponibles()) return '';
  const { rows } = await query<{ d: string }>(
    `SELECT domaines_google_autorises AS d FROM gestion_config WHERE id = 1`);
  return rows[0]?.d ?? '';
}

/** Une ligne de journal, sur l'entité que la base ACCEPTE — même précaution que pour les envois et les dépôts. */
async function journaliser(
  utilisateurId: number, action: string, avant: string | null, apres: string | null,
  commentaire: string, auteurLibelle: string,
): Promise<void> {
  try {
    const entite = await journalCompteGoogleDisponible() ? 'compte_google' : 'config';
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entite, utilisateurId, action, avant, apres, commentaire, utilisateurId, auteurLibelle],
    );
  } catch (e) {
    console.error('[gestion/google] geste effectué mais NON journalisé', { utilisateurId, action, e });
  }
}
