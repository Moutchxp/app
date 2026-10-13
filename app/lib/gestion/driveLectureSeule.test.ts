import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EcritureDriveRefusee, fetchDriveLectureSeule, refusEcritureDrive } from './driveLectureSeule';
import { deposerFichier, listerContenu } from './drive';
import { copierFichier, deplacerVers } from './driveMouvement';

/**
 * ══ 🔴🔴 LOT TACHES-PIECES-DRIVE — LE GARDE-FOU : TOUTE ÉCRITURE DRIVE EST REFUSÉE ═══════════════════════════════
 * Règle absolue d'Arno : lecture seule stricte pour les pièces des tâches. On éprouve le verrou lui-même, puis les
 * VRAIES fonctions d'écriture du module Drive branchées dessus : aucune requête ne part.
 */
const F = 'https://www.googleapis.com/drive/v3/files';

describe('🔴 refusEcritureDrive', () => {
  it('laisse passer les lectures de l’API Drive', () => {
    expect(refusEcritureDrive(`${F}?q=x`, 'GET')).toBeNull();
    expect(refusEcritureDrive(`${F}/abc123?fields=id`, undefined)).toBeNull();
    expect(refusEcritureDrive('https://www.googleapis.com/drive/v3/drives?pageSize=10', 'GET')).toBeNull();
  });
  it.each(['POST', 'PATCH', 'PUT', 'DELETE', 'post'])('refuse la méthode %s (créer, renommer, déplacer, corbeille, supprimer)', (m) => {
    expect(refusEcritureDrive(`${F}/abc`, m)).not.toBeNull();
  });
  it('refuse l’envoi de fichiers, les autres API, et les sous-ressources d’écriture même en GET', () => {
    expect(refusEcritureDrive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', 'GET')).not.toBeNull();
    expect(refusEcritureDrive('https://gmail.googleapis.com/gmail/v1/users/me/messages', 'GET')).not.toBeNull();
    expect(refusEcritureDrive(`${F}/abc/permissions`, 'GET')).not.toBeNull();
    expect(refusEcritureDrive(`${F}/abc/copy`, 'GET')).not.toBeNull();
    expect(refusEcritureDrive(`${F}/trash/emptyTrash`, 'GET')).not.toBeNull();
    expect(refusEcritureDrive('https://www.googleapis.com/drive/v3/changes/watch', 'GET')).not.toBeNull();
  });
});

describe('🔴 fetchDriveLectureSeule : refuse AVANT d’envoyer', () => {
  it('une écriture lève EcritureDriveRefusee, et le vrai fetch n’est jamais appelé', async () => {
    const base = vi.fn(async () => new Response('{}'));
    const f = fetchDriveLectureSeule(base as unknown as typeof fetch);
    await expect(f(`${F}/abc`, { method: 'PATCH', body: '{"name":"x"}' })).rejects.toBeInstanceOf(EcritureDriveRefusee);
    await expect(f(`${F}/abc`, { method: 'DELETE' })).rejects.toBeInstanceOf(EcritureDriveRefusee);
    expect(base).not.toHaveBeenCalled();
    await f(`${F}?q=x`);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('les VRAIES fonctions d’écriture du module Drive, branchées sur le verrou, n’envoient rien', async () => {
    const base = vi.fn(async (_u: unknown, _i?: RequestInit) => Response.json({ id: "x", name: "x", files: [] }));
    const deps = { fetch: fetchDriveLectureSeule(base as unknown as typeof fetch) };
    const essais = [
      () => deposerFichier('j', { nom: 'a.pdf', typeMime: 'application/pdf', octets: new Uint8Array([1]), dossierId: 'd' }, deps),
      () => deplacerVers('j', { id: 'f', parentOrigine: 'a', parentCible: 'b' }, deps),
      () => copierFichier('j', { id: 'f', parentCible: 'b' }, deps),
    ];
    for (const e of essais) {
      try { await e(); } catch { /* refus par exception : c'est le but */ }
    }
    expect(base.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') !== 'GET')).toEqual([]);
    // Et une lecture passe bien par le vrai fetch.
    await listerContenu('j', { parentId: 'd' }, deps);
    expect(base).toHaveBeenCalled();
  });
});

describe('🔴 les tâches ne lisent le Drive QUE par le verrou', () => {
  const src = readFileSync('app/lib/gestion/tachesDrive.ts', 'utf8');
  it('aucune fonction d’écriture importée, et toutes les lectures reçoivent fetchDriveLectureSeule', () => {
    expect(src).toContain("const LECTURE = () => ({ fetch: fetchDriveLectureSeule() });");
    for (const ecriture of ['deposerFichier', 'deplacerVers', 'copierFichier', 'creerDossier', 'renommer', 'corbeille', 'Corbeille', 'creerRaccourci']) {
      expect(src).not.toMatch(new RegExp(`import[^;]*\\b${ecriture}`));
    }
    expect(src).not.toMatch(/\{ fetch \}/);
  });
  it('la route du sélecteur n’a qu’un GET', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/taches/drive/route.ts', 'utf8');
    expect(route).toMatch(/export async function GET/);
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
  });
});
