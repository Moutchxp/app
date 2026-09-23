import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { IssueReleve } from '../../../../../lib/gestion/releve';
import type { RapportCapture } from '../../../../../lib/gestion/capture';

// Garde d'ÉCRITURE et relève MOCKÉES : ce fichier teste le CONTRAT de la route. La garde a ses tests (garde.test.ts),
// le proxy les siens, la relève les siens — quatre barrières, quatre jeux de tests indépendants.
const gardeMock = vi.fn();
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const releverMock = vi.fn();
vi.mock('../../../../../lib/gestion/releveReelle', () => ({ relever: (...a: unknown[]) => releverMock(...a) }));

import { POST } from './route';

const requete = () => new Request('http://local/api/admin/gestion/relever', { method: 'POST' });
const rapport = (o: Partial<RapportCapture> = {}): RapportCapture => ({
  mode: 'applique', dossier: '_GESTION BOITE MAIL', depuis: '2026-06-25T12:00:00Z',
  uidsServeur: 10, plafondAtteint: false, vus: 10, dejaConnus: 2, captures: 8, recus: 5, envoyes: 3, exclus: 4,
  filsCrees: 6, filsFusionnes: 1, piecesDeposees: 2, piecesNonDeposees: 1, echecsLecture: 0, parRegle: {}, ...o,
});
const issue = (o: Partial<IssueReleve> = {}): IssueReleve => ({ resultat: 'ok', raison: 'ok', runId: 1, rapport: rapport(), ...o });

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null); // autorisé par défaut
  releverMock.mockReset(); releverMock.mockResolvedValue(issue());
});

describe('garde d’écriture', () => {
  it('exige un COMPTE ACTIF avec le droit « gestion » — la base est relue à chaque clic', async () => {
    await POST(requete());
    expect(gardeMock).toHaveBeenCalledTimes(1);
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('refusée → la réponse du refus est rendue telle quelle, et AUCUNE passe n’est lancée', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(requete())).status).toBe(403);
    expect(releverMock).not.toHaveBeenCalled();
  });
});

describe('la passe', () => {
  it('lance TOUJOURS le mode appliqué : la route n’est pas un chemin de simulation', async () => {
    await POST(requete());
    expect(releverMock).toHaveBeenCalledWith(true);
  });

  it('succès → compteurs agrégés et résumé ; aucune donnée de message ne sort', async () => {
    const res = await POST(requete());
    const body = await res.json() as { resultat: string; resume: string; compteurs: Record<string, unknown> };
    expect(body.resultat).toBe('ok');
    expect(body.resume).toContain('8 capturé(s)');
    expect(body.compteurs).toMatchObject({ messagesLus: 10, captures: 8, exclus: 4, recus: 5, envoyes: 3, piecesNonDeposees: 1 });
    expect(JSON.stringify(body)).not.toContain('@'); // ni adresse, ni objet, ni corps : que des nombres
  });

  it('plafond atteint → le RESTE À VOIR est renvoyé, sinon on croirait avoir tout pris', async () => {
    releverMock.mockResolvedValue(issue({ rapport: rapport({ plafondAtteint: true, uidsServeur: 1200, vus: 400 }) }));
    const body = await (await POST(requete())).json() as { compteurs: { plafondAtteint: boolean; resteAVoir: number } };
    expect(body.compteurs).toMatchObject({ plafondAtteint: true, resteAVoir: 800 });
  });

  it('« occupe » et « inactif » rendent leur motif, jamais un « erreur » générique', async () => {
    for (const r of ['occupe', 'inactif'] as const) {
      releverMock.mockResolvedValue(issue({ resultat: r, rapport: null, raison: `motif ${r}` }));
      const body = await (await POST(requete())).json() as { resultat: string; message: string };
      expect(body).toEqual({ resultat: r, message: `motif ${r}` });
    }
  });

  it('échec inattendu → 503 explicite, jamais un succès silencieux', async () => {
    releverMock.mockRejectedValue(new Error('base indisponible'));
    const res = await POST(requete());
    expect(res.status).toBe(503);
    expect((await res.json() as { resultat: string }).resultat).toBe('erreur');
  });
});

describe('garantie STATIQUE — aucun envoi vers l’extérieur n’est atteignable', () => {
  const src = readFileSync('app/(admin)/api/admin/gestion/relever/route.ts', 'utf8');

  it('n’expose que POST, et n’importe aucun module d’émission', () => {
    expect(/export async function POST\b/.test(src)).toBe(true);
    expect(/export async function (GET|PUT|PATCH|DELETE)\b/.test(src)).toBe(false);
    // Sur les IMPORTS, pas sur la prose : le commentaire d'en-tête cite nodemailer pour dire qu'il n'y est PAS.
    const modules = src.split('\n').filter((l) => !/^\s*import\s+type\b/.test(l))
      .flatMap((l) => [...l.matchAll(/(?:from\s*|import\s*\(\s*|^\s*import\s+)'([^']+)'/g)].map((m) => m[1]));
    expect(modules.some((m) => /nodemailer|email/.test(m))).toBe(false);
    expect(modules).toContain('../../../../../lib/gestion/releveReelle');
  });
});
