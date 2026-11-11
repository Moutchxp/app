import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (11/11/2026, 468) — LES PIÈCES JOINTES DE « VALIDER L'ÉTAT DES LIEUX DE SORTIE », côté serveur, sur un DRIVE SIMULÉ :
 * le dossier du bien (Base de données locative › Actifs › … › bien), « Documents clients scannés » et un autre dossier. Aucune requête ne
 * part ; chaque appel au Drive est enregistré — 🔴 AUCUNE N'EST UNE ÉCRITURE, et l'EMPREINTE du Drive est la même avant et après.
 */
type Noeud = { id: string; name: string; mimeType: string; parents: string[]; size?: string; modifiedTime?: string; contenu?: string };
const DOSSIER = 'application/vnd.google-apps.folder';
const D = (id: string, name: string, parent: string | null): Noeud => ({ id, name, mimeType: DOSSIER, parents: parent ? [parent] : [] });
const F = (id: string, name: string, parent: string, mimeType: string, contenu: string, modifiedTime: string): Noeud =>
  ({ id, name, mimeType, parents: [parent], contenu, size: String(Buffer.byteLength(contenu)), modifiedTime });
const DRIVE: Noeud[] = [
  D('DRIVEGESTION01', 'GESTION LOCATIVE', null),
  D('BASELOCATIVE01', 'Base de données locative', 'DRIVEGESTION01'), D('ACTIFS0000001', 'Actifs', 'BASELOCATIVE01'),
  D('PROPRIO000001', 'DUPONT Jean (5)', 'ACTIFS0000001'), D('ADRESSE000001', '4 rue Fictive', 'PROPRIO000001'), D('BIEN000000001', 'Lot 100', 'ADRESSE000001'),
  D('LOCATAIRES001', '6 Locataires', 'BIEN000000001'),
  F('EDLSORTIE0001', 'EDL sortie BERNARD.pdf', 'LOCATAIRES001', 'application/pdf', 'PDF-EDL-SORTIE', '2026-11-10T09:00:00Z'),
  F('PHOTOSALON001', 'salon.jpg', 'BIEN000000001', 'image/jpeg', 'JPEG-SALON', '2026-11-08T09:00:00Z'),
  F('TABLEUR000001', 'charges.xlsx', 'BIEN000000001', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX', '2026-11-09T09:00:00Z'),
  D('SCANNES000001', 'Documents clients scannés', 'DRIVEGESTION01'), D('SCANACTIFS001', '1 actifs', 'SCANNES000001'),
  F('AVISIMPOT0001', 'avis impot DUPONT.pdf', 'SCANACTIFS001', 'application/pdf', 'AVIS-IMPOSITION', '2026-01-01T09:00:00Z'),
  D('AUTREBIEN0001', 'Lot 200', 'ACTIFS0000001'),
  F('AUTREPIECE001', 'autre bail.pdf', 'AUTREBIEN0001', 'application/pdf', 'AUTRE', '2026-11-01T09:00:00Z'),
];
const empreinteDrive = (): string => createHash('sha256').update(JSON.stringify(DRIVE)).digest('hex');
const requetes: { methode: string; url: string }[] = [];
const fetchDrive = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(u));
  requetes.push({ methode: (init?.method ?? 'GET').toUpperCase(), url: url.pathname + url.search });
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return new Response('{}', { status: 403 });
  const m = url.pathname.match(/\/files\/([^/]+)$/);
  if (m) {
    const n = DRIVE.find((x) => x.id === decodeURIComponent(m[1]));
    if (!n) return new Response('{}', { status: 404 });
    if (url.searchParams.get('alt') === 'media') return new Response(n.contenu ?? '', { status: 200 });
    return Response.json({ id: n.id, name: n.name, mimeType: n.mimeType, size: n.size, parents: n.parents, driveId: 'DRIVEGESTION01', trashed: false });
  }
  if (/\/files$/.test(url.pathname)) {
    const parent = (url.searchParams.get('q') ?? '').match(/'([^']+)' in parents/)?.[1];
    return Response.json({ files: DRIVE.filter((x) => x.parents[0] === parent).map((x) => ({ id: x.id, name: x.name, mimeType: x.mimeType, size: x.size, modifiedTime: x.modifiedTime, parents: x.parents })) });
  }
  return new Response('{}', { status: 404 });
});

const h = vi.hoisted(() => ({ inscrites: [] as unknown[][], depots: [] as { cle: string; octets: string }[], dossier: 'BIEN000000001' as string | null }));
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO gestion_location_sortie_piece')) { h.inscrites.push(params); return { rows: [{ id: String(h.inscrites.length) }] }; }
    if (sql.includes('FROM gestion_location_sortie_piece')) {
      const ids = (params[0] as number[]).map(Number);
      return { rows: h.inscrites.map((p, i) => ({ id: String(i + 1), occ: p[0], nom: p[2], type_mime: p[3], taille_octets: String(p[4]), cle_stockage: p[5], empreinte_sha256: p[6], provenance: p[1] }))
        .filter((r) => ids.includes(Number(r.id)) && (params[1] === undefined || (params[1] as number[]).includes(Number(r.occ)))) };
    }
    throw new Error(`requête inattendue : ${sql.slice(0, 60)}`);
  }),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./sortieLocatairesRepo', () => ({ lireBail: async (occ: number) => (occ === 11 ? { lotId: 7 } : null) }));
vi.mock('../gestion/arbreStatutDriveRepo', () => ({ dossierDriveDuLot: async () => (h.dossier ? { driveId: h.dossier, place: { arbre: 'locative', branche: 'Actifs' } } : null) }));
vi.mock('../stockage', () => ({
  deposerPieceSortie: async (octets: Buffer) => {
    const cle = `location/sorties/11/${h.depots.length + 1}.bin`;
    h.depots.push({ cle, octets: Buffer.from(octets).toString() });
    return { depose: true, cle, taille: octets.byteLength, empreinte: createHash('sha256').update(octets).digest('hex') };
  },
  recuperer: async (cle: string) => Buffer.from(h.depots.find((d) => d.cle === cle)!.octets),
}));

import { fichiersDriveDuBien, joindreDepuisDrive, joindreDepuisOrdinateur, piecesPourEnvoi } from './piecesSortieRepo';

const AUTEUR = { id: 3, libelle: 'arno@exemple.test' };
const DEPS = { fetch: fetchDrive as unknown as typeof fetch };
beforeEach(() => {
  requetes.length = 0; h.inscrites.length = 0; h.depots.length = 0; h.dossier = 'BIEN000000001';
  globalThis.fetch = fetchDrive as unknown as typeof fetch; // le verdict (chaîne des parents) passe par le `fetch` global
});

describe('« Depuis le Drive du bien » : la liste — lecture seule', () => {
  it('les fichiers du dossier du bien (sous-dossiers compris), les plus récents d’abord ; type/taille ; filtre « États des lieux » ; rien d’autre du Drive', async () => {
    const avant = empreinteDrive();
    const r = await fichiersDriveDuBien(11, 'jeton', DEPS);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.fichiers.map((f) => [f.nom, f.joignable, f.etatDesLieux, f.chemin.join('/')])).toEqual([
      ['EDL sortie BERNARD.pdf', true, true, '6 Locataires'], ['charges.xlsx', false, false, ''], ['salon.jpg', true, false, '']]);
    expect(requetes.every((q) => q.methode === 'GET')).toBe(true);
    expect(empreinteDrive()).toBe(avant);
  });
  it('bien sans dossier Drive connu : message clair (et le lien vers la fiche du bien à l’écran)', async () => {
    h.dossier = null;
    expect(await fichiersDriveDuBien(11, 'jeton', DEPS)).toMatchObject({ etat: 'sans_dossier', lotId: 7, motif: expect.stringContaining('renseignez-le sur la fiche du bien') });
  });
  it('🔴 un dossier « du bien » qui serait sous « Documents clients scannés » : REFUS, rien n’est listé', async () => {
    h.dossier = 'SCANACTIFS001';
    const r = await fichiersDriveDuBien(11, 'jeton', DEPS);
    expect(r).toMatchObject({ etat: 'refus', motif: expect.stringContaining('Documents clients scannés') });
    expect(requetes.some((q) => q.url.includes('in+parents') || q.url.includes('%27SCANACTIFS001%27'))).toBe(false);
  });
});

describe('« Joindre » depuis le Drive du bien', () => {
  it('lit les octets du fichier du bien (GET alt=media), les dépose sur le stockage, inscrit la pièce — AUCUNE écriture Drive, empreinte inchangée', async () => {
    const avant = empreinteDrive();
    const r = await joindreDepuisDrive(11, ['EDLSORTIE0001'], [], 'jeton', AUTEUR, DEPS);
    expect(r).toMatchObject({ etat: 'ok', data: { pieces: [{ id: 1, nom: 'EDL sortie BERNARD.pdf', typeMime: 'application/pdf', provenance: 'drive' }], refus: [] } });
    expect(h.depots.map((d) => d.octets)).toEqual(['PDF-EDL-SORTIE']);
    expect(h.inscrites[0].slice(0, 3)).toEqual([11, 'drive', 'EDL sortie BERNARD.pdf']);
    expect(requetes.every((q) => q.methode === 'GET')).toBe(true);
    expect(empreinteDrive()).toBe(avant);
  });
  it('🔴 « Documents clients scannés » : refusé AVANT toute lecture de contenu (aucun alt=media), rien n’est déposé ; empreinte inchangée', async () => {
    const avant = empreinteDrive();
    const r = await joindreDepuisDrive(11, ['AVISIMPOT0001'], [], 'jeton', AUTEUR, DEPS);
    expect(r).toMatchObject({ etat: 'ok', data: { pieces: [] } });
    expect((r as { data: { refus: string[] } }).data.refus[0]).toContain('Documents clients scannés');
    expect(requetes.some((q) => q.url.includes('alt=media'))).toBe(false);
    expect(h.depots).toEqual([]);
    expect(requetes.every((q) => q.methode === 'GET')).toBe(true);
    expect(empreinteDrive()).toBe(avant);
  });
  it('un fichier d’un AUTRE bien, ou d’un type refusé : refusé, rien n’est lu ni déposé', async () => {
    const r = await joindreDepuisDrive(11, ['AUTREPIECE001', 'TABLEUR000001'], [], 'jeton', AUTEUR, DEPS);
    expect((r as { data: { refus: string[] } }).data.refus).toEqual(['Ce fichier n’est pas dans le dossier Drive de ce bien.', expect.stringContaining('type refusé')]);
    expect(requetes.some((q) => q.url.includes('alt=media'))).toBe(false);
    expect(h.depots).toEqual([]);
  });
});

describe('Depuis l’ordinateur (glisser-déposer, « Parcourir »)', () => {
  it('types acceptés, taille par fichier et total refusés au-delà ; le reste est déposé', async () => {
    const gros = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const neuf = Buffer.alloc(9 * 1024 * 1024, 2);
    const r = await joindreDepuisOrdinateur(11, [
      { nom: 'photo.heic', typeMime: '', octets: Buffer.from('HEIC') }, { nom: 'notes.txt', typeMime: 'text/plain', octets: Buffer.from('x') },
      { nom: 'enorme.pdf', typeMime: 'application/pdf', octets: gros }, { nom: 'a.pdf', typeMime: 'application/pdf', octets: neuf },
    ], [{ taille: 6 * 1024 * 1024 }], AUTEUR);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.pieces.map((p) => [p.nom, p.typeMime, p.provenance])).toEqual([['photo.heic', 'image/heic', 'ordinateur']]);
    expect(r.data.refus).toEqual([expect.stringContaining('« notes.txt » : type refusé'), expect.stringContaining('au-delà de 10 Mo par fichier'),
      expect.stringContaining('le total des pièces dépasserait 15 Mo')]);
  });
});

describe('Les pièces pour l’envoi', () => {
  it('seulement celles du préavis, octets relus et VÉRIFIÉS ; une pièce d’un autre bail est refusée', async () => {
    await joindreDepuisOrdinateur(11, [{ nom: 'cr.pdf', typeMime: 'application/pdf', octets: Buffer.from('PDF') }], [], AUTEUR);
    const ok = await piecesPourEnvoi([1], [11]);
    expect(ok.ok && ok.pieces.map((p) => [p.nom, Buffer.from(p.octets!).toString()])).toEqual([['cr.pdf', 'PDF']]);
    expect(await piecesPourEnvoi([1], [99])).toMatchObject({ ok: false, motif: expect.stringContaining('introuvable') });
    h.depots[0].octets = 'ALTERE';
    expect(await piecesPourEnvoi([1], [11])).toMatchObject({ ok: false, motif: expect.stringContaining('a changé depuis son ajout') });
  });
});
