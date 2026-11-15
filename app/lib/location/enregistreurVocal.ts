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

/* ══ 🔴 Arno (15/11/2026, 7e retour) — LE MICRO GARDÉ OUVERT TANT QUE LA PAGE EST VISIBLE ═════════════════════════════════════════════════
 * Le flux du micro est demandé au PREMIER appui, puis CONSERVÉ : les appuis suivants démarrent l'enregistrement aussitôt (plus d'attente du
 * micro, plus de syllabes perdues). Il est relâché dès que la page passe en arrière-plan (visibilitychange, pagehide) et rouvert au prochain
 * appui. Rien n'est enregistré ni transmis en dehors d'un appui : sans appui, aucun enregistreur ne tourne (le flux ouvert n'est lu par
 * personne ; pas de tampon permanent, qui reviendrait à enregistrer hors appui). */
let fluxPartage: MediaStream | null = null;
let ecouteInstallee = false;
/** le dernier enregistreur préparé : tant qu'il enregistre, le micro n'est jamais relâché par la lecture d'un vocal */
let dernierEnregistreur: { state?: string } | null = null;
const vivant = (f: MediaStream): boolean => {
  try { const pistes = f.getTracks(); return pistes.length > 0 && pistes.every((t) => (t as { readyState?: string }).readyState !== 'ended'); } catch { return false; }
};
/** Relâche le micro (arrière-plan, départ de la page). */
export function libererMicro(): void {
  const f = fluxPartage; fluxPartage = null;
  if (f) { try { f.getTracks().forEach((t) => t.stop()); } catch { /* rien */ } }
}
/**
 * 🔴 Arno (15/11/2026, 9e retour) — AVANT DE LIRE UN VOCAL : le micro gardé ouvert est relâché (sauf pendant un enregistrement). Sur
 * l'iPhone, un micro ouvert bascule le son dans l'écouteur du haut, à peine audible : « Écouter » semblait ne rien faire. Il est rouvert,
 * sans nouvelle autorisation, au prochain appui sur un micro.
 */
export function libererMicroSiLibre(): void {
  if (dernierEnregistreur !== null && dernierEnregistreur.state === 'recording') return;
  libererMicro();
}

/**
 * 🔴🔴 Arno (15/11/2026, 9e retour) — LE MÊME NIVEAU D'UNE PRISE À L'AUTRE : les MÊMES réglages du micro, posés explicitement, à chaque
 * ouverture (première prise, réouverture après l'arrière-plan ou une écoute). Le contrôle automatique du gain est COUPÉ (il faisait varier
 * le niveau d'une prise à l'autre) ; l'annulation d'écho et la réduction de bruit aussi (elles pompent le niveau et ne servent à rien pour
 * un dictaphone) ; une seule voie ; 48 kHz demandés (« ideal » : jamais un refus si l'appareil ne sait pas). Le niveau est ensuite
 * NORMALISÉ prise par prise (crête à −1 dBFS, `normalisationVocal.ts`).
 */
export const CONTRAINTES_MICRO: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, sampleRate: { ideal: 48_000 } },
};

function installerEcoute(): void {
  if (ecouteInstallee || typeof document === 'undefined') return;
  ecouteInstallee = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') libererMicro(); });
  window.addEventListener('pagehide', libererMicro);
}

/** Ouvre (ou reprend) le micro et prépare UN enregistreur pour cet appui ; un appareil incapable ou un refus : un motif clair, jamais une exception. */
export async function ouvrirEnregistreur(env: EnvVocal = envNavigateur()): Promise<OuvertureVocal> {
  if (!vocalDisponible(env)) return { ok: false, motif: MOTIF_VOCAL_INDISPONIBLE };
  installerEcoute();
  let flux = fluxPartage !== null && vivant(fluxPartage) ? fluxPartage : null;
  if (flux === null) {
    try { flux = await env.mediaDevices!.getUserMedia!(CONTRAINTES_MICRO); } catch { return { ok: false, motif: MOTIF_VOCAL_REFUS }; }
    fluxPartage = flux;
  }
  const voulu = typeEnregistrement(env.MediaRecorder);
  try {
    const r = new env.MediaRecorder!(flux, voulu ? { mimeType: voulu } : undefined);
    dernierEnregistreur = r;
    return { ok: true, r, flux, type: r.mimeType || voulu || 'audio/mp4' };
  } catch {
    libererMicro();
    return { ok: false, motif: MOTIF_VOCAL_INDISPONIBLE };
  }
}
