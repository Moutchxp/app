/**
 * AUDIT POINT 8 (15/10/2026) — affichage du journal des connexions dans la tuile Audit. PUR (aucun import).
 */
export type ResultatConnexion = 'succes' | 'echec' | 'bloque';

export interface LigneJournal {
  survenuLe: string;
  identifiant: string;
  compteId: number | null;
  resultat: ResultatConnexion;
  ipEmpreinte: string | null;
}

export interface ReponseJournal {
  disponible: boolean;
  lignes: LigneJournal[];
}

const LIBELLES: Record<ResultatConnexion, string> = { succes: 'Réussie', echec: 'Échouée', bloque: 'Bloquée (trop d’essais)' };

export function libelleResultat(r: ResultatConnexion): string {
  return LIBELLES[r] ?? r;
}

/** « 15/10/2026 10:04:12 », à l'heure de Paris quelle que soit la machine. */
export function dateParis(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(d).replace(',', '');
}

/** Les 8 premiers caractères de l'empreinte d'adresse : assez pour reconnaître une même source, rien de l'adresse. */
export function adresseCourte(empreinte: string | null): string {
  return empreinte ? empreinte.slice(0, 8) : '—';
}

/** L'identifiant vide (ancienne voie de secours, refusée) s'affiche lisiblement. */
export function identifiantAffiche(identifiant: string): string {
  return identifiant === '' ? '(identifiant vide)' : identifiant;
}
