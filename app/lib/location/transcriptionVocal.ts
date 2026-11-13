import 'server-only';

/**
 * 🔴 Arno (13/11/2026, lot C) — LA TRANSCRIPTION D'UN VOCAL PAR MISTRAL (hébergé dans l'Union européenne ; `MISTRAL_API_KEY` déjà configurée,
 * jamais affichée ni journalisée). Modèle de transcription audio de Mistral (Voxtral). Un échec ne perd rien : le vocal reste joint, l'écran le dit.
 */
export const MODELE_TRANSCRIPTION = 'voxtral-mini-latest';
const URL_TRANSCRIPTION = 'https://api.mistral.ai/v1/audio/transcriptions';
const DELAI_MS = 120_000;
export const MOTIF_ECHEC_TRANSCRIPTION = 'La transcription a échoué : le vocal reste joint au compte rendu (réécoutez-le, réessayez, ou tapez le texte).';

export type IssueTranscription = { ok: true; texte: string } | { ok: false; motif: string };

export async function transcrireVocal(octets: Uint8Array, typeMime: string, nom: string,
  deps: { fetch?: typeof fetch; cle?: string | undefined } = {}): Promise<IssueTranscription> {
  const cle = (deps.cle ?? process.env.MISTRAL_API_KEY ?? '').trim();
  if (cle === '') return { ok: false, motif: 'Transcription indisponible : le service Mistral n’est pas configuré. Le vocal reste joint.' };
  const corps = new FormData();
  corps.append('model', MODELE_TRANSCRIPTION);
  corps.append('language', 'fr');
  corps.append('file', new Blob([new Uint8Array(octets)], { type: typeMime }), nom);
  const minuterie = new AbortController();
  const t = setTimeout(() => minuterie.abort(), DELAI_MS);
  try {
    const r = await (deps.fetch ?? fetch)(URL_TRANSCRIPTION, { method: 'POST', headers: { Authorization: `Bearer ${cle}` }, body: corps, signal: minuterie.signal });
    if (!r.ok) { console.error('[location] transcription Mistral refusée', r.status); return { ok: false, motif: MOTIF_ECHEC_TRANSCRIPTION }; }
    const j = await r.json().catch(() => null) as { text?: unknown } | null;
    const texte = typeof j?.text === 'string' ? j.text.trim() : '';
    if (texte === '') return { ok: false, motif: 'Aucune parole reconnue dans ce vocal : il reste joint, tapez le texte si besoin.' };
    return { ok: true, texte };
  } catch (e) {
    console.error('[location] transcription Mistral injoignable', (e as Error)?.name);
    return { ok: false, motif: MOTIF_ECHEC_TRANSCRIPTION };
  } finally { clearTimeout(t); }
}
