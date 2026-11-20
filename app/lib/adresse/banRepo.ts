import { query, type RequeteTx } from '../db/client';
import { normaliserTexte } from '../gestion/annuaire';
import { colonneExisteMemo } from '../location/sondeLocation';
import type { Auteur } from '../gestion/gestes';
import { analyserAdresse, deciderRapprochement, indiceNormalise, motifPlage, type CandidatBan, type Rapprochement } from './rapprochementBan';

/**
 * ══ 🔴🔴 LE SEUL ACCÈS SERVEUR À LA BASE ADRESSE NATIONALE POUR RAPPROCHER UNE ADRESSE (Arno, 20/11/2026, « Adresse officielle BAN », lot 2). IMPUR. ══
 *
 * La BAN LOCALE (`adresse_ban`, Île-de-France) et le cadastre (`parcelle`) — aucun service en ligne. Le stock, l'import WIPPIMMO, la vérification des
 * saisies et les permis passeront TOUS par ici (lots 3 à 7e) ; le garde `banRepo.garde.test.ts` refuse tout NOUVEAU fichier qui lirait `adresse_ban`
 * ailleurs. La règle de décision est pure, dans `rapprochementBan.ts`.
 *
 * ⚠️ La BAN locale ne porte PAS de code postal : la commune se trouve par son nom (et le département du code postal), Paris par l'arrondissement
 * du code postal (75011 → 75111). Le code postal enregistré est celui de l'adresse écrite, contrôlé par le département de la commune trouvée.
 */

/** La règle de normalisation des noms de commune, en SQL : la même que `normaliserTexte` (casse, accents, tirets, apostrophes). */
const NORMALISE = (col: string): string => `btrim(regexp_replace(lower(unaccent(${col})), '[^a-z0-9]+', ' ', 'g'))`;

/** La table de correspondance code postal → INSEE (migration 507, « Base officielle des codes postaux ») est-elle là et remplie ? */
export async function correspondanceCodesPostaux(q: RequeteTx | typeof query = query): Promise<boolean> {
  if (!(await colonneExisteMemo('code_postal_insee', 'insee'))) return false;
  const { rows } = await q<{ n: number }>('SELECT count(*)::int AS n FROM (SELECT 1 FROM code_postal_insee LIMIT 1) x');
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Le code INSEE de la commune d'une adresse écrite, ou `null` (absente de la BAN locale, ou ambiguë). LECTURE SEULE.
 * 🔴 (lot 3 bis, Arno 20/11/2026) PAR LE CODE POSTAL, jamais par le libellé saisi (« 92110 CLICHY LA GARENNE » est Clichy, INSEE 92024, que la BAN nomme
 * « Clichy ») : Paris par l'arrondissement ; ailleurs par la table de correspondance code postal → INSEE quand elle est chargée (le nom écrit ne sert
 * qu'à départager un code postal partagé par plusieurs communes). Sans cette table, le repli d'avant : le nom, contrôlé par le département.
 */
export async function inseeDeLaCommune(commune: string | null, codePostal: string | null, q: RequeteTx | typeof query = query): Promise<string | null> {
  const cp = (codePostal ?? '').trim();
  if (/^75\d{3}$/.test(cp)) return cp === '75116' ? '75116' : `751${cp.slice(3)}`;
  if (/^\d{5}$/.test(cp) && await correspondanceCodesPostaux(q)) {
    const { rows } = await q<{ insee: string; nom: string }>('SELECT DISTINCT insee, nom_commune AS nom FROM code_postal_insee WHERE code_postal = $1 ORDER BY insee', [cp]);
    if (rows.length === 1) return rows[0].insee;
    const nomEcrit = normaliserTexte(commune);
    const parNom = rows.filter((r) => normaliserTexte(r.nom) === nomEcrit);
    if (rows.length > 1) return parNom.length === 1 ? parNom[0].insee : null;
  }
  const nom = normaliserTexte(commune);
  if (nom === '') return null;
  const { rows } = await q<{ insee: string }>(
    `SELECT DISTINCT insee_commune AS insee FROM adresse_ban
      WHERE ${NORMALISE('nom_commune')} = $1 OR ${NORMALISE("coalesce(nom_commune_deleguee, '')")} = $1`, [nom]);
  const dep = /^\d{5}$/.test(cp) ? cp.slice(0, 2) : null;
  const retenues = rows.map((r) => r.insee).filter((i) => dep === null || i.startsWith(dep));
  return retenues.length === 1 ? retenues[0] : null;
}

/** Les lignes ajoutées depuis un fichier de la BAN officielle (`ban-csv-import`) : leur identifiant est le plus récent. */
export const SOURCE_BAN_OFFICIELLE = 'BAN adresse.data.gouv.fr';
/** Deux lignes de même voie et même indice à moins de cette distance (mètres) sont la MÊME adresse (un identifiant de voie renuméroté par la BAN). */
export const MEME_ADRESSE_M = 5;

/**
 * Les adresses officielles d'une commune à un numéro (tous indices). LECTURE SEULE.
 * 🔴 (lot 3 ter, 20/11/2026) LA MÊME ADRESSE SOUS DEUX IDENTIFIANTS : après l'import du fichier BAN de Paris, 178 adresses existent deux fois — l'ancien
 * identifiant de l'extrait BD TOPO (« 75105_x125_00001 ») et le nouveau de la BAN (« 75105_m7yz55_00001 »), même voie, même position. Une seule est
 * gardée : celle du fichier BAN officiel (la plus récente), sinon le plus petit identifiant — sans quoi chacune deviendrait « à vérifier ».
 */
export async function candidatsAuNumero(insee: string, numero: number, q: RequeteTx | typeof query = query): Promise<CandidatBan[]> {
  const { rows } = await q<{ id: string; numero: number; suffixe: string | null; nom_voie: string; insee: string; commune: string; x: number | null; y: number | null; officielle: boolean }>(
    `SELECT cle_d_interoperabilite AS id, numero, suffixe, nom_voie, insee_commune AS insee, nom_commune AS commune, ST_X(geom) AS x, ST_Y(geom) AS y,
            coalesce(source_adresse LIKE $3, false) AS officielle
       FROM adresse_ban WHERE insee_commune = $1 AND numero = $2 AND cle_d_interoperabilite IS NOT NULL ORDER BY cle_d_interoperabilite`, [insee, numero, `${SOURCE_BAN_OFFICIELLE}%`]);
  return dedoublonnerCandidats(rows.map((r) => ({ id: r.id, numero: r.numero, suffixe: indiceNormalise(r.suffixe), nomVoie: r.nom_voie, insee: r.insee, commune: r.commune,
    x: r.x, y: r.y, officielle: r.officielle })));
}

/** La même adresse sous deux identifiants (même voie normalisée, même indice, à moins de 5 m) : une seule, la plus récente. PUR. */
export function dedoublonnerCandidats(c: readonly (CandidatBan & { officielle: boolean })[]): CandidatBan[] {
  const tries = [...c].sort((a, b) => Number(b.officielle) - Number(a.officielle) || a.id.localeCompare(b.id));
  const gardes: (CandidatBan & { officielle: boolean })[] = [];
  for (const x of tries) {
    const meme = gardes.find((g) => normaliserTexte(g.nomVoie) === normaliserTexte(x.nomVoie) && g.suffixe === x.suffixe
      && g.x !== null && g.y !== null && x.x !== null && x.y !== null && Math.hypot(g.x - x.x, g.y - x.y) < MEME_ADRESSE_M);
    if (meme === undefined) gardes.push(x);
  }
  return gardes.map(({ officielle: _o, ...g }) => g).sort((a, b) => a.id.localeCompare(b.id));
}

/** La parcelle cadastrale d'un point BAN : la plus proche, à 3 m au plus (la règle de `parcelleRepo`, point INLINÉ dans le KNN). LECTURE SEULE. */
export async function parcelleDuPoint(x: number, y: number, q: RequeteTx | typeof query = query): Promise<string | null> {
  const { rows } = await q<{ id: string }>(
    `SELECT id FROM parcelle WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 2154), 3)
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 2154) LIMIT 1`, [x, y]);
  return rows[0]?.id ?? null;
}

export interface AdresseEcrite { texte: string | null; codePostal: string | null; commune: string | null }
export type RapprochementComplet = Rapprochement & { insee: string | null; codePostal: string | null; parcelle: string | null; texteSource: string };

/** RAPPROCHER une adresse écrite : la commune, les candidats à ce numéro, la décision, puis la parcelle de l'adresse retenue. LECTURE SEULE. */
export async function rapprocherAdresse(a: AdresseEcrite, q: RequeteTx | typeof query = query): Promise<RapprochementComplet> {
  const analyse = analyserAdresse(a.texte, a.commune);
  const insee = analyse.numero === null ? null : await inseeDeLaCommune(a.commune, a.codePostal, q);
  let candidats = analyse.numero === null || insee === null ? null : await candidatsAuNumero(insee, analyse.numero, q);
  // 🔴 (lot 3 ter) la commune trouvée par son code postal, mais SANS AUCUNE adresse dans la BAN locale (Melun, Taverny…) : « commune absente », pas
  // « aucune adresse à ce numéro » (qui laisserait croire que la commune est couverte)
  if (candidats !== null && candidats.length === 0 && insee !== null) {
    const { rows } = await q<{ n: number }>('SELECT count(*)::int AS n FROM (SELECT 1 FROM adresse_ban WHERE insee_commune = $1 LIMIT 1) x', [insee]);
    if ((rows[0]?.n ?? 0) === 0) candidats = null;
  }
  const r = deciderRapprochement(analyse, candidats);
  const parcelle = r.ban?.x != null && r.ban.y != null ? await parcelleDuPoint(r.ban.x, r.ban.y, q) : null;
  const cp = (a.codePostal ?? '').trim();
  return { ...r, insee, codePostal: /^\d{5}$/.test(cp) ? cp : null, parcelle, texteSource: (a.texte ?? '').trim() };
}

/** Le rang d'un statut : on garde, pour un bien, le meilleur rapprochement de son « Immeuble » et de son adresse. */
const RANG: Record<Rapprochement['statut'], number> = { certain: 2, a_verifier: 1, introuvable: 0 };

/** RAPPROCHER un bien : son « Immeuble », puis son adresse si l'« Immeuble » ne donne rien de certain (le meilleur des deux). LECTURE SEULE. */
export async function rapprocherBien(l: { immeuble: string | null; adresse: string | null; codePostal: string | null; commune: string | null },
  q: RequeteTx | typeof query = query): Promise<RapprochementComplet> {
  const textes = [...new Set([(l.immeuble ?? '').trim(), (l.adresse ?? '').trim()].filter((t) => t !== ''))];
  let meilleur: RapprochementComplet | null = null;
  for (const texte of textes) {
    const r = await rapprocherAdresse({ texte, codePostal: l.codePostal, commune: l.commune }, q);
    if (meilleur === null || RANG[r.statut] > RANG[meilleur.statut]) meilleur = r;
    if (r.statut === 'certain') break;
  }
  const issue = meilleur ?? await rapprocherAdresse({ texte: '', codePostal: l.codePostal, commune: l.commune }, q);
  // 🔴 (lot 3 bis, Arno 20/11/2026) une PLAGE de numéros dans l'« Immeuble » OU dans l'adresse : à vérifier, quel que soit le champ qui a rapproché
  const plages = textes.map((t) => analyserAdresse(t, l.commune)).filter((a) => a.plage).map((a) => a.plageTexte);
  if (plages.length > 0 && issue.statut === 'certain') return { ...issue, statut: 'a_verifier', motif: `${motifPlage([...new Set(plages)].join(', '))}.` };
  return issue;
}

// ══ L'ENREGISTREMENT (migration 505) — historisé : la ligne en cours est FERMÉE (`fin`), jamais modifiée ni effacée ═══════════════════════════════════

export function rapprochementDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_lot_adresse_ban', 'ban_id');
}
export type StatutEnregistre = Rapprochement['statut'] | 'valide' | 'refuse';
export type OrigineRapprochement = 'stock' | 'import_wippimmo' | 'saisie' | 'file_verification';
export type MethodeRapprochement = 'similarite_voie' | 'choix_humain' | 'auto_completion';
export const MOTIF_SANS_505 = 'Les adresses officielles demandent la mise à jour de la base (migration 505) : rien n’est enregistré.';

/**
 * ENREGISTRE le rapprochement d'un bien (dans la transaction de l'appelant). Le même que celui en cours (même identifiant, même statut) : rien
 * (rejouable). Sinon la ligne en cours est fermée (`fin`, qui, motif) et la nouvelle ouverte. Les adresses WIPPIMMO du bien ne sont JAMAIS touchées.
 * Rend `false` quand rien n'a changé.
 */
export async function enregistrerRapprochement(q: RequeteTx, lotId: number, r: RapprochementComplet, o: {
  statut?: StatutEnregistre; origine: OrigineRapprochement; methode: MethodeRapprochement; motifFin?: string;
}, auteur: Auteur): Promise<boolean> {
  const statut = o.statut ?? r.statut;
  const banId = r.ban?.id ?? null;
  const { rows } = await q<{ id: string; ban_id: string | null; statut: string }>(
    'SELECT id::text, ban_id, statut FROM gestion_lot_adresse_ban WHERE lot_id = $1 AND fin IS NULL FOR UPDATE', [lotId]);
  const enCours = rows[0];
  if (enCours !== undefined && enCours.ban_id === banId && enCours.statut === statut) return false;
  if (enCours !== undefined) {
    await q('UPDATE gestion_lot_adresse_ban SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = $4 WHERE id = $1',
      [enCours.id, auteur.id, auteur.libelle, o.motifFin ?? 'nouveau rapprochement']);
  }
  await q(
    `INSERT INTO gestion_lot_adresse_ban (lot_id, ban_id, libelle_officiel, numero, suffixe, code_postal, insee, commune, parcelle, score, methode, statut,
                                          origine, texte_source, motif, cree_par, cree_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [lotId, banId, r.ban?.libelle ?? null, r.ban?.numero ?? r.analyse.numero, r.ban?.suffixe ?? r.analyse.indice, r.codePostal, r.ban?.insee ?? r.insee,
      r.ban?.commune ?? null, r.parcelle, r.score, o.methode, statut, o.origine, r.texteSource, r.motif, auteur.id, auteur.libelle]);
  return true;
}
