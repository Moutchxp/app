/**
 * 🔴 Arno (14/11/2026, iPhone) — L'ENREGISTREUR DE VOCAUX, CHARGÉ SEULEMENT AU TOUCHER de « Enregistrer un vocal » (import dynamique) : rien
 * de l'audio n'est lu à l'ouverture du formulaire. Avant d'ouvrir le micro, on VÉRIFIE que l'appareil sait faire (`getUserMedia`,
 * `MediaRecorder`) : sinon un message clair, jamais un plantage. Les objets du navigateur sont injectables (épreuves). ⚠️ AUCUN IMPORT SERVEUR.
 */

export interface EnvVocal {
  mediaDevices?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> } | undefined;
  MediaRecorder?: (new (s: MediaStream, o?: MediaRecorderOptions) => MediaRecorder) & { isTypeSupported?: (t: string) => boolean } | undefined;
  /** Le site est-il servi de façon sûre (https) ? Le micro l'exige. */
  securise?: boolean;
}

export const MOTIF_VOCAL_INDISPONIBLE = 'L’enregistrement de vocaux n’est pas disponible sur cet appareil ou ce navigateur (iPhone : iOS 14.3 au moins). Écrivez le compte rendu, ou ajoutez des photos.';
export const MOTIF_VOCAL_REFUS = 'Le micro est inaccessible : autorisez-le pour ce site (Réglages › Safari › Micro, ou Réglages › Chrome › Micro sur iPhone), puis réessayez.';

/** L'environnement réel du navigateur (lu au toucher, jamais au chargement). */
export function envNavigateur(): EnvVocal {
  const g = globalThis as { navigator?: Navigator; MediaRecorder?: EnvVocal['MediaRecorder']; isSecureContext?: boolean };
  return { mediaDevices: g.navigator?.mediaDevices, MediaRecorder: g.MediaRecorder, securise: g.isSecureContext !== false };
}

/** L'appareil sait-il enregistrer ? PUR. */
export function vocalDisponible(env: EnvVocal): boolean {
  return env.securise !== false && typeof env.mediaDevices?.getUserMedia === 'function' && typeof env.MediaRecorder === 'function';
}

/** Le type d'enregistrement que ce navigateur sait produire : Safari iOS → audio/mp4 (AAC) ; Chrome / Firefox → webm / ogg. PUR. */
export function typeEnregistrement(MR: EnvVocal['MediaRecorder']): string | undefined {
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => {
    try { return MR?.isTypeSupported?.(t) === true; } catch { return false; }
  });
}

export type OuvertureVocal = { ok: true; r: MediaRecorder; flux: MediaStream; type: string } | { ok: false; motif: string };

/** Ouvre le micro et prépare l'enregistreur ; un appareil incapable ou un refus : un motif clair, jamais une exception. */
export async function ouvrirEnregistreur(env: EnvVocal = envNavigateur()): Promise<OuvertureVocal> {
  if (!vocalDisponible(env)) return { ok: false, motif: MOTIF_VOCAL_INDISPONIBLE };
  let flux: MediaStream;
  try { flux = await env.mediaDevices!.getUserMedia!({ audio: true }); } catch { return { ok: false, motif: MOTIF_VOCAL_REFUS }; }
  const voulu = typeEnregistrement(env.MediaRecorder);
  try {
    const r = new env.MediaRecorder!(flux, voulu ? { mimeType: voulu } : undefined);
    return { ok: true, r, flux, type: r.mimeType || voulu || 'audio/mp4' };
  } catch {
    try { flux.getTracks().forEach((t) => t.stop()); } catch { /* rien */ }
    return { ok: false, motif: MOTIF_VOCAL_INDISPONIBLE };
  }
}
