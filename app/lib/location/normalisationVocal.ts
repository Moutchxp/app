/**
 * ══ 🔴🔴 Arno (15/11/2026, 9e retour du test iPhone) — LE MÊME NIVEAU SONORE D'UNE PRISE À L'AUTRE ══════════════════════════════════════
 * Chaque prise est NORMALISÉE dans le téléphone, avant d'être déposée : sa crête est amenée à −1 dBFS (cible commune à toutes les prises).
 *  · le son est décodé, ramené à UNE voie à 16 kHz (la parole y est entière ; le fichier reste léger : environ 1,9 Mo par minute), puis
 *    multiplié par le gain qui porte sa crête à −1 dBFS, et rangé en WAV 16 bits (lu partout : iPhone, Android, ordinateur, transcription) ;
 *  · le gain est plafonné (×20, +26 dB) : une prise presque muette n'est pas transformée en souffle ; une prise SILENCIEUSE n'est pas touchée ;
 *  · si l'appareil ne sait pas décoder, ou si le résultat dépasserait la taille permise, la prise est gardée TELLE QUELLE (jamais perdue) ;
 *  · les prises déjà enregistrées ne sont pas modifiées.
 * Les réglages du micro, identiques à chaque prise, sont dans `enregistreurVocal.ts` (`CONTRAINTES_MICRO`). ⚠️ AUCUN IMPORT SERVEUR.
 */
export const CIBLE_CRETE_DBFS = -1;
export const GAIN_MAX = 20;
export const FREQUENCE_NORMALISEE = 16_000;
/** en dessous : une prise silencieuse, laissée telle quelle */
export const CRETE_SILENCE = 1e-4;
export const NORMALISATION_MAX_OCTETS = 15 * 1024 * 1024;

/** La crête (valeur absolue maximale) d'un signal. PUR. */
export function crete(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; }
  return m;
}
/** Le gain qui amène cette crête à la cible (plafonné) ; une prise silencieuse : 1 (rien ne change). PUR. */
export function gainPourCrete(c: number, cibleDbfs = CIBLE_CRETE_DBFS, max = GAIN_MAX): number {
  if (!(c > CRETE_SILENCE)) return 1;
  return Math.min(10 ** (cibleDbfs / 20) / c, max);
}
/** Un WAV PCM 16 bits mono. PUR. */
export function encoderWav(x: Float32Array, frequence: number): Uint8Array<ArrayBuffer> {
  const octets = new Uint8Array(new ArrayBuffer(44 + x.length * 2));
  const v = new DataView(octets.buffer);
  const ecrire = (i: number, t: string) => { for (let k = 0; k < t.length; k++) octets[i + k] = t.charCodeAt(k); };
  ecrire(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); ecrire(8, 'WAVE');
  ecrire(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, frequence, true); v.setUint32(28, frequence * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ecrire(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true); }
  return octets;
}
/** Applique le gain (sur place) et rend le signal. PUR. */
export function appliquerGain(x: Float32Array, g: number): Float32Array {
  if (g !== 1) for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i] * g));
  return x;
}

export interface PriseNormalisee { blob: Blob; type: 'audio/wav'; gain: number; creteAvant: number }
type ContexteHorsLigne = new (voies: number, longueur: number, frequence: number) => OfflineAudioContext;

/**
 * NORMALISE une prise (navigateur) : null si l'appareil ne sait pas (la prise est alors gardée telle quelle). Jamais d'exception.
 * `Ctx` injectable (épreuves).
 */
export async function normaliserPrise(blob: Blob, Ctx?: ContexteHorsLigne): Promise<PriseNormalisee | null> {
  try {
    const C = Ctx ?? (globalThis as { OfflineAudioContext?: ContexteHorsLigne; webkitOfflineAudioContext?: ContexteHorsLigne }).OfflineAudioContext
      ?? (globalThis as { webkitOfflineAudioContext?: ContexteHorsLigne }).webkitOfflineAudioContext;
    if (!C) return null;
    const brut = await blob.arrayBuffer();
    const decode = await new Promise<AudioBuffer>((ok, ko) => {
      const p = new C(1, 1, 44_100).decodeAudioData(brut, ok, ko);
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(ok, ko);
    });
    if (!(decode.duration > 0)) return null;
    const longueur = Math.max(1, Math.ceil(decode.duration * FREQUENCE_NORMALISEE));
    if (44 + longueur * 2 > NORMALISATION_MAX_OCTETS) return null;
    const rendu = new C(1, longueur, FREQUENCE_NORMALISEE);
    const source = rendu.createBufferSource();
    source.buffer = decode; source.connect(rendu.destination); source.start(0);
    const sortie = await rendu.startRendering();
    const x = new Float32Array(sortie.getChannelData(0));
    const c = crete(x);
    if (!(c > CRETE_SILENCE)) return null;
    const g = gainPourCrete(c);
    return { blob: new Blob([encoderWav(appliquerGain(x, g), FREQUENCE_NORMALISEE)], { type: 'audio/wav' }), type: 'audio/wav', gain: g, creteAvant: c };
  } catch { return null; }
}
