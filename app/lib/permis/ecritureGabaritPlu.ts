/**
 * N10-I/N10-M — DÉPÔT du GABARIT PLU et du PLATEAU DE NIVELLEMENT lus par position (niveau CORPS). IMPUR (S3 + base).
 * Consomme les décisions PURES (`decisionGabaritPlu`) et les applique. Journalise en `methode='plan'` (migration 133).
 *
 * 🔒 DOCTRINE :
 * - N10-M — CONTRÔLE DE RÈGLE : si gabarit − plateau est CONSTANT (≤0,05 m) sur ≥3 planches au fit fiable → RÈGLE VÉRIFIÉE. On écrit
 *   alors hauteur_max_plu_ngf = plateau LE PLUS BAS + plafond (le constant, établi par la mesure), et altitude_plateau_nivellement_ngf
 *   = le plateau le plus bas. Les 3 valeurs de gabarit ne sont PAS des candidates rivales : l'écran énonce la règle, pas une divergence.
 * - Règle NON vérifiée (écarts non constants) → comportement N10-I inchangé : candidates + boutons + avertissement, rien d'écrit
 *   (sauf concordance stricte des gabarits). Les boutons écrivent toujours en base (N10-L).
 * - Invariant 103 réutilisé via ecrireCorps : une saisie n'est JAMAIS réécrasée. Multi-corps → on PROPOSE (pas de répartition au jugé).
 * - RECOMPUTE IDEMPOTENT : purge CIBLÉE (methode='plan', champs gabarit + plateau) avant de réécrire.
 */
import { query } from '../db/client';
import { ecrireCorps } from './caracteristiquesRepo';
import {
  decisionGabaritPlanche, agregerGabarit, controlerRegleGabarit, enonceRegle,
  RESERVE_DIVERGENCE, RESERVE_MULTI_CORPS,
  type ItemTexte, type GabaritRetenu, type CandidatGabarit, type LecturePlanche,
} from './decisionGabaritPlu';

const CHAMP_GABARIT = 'hauteur_max_plu_ngf';
const CHAMP_PLATEAU = 'altitude_plateau_nivellement_ngf';

/** Items positionnés de CHAQUE page d'un PDF (pdfjs, import DYNAMIQUE : hors graphe statique). x,y = transform[4],[5] ; fs = police. */
export async function itemsParPage(buf: Buffer): Promise<ItemTexte[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: ItemTexte[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push((tc.items as { str?: string; transform?: number[] }[])
      .filter((it) => (it.str ?? '').trim() !== '')
      .map((it) => ({ str: (it.str ?? '').trim(), x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0, fs: Math.hypot(it.transform?.[2] ?? 0, it.transform?.[3] ?? 0) })));
  }
  await doc.destroy();
  return pages;
}

/** I/O injectables (mêmes deps que la lecture GED) — testable sans S3. */
export interface DepsGabarit {
  listerPieces(dossierId: number): Promise<{ nomFichier: string; typeMime: string | null; cleStockage: string }[]>;
  lireObjet(cle: string): Promise<Buffer>;
  lireItems?(buf: Buffer): Promise<ItemTexte[][]>; // défaut : itemsParPage (pdfjs)
}

/** Ce qu'une planche donne pour les DEUX libellés (retenue pure ou null). */
export interface LectureBrute { planche: string; page: number; gabarit: GabaritRetenu | null; plateau: GabaritRetenu | null }

/** Balaye toutes les planches PDF du permis, rend par planche la lecture du gabarit ET du plateau. */
export async function extrairePlanchesDossier(dossierId: number, deps: DepsGabarit): Promise<LectureBrute[]> {
  const lireItems = deps.lireItems ?? itemsParPage;
  const out: LectureBrute[] = [];
  for (const m of await deps.listerPieces(dossierId)) {
    if (m.typeMime !== 'application/pdf') continue;
    let buf: Buffer; try { buf = await deps.lireObjet(m.cleStockage); } catch { continue; }
    let pages: ItemTexte[][]; try { pages = await lireItems(buf); } catch { continue; }
    pages.forEach((items, i) => {
      const g = decisionGabaritPlanche(items, 'gabarit');
      const p = decisionGabaritPlanche(items, 'plateau');
      if (g.statut !== 'retenue' && p.statut !== 'retenue') return;
      out.push({ planche: m.nomFichier, page: i + 1, gabarit: g.statut === 'retenue' ? g : null, plateau: p.statut === 'retenue' ? p : null });
    });
  }
  return out;
}

const lectures = (b: readonly LectureBrute[]): LecturePlanche[] =>
  b.map((x) => ({ planche: x.planche, page: x.page, gabarit: x.gabarit?.valeurNgf ?? null, plateau: x.plateau?.valeurNgf ?? null, fitOk: x.gabarit?.fitOk ?? x.plateau?.fitOk ?? false }));
const candidatsGabarit = (b: readonly LectureBrute[]): CandidatGabarit[] =>
  b.filter((x) => x.gabarit).map((x) => ({ valeurNgf: x.gabarit!.valeurNgf, planche: x.planche, page: x.page, ecartM: x.gabarit!.ecartM, confiance: x.gabarit!.confiance }));

export interface ResultatGabarit {
  statut: 'regle_verifiee' | 'divergente' | 'concordante' | 'aucune';
  plafond?: number; plateauMin?: number; hauteurDefaut?: number; gabaritMin?: number; gabaritMax?: number; plateauMax?: number;
  ecritGabarit: boolean; ecritPlateau: boolean; nbCorps: number; nbPlanches: number; exclues: { planche: string; page: number }[];
}

const conf = (cs: { confiance: 'confirmee' | 'a_verifier' }[]): 'confirmee' | 'a_verifier' =>
  cs.length > 0 && cs.every((c) => c.confiance === 'confirmee') ? 'confirmee' : 'a_verifier';

async function journaliser(dossierId: number, corpsId: number | null, champ: string, role: 'retenue' | 'ecartee', valeur: number | null, confiance: 'confirmee' | 'a_verifier' | null, reserve: string | null, motif: string | null, piece: string | null, page: number | null, extrait: string): Promise<void> {
  await query(
    `INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
     VALUES ($1, $2, $3, $4, 'm', $5, 'plan', $6, $7, $8, $9, $10, $11, now())`,
    [dossierId, corpsId, champ, valeur, role, confiance, reserve, motif, piece, page, extrait],
  );
}

/** Applique le gabarit + le plateau (niveau corps). `majPar` = auteur automatique. */
export async function ecrireGabaritPlu(dossierId: number, brutes: readonly LectureBrute[], majPar: string): Promise<ResultatGabarit> {
  const { rows } = await query<{ id: number }>(`SELECT id::int AS id FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY id`, [dossierId]);
  const corps = rows.map((r) => r.id);
  const cibles: (number | null)[] = corps.length > 0 ? corps : [null];
  const cands = candidatsGabarit(brutes);
  const controle = controlerRegleGabarit(lectures(brutes));

  // Purge idempotente CIBLÉE (jamais les autres méthodes/champs, jamais la saisie).
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'plan' AND champ = ANY($2::text[])`, [dossierId, [CHAMP_GABARIT, CHAMP_PLATEAU]]);

  if (cands.length === 0) return { statut: 'aucune', ecritGabarit: false, ecritPlateau: false, nbCorps: corps.length, nbPlanches: brutes.length, exclues: [] };

  const multiCorps = corps.length !== 1;

  // ── N10-M — RÈGLE VÉRIFIÉE : l'écran énonce la règle, on écrit plateau le plus bas + plafond ────────────────────────────────
  if (controle.statut === 'verifiee') {
    const { plafond, plateauMin, plateauMax, gabaritMin, gabaritMax } = controle;
    const hauteurDefaut = plateauMin + plafond;
    const reserveRegle = [enonceRegle(controle), multiCorps ? RESERVE_MULTI_CORPS : null].filter(Boolean).join(' ; ');
    const reservePlateau = [plateauMax > plateauMin ? `plusieurs plateaux de nivellement : ${plateauMin} à ${plateauMax} NGF` : null, multiCorps ? RESERVE_MULTI_CORPS : null].filter(Boolean).join(' ; ') || null;

    for (const cible of cibles) {
      // candidates de gabarit (pour les boutons) — réserve = l'ÉNONCÉ DE LA RÈGLE (pas « divergentes »).
      for (const c of cands) await journaliser(dossierId, cible, CHAMP_GABARIT, 'ecartee', c.valeurNgf, c.confiance, reserveRegle, null, c.planche, c.page, `${c.valeurNgf.toFixed(2)} (NGF) — ${c.planche}`);
      // planches EXCLUES du contrôle (fit hors seuil) — journalisées « non concluante », jamais masquées.
      for (const e of controle.exclues) await journaliser(dossierId, cible, CHAMP_GABARIT, 'ecartee', null, null, null, e.motif, e.planche, e.page, `${e.planche} — ${e.motif}`);
    }

    let ecritGabarit = false, ecritPlateau = false;
    if (!multiCorps) {
      const r = await ecrireCorps(corps[0], { hauteurMaxPluNgf: hauteurDefaut, altitudePlateauNivellementNgf: plateauMin }, 'extraite', majPar);
      ecritGabarit = r.ecrits.includes('hauteurMaxPluNgf');
      ecritPlateau = r.ecrits.includes('altitudePlateauNivellementNgf');
      if (ecritGabarit) await journaliser(dossierId, corps[0], CHAMP_GABARIT, 'retenue', hauteurDefaut, conf(cands), reserveRegle, null, null, null, `${hauteurDefaut.toFixed(2)} (NGF) — plateau le plus bas ${plateauMin} + plafond ${plafond}`);
      if (ecritPlateau) await journaliser(dossierId, corps[0], CHAMP_PLATEAU, 'retenue', plateauMin, conf(cands), reservePlateau, null, null, null, `${plateauMin.toFixed(2)} (NGF) — plateau le plus bas`);
    }
    return { statut: 'regle_verifiee', plafond, plateauMin, plateauMax, gabaritMin, gabaritMax, hauteurDefaut, ecritGabarit, ecritPlateau, nbCorps: corps.length, nbPlanches: brutes.length, exclues: controle.exclues.map((e) => ({ planche: e.planche, page: e.page })) };
  }

  // ── Règle NON vérifiée : comportement N10-I (candidates + concordance/divergence) ─────────────────────────────────────────────
  const agg = agregerGabarit(cands);
  const divergent = agg.statut === 'divergente';
  const reserve = [divergent ? RESERVE_DIVERGENCE : null, multiCorps ? RESERVE_MULTI_CORPS : null].filter(Boolean).join(' ; ') || null;
  for (const cible of cibles) for (const c of cands) {
    const extrait = `${c.valeurNgf.toFixed(2)} (NGF) — ${c.planche}${c.ecartM !== null ? ` (écart ${c.ecartM.toFixed(2)} m)` : ' (écart non convertible)'}`;
    await journaliser(dossierId, cible, CHAMP_GABARIT, 'ecartee', c.valeurNgf, c.confiance, reserve, null, c.planche, c.page, extrait);
  }
  let ecritGabarit = false;
  if (agg.statut === 'concordante' && !multiCorps) {
    const r = await ecrireCorps(corps[0], { hauteurMaxPluNgf: agg.valeur }, 'extraite', majPar);
    ecritGabarit = r.ecrits.includes('hauteurMaxPluNgf');
    if (ecritGabarit) await journaliser(dossierId, corps[0], CHAMP_GABARIT, 'retenue', agg.valeur, conf(cands), null, null, null, null, `${agg.valeur.toFixed(2)} (NGF) — concordant sur ${cands.length} planche(s)`);
  }
  return { statut: agg.statut === 'concordante' ? 'concordante' : 'divergente', ecritGabarit, ecritPlateau: false, nbCorps: corps.length, nbPlanches: brutes.length, exclues: [] };
}
