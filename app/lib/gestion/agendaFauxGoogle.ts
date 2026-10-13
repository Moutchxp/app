/**
 * ══ 🔴 LOT TACHES-AGENDA (lot 2) — LE FAUX GOOGLE AGENDA ═══════════════════════════════════════════════════════════
 *
 * Un `fetch` qui imite l'API Agenda, en mémoire : des agendas (par adresse), leurs événements, et le journal des
 * appels reçus. Il sert aux tests (toujours) et, sous vitest, de porte par défaut : AUCUN appel réel à Google pendant
 * le développement et les tests.
 *
 * On peut y semer des événements ÉTRANGERS (les « vrais rendez-vous ») pour prouver qu'ils ne sont jamais touchés, et
 * le mettre en PANNE pour éprouver « Agenda : à resynchroniser ».
 *
 * Sans base, sans réseau.
 */
import { BASE_AGENDA } from './agendaGoogle';

export interface FauxGoogle {
  fetch: typeof fetch;
  /** agenda (adresse) → identifiant → événement. */
  agendas: Map<string, Map<string, Record<string, unknown>>>;
  appels: { methode: string; url: string; corps: unknown }[];
  /** Vrai : chaque appel rend 503. */
  panne: boolean;
  semer(agenda: string, ev: Record<string, unknown>): string;
  /** Une copie profonde de tous les agendas, pour comparer avant / après. */
  instantane(): string;
}

export function creerFauxGoogle(): FauxGoogle {
  let compteur = 0;
  const agendas = new Map<string, Map<string, Record<string, unknown>>>();
  const agendaDe = (a: string) => {
    let m = agendas.get(a);
    if (!m) { m = new Map(); agendas.set(a, m); }
    return m;
  };
  const rep = (statut: number, corps?: unknown) => new Response(corps === undefined ? null : JSON.stringify(corps), {
    status: statut, headers: { 'Content-Type': 'application/json' },
  });
  const faux: FauxGoogle = {
    agendas,
    appels: [],
    panne: false,
    semer(agenda, ev) {
      compteur += 1;
      const id = `etranger${compteur}`;
      agendaDe(agenda).set(id, { ...structuredClone(ev), id });
      return id;
    },
    instantane() {
      return JSON.stringify([...agendas.entries()].map(([a, m]) => [a, [...m.entries()]]));
    },
    fetch: (async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url;
      const methode = (init?.method ?? 'GET').toUpperCase();
      const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      faux.appels.push({ methode, url, corps });
      if (faux.panne) return rep(503, { error: { message: 'Backend Error', status: 'UNAVAILABLE' } });
      const [chemin, requete = ''] = url.slice(BASE_AGENDA.length).split('?', 2);
      const [agendaBrut, , id] = chemin.split('/');
      const agenda = decodeURIComponent(agendaBrut);
      const evs = agendaDe(agenda);
      if (id === undefined) {
        if (methode === 'POST') {
          compteur += 1;
          const nid = `svav${compteur}`;
          evs.set(nid, { ...corps, id: nid, status: 'confirmed' });
          return rep(200, evs.get(nid));
        }
        const filtres = new URLSearchParams(requete).getAll('privateExtendedProperty').map((f) => f.split('='));
        const items = [...evs.values()].filter((e) => filtres.every(([k, v]) =>
          (e.extendedProperties as { private?: Record<string, string> } | undefined)?.private?.[k] === v));
        return rep(200, { items });
      }
      const ev = evs.get(decodeURIComponent(id));
      if (ev === undefined) return rep(404, { error: { message: 'Not Found' } });
      if (methode === 'GET') return rep(200, ev);
      if (methode === 'PATCH') { const n = { ...ev, ...corps }; evs.set(String(ev.id), n); return rep(200, n); }
      if (methode === 'DELETE') { evs.delete(String(ev.id)); return rep(204); }
      return rep(400, { error: { message: 'Méthode inconnue du faux Google' } });
    }) as typeof fetch,
  };
  return faux;
}

/** Un jeton factice (le faux Google n'en vérifie aucun). */
export const jetonFactice = async () => ({ ok: true as const, jeton: 'jeton-factice' });
