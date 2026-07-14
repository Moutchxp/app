/**
 * Rendu PUR de l'historique du journal de curation (libellés FR, troncature cleabs, horodatage). Aucune
 * dépendance React/DB → testable unitairement. N'affecte NI le score NI le verdict (pur affichage).
 */

/** Ligne du journal telle que renvoyée par les routes de lecture (`avant`/`apres` jsonb bruts). */
export interface LigneJournal {
  id: string;
  ts: string;
  action: string;
  entite_id: number;
  cleabs: string | null;
  avant: unknown;
  apres: unknown;
  nom_affiche: string;
  famille_affiche: string;
  supprimee: boolean;
  session_jti: string | null; // UUID de session (jamais affiché brut) ; NULL = entrée antérieure au traçage
  session_ouverte_a: string | null; // iat du jeton → base du libellé humain de session ; NULL = idem
  auteur_prenom: string | null; // prénom du compte auteur (jointure route globale) ; NULL = auteur inconnu
  auteur_nom: string | null; // nom du compte auteur ; NULL = idem
  auteur_role: string | null; // rôle ACTUEL du compte auteur ; NULL = idem
}

/**
 * Libellés des rôles connus. ÉVOLUTIVITÉ : tout rôle absent de cette table (nouveau rôle ajouté en base
 * demain) retombe sur un repli générique CAPITALISÉ (`libelleRole`) — jamais de vide, jamais de plantage,
 * aucune modification de code nécessaire pour l'afficher correctement.
 */
const LIBELLE_ROLE: Record<string, string> = {
  administrateur: 'Administrateur',
  collaborateur: 'Collaborateur',
};

/** Libellé d'un rôle : table pour les rôles connus, sinon repli générique = valeur brute capitalisée. */
function libelleRole(role: string): string {
  return LIBELLE_ROLE[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Libellé de l'AUTEUR d'une entrée : « {Rôle} · {Prénom Nom} ». `utilisateur_id` NULL (auteur non joint :
 * voie de secours / lignes antérieures aux comptes) → « — » : auteur LÉGITIMEMENT inconnu, JAMAIS deviné,
 * jamais « Administrateur » par défaut. Nom complet = prénom + nom (les deux non-vides garantis en base).
 */
export function libelleAuteur(l: { auteur_prenom: string | null; auteur_nom: string | null; auteur_role: string | null }): string {
  if (!l.auteur_prenom && !l.auteur_nom) return '—';
  const nom = [l.auteur_prenom, l.auteur_nom].filter(Boolean).join(' ');
  return l.auteur_role ? `${libelleRole(l.auteur_role)} · ${nom}` : nom;
}

/** Lit un champ (string/number) d'un jsonb inconnu ; `null` si absent/null. */
function champ(obj: unknown, cle: string): string | null {
  if (obj && typeof obj === 'object' && cle in obj) {
    const v = (obj as Record<string, unknown>)[cle];
    if (v == null) return null;
    return typeof v === 'string' ? v : String(v);
  }
  return null;
}

/** Tronque un cleabs (long) pour l'affichage : « …NNNNNNNNNNNN » (12 derniers). Le complet va dans un `title`. */
export function cleabsCourt(cleabs: string | null): string {
  if (!cleabs) return '';
  return cleabs.length <= 12 ? cleabs : '…' + cleabs.slice(-12);
}

/**
 * Libellé FR humanisé d'une ligne, exhaustif sur les 9 actions. `renommage` : « Renommée "a" → "b" », ou
 * « Nommée "b" » si l'ancien nom était NULL. `annulation_edition` : normalise `nb_lignes` (string→nombre).
 * Action inconnue (future) → repli neutre = l'action brute (ne plante jamais).
 */
export function libelleAction(l: LigneJournal): string {
  const court = cleabsCourt(l.cleabs);
  switch (l.action) {
    case 'deplacement':
      return 'Point déplacé';
    case 'annulation_deplacement':
      return 'Déplacement annulé';
    case 'rattachement':
      return `Rattachée au bâtiment ${court}`;
    case 'detachement':
      return `Détachée du bâtiment ${court}`;
    case 'verification':
      return `Liaison vérifiée ${court}`;
    case 'creation_entite_manuelle':
      return 'Créée';
    case 'suppression_entite_manuelle':
      return 'Supprimée';
    case 'renommage': {
      const ancien = champ(l.avant, 'nom');
      const nouveau = champ(l.apres, 'nom') ?? '';
      return ancien != null ? `Renommée "${ancien}" → "${nouveau}"` : `Nommée "${nouveau}"`;
    }
    case 'annulation_edition': {
      const n = Number(champ(l.apres, 'nb_lignes') ?? 0);
      return `Édition annulée (${Number.isFinite(n) ? n : 0} actions)`;
    }
    default:
      return l.action; // action future/inconnue : repli neutre
  }
}

/** Formateur absolu court fr-FR, fuseau Europe/Paris (déterministe pour l'audit). */
const FMT_HORODATAGE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** Horodatage lisible court (ex. « 8 juil. 13:24 »). `ts` invalide → renvoyé tel quel. */
export function formaterHorodatage(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return FMT_HORODATAGE.format(d);
}

/** ISO complet pour le `title`/`dateTime` au survol. `ts` invalide → renvoyé tel quel. */
export function horodatageTitle(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toISOString();
}

/**
 * Libellé HUMAIN de la session d'une ligne (jamais l'UUID brut). Session connue (via `session_ouverte_a`) →
 * « session du {horodatage} » ; NULL/illisible → « session inconnue ». `connue` pilote le style discret (gris).
 * Deux lignes d'une MÊME session partagent le même `session_ouverte_a` → même libellé (visuellement rattachables).
 */
export function libelleSession(l: { session_ouverte_a: string | null }): { texte: string; connue: boolean } {
  if (!l.session_ouverte_a) return { texte: 'session inconnue', connue: false };
  const d = new Date(l.session_ouverte_a);
  if (Number.isNaN(d.getTime())) return { texte: 'session inconnue', connue: false };
  return { texte: `session du ${formaterHorodatage(l.session_ouverte_a)}`, connue: true };
}

/**
 * Nom d'entité pour le volet GLOBAL (chaque ligne concerne une entité différente). Une entité supprimée
 * est suffixée « (supprimée) » — sauf le fallback route « entité supprimée #id » (déjà explicite, pas de
 * suffixe redondant).
 */
export function nomAffiche(x: { nom_affiche: string; supprimee: boolean }): string {
  if (!x.supprimee) return x.nom_affiche;
  return x.nom_affiche.startsWith('entité supprimée') ? x.nom_affiche : `${x.nom_affiche} (supprimée)`;
}
