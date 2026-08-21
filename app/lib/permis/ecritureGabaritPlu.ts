/**
 * N10-I — DÉPÔT de la HAUTEUR MAXIMALE PLU lue par position (niveau CORPS, colonne hauteur_max_plu_ngf de la migration 131).
 * IMPUR (S3 + base). Consomme la décision PURE (`decisionGabaritPlu`) et l'applique. Journalise en `methode='plan'` (migration 133).
 *
 * 🔒 DOCTRINE :
 * - Concordantes → UNE valeur écrite en origine='extraite' (invariant 103 réutilisé via ecrireCorps : jamais par-dessus une saisie).
 * - DIVERGENTES → RIEN d'écrit. Aucune moyenne, ni max, ni min. Chaque candidate est journalisée (planche, page, écart) ; la
 *   réserve dit « le gabarit NGF varie selon le plateau de nivellement de la portion coupée ». C'est une décision humaine.
 * - Permis à PLUSIEURS corps → on ne répartit pas au jugé (P4/P5) : rien d'écrit, on PROPOSE (journal sur chaque corps) avec la
 *   réserve « valeur au niveau du permis, pas pour ce bâtiment ».
 * - RECOMPUTE IDEMPOTENT : purge CIBLÉE (methode='plan', champ='hauteur_max_plu_ngf') avant de réécrire.
 */
import { query } from '../db/client';
import { ecrireCorps } from './caracteristiquesRepo';
import {
  decisionGabaritPlanche, agregerGabarit, RESERVE_DIVERGENCE, RESERVE_MULTI_CORPS,
  type ItemTexte, type CandidatGabarit, type AggregationGabarit,
} from './decisionGabaritPlu';

const CHAMP = 'hauteur_max_plu_ngf';

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

/** Balaye toutes les planches PDF du permis, rend les candidats retenus (une planche peut donner 0 ou 1 candidat par page). */
export async function extraireGabaritDossier(dossierId: number, deps: DepsGabarit): Promise<CandidatGabarit[]> {
  const lireItems = deps.lireItems ?? itemsParPage;
  const candidats: CandidatGabarit[] = [];
  for (const m of await deps.listerPieces(dossierId)) {
    if (m.typeMime !== 'application/pdf') continue;
    let buf: Buffer; try { buf = await deps.lireObjet(m.cleStockage); } catch { continue; }
    let pages: ItemTexte[][]; try { pages = await lireItems(buf); } catch { continue; }
    pages.forEach((items, i) => {
      const d = decisionGabaritPlanche(items);
      if (d.statut === 'retenue') candidats.push({ valeurNgf: d.valeurNgf, planche: m.nomFichier, page: i + 1, ecartM: d.ecartM, confiance: d.confiance });
    });
  }
  return candidats;
}

export interface ResultatGabarit { agg: AggregationGabarit; ecrit: boolean; nbCandidats: number; nbCorps: number }

const meilleureConfiance = (cs: CandidatGabarit[]): 'confirmee' | 'a_verifier' =>
  cs.length > 0 && cs.every((c) => c.confiance === 'confirmee') ? 'confirmee' : 'a_verifier';

async function journaliser(dossierId: number, corpsId: number | null, role: 'retenue' | 'ecartee', valeur: number, confiance: 'confirmee' | 'a_verifier', reserve: string | null, piece: string | null, page: number | null, extrait: string): Promise<void> {
  await query(
    `INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
     VALUES ($1, $2, $3, $4, 'm', $5, 'plan', $6, $7, NULL, $8, $9, $10, now())`,
    [dossierId, corpsId, CHAMP, valeur, role, confiance, reserve, piece, page, extrait],
  );
}

/** Applique la décision de gabarit (niveau corps). `majPar` = auteur automatique. */
export async function ecrireGabaritPlu(dossierId: number, candidats: readonly CandidatGabarit[], majPar: string): Promise<ResultatGabarit> {
  const { rows } = await query<{ id: number }>(`SELECT id::int AS id FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY id`, [dossierId]);
  const corps = rows.map((r) => r.id);
  const agg = agregerGabarit(candidats);

  // Purge idempotente CIBLÉE (jamais les autres méthodes, jamais la saisie).
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'plan' AND champ = $2`, [dossierId, CHAMP]);
  if (agg.statut === 'aucune') return { agg, ecrit: false, nbCandidats: 0, nbCorps: corps.length };

  const divergent = agg.statut === 'divergente';
  const multiCorps = corps.length !== 1;
  const reserve = [divergent ? RESERVE_DIVERGENCE : null, multiCorps ? RESERVE_MULTI_CORPS : null].filter(Boolean).join(' ; ') || null;

  // Journalise CHAQUE candidat (role='ecartee' = candidat proposé, non tranché) sur chaque cible (chaque corps ; NULL si aucun corps).
  for (const cible of corps.length > 0 ? corps : [null]) {
    for (const c of candidats) {
      const extrait = `${c.valeurNgf.toFixed(2)} (NGF) — ${c.planche}${c.ecartM !== null ? ` (écart ${c.ecartM.toFixed(2)} m)` : ' (écart non convertible)'}`;
      await journaliser(dossierId, cible, 'ecartee', c.valeurNgf, c.confiance, reserve, c.planche, c.page, extrait);
    }
  }

  // ÉCRITURE de la colonne : SEULEMENT concordante ET un seul corps. Jamais de répartition au jugé, jamais un départage inventé.
  let ecrit = false;
  if (agg.statut === 'concordante' && corps.length === 1) {
    const r = await ecrireCorps(corps[0], { hauteurMaxPluNgf: agg.valeur }, 'extraite', majPar);
    ecrit = r.ecrits.includes('hauteurMaxPluNgf'); // false si une saisie occupe déjà le champ (invariant 103)
    if (ecrit) await journaliser(dossierId, corps[0], 'retenue', agg.valeur, meilleureConfiance(agg.groupes.flatMap((g) => g.sources)), null, null, null, `${agg.valeur.toFixed(2)} (NGF) — concordant sur ${candidats.length} planche(s)`);
  }
  return { agg, ecrit, nbCandidats: candidats.length, nbCorps: corps.length };
}
