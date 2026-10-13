import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { NOM_COOKIE, sessionDepuisPayload, verifierJeton } from '../../../../../../lib/admin/session';
import { acceptationTacheDisponible } from '../../../../../../lib/gestion/schema';
import { lireReglageTaches, modifierReglageTaches } from '../../../../../../lib/gestion/acceptationRepo';
import { query } from '../../../../../../lib/db/client';
/* 🔴 LOT TACHES-AGENDA — le second réglage : « Envoyer les tâches dans l'agenda Google » (coupé par défaut, migration 350). */
import { lireReglageAgenda, modifierReglageAgenda } from '../../../../../../lib/gestion/agendaSynchroRepo';
import { agendaTacheDisponible } from '../../../../../../lib/gestion/schema';

/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — LE RÉGLAGE « ENVOYER LES DEMANDES D'ACCEPTATION PAR MAIL » ════════════════════════
 *
 * Désactivé par défaut (migration 349). `GET` le lit (tout compte Gestion) ; `PATCH { envoiMail }` le change —
 * réservé aux ADMINISTRATEURS (rôle relu en base), parce qu'il fait partir de vrais mails au nom de gestion@.
 * 🔴 LOT TACHES-AGENDA — `PATCH { envoiAgenda }` : « Envoyer les tâches dans l'agenda Google », mêmes règles (coupé par
 * défaut, administrateurs seulement). `GET` rend aussi `envoiAgenda` et `agendaInstalle`.
 * 🔒 `exigerCompteActif(…, 'gestion')`. Runtime Node.
 */
export const runtime = 'nodejs';

async function estAdministrateur(request: Request): Promise<boolean> {
  const brut = (request.headers.get('cookie') ?? '').split(';').map((p) => p.trim()).find((p) => p.startsWith(`${NOM_COOKIE}=`));
  const payload = brut ? await verifierJeton(decodeURIComponent(brut.slice(NOM_COOKIE.length + 1))) : null;
  if (!payload) return false;
  const s = sessionDepuisPayload(payload);
  if (s.sub === null) return s.role === 'administrateur';
  const { rows } = await query<{ role: string; actif: boolean }>(`SELECT role, actif FROM admin_utilisateur WHERE id = $1`, [s.sub]);
  return rows[0]?.actif === true && rows[0]?.role === 'administrateur';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!(await acceptationTacheDisponible())) return Response.json({ etat: 'sans_schema' });
  return Response.json({
    etat: 'ok', ...(await lireReglageTaches()), modifiable: await estAdministrateur(request),
    agendaInstalle: await agendaTacheDisponible(), envoiAgenda: await lireReglageAgenda(),
  },
    { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!(await acceptationTacheDisponible())) return Response.json({ erreur: 'Acceptation non installée (migration 349).' }, { status: 503 });
  if (!(await estAdministrateur(request))) {
    return Response.json({ erreur: 'Seul un administrateur peut changer ce réglage.' }, { status: 403 });
  }
  const corps = (await request.json().catch(() => ({}))) as { envoiMail?: unknown; envoiAgenda?: unknown };
  const auteur = await auteurDeLaRequete(request);
  const { rows } = auteur.id === null ? { rows: [] as { l: string }[] }
    : await query<{ l: string }>(`SELECT btrim(prenom || ' ' || nom) AS l FROM admin_utilisateur WHERE id = $1`, [auteur.id]);
  if (typeof corps.envoiAgenda === 'boolean' && corps.envoiMail === undefined) {
    if (!(await agendaTacheDisponible())) return Response.json({ erreur: 'Agenda non installé (migration 350).' }, { status: 503 });
    await modifierReglageAgenda(corps.envoiAgenda, rows[0]?.l || auteur.libelle, auteur.id);
    return Response.json({ etat: 'ok', message: corps.envoiAgenda
      ? 'Envoi des tâches dans l’agenda Google ACTIVÉ : les prochaines tâches créées ou modifiées iront dans l’agenda de la personne concernée.'
      : 'Envoi des tâches dans l’agenda Google désactivé : plus aucun appel à l’agenda.' });
  }
  if (typeof corps.envoiMail !== 'boolean') return Response.json({ erreur: 'Réglage attendu (oui / non).' }, { status: 400 });
  await modifierReglageTaches(corps.envoiMail, auteur, rows[0]?.l || auteur.libelle);
  return Response.json({ etat: 'ok', message: corps.envoiMail
    ? 'Envoi des demandes d’acceptation par mail ACTIVÉ : les prochaines demandes partiront de gestion@.'
    : 'Envoi des demandes d’acceptation par mail désactivé.' });
}
