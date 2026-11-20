import { immeubleDuBien } from '../gestion/copropriete';
import { adresseImmeuble, cleImmeuble } from '../gestion/syndics';
import type { RapprochementComplet } from './banRepo';

/**
 * ══ 🔴🔴 UNE SEULE ADRESSE OFFICIELLE PAR ADRESSE RÉELLE — LE PLAN D'UNIFICATION DU STOCK (Arno, 20/11/2026, « Adresse officielle BAN », lot 5). PUR. ═══
 *
 * LA DÉCISION D'ARNO (20/11/2026) : « il ne faut qu'une seule adresse, celle de l'auto-complétion unifiée ; on unifie toutes les adresses identiques en une
 * seule adresse officielle ». Les variantes d'écriture ne sont plus des adresses NULLE PART : elles deviennent des « écritures » (trace seulement).
 *
 * CE PLAN NE LIT NI N'ÉCRIT RIEN : il reçoit le stock (biens et leur rapprochement par le module unique, copropriétés, adresses secondaires, syndics,
 * AG, contacts, bâtiments, digicodes en vigueur, regroupements 504) et rend ce que `--appliquer` ferait — c'est ce que montre `--essai`. Les règles :
 *   · chaque bien reçoit son rapprochement (certain : appliqué ; à vérifier / introuvable : enregistré avec son statut, pour la file du lot 6, sans
 *     rattachement automatique) ;
 *   · les lignes de la liste (une copropriété, ou un immeuble encore « fiche à créer ») qui partagent une adresse officielle CERTAINE forment un même
 *     immeuble : une seule copropriété ; ses écritures d'origine deviennent des adresses de sorte « écriture » ; une autre adresse officielle de l'immeuble
 *     (43 avenue Marceau avec la rue de Normandie) reste une « adresse » ;
 *   · deux copropriétés ENREGISTRÉES réunies : celle qui a le syndic (sinon le plus de données, sinon le plus de biens) reçoit l'autre — ses adresses,
 *     son syndic, ses AG, ses habitants et gardiens, ses bâtiments la suivent, sans perte. Un CONFLIT (deux syndics différents, deux noms différents…) :
 *     rien n'est écrasé, la réunion n'est pas faite, elle est signalée « à trancher » ;
 *   · DIGICODES : un seul bloc par adresse officielle ; des codes identiques sont fusionnés, des codes différents tous gardés et « à trancher » (avec
 *     l'écriture d'origine de chacun) ; aucun code n'est supprimé ;
 *   · les regroupements 504 en cours dont toutes les écritures ont la même adresse officielle sont ABSORBÉS (leurs adresses passent en « écriture »).
 */

export interface BienStock { id: number; immeuble: string | null; adresse: string | null; codePostal: string | null; commune: string | null }
export interface AdresseCoproStock { id: number | null; coproId: number; cle: string; libelle: string; codePostal: string | null; commune: string | null; principale: boolean; sorte: 'adresse' | 'ecriture' }
export interface CoproStock {
  id: number; cle: string; libelle: string; nom: string | null; banId: string | null;
  syndic: { id: number; nom: string } | null; ag: number; contacts: number; batiments: number;
}
export interface DigicodeEnVigueur { adresseCle: string; place: string; code: string }
export interface RegroupementStock { id: number; coproId: number; regroupees: string[] }
export interface EntreeUnification {
  biens: readonly BienStock[];
  rapprochementDesBiens: ReadonlyMap<number, RapprochementComplet>;
  copros: readonly CoproStock[];
  /** les adresses des copropriétés ENREGISTRÉES : la principale (id null) et les secondaires en cours, avec leur rapprochement */
  adressesCopro: readonly AdresseCoproStock[];
  rapprochementDesAdresses: ReadonlyMap<string, RapprochementComplet>;
  digicodes: readonly DigicodeEnVigueur[];
  regroupements: readonly RegroupementStock[];
  /** les autres données rangées par clé d'adresse (AG des immeubles 377, bâtiments, refus de rattachement, immeubles 396) : nombre par clé */
  autresParCle: ReadonlyMap<string, Record<string, number>>;
}

export type ActionUnification =
  | { sorte: 'ban_principale'; coproId: number; banId: string; libelle: string }
  | { sorte: 'ban_adresse'; adresseId: number; coproId: number; cle: string; banId: string; devient: 'adresse' | 'ecriture' }
  | { sorte: 'creer_copro'; cle: string; libelle: string; banId: string }
  | { sorte: 'ajouter_ecriture'; coproCle: string; cle: string; libelle: string; banId: string; biens: number }
  | { sorte: 'reunir_copro'; cibleId: number; absorbeeId: number; syndic: boolean; ag: number; contacts: number; batiments: number; adresses: number }
  | { sorte: 'absorber_504'; regroupementId: number; coproId: number };

export interface DigicodeUnifie { place: string; statut: 'fusionne' | 'a_trancher' | 'seul'; codes: { code: string; ecritures: string[] }[] }
export interface Immeuble {
  /** l'adresse officielle principale (libellé) et toutes les adresses officielles de l'immeuble */
  officielle: string; banIds: string[]; adresses: string[];
  /** les lignes de la liste aujourd'hui (clés), et les copropriétés enregistrées qu'elles portent */
  lignes: string[]; coprosEnregistrees: number[];
  /** la copropriété qui portera l'immeuble : un id, « à créer » (aucune n'est enregistrée), ou rien (une seule ligne, rien à réunir) */
  cible: number | 'a_creer' | null;
  ecritures: { ecriture: string; biens: number }[];
  biens: number;
  actions: ActionUnification[];
  conflits: string[];
  digicodes: DigicodeUnifie[];
  autres: Record<string, number>;
}
export interface PlanUnification {
  biens: { total: number; certains: number; aVerifier: number; introuvables: number };
  coproprietes: { avant: number; apres: number };
  immeubles: Immeuble[];
  /** les immeubles qui changent (réunion, écritures, digicodes à trancher, conflits) — ce que l'essai montre d'abord */
  changeants: number;
  actions: Record<ActionUnification['sorte'], number>;
  conflits: number;
  digicodes: { fusionnes: number; aTrancher: number };
  regroupements: { absorbes: number; nonAbsorbes: { id: number; raison: string }[] };
}

const certainBan = (r: RapprochementComplet | undefined): string | null => (r?.statut === 'certain' && r.ban !== null ? r.ban.id : null);
const libelleBan = (r: RapprochementComplet): string => adresseImmeuble(r.ban!.libelle, r.codePostal, r.ban!.commune);

/** LE PLAN. PUR. */
export function planUnification(e: EntreeUnification): PlanUnification {
  // ── ① les lignes de la liste aujourd'hui : une clé d'adresse secondaire en cours est rangée sous sa copropriété (règle de listerCoproprietes)
  const coproParId = new Map(e.copros.map((c) => [c.id, c]));
  const coproParCle = new Map(e.copros.map((c) => [c.cle, c]));
  const principaleDe = new Map<string, string>();
  for (const a of e.adressesCopro) if (!a.principale) { const c = coproParId.get(a.coproId); if (c !== undefined && !principaleDe.has(a.cle)) principaleDe.set(a.cle, c.cle); }
  const ligneDe = (k: string): string => principaleDe.get(k) ?? k;
  const biensParLigne = new Map<string, BienStock[]>();
  for (const b of e.biens) {
    const k = cleImmeuble(immeubleDuBien(b));
    if (k === '') continue;
    biensParLigne.set(ligneDe(k), [...(biensParLigne.get(ligneDe(k)) ?? []), b]);
  }
  const lignes = new Set<string>([...biensParLigne.keys(), ...e.copros.filter((c) => !principaleDe.has(c.cle)).map((c) => c.cle)]);

  // ── ② les adresses officielles CERTAINES de chaque ligne (biens et adresses enregistrées), puis l'union des lignes qui en partagent une
  const bansDeLigne = new Map<string, Map<string, { libelle: string; biens: number }>>();
  const ajouterBan = (ligne: string, r: RapprochementComplet | undefined, biens: number) => {
    const id = certainBan(r);
    if (id === null) return;
    const m = bansDeLigne.get(ligne) ?? new Map<string, { libelle: string; biens: number }>();
    const x = m.get(id) ?? { libelle: libelleBan(r!), biens: 0 };
    x.biens += biens; m.set(id, x); bansDeLigne.set(ligne, m);
  };
  for (const [ligne, bs] of biensParLigne) for (const b of bs) ajouterBan(ligne, e.rapprochementDesBiens.get(b.id), 1);
  for (const a of e.adressesCopro) ajouterBan(ligneDe(a.cle), e.rapprochementDesAdresses.get(a.cle), 0);
  const parent = new Map<string, string>();
  const racine = (x: string): string => { let r = x; while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!; return r; };
  for (const l of lignes) parent.set(`L:${l}`, `L:${l}`);
  for (const [l, m] of bansDeLigne) for (const id of m.keys()) { if (!parent.has(`B:${id}`)) parent.set(`B:${id}`, `B:${id}`); const a = racine(`L:${l}`); const b = racine(`B:${id}`); if (a !== b) parent.set(a, b); }
  const groupes = new Map<string, string[]>();
  for (const l of lignes) { const r = racine(`L:${l}`); groupes.set(r, [...(groupes.get(r) ?? []), l]); }

  // ── ③ chaque immeuble : sa cible, ses actions, ses conflits, ses digicodes
  const immeubles: Immeuble[] = [];
  for (const ls of groupes.values()) {
    const bans = new Map<string, { libelle: string; biens: number }>();
    for (const l of ls) for (const [id, x] of bansDeLigne.get(l) ?? []) { const y = bans.get(id) ?? { libelle: x.libelle, biens: 0 }; y.biens += x.biens; bans.set(id, y); }
    const biens = ls.flatMap((l) => biensParLigne.get(l) ?? []);
    const enregistrees = ls.map((l) => coproParCle.get(l)).filter((c): c is CoproStock => c !== undefined);
    const ecrituresMap = new Map<string, number>();
    for (const b of biens) ecrituresMap.set(immeubleDuBien(b), (ecrituresMap.get(immeubleDuBien(b)) ?? 0) + 1);
    const ecritures = [...ecrituresMap].map(([ecriture, n]) => ({ ecriture, biens: n })).sort((a, b) => b.biens - a.biens || a.ecriture.localeCompare(b.ecriture, 'fr'));
    const actions: ActionUnification[] = [];
    const conflits: string[] = [];
    // l'adresse officielle principale : celle de l'adresse principale de la copropriété cible si elle est certaine, sinon celle qui porte le plus de biens
    const ordre = [...bans].sort((a, b) => b[1].biens - a[1].biens || a[1].libelle.localeCompare(b[1].libelle, 'fr', { numeric: true }));
    let cible: Immeuble['cible'] = null;
    if (bans.size > 0) {
      if (enregistrees.length === 0) cible = ls.length > 1 ? 'a_creer' : null;
      else {
        const rang = (c: CoproStock) => [c.syndic !== null ? 1 : 0, c.ag + c.contacts + c.batiments + (c.nom ? 1 : 0), (biensParLigne.get(c.cle) ?? []).length];
        const triees = [...enregistrees].sort((a, b) => { const x = rang(a); const y = rang(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || a.id - b.id; });
        cible = triees[0].id;
        for (const autre of triees.slice(1)) {
          const t = triees[0];
          const motifs = [
            ...(t.syndic !== null && autre.syndic !== null && t.syndic.id !== autre.syndic.id ? [`deux syndics différents (${t.syndic.nom} / ${autre.syndic.nom})`] : []),
            ...((t.nom ?? '').trim() !== '' && (autre.nom ?? '').trim() !== '' && t.nom!.trim() !== autre.nom!.trim() ? [`deux noms différents (« ${t.nom} » / « ${autre.nom} »)`] : []),
          ];
          if (motifs.length > 0) { conflits.push(`Réunir « ${autre.libelle} » dans « ${t.libelle} » : ${motifs.join(' ; ')} — à trancher, rien n’est réuni.`); continue; }
          actions.push({ sorte: 'reunir_copro', cibleId: t.id, absorbeeId: autre.id, syndic: autre.syndic !== null && t.syndic === null, ag: autre.ag, contacts: autre.contacts,
            batiments: autre.batiments, adresses: e.adressesCopro.filter((a) => a.coproId === autre.id).length });
        }
      }
    }
    const cibleCopro = typeof cible === 'number' ? coproParId.get(cible)! : null;
    const banPrincipal = cibleCopro !== null ? (certainBan(e.rapprochementDesAdresses.get(cibleCopro.cle)) ?? ordre[0]?.[0] ?? null) : ordre[0]?.[0] ?? null;
    if (cibleCopro !== null && banPrincipal !== null && cibleCopro.banId !== banPrincipal) {
      actions.push({ sorte: 'ban_principale', coproId: cibleCopro.id, banId: banPrincipal, libelle: bans.get(banPrincipal)?.libelle ?? banPrincipal });
    }
    if (cible === 'a_creer' && banPrincipal !== null) {
      const l0 = [...ls].sort((a, b) => (biensParLigne.get(b) ?? []).length - (biensParLigne.get(a) ?? []).length || a.localeCompare(b))[0];
      actions.push({ sorte: 'creer_copro', cle: l0, libelle: immeubleDuBien((biensParLigne.get(l0) ?? [])[0] ?? { immeuble: l0 }), banId: banPrincipal });
    }
    // les adresses enregistrées : leur adresse officielle, et leur sorte (« écriture » dès que leur adresse officielle est déjà portée)
    if (bans.size > 0) {
      const portees = new Set<string>(banPrincipal === null ? [] : [banPrincipal]);
      const coprosDuGroupe = new Set(enregistrees.map((c) => c.id));
      for (const a of e.adressesCopro.filter((x) => coprosDuGroupe.has(x.coproId) && !x.principale)) {
        const id = certainBan(e.rapprochementDesAdresses.get(a.cle));
        if (id === null || a.id === null) continue;
        const devient = portees.has(id) ? 'ecriture' : 'adresse';
        portees.add(id);
        actions.push({ sorte: 'ban_adresse', adresseId: a.id, coproId: a.coproId, cle: a.cle, banId: id, devient });
      }
      // les écritures des biens qui ne sont encore ni la copropriété ni l'une de ses adresses : ajoutées en « écriture », pour que leurs biens la rejoignent
      const coproCle = cibleCopro?.cle ?? (actions.find((x) => x.sorte === 'creer_copro') as { cle: string } | undefined)?.cle ?? null;
      if (coproCle !== null) {
        const connues = new Set([...enregistrees.map((c) => c.cle), ...e.adressesCopro.filter((a) => coprosDuGroupe.has(a.coproId)).map((a) => a.cle), coproCle]);
        const parCle = new Map<string, { libelle: string; biens: number; banId: string }>();
        for (const b of biens) {
          const k = cleImmeuble(immeubleDuBien(b));
          const id = certainBan(e.rapprochementDesBiens.get(b.id));
          if (connues.has(k) || id === null) continue;
          const x = parCle.get(k) ?? { libelle: immeubleDuBien(b), biens: 0, banId: id };
          x.biens++; parCle.set(k, x);
        }
        for (const [k, x] of parCle) actions.push({ sorte: 'ajouter_ecriture', coproCle, cle: k, libelle: x.libelle, banId: x.banId, biens: x.biens });
      }
      for (const g of e.regroupements.filter((r) => coprosDuGroupe.has(r.coproId))) {
        if (g.regroupees.every((x) => certainBan(e.rapprochementDesAdresses.get(cleImmeuble(x))) === banPrincipal)) actions.push({ sorte: 'absorber_504', regroupementId: g.id, coproId: g.coproId });
      }
    }
    // les digicodes en vigueur de toutes les clés de l'immeuble, par place (commun, bâtiment) et par adresse officielle
    const clesDuGroupe = new Set<string>([...ls, ...e.adressesCopro.filter((a) => ls.includes(ligneDe(a.cle))).map((a) => a.cle), ...biens.map((b) => cleImmeuble(immeubleDuBien(b)))]);
    const digicodes: DigicodeUnifie[] = [];
    const banDeCle = (k: string) => certainBan(e.rapprochementDesAdresses.get(k)) ?? certainBan(e.rapprochementDesBiens.get(biens.find((b) => cleImmeuble(immeubleDuBien(b)) === k)?.id ?? -1)) ?? `cle:${k}`;
    const parPlace = new Map<string, Map<string, string[]>>();
    for (const d of e.digicodes.filter((x) => clesDuGroupe.has(x.adresseCle))) {
      const p = `${banDeCle(d.adresseCle)}|${d.place}`;
      const m = parPlace.get(p) ?? new Map<string, string[]>();
      m.set(d.code, [...(m.get(d.code) ?? []), d.adresseCle]); parPlace.set(p, m);
    }
    for (const [p, m] of parPlace) {
      const ecrituresDe = [...m.values()].flat();
      digicodes.push({ place: p.split('|')[1] === '' ? 'commun' : `bâtiment ${p.split('|')[1].toUpperCase()}`,
        statut: m.size > 1 ? 'a_trancher' : ecrituresDe.length > 1 ? 'fusionne' : 'seul', codes: [...m].map(([code, ecr]) => ({ code, ecritures: ecr })) });
    }
    const autres: Record<string, number> = {};
    for (const k of clesDuGroupe) for (const [n, v] of Object.entries(e.autresParCle.get(k) ?? {})) autres[n] = (autres[n] ?? 0) + v;
    immeubles.push({ officielle: banPrincipal === null ? (ls[0] ?? '') : (bans.get(banPrincipal)?.libelle ?? banPrincipal), banIds: [...bans.keys()],
      adresses: ordre.map(([, x]) => x.libelle), lignes: ls, coprosEnregistrees: enregistrees.map((c) => c.id), cible, ecritures, biens: biens.length,
      actions, conflits, digicodes, autres });
  }

  // ── ④ les totaux
  const statuts = e.biens.filter((b) => immeubleDuBien(b) !== '').map((b) => e.rapprochementDesBiens.get(b.id)?.statut ?? 'introuvable');
  const nbActions = (s: ActionUnification['sorte']) => immeubles.reduce((n, i) => n + i.actions.filter((a) => a.sorte === s).length, 0);
  const changeants = immeubles.filter((i) => i.actions.some((a) => a.sorte !== 'ban_principale' && !(a.sorte === 'ban_adresse' && a.devient === 'adresse')) || i.conflits.length > 0 || i.digicodes.some((d) => d.statut !== 'seul'));
  const absorbes = new Set(immeubles.flatMap((i) => i.actions.filter((a) => a.sorte === 'absorber_504').map((a) => (a as { regroupementId: number }).regroupementId)));
  return {
    biens: { total: statuts.length, certains: statuts.filter((s) => s === 'certain').length, aVerifier: statuts.filter((s) => s === 'a_verifier').length, introuvables: statuts.filter((s) => s === 'introuvable').length },
    coproprietes: { avant: lignes.size, apres: immeubles.length },
    immeubles: immeubles.sort((a, b) => Number(changeants.includes(b)) - Number(changeants.includes(a)) || b.biens - a.biens || a.officielle.localeCompare(b.officielle, 'fr', { numeric: true })),
    changeants: changeants.length,
    actions: { ban_principale: nbActions('ban_principale'), ban_adresse: nbActions('ban_adresse'), creer_copro: nbActions('creer_copro'), ajouter_ecriture: nbActions('ajouter_ecriture'),
      reunir_copro: nbActions('reunir_copro'), absorber_504: nbActions('absorber_504') },
    conflits: immeubles.reduce((n, i) => n + i.conflits.length, 0),
    digicodes: { fusionnes: immeubles.reduce((n, i) => n + i.digicodes.filter((d) => d.statut === 'fusionne').length, 0), aTrancher: immeubles.reduce((n, i) => n + i.digicodes.filter((d) => d.statut === 'a_trancher').length, 0) },
    regroupements: { absorbes: absorbes.size, nonAbsorbes: e.regroupements.filter((g) => !absorbes.has(g.id)).map((g) => ({ id: g.id, raison: 'ses écritures n’ont pas toutes, avec certitude, l’adresse officielle principale de la copropriété' })) },
  };
}

// ══ LES RENDUS — le résumé (texte) et la page lisible (HTML autonome, sans script ni ressource externe) ═══════════════════════════════════════════════

const MOT_ACTION: Readonly<Record<ActionUnification['sorte'], string>> = {
  ban_principale: 'adresse officielle posée sur la copropriété', ban_adresse: 'adresse officielle posée sur une adresse enregistrée',
  creer_copro: 'copropriété créée (immeuble connu seulement par ses biens, plusieurs écritures)', ajouter_ecriture: 'écriture d’origine ajoutée (ses biens rejoignent la copropriété)',
  reunir_copro: 'copropriétés enregistrées réunies', absorber_504: 'regroupement 504 absorbé',
};
export function texteResumeUnification(p: PlanUnification, entete: readonly string[]): string {
  return [...entete, '',
    `BIENS : ${p.biens.total} — certains ${p.biens.certains} (appliqués), à vérifier ${p.biens.aVerifier}, introuvables ${p.biens.introuvables} (enregistrés pour la file du lot 6)`,
    `COPROPRIÉTÉS (lignes de la liste) : ${p.coproprietes.avant} aujourd’hui → ${p.coproprietes.apres} après unification ; ${p.changeants} immeuble(s) changent`,
    'ACTIONS :', ...Object.entries(p.actions).map(([k, n]) => `  ${MOT_ACTION[k as ActionUnification['sorte']]} : ${n}`),
    `CONFLITS À TRANCHER (rien n’est écrasé) : ${p.conflits}`,
    `DIGICODES : ${p.digicodes.fusionnes} place(s) aux codes identiques fusionnés, ${p.digicodes.aTrancher} place(s) aux codes différents « à trancher » (aucun supprimé)`,
    `REGROUPEMENTS 504 : ${p.regroupements.absorbes} absorbé(s)${p.regroupements.nonAbsorbes.length ? ` ; non absorbés : ${p.regroupements.nonAbsorbes.map((x) => `n° ${x.id}`).join(', ')}` : ''}`,
    '', 'IMMEUBLES QUI CHANGENT :',
    ...p.immeubles.slice(0, p.changeants).flatMap((i) => [`  ${i.officielle} — ${i.biens} bien(s) — ${i.cible === 'a_creer' ? 'copropriété à créer' : i.cible === null ? 'rien à réunir' : `copropriété n° ${i.cible}`}`,
      ...i.actions.filter((a) => a.sorte !== 'ban_principale' && !(a.sorte === 'ban_adresse' && a.devient === 'adresse')).map((a) => `      · ${MOT_ACTION[a.sorte]}${'cle' in a ? ` : « ${a.cle} »` : ''}${a.sorte === 'ban_adresse' ? ` → devient une ${a.devient === 'ecriture' ? 'écriture d’origine' : 'adresse'}` : ''}${a.sorte === 'reunir_copro' ? ` : n° ${a.absorbeeId} → n° ${a.cibleId}` : ''}`),
      ...i.conflits.map((c) => `      ⚠ ${c}`),
      ...i.digicodes.filter((d) => d.statut !== 'seul').map((d) => `      · digicode ${d.place} : ${d.statut === 'fusionne' ? 'codes identiques fusionnés' : 'À TRANCHER'} — ${d.codes.map((c) => `${c.code} (${c.ecritures.join(', ')})`).join(' / ')}`)]),
  ].join('\n');
}

const h = (s: string | number | null | undefined): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function htmlUnification(p: PlanUnification, entete: readonly string[]): string {
  const bloc = (i: Immeuble) => `<section class="imm"><h3>${h(i.officielle)} <span class="petit">— ${i.biens} bien(s) — ${i.cible === 'a_creer' ? 'copropriété à créer' : i.cible === null ? 'une seule ligne' : `copropriété n° ${i.cible}`}</span></h3>
${i.adresses.length > 1 ? `<p><strong>Adresses officielles :</strong> ${i.adresses.map(h).join(' · ')}</p>` : ''}
<p><strong>Écritures d’origine (${i.ecritures.length}) :</strong> ${i.ecritures.map((x) => `« ${h(x.ecriture)} » (${x.biens})`).join(' · ') || '—'}</p>
${i.actions.length ? `<ul>${i.actions.map((a) => `<li>${h(MOT_ACTION[a.sorte])}${'cle' in a ? ` : « ${h(a.cle)} »${a.sorte === 'ban_adresse' ? ` → ${a.devient === 'ecriture' ? 'écriture' : 'adresse'}` : ''}` : ''}${a.sorte === 'reunir_copro' ? ` : n° ${a.absorbeeId} → n° ${a.cibleId} (syndic ${a.syndic ? 'suit' : '—'}, AG ${a.ag}, contacts ${a.contacts}, bâtiments ${a.batiments}, adresses ${a.adresses})` : ''}${a.sorte === 'ban_principale' ? ` : ${h(a.libelle)}` : ''}</li>`).join('')}</ul>` : ''}
${i.conflits.map((c) => `<p class="conflit">⚠ ${h(c)}</p>`).join('')}
${i.digicodes.length ? `<p><strong>Digicodes :</strong></p><ul>${i.digicodes.map((d) => `<li class="${d.statut}">${h(d.place)} — ${d.statut === 'fusionne' ? 'codes identiques fusionnés' : d.statut === 'a_trancher' ? '<strong>à trancher</strong>' : 'un seul code'} : ${d.codes.map((c) => `${h(c.code)} <span class="petit">(${c.ecritures.map(h).join(', ')})</span>`).join(' / ')}</li>`).join('')}</ul>` : ''}
${Object.keys(i.autres).length ? `<p class="petit">Autres données rangées par adresse : ${Object.entries(i.autres).map(([k, v]) => `${h(k)} ${v}`).join(', ')}</p>` : ''}</section>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unification des adresses — essai</title>
<style>body{font:15px/1.45 -apple-system,system-ui,sans-serif;margin:16px;color:#1c1c1c;background:#fff;max-width:1100px}h1{font-size:1.3rem}h2{font-size:1.1rem;margin-top:1.6rem}h3{font-size:1rem;margin:0 0 .3rem}
.petit{color:#666;font-size:.85em;font-weight:400}.boite{padding:10px 12px;border:1px solid #ddd;border-radius:8px;background:#fafafa}.imm{border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin:.6rem 0}
.conflit,.a_trancher{color:#9a4b00;font-weight:700}.fusionne{color:#1d6b35}ul{margin:.2rem 0;padding-left:1.2rem}
@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}.boite{background:#1e1e1e;border-color:#3a3a3a}.imm{border-color:#3a3a3a}.petit{color:#aaa}.conflit,.a_trancher{color:#f0a64a}.fusionne{color:#7fd39a}}</style></head><body>
<h1>Unification des adresses officielles — essai (rien n’est écrit)</h1><div class="boite">${entete.map((x) => `<div>${h(x)}</div>`).join('')}</div>
<h2>Résumé</h2><pre style="white-space:pre-wrap">${h(texteResumeUnification(p, []).split('\nIMMEUBLES QUI CHANGENT')[0])}</pre>
<h2>Immeubles qui changent (${p.changeants})</h2>${p.immeubles.slice(0, p.changeants).map(bloc).join('\n')}
<h2>Les autres immeubles (${p.immeubles.length - p.changeants}) — l’adresse officielle seulement posée</h2>
<details><summary>Afficher</summary>${p.immeubles.slice(p.changeants).map(bloc).join('\n')}</details></body></html>
`;
}
