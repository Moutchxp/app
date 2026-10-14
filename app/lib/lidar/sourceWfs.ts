/**
 * ══ IMPORT LiDAR HD — LA SOURCE IGN PAR LE WFS DE LA GÉOPLATEFORME (complément du 14/10/2026) ═══════════════════════════
 *
 * VÉRIFIÉ par une vraie requête (réponse enregistrée : `__fixtures__/wfs-metadata-asnieres.json`, HTTP 200) :
 *   · service `https://data.geopf.fr/wfs/ows`, WFS 2.0.0, couche `IGNF_LIDAR-HD_METADONNEE:metadata` — une entité par dalle ;
 *   · `coordonnees_nw` = « 0646-6868 » (km X ouest – km Y nord, la clé de la dalle) ;
 *   · `url_mns` / `url_mnt` = une requête WMS-R GetMap (GeoTIFF fabriqué à la demande) dont la BBOX est EXACTEMENT
 *     l'emprise de la dalle (645999.75,6867000.25,646999.75,6868000.25), 2000 × 2000 px, et dont FILENAME est
 *     `LHD_FXX_0646_6868_MNS_O_0M50_LAMB93_IGN69.tif` — le nom du fichier présent sur le Mac. Les « & » y arrivent
 *     encodés en « &amp; ».
 *   · le filtre BBOX en `urn:ogc:def:crs:EPSG::2154` s'écrit X,Y (est, nord).
 * ⚠️ Le CONTENU du GeoTIFF rendu par le WMS-R n'a pas encore été comparé au fichier du Mac : le contrôle d'intégrité de
 * l'outil (taille, géoréférencement, Float32, nodata, Lambert-93) le jugera au premier téléchargement.
 *
 * PUR : aucun réseau ici (le script fait les appels) ; tout est éprouvé sur la réponse enregistrée.
 */
import { empriseDalle, lireNomDalle, nomDalle, type CoucheLidar, type Dalle } from './grilleLidar';

export const WFS_URL = 'https://data.geopf.fr/wfs/ows';
export const WFS_COUCHE = 'IGNF_LIDAR-HD_METADONNEE:metadata';
/** Entités demandées par page (pagination STARTINDEX / COUNT). */
export const WFS_PAR_PAGE = 1000;
/** Côté des blocs d'emprise interrogés un à un (≈ 100 dalles par bloc, une page chacun). */
export const WFS_TAILLE_BLOC_M = 10_000;

export interface Bloc { xmin: number; ymin: number; xmax: number; ymax: number }

/** Les blocs carrés qui couvrent l'enveloppe du cercle. PUR. */
export function blocsDuCercle(centre: { x: number; y: number }, rayonM: number, tailleM = WFS_TAILLE_BLOC_M): Bloc[] {
  const out: Bloc[] = [];
  for (let x = centre.x - rayonM; x < centre.x + rayonM; x += tailleM) {
    for (let y = centre.y - rayonM; y < centre.y + rayonM; y += tailleM) {
      out.push({ xmin: x, ymin: y, xmax: Math.min(x + tailleM, centre.x + rayonM), ymax: Math.min(y + tailleM, centre.y + rayonM) });
    }
  }
  return out;
}

/** L'URL GetFeature d'un bloc et d'une page. PUR. */
export function urlGetFeature(b: Bloc, startIndex: number, count = WFS_PAR_PAGE): string {
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: WFS_COUCHE, OUTPUTFORMAT: 'application/json',
    COUNT: String(count), STARTINDEX: String(startIndex),
    BBOX: `${b.xmin},${b.ymin},${b.xmax},${b.ymax},urn:ogc:def:crs:EPSG::2154`,
  });
  return `${WFS_URL}?${p.toString()}`;
}

/** Les entités HTML que le WFS laisse dans les URL. PUR. */
export function decoderEntites(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export interface EntreeWfs { dalle: string; urls: Partial<Record<CoucheLidar, string>> }
export interface PageWfs { entrees: EntreeWfs[]; anomalies: string[]; renvoyees: number; correspondantes: number | null }

/** Contrôle d'une URL contre la dalle : FILENAME LHD_FXX_x_y_COUCHE_… et BBOX = emprise exacte. Rend le motif, ou null. PUR. */
export function controlerUrl(d: Dalle, couche: CoucheLidar, url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return 'URL illisible'; }
  const q = new Map([...u.searchParams.entries()].map(([k, v]) => [k.toUpperCase(), v]));
  const nom = nomDalle(d);
  const fichier = q.get('FILENAME') ?? decodeURIComponent(u.pathname.split('/').pop() ?? '');
  if (!fichier.startsWith(`LHD_FXX_${nom}_${couche}_`)) return `fichier « ${fichier} » ≠ LHD_FXX_${nom}_${couche}_…`;
  const bbox = q.get('BBOX');
  if (bbox !== undefined) {
    const e = empriseDalle(d);
    const attendu = [e.xmin, e.ymin, e.xmax, e.ymax];
    const lu = bbox.split(',').slice(0, 4).map(Number);
    if (lu.length !== 4 || lu.some((v, i) => v !== attendu[i])) return `BBOX ${bbox} ≠ emprise ${attendu.join(',')}`;
  }
  return null;
}

/** Lit une page GeoJSON du WFS : une entrée par dalle, URLs décodées et contrôlées. PUR. */
export function lirePageWfs(json: unknown): PageWfs {
  const j = json as { features?: { properties?: Record<string, unknown> }[]; numberReturned?: number; numberMatched?: number | string };
  const entrees: EntreeWfs[] = [];
  const anomalies: string[] = [];
  for (const f of j.features ?? []) {
    const p = f.properties ?? {};
    const cle = String(p.coordonnees_nw ?? '').replace('-', '_');
    const d = lireNomDalle(cle);
    if (!d) { anomalies.push(`entité sans coordonnees_nw lisible (${String(p.coordonnees_nw)})`); continue; }
    const urls: Partial<Record<CoucheLidar, string>> = {};
    for (const [couche, champ] of [['MNS', 'url_mns'], ['MNT', 'url_mnt']] as const) {
      const brut = p[champ];
      if (typeof brut !== 'string' || brut.trim() === '') { anomalies.push(`${cle} : ${champ} absent`); continue; }
      const url = decoderEntites(brut.trim());
      const motif = controlerUrl(d, couche, url);
      if (motif) anomalies.push(`${cle} ${couche} : ${motif}`); else urls[couche] = url;
    }
    entrees.push({ dalle: nomDalle(d), urls });
  }
  const renvoyees = Number(j.numberReturned ?? (j.features ?? []).length);
  const m = Number(j.numberMatched);
  return { entrees, anomalies, renvoyees, correspondantes: Number.isFinite(m) ? m : null };
}

/** Faut-il demander la page suivante ? (page pleine, et pas encore tout reçu si le total est connu). PUR. */
export function pageSuivante(page: PageWfs, startIndex: number, count = WFS_PAR_PAGE): boolean {
  if (page.renvoyees < count) return false;
  return page.correspondantes === null || startIndex + page.renvoyees < page.correspondantes;
}

export interface SourcesCercle {
  /** Lignes « dalle;couche;url » — le format de --source-urls. */
  lignes: string[];
  /** Dalles du cercle absentes du WFS, ou sans URL valide pour une couche (zones non diffusées, ZICAD…). */
  indisponibles: string[];
  disponibles: number;
}

/** Croise les dalles du cercle avec les entrées du WFS (dédoublonnées : une dalle peut tomber dans deux blocs). PUR. */
export function sourcesDuCercle(dalles: readonly Dalle[], entrees: readonly EntreeWfs[]): SourcesCercle {
  const parDalle = new Map<string, Partial<Record<CoucheLidar, string>>>();
  for (const e of entrees) parDalle.set(e.dalle, { ...parDalle.get(e.dalle), ...e.urls });
  const lignes: string[] = [];
  const indisponibles: string[] = [];
  for (const d of dalles) {
    const nom = nomDalle(d);
    const urls = parDalle.get(nom);
    if (!urls?.MNS || !urls?.MNT) { indisponibles.push(nom); continue; }
    lignes.push(`${nom};MNS;${urls.MNS}`, `${nom};MNT;${urls.MNT}`);
  }
  return { lignes, indisponibles, disponibles: dalles.length - indisponibles.length };
}

/** Lit des lignes « dalle;couche;url » (format de --source-urls et du cache WFS). PUR. */
export function lireLignesSources(texte: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const ligne of texte.split(/\r?\n/)) {
    const [dalle, couche, ...reste] = ligne.split(';');
    const url = reste.join(';').trim();
    if (!dalle || !couche || !url || dalle.trim().startsWith('#')) continue;
    table.set(`${dalle.trim()}|${couche.trim().toUpperCase()}`, url);
  }
  return table;
}
