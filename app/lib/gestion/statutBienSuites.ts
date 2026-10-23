import 'server-only';
import type { Auteur } from './gestes';
import { changerStatutBien } from './statutBienRepo';
import { arbreDisponible, deplacerDossierDuBien } from './arbreStatutDriveRepo';
import { avecMail } from '../location/mailPortefeuilleRepo';

/**
 * ══ UNE TRANSITION DE STATUT DU BIEN ET SES SUITES — LE MÉCANISME UNIQUE (Arno, 21/10/2026, 403-404 ; mis en commun le 23/10/2026) ══
 *
 * Le geste « statut-bien » de la fiche (`StatutDuBien.tsx`) et le formulaire « Modifier » de la fiche entière passent ICI, et
 * nulle part ailleurs :
 *   ① la transition (`changerStatutBien` : transitions permises, date d'effet, motif, mandat, annexes rattachées qui suivent) ;
 *   ② le mail de portefeuille, qui suit le statut (sortie de gestion → sortie ; passage / retour en gestion → entrée) — jamais
 *      bloquant ;
 *   ③ le dossier Drive du bien DÉPLACÉ entier vers l'arbre du nouveau statut (`deplacerDossierDuBien`, le seul dossier du bien) ;
 *      un échec n'annule rien : la fiche dit « Dossier Drive à déplacer » et « Déplacer maintenant » rejoue. Aucun autre dossier
 *      n'est touché (jamais « Documents clients scannés »).
 */
export async function transitionStatutAvecSuites(id: number, saisie: { vers: unknown; effetLe: unknown; motif?: unknown; mandat?: unknown }, auteur: Auteur,
  tuile: 'Location' | 'Gestion') {
  const r = await changerStatutBien(id, { vers: saisie.vers, effetLe: saisie.effetLe, motif: saisie.motif, mandat: saisie.mandat }, auteur);
  if (r.etat !== 'ok') return r;
  const { avant, apres, lots } = r.data;
  const ev = avant === 'en_gestion'
    ? { sens: 'sortie' as const, proprietaireId: null, lotIds: lots, origine: null }
    : apres === 'en_gestion' ? { sens: 'entree' as const, reactivation: avant === 'ancienne_gestion', proprietaireId: null, lotIds: lots, origine: null } : null;
  const avecMailEnvoye = await avecMail(r, ev, { auteur, tuile });
  if (!(await arbreDisponible().catch(() => false))) return avecMailEnvoye;
  const d = await deplacerDossierDuBien(lots[0], auteur.libelle).catch((e: unknown) => ({ ok: false as const, motif: (e as Error)?.message ?? 'Le Drive n’a pas répondu.' }));
  return { ...avecMailEnvoye, drive: d.ok ? { ok: true, motif: null } : { ok: false, motif: d.motif } };
}
