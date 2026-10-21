import { causeDeLaReponse, explicationEchecDe, type CauseEchec, type ExplicationEchec } from './issueEnregistrement';

/**
 * ══ 🔴🔴 TUILE LOCATION — CHAQUE ENREGISTREMENT SE CONFIRME (Arno, 21/10/2026). PUR. ═══════════════════════════════════════════
 *
 * LA RÈGLE (Arno) : dans TOUTE la tuile Location, chaque action qui enregistre en base affiche une modale — succès vert
 * « ✓ … » avec un court résumé et un lien vers la fiche, ou erreur rouge en français simple (ce qui a échoué, pourquoi, quoi
 * faire ; la saisie n'est pas perdue). Jamais de silence ; le bouton passe à « Enregistrement… » ; un double clic n'envoie
 * qu'UNE requête.
 *
 * Ce module dit QUOI annoncer pour une requête d'écriture et sa réponse ; l'hôte (`ConfirmationsEnregistrement`, monté sur
 * toute la tuile) l'applique à chaque écriture vers les routes de la Location et de la fiche commune.
 * Les écrans qui ont DÉJÀ leur propre modale (« Nouveau bien », « Nouveau locataire », « Nouveau propriétaire ») et les
 * requêtes qui n'enregistrent rien (aperçu, balise de journal) en sont exclus — jamais deux modales pour un geste.
 */

/** Les routes dont les écritures se confirment (la Location, et la fiche commune qu'elle ouvre). */
export const ROUTES_CONFIRMEES = ['/api/admin/location', '/api/admin/gestion/annuaire'] as const;
/** L'envoi ADHOC & MONGA a sa propre fenêtre de résultat (envoyé / non envoyé) : il n'est pas doublé. */
export const ROUTES_EXCLUES = ['/api/admin/location/nouvelle-location'] as const;
/** Pas d'annonce : une lecture en POST, une balise, ou un écran qui a sa propre modale de succès ET d'erreur. */
export const ACTIONS_SANS_ANNONCE: ReadonlySet<string> = new Set(['apercu-lots', 'journal-echec', 'creer-bien', 'creer-locataires', 'creer-proprietaires']);
/** L'échec s'affiche déjà DANS la fenêtre de confirmation du geste (on y corrige) : seul le succès s'annonce. */
export const ECHEC_DANS_SA_FENETRE: ReadonlySet<string> = new Set(['statut-bien']);
/** L'en-tête par lequel un écran dit « je confirme moi-même » (`propre`). */
export const ENTETE_CONFIRMATION = 'x-svav-confirmation';

/** Ce qu'on annonce pour une action : le titre du succès et la phrase de l'échec. */
interface Libelle { succes: string; echec: string }
const L = (succes: string, echec: string): Libelle => ({ succes, echec });
const LIBELLES: Record<string, Libelle> = {
  modifier: L('Fiche enregistrée', 'La fiche n’a pas été enregistrée.'),
  ordonner: L('Ordre des cartes enregistré', 'L’ordre des cartes n’a pas été enregistré.'),
  archiver: L('Fiche archivée', 'La fiche n’a pas été archivée.'),
  restaurer: L('Fiche restaurée', 'La fiche n’a pas été restaurée.'),
  supprimer: L('Fiche supprimée', 'La fiche n’a pas été supprimée.'),
  separer: L('Fiches séparées', 'Les fiches n’ont pas été séparées.'),
  creer: L('Fiche créée', 'La fiche n’a pas été créée.'),
  'ajouter-proprietaire': L('Propriétaire ajouté au bien', 'Le propriétaire n’a pas été ajouté au bien.'),
  'remplacer-proprietaire': L('Propriétaire remplacé', 'Le propriétaire n’a pas été remplacé.'),
  'ajouter-occupant': L('Occupant ajouté', 'L’occupant n’a pas été ajouté.'),
  depart: L('Départ enregistré', 'Le départ n’a pas été enregistré.'),
  'numero-mandat': L('N° de mandat enregistré', 'Le n° de mandat n’a pas été enregistré.'),
  'en-gestion': L('« En gestion » enregistré', '« En gestion » n’a pas été enregistré.'),
  'modifier-bien': L('Bien enregistré', 'Le bien n’a pas été enregistré.'),
  'complements-bien': L('Informations du bien enregistrées', 'Les informations du bien n’ont pas été enregistrées.'),
  'ajouter-annexe': L('Annexe ajoutée', 'L’annexe n’a pas été ajoutée.'),
  'rattacher-annexe': L('Annexe rattachée', 'L’annexe n’a pas été rattachée.'),
  'creer-locataire': L('Locataire enregistré', 'Le locataire n’a pas été enregistré.'),
  'ajouter-contact-syndic': L('Contact du syndic enregistré', 'Le contact du syndic n’a pas été enregistré.'),
  reactiver: L('Fiche réactivée dans le portefeuille', 'La réactivation n’a pas été enregistrée.'),
  'sortir-biens': L('Biens sortis du portefeuille', 'La sortie des biens n’a pas été enregistrée.'),
  'sortie-locataires': L('Sortie des locataires enregistrée', 'La sortie des locataires n’a pas été enregistrée.'),
  'corriger-sortie-locataires': L('Sortie corrigée', 'La correction de la sortie n’a pas été enregistrée.'),
  'annuler-sortie-locataires': L('Sortie annulée', 'L’annulation de la sortie n’a pas été enregistrée.'),
  'enregistrer-preavis': L('Préavis enregistré', 'Le préavis n’a pas été enregistré.'),
  'corriger-preavis': L('Préavis corrigé', 'La correction du préavis n’a pas été enregistrée.'),
  'annuler-preavis': L('Préavis annulé', 'L’annulation du préavis n’a pas été enregistrée.'),
  'planifier-edls': L('États des lieux planifiés', 'Les états des lieux n’ont pas été planifiés.'),
  'deplacer-edls': L('État des lieux déplacé', 'L’état des lieux n’a pas été déplacé.'),
  'reattribuer-edls': L('État des lieux réattribué', 'L’état des lieux n’a pas été réattribué.'),
  'etat-des-lieux': L('État des lieux enregistré', 'L’état des lieux n’a pas été enregistré.'),
  'conditions-location': L('Loyer et taux enregistrés', 'Le loyer et le taux n’ont pas été enregistrés.'),
  'conditions-entree': L('Conditions d’entrée enregistrées', 'Les conditions d’entrée n’ont pas été enregistrées.'),
  'creer-dossier-bail': L('Dossier Drive du bail créé', 'Le dossier Drive du bail n’a pas été créé.'),
  'statut-bien': L('Statut du bien enregistré', 'Le statut du bien n’a pas été enregistré.'),
  reglages: L('Réglages des honoraires enregistrés', 'Les réglages des honoraires n’ont pas été enregistrés.'),
  bareme: L('Barème enregistré', 'Le barème n’a pas été enregistré.'),
  'corriger-bareme': L('Barème corrigé', 'La correction du barème n’a pas été enregistrée.'),
  tva: L('Taux de TVA enregistré', 'Le taux de TVA n’a pas été enregistré.'),
  destinataires: L('Destinataires enregistrés', 'Les destinataires n’ont pas été enregistrés.'),
  'archivage-delai': L('Délai d’archivage enregistré', 'Le délai d’archivage n’a pas été enregistré.'),
};

const SUJET: Record<string, string> = { proprietaire: 'Propriétaire', locataire: 'Locataire', bien: 'Bien' };

/** Le libellé d'une action, précisé par sa saisie (détacher / rattacher, sujet d'une sortie, geste Drive). PUR. */
export function libelleAction(action: string, corps: Record<string, unknown>): Libelle {
  if (action === 'detacher-annexe') return corps.detacher === false ? L('Annexe rattachée à son bien', 'L’annexe n’a pas été rattachée.') : L('Annexe détachée', 'L’annexe n’a pas été détachée.');
  if (action === 'sortir') {
    const s = SUJET[String(corps.sujet)] ?? 'Fiche';
    return L(`${s} sorti du portefeuille`, `La sortie du portefeuille n’a pas été enregistrée.`);
  }
  if (action === 'dossier-drive-bien') return corps.geste === 'deplacer' ? L('Dossier Drive déplacé', 'Le dossier Drive n’a pas été déplacé.') : L('Dossier Drive créé', 'Le dossier Drive n’a pas été créé.');
  return LIBELLES[action] ?? L('Modification enregistrée', 'La modification n’a pas été enregistrée.');
}

/** La requête d'écriture à confirmer : son action et sa saisie ; `null` = rien à annoncer. PUR. */
export function requeteAConfirmer(url: string, methode: string, corpsBrut: unknown, enTetes: Headers | null): { action: string; corps: Record<string, unknown> } | null {
  const m = methode.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
  let chemin: string;
  try { chemin = new URL(url, 'http://local').pathname; } catch { return null; }
  if (!ROUTES_CONFIRMEES.some((r) => chemin === r || chemin.startsWith(`${r}/`))) return null;
  if (ROUTES_EXCLUES.some((r) => chemin === r || chemin.startsWith(`${r}/`))) return null;
  if (enTetes?.get(ENTETE_CONFIRMATION) === 'propre') return null;
  let corps: Record<string, unknown> = {};
  if (typeof corpsBrut === 'string') { try { const o = JSON.parse(corpsBrut) as unknown; if (o !== null && typeof o === 'object' && !Array.isArray(o)) corps = o as Record<string, unknown>; } catch { /* corps non JSON */ } }
  const action = typeof corps.action === 'string' ? corps.action : '';
  if (ACTIONS_SANS_ANNONCE.has(action)) return null;
  return { action, corps };
}

export type Annonce =
  | { sorte: 'succes'; titre: string; lignes: [string, string][]; notes: string[] }
  | { sorte: 'erreur'; titre: string; echec: ExplicationEchec };

/**
 * L'ANNONCE d'une réponse : succès (« etat: ok », ou une réponse 2xx sans état) avec les remarques non bloquantes (mail non
 * parti, dossier Drive non fait) ; sinon l'échec expliqué. `null` : rien à dire (échec montré dans la fenêtre du geste). PUR.
 */
export function annonceDeLaReponse(o: { action: string; corps: Record<string, unknown>; statut: number | null; json: unknown; fiche: string | null }): Annonce | null {
  const lib = libelleAction(o.action, o.corps);
  const j = (o.json !== null && typeof o.json === 'object' ? o.json : {}) as { etat?: string; motif?: string; message?: string; erreur?: string;
    mail?: { envoye?: boolean; ignore?: boolean; motif?: string | null }; drive?: { ok?: boolean; motif?: string | null } };
  const reussi = o.statut !== null && o.statut >= 200 && o.statut < 300 && (j.etat === undefined || j.etat === 'ok');
  if (reussi) {
    const notes: string[] = [];
    if (j.mail && j.mail.envoye === false && j.mail.ignore !== true) notes.push(`Enregistré, mais le mail de confirmation n’est pas parti${j.mail.motif ? ` : ${j.mail.motif}` : ''}.`);
    if (j.drive && j.drive.ok === false) notes.push(`Enregistré, mais le dossier Drive n’a pas été fait${j.drive.motif ? ` : ${j.drive.motif}` : ''}.`);
    return { sorte: 'succes', titre: lib.succes, lignes: o.fiche ? [['Fiche', o.fiche]] : [], notes };
  }
  if (ECHEC_DANS_SA_FENETRE.has(o.action)) return null;
  const cause: CauseEchec = causeDeLaReponse({ statut: o.statut, etat: j.etat, erreur: j.erreur });
  const motif = j.motif ?? j.message ?? (j.etat === 'inconnu' ? 'Cette fiche n’existe plus.' : null);
  return { sorte: 'erreur', titre: lib.echec.replace(/\.$/, ''), echec: explicationEchecDe(lib.echec, 'le bouton', cause, motif) };
}
