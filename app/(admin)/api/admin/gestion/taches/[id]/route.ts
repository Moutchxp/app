import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { tachesDisponibles } from '../../../../../../lib/gestion/schema';
import {
  lireIdsDrive, verifierSaisie, estHeureValide, estJourValide, lireSaisie, RACCOURCIS_DECALAGE, type RaccourciDecalage,
} from '../../../../../../lib/gestion/taches';
import {
  actualiserContact, ajouterPieces, annulerTache, renvoyerDemande, retirerPiece, decalerTache, lireTache, marquerFaite, modifierTache, rouvrirTache, type IssueTache,
} from '../../../../../../lib/gestion/tachesRepo';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';
import { relirePieces } from '../../../../../../lib/gestion/tachesDrive';
import { envoyerSiBesoin } from '../../../../../../lib/gestion/acceptationRepo';
import { mentionMail } from '../../../../../../lib/gestion/acceptationTache';

/**
 * ══ 🔴🔴 LOT TACHES-1 — UNE TÂCHE : SON DÉTAIL, SES GESTES ═══════════════════════════════════════════════════════
 *
 * `GET`   → la tâche et sa TRACE complète (créée, modifiée, faite, décalée, annulée, rouverte : qui, quand).
 * `PATCH { geste }` :
 *    · `faite`                                          → faite par la personne connectée, maintenant ;
 *    · `decaler` + `raccourci` (+1j, +2j, +1s)          → l'heure ne bouge pas ;
 *    · `decaler` + `jour` (+ `heure`, vide = journée)   → vers une date choisie ;
 *    · `modifier` + la saisie complète ;
 *    · `annuler` ; `rouvrir` ;
 *    · `renvoyerDemande` (LOT TACHES-ACCEPTATION) → nouvelle demande, nouveau mail ; l'ancien lien cesse d'agir ;
 *    · `ajouterPieces` + `pieces` (identifiants Drive) / `retirerPiece` + `driveId` (LOT TACHES-PIECES-DRIVE) :
 *      des RÉFÉRENCES seulement ; le fichier du Drive n'est jamais touché ;
 *    · `actualiserContact` + `cle` (LOT TACHES-1-BIS) → recopie les coordonnées d'un contact depuis la fiche
 *      d'aujourd'hui (« Mettre à jour »), datées et tracées.
 * 🔴 IL N'Y A PAS DE `DELETE`, ET C'EST LA RÈGLE D'ARNO : une tâche s'annule, elle ne se supprime jamais (la base
 * le refuse de toute façon — migration 346).
 *
 * 🔒 `exigerCompteActif(…, 'gestion')`. Aucun appel Google. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const lireId = async (params: Promise<{ id: string }>): Promise<number | null> => {
  const n = Number((await params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) return Response.json({ etat: 'sans_schema' });
  const id = await lireId(params);
  if (id === null) return Response.json({ erreur: 'Tâche inconnue.' }, { status: 400 });
  const d = await lireTache(id);
  if (d === null) return Response.json({ erreur: 'Tâche introuvable.' }, { status: 404 });
  return Response.json({ etat: 'ok', ...d }, { headers: { 'Cache-Control': 'private, no-store' } });
}

const MESSAGES: Record<string, string> = {
  faite: 'Tâche faite.', decaler: 'Tâche décalée.', modifier: 'Tâche modifiée.', annuler: 'Tâche annulée.',
  rouvrir: 'Tâche rouverte.', actualiserContact: 'Coordonnées mises à jour.', renvoyerDemande: 'Demande renvoyée.',
  ajouterPieces: 'Pièce(s) jointe(s) ajoutée(s).', retirerPiece: 'Pièce jointe retirée de la tâche (le fichier du Drive n’est pas touché).',
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) {
    return Response.json({ erreur: 'Les tâches ne sont pas encore installées (migration 346).' }, { status: 503 });
  }
  const id = await lireId(params);
  if (id === null) return Response.json({ erreur: 'Tâche inconnue.' }, { status: 400 });
  const corps = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const geste = String(corps.geste ?? '');
  const auteur = await auteurDeLaRequete(request);

  let issue: IssueTache;
  if (geste === 'faite') issue = await marquerFaite(id, auteur);
  else if (geste === 'annuler') issue = await annulerTache(id, auteur);
  else if (geste === 'rouvrir') issue = await rouvrirTache(id, auteur);
  else if (geste === 'renvoyerDemande') issue = await renvoyerDemande(id, auteur);
  else if (geste === 'ajouterPieces') {
    /* 🔴 LOT TACHES-PIECES-DRIVE — relues dans le Drive en LECTURE SEULE, puis seule la RÉFÉRENCE est gardée. */
    const ids = lireIdsDrive(corps.pieces) ?? [];
    if (ids.length === 0) return Response.json({ erreur: 'Aucune pièce choisie.', champ: 'pieces' }, { status: 400 });
    const jeton = await jetonPourRequete(request);
    if (jeton.etat !== 'ok') return Response.json({ erreur: jeton.motif, champ: 'pieces' }, { status: 400 });
    const r = await relirePieces(jeton.jeton, ids);
    if (!r.ok) return Response.json({ erreur: r.motif, champ: 'pieces' }, { status: 400 });
    issue = await ajouterPieces(id, r.valeur, auteur);
  } else if (geste === 'retirerPiece') {
    const driveId = typeof corps.driveId === 'string' ? corps.driveId.trim() : '';
    if (driveId === '') return Response.json({ erreur: 'Pièce inconnue.', champ: 'pieces' }, { status: 400 });
    issue = await retirerPiece(id, driveId, auteur);
  } else if (geste === 'actualiserContact') {
    const cle = typeof corps.cle === 'string' ? corps.cle.trim() : '';
    if (cle === '') return Response.json({ erreur: 'Contact inconnu.' }, { status: 400 });
    issue = await actualiserContact(id, cle, auteur);
  }
  else if (geste === 'decaler') {
    const raccourci = String(corps.raccourci ?? '');
    if (raccourci !== '') {
      if (!RACCOURCIS_DECALAGE.some((r) => r.cle === raccourci)) {
        return Response.json({ erreur: 'Décalage inconnu.' }, { status: 400 });
      }
      issue = await decalerTache(id, { raccourci: raccourci as RaccourciDecalage }, auteur);
    } else {
      const jour = String(corps.jour ?? '').trim();
      const heureBrute = typeof corps.heure === 'string' ? corps.heure.trim() : '';
      const heure = heureBrute === '' ? null : heureBrute;
      if (!estJourValide(jour)) return Response.json({ erreur: 'Indiquez une date valide.', champ: 'jour' }, { status: 400 });
      if (heure !== null && !estHeureValide(heure)) {
        return Response.json({ erreur: 'L’heure doit s’écrire HH:MM.', champ: 'heure' }, { status: 400 });
      }
      issue = await decalerTache(id, { jour, heure }, auteur);
    }
  } else if (geste === 'modifier') {
    const saisie = lireSaisie(corps);
    const refusSaisie = verifierSaisie(saisie);
    if (refusSaisie !== null) return Response.json({ erreur: refusSaisie.message, champ: refusSaisie.champ }, { status: 400 });
    issue = await modifierTache(id, saisie, auteur);
  } else {
    return Response.json({ erreur: 'Geste inconnu.' }, { status: 400 });
  }
  if (!issue.ok) return Response.json({ erreur: issue.motif, champ: issue.champ ?? null }, { status: issue.statut });
  /* 🔴 LOT TACHES-ACCEPTATION — un geste qui a posé une demande en attente (renvoi, date/heure/personne changée) :
     son mail, préparé (et envoyé seulement si le réglage l'autorise). */
  const mail = await envoyerSiBesoin(issue.demande);
  const suite = issue.demande?.statut === 'en_attente'
    ? ` Nouvelle demande d’acceptation${mail && mentionMail(mail) ? ` — ${mentionMail(mail)}` : mail === 'envoye' ? ' envoyée par mail' : ''}.` : '';
  return Response.json({ etat: 'ok', id: issue.id, message: `${MESSAGES[geste]}${suite}` });
}
