import { immeubleDuBien } from '../gestion/copropriete';
import { cleImmeuble } from '../gestion/syndics';
import type { RapprochementComplet } from './banRepo';

/**
 * ══ 🔴🔴 LE STOCK EN « --essai » — CE QUE DONNERAIT LE RAPPROCHEMENT BAN, SANS RIEN ÉCRIRE (Arno, 20/11/2026, « Adresse officielle BAN », lot 3). PUR. ══
 *
 * Reçoit les biens, le rapprochement de chacun (calculé par le module unique `banRepo.rapprocherBien`), les adresses secondaires et les regroupements
 * 504 en cours ; rend le rapport : résumé, une ligne par ÉCRITURE (l'« Immeuble » WIPPIMMO tel qu'écrit, sinon l'adresse — la règle de la liste), les
 * écritures RÉUNIES sous une même adresse officielle, et les copropriétés avant / après. Rien n'est lu ni écrit ici.
 *
 * LES COPROPRIÉTÉS « AVANT » : les lignes de la liste Copropriétés (une écriture, ou plusieurs déjà réunies par une adresse secondaire — même règle que
 * `listerCoproprietes`, coproprieteRepo.ts:185-188), plus les copropriétés enregistrées sans bien. « APRÈS » : deux lignes qui partagent une adresse
 * officielle CERTAINE ne font plus qu'une (et une ligne à plusieurs adresses officielles — 43 avenue Marceau + rue de Normandie — reste une seule).
 */

export interface BienLu { id: number; immeuble: string | null; adresse: string | null; codePostal: string | null; commune: string | null }
export interface RegroupementLu { id: number; cle: string; principale: string; regroupees: string[] }
export interface EntreeEssai {
  biens: readonly BienLu[];
  /** le rapprochement de chaque bien (par son identifiant) */
  rapprochements: ReadonlyMap<number, RapprochementComplet>;
  /** clé d'une adresse secondaire EN COURS → clé de sa copropriété */
  principaleDe: ReadonlyMap<string, string>;
  /** les copropriétés enregistrées (leurs clés), avec ou sans bien */
  coproprietes: readonly string[];
  regroupements: readonly RegroupementLu[];
}

export interface LigneEcriture {
  ecriture: string; codePostal: string | null; commune: string | null; biens: number;
  statut: RapprochementComplet['statut']; officielle: string | null; banId: string | null; score: number | null; parcelle: string | null;
  motif: string; texteRapproche: string;
}
export interface Reunion { banId: string; officielle: string; ecritures: { ecriture: string; biens: number }[]; biens: number; dejaUneCopropriete: boolean }
export interface AbsorptionRegroupement { id: number; principale: string; regroupees: string[]; absorbe: boolean; banId: string | null; raison: string }
export interface RapportEssai {
  biens: { total: number; certains: number; aVerifier: number; introuvables: number };
  ecritures: { total: number; certaines: number; aVerifier: number; introuvables: number };
  coproprietes: { avant: number; apres: number };
  lignes: LigneEcriture[];
  reunions: Reunion[];
  regroupements: AbsorptionRegroupement[];
}

const cleEcriture = (b: BienLu): string => `${immeubleDuBien(b)}|${(b.codePostal ?? '').trim()}|${(b.commune ?? '').trim()}`;

/** LE RAPPORT de l'essai. PUR. */
export function construireRapport(e: EntreeEssai): RapportEssai {
  // ① une ligne par écriture, avec le rapprochement de son premier bien (les biens d'une même écriture ne diffèrent que si leur ADRESSE diffère :
  //    les totaux de biens, eux, comptent chaque bien par son propre rapprochement)
  const parEcriture = new Map<string, { b: BienLu; r: RapprochementComplet; ids: number[] }>();
  for (const b of e.biens) {
    const r = e.rapprochements.get(b.id);
    if (r === undefined || immeubleDuBien(b) === '') continue;
    const k = cleEcriture(b);
    const x = parEcriture.get(k);
    if (x === undefined) parEcriture.set(k, { b, r, ids: [b.id] });
    else x.ids.push(b.id);
  }
  const lignes: LigneEcriture[] = [...parEcriture.values()].map(({ b, r, ids }) => ({
    ecriture: immeubleDuBien(b), codePostal: b.codePostal, commune: b.commune, biens: ids.length, statut: r.statut,
    officielle: r.ban?.libelle ?? null, banId: r.ban?.id ?? null, score: r.score, parcelle: r.parcelle, motif: r.motif, texteRapproche: r.texteSource,
  })).sort((a, b) => ordreStatut(a.statut) - ordreStatut(b.statut) || a.ecriture.localeCompare(b.ecriture, 'fr', { numeric: true }));

  // ② les lignes de la liste Copropriétés (avant) : la clé de chaque bien, ramenée à sa copropriété quand c'est une adresse secondaire
  const ligneDe = (b: BienLu): string => { const k = cleImmeuble(immeubleDuBien(b)); return e.principaleDe.get(k) ?? k; };
  const lignesAvant = new Set<string>();
  for (const b of e.biens) { const k = ligneDe(b); if (k !== '') lignesAvant.add(k); }
  for (const c of e.coproprietes) if (!e.principaleDe.has(c)) lignesAvant.add(c);

  // ③ après : union des lignes qui partagent une adresse officielle CERTAINE
  const parent = new Map<string, string>();
  const racine = (x: string): string => { let r = x; while (parent.get(r) !== r && parent.get(r) !== undefined) r = parent.get(r)!; parent.set(x, r); return r; };
  const unir = (a: string, b: string) => { const ra = racine(a); const rb = racine(b); if (ra !== rb) parent.set(ra, rb); };
  for (const k of lignesAvant) parent.set(`L:${k}`, `L:${k}`);
  for (const b of e.biens) {
    const r = e.rapprochements.get(b.id);
    const k = ligneDe(b);
    if (k === '' || r?.statut !== 'certain' || r.ban === null) continue;
    const n = `B:${r.ban.id}`;
    if (!parent.has(n)) parent.set(n, n);
    unir(`L:${k}`, n);
  }
  const apres = new Set([...lignesAvant].map((k) => racine(`L:${k}`))).size;

  // ④ les écritures RÉUNIES : une adresse officielle certaine portée par au moins deux écritures
  const parBan = new Map<string, { officielle: string; ecritures: Map<string, number>; lignes: Set<string> }>();
  for (const b of e.biens) {
    const r = e.rapprochements.get(b.id);
    if (r?.statut !== 'certain' || r.ban === null || immeubleDuBien(b) === '') continue;
    const x = parBan.get(r.ban.id) ?? { officielle: r.ban.libelle, ecritures: new Map<string, number>(), lignes: new Set<string>() };
    x.ecritures.set(immeubleDuBien(b), (x.ecritures.get(immeubleDuBien(b)) ?? 0) + 1);
    x.lignes.add(ligneDe(b));
    parBan.set(r.ban.id, x);
  }
  const reunions: Reunion[] = [...parBan.entries()].filter(([, x]) => x.ecritures.size >= 2).map(([banId, x]) => ({
    banId, officielle: x.officielle, ecritures: [...x.ecritures.entries()].map(([ecriture, biens]) => ({ ecriture, biens })).sort((a, b) => b.biens - a.biens),
    biens: [...x.ecritures.values()].reduce((s, n) => s + n, 0), dejaUneCopropriete: x.lignes.size === 1,
  })).sort((a, b) => b.biens - a.biens || a.officielle.localeCompare(b.officielle, 'fr', { numeric: true }));

  // ⑤ les regroupements 504 en cours : absorbés quand toutes leurs écritures sont rapprochées, CERTAINES, de la même adresse officielle
  const banDeCle = new Map<string, Set<string | null>>();
  for (const b of e.biens) {
    const r = e.rapprochements.get(b.id);
    const k = cleImmeuble(immeubleDuBien(b));
    const s = banDeCle.get(k) ?? new Set<string | null>();
    s.add(r?.statut === 'certain' ? r.ban?.id ?? null : null);
    banDeCle.set(k, s);
  }
  const regroupements = e.regroupements.map((g) => {
    const ids = new Set<string | null>();
    for (const x of [g.principale, ...g.regroupees]) for (const v of banDeCle.get(cleImmeuble(x)) ?? [null]) ids.add(v);
    const uniques = [...ids];
    const absorbe = uniques.length === 1 && uniques[0] !== null;
    return { id: g.id, principale: g.principale, regroupees: g.regroupees, absorbe, banId: absorbe ? uniques[0] : null,
      raison: absorbe ? 'toutes ses écritures ont la même adresse officielle (certaine)' : uniques.includes(null)
        ? 'une de ses écritures n’est pas rapprochée avec certitude : à vérifier' : 'ses écritures ont des adresses officielles différentes : à vérifier' };
  });

  const compter = (xs: readonly { statut: string }[]) => ({
    certains: xs.filter((x) => x.statut === 'certain').length,
    aVerifier: xs.filter((x) => x.statut === 'a_verifier').length,
    introuvables: xs.filter((x) => x.statut === 'introuvable').length,
  });
  // les biens, chacun par SON rapprochement (deux biens de même écriture peuvent différer par leur adresse) ; les écritures, par leur ligne
  const parBien = compter(e.biens.filter((b) => immeubleDuBien(b) !== '' && e.rapprochements.has(b.id)).map((b) => ({ statut: e.rapprochements.get(b.id)!.statut })));
  const parEcrit = compter(lignes);
  return {
    biens: { total: lignes.reduce((s, x) => s + x.biens, 0), ...parBien },
    ecritures: { total: lignes.length, certaines: parEcrit.certains, aVerifier: parEcrit.aVerifier, introuvables: parEcrit.introuvables },
    coproprietes: { avant: lignesAvant.size, apres }, lignes, reunions, regroupements,
  };
}

const ordreStatut = (s: string): number => (s === 'a_verifier' ? 0 : s === 'introuvable' ? 1 : 2);
export const MOT_STATUT: Readonly<Record<string, string>> = { certain: 'Certain', a_verifier: 'À vérifier', introuvable: 'Introuvable' };
const score = (s: number | null): string => (s === null ? '' : s.toFixed(2).replace('.', ','));

// ══ LES RENDUS — un résumé (texte), un CSV qui s'ouvre dans Numbers (point-virgule, BOM UTF-8), une page HTML simple ═══════════════════════════════

export function texteResume(r: RapportEssai, entete: readonly string[]): string {
  const absorbes = r.regroupements.filter((g) => g.absorbe).length;
  return [...entete, '',
    `BIENS : ${r.biens.total} — certains ${r.biens.certains}, à vérifier ${r.biens.aVerifier}, introuvables ${r.biens.introuvables}`,
    `ÉCRITURES : ${r.ecritures.total} — certaines ${r.ecritures.certaines}, à vérifier ${r.ecritures.aVerifier}, introuvables ${r.ecritures.introuvables}`,
    `COPROPRIÉTÉS : ${r.coproprietes.avant} aujourd’hui → ${r.coproprietes.apres} après rapprochement des seuls cas certains`,
    `ÉCRITURES RÉUNIES : ${r.reunions.length} adresse(s) officielle(s) portée(s) par plusieurs écritures (${r.reunions.filter((x) => !x.dejaUneCopropriete).length} réuniraient des copropriétés distinctes aujourd’hui)`,
    `REGROUPEMENTS 504 EN COURS : ${r.regroupements.length} — absorbés ${absorbes}, à vérifier ${r.regroupements.length - absorbes}`,
    ...r.regroupements.map((g) => `  n° ${g.id} « ${g.principale} » : ${g.absorbe ? `absorbé (${g.banId})` : 'NON absorbé'} — ${g.raison}`),
    '', 'ADRESSES OFFICIELLES RÉUNISSANT PLUSIEURS ÉCRITURES :',
    ...r.reunions.flatMap((x) => [`  ${x.officielle} (${x.banId}) — ${x.biens} bien(s)${x.dejaUneCopropriete ? ' — déjà une seule copropriété' : ''}`,
      ...x.ecritures.map((y) => `      « ${y.ecriture} » : ${y.biens} bien(s)`)]),
  ].join('\n');
}

const csv = (v: string | number | null): string => { const s = v === null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Le CSV des écritures (s'ouvre dans Numbers) : point-virgule, BOM UTF-8. PUR. */
export function csvEcritures(r: RapportEssai): string {
  const tete = ['Écriture WIPPIMMO', 'Code postal', 'Commune', 'Biens', 'Statut', 'Adresse officielle proposée', 'Identifiant BAN', 'Score', 'Parcelle', 'Motif', 'Texte rapproché'];
  const corps = r.lignes.map((l) => [l.ecriture, l.codePostal, l.commune, l.biens, MOT_STATUT[l.statut], l.officielle, l.banId, score(l.score), l.parcelle,
    l.statut === 'certain' ? '' : l.motif, l.texteRapproche === l.ecriture ? '' : l.texteRapproche]);
  return `﻿${[tete, ...corps].map((x) => x.map(csv).join(';')).join('\n')}\n`;
}
/** Le CSV des réunions : une ligne par écriture réunie. PUR. */
export function csvReunions(r: RapportEssai): string {
  const tete = ['Adresse officielle', 'Identifiant BAN', 'Biens au total', 'Déjà une seule copropriété', 'Écriture réunie', 'Biens de cette écriture'];
  const corps = r.reunions.flatMap((x) => x.ecritures.map((y) => [x.officielle, x.banId, x.biens, x.dejaUneCopropriete ? 'oui' : 'non', y.ecriture, y.biens]));
  return `﻿${[tete, ...corps].map((x) => x.map(csv).join(';')).join('\n')}\n`;
}

const h = (s: string | number | null): string => (s === null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** La page HTML lisible par Arno : résumé, réunions, toutes les écritures (à vérifier d'abord). Autonome, sans script ni ressource externe. PUR. */
export function htmlRapport(r: RapportEssai, entete: readonly string[]): string {
  const ligne = (l: LigneEcriture) => `<tr class="${l.statut}"><td>${h(l.ecriture)}${l.texteRapproche !== l.ecriture ? `<div class="petit">rapproché par l’adresse : ${h(l.texteRapproche)}</div>` : ''}</td>`
    + `<td>${h([l.codePostal, l.commune].filter(Boolean).join(' '))}</td><td class="n">${l.biens}</td><td>${h(MOT_STATUT[l.statut])}</td><td>${h(l.officielle)}</td>`
    + `<td class="id">${h(l.banId)}</td><td class="n">${h(score(l.score))}</td><td>${l.statut === 'certain' ? '' : h(l.motif)}</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Essai du stock — adresses officielles</title>
<style>body{font:15px/1.45 -apple-system,system-ui,sans-serif;margin:16px;color:#1c1c1c;background:#fff}h1{font-size:1.3rem}h2{font-size:1.1rem;margin-top:1.6rem}
.petit{color:#666;font-size:.85em}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
th{background:#f4f4f4;position:sticky;top:0}.n{text-align:right;white-space:nowrap}.id{font-family:ui-monospace,Menlo,monospace;font-size:.8rem;white-space:nowrap}
tr.a_verifier td{background:#fff6e5}tr.introuvable td{background:#fdecec}ul{padding-left:1.2rem}.boite{padding:10px 12px;border:1px solid #ddd;border-radius:8px;background:#fafafa}
@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}th{background:#262626}th,td{border-color:#3a3a3a}tr.a_verifier td{background:#3a2e12}tr.introuvable td{background:#3d1d1d}.boite{background:#1e1e1e;border-color:#3a3a3a}.petit{color:#aaa}}</style></head><body>
<h1>Essai du stock — adresses officielles (BAN)</h1><div class="boite">${entete.map((x) => `<div>${h(x)}</div>`).join('')}</div>
<h2>Résumé</h2><ul>
<li><strong>Biens :</strong> ${r.biens.total} — certains ${r.biens.certains}, à vérifier ${r.biens.aVerifier}, introuvables ${r.biens.introuvables}</li>
<li><strong>Écritures :</strong> ${r.ecritures.total} — certaines ${r.ecritures.certaines}, à vérifier ${r.ecritures.aVerifier}, introuvables ${r.ecritures.introuvables}</li>
<li><strong>Copropriétés :</strong> ${r.coproprietes.avant} aujourd’hui → ${r.coproprietes.apres} après rapprochement des seuls cas certains</li>
<li><strong>Regroupements 504 en cours :</strong> ${r.regroupements.length} — absorbés ${r.regroupements.filter((g) => g.absorbe).length}</li></ul>
<h2>Adresses officielles qui réunissent plusieurs écritures (${r.reunions.length})</h2>
${r.reunions.map((x) => `<p><strong>${h(x.officielle)}</strong> <span class="id">${h(x.banId)}</span> — ${x.biens} bien(s)${x.dejaUneCopropriete ? ' <span class="petit">(déjà une seule copropriété)</span>' : ''}</p><ul>${x.ecritures.map((y) => `<li>« ${h(y.ecriture)} » : ${y.biens} bien(s)</li>`).join('')}</ul>`).join('\n')}
<h2>Regroupements 504</h2><ul>${r.regroupements.map((g) => `<li>n° ${g.id} « ${h(g.principale)} » : ${g.absorbe ? `<strong>absorbé</strong> (<span class="id">${h(g.banId)}</span>)` : '<strong>non absorbé</strong>'} — ${h(g.raison)}</li>`).join('')}</ul>
<h2>Toutes les écritures (${r.lignes.length}) — à vérifier et introuvables d’abord</h2>
<table><thead><tr><th>Écriture WIPPIMMO</th><th>Code postal, commune</th><th>Biens</th><th>Statut</th><th>Adresse officielle proposée</th><th>Identifiant BAN</th><th>Score</th><th>Motif</th></tr></thead>
<tbody>${r.lignes.map(ligne).join('\n')}</tbody></table></body></html>
`;
}
