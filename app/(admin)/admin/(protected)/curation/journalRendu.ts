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
