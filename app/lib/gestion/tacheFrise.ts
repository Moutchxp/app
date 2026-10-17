/**
 * ══ 🔴🔴 LOT GESTION-TACHES-EVENEMENTS (17/10/2026) — UNE TÂCHE DANS LA FRISE D'UN ÉVÉNEMENT ══════════════════════
 *
 * ARNO : « Dans la frise chronologique de chaque événement rattaché : un petit POINT ROUGE placé à la date de la
 * mission, entre les carrés d'étapes qui l'encadrent, sans décaler ni modifier les étapes existantes. Si la tâche est
 * refusée par tous ou annulée, le point reste mais en gris (historique). Au survol du point (et au focus clavier) : une
 * bulle avec toutes les informations du récapitulatif (titre, date de la mission, envoyé par, invités et leur état,
 * adresse, contacts, pièces), même composant de bulle que les autres (1 élément = 1 ligne). Au clic : ouvre la tâche. »
 *
 * PUR : aucune base, aucun réseau. Chargeable dans le navigateur.
 */
import type { StatutAcceptation } from './acceptationTache';
import type { Tache } from './taches';

export interface TacheFrise {
  id: number;
  objet: string;
  /** AAAA-MM-JJ — la date de la mission. */
  jour: string;
  heure: string | null;
  dureeMinutes: number | null;
  etat: 'a_faire' | 'faite' | 'annulee';
  /** Le collaborateur qui a envoyé l'invitation (à défaut, le créateur). */
  expediteur: string;
  /** `''` = tâche sans bien : la ligne « Adresse du bien » est omise de la bulle. */
  adresse: string;
  invites: { libelle: string; statut: StatutAcceptation | null }[];
  contacts: { nom: string; role: string; coordonnees: string[] }[];
  pieces: string[];
}

/**
 * ══ 🔴🔴 LOT GESTION-HISTORIQUE-TACHES (Arno, 17/10/2026) — UNE TÂCHE « VALIDÉE » ════════════════════════════════════
 * « Une tâche est “validée” quand au moins un invité l'a acceptée (une tâche confiée à soi-même sans invitation compte
 * comme acceptée). Une tâche en attente, refusée par tous ou annulée n'est pas validée. » Un invité SANS demande
 * (`statut: null`, tâche d'avant l'acceptation) compte comme accepté — même convention que les filtres. Faite = toujours
 * validée. Seules les tâches validées vont dans la frise des événements et dans l'historique du bien. PUR.
 */
export function tacheValidee(t: Pick<TacheFrise, 'etat' | 'invites'>): boolean {
  if (t.etat === 'annulee') return false;
  return t.invites.some((i) => i.statut === 'acceptee' || i.statut === null);
}

/** Les invités qui ont accepté (ou sans demande : acceptée d'avant le lot). PUR. */
export function invitesAcceptants(t: Pick<TacheFrise, 'invites'>): string[] {
  return t.invites.filter((i) => i.statut === 'acceptee' || i.statut === null).map((i) => i.libelle);
}

/** Une tâche de l'écran (`Tache`) mise à la forme de la bulle et de l'historique. PUR. */
export function versTacheFrise(t: Tache): TacheFrise {
  const invites = t.invites !== undefined && t.invites.length > 0
    ? t.invites.map((i) => ({ libelle: i.libelle, statut: i.statut }))
    : [{ libelle: t.confieeALibelle, statut: t.acceptation?.statut ?? null }];
  return {
    id: t.id, objet: t.objet, jour: t.jour, heure: t.heure, dureeMinutes: t.dureeMinutes ?? null, etat: t.etat,
    expediteur: t.acceptation?.demandeurLibelle || t.creeParLibelle, adresse: t.adresseBien, invites,
    contacts: (t.contacts ?? []).map((c) => ({
      nom: c.nom, role: [c.qualite ?? '', c.organisation ?? ''].map((x) => x.trim()).filter((x) => x !== '').join(' · '),
      coordonnees: c.coordonnees.map((x) => x.affichage ?? x.valeur),
    })),
    pieces: (t.pieces ?? []).map((p) => p.nom),
  };
}

/** L'historique des tâches d'un bien : les VALIDÉES, de la mission la plus récente à la plus ancienne. PUR. */
export function historiqueDesTaches(taches: readonly TacheFrise[]): TacheFrise[] {
  return taches.filter(tacheValidee)
    .sort((a, b) => (b.jour + (b.heure ?? '')).localeCompare(a.jour + (a.heure ?? '')) || b.id - a.id);
}

/** Le point est GRIS (historique) quand la tâche est annulée, ou refusée par TOUS ses invités. PUR. */
export function tacheGrisee(t: Pick<TacheFrise, 'etat' | 'invites'>): boolean {
  if (t.etat === 'annulee') return true;
  return t.invites.length > 0 && t.invites.every((i) => i.statut === 'refusee');
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Mercredi 21 octobre 2026 · 14 h 30 (1 h 30) » / « … · journée ». PUR, sans construire de date au fuseau du lecteur. */
export function dateMissionTache(jour: string, heure: string | null, dureeMinutes: number | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (m === null) return jour;
  // Jour de la semaine (Zeller, calendrier grégorien) : aucun fuseau en jeu.
  const a0 = Number(m[1]); const mo = Number(m[2]); const j = Number(m[3]);
  const a = mo < 3 ? a0 - 1 : a0;
  // h = 0 pour samedi, 1 pour dimanche… ; JOURS commence au dimanche.
  const h = (j + Math.floor((13 * ((mo < 3 ? mo + 12 : mo) + 1)) / 5) + a + Math.floor(a / 4) - Math.floor(a / 100) + Math.floor(a / 400)) % 7;
  const nom = JOURS[(h + 6) % 7];
  const date = `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${j}${j === 1 ? 'er' : ''} ${MOIS[mo - 1]} ${a0}`;
  if (heure === null) return `${date} · journée`;
  const [hh, mm] = heure.split(':');
  const d = dureeMinutes ?? 60;
  const duree = d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 === 0 ? '' : ` ${String(d % 60).padStart(2, '0')}`}`;
  return `${date} · ${Number(hh)} h ${mm} (${duree})`;
}

const MOT_STATUT: Record<StatutAcceptation, string> = { en_attente: '⏳ En attente', acceptee: '✓ Acceptée', refusee: '✗ Refusée' };

/** Une partie de la bulle : un titre, puis UNE LIGNE PAR ÉLÉMENT. */
export interface PartieBulle { titre: string; lignes: { texte: string; discret?: string }[] }

/** Le contenu de la bulle d'un point de tâche, dans l'ordre du récapitulatif. PUR. */
export function bulleTacheFrise(t: TacheFrise): { titre: string; etat: string | null; parties: PartieBulle[] } {
  const parties: PartieBulle[] = [
    { titre: 'Date de la mission', lignes: [{ texte: dateMissionTache(t.jour, t.heure, t.dureeMinutes) }] },
    { titre: 'Envoyé par', lignes: [{ texte: t.expediteur }] },
    { titre: `Invités (${t.invites.length})`, lignes: t.invites.map((i) => ({ texte: i.libelle, discret: i.statut === null ? MOT_STATUT.acceptee : MOT_STATUT[i.statut] })) },
  ];
  if (t.adresse.trim() !== '') parties.push({ titre: 'Adresse du bien', lignes: [{ texte: t.adresse }] });
  if (t.contacts.length > 0) {
    parties.push({ titre: `Contacts (${t.contacts.length})`, lignes: t.contacts.map((c) => ({
      texte: c.nom, discret: [c.role, ...c.coordonnees].filter((x) => x.trim() !== '').join(' · ') || undefined,
    })) });
  }
  if (t.pieces.length > 0) parties.push({ titre: `Pièces jointes (${t.pieces.length})`, lignes: t.pieces.map((p) => ({ texte: p })) });
  const etat = t.etat === 'annulee' ? 'Tâche annulée' : tacheGrisee(t) ? 'Refusée par tous les invités' : t.etat === 'faite' ? 'Tâche faite' : null;
  return { titre: t.objet, etat, parties };
}
