import { query } from '../db/client';
import { immeubleDuBien } from '../gestion/copropriete';
import { adresseImmeuble, cleImmeuble } from '../gestion/syndics';
import { rapprocherAdresse, rapprocherBien, type RapprochementComplet } from './banRepo';

/**
 * ══ 🔴🔴 L'ADRESSE OFFICIELLE D'UNE COPROPRIÉTÉ, POUR L'AFFICHAGE (Arno, 20/11/2026, « Adresse officielle BAN », lot 4). LECTURE SEULE. ═══════════════
 *
 * Le lot 4 n'ÉCRIT RIEN : les rapprochements ne seront enregistrés qu'au lot 5 (`--appliquer`, après l'accord d'Arno). D'ici là, l'affichage les
 * calcule EN DIRECT par le module unique (`banRepo`) — la même règle que l'essai du stock — et les garde 10 minutes en mémoire (une liste de 217
 * copropriétés ne refait pas 400 rapprochements à chaque ouverture).
 *
 * LA RÈGLE D'AFFICHAGE (pure, `modeleOfficiel`) : les adresses de la copropriété (principale, secondaires) et les écritures de ses biens rapprochées
 * avec CERTITUDE sont regroupées par adresse officielle ; l'adresse principale affichée est celle de l'adresse principale de la copropriété (sinon celle
 * qui porte le plus de biens) ; les autres adresses officielles DIFFÉRENTES suivent (43 avenue Marceau + 74, 76, 80 rue de Normandie) ; chaque écriture
 * WIPPIMMO est une « écriture d'origine », avec son nombre de biens ; « à vérifier » dès qu'une écriture n'est pas rapprochée avec certitude. Rien de
 * certain : aucun modèle, et l'affichage d'avant ne change pas.
 */

export interface AdresseOfficielle { banId: string; libelle: string; court: string; cles: string[] }
export interface EcritureOrigine { ecriture: string; cle: string; biens: number; statut: RapprochementComplet['statut']; banId: string | null }
export interface ModeleOfficiel { principale: AdresseOfficielle; adresses: AdresseOfficielle[]; ecritures: EcritureOrigine[]; aVerifier: boolean }

export interface EntreeOfficielle {
  /** la clé (`cleImmeuble`) de l'adresse de la copropriété, ou de l'écriture d'un bien */
  cle: string;
  /** le texte tel qu'écrit */
  texte: string;
  /** nombre de biens portés par cette écriture (0 : une adresse de la copropriété sans bien) */
  biens: number;
  /** l'adresse PRINCIPALE de la copropriété */
  principale: boolean;
  /** une adresse de la copropriété (principale ou secondaire), et non l'écriture d'un bien */
  adresseCopro: boolean;
  r: Pick<RapprochementComplet, 'statut' | 'codePostal'> & { ban: { id: string; libelle: string; commune: string } | null };
}

/** LE MODÈLE D'AFFICHAGE d'une copropriété, ou `null` (rien de certain : l'affichage d'avant). PUR. */
export function modeleOfficiel(entrees: readonly EntreeOfficielle[]): ModeleOfficiel | null {
  const groupes = new Map<string, AdresseOfficielle & { biens: number; principale: boolean }>();
  for (const e of entrees) {
    if (e.r.statut !== 'certain' || e.r.ban === null) continue;
    const g = groupes.get(e.r.ban.id) ?? { banId: e.r.ban.id, libelle: adresseImmeuble(e.r.ban.libelle, e.r.codePostal, e.r.ban.commune), court: e.r.ban.libelle, cles: [], biens: 0, principale: false };
    if (!g.cles.includes(e.cle)) g.cles.push(e.cle);
    g.biens += e.biens;
    g.principale ||= e.principale;
    groupes.set(e.r.ban.id, g);
  }
  if (groupes.size === 0) return null;
  const ordre = [...groupes.values()].sort((a, b) => Number(b.principale) - Number(a.principale) || b.biens - a.biens || a.libelle.localeCompare(b.libelle, 'fr', { numeric: true }));
  const adresses = ordre.map(({ biens: _b, principale: _p, ...g }) => g);
  const ecritures = entrees.filter((e) => e.biens > 0).map((e) => ({ ecriture: e.texte, cle: e.cle, biens: e.biens, statut: e.r.statut, banId: e.r.ban?.id ?? null }))
    .sort((a, b) => b.biens - a.biens || a.ecriture.localeCompare(b.ecriture, 'fr', { numeric: true }));
  return { principale: adresses[0], adresses, ecritures, aVerifier: ecritures.some((x) => x.statut !== 'certain') };
}

// ══ LA LECTURE EN DIRECT, MÉMORISÉE 10 MINUTES ════════════════════════════════════════════════════════════════════════════════════════════════════

const DUREE_MS = 10 * 60 * 1000;
const memoire = new Map<string, { a: number; p: Promise<RapprochementComplet> }>();
function memorise(cle: string, calcul: () => Promise<RapprochementComplet>): Promise<RapprochementComplet> {
  const m = memoire.get(cle);
  if (m !== undefined && Date.now() - m.a < DUREE_MS) return m.p;
  const p = calcul().catch((e: unknown) => { memoire.delete(cle); throw e; });
  memoire.set(cle, { a: Date.now(), p });
  return p;
}
/** Pour les épreuves : oublie les rapprochements mémorisés. */
export function oublierRapprochements(): void { memoire.clear(); }

interface LotLu { immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null }
const rapprocherLot = (l: LotLu) => memorise(`B|${l.immeuble}|${l.adresse}|${l.code_postal}|${l.commune}`,
  () => rapprocherBien({ immeuble: l.immeuble, adresse: l.adresse, codePostal: l.code_postal, commune: l.commune }));
const rapprocherAdresseCopro = (a: { libelle: string; codePostal: string | null; commune: string | null }) => memorise(`A|${a.libelle}|${a.codePostal}|${a.commune}`,
  () => rapprocherAdresse({ texte: a.libelle, codePostal: a.codePostal, commune: a.commune }));
const pourModele = (r: RapprochementComplet): EntreeOfficielle['r'] => ({ statut: r.statut, codePostal: r.codePostal, ban: r.ban === null ? null : { id: r.ban.id, libelle: r.ban.libelle, commune: r.ban.commune } });

/** Les entrées d'une copropriété : ses adresses, puis une par écriture WIPPIMMO de ses biens (le rapprochement de son premier bien). */
async function entreesDe(adresses: readonly { cle: string; libelle: string; codePostal: string | null; commune: string | null; principale: boolean }[],
  lots: readonly LotLu[]): Promise<EntreeOfficielle[]> {
  const out: EntreeOfficielle[] = [];
  for (const a of adresses) out.push({ cle: a.cle, texte: a.libelle, biens: 0, principale: a.principale, adresseCopro: true, r: pourModele(await rapprocherAdresseCopro(a)) });
  const parTexte = new Map<string, { l: LotLu; n: number }>();
  for (const l of lots) { const t = immeubleDuBien(l); const x = parTexte.get(t); if (x === undefined) parTexte.set(t, { l, n: 1 }); else x.n++; }
  for (const [texte, { l, n }] of parTexte) out.push({ cle: cleImmeuble(texte), texte, biens: n, principale: false, adresseCopro: false, r: pourModele(await rapprocherLot(l)) });
  return out;
}

const LOTS = 'SELECT immeuble, adresse, code_postal, commune FROM gestion_annuaire_lot WHERE absent_le IS NULL';

/** Le modèle d'UNE copropriété (fiche) : ses adresses (principale et secondaires en cours) et ses biens. LECTURE SEULE. */
export async function officielleDeLaCopropriete(adresses: readonly { cle: string; libelle: string; codePostal: string | null; commune: string | null; principale: boolean }[]):
Promise<ModeleOfficiel | null> {
  const cles = new Set(adresses.map((a) => a.cle));
  const { rows } = await query<LotLu>(LOTS);
  return modeleOfficiel(await entreesDe(adresses, rows.filter((l) => cles.has(cleImmeuble(immeubleDuBien(l))))));
}

export interface LigneOfficielle { principale: string; court: string; adresses: string[]; aVerifier: boolean }

/** Le modèle de CHAQUE ligne de la liste Copropriétés (clé de la ligne → libellé officiel, adresses officielles, « à vérifier »). LECTURE SEULE. */
export async function officiellesDeLaListe(): Promise<Record<string, LigneOfficielle>> {
  const [{ rows: lots }, { rows: copros }, { rows: sec }] = await Promise.all([
    query<LotLu>(LOTS),
    query<{ id: string; cle: string; libelle: string; code_postal: string | null; commune: string | null }>('SELECT id::text, cle_immeuble AS cle, libelle, code_postal, commune FROM gestion_copropriete'),
    query<{ copro: string; cle: string; libelle: string; code_postal: string | null; commune: string | null }>(
      'SELECT copropriete_id::text AS copro, cle_immeuble AS cle, libelle, code_postal, commune FROM gestion_copropriete_adresse WHERE retire_le IS NULL ORDER BY id'),
  ]);
  // la même règle que la liste (coproprieteRepo.listerCoproprietes) : une adresse secondaire en cours est rangée sous sa copropriété
  const coproParId = new Map(copros.map((c) => [c.id, c]));
  const principaleDe = new Map<string, string>();
  for (const a of sec) { const c = coproParId.get(a.copro); if (c !== undefined && !principaleDe.has(a.cle)) principaleDe.set(a.cle, c.cle); }
  const lotsParLigne = new Map<string, LotLu[]>();
  for (const l of lots) {
    const k0 = cleImmeuble(immeubleDuBien(l));
    if (k0 === '') continue;
    const k = principaleDe.get(k0) ?? k0;
    lotsParLigne.set(k, [...(lotsParLigne.get(k) ?? []), l]);
  }
  const out: Record<string, LigneOfficielle> = {};
  for (const [k, ls] of lotsParLigne) {
    const c = copros.find((x) => x.cle === k);
    const adresses = c === undefined ? [] : [{ cle: c.cle, libelle: c.libelle, codePostal: c.code_postal, commune: c.commune, principale: true },
      ...sec.filter((a) => a.copro === c.id).map((a) => ({ cle: a.cle, libelle: a.libelle, codePostal: a.code_postal, commune: a.commune, principale: false }))];
    const m = modeleOfficiel(await entreesDe(adresses, ls));
    if (m !== null) out[k] = { principale: m.principale.libelle, court: m.principale.court, adresses: m.adresses.map((a) => a.libelle), aVerifier: m.aVerifier };
    else if (ls.length > 0) out[k] = { principale: '', court: '', adresses: [], aVerifier: true };
  }
  return out;
}
