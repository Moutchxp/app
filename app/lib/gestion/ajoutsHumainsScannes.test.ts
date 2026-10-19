import { describe, expect, it } from 'vitest';
import { jugerAjoutsHumains, motifAuteurRefuse, type ElementReleve } from './ajoutsHumainsScannes';

/**
 * ACCEPTER LES AJOUTS HUMAINS PURS (Arno, 19/10/2026) — pour R et D seulement. Identifiants et noms fictifs.
 */
const DOSSIER = 'application/vnd.google-apps.folder';
const SC = 'scannes0000x';
const ref: ElementReleve[] = [
  { id: SC, name: 'Documents clients scannés', mimeType: DOSSIER, modifiedTime: '2026-01-01T00:00:00Z' },
  { id: 'proprio0001x', name: 'Nom', mimeType: DOSSIER, parents: [SC], modifiedTime: '2026-02-01T00:00:00Z' },
  { id: 'fichier001xx', name: 'bail.pdf', mimeType: 'application/pdf', parents: ['proprio0001x'], modifiedTime: '2026-03-01T00:00:00Z', md5Checksum: 'aa' },
];
const REF = { lu: '2026-10-19T14:00:53Z', elements: ref };
const humain = { emailAddress: 'collegue@sansvisavis.com' };
const ajout = (p: Partial<ElementReleve> = {}): ElementReleve => ({ id: 'ajout0001xx', name: 'devis.pdf', mimeType: 'application/pdf', parents: ['proprio0001x'],
  modifiedTime: '2026-10-19T14:30:00Z', createdTime: '2026-10-19T14:30:00Z', md5Checksum: 'bb', size: '10', lastModifyingUser: humain, ...p });

describe('le jugement des ajouts humains purs', () => {
  it('rien de changé → accepté, 0 ajout', () => {
    expect(jugerAjoutsHumains(REF, ref, SC)).toEqual({ ok: true, ajouts: [], nouveaux: [] });
  });
  it('un dossier et un fichier ajoutés par un collègue → acceptés (le fichier peut être dans le dossier neuf)', () => {
    const d = ajout({ id: 'ajoutDossier', name: 'Travaux', mimeType: DOSSIER, md5Checksum: undefined });
    const f = ajout({ parents: ['ajoutDossier'] });
    const r = jugerAjoutsHumains(REF, [...ref, d, f], SC);
    expect(r.ok && r.ajouts.map((x) => x.id)).toEqual(['ajoutDossier', 'ajout0001xx']);
  });
  it('arrêt : disparition, renommage, déplacement, modification, corbeille', () => {
    const motifs = (actuel: ElementReleve[]) => { const r = jugerAjoutsHumains(REF, actuel, SC); return r.ok ? [] : r.motifs.join(' | '); };
    expect(motifs(ref.slice(0, 2))).toMatch(/DISPARU/);
    expect(motifs([...ref.slice(0, 2), { ...ref[2], name: 'autre.pdf' }])).toMatch(/RENOMMÉ/);
    expect(motifs([...ref.slice(0, 2), { ...ref[2], parents: [SC] }])).toMatch(/DÉPLACÉ/);
    expect(motifs([...ref.slice(0, 2), { ...ref[2], md5Checksum: 'zz' }])).toMatch(/MODIFIÉ/);
    expect(motifs([...ref.slice(0, 2), { ...ref[2], modifiedTime: '2026-10-19T15:00:00Z' }])).toMatch(/MODIFIÉ/);
    expect(motifs([...ref.slice(0, 2), { ...ref[2], trashed: true }])).toMatch(/CORBEILLE/);
  });
  it('arrêt : étiquette svav_* (sur un ajout comme sur un ancien élément)', () => {
    expect(jugerAjoutsHumains(REF, [...ref, ajout({ appProperties: { svav_source_id: 'x' } })], SC)).toMatchObject({ ok: false });
    expect(jugerAjoutsHumains(REF, [ref[0], ref[1], { ...ref[2], appProperties: { svav_piece: '1' } }], SC)).toMatchObject({ ok: false });
  });
  it('arrêt : ajout par un compte de la liste noire, un compte de service, noreply, hors Workspace, sans auteur', () => {
    for (const emailAddress of ['a.jorel@sansvisavis.com', 'gestion@criterimmo.fr', 'svav-gestion-drive@api-project-1.iam.gserviceaccount.com',
      'noreply@sansvisavis.com', 'quelquun@gmail.com', undefined]) {
      expect(jugerAjoutsHumains(REF, [...ref, ajout({ lastModifyingUser: { emailAddress } })], SC).ok).toBe(false);
    }
    expect(motifAuteurRefuse('collegue@criterimmo.fr')).toBeNull();
  });
  it('arrêt : élément créé avant la référence (déplacé dedans), raccourci, parent inconnu', () => {
    expect(jugerAjoutsHumains(REF, [...ref, ajout({ createdTime: '2026-10-18T10:00:00Z' })], SC)).toMatchObject({ ok: false, motifs: [expect.stringMatching(/déplacé dans le dossier/)] });
    expect(jugerAjoutsHumains(REF, [...ref, ajout({ mimeType: 'application/vnd.google-apps.shortcut' })], SC).ok).toBe(false);
    expect(jugerAjoutsHumains(REF, [...ref, ajout({ parents: ['inconnu0000x'] })], SC).ok).toBe(false);
  });
  it('plafond : 20 ajouts NOUVEAUX par exécution ; ceux déjà acceptés ne comptent pas', () => {
    const vingtEtUn = Array.from({ length: 21 }, (_, i) => ajout({ id: `ajout${String(i).padStart(7, '0')}` }));
    expect(jugerAjoutsHumains(REF, [...ref, ...vingtEtUn], SC)).toMatchObject({ ok: false, motifs: [expect.stringMatching(/plafond \(20\)/)] });
    const r = jugerAjoutsHumains(REF, [...ref, ...vingtEtUn], SC, { dejaAcceptes: new Set([vingtEtUn[0].id]) });
    expect(r.ok && [r.ajouts.length, r.nouveaux.length]).toEqual([21, 20]);
  });
});
