import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 LA CORBEILLE DES COPIES FAUTIVES (décision d'Arno du 19/10/2026), éprouvée sans réseau : le verdict d'abord, la
 * seule écriture de corbeille du dépôt ensuite, le journal des mouvements enfin. Rien d'autre.
 */
const queryMock = vi.fn(async (..._a: unknown[]) => ({ rows: [] as unknown[] }));
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const inscrire = vi.fn(async (..._a: unknown[]) => 7);
vi.mock('./driveMouvementRepo', () => ({ inscrireMouvement: (...a: unknown[]) => inscrire(...a) }));

import { mettreCopiesFautivesALaCorbeille, type FicheDrive } from './corbeilleCopieScannes';

const ARBRE: Record<string, FicheDrive> = {
  'fautive-1': { id: 'fautive-1', name: 'Copie de Mandat de location signé', mimeType: 'application/vnd.google-apps.document', parents: ['proprio-cp'] },
  'proprio-cp': { id: 'proprio-cp', name: 'Propriétaire', mimeType: 'application/vnd.google-apps.folder', parents: ['cp'] },
  cp: { id: 'cp', name: 'Import Documents clients scannés – copie du 18-10-2026', mimeType: 'application/vnd.google-apps.folder', parents: ['racine'] },
  racine: { id: 'racine', name: 'Base de données locative', mimeType: 'application/vnd.google-apps.folder', parents: ['drive'] },
  drive: { id: 'drive', name: 'Drive', mimeType: 'application/vnd.google-apps.folder' },
  'original-1': { id: 'original-1', name: 'Mandat de location signé', mimeType: 'application/vnd.google-apps.document', parents: ['proprio-sc'] },
  'proprio-sc': { id: 'proprio-sc', name: 'Propriétaire', mimeType: 'application/vnd.google-apps.folder', parents: ['scannes'] },
  scannes: { id: 'scannes', name: 'Documents clients scannés', mimeType: 'application/vnd.google-apps.folder', parents: ['drive'] },
  'dossier-cp': { id: 'dossier-cp', name: 'Propriétaire', mimeType: 'application/vnd.google-apps.folder', parents: ['cp'] },
};
const lire = async (id: string): Promise<FicheDrive> => {
  const f = ARBRE[id];
  if (f === undefined) throw new Error(`inconnu ${id}`);
  return f;
};
let ecritures: { url: string; init?: RequestInit }[];
const reseau = vi.fn(async (url: string, init?: RequestInit) => {
  ecritures.push({ url, init });
  return new Response(JSON.stringify({ id: url.split('/').pop()?.split('?')[0], name: 'x', trashed: true }));
});
const ECRITURE = { jeton: 'j', deps: { fetch: reseau as unknown as typeof fetch }, compteGoogle: 'gestion@exemple.fr', auteurLibelle: 'copie — corbeille des copies fautives' };
const O = { racineCopieId: 'cp', scannesId: 'scannes', interdits: new Set(['arrivee']) };

beforeEach(() => { ecritures = []; inscrire.mockClear(); queryMock.mockClear(); });

describe('mettreCopiesFautivesALaCorbeille', () => {
  it('une copie listée, sous le dossier de copie : UN PATCH { trashed: true }, puis le journal des mouvements', async () => {
    const r = await mettreCopiesFautivesALaCorbeille({ ...O, ids: ['fautive-1'] }, lire, ECRITURE);
    expect(r).toEqual({ faits: [{ id: 'fautive-1', nom: 'Copie de Mandat de location signé', mouvementId: 7 }], refuses: [] });
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].init?.method).toBe('PATCH');
    expect(JSON.parse(String(ecritures[0].init?.body))).toEqual({ trashed: true });
    expect(inscrire.mock.calls[0][0]).toMatchObject({ action: 'corbeille', driveId: 'fautive-1', parentOrigine: 'proprio-cp', parentCible: '' });
  });

  it('🔴 JAMAIS dans « Documents clients scannés », même si l’identifiant est passé dans la liste : refus journalisé, aucun envoi', async () => {
    const r = await mettreCopiesFautivesALaCorbeille({ ...O, ids: ['original-1'] }, lire, ECRITURE);
    expect(r.faits).toEqual([]);
    expect(r.refuses[0].motif).toContain('Documents clients scannés');
    expect(ecritures).toHaveLength(0);
    expect(inscrire).not.toHaveBeenCalled();
    expect(queryMock.mock.calls.some((c) => String(c[0]).includes('gestion_drive_refus'))).toBe(true);
  });

  it('un dossier, même listé et sous le dossier de copie : refus, aucun envoi', async () => {
    const r = await mettreCopiesFautivesALaCorbeille({ ...O, ids: ['dossier-cp'] }, lire, ECRITURE);
    expect(r.refuses).toHaveLength(1);
    expect(ecritures).toHaveLength(0);
  });

  it('une lecture qui échoue vaut refus', async () => {
    const r = await mettreCopiesFautivesALaCorbeille({ ...O, ids: ['nulle-part'] }, lire, ECRITURE);
    expect(r.refuses[0].motif).toContain('lecture impossible');
    expect(ecritures).toHaveLength(0);
  });
});

describe('🔒 ce que ce module ne sait pas faire', () => {
  const code = readFileSync('app/lib/gestion/corbeilleCopieScannes.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  it('aucune requête à lui : ni fetch direct, ni DELETE, ni emptyTrash ; la seule écriture est basculerCorbeille, vers la corbeille', () => {
    expect(code).not.toMatch(/fetch\(/);
    expect(code).not.toMatch(/DELETE|emptyTrash|files\.delete/i);
    expect(code.match(/basculerCorbeille\(/g)).toHaveLength(1);
    expect(code).toContain('versLaCorbeille: true');
    expect(code).not.toContain('versLaCorbeille: false');
    // Le verdict précède l'écriture.
    expect(code.indexOf('verifierCorbeilleCopie(')).toBeLessThan(code.indexOf('basculerCorbeille('));
  });
});
