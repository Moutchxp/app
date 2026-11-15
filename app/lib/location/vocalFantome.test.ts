import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (15/11/2026, 9e retour) — JAMAIS DE VOCAL FANTÔME, CÔTÉ SERVEUR : une prise n'est acceptée que si ses OCTETS sont un vrai son
 * (signature lue, données présentes), d'une durée non nulle, arrivés tels que le téléphone les a envoyés (empreinte SHA-256) ; à l'envoi,
 * aucun mail ne part avec une pièce audio vide ou illisible. Base et stockage simulés : rien n'est écrit.
 */
const inserts: unknown[][] = [];
let lignes: Record<string, unknown>[] = [];
vi.mock('../db/client', () => ({ query: vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/INSERT INTO gestion_location_sortie_piece/.test(sql)) { inserts.push(params); return { rows: [{ id: '901' }] }; }
  return { rows: lignes };
}) }));
vi.mock('../stockage', () => ({ deposerPieceSortie: vi.fn(async () => ({ depose: true, cle: 'k1', empreinte: 'e' })), recuperer: vi.fn() }));
vi.mock('./sortieLocatairesRepo', () => ({ lireBail: async () => ({ id: 11 }) }));
vi.mock('./piecesSortieRepo', () => ({ piecesSortieDisponibles: async () => true, MOTIF_SANS_468: 'sans 468' }));
vi.mock('./transcriptionVocal', () => ({ transcrireVocal: vi.fn() }));
import { refusContenuAudio } from './vocauxCompteRendu';
import { deposerVocal, prisesPourEnvoi } from './vocauxCompteRenduRepo';

const AUTEUR = { id: 1, libelle: 'Arno' };
/** un vrai M4A minimal : « ftyp » puis une boîte de données « mdat » */
const m4a = (): Buffer => { const b = Buffer.alloc(200); b.write('ftypM4A ', 4, 'latin1'); b.write('mdat', 40, 'latin1'); return b; };
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const deposer = (o: Buffer, extra: Partial<Parameters<typeof deposerVocal>[0]> = {}) =>
  deposerVocal({ occupationIds: [11], donnees: o.toString('base64'), typeMime: 'audio/mp4', dureeS: 2, dejaIds: [], ...extra }, AUTEUR);
beforeEach(() => { inserts.length = 0; lignes = []; });

describe('le contenu audio, lu dans les octets', () => {
  it('accepte MP4 avec données, WebM, Ogg, WAV, MP3 ; refuse le vide, le trop court, un MP4 sans données, un fichier qui n’est pas du son', () => {
    expect(refusContenuAudio(new Uint8Array(m4a()))).toBeNull();
    const webm = Buffer.alloc(100); webm.set([0x1a, 0x45, 0xdf, 0xa3]); expect(refusContenuAudio(new Uint8Array(webm))).toBeNull();
    const ogg = Buffer.alloc(100); ogg.write('OggS'); expect(refusContenuAudio(new Uint8Array(ogg))).toBeNull();
    const wav = Buffer.alloc(100); wav.write('RIFF'); wav.write('WAVE', 8); expect(refusContenuAudio(new Uint8Array(wav))).toBeNull();
    const mp3 = Buffer.alloc(100); mp3.write('ID3'); expect(refusContenuAudio(new Uint8Array(mp3))).toBeNull();
    expect(refusContenuAudio(new Uint8Array(0))).toBe('L’enregistrement est vide.');
    expect(refusContenuAudio(new Uint8Array([1, 2, 3]))).toBe('L’enregistrement est vide ou incomplet : réenregistrez la prise.');
    const sansDonnees = Buffer.alloc(200); sansDonnees.write('ftypM4A ', 4, 'latin1');
    expect(refusContenuAudio(new Uint8Array(sansDonnees))).toBe('L’enregistrement ne contient aucun son : réenregistrez la prise.');
    expect(refusContenuAudio(new Uint8Array(Buffer.alloc(200, 0x20)))).toBe('Ce fichier n’est pas un enregistrement audio lisible : réenregistrez la prise.');
  });
});

describe('le dépôt d’une prise', () => {
  it('une vraie prise, empreinte concordante : déposée, l’empreinte du serveur est rendue au téléphone', async () => {
    const o = m4a();
    const r = await deposer(o, { empreinte: sha(o) });
    expect(r).toEqual({ etat: 'ok', data: { id: 901, nom: 'Vocal-1.m4a', taille: 200, empreinte: sha(o) } });
    expect(inserts).toHaveLength(1);
  });
  it('🔴 refusée, RIEN n’est inscrit : vide, sans son, 0 seconde, empreinte qui ne concorde pas (arrivée incomplète)', async () => {
    expect(await deposer(Buffer.alloc(0))).toMatchObject({ etat: 'refus' });
    expect(await deposer(Buffer.from([1, 2, 3]))).toEqual({ etat: 'refus', motif: 'L’enregistrement est vide ou incomplet : réenregistrez la prise.' });
    const sansDonnees = Buffer.alloc(200); sansDonnees.write('ftypM4A ', 4, 'latin1');
    expect(await deposer(sansDonnees)).toEqual({ etat: 'refus', motif: 'L’enregistrement ne contient aucun son : réenregistrez la prise.' });
    expect(await deposer(m4a(), { dureeS: 0 })).toEqual({ etat: 'refus', motif: 'L’enregistrement dure 0 seconde : réenregistrez la prise.' });
    expect(await deposer(m4a(), { empreinte: sha(Buffer.from('autre chose')) })).toEqual({ etat: 'refus', motif: 'L’enregistrement est arrivé incomplet : il est renvoyé automatiquement.' });
    expect(inserts).toEqual([]);
  });
});

describe('à l’envoi', () => {
  it('🔴 une prise vide ou illisible sur le stockage : rien ne part, la prise est nommée', async () => {
    const vide = Buffer.from([1, 2, 3]);
    lignes = [{ id: '81', nom: 'Vocal-1.m4a', type_mime: 'audio/mp4', taille_octets: '3', cle_stockage: 'k81', empreinte_sha256: sha(vide) }];
    expect(await prisesPourEnvoi([81], [11], async () => vide)).toEqual({ ok: false, motif: '« Vocal-1.m4a » est vide ou illisible : supprimez la prise et réenregistrez-la. Rien n’est parti.' });
    const bon = m4a();
    lignes = [{ id: '81', nom: 'Vocal-1.m4a', type_mime: 'audio/mp4', taille_octets: '200', cle_stockage: 'k81', empreinte_sha256: sha(bon) }];
    expect(await prisesPourEnvoi([81], [11], async () => bon)).toMatchObject({ ok: true, prises: [{ id: 81, taille: 200 }] });
  });
});
