import 'server-only';
import { acceptationTacheDisponible } from '../../../lib/gestion/schema';
import { agendaApresAcceptation, demandeDuJeton, envoyerRecapitulatif, repondreDemande } from '../../../lib/gestion/acceptationRepo';
/* Acceptée : la tâche entre dans l'agenda du destinataire par le chemin EXISTANT (idempotent : jamais de doublon). */
import { synchroniserApresGeste } from '../../../lib/gestion/agendaSynchroRepo';
import { echeanceLisible } from '../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT GESTION-ACCEPTATION (16/10/2026) — RÉPONDRE À UNE TÂCHE PAR LE LIEN DU MAIL, SANS CONNEXION ═════════════
 *
 * Constat d'Arno : le lien du mail ouvrait la page de connexion de l'admin, qui renvoyait ensuite sur l'accueil en
 * perdant le lien → la réponse n'était jamais enregistrée (demande « en attente », rien dans l'agenda).
 *
 * Route PUBLIQUE (hors `/api/admin` : le proxy ne s'y applique pas). Le JETON est la seule autorisation : 32 octets
 * aléatoires, empreinte seule en base, propre à une demande (donc à un destinataire et à une tâche), une seule fois,
 * avant son expiration (réglage, 7 jours par défaut). Toutes ces règles sont celles de `repondreDemande`/`verdictLien`.
 *
 *  · `GET ?j=<jeton>` — LECTURE : titre, date et état de la tâche, et si le lien peut encore agir. N'écrit rien.
 *  · `POST { jeton, decision: 'accepter' | 'refuser', motif? }` — la réponse ; « Refuser » exige un motif (règle 4).
 *    Un jeton faux, expiré, déjà utilisé, remplacé ou une tâche terminée → message clair, RIEN n'est modifié.
 * 🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — une ACCEPTATION envoie à l'invité le RÉCAPITULATIF de la mission (même
 * structure que l'invitation, « Tâche acceptée, ajoutée à votre agenda »), par le canal de l'invitation ; un refus n'envoie
 * rien.
 */
export const runtime = 'nodejs';

const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { 'Cache-Control': 'private, no-store' } });
const jetonValable = (j: unknown): j is string => typeof j === 'string' && j.trim() !== '' && j.length <= 200;

async function resume(jeton: string) {
  const { tache, verdict } = await demandeDuJeton(jeton, 'destinataire');
  return {
    tache: tache === null ? null : {
      objet: tache.objet, jour: tache.jour, heure: tache.heure, echeance: echeanceLisible(tache.jour, tache.heure),
      adresse: tache.adresseBien, statut: tache.statut,
      demandeur: tache.demandeurLibelle,
    },
    peutRepondre: verdict.ok,
    cause: verdict.ok ? null : verdict.cause,
    message: verdict.ok ? null : verdict.message,
  };
}

export async function GET(request: Request): Promise<Response> {
  const j = new URL(request.url).searchParams.get('j');
  if (!jetonValable(j)) return json({ tache: null, peutRepondre: false, cause: 'inconnu', message: 'Ce lien n’est pas valable. Vérifiez que vous l’avez copié en entier.' });
  if (!(await acceptationTacheDisponible())) return json({ erreur: 'Les tâches ne sont pas installées sur ce serveur.' }, 503);
  return json(await resume(j.trim()));
}

export async function POST(request: Request): Promise<Response> {
  if (!(await acceptationTacheDisponible())) return json({ erreur: 'Les tâches ne sont pas installées sur ce serveur.' }, 503);
  const corps = (await request.json().catch(() => ({}))) as { jeton?: unknown; decision?: unknown; motif?: unknown };
  const decision = corps.decision === 'accepter' || corps.decision === 'refuser' ? corps.decision : null;
  if (decision === null) return json({ erreur: 'Choisissez « Accepter » ou « Refuser ».' }, 400);
  if (!jetonValable(corps.jeton)) return json({ erreur: 'Ce lien n’est pas valable. Vérifiez que vous l’avez copié en entier.', cause: 'inconnu' }, 409);
  const jeton = corps.jeton.trim();
  const r = await repondreDemande({
    jeton, decision, motif: typeof corps.motif === 'string' ? corps.motif : null,
    utilisateur: null, nom: null, identiteParJeton: true,
  });
  if (!r.ok) return json({ ...(await resume(jeton)), erreur: r.message, cause: r.cause ?? null }, r.statut);
  const agenda = await synchroniserApresGeste(r.tacheId);
  if (r.statut === 'acceptee' && r.demandeId !== undefined) await envoyerRecapitulatif(r.demandeId, agendaApresAcceptation(agenda));
  return json({ ...(await resume(jeton)), etat: 'ok', statut: r.statut, message: r.message, agenda: agenda.trim() });
}
