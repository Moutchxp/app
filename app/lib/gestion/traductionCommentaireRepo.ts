/**
 * ══ 🔴🔴 LOT GESTION-TRADUCTION (Arno, 10/11/2026) — TRADUIRE LES COMMENTAIRES MONGA, ET RANGER LA TRADUCTION À CÔTÉ ════════════════════
 *
 * IMPUR (base + service). Les règles, l'affichage et la détection de langue sont dans le module pur `traductionCommentaire.ts`.
 *
 *   · LE TEXTE D'ORIGINE N'EST JAMAIS TOUCHÉ : on n'écrit QUE dans `gestion_monga_traduction` (migration 463), jamais dans
 *     `gestion_monga_etape`. Aucune étape n'est créée, modifiée ni validée ici.
 *   · À L'ARRIVÉE : la relève traduit les commentaires du mail qu'elle vient d'enregistrer (`traduireCommentairesDuMail`), et retente
 *     plus tard ceux dont la traduction a échoué (`retenterTraductionsEchouees`). Les commentaires DÉJÀ enregistrés avant ce lot ne sont
 *     traduits QUE par le script `gestion:monga-commentaires:traduire --appliquer`, lancé à la main par Arno.
 *   · JAMAIS DE BLOCAGE DE LA RELÈVE : chaque fonction appelée par la relève attrape tout ; le service a un délai borné.
 *   · SERVICE : Mistral AI (`api.mistral.ai`, hébergé dans l'Union européenne), déjà configuré pour les permis (`MISTRAL_API_KEY`). Ne
 *     part QUE le texte du commentaire : ni objet, ni nom, ni adresse, ni référence.
 */
import { query } from '../db/client';
import { traductionDisponible } from './schema';
import { CONSIGNE_TRADUCTION, detecterLangue, estATraduire, validerReponseTraduction } from './traductionCommentaire';

/** Un service de traduction. INJECTABLE : les tests le bouchonnent, aucun appel réseau n'en sort. */
export interface Traducteur {
  /** Ce qui est écrit dans la colonne `service` (ex. « mistral:mistral-small-latest »). */
  service: string;
  traduire(texte: string): Promise<{ langue: string; traduction: string | null }>;
}

/** Une nouvelle tentative après un échec, au plus tôt ce délai plus tard ; et au plus ce nombre de tentatives en tout. */
export const DELAI_NOUVELLE_TENTATIVE_MIN = 60;
export const TENTATIVES_MAX = 10;
/** Au plus ce nombre de reprises par passe de relève, pour qu'un service en panne ne la ralentisse pas. */
export const REPRISES_PAR_PASSE = 5;

export type IssueTraduction = 'traduite' | 'francais' | 'echec' | 'ignore';

type Requete = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;

/**
 * Traduit UN commentaire et range le résultat à côté de lui. NE JETTE JAMAIS : un échec du service s'écrit « echec » (l'écran dira
 * « Traduction indisponible »), et une nouvelle tentative aura lieu plus tard.
 *
 * 🔴 `ignore` : le texte est reconnu français, ou sa langue est inconnue (trop court) — RIEN n'est envoyé, RIEN n'est écrit.
 * ⚠️ Une traduction RÉUSSIE n'est jamais écrasée par un échec ultérieur : la mise à jour ne vise qu'une ligne restée « echec ».
 */
export async function traduireUnCommentaire(
  etapeId: number, texte: string | null, traducteur: Traducteur, q: Requete = query as unknown as Requete,
): Promise<IssueTraduction> {
  if (texte === null || !estATraduire(texte)) return 'ignore';
  try {
    const r = await traducteur.traduire(texte);
    const statut = r.langue === 'fr' || r.traduction === null ? 'francais' : 'traduite';
    await q(
      `INSERT INTO gestion_monga_traduction (etape_id, statut, langue, texte_traduit, service, traduit_le, erreur)
       VALUES ($1, $2, $3, $4, $5, now(), NULL)
       ON CONFLICT (etape_id) DO UPDATE
          SET statut = EXCLUDED.statut, langue = EXCLUDED.langue, texte_traduit = EXCLUDED.texte_traduit, service = EXCLUDED.service,
              traduit_le = EXCLUDED.traduit_le, erreur = NULL, tentatives = gestion_monga_traduction.tentatives + 1,
              derniere_tentative_le = now()
        WHERE gestion_monga_traduction.statut = 'echec'`,
      [etapeId, statut, r.langue, statut === 'traduite' ? r.traduction : null, traducteur.service]);
    return statut;
  } catch (e) {
    /* ⚠️ LE MOTIF SEUL (« fournisseur HTTP 503 », « délai dépassé »…) : jamais le texte du commentaire. */
    const motif = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    try {
      await q(
        `INSERT INTO gestion_monga_traduction (etape_id, statut, service, erreur)
         VALUES ($1, 'echec', $2, $3)
         ON CONFLICT (etape_id) DO UPDATE
            SET erreur = EXCLUDED.erreur, service = EXCLUDED.service, tentatives = gestion_monga_traduction.tentatives + 1,
                derniere_tentative_le = now()
          WHERE gestion_monga_traduction.statut = 'echec'`,
        [etapeId, traducteur.service, motif]);
    } catch { /* la trace de l'échec attendra : l'original reste affiché, et rien d'autre n'en dépend */ }
    return 'echec';
  }
}

/**
 * 🔴 À L'ARRIVÉE — les commentaires que la relève vient d'enregistrer pour CE mail, et qui n'ont encore aucune traduction. Sans la 463 :
 * rien. NE JETTE JAMAIS. Rend le nombre de commentaires traduits.
 */
export async function traduireCommentairesDuMail(messageId: number, traducteur: Traducteur): Promise<number> {
  try {
    if (!await traductionDisponible()) return 0;
    const { rows } = await query<{ id: string; texte: string | null }>(
      `SELECT e.id::text AS id, e.texte FROM gestion_monga_etape e
        WHERE e.message_id = $1 AND e.source = 'monga' AND e.type = 'commentaire'
          AND NOT EXISTS (SELECT 1 FROM gestion_monga_traduction t WHERE t.etape_id = e.id)`, [messageId]);
    let traduits = 0;
    for (const r of rows) if (await traduireUnCommentaire(Number(r.id), r.texte, traducteur) === 'traduite') traduits += 1;
    return traduits;
  } catch {
    return 0;
  }
}

/**
 * 🔴 « UNE NOUVELLE TENTATIVE A LIEU PLUS TARD » (Arno) — appelée à chaque passe de relève. Ne reprend QUE les lignes « echec » (donc
 * jamais un commentaire ancien qu'aucune traduction n'a encore visé), au plus tôt une heure après la précédente, et au plus
 * `TENTATIVES_MAX` fois. NE JETTE JAMAIS.
 */
export async function retenterTraductionsEchouees(traducteur: Traducteur, limite = REPRISES_PAR_PASSE): Promise<number> {
  try {
    if (!await traductionDisponible()) return 0;
    const { rows } = await query<{ id: string; texte: string | null }>(
      `SELECT e.id::text AS id, e.texte
         FROM gestion_monga_traduction t JOIN gestion_monga_etape e ON e.id = t.etape_id
        WHERE t.statut = 'echec' AND t.tentatives < $1
          AND t.derniere_tentative_le < now() - make_interval(mins => $2)
        ORDER BY t.derniere_tentative_le LIMIT $3`, [TENTATIVES_MAX, DELAI_NOUVELLE_TENTATIVE_MIN, limite]);
    let traduits = 0;
    for (const r of rows) if (await traduireUnCommentaire(Number(r.id), r.texte, traducteur) === 'traduite') traduits += 1;
    return traduits;
  } catch {
    return 0;
  }
}

/** Pour le script de reprise : les commentaires Monga qui n'ont encore aucune traduction (LECTURE SEULE). */
export async function commentairesSansTraduction(q: Requete = query as unknown as Requete): Promise<{
  id: number; reference: string | null; survenuLe: string; texte: string | null;
}[]> {
  const { rows } = await q(
    `SELECT e.id::text AS id, e.reference, to_char(e.survenu_le AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') AS survenu, e.texte
       FROM gestion_monga_etape e
      WHERE e.source = 'monga' AND e.type = 'commentaire' AND e.texte IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_monga_traduction t WHERE t.etape_id = e.id)
      ORDER BY e.survenu_le, e.id`);
  return (rows as { id: string; reference: string | null; survenu: string; texte: string | null }[])
    .map((r) => ({ id: Number(r.id), reference: r.reference, survenuLe: r.survenu, texte: r.texte }));
}

// ── Le service RÉEL (Mistral AI, Union européenne) — hors des tests. ─────────────────────────────────────────────────────────────────
export const MODELE_TRADUCTION = 'mistral-small-latest';
/** Au-delà, l'appel est abandonné (échec, nouvelle tentative plus tard) : la relève n'attend jamais plus longtemps. */
export const DELAI_SERVICE_MS = 15_000;

export function traducteurMistral(): Traducteur {
  return {
    service: `mistral:${MODELE_TRADUCTION}`,
    async traduire(texte) {
      const cle = process.env.MISTRAL_API_KEY;
      if (!cle) throw new Error('MISTRAL_API_KEY absente');
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(DELAI_SERVICE_MS),
        body: JSON.stringify({
          model: MODELE_TRADUCTION, temperature: 0, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: CONSIGNE_TRADUCTION }, { role: 'user', content: texte }],
        }),
      });
      if (!res.ok) throw new Error(`fournisseur HTTP ${res.status}`);
      const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      let json: unknown = null;
      try { json = JSON.parse(d.choices?.[0]?.message?.content ?? ''); } catch { json = null; }
      const v = validerReponseTraduction(json);
      if (v === null) throw new Error('réponse du service illisible');
      return v;
    },
  };
}

/**
 * ══ 🔴 LA REPRISE DES COMMENTAIRES DÉJÀ ENREGISTRÉS (script `gestion:monga-commentaires:traduire`, lancé à la main par Arno) ══════════
 *
 * `appliquer` faux (ESSAI) : liste ce qui SERAIT traduit — langue probable, date, référence, début du texte — sans appeler le service
 * et sans rien écrire (le script ouvre en plus sa session en lecture seule). `appliquer` vrai : traduit chacun, l'un après l'autre ;
 * un échec s'écrit « echec » et sera retenté par la relève.
 */
export async function repriseDesCommentaires(o: {
  appliquer: boolean; q: Requete; traducteur: Traducteur | null; dire: (ligne: string) => void;
}): Promise<{ candidats: number; ignores: number; traduits: number; francais: number; echecs: number }> {
  const tous = await commentairesSansTraduction(o.q);
  const candidats = tous.filter((c) => estATraduire(c.texte));
  const bilan = { candidats: candidats.length, ignores: tous.length - candidats.length, traduits: 0, francais: 0, echecs: 0 };
  o.dire(`${tous.length} commentaire(s) Monga sans traduction ; ${candidats.length} à traduire (langue autre que le français), `
    + `${bilan.ignores} laissé(s) tel(s) quel(s) (français, ou langue inconnue).`);
  for (const c of candidats) {
    const debut = (c.texte ?? '').replace(/\s+/g, ' ').slice(0, 110);
    if (!o.appliquer || o.traducteur === null) {
      o.dire(`  À TRADUIRE  étape ${c.id} · ${c.survenuLe} · ${c.reference ?? '—'} · langue probable : ${detecterLangue(c.texte)} · « ${debut} »`);
      continue;
    }
    const issue = await traduireUnCommentaire(c.id, c.texte, o.traducteur, o.q);
    if (issue === 'traduite') bilan.traduits += 1;
    else if (issue === 'francais') bilan.francais += 1;
    else if (issue === 'echec') bilan.echecs += 1;
    o.dire(`  ${issue.toUpperCase().padEnd(10)} étape ${c.id} · ${c.survenuLe} · ${c.reference ?? '—'}`);
  }
  return bilan;
}
