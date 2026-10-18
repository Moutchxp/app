import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 LA COPIE DEPUIS « Documents clients scannés » (décision d'Arno du 18/10/2026), ÉPROUVÉE SANS RÉSEAU.
 *
 * `fetchCopieScannes` est la défense en profondeur : même si un verdict se trompait, il ne laisse passer qu'un GET de
 * lecture ou un POST `files/<id>/copy` au corps exact. Chaque refus doit se produire AVANT tout envoi : le `fetch`
 * simulé échoue s'il est appelé.
 */
const queryMock = vi.fn(async (..._a: unknown[]) => ({ rows: [] }));
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import {
  copierDepuisScannes, creerDossierDeCopie, fetchCopieScannes, RequeteCopieRefusee,
} from './driveEcriture';
import { indexer, type ContexteCopieScannes, type NoeudArbre } from './driveGardeFou';

const API = 'https://www.googleapis.com/drive/v3';
const SCANNES = 'id-scannes';
const PROTEGES = new Set([SCANNES, 'br-actifs', 'f-scan-1']);
const n = (driveId: string, parentDriveId: string | null, sorte: string, nom: string): NoeudArbre =>
  ({ driveId, parentDriveId, sorte, nom, chemin: nom });
const IDX = indexer([
  n('rac-1', null, 'racine', 'Base de données locative'),
  n('arr-1', 'rac-1', 'arrivee', '00 Arrivée des mails'),
  n('cp-1', 'rac-1', 'copie_scannes', 'Import Documents clients scannés – copie du 18-10-2026'),
  n('cp-1-a', 'cp-1', 'copie_scannes', '1 actifs'),
]);
const CTX: ContexteCopieScannes = {
  scannesId: SCANNES, racineCopieId: 'cp-1', manifeste: new Set(['f-scan-1']), destinationsInterdites: new Set(['arr-1']),
};

/** Un `fetch` qui ÉCHOUE s'il est appelé : la preuve qu'un refus a eu lieu avant l'envoi. */
const interdit = vi.fn(async () => { throw new Error('ENVOYÉ alors que la requête devait être refusée'); });
const POST = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

beforeEach(() => { interdit.mockClear(); queryMock.mockClear(); });

describe('🔴 fetchCopieScannes — seules deux formes de requête passent', () => {
  const f = fetchCopieScannes(interdit as unknown as typeof fetch, PROTEGES);

  it.each(['PATCH', 'PUT', 'DELETE'])('%s sur un identifiant protégé est refusé avant tout envoi', async (m) => {
    await expect(f(`${API}/files/${SCANNES}?supportsAllDrives=true`, { method: m, body: '{"trashed":true}' }))
      .rejects.toBeInstanceOf(RequeteCopieRefusee);
    await expect(f(`${API}/files/f-scan-1?supportsAllDrives=true`, { method: m })).rejects.toBeInstanceOf(RequeteCopieRefusee);
    expect(interdit).not.toHaveBeenCalled();
  });

  it('un POST autre que /copy (création, permissions, envoi, watch, vidage de corbeille) est refusé', async () => {
    for (const url of [
      `${API}/files?supportsAllDrives=true`,
      `${API}/files/${SCANNES}/permissions?supportsAllDrives=true`,
      `${API}/files/f-scan-1/watch`,
      `${API}/files/trash?driveId=x`,
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    ]) {
      await expect(f(url, POST({ parents: ['cp-1-a'] })), url).rejects.toBeInstanceOf(RequeteCopieRefusee);
    }
    expect(interdit).not.toHaveBeenCalled();
  });

  it('un /copy dont le corps porte autre chose que parents + étiquettes est refusé', async () => {
    const url = `${API}/files/f-scan-1/copy?supportsAllDrives=true`;
    for (const corps of [
      { parents: ['cp-1-a'], name: 'renommé' },
      { parents: ['cp-1-a'], trashed: true },
      { parents: ['cp-1-a'], properties: { x: '1' } },
      { parents: ['cp-1-a'], description: 'x' },
      { parents: ['cp-1-a'], starred: true },
      { parents: ['cp-1-a'], appProperties: { autre: 'x' } },
      { parents: ['cp-1-a', 'cp-1'] },
      { parents: [SCANNES] },
      { parents: ['br-actifs'] },
      {},
    ]) {
      await expect(f(url, POST(corps)), JSON.stringify(corps)).rejects.toBeInstanceOf(RequeteCopieRefusee);
    }
    await expect(f(url, { method: 'POST', body: 'pas du json' })).rejects.toBeInstanceOf(RequeteCopieRefusee);
    expect(interdit).not.toHaveBeenCalled();
  });

  it('addParents / removeParents dans l’adresse sont refusés, quelle que soit la méthode', async () => {
    await expect(f(`${API}/files/f-scan-1?addParents=cp-1-a&removeParents=br-actifs`, { method: 'GET' }))
      .rejects.toBeInstanceOf(RequeteCopieRefusee);
    await expect(f(`${API}/files/f-scan-1/copy?addParents=cp-1-a`, POST({ parents: ['cp-1-a'] })))
      .rejects.toBeInstanceOf(RequeteCopieRefusee);
    expect(interdit).not.toHaveBeenCalled();
  });

  it('un GET hors de l’API des fichiers, ou sur permissions/révisions, est refusé', async () => {
    for (const url of [`${API}/drives`, `${API}/files/${SCANNES}/permissions`, `${API}/files/f-scan-1/revisions`, 'https://exemple.test/']) {
      await expect(f(url), url).rejects.toBeInstanceOf(RequeteCopieRefusee);
    }
    expect(interdit).not.toHaveBeenCalled();
  });

  it('ce qui PASSE : un GET de lecture, et un /copy au corps exact', async () => {
    const ok = vi.fn(async () => new Response('{}'));
    const g = fetchCopieScannes(ok as unknown as typeof fetch, PROTEGES);
    await g(`${API}/files/f-scan-1?supportsAllDrives=true&fields=id`);
    await g(`${API}/files/f-scan-1/copy?supportsAllDrives=true&fields=id`,
      POST({ parents: ['cp-1-a'], appProperties: { svav_source_id: 'f-scan-1', svav_source_modifie: '2026-10-18' } }));
    expect(ok).toHaveBeenCalledTimes(2);
  });
});

describe('🔴 copierDepuisScannes — le verdict d’abord, un seul POST au corps construit ici', () => {
  const demande = { sourceId: 'f-scan-1', sourceMime: 'application/pdf', sourceChaine: ['br-actifs', SCANNES], destinationId: 'cp-1-a' };

  it('copie permise : exactement UN POST files/<id>/copy, corps { parents, appProperties }', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const reseau = vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return new Response(JSON.stringify({ id: 'copie-1', name: 'scan.pdf', md5Checksum: 'abc', size: '12', mimeType: 'application/pdf' }));
    });
    const r = await copierDepuisScannes({ ...demande, sourceModifie: '2025-01-01T00:00:00Z' }, IDX, CTX, PROTEGES, 'jeton',
      { fetch: reseau as unknown as typeof fetch, attendre: async () => {} });
    expect(r).toEqual({ ok: true, id: 'copie-1', nom: 'scan.pdf', md5: 'abc', taille: '12', mime: 'application/pdf' });
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toMatch(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/f-scan-1\/copy\?/);
    expect(appels[0].init?.method).toBe('POST');
    expect(JSON.parse(String(appels[0].init?.body))).toEqual({
      parents: ['cp-1-a'], appProperties: { svav_source_id: 'f-scan-1', svav_source_modifie: '2025-01-01T00:00:00Z' },
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each([
    ['hors manifeste', { sourceId: 'f-scan-2' }],
    ['un dossier', { sourceMime: 'application/vnd.google-apps.folder' }],
    ['chaîne hors Documents clients scannés', { sourceChaine: ['ailleurs'] }],
    ['vers 00 Arrivée des mails', { destinationId: 'arr-1' }],
    ['vers Documents clients scannés', { destinationId: SCANNES }],
    ['à même le dossier de copie', { destinationId: 'cp-1' }],
    ['vers notre racine', { destinationId: 'rac-1' }],
  ])('refus (%s) : AUCUN envoi, et le refus est journalisé', async (_cas, ecart) => {
    const r = await copierDepuisScannes({ ...demande, ...ecart }, IDX, CTX, PROTEGES, 'jeton',
      { fetch: interdit as unknown as typeof fetch, attendre: async () => {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refuse).toBe(true);
    expect(interdit).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(String(queryMock.mock.calls[0][0])).toContain('INSERT INTO gestion_drive_refus');
  });
});

describe('creerDossierDeCopie — le nom EXACT, l’étiquette, et seulement sous le dossier de copie', () => {
  it('crée sous un miroir, avec le nom tel quel (espace final compris) et svav_source_id', async () => {
    const appels: RequestInit[] = [];
    const reseau = vi.fn(async (_u: string, init?: RequestInit) => {
      appels.push(init ?? {});
      return new Response(JSON.stringify({ id: 'd-1', name: 'Syndic ' }));
    });
    const r = await creerDossierDeCopie({ parentDriveId: 'cp-1-a', nom: 'Syndic ', sourceId: 'src-9' }, IDX, CTX, 'jeton',
      { fetch: reseau as unknown as typeof fetch, attendre: async () => {} });
    expect(r).toEqual({ ok: true, id: 'd-1', nom: 'Syndic ' });
    expect(JSON.parse(String(appels[0].body))).toEqual({
      name: 'Syndic ', mimeType: 'application/vnd.google-apps.folder', parents: ['cp-1-a'],
      appProperties: { svav_source_id: 'src-9' },
    });
  });

  it.each([
    ['sous notre racine, hors dossier de copie', { parentDriveId: 'rac-1' }],
    ['sous 00 Arrivée des mails', { parentDriveId: 'arr-1' }],
    ['dans Documents clients scannés', { parentDriveId: SCANNES }],
    ['au nom exact « Documents clients scannés »', { nom: 'Documents clients scannés' }],
    ['au nom vide', { nom: '  ' }],
  ])('refus (%s) : aucun envoi', async (_cas, ecart) => {
    const r = await creerDossierDeCopie({ parentDriveId: 'cp-1-a', nom: 'Photos', sourceId: 's', ...ecart }, IDX, CTX, 'jeton',
      { fetch: interdit as unknown as typeof fetch, attendre: async () => {} });
    expect(r.ok).toBe(false);
    expect(interdit).not.toHaveBeenCalled();
  });
});
