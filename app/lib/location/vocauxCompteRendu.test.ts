import { describe, expect, it, vi } from 'vitest';
import { dureeFr, idsDeTrace, insererTranscription, MENTION_TRANSCRIT, nomVocal, refusVocal, traceVocaux, typeAudio } from './vocauxCompteRendu';
import { transcrireVocal, MODELE_TRANSCRIPTION } from './transcriptionVocal';

/** 🔴 Arno (13/11/2026, lot C) — les vocaux du compte rendu : formats (Safari iOS mp4/aac), 10 minutes, insertion au curseur, transcription Mistral. */
describe('les vocaux', () => {
  it('formats acceptés (Safari iOS : audio/mp4 ; Chrome : webm) ; tout autre fichier refusé ; 10 minutes au plus', () => {
    expect([typeAudio('audio/mp4'), typeAudio('audio/webm;codecs=opus'), typeAudio('audio/aac'), typeAudio('image/jpeg'), typeAudio(null)]).toEqual(['audio/mp4', 'audio/webm', 'audio/aac', null, null]);
    expect(nomVocal(0, 'audio/mp4')).toBe('Vocal-1.m4a');
    expect(refusVocal({ typeMime: 'application/pdf', taille: 10, dureeS: 3 })).toBe('Ce fichier n’est pas un enregistrement audio reconnu.');
    expect(refusVocal({ typeMime: 'audio/mp4', taille: 1000, dureeS: 11 * 60 })).toBe('Un vocal dure 10 minutes au plus.');
    expect(refusVocal({ typeMime: 'audio/mp4', taille: 0, dureeS: 3 })).toBe('L’enregistrement est vide.');
    expect(refusVocal({ typeMime: 'audio/mp4', taille: 4_000_000, dureeS: 600 })).toBeNull();
    expect([dureeFr(0), dureeFr(127.6), dureeFr(600)]).toEqual(['00:00', '02:07', '10:00']);
    expect(idsDeTrace(traceVocaux([12, 13]))).toEqual([12, 13]);
    expect(idsDeTrace('autre chose')).toEqual([]);
  });
  it('🔴 la transcription s’insère À L’ENDROIT DU CURSEUR, sur sa ligne, avec « (transcrit d’un vocal) » ; curseur absent : à la fin', () => {
    expect(insererTranscription('Début.\nFin.', 7, 'Parquet rayé')).toEqual({ texte: `Début.\nParquet rayé ${MENTION_TRANSCRIT}\nFin.`, curseur: 7 + `Parquet rayé ${MENTION_TRANSCRIT}\n`.length });
    expect(insererTranscription('Début.', null, 'Joint douche').texte).toBe(`Début.\nJoint douche ${MENTION_TRANSCRIT}`);
    expect(insererTranscription('', 0, 'Texte').texte).toBe(`Texte ${MENTION_TRANSCRIT}`);
    expect(insererTranscription('abc', 1, '   ').texte).toBe('abc');
  });
});

describe('🔴 la transcription par Mistral (fetch simulé : rien ne sort)', () => {
  const audio = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  it('réussie : le texte ; la requête porte le modèle de transcription, la langue, le fichier ; la clé en en-tête seulement', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => ({ ok: true, json: async () => ({ text: '  Le parquet de la chambre est rayé.  ' }) }) as unknown as Response);
    expect(await transcrireVocal(audio, 'audio/mp4', 'Vocal-1.m4a', { fetch: f as unknown as typeof fetch, cle: 'cle-de-test' })).toEqual({ ok: true, texte: 'Le parquet de la chambre est rayé.' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cle-de-test');
    const fd = init.body as FormData;
    expect([fd.get('model'), fd.get('language'), (fd.get('file') as File).name]).toEqual([MODELE_TRANSCRIPTION, 'fr', 'Vocal-1.m4a']);
  });
  it('🔴 ÉCHEC (refus HTTP, service injoignable, rien de reconnu, clé absente) : un motif clair, jamais d’exception — le vocal reste', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refuse = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response);
    expect(await transcrireVocal(audio, 'audio/mp4', 'v.m4a', { fetch: refuse as unknown as typeof fetch, cle: 'k' })).toEqual({ ok: false, motif: expect.stringContaining('le vocal reste joint') });
    const panne = vi.fn(async () => { throw new Error('réseau'); });
    expect(await transcrireVocal(audio, 'audio/mp4', 'v.m4a', { fetch: panne as unknown as typeof fetch, cle: 'k' })).toMatchObject({ ok: false });
    const vide = vi.fn(async () => ({ ok: true, json: async () => ({ text: ' ' }) }) as unknown as Response);
    expect(await transcrireVocal(audio, 'audio/mp4', 'v.m4a', { fetch: vide as unknown as typeof fetch, cle: 'k' })).toEqual({ ok: false, motif: expect.stringContaining('Aucune parole') });
    expect(await transcrireVocal(audio, 'audio/mp4', 'v.m4a', { fetch: refuse as unknown as typeof fetch, cle: '' })).toMatchObject({ ok: false, motif: expect.stringContaining('pas configuré') });
    expect(JSON.stringify(erreur.mock.calls)).not.toContain('k"');
    erreur.mockRestore();
  });
});
