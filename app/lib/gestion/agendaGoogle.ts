/**
 * ══ 🔴🔴 LOT TACHES-AGENDA (lot 2) — LA PORTE VERS L'AGENDA GOOGLE, VERROUILLÉE DANS LE CODE ═════════════════════════
 *
 * GARDE-FOU ABSOLU D'ARNO : « l'application ne crée, ne modifie et ne supprime QUE les événements qu'elle a elle-même
 * créés. Elle ne lit, ne modifie et ne supprime JAMAIS aucun autre événement des agendas. Les agendas sont pleins de
 * vrais rendez-vous. »
 *
 * 🔴 CE N'EST PAS UNE DISCIPLINE, C'EST UN VERROU À DEUX ÉTAGES :
 *   ① `fetchAgendaGarde` — tout appel à l'agenda passe par lui, et il REFUSE (exception, AVANT tout envoi) :
 *      · toute adresse hors de `…/calendar/v3/calendars/<agenda>/events` (liste des agendas, partages, réglages,
 *        import, déplacement, instances, abonnements…) ;
 *      · une LISTE d'événements qui ne filtre pas sur la marque privée de l'application : on ne peut pas lire
 *        l'agenda de quelqu'un, seulement retrouver NOS événements ;
 *      · une création ou une modification dont le corps ne porte pas la marque de l'application ;
 *      · toute méthode autre que GET / POST / PATCH / DELETE.
 *   ② les gestes `modifier` et `supprimer` RELISENT d'abord l'événement par son identifiant et vérifient la marque ET
 *      le numéro de la tâche (`estNotreEvenement`). Un événement qui ne les porte pas n'est ni modifié ni supprimé :
 *      le geste rend `refus_garde`, et rien n'est envoyé.
 * Et `sendUpdates=none` sur chaque écriture : aucun mail n'est jamais envoyé par Google.
 *
 * 🔒 LE JETON est demandé AU NOM DE LA PERSONNE CONFIÉE (délégation du Workspace, portée `calendar.events` seule,
 * jeton séparé de celui du Drive). Son adresse vient de la base, jamais du navigateur.
 *
 * Sans base. Le `fetch` et le jeton sont injectés : sous les tests, c'est le FAUX Google (`agendaFauxGoogle.ts`).
 */
import { CLE_MARQUE, CLE_TACHE, estNotreEvenement, MARQUE_APPLICATION, type EvenementGoogle } from './agendaTache';

export const BASE_AGENDA = 'https://www.googleapis.com/calendar/v3/calendars/';

export class AppelAgendaRefuse extends Error {
  constructor(motif: string) {
    super(`Agenda verrouillé (tâches) : ${motif}`);
    this.name = 'AppelAgendaRefuse';
  }
}

/** Le filtre de liste qui ne laisse voir QUE les événements de l'application. */
export const FILTRE_MARQUE = `privateExtendedProperty=${encodeURIComponent(`${CLE_MARQUE}=${MARQUE_APPLICATION}`)}`;

/** La requête est-elle permise ? `null` si oui, sinon la raison du refus. PUR. */
export function refusAppelAgenda(url: string, methode: string | undefined, corps: unknown): string | null {
  const m = (methode ?? 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(m)) return `méthode ${m} refusée`;
  if (!url.startsWith(BASE_AGENDA)) return 'adresse hors des événements de l’agenda';
  const reste = url.slice(BASE_AGENDA.length);
  const [chemin, requete = ''] = reste.split('?', 2);
  const morceaux = chemin.split('/');
  // <agenda>/events            → liste (GET filtrée) ou création (POST)
  // <agenda>/events/<id>       → lecture (GET), modification (PATCH), suppression (DELETE)
  if (morceaux.length < 2 || morceaux.length > 3 || morceaux[0] === '' || morceaux[1] !== 'events') {
    return 'ressource de l’agenda non permise';
  }
  const avecId = morceaux.length === 3;
  if (avecId && !/^[A-Za-z0-9_-]{1,1024}$/.test(morceaux[2])) return 'identifiant d’événement non permis';
  const params = new URLSearchParams(requete);
  if (!avecId) {
    if (m === 'GET') {
      // 🔴 Une liste NE PEUT QUE retrouver nos événements : le filtre de la marque est obligatoire.
      if (!params.getAll('privateExtendedProperty').includes(`${CLE_MARQUE}=${MARQUE_APPLICATION}`)) {
        return 'liste d’événements sans le filtre de la marque de l’application';
      }
    } else if (m !== 'POST') return `méthode ${m} refusée sur la liste`;
  } else if (m === 'POST') return 'méthode POST refusée sur un événement';
  if (m === 'POST' || m === 'PATCH') {
    const p = (corps as { extendedProperties?: { private?: Record<string, unknown> } } | null)?.extendedProperties?.private;
    if (!p || p[CLE_MARQUE] !== MARQUE_APPLICATION || typeof p[CLE_TACHE] !== 'string') {
      return 'écriture d’un événement sans la marque de l’application';
    }
  }
  return null;
}

/** Le `fetch` de l'agenda : celui du serveur, mais qui ne laisse passer QUE les gestes permis. */
export function fetchAgendaGarde(base: typeof fetch = fetch): typeof fetch {
  return (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url;
    const methode = init?.method ?? 'GET';
    let corps: unknown = null;
    if (typeof init?.body === 'string') { try { corps = JSON.parse(init.body); } catch { corps = null; } }
    const refus = refusAppelAgenda(url, methode, corps);
    if (refus !== null) throw new AppelAgendaRefuse(refus);
    return base(entree, init);
  }) as typeof fetch;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES QUATRE GESTES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type IssueAgenda<T> =
  | ({ ok: true } & T)
  /** L'événement n'existe plus (supprimé à la main dans Google, ou jamais créé). */
  | { ok: false; sorte: 'absent' }
  /** 🔴 L'événement ne porte pas notre marque : on n'y a pas touché. */
  | { ok: false; sorte: 'refus_garde'; motif: string }
  | { ok: false; sorte: 'echec'; motif: string };

export type JetonAgenda = (adresse: string) => Promise<{ ok: true; jeton: string } | { ok: false; motif: string }>;

export interface PorteAgenda {
  creer(agenda: string, tacheId: number, ev: EvenementGoogle): Promise<IssueAgenda<{ id: string }>>;
  modifier(agenda: string, evenementId: string, tacheId: number, ev: EvenementGoogle): Promise<IssueAgenda<{ id: string }>>;
  supprimer(agenda: string, evenementId: string, tacheId: number): Promise<IssueAgenda<Record<never, never>>>;
  /** Retrouve NOS événements de cette tâche dans cet agenda (filtre de la marque ET du numéro). */
  chercher(agenda: string, tacheId: number): Promise<IssueAgenda<{ ids: string[] }>>;
  /** 🔴 LOT AGENDA-TITRE-ET-LIENS — TOUS les événements de l'APPLICATION dans cet agenda (filtre de la marque), et
   *  rien d'autre : pour le rattrapage. Ce qui ne porte pas la marque n'est ni lu ni rendu. */
  listerNotres(agenda: string): Promise<IssueAgenda<{ evenements: { id: string; tacheId: number; titre: string; debut: string }[] }>>;
}

const DELAI_MS = 15_000;

const urlEvenements = (agenda: string) => `${BASE_AGENDA}${encodeURIComponent(agenda)}/events`;
const urlEvenement = (agenda: string, id: string) => `${urlEvenements(agenda)}/${encodeURIComponent(id)}`;

/** Le message d'un refus de Google, en français. PUR. */
export function motifGoogle(statut: number, corps: unknown): string {
  const e = (corps as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } } | null)?.error;
  const raison = e?.errors?.[0]?.reason ?? e?.status ?? '';
  if (statut === 401) return 'Google a refusé l’accès à l’agenda (autorisation absente ou expirée).';
  if (statut === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(`${raison} ${e?.message ?? ''}`)) {
    return 'L’interface « Google Calendar API » n’est pas activée dans la console Google Cloud.';
  }
  if (statut === 403) return `Google refuse ce geste sur l’agenda (${raison || 'accès refusé'}).`;
  if (statut === 429 || statut >= 500) return `Google est momentanément indisponible (${statut}) — nouvel essai automatique.`;
  return `Google a refusé l’envoi (${statut}${raison ? ` : ${raison}` : ''}).`;
}

/** LA PORTE RÉELLE (ou factice, selon le `fetch` reçu). Chaque appel passe par `fetchAgendaGarde`. */
export function creerPorteAgenda(deps: { jeton: JetonAgenda; fetch: typeof fetch }): PorteAgenda {
  const f = fetchAgendaGarde(deps.fetch);

  async function appel(agenda: string, url: string, init: RequestInit): Promise<{ ok: true; statut: number; corps: unknown } | { ok: false; motif: string }> {
    const j = await deps.jeton(agenda);
    if (!j.ok) return { ok: false, motif: j.motif };
    let res: Response;
    try {
      res = await f(url, {
        ...init,
        headers: { Authorization: `Bearer ${j.jeton}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        signal: AbortSignal.timeout(DELAI_MS),
      });
    } catch (e) {
      if (e instanceof AppelAgendaRefuse) throw e; // un refus du verrou n'est JAMAIS avalé : c'est un défaut du code
      return { ok: false, motif: 'Google n’a pas répondu à temps — nouvel essai automatique.' };
    }
    const corps = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: true, statut: res.status, corps };
  }

  /** Relit l'événement par son identifiant et vérifie qu'il est le NÔTRE pour cette tâche. */
  async function verifier(agenda: string, id: string, tacheId: number): Promise<IssueAgenda<Record<never, never>>> {
    const r = await appel(agenda, urlEvenement(agenda, id), { method: 'GET' });
    if (!r.ok) return { ok: false, sorte: 'echec', motif: r.motif };
    if (r.statut === 404 || r.statut === 410) return { ok: false, sorte: 'absent' };
    if (r.statut !== 200) return { ok: false, sorte: 'echec', motif: motifGoogle(r.statut, r.corps) };
    if ((r.corps as { status?: string } | null)?.status === 'cancelled') return { ok: false, sorte: 'absent' };
    if (!estNotreEvenement(r.corps, tacheId)) {
      return { ok: false, sorte: 'refus_garde', motif: 'Cet événement ne porte pas la marque de l’application pour cette tâche : il n’a pas été touché.' };
    }
    return { ok: true };
  }

  return {
    async creer(agenda, tacheId, ev) {
      if (!estNotreEvenement(ev, tacheId)) throw new AppelAgendaRefuse('création d’un événement sans la marque de cette tâche');
      const r = await appel(agenda, `${urlEvenements(agenda)}?supportsAttachments=true&sendUpdates=none`, { method: 'POST', body: JSON.stringify(ev) });
      if (!r.ok) return { ok: false, sorte: 'echec', motif: r.motif };
      const id = (r.corps as { id?: string } | null)?.id;
      if (r.statut !== 200 || typeof id !== 'string') return { ok: false, sorte: 'echec', motif: motifGoogle(r.statut, r.corps) };
      return { ok: true, id };
    },
    async modifier(agenda, evenementId, tacheId, ev) {
      if (!estNotreEvenement(ev, tacheId)) throw new AppelAgendaRefuse('modification vers un événement sans la marque de cette tâche');
      const v = await verifier(agenda, evenementId, tacheId);
      if (!v.ok) return v;
      const r = await appel(agenda, `${urlEvenement(agenda, evenementId)}?supportsAttachments=true&sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(ev) });
      if (!r.ok) return { ok: false, sorte: 'echec', motif: r.motif };
      if (r.statut === 404 || r.statut === 410) return { ok: false, sorte: 'absent' };
      if (r.statut !== 200) return { ok: false, sorte: 'echec', motif: motifGoogle(r.statut, r.corps) };
      return { ok: true, id: evenementId };
    },
    async supprimer(agenda, evenementId, tacheId) {
      const v = await verifier(agenda, evenementId, tacheId);
      if (!v.ok) return v;
      const r = await appel(agenda, `${urlEvenement(agenda, evenementId)}?sendUpdates=none`, { method: 'DELETE' });
      if (!r.ok) return { ok: false, sorte: 'echec', motif: r.motif };
      if (r.statut === 404 || r.statut === 410) return { ok: false, sorte: 'absent' };
      if (r.statut !== 204 && r.statut !== 200) return { ok: false, sorte: 'echec', motif: motifGoogle(r.statut, r.corps) };
      return { ok: true };
    },
    async chercher(agenda, tacheId) {
      const filtreTache = `privateExtendedProperty=${encodeURIComponent(`${CLE_TACHE}=${tacheId}`)}`;
      const r = await appel(agenda, `${urlEvenements(agenda)}?${FILTRE_MARQUE}&${filtreTache}&showDeleted=false&maxResults=10`, { method: 'GET' });
      if (!r.ok) return { ok: false, sorte: 'echec', motif: r.motif };
      if (r.statut !== 200) return { ok: false, sorte: 'echec', motif: motifGoogle(r.statut, r.corps) };
      const items = ((r.corps as { items?: unknown[] } | null)?.items ?? []);
      // Double garde : même filtrés par Google, on ne retient que ce qui porte la marque ET ce numéro.
      return { ok: true, ids: items.filter((x) => estNotreEvenement(x, tacheId)).map((x) => String((x as { id: string }).id)) };
    },
    async listerNotres(agenda) {
      const r = await appel(agenda, `${urlEvenements(agenda)}?${FILTRE_MARQUE}&showDeleted=false&maxResults=250`, { method: 'GET' });
      if (!r.ok) return { ok: false, sorte: 'echec', motif: r.motif };
      if (r.statut !== 200) return { ok: false, sorte: 'echec', motif: motifGoogle(r.statut, r.corps) };
      const items = ((r.corps as { items?: { id?: string; summary?: string; start?: { date?: string; dateTime?: string };
        extendedProperties?: { private?: Record<string, string> } }[] } | null)?.items ?? []);
      // Double garde : on ne retient que ce qui porte la marque ET un numéro de tâche.
      return { ok: true, evenements: items.flatMap((x) => {
        const n = Number(x.extendedProperties?.private?.[CLE_TACHE]);
        return Number.isSafeInteger(n) && n > 0 && estNotreEvenement(x, n)
          ? [{ id: String(x.id), tacheId: n, titre: x.summary ?? '', debut: x.start?.date ?? x.start?.dateTime ?? '' }] : [];
      }) };
    },
  };
}
