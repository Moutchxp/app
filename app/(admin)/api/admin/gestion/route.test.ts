import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Base MOCKÉE : aucune connexion réelle, aucune écriture possible.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
// Garde de module MOCKÉE : ce fichier teste le CONTRAT de la route (qui passe, qui est refusé, ce qu'elle rend).
// La garde elle-même a ses propres tests (garde.test.ts), et le proxy les siens (proxy.test.ts) — trois barrières,
// trois jeux de tests indépendants.
const gardeMock = vi.fn();
vi.mock('../../../../lib/admin/garde', () => ({ exigerModule: (...args: unknown[]) => gardeMock(...args) }));

import { GET } from './route';

const requete = () => new Request('http://local/api/admin/gestion');

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  gardeMock.mockReset();
  gardeMock.mockResolvedValue({ auteurId: 1 }); // autorisé par défaut ; le refus est testé explicitement
});

describe('/api/admin/gestion — la deuxième barrière', () => {
  it('exige le module « gestion », et rien d’autre', async () => {
    await GET(requete());
    expect(gardeMock).toHaveBeenCalledTimes(1);
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('refus de la garde → la réponse du refus est rendue TELLE QUELLE, et AUCUNE requête n’est émise', async () => {
    gardeMock.mockResolvedValue({ refus: new Response(null, { status: 403 }) });
    const res = await GET(requete());
    expect(res.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled(); // un refusé ne déclenche même pas une lecture
  });
});

describe('/api/admin/gestion — ce qu’elle rend', () => {
  it('base vide → un écran vide COMPLET (jamais un champ manquant que la vue devrait deviner)', async () => {
    const res = await GET(requete());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      file: [], filsTotal: 0, evenements: [], evenementsTotal: 0,
      messagesCaptures: 0, messagesExclus: 0, derniereReleveLe: null,
      // LOT 4b — la fenêtre d'activité et ce qu'elle tait font partie de l'écran : les taire serait le masquage
      //   silencieux que la migration 232 s'interdit explicitement.
      fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0,
    });
  });

  it('panne de base → 503 avec un message DISTINGUABLE, jamais une file vide qui ferait croire au calme', async () => {
    queryMock.mockRejectedValue(new Error('connexion refusée'));
    const res = await GET(requete());
    expect(res.status).toBe(503);
    const body = await res.json() as { erreur?: string; file?: unknown };
    expect(body.erreur).toBeTruthy();
    expect(body.file).toBeUndefined(); // surtout pas un écran vide déguisé en succès
  });
});

describe('/api/admin/gestion — LECTURE SEULE, vérifiable', () => {
  const src = readFileSync('app/(admin)/api/admin/gestion/route.ts', 'utf8');

  it('n’expose que GET : aucun verbe d’écriture n’existe sur cette route', () => {
    expect(/export async function (POST|PUT|PATCH|DELETE)\b/.test(src)).toBe(false);
    expect(/export async function GET\b/.test(src)).toBe(true);
  });

  it('n’émet que des lectures', async () => {
    await GET(requete());
    const sqls = queryMock.mock.calls.map((c) => c[0]).filter((t): t is string => typeof t === 'string');
    expect(sqls.length).toBeGreaterThan(0);
    for (const s of sqls) expect(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(s)).toBe(false);
  });
});
