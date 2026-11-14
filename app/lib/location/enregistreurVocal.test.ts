import { describe, expect, it } from 'vitest';
import { MOTIF_VOCAL_INDISPONIBLE, MOTIF_VOCAL_REFUS, ouvrirEnregistreur, typeEnregistrement, vocalDisponible, type EnvVocal } from './enregistreurVocal';

/** 🔴 Arno (14/11/2026, iPhone) — l'enregistreur vérifie l'appareil avant d'ouvrir le micro : un message clair, jamais un plantage. */
class FauxMR {
  static isTypeSupported = (t: string) => t === 'audio/mp4';
  mimeType: string;
  constructor(_s: MediaStream, o?: MediaRecorderOptions) { this.mimeType = o?.mimeType ?? ''; }
}
const flux = { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream;
const env = (o: Partial<EnvVocal> = {}): EnvVocal => ({ mediaDevices: { getUserMedia: async () => flux }, MediaRecorder: FauxMR as unknown as EnvVocal['MediaRecorder'], securise: true, ...o });

describe('enregistreurVocal', () => {
  it('appareil capable : le micro s’ouvre, type mp4 sur Safari iOS', async () => {
    const o = await ouvrirEnregistreur(env());
    expect(o.ok).toBe(true);
    expect(o.ok && o.type).toBe('audio/mp4');
  });
  it.each([
    ['sans MediaRecorder (iOS < 14.3)', { MediaRecorder: undefined }],
    ['sans getUserMedia', { mediaDevices: undefined }],
    ['site non sûr (http)', { securise: false }],
  ])('%s : indisponible, message clair', async (_n, o) => {
    expect(vocalDisponible(env(o))).toBe(false);
    expect(await ouvrirEnregistreur(env(o))).toEqual({ ok: false, motif: MOTIF_VOCAL_INDISPONIBLE });
  });
  it('micro refusé : message clair', async () => {
    expect(await ouvrirEnregistreur(env({ mediaDevices: { getUserMedia: async () => { throw new Error('NotAllowedError'); } } }))).toEqual({ ok: false, motif: MOTIF_VOCAL_REFUS });
  });
  it('l’enregistreur refuse de se créer : indisponible, le micro est relâché', async () => {
    let arrete = 0;
    const f = { getTracks: () => [{ stop: () => { arrete += 1; } }] } as unknown as MediaStream;
    const Casse = class { static isTypeSupported = () => false; constructor() { throw new Error('NotSupportedError'); } };
    const o = await ouvrirEnregistreur(env({ mediaDevices: { getUserMedia: async () => f }, MediaRecorder: Casse as unknown as EnvVocal['MediaRecorder'] }));
    expect(o).toEqual({ ok: false, motif: MOTIF_VOCAL_INDISPONIBLE });
    expect(arrete).toBe(1);
  });
  it('isTypeSupported qui lève : aucun type imposé', () => {
    expect(typeEnregistrement(class { static isTypeSupported = () => { throw new Error('x'); }; } as unknown as EnvVocal['MediaRecorder'])).toBeUndefined();
  });
});
