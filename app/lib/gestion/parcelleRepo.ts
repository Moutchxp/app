import { query } from '../db/client';
import { normaliserTexte } from './annuaire';
import { cleImmeuble, type AdresseSaisie } from './syndics';

/**
 * ══ 🔴 LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE — LES AUTRES ADRESSES DE LA MÊME PARCELLE ══════════════════════════
 *
 * ARNO : « proposer automatiquement les autres adresses de la même parcelle cadastrale ». Données LOCALES uniquement
 * (aucun service en ligne) : la BAN (`adresse_ban`, points) et le cadastre Etalab (`parcelle`, polygones, 75-95).
 *
 * 🔴 LA RÈGLE, MESURÉE (11/10/2026, 143 points BAN de nos immeubles) : un point d'adresse BAN est le plus souvent une
 * « entrée », posée SUR LA FAÇADE — donc juste HORS du polygone de sa parcelle (52 sur 143 seulement à l'intérieur ;
 * 139 à moins de 3 m). Une adresse appartient donc à la parcelle LA PLUS PROCHE, à 3 m au plus. Les adresses d'une
 * parcelle sont celles dont c'est la parcelle la plus proche (et non toutes celles à 3 m : une entrée voisine en
 * limite de propriété appartient à SA parcelle).
 * Le champ BAN « parcelles_cadastrales » n'est pas utilisé : 48 218 adresses sur 557 710 le portent, aucune à Paris.
 *
 * ⚠️ Ce ne sont que des PROPOSITIONS : rien n'est rattaché sans un clic. Une grande parcelle (ensemble résidentiel)
 * peut porter des dizaines d'adresses de plusieurs copropriétés — d'où le choix laissé à la main.
 */
export const TOLERANCE_PARCELLE_M = 3;

/** La clé d'une adresse BAN, comme celle d'un immeuble du portefeuille (`cleImmeuble`). */
const NORMALISE = (col: string): string => `btrim(regexp_replace(lower(unaccent(${col})), '[^a-z0-9]+', ' ', 'g'))`;

export interface AdresseDeParcelle { cle: string; libelle: string; codePostal: string; commune: string; parcelle: string }

/**
 * Les AUTRES adresses des parcelles de ces adresses (celles d'une copropriété : principale et secondaires). Une
 * adresse sans numéro, ou sans commune ni code postal, ou absente de la BAN, ne désigne aucune parcelle. LECTURE SEULE.
 */
export async function adressesDeLaParcelle(adresses: readonly AdresseSaisie[]): Promise<{ parcelles: string[]; adresses: AdresseDeParcelle[] }> {
  const entrees = adresses.map((a) => ({ a, cle: cleImmeuble(a.libelle), numero: Number(/^\s*(\d+)/.exec(a.libelle)?.[1] ?? NaN) }))
    .filter((x) => x.cle !== '' && Number.isSafeInteger(x.numero) && (/^\d{5}$/.test(x.a.codePostal.trim()) || x.a.commune.trim() !== ''));
  if (entrees.length === 0) return { parcelles: [], adresses: [] };
  // ① les points BAN de ces adresses (un seul passage sur la table)
  const { rows: points } = await query<{ cle: string; x: number; y: number }>(
    `WITH c AS (SELECT * FROM unnest($1::text[], $2::int[], $3::text[], $4::text[]) AS c(cle, numero, cp, commune_n))
     SELECT DISTINCT ON (c.cle) c.cle, ST_X(b.geom) AS x, ST_Y(b.geom) AS y
       FROM c JOIN adresse_ban b ON b.numero = c.numero
        AND (CASE WHEN c.cp ~ '^75[0-9]{3}$' THEN b.insee_commune = '751' || right(c.cp, 2)
                  ELSE ${NORMALISE('b.nom_commune')} = c.commune_n END)
        AND ${NORMALISE("b.numero::text || ' ' || coalesce(b.suffixe, '') || ' ' || b.nom_voie")} = c.cle`,
    [entrees.map((e) => e.cle), entrees.map((e) => e.numero), entrees.map((e) => e.a.codePostal.trim()), entrees.map((e) => normaliserTexte(e.a.commune))]);
  // ② la parcelle la plus proche de chaque point (≤ 3 m) — le point est INLINÉ dans le KNN (règle d'AGENTS.md)
  const parcelles = new Map<number, { id: string; codePostal: string }>();
  for (const p of points) {
    const { rows } = await query<{ fid: number; id: string }>(
      `SELECT fid, id FROM parcelle
        WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 2154), $3)
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 2154) LIMIT 1`, [p.x, p.y, TOLERANCE_PARCELLE_M]);
    const e = entrees.find((x) => x.cle === p.cle);
    if (rows[0] !== undefined) parcelles.set(rows[0].fid, { id: rows[0].id, codePostal: e?.a.codePostal.trim() ?? '' });
  }
  if (parcelles.size === 0) return { parcelles: [], adresses: [] };
  // ③ les adresses de ces parcelles : celles dont c'est la parcelle la plus proche
  const { rows: cand } = await query<{ numero: number; suffixe: string | null; nom_voie: string; nom_commune: string; insee: string; fid: number }>(
    `SELECT DISTINCT b.numero, b.suffixe, b.nom_voie, b.nom_commune, b.insee_commune AS insee, p.fid
       FROM parcelle p JOIN adresse_ban b ON ST_DWithin(p.geom, b.geom, $2)
       CROSS JOIN LATERAL (SELECT q.fid FROM parcelle q WHERE ST_DWithin(q.geom, b.geom, $2) ORDER BY q.geom <-> b.geom LIMIT 1) plus_proche
      WHERE p.fid = ANY($1::int[]) AND plus_proche.fid = p.fid AND b.numero IS NOT NULL`, [[...parcelles.keys()], TOLERANCE_PARCELLE_M]);
  const miennes = new Set(entrees.map((e) => e.cle));
  const vues = new Set<string>();
  const out: AdresseDeParcelle[] = [];
  for (const r of cand) {
    const libelle = [String(r.numero), r.suffixe ?? '', r.nom_voie].filter((x) => x.trim() !== '').join(' ');
    const cle = cleImmeuble(libelle);
    if (miennes.has(cle) || vues.has(cle)) continue;
    vues.add(cle);
    const p = parcelles.get(r.fid);
    out.push({ cle, libelle, parcelle: p?.id ?? '', commune: /^751\d\d$/.test(r.insee) ? 'Paris' : r.nom_commune,
      codePostal: /^751\d\d$/.test(r.insee) ? `750${r.insee.slice(3)}` : (p?.codePostal ?? '') });
  }
  out.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr', { numeric: true }));
  return { parcelles: [...new Set([...parcelles.values()].map((p) => p.id))], adresses: out };
}
