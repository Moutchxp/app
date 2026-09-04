import type { CSSProperties, ReactNode } from 'react';
import { jourFrParis } from '../../../../lib/permis/horodatageParis'; // LOT 49 : « décidé le … » en heure de Paris
import {
  projeterDansBoite, boiteEnglobanteRotee, clicVersBoite, type Boite, type PointLambert, type VerdictCalage, type VerdictVraisemblance, type Debordement,
} from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite, ProjectionIgnoree, PolygoneBdTopo, ProvenanceEmprise } from '../../../../lib/permis/empriseReconstruiteRepo';
import { libelleBatiment, type VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import { nomAffichageCorps } from '../../../../lib/permis/nomCorps'; // NOM-1 — le SEUL décideur du nom d'affichage d'un corps
import { estTracable, type FamillePlan } from '../../../../lib/permis/planMasse';
import { estFuturBati } from '../../../../lib/permis/etatBati';
import { estStatuable, TOLERANCE_RECOUVREMENT_TOTAL_PCT, type EtatStatutPolygone, type PolygoneRecouvert } from '../../../../lib/permis/polygoneStatut'; // RATT-1 (2) : statut décidé ; RATT-5 : recouvert + taux ; RATT-6 : mixte
import { rattrapageVide, type ApercuRattrapage } from '../../../../lib/permis/rattrapage'; // NOM-2 — aperçu du rattrapage (noms + statuts)
import { repereDepuisIndex, projeterLambertDansSchema, type SchemaEmpreinte } from '../../../../lib/permis/affectationSchema'; // AFF-2 : projetée au MÊME cadre que l'origine

/** PROJ-3g — libellé lisible d'une famille (le MOT porte l'info, jamais la couleur seule). PUR. */
export function libelleFamille(f: FamillePlan): string {
  return f === 'masse' ? 'plan de masse' : f === 'etage' ? 'plan d’étage' : f === 'cerfa' ? 'Cerfa (formulaire)' : 'coupe / élévation';
}

/** PROJ-3g/3j — message du VERROU métier : pourquoi on ne peut pas tracer ici (jamais un bouton grisé muet). null si traçable. Seules
 *  les COUPES/FAÇADES (élévations) et le CERFA (formulaire, PROV-2 a) verrouillent ; un plan d'étage est traçable. PUR. */
export function messageVerrou(f: FamillePlan | null): string | null {
  if (estTracable(f)) return null;
  const quoi = f === 'coupe' ? 'une coupe ou une façade (vue en élévation)'
    : f === 'cerfa' ? 'le formulaire Cerfa (à consulter, pas à tracer)'
    : 'une vue qui n’est pas un plan';
  return `Cette vue est ${quoi} : on ne peut y tracer une emprise, qui se trace sur une vue en plan (plan de masse ou d’étage).`;
}

/** PROJ-3j — RAPPEL informatif (jamais un avertissement, jamais un blocage) porté par une entrée de famille « étage ». null sinon. PUR. */
export function noteFamille(f: FamillePlan | null): string | null {
  return f === 'etage' ? 'Plan d’étage : l’emprise peut différer du rez-de-chaussée (retraits, porte-à-faux).' : null;
}

/**
 * PROJ-2 — RENDU PUR (aucun état, aucun effet → testable en Node via renderToStaticMarkup) de l'écran de tracé d'emprise.
 * Tout ce qui décide (similitude, aire, résidu, vraisemblance) vit dans le module pur `calageEmprise` ; ici on AFFICHE.
 * 🔴 Chaque emprise est étiquetée « reconstitution » avec son résidu de calage — jamais présentée comme une mesure.
 */

const muted: CSSProperties = { color: 'var(--color-svv-muted)', fontSize: 13 };
const carte: CSSProperties = { border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.6rem .8rem', background: '#fff' };

/** Nombre en français, sans arrondi trompeur d'un calcul (arrondi d'AFFICHAGE seulement). */
export function fmtM2(x: number): string { return `${Math.round(x).toLocaleString('fr-FR')} m²`; }
export function fmtM(x: number): string { return `${x.toFixed(2).replace('.', ',')} m`; }

export type EtatChargementTrace = 'chargement' | 'erreur' | 'ok';
export type AffichageTrace = 'chargement' | 'indisponible' | 'aucun-batiment' | 'pret';
/**
 * PROJ-3b-fix — DÉCIDE ce que le bloc de tracé doit montrer, en séparant TROIS états de chargement. Règle : « aucun bâtiment »
 * n'est légitime QUE si le chargement a RÉUSSI (`etat === 'ok'`) et que la liste est vraiment vide. Un chargement en cours →
 * 'chargement' ; un échec → 'indisponible' (JAMAIS « 0 bâtiment » : une panne ne doit pas s'afficher comme une donnée). PUR.
 */
export function affichageTrace(etat: EtatChargementTrace, nbBatiments: number): AffichageTrace {
  if (etat === 'chargement') return 'chargement';
  if (etat === 'erreur') return 'indisponible';
  return nbBatiments === 0 ? 'aucun-batiment' : 'pret';
}

// PROJ-3f — une pièce candidate porte ses PLANCHES (pages hors cartouche) calculées côté serveur, chacune avec une échelle indicative.
// PROJ-3m — chaque PLANCHE porte sa traçabilité PAR PAGE (une pièce PC3 « coupe » peut mêler coupes et plans de niveau).
//   LOT 62 — `origine` : 'texte' (best-of textuel, comportement d'avant) ou 'image' (repérée par analyse d'image, présence seule).
export interface Planche { page: number; echelle: string | null; tracable?: boolean; famille?: FamillePlan; ambigu?: boolean; origine?: 'texte' | 'image' }
export interface PiecePlan { id: number; nomFichier: string; propose?: boolean; famille?: FamillePlan | null; planches?: Planche[]; confirme?: boolean; niveaux?: string[] }

/** PROJ-3d — sépare les pièces en « proposées » (plan de masse) / « autres », en conservant l'ordre reçu (le serveur classe déjà). PUR. */
export function grouperPieces<T extends { propose?: boolean }>(pieces: T[]): { proposees: T[]; autres: T[] } {
  return { proposees: pieces.filter((p) => p.propose), autres: pieces.filter((p) => !p.propose) };
}

/** Libellé d'une option de pièce proposée : nom + nombre de planches détectées. PUR. */
export function etiquettePiecePlan(p: PiecePlan): string {
  const n = p.planches?.length ?? 0;
  return n > 0 ? `${p.nomFichier} — ${n} planche${n > 1 ? 's' : ''}` : p.nomFichier;
}

/**
 * PROJ-3d — SÉLECTEUR de pièce du tracé : les « Plans de masse proposés » d'abord (déjà triés serveur), puis TOUTES les autres
 * pièces (repli garanti — jamais masquées ni inaccessibles). Un plan proposé confirmé montre sa page + son échelle dans le libellé.
 * PUR (renderToStaticMarkup) : le choix ne fait que remonter l'id ; l'auto-remplissage de la page vit dans la Vue.
 */
export function SelecteurPiecePlan({ pieces, pieceId, onChoisir }: { pieces: PiecePlan[]; pieceId: number | null; onChoisir: (id: number) => void }) {
  const { proposees, autres } = grouperPieces(pieces);
  return (
    <select value={pieceId ?? ''} onChange={(e) => onChoisir(Number(e.target.value) || 0)} aria-label="Pièce à tracer (plans de masse proposés en tête)" style={{ maxWidth: 320, fontSize: 12 }}>
      {pieces.length === 0 && <option value="">aucune pièce PDF</option>}
      {proposees.length > 0 && (
        <optgroup label="Plans de masse proposés">
          {proposees.map((p) => <option key={p.id} value={p.id}>{etiquettePiecePlan(p)}</option>)}
        </optgroup>
      )}
      {autres.length > 0 && (
        <optgroup label="Toutes les autres pièces">
          {autres.map((p) => <option key={p.id} value={p.id}>{p.nomFichier}</option>)}
        </optgroup>
      )}
    </select>
  );
}

// ── PROJ-3e — BANDE DE PLANS : l'unité manipulée est LE PLAN (une page précise d'une pièce), plus « pièce » + « n° de page ». ──
export interface Plan { pieceId: number; page: number; nomFichier: string; echelle: string | null; confirme: boolean; famille: FamillePlan; tracable: boolean; ambigu: boolean; niveaux?: string[]; origine: 'texte' | 'image' }

/**
 * Construit la bande à feuilleter à partir des pièces déjà CLASSÉES (ordre masse → étage → coupe, PAS recalculé). PROJ-3f : un
 * plan = une PAGE ; une pièce proposée est ÉCLATÉE en une entrée par PLANCHE (pages hors cartouche, calculées serveur), sinon REPLI
 * page 1. PROJ-3g/3m : chaque entrée porte sa FAMILLE et sa TRAÇABILITÉ PAR PAGE (une planche de niveau d'une pièce PC3 est traçable).
 * Repli (non confirmée) : traçabilité au niveau de la PIÈCE. PUR.
 */
export function construireBandePlans(pieces: PiecePlan[]): Plan[] {
  const out: Plan[] = [];
  for (const p of pieces) {
    const planchesToutes = p.planches ?? [];
    const aImage = planchesToutes.some((pl) => pl.origine === 'image');
    // LOT 62 — on inclut une pièce PROPOSÉE (best-of textuel, comportement d'avant) OU une pièce à ≥1 planche repérée par IMAGE
    //   (même une notice à nom opaque, non proposée par le texte). Les autres restent hors bande (ex. la notice sans planche image).
    if (!p.propose && !aImage) continue;
    const famillePiece: FamillePlan = p.famille ?? 'masse';
    const confirme = planchesToutes.length > 0;
    const aEclater: Planche[] = planchesToutes.length > 0 ? planchesToutes : [{ page: 1, echelle: null }];
    for (const pl of aEclater) {
      const origine: 'texte' | 'image' = pl.origine ?? 'texte';
      const famille = pl.famille ?? famillePiece;
      // LOT 62 — une planche repérée par IMAGE n'est JAMAIS traçable : on sait qu'elle EXISTE, pas que c'est un plan de masse calable.
      const tracable = origine === 'image' ? false : (pl.tracable ?? estTracable(famillePiece));
      out.push({ pieceId: p.id, page: pl.page, nomFichier: p.nomFichier, echelle: pl.echelle, confirme, famille, tracable, ambigu: pl.ambigu ?? false, niveaux: p.niveaux, origine });
    }
  }
  return out;
}

/** Borne un index dans [0 ; n-1] (0 si liste vide). PUR. */
export function bornerIndex(i: number, n: number): number { return n <= 0 ? 0 : Math.min(Math.max(0, i), n - 1); }
export function indexSuivant(i: number, n: number): number { return bornerIndex(i + 1, n); }
export function indexPrecedent(i: number, n: number): number { return bornerIndex(i - 1, n); }

/**
 * LOT PROV-1 (point 1) — CIBLE de la navigation best-of. TOUJOURS `nav:'bestof'` — même quand la bande est VIDE (aucun plan classé,
 * ex. dossier 531). Le plan n'est restauré (`plan`) que s'il en existe un ; bande vide → `plan:null` (la vue best-of montre alors
 * « aucun plan proposé »). C'est CE point qui rend « revenir au best-of » VIVANT : avant, l'appelant sortait tôt sur bande vide et
 * le bouton restait mort (on restait bloqué sur la pièce libre). PUR (testable sans DOM).
 */
export function cibleBestOf(bande: Plan[], cibleIndex: number): { nav: 'bestof'; plan: { index: number; pieceId: number; page: number } | null } {
  if (bande.length === 0) return { nav: 'bestof', plan: null };
  const i = bornerIndex(cibleIndex, bande.length);
  return { nav: 'bestof', plan: { index: i, pieceId: bande[i].pieceId, page: bande[i].page } };
}

/** Libellé lisible d'un plan (nom + n° de page dans la pièce + échelle si lue de façon fiable). PUR. */
export function libellePlan(p: Pick<Plan, 'nomFichier' | 'page' | 'echelle'>): string { return `${p.nomFichier} — page ${p.page}${p.echelle ? ` · échelle ${p.echelle}` : ''}`; }

/**
 * PROJ-3e — changer de plan doit-il DEMANDER CONFIRMATION ? OUI dès qu'un calage ou un tracé est commencé (le travail est attaché
 * à UN plan ; on ne le perd jamais en silence). Sinon la navigation est libre. PUR (testable sans DOM).
 */
export function travailEnCours(nbPaires: number, nbSommets: number): boolean { return nbPaires > 0 || nbSommets > 0; }

/**
 * PROJ-3e — barre de navigation « ‹ précédent / suivant › » d'une bande de plans, avec l'indicateur « plan i sur n » et le libellé
 * lisible du plan courant. Bande vide → renvoie vers le repli (jamais un cul-de-sac). PUR (renderToStaticMarkup).
 */
export function BandePlans({ bande, index, onPrecedent, onSuivant }: { bande: Plan[]; index: number; onPrecedent: () => void; onSuivant: () => void }) {
  if (bande.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>Aucun plan de masse proposé — ouvrez « voir toutes les pièces du dossier » ci-dessous pour en choisir un.</p>;
  }
  const i = bornerIndex(index, bande.length);
  const p = bande[i];
  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .6rem', fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      {/* Le MODE est porté par les MOTS (« Best-of des plans »), jamais par la seule couleur. */}
      <div style={{ fontSize: 12, fontWeight: 700 }}>Best-of des plans proposés</div>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={{ ...btn, opacity: i <= 0 ? 0.4 : 1 }} disabled={i <= 0} onClick={onPrecedent} aria-label="Plan précédent">‹ précédent</button>
        <span style={{ fontSize: 12, fontWeight: 700 }}>plan {i + 1} sur {bande.length}</span>
        <button type="button" style={{ ...btn, opacity: i >= bande.length - 1 ? 0.4 : 1 }} disabled={i >= bande.length - 1} onClick={onSuivant} aria-label="Plan suivant">suivant ›</button>
        {/* PROJ-3g — la FAMILLE est écrite (le mot porte l'info, jamais la couleur seule). */}
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', padding: '.05rem .35rem' }}>{libelleFamille(p.famille)}</span>
        {/* SUITE — les NIVEAUX que porte une planche d'étage (RDC/SSOL/R+n), pour savoir ce qu'on ouvre (une planche multi-niveaux entre une seule fois). */}
        {p.niveaux && p.niveaux.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', padding: '.05rem .35rem' }}>niveaux : {p.niveaux.join(', ')}</span>}
        {/* LOT 62 — ORIGINE distinguée (le mot porte l'info) : « repérée par image » = analyse d'image (présence seule, fiabilité différente du texte) → Arno sait ce qu'il regarde. */}
        {p.origine === 'image' && <span style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', padding: '.05rem .35rem', color: 'var(--color-svv-muted)' }}>repérée par image</span>}
        <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{libellePlan(p)}{p.confirme ? '' : ' (page à confirmer)'}</span>
      </div>
    </div>
  );
}

/** PROJ-3f ① — borne un n° de page (1-based) dans [1 ; nbPages] (nbPages ramené à ≥ 1). PUR. */
export function bornerPage(page: number, nbPages: number): number {
  const n = Math.max(1, nbPages);
  return Math.min(Math.max(1, page), n);
}

/**
 * PROJ-3f ① — NAVIGATION « PIÈCE LIBRE » : feuillette LES PAGES d'une pièce ouverte depuis le repli (indépendante de la bande
 * best-of). En-tête « Pièce : <nom> » + « page i sur n » (mode porté par les MOTS), bornes désactivées, et un retour EXPLICITE au
 * best-of. PUR (renderToStaticMarkup) : les boutons ne font que remonter l'intention ; l'état vit dans la Vue.
 */
export function NavPieceLibre({ nomFichier, page, nbPages, onPagePrecedente, onPageSuivante, onRetourBestOf }: {
  nomFichier: string; page: number; nbPages: number; onPagePrecedente: () => void; onPageSuivante: () => void; onRetourBestOf: () => void;
}) {
  const p = bornerPage(page, nbPages);
  const n = Math.max(1, nbPages);
  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .6rem', fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>Pièce : {nomFichier}</div>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={btn} onClick={onRetourBestOf} aria-label="Revenir au best-of des plans">◂ revenir au best-of</button>
        <button type="button" style={{ ...btn, opacity: p <= 1 ? 0.4 : 1 }} disabled={p <= 1} onClick={onPagePrecedente} aria-label="Page précédente">‹ page précédente</button>
        <span style={{ fontSize: 12, fontWeight: 700 }}>page {p} sur {n}</span>
        <button type="button" style={{ ...btn, opacity: p >= n ? 0.4 : 1 }} disabled={p >= n} onClick={onPageSuivante} aria-label="Page suivante">page suivante ›</button>
      </div>
    </div>
  );
}

export type StatutBatiment = 'tracee' | 'ignoree' | 'attente';
/** PROJ-2b — statut de projection d'UN bâtiment : emprise tracée (prioritaire), sinon ignorée, sinon en attente. PUR. */
export function statutBatiment(corpsId: number, emprises: EmpriseReconstruite[], ignores: ProjectionIgnoree[]): StatutBatiment {
  if (emprises.some((e) => e.corpsId === corpsId)) return 'tracee';
  if (ignores.some((i) => i.corpsId === corpsId)) return 'ignoree';
  return 'attente';
}
const MOT_STATUT: Record<StatutBatiment, string> = { tracee: '✓ emprise tracée', ignoree: '⚠ projection ignorée', attente: '… en attente' };
export function motStatutBatiment(s: StatutBatiment): string { return MOT_STATUT[s]; }

/**
 * PROJ-2b — BANDEAU de projection : dit AVANT le clic ce qui manque (« 2 bâtiments · 1 emprise tracée · 1 en attente »), et
 * NOMME les bâtiments en attente. Vert si passant, rouge sinon. Le mot porte l'info (la couleur n'est jamais seule).
 */
export function BandeauProjection({ verdict }: { verdict: VerdictProjection }) {
  const ok = verdict.peutValider;
  return (
    <div className="svv-card" data-peut-valider={ok} style={{ fontSize: 12, borderColor: ok ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)', background: ok ? 'var(--color-svv-green-soft)' : 'var(--color-svv-red-soft)' }}>
      <div style={{ fontWeight: 700 }}>{ok ? '✓ ' : '✕ '}Projection des emprises — {verdict.libelle}</div>
      {!ok && <div style={{ color: 'var(--color-svv-ink)' }}>En attente : {verdict.manquants.map((m) => libelleBatiment(m)).join(', ')}. Tracez une emprise ou ignorez explicitement la projection pour chacun avant de valider.</div>}
    </div>
  );
}

/**
 * Bandeau de CALAGE : résidu de fit, échelle implicite (« 1:R ») vs déclarée, résidu d'échelle, et le verdict « douteux »
 * avec ses raisons — TOUJOURS affiché, jamais lissé. Sur 2 points le résidu de fit est nul par construction : on le DIT.
 */
export function BandeauCalage({ calage, nbPaires }: { calage: VerdictCalage | null; nbPaires: number }) {
  if (!calage) return <p style={muted}>Calage : posez 2 points (plan ↔ schéma) pour caler le tracé.</p>;
  return (
    <div style={{ ...carte, borderColor: calage.douteux ? 'var(--color-svv-red)' : 'var(--color-svv-line)' }} data-douteux={calage.douteux}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Calage {calage.douteux ? '⚠ douteux' : '✓'}</div>
      <ul style={{ ...muted, margin: 0, paddingLeft: '1.1rem' }}>
        <li>résidu de calage : <strong>{fmtM(calage.residuFitM)}</strong>{nbPaires <= 2 ? ' (calage exact sur 2 points — contrôlé par l’échelle déclarée ou un 3ᵉ repère)' : ''}</li>
        <li>échelle implicite : <strong>1:{Math.round(calage.ratioImplicite)}</strong>{calage.ratioDeclare !== null ? ` · déclarée 1:${Math.round(calage.ratioDeclare)}` : ' · échelle déclarée non saisie'}</li>
        {calage.residuEchelleM !== null && <li>écart d’échelle sur la base : <strong>{fmtM(calage.residuEchelleM)}</strong></li>}
        {calage.raisons.map((r) => <li key={r} style={{ color: 'var(--color-svv-red)' }}>{r}</li>)}
      </ul>
    </div>
  );
}

/** Bandeau de VRAISEMBLANCE : aire vive + comparaison plancher/étages + 🔴 dépassement du terrain (n'empêche pas d'enregistrer). */
export function BandeauVraisemblance({ aireM2, v }: { aireM2: number | null; v: VerdictVraisemblance | null }) {
  return (
    <div style={carte}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Aire {aireM2 !== null ? <strong>{fmtM2(aireM2)}</strong> : <span style={muted}>— (tracez un contour fermé)</span>}</div>
      {v && (
        <ul style={{ ...muted, margin: 0, paddingLeft: '1.1rem' }}>
          {v.messages.map((m) => <li key={m} style={m.startsWith('🔴') ? { color: 'var(--color-svv-red)', fontWeight: 600 } : undefined}>{m}</li>)}
          {v.messages.length === 0 && <li>aucun repère de vraisemblance en base (plancher / étages / terrain non renseignés).</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * REPÈRE « qualité du calage » (PUR) — visible pendant le tracé et après enregistrement. Deux indicateurs INDICATIFS, jamais des
 * verdicts, jamais bloquants :
 *  · ÉCART D'ÉCHELLE : échelle implicite mesurée vs déclarée, en % — réutilise `ecartEchelleRelatif` DÉJÀ calculé dans le pavé de
 *    calage (aucun second calcul) ;
 *  · DÉBORDEMENT : part de l'emprise hors parcelle rattachée (% + m²) + largeur latérale moyenne équivalente. Le chiffre vient du
 *    SERVEUR (géométrie Lambert recalculée) ; ici on ne fait qu'AFFICHER (arrondi d'affichage seulement).
 * Un débordement peut être LÉGITIME (porte-à-faux, balcon, ou parcelle rattachée = une seule des parcelles du permis). On le dit,
 * on ne qualifie jamais le tracé de faux. « bâtiment », pas « corps » ; une emprise est une reconstitution, jamais une mesure.
 */
export function RepereQualiteCalage({ ecartEchelleRelatif, ratioImplicite, ratioDeclare, debordement, contourFerme, parcelleRattachee, origineIgn = false }: {
  ecartEchelleRelatif: number | null; ratioImplicite: number | null; ratioDeclare: number | null;
  debordement: Debordement | null; contourFerme: boolean; parcelleRattachee: boolean; origineIgn?: boolean;
}) {
  const pct1 = (x: number): string => `${(Math.round(x * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const nomOrigine = origineIgn ? 'issue de l’IGN' : 'reconstituée'; // vocabulaire d'origine : IGN adopté vs tracé manuel
  return (
    <div style={carte}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Qualité du calage <span style={muted}>(repères indicatifs, jamais bloquants)</span></div>
      <ul style={{ ...muted, margin: 0, paddingLeft: '1.1rem' }}>
        {/* Écart d'échelle — réutilise ce que le pavé de calage a déjà calculé. Sans objet pour une emprise IGN (ni calage ni échelle). */}
        {origineIgn
          ? <li>calage / écart d’échelle : sans objet pour une emprise issue de l’IGN (aucun calage, aucune échelle de planche).</li>
          : ratioDeclare !== null && ratioImplicite !== null && ecartEchelleRelatif !== null
            ? <li>écart d’échelle : <strong>{pct1(ecartEchelleRelatif * 100)}</strong> (implicite 1:{Math.round(ratioImplicite)} vs déclarée 1:{Math.round(ratioDeclare)})</li>
            : <li>écart d’échelle : échelle déclarée de la planche non saisie — indicateur indisponible.</li>}
        {/* Débordement — géométrie Lambert recalculée côté serveur. Un chiffre présent s'affiche (tracé en cours OU après
            enregistrement) ; sinon on explique pourquoi il est indisponible (pas de parcelle, contour non fermé, calcul en cours). */}
        {debordement !== null
          ? (!debordement.parcelleRattachee
              ? <li>débordement : aucune parcelle rattachée — disponible une fois la parcelle rattachée.</li>
              : (debordement.aireHorsM2 ?? 0) <= 0
                ? <li>hors parcelle : <strong>0 %</strong> — l’emprise {nomOrigine} est entièrement dans la parcelle rattachée.</li>
                : <>
                    <li>hors parcelle : <strong>{pct1(debordement.pctHors ?? 0)}</strong> ({fmtM2(debordement.aireHorsM2 ?? 0)}){debordement.decalageLateralM !== null ? <> · décalage latéral moyen ~<strong>{fmtM(debordement.decalageLateralM)}</strong></> : null}</li>
                    <li style={{ fontStyle: 'italic' }}>un débordement peut être légitime (porte-à-faux, balcon, ou parcelle rattachée = une seule des parcelles du permis) — repère indicatif{origineIgn ? ', emprise issue de l’IGN' : ', l’emprise est une reconstitution, pas une mesure'}.</li>
                  </>)
          : (!parcelleRattachee
              ? <li>débordement : aucune parcelle rattachée — disponible une fois la parcelle rattachée.</li>
              : !contourFerme
                ? <li>débordement : disponible une fois le contour fermé (≥ 3 sommets).</li>
                : <li>débordement : calcul en cours…</li>)}
      </ul>
    </div>
  );
}

// PROJ-3r — types partagés de l'adoption (miroir des exports du repo, pour des composants PURS testables sans I/O).
export interface GroupeAdoptionVue { cleabs: string[]; surfaceM2: number; polygones: { cleabs: string; surfaceM2: number }[] }
export interface BatimentChoix { corpsId: number; repere: string | null; nomRepli?: string | null }
export interface BatimentAdoptionVue { corpsId: number; repere: string | null; nomRepli?: string | null; emprises: { surfaceM2: number }[] }
// NOM-1 — nom d'un bâtiment via le SEUL décideur (repere document → repli maison → « bâtiment {id} »). `b` absent → dernier recours sur corpsId.
const nomBatiment = (b: BatimentChoix | undefined, corpsId: number): string => nomAffichageCorps(b ? { repere: b.repere, nomRepli: b.nomRepli, corpsId: b.corpsId } : { repere: null, corpsId });

/** PROJ-3r-fix — libellé d'une ligne par les NOMS des polygones qu'elle contient (mêmes repères que la liste et le schéma). PUR. */
export function libellePolygones(cleabs: string[], repereDe: (c: string) => string): string {
  return cleabs.length === 1 ? `Polygone ${repereDe(cleabs[0])}` : `Polygones ${cleabs.map(repereDe).join(' + ')}`;
}

/**
 * PROJ-3r — ENCART D'AFFECTATION : les polygones « en projet » cochés, réunis quand ils se touchent, chacun rattachable à un bâtiment
 * DÉCLARÉ. PROJ-3r-fix (affichage seul) : chaque ligne est nommée par SES polygones (repères C, D, I… comme la liste et le schéma —
 * plus de « Groupe 1/2/3 ») ; un groupe multi-polygones le DIT (« réunis en une seule emprise ») ; le sélecteur de bâtiment est
 * EMPILÉ sous le nom, en toutes lettres, jamais tronqué (mobile-first). PUR (les gestes ne font que remonter l'intention).
 */
export function AdoptionGroupes({ groupes, batiments, reperes, affectation, scindes, occupe = false, onAffecter, onScinder, onRegrouper, onAdopter, onReinitialiser }: {
  groupes: GroupeAdoptionVue[]; batiments: BatimentChoix[]; reperes: Record<string, string>; affectation: Record<string, number>; scindes: number[]; occupe?: boolean;
  onAffecter: (cleabs: string[], corpsId: number) => void; onScinder: (i: number) => void; onRegrouper: (i: number) => void;
  onAdopter: () => void; onReinitialiser: () => void;
}) {
  if (groupes.length === 0) return null;
  const b: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.15rem .5rem', fontSize: 12 };
  const repereDe = (c: string) => reperes[c] ?? c;
  const corpsCommun = (cleabs: string[]): number | '' => { const s = new Set(cleabs.map((c) => affectation[c])); return s.size === 1 && !s.has(undefined as unknown as number) ? [...s][0] : ''; };
  // PROJ-3t (C) — FEEDBACK de regroupement : si le bâtiment de cette ligne porte AUSSI d'autres polygones, on le DIT (« Rattaché au
  //   bâtiment X avec Polygone D »). N'apparaît que lorsqu'un même bâtiment reçoit ≥ 2 polygones (regroupement réel), sinon null.
  const tousLesCleabs = groupes.flatMap((g) => g.polygones.map((p) => p.cleabs));
  const feedbackRegroupement = (cleabsLigne: string[], corpsId: number | ''): string | null => {
    if (corpsId === '') return null;
    const autres = tousLesCleabs.filter((x) => !cleabsLigne.includes(x) && affectation[x] === corpsId);
    if (autres.length === 0) return null;
    return `Rattaché au ${nomBatiment(batiments.find((bt) => bt.corpsId === corpsId), corpsId)} avec ${libellePolygones(autres, repereDe)}`;
  };
  // Ligne d'affectation EMPILÉE (pleine largeur) : « rattaché au bâtiment : [sélecteur] » + boutons + FEEDBACK éventuel — jamais serré/tronqué.
  const ligneBatiment = (valeur: number | '', onCh: (c: number) => void, boutons?: ReactNode, feedback?: string | null) => (
    <>
      <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.2rem' }}>
        <span style={muted}>rattaché au bâtiment :</span>
        <select value={valeur} onChange={(e) => onCh(Number(e.target.value))} disabled={occupe} aria-label="bâtiment affecté" style={{ fontSize: 12, maxWidth: '100%' }}>
          {valeur === '' && <option value="">— plusieurs bâtiments —</option>}
          {batiments.map((bt) => <option key={bt.corpsId} value={bt.corpsId}>{nomBatiment(bt, bt.corpsId)}</option>)}
        </select>
        {boutons}
      </div>
      {feedback && <div data-regroupe="true" style={{ ...muted, fontStyle: 'italic', marginTop: '.1rem' }}>{feedback}</div>}
    </>
  );
  return (
    <div style={carte} role="group" aria-label="affectation des polygones en projet aux bâtiments">
      <div style={{ fontWeight: 600, marginBottom: 2 }}>Adopter les polygones « en projet » de l’IGN</div>
      <p style={{ ...muted, margin: '0 0 .4rem' }}>Chaque polygone part vers le bâtiment choisi ci-dessous. Donnez le même bâtiment à plusieurs polygones pour les rattacher ensemble ; quand des polygones sont réunis, « Séparer » les détache.</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
        {groupes.map((g, i) => scindes.includes(i)
          ? (
            <li key={i} data-groupe={i} data-scinde="true" style={{ borderLeft: '2px solid var(--color-svv-line)', paddingLeft: '.4rem' }}>
              <div style={{ ...muted, display: 'flex', justifyContent: 'space-between', gap: '.4rem', flexWrap: 'wrap' }}>
                <span>{libellePolygones(g.cleabs, repereDe)} — séparés (une emprise par polygone)</span>
                <button type="button" style={b} disabled={occupe} onClick={() => onRegrouper(i)}>regrouper</button>
              </div>
              <ul style={{ listStyle: 'none', margin: '.2rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                {g.polygones.map((p) => (
                  <li key={p.cleabs} data-cleabs={p.cleabs}>
                    <div><strong>Polygone {repereDe(p.cleabs)}</strong> — {fmtM2(p.surfaceM2)}</div>
                    {ligneBatiment(affectation[p.cleabs] ?? '', (c) => onAffecter([p.cleabs], c), undefined, feedbackRegroupement([p.cleabs], affectation[p.cleabs] ?? ''))}
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <li key={i} data-groupe={i}>
              <div><strong>{libellePolygones(g.cleabs, repereDe)}</strong> — {fmtM2(g.surfaceM2)}{g.polygones.length > 1 ? ' · réunis en une seule emprise' : ''}</div>
              {ligneBatiment(corpsCommun(g.cleabs), (c) => onAffecter(g.cleabs, c), g.polygones.length > 1
                ? <button type="button" style={b} disabled={occupe} onClick={() => onScinder(i)}>Séparer les polygones</button>
                : undefined, feedbackRegroupement(g.cleabs, corpsCommun(g.cleabs)))}
            </li>
          ))}
      </ul>
      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
        <button type="button" style={{ ...b, fontWeight: 700 }} disabled={occupe} onClick={onAdopter}>Adopter</button>
        <button type="button" style={b} disabled={occupe} onClick={onReinitialiser}>Revenir à la proposition automatique</button>
      </div>
    </div>
  );
}

/**
 * PROJ-3r — CONFIRMATION AVANT ENREGISTREMENT : la répartition PAR BÂTIMENT (combien d'emprises et leurs aires), calculée serveur,
 * pour qu'Arno voie ce qu'il valide. Avertit du remplacement des emprises existantes des bâtiments ciblés. PUR.
 */
export function ConfirmationAdoption({ apercu, remplaceExistant, occupe = false, onConfirmer, onAnnuler }: {
  apercu: { batiments: BatimentAdoptionVue[] } | null; remplaceExistant: boolean; occupe?: boolean; onConfirmer: () => void; onAnnuler: () => void;
}) {
  if (apercu === null) return null;
  const total = apercu.batiments.reduce((s, x) => s + x.emprises.length, 0);
  const b: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.2rem .6rem', fontSize: 13 };
  return (
    <div style={{ ...carte, borderColor: 'var(--color-svv-ink)' }} role="group" aria-label="confirmation de l’adoption par bâtiment">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Confirmer : {total} emprise{total > 1 ? 's' : ''} issue{total > 1 ? 's' : ''} de l’IGN</div>
      {total === 0
        ? <p style={{ ...muted, margin: 0 }}>Aucun polygone affecté à un bâtiment.</p>
        : <ul style={{ ...muted, margin: 0, paddingLeft: '1.1rem' }}>
            {apercu.batiments.map((bt) => (
              <li key={bt.corpsId}><strong>{nomBatiment(bt, bt.corpsId)}</strong> : {bt.emprises.length} emprise{bt.emprises.length > 1 ? 's' : ''} ({bt.emprises.map((e) => fmtM2(e.surfaceM2)).join(', ')})</li>
            ))}
          </ul>}
      {remplaceExistant && <p role="alert" style={{ color: 'var(--color-svv-red)', margin: '.3rem 0 0' }}>⚠ Les emprises existantes des bâtiments ciblés seront remplacées (adoption et tracé ne coexistent jamais).</p>}
      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
        {total > 0 && <button type="button" style={{ ...b, fontWeight: 700 }} disabled={occupe} onClick={onConfirmer}>Adopter</button>}
        <button type="button" style={b} disabled={occupe} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}

/** PROJ-3q — étiquette d'ORIGINE lisible d'une emprise (jamais « reconstitution » pour une donnée IGN). PUR. */
export function libelleProvenance(p: ProvenanceEmprise): string {
  return p === 'ign_adopte' ? 'issue de l’IGN' : p === 'ign_retouche' ? 'IGN retouchée à la main' : 'tracé à la main';
}

/** Une emprise est-elle retouchable ? PROJ-3s : ce chantier ne retouche QUE le mono-polygone (un seul contour extérieur). PUR. */
export function empriseRetouchable(e: EmpriseReconstruite): boolean {
  return (e.anneaux?.length ?? (e.anneau.length >= 3 ? 1 : 0)) <= 1;
}

/** Liste des emprises d'un bâtiment : libellé, ORIGINE (IGN / tracé à la main), surface, résidu ; RETOUCHER (mono-polygone) ; effacer. */
export function ListeEmprises({ emprises, onSupprimer, onRetoucher, empriseEnRetouche = null, nomCorps, repereSource }: {
  emprises: EmpriseReconstruite[]; onSupprimer?: (id: number) => void; onRetoucher?: (id: number) => void; empriseEnRetouche?: number | null;
  nomCorps?: string; // NOM-1 — nom RÉSOLU du corps (repere document / repli maison) : PRIME sur e.libelle stocké (« bâtiment 3 », vestigial).
  repereSource?: (e: EmpriseReconstruite) => string | null; // AFF-3 — label de la ligne = repère(s) du/des POLYGONE(s) BD TOPO source(s) de l'emprise (via calage.cleabs).
}) {
  if (emprises.length === 0) return <p style={muted}>Aucune emprise pour ce bâtiment.</p>;
  const b: CSSProperties = { ...muted, cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', padding: '.15rem .5rem' };
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      {emprises.map((e) => {
        const ign = e.provenance === 'ign_adopte' || e.provenance === 'ign_retouche';
        const retouchable = empriseRetouchable(e);
        const enRetouche = empriseEnRetouche === e.id;
        return (
          <li key={e.id} data-emprise={e.id} data-en-retouche={enRetouche || undefined} style={{ ...carte, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', borderColor: enRetouche ? 'var(--color-svv-ink)' : 'var(--color-svv-line)' }}>
            <span>
              <strong>{repereSource?.(e) ?? nomCorps ?? e.libelle}</strong>{' '}
              <span data-provenance={e.provenance} style={{ ...muted, border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', padding: '0 .3rem' }}>{libelleProvenance(e.provenance)}</span>{' '}
              {e.surfaceM2 !== null ? fmtM2(e.surfaceM2) : ''}{' '}
              <span style={muted}>{ign ? '· donnée source IGN' : `· résidu ${e.residuM !== null ? fmtM(e.residuM) : '—'}${e.page !== null ? ` · page ${e.page}` : ''}`}</span>
              {enRetouche && <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}> · en cours de retouche</span>}
              {!retouchable && <span style={muted}> · retouche indisponible (emprise multi-parties)</span>}
            </span>
            <span style={{ display: 'flex', gap: '.3rem' }}>
              {onRetoucher && retouchable && !enRetouche && <button type="button" onClick={() => onRetoucher(e.id)} style={b}>retoucher</button>}
              {onSupprimer && <button type="button" onClick={() => onSupprimer(e.id)} style={b}>effacer</button>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// PROJ-3h/3i — état des OPTIONS DE VISIBILITÉ du schéma de projection. Chaque interrupteur agit IMMÉDIATEMENT, sans recharger la ligne.
//   ⓪ PROJ-3i : les deux filtres de PROJ-3h (« en projet » visibilité + « futur bâti » croisillon) visaient LE MÊME jeu de polygones
//   (En projet ⊂ futur bâti ; sur le périmètre réel 0 « En construction ») → doublon d'interface, le croisillon faisant redondance
//   avec le style bleu-tireté. On FUSIONNE en UN seul interrupteur « futur bâti (en projet) » et on AJOUTE l'interrupteur « repères ».
export interface FiltresSchema { existant: boolean; futur: boolean; reperes: boolean; emprises: boolean }
export const FILTRES_SCHEMA_DEFAUT: FiltresSchema = { existant: true, futur: true, reperes: true, emprises: true };

/**
 * Quels polygones BD TOPO sont VISIBLES : le FUTUR BÂTI (En projet OU En construction) piloté par `futur`, le reste (existant :
 * En service / En ruine) par `existant`. PUR (testable pour toute combinaison, y compris tout éteint → liste vide).
 */
export function polygonesVisibles<T extends { etat: string | null }>(polygones: T[], f: { existant: boolean; futur: boolean }): T[] {
  return polygones.filter((p) => (estFuturBati(p.etat) ? f.futur : f.existant));
}

/** PROJ-3i ① — attribue un REPÈRE alphabétique (A, B, C…) à chaque polygone, dans l'ordre reçu (déterministe côté serveur). PUR. */
export type PolygoneRepere = PolygoneBdTopo & { repere: string };
export function attribuerReperes(polygones: PolygoneBdTopo[]): PolygoneRepere[] {
  return polygones.map((p, i) => ({ ...p, repere: repereDepuisIndex(i) }));
}

/** Centre approximatif d'un anneau (moyenne des sommets) — pour poser la lettre du repère. PUR. */
function centreAnneau(anneau: PointLambert[]): PointLambert {
  const n = anneau.length || 1;
  return { x: anneau.reduce((s, p) => s + p.x, 0) / n, y: anneau.reduce((s, p) => s + p.y, 0) / n };
}

/** RATT-3/RATT-6 — PALETTE de statut (constantes de DESSIN, jamais des variables métier) : vert = préservé, orange = détruit total,
 *  MIXTE (partiellement détruit) = gris d'origine (le bâtiment SURVIT, il reste visible) + trait TIRETÉ ardoise — JAMAIS l'orange du
 *  détruit, aucune couleur criarde : le mixte ne se lit pas comme un détruit. */
const STATUT_COULEUR: Record<'preserve' | 'detruit' | 'mixte', { fill: string; stroke: string; dash?: string }> = {
  preserve: { fill: 'rgba(46,158,91,.22)', stroke: 'var(--color-svv-green-ink)' },
  detruit: { fill: 'rgba(217,119,6,.22)', stroke: '#c26a00' },
  mixte: { fill: 'rgba(0,0,0,.06)', stroke: '#556', dash: '3 2' },
};

/**
 * RATT-3/RATT-6 — traitement visuel d'un polygone EXISTANT d'après son statut COURANT : préservé → vert ; détruit total → orange ;
 * MIXTE → gris (survit, visible) + tireté ardoise (distinct, jamais orange). `null` = aucun statut (ou révoqué) → gris d'origine
 * INCHANGÉ. Une prévision NON enregistrée ne colore JAMAIS. PUR.
 */
export function couleurStatutPolygone(statut: 'preserve' | 'detruit' | 'mixte' | null | undefined): { fill: string; stroke: string; dash?: string } | null {
  return statut === 'preserve' ? STATUT_COULEUR.preserve : statut === 'detruit' ? STATUT_COULEUR.detruit : statut === 'mixte' ? STATUT_COULEUR.mixte : null;
}

/**
 * RATT-3 — polygones à DESSINER dans la miniature « Configuration projetée » (la parcelle telle qu'elle sera après travaux) : on RETIRE
 * les bâtiments dont la décision COURANTE est « détruit » (effacés du dessin) ; tous les autres restent — préservés, sans décision,
 * révoqués, futur bâti. Le statut ne sert ici QU'À masquer les détruits (aucune couleur verte/orange dans cette miniature). PUR.
 */
export function polygonesConfigProjetee<T extends { cleabs: string | null }>(polygones: readonly T[], statuts: Map<string, EtatStatutPolygone>): T[] {
  return polygones.filter((p) => !(p.cleabs !== null && statuts.get(p.cleabs)?.statut === 'detruit'));
}

/**
 * SCHÉMA de la PARCELLE (pur, SVG). Montre TROIS choses VISUELLEMENT DISTINCTES + étiquetées (jamais la couleur seule) : (a) bâti
 * EXISTANT (gris), (b) FUTUR BÂTI « en projet » (bleu tireté = DONNÉE IGN ; ÉCARTÉ → grisé barré), (c) emprise TRACÉE (rouge =
 * RECONSTITUTION, jamais une mesure — garde PROJ). PROJ-3i : repères A/B/C… si `reperes` ; `ecartes` (cleabs décochés) grisés.
 */
export function SchemaParcelleTrace({ boite, parcelle, emprises, polygones = [], filtres = FILTRES_SCHEMA_DEFAUT, ecartes = [], calageLambert, angle = 0, hauteurMax = '62vh', onCliquer, retoucheAnneau = null, sommetSelectionne = null, statuts }: {
  boite: Boite | null; parcelle: PointLambert[][]; emprises: EmpriseReconstruite[]; polygones?: PolygoneRepere[]; filtres?: FiltresSchema; ecartes?: string[]; calageLambert: PointLambert[]; angle?: number; hauteurMax?: string; onCliquer?: (px: { x: number; y: number }) => void;
  retoucheAnneau?: PointLambert[] | null; sommetSelectionne?: number | null; // PROJ-3s — contour en RETOUCHE (poignées éditables) + sommet sélectionné
  statuts?: Map<string, EtatStatutPolygone>; // RATT-3 — statut décidé par cleabs : colore l'existant (préservé vert / détruit orange). Absent → gris d'origine.
}) {
  if (!boite || parcelle.length === 0) return <p style={muted}>Parcelle du permis absente : schéma non dessiné (aucun point fiable).</p>;
  const proj = (p: PointLambert) => projeterDansBoite(boite, p);
  const path = (anneau: PointLambert[]) => anneau.map((p, i) => { const q = proj(p); return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ') + ' Z';
  const visibles = polygonesVisibles(polygones, filtres);
  const ecarte = (p: PolygoneRepere) => p.cleabs !== null && ecartes.includes(p.cleabs);
  // PROJ-3j/3k — la ROTATION est un affichage : le contenu est tourné via <g rotate>, un CLIC est ramené dans le repère NON tourné.
  //   PROJ-3k : le viewBox = boîte englobante du contenu APRÈS rotation → le contenu REMPLIT le cadre (largeur 100 %), se réadapte à
  //   l'angle, sans déformation. Le clic tient compte de l'échelle de rendu ET de l'angle (clicVersBoite) → calage exact à toute taille.
  const centre = { x: boite.largeur / 2, y: boite.hauteur / 2 };
  const pts: { x: number; y: number }[] = [];
  for (const a of parcelle) for (const p of a) pts.push(proj(p));
  for (const poly of visibles) if (poly.anneau.length >= 3) for (const p of poly.anneau) pts.push(proj(p));
  if (filtres.emprises) for (const e of emprises) for (const ring of (e.anneaux?.length ? e.anneaux : [e.anneau])) if (ring.length >= 3) for (const p of ring) pts.push(proj(p));
  for (const p of calageLambert) pts.push(proj(p));
  if (retoucheAnneau) for (const p of retoucheAnneau) pts.push(proj(p)); // PROJ-3s — garder le contour retouché dans le cadre
  const vb = boiteEnglobanteRotee(pts, centre, angle);
  return (
    <svg viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="schéma de la parcelle, du bâti BD TOPO et des emprises reconstituées"
      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: hauteurMax, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: '#fff', cursor: onCliquer ? 'crosshair' : 'default' }}
      onClick={onCliquer ? (ev) => { const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect(); onCliquer(clicVersBoite(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height, vb, centre, angle)); } : undefined}>
      <g transform={angle ? `rotate(${angle} ${centre.x} ${centre.y})` : undefined}>
        {parcelle.map((a, i) => <path key={`p${i}`} d={path(a)} fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.2} />)}
        {/* (a) existant gris / (b) futur bâti bleu tireté (donnée IGN) ; un futur bâti ÉCARTÉ est grisé (décision d'Arno). Distinct par le TRAIT. */}
        {visibles.map((poly, i) => {
          if (poly.anneau.length < 3) return null;
          const futur = estFuturBati(poly.etat), off = futur && ecarte(poly);
          // RATT-3/RATT-6 — un bâtiment EXISTANT prend le traitement de son statut ENREGISTRÉ : préservé → vert, détruit total → orange,
          //   MIXTE (partiellement détruit) → gris + tireté ardoise (il survit, il reste visible ; JAMAIS l'orange du détruit). Sans statut
          //   (ou révoqué), ou pour du futur bâti, la couleur d'origine reste INCHANGÉE — on ne colore jamais d'après une prévision non enregistrée.
          const statut = !futur ? statuts?.get(poly.cleabs ?? '')?.statut : null;
          const coul = couleurStatutPolygone(statut);
          return <path key={`b${i}`} d={path(poly.anneau)} data-etat={poly.etat ?? ''} data-futur={futur} data-ecarte={off || undefined} data-statut={coul ? statut : undefined}
            fill={off ? 'rgba(0,0,0,.04)' : futur ? 'rgba(31,119,180,.14)' : coul ? coul.fill : 'rgba(0,0,0,.06)'}
            stroke={off ? '#bbb' : futur ? '#1f77b4' : coul ? coul.stroke : '#888'} strokeWidth={1.2} strokeDasharray={futur ? '4 2' : coul?.dash} strokeOpacity={off ? 0.6 : 1} />;
        })}
        {/* (c) emprises TRACÉES = reconstitution (rouge), si « Afficher la projection » est actif. */}
        {filtres.emprises && emprises.flatMap((e) => (e.anneaux?.length ? e.anneaux : [e.anneau]).map((ring, ri) => ring.length >= 3
          ? <path key={`e${e.id}-${ri}`} d={path(ring)} fill="rgba(163,4,2,.18)" stroke="var(--color-svv-red)" strokeWidth={1.4} data-emprise={e.id} data-provenance={e.provenance} />
          : null))}
        {/* PROJ-3i ① — repères alphabétiques (mêmes lettres que le Rattachement), au centre de chaque polygone visible. */}
        {filtres.reperes && visibles.map((poly, i) => { if (poly.anneau.length < 3) return null; const q = projeterDansBoite(boite, centreAnneau(poly.anneau)); return <text key={`r${i}`} x={q.x} y={q.y} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--color-svv-ink)" data-repere={poly.repere}>{poly.repere}</text>; })}
        {calageLambert.map((p, i) => { const q = projeterDansBoite(boite, p); return <g key={`c${i}`}><circle cx={q.x} cy={q.y} r={4} fill="var(--color-svv-red)" /><text x={q.x + 6} y={q.y - 6} fontSize={11} fill="var(--color-svv-red)">{i + 1}</text></g>; })}
        {/* PROJ-3s — RETOUCHE : contour éditable + poignées de sommet (cibles tactiles) + points milieux de bord (insertion). */}
        {retoucheAnneau && retoucheAnneau.length >= 2 && <>
          <path d={path(retoucheAnneau)} fill="rgba(163,4,2,.10)" stroke="var(--color-svv-red)" strokeWidth={1.6} strokeDasharray="5 3" data-retouche="true" />
          {retoucheAnneau.map((p, i) => { const a = proj(p), b = proj(retoucheAnneau[(i + 1) % retoucheAnneau.length]); return <circle key={`m${i}`} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={3} fill="#fff" stroke="var(--color-svv-red)" strokeWidth={1} data-bord={i} />; })}
          {retoucheAnneau.map((p, i) => { const q = proj(p); const sel = i === sommetSelectionne; return <circle key={`s${i}`} cx={q.x} cy={q.y} r={sel ? 7 : 5} fill={sel ? 'var(--color-svv-ink)' : 'var(--color-svv-red)'} stroke="#fff" strokeWidth={1.5} data-sommet={i} data-selectionne={sel || undefined} />; })}
        </>}
      </g>
    </svg>
  );
}

/**
 * PROJ-3j — commande de ROTATION du schéma (0 à 360°, LIBRE, pas par paliers) : curseur + valeur d'angle visible + retour à 0 en un
 * geste. AFFICHAGE seulement (aucune géométrie réécrite). PUR (le curseur ne fait que remonter l'angle).
 */
export function RotationSchema({ angle, onAngle }: { angle: number; onAngle: (a: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
      <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
        Rotation
        <input type="range" min={0} max={360} step={1} value={angle} onChange={(e) => onAngle(Number(e.target.value))} aria-label="Rotation du schéma en degrés" style={{ width: 120 }} />
      </label>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 34 }}>{Math.round(angle)}°</span>
      <button type="button" onClick={() => onAngle(0)} disabled={angle === 0} style={{ cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.15rem .5rem', fontSize: 12, opacity: angle === 0 ? 0.4 : 1 }}>Remettre à 0</button>
    </div>
  );
}

/**
 * PROJ-3l — commande de ZOOM du DOCUMENT PDF (à gauche) : « − » / « + », niveau de zoom visible, et « Ajuster » (retour à
 * l'ajustement initial) en un clic. Une fois zoomé, on déplace le document en le GLISSANT. AFFICHAGE seulement. PUR.
 */
export function ZoomPdf({ zoom, onDezoom, onZoom, onAjuster }: { zoom: number; onDezoom: () => void; onZoom: () => void; onAjuster: () => void }) {
  const b: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.1rem .55rem', fontSize: 13, lineHeight: 1.2 };
  return (
    <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
      <span>Zoom</span>
      <button type="button" aria-label="Dézoomer" onClick={onDezoom} disabled={zoom <= 1} style={{ ...b, opacity: zoom <= 1 ? 0.4 : 1 }}>−</button>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'center' }}>{Math.round(zoom * 100)} %</span>
      <button type="button" aria-label="Zoomer" onClick={onZoom} style={b}>+</button>
      <button type="button" onClick={onAjuster} disabled={zoom === 1} style={{ ...b, fontSize: 12, opacity: zoom === 1 ? 0.4 : 1 }}>Ajuster</button>
    </div>
  );
}

/**
 * PROJ-3m ② — GUIDAGE du geste de tracé (pur) : où en est-on (étape 1 calage / étape 2 tracé), QUOI cliquer MAINTENANT, combien de
 * points restent, comment terminer/revenir en arrière, et OÙ cliquer (`sur` : 'plan' à gauche / 'schema' à droite). AUCUNE mécanique,
 * juste de l'explicitation. PUR (testable pour chaque état).
 */
export interface Guidage { titre: string; instruction: string; sur: 'plan' | 'schema' }
export function guidageTrace(mode: 'calage' | 'trace', nbPaires: number, planEnAttente: boolean, nbSommets: number, tracable: boolean): Guidage {
  if (!tracable) return { titre: 'Traçage indisponible', instruction: 'Cette vue n’est pas une vue en plan : on ne peut pas y tracer une emprise.', sur: 'plan' };
  if (mode === 'calage') {
    if (planEnAttente) return { titre: `Étape 1 — caler la vue (${nbPaires}/2)`, instruction: 'Point posé sur le plan. Cliquez maintenant le MÊME point sur le schéma de la parcelle, à droite →', sur: 'schema' };
    if (nbPaires >= 2) return { titre: 'Étape 1 — caler la vue : ✓ 2 points', instruction: 'Calage suffisant. Passez au bouton « Tracé » ci-dessous (ou posez un 3ᵉ point pour affiner l’échelle).', sur: 'plan' };
    return { titre: `Étape 1 — caler la vue (${nbPaires}/2)`, instruction: `Cliquez un point reconnaissable du PLAN (un angle de la parcelle), puis son correspondant sur le schéma. Encore ${2 - nbPaires} point(s) à poser.`, sur: 'plan' };
  }
  if (nbSommets < 3) return { titre: `Étape 2 — tracer l’emprise (${nbSommets} sommet${nbSommets > 1 ? 's' : ''})`, instruction: `Cliquez les sommets du contour du bâtiment sur le PLAN — au moins 3 pour fermer (encore ${3 - nbSommets}).`, sur: 'plan' };
  return { titre: `Étape 2 — tracer l’emprise (${nbSommets} sommets)`, instruction: 'Contour fermé. Cliquez « Enregistrer l’emprise ». « Annuler dernier » retire un point ; « Reprendre » recommence.', sur: 'plan' };
}

/** PROJ-3m ② — encart de guidage AFFICHÉ À CÔTÉ du geste (jamais un texte lointain). PUR. */
export function GuidageTraceBox({ g }: { g: Guidage }) {
  return (
    <div role="note" style={{ fontSize: 12, border: '1px solid var(--color-svv-red)', background: 'var(--color-svv-red-soft, #fff5f4)', borderRadius: '.4rem', padding: '.3rem .5rem' }}>
      <div style={{ fontWeight: 700 }}>{g.titre}</div>
      <div style={{ color: 'var(--color-svv-ink)' }}>{g.instruction}</div>
    </div>
  );
}

/**
 * PROJ-3h/3i — PANNEAU d'options de visibilité (à droite du schéma, sous « Ignorer la projection »). Vocabulaire du schéma d'origine :
 * « Afficher les repères (A, B, C…) », « Afficher la projection ». UN seul interrupteur « futur bâti (en projet) » (⓪ fusion). Chaque
 * case agit immédiatement. PUR.
 */
export function OptionsVisibiliteSchema({ filtres, onFiltres, nbFutur, nbExistant }: {
  filtres: FiltresSchema; onFiltres: (f: FiltresSchema) => void; nbFutur: number; nbExistant: number;
}) {
  const ligne = (cle: keyof FiltresSchema, label: string) => (
    <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
      <input type="checkbox" checked={filtres[cle]} onChange={(e) => onFiltres({ ...filtres, [cle]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>Options de visibilité</div>
      {ligne('existant', `Afficher le bâti existant (BD TOPO)${nbExistant > 0 ? ` (${nbExistant})` : ''}`)}
      {ligne('futur', `Afficher les polygones en projet (futur bâti)${nbFutur > 0 ? ` (${nbFutur})` : ''}`)}
      {ligne('reperes', 'Afficher les repères (A, B, C…)')}
      {ligne('emprises', 'Afficher la projection')}
      <LegendeSchemaProjection />
    </div>
  );
}

/**
 * PROJ-3i ③ — SÉLECTION individuelle des polygones « en projet » (futur bâti) par leur repère. Par DÉFAUT tout est RETENU (coché) ;
 * décocher ÉCARTE un polygone qui ne fait pas partie du projet (erreur possible dans le dossier IGN). PUR (le clic ne fait que
 * remonter cleabs + intention). AUCUN calcul, aucun rattachement, aucune injection — décision d'affichage tracée (serveur).
 */
export function SelectionPolygonesProjet({ polygones, ecartes, onToggle }: {
  polygones: PolygoneRepere[]; ecartes: string[]; onToggle: (cleabs: string, ecarter: boolean) => void;
}) {
  const futurs = polygones.filter((p) => estFuturBati(p.etat) && p.cleabs);
  if (futurs.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .5rem' }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>Polygones « en projet » du dossier</div>
      <div style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Tous retenus par défaut — décochez ceux qui ne font pas partie du projet (erreur possible dans le dossier).</div>
      {futurs.map((p) => {
        const retenu = !ecartes.includes(p.cleabs!);
        return (
          <label key={p.cleabs} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={retenu} onChange={(e) => onToggle(p.cleabs!, !e.target.checked)} />
            <span>Polygone <strong>{p.repere}</strong>{retenu ? '' : ' — écarté'}</span>
          </label>
        );
      })}
    </div>
  );
}

/** RATT-1 (2) — libellé lisible d'un statut décidé. */
function libelleStatut(s: 'preserve' | 'detruit' | 'mixte'): string { return s === 'preserve' ? 'bâtiment préservé' : s === 'mixte' ? 'partiellement détruit (fait géométrique)' : 'bâtiment détruit (prévision)'; }
/** RATT-1 (2) — « JJ/MM/AAAA » depuis un ISO (trace de décision). */
function jjmmaaaaStatut(iso: string): string { return jourFrParis(iso); } // LOT 49 — jour en Europe/Paris (évite le décalage d'un jour près de minuit)

/**
 * RATT-1 (2) / RATT-2 / RATT-4 — STATUER les bâtiments EXISTANTS du site (recouverts compris) ET les polygones « en projet » RECOUVERTS
 * par l'emprise projetée (RATT-4 : un futur bâti non recouvert reste hors liste). Pour chacun : l'état BD TOPO (SOURCE, jamais réécrite) ET ma
 * décision (préservé/détruit) affichés CÔTE À CÔTE ; boutons pour poser/changer/révoquer (append-only). RATT-2 : un bâtiment recouvert
 * porte « détruit » d'office (automatisme) mais reste basculable en « préservé » — cas d'une surélévation, où l'existant est conservé
 * sous le futur volume ; la mention le signale explicitement. « Détruit » est une PRÉVISION à confirmer à la mise à jour cadastrale ;
 * l'historique est repliable (qui/quand). Disponible même « en attente du bâti ». PUR (l'état vit dans la Vue). Mobile-first, pas de hover.
 */
/** AFF-1 — nombre de bâtiments STATUABLES (existants + « en projet » recouverts au-dessus du seuil). PUR — sert au décompte du bloc replié. */
export function nbBatimentsStatuables(polygones: PolygoneRepere[], recouverts: readonly PolygoneRecouvert[]): number {
  const rec = new Set(recouverts.map((r) => r.cleabs));
  return polygones.filter((p) => estStatuable(p, p.cleabs !== null && rec.has(p.cleabs))).length;
}

export function StatutPolygonesExistants({ polygones, recouverts, statuts, onStatuer, sansEntete = false }: {
  polygones: PolygoneRepere[]; recouverts: readonly PolygoneRecouvert[]; statuts: Map<string, EtatStatutPolygone>;
  onStatuer: (cleabs: string, statut: 'preserve' | 'detruit' | 'revoque') => void;
  sansEntete?: boolean; // AFF-1 — masque le titre interne quand le bloc est porté par le résumé d'un <details> replié (le titre est sur le summary).
}) {
  // RATT-5 — `recouverts` ne contient QUE les polygones au-dessus du seuil (part sous l'emprise ≥ seuil config) ; chacun porte son taux (%).
  const tauxRecouvrement = new Map(recouverts.map((r) => [r.cleabs, r.tauxPct]));
  // RATT-2 — tous les existants (recouverts compris) ; RATT-4 — + les « en projet » RECOUVERTS par l'emprise (un futur bâti non recouvert reste hors liste).
  const statuables = polygones.filter((p) => estStatuable(p, p.cleabs !== null && tauxRecouvrement.has(p.cleabs)));
  if (statuables.length === 0) return null;
  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.2rem .55rem', fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', border: sansEntete ? 'none' : '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: sansEntete ? 0 : '.4rem .5rem' }}>
      {!sansEntete && <div style={{ fontSize: 12, fontWeight: 700 }}>Bâtiments existants du site</div>}
      <div style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Les bâtiments existants du site, plus les polygones « en projet » recouverts par la future emprise (un « en projet » non recouvert reste hors liste). Statuez chacun : la source BD TOPO reste affichée à côté de votre décision (jamais écrasée). Un polygone recouvert par la future emprise est « détruit » par défaut, mais vous pouvez le repasser en « préservé » (cas d’une surélévation). « Détruit » est une PRÉVISION, à confirmer le jour de la mise à jour cadastrale.</div>
      {statuables.map((p) => {
        const st = statuts.get(p.cleabs!);
        const decide = st?.statut ?? null;
        const tauxRecouvert = tauxRecouvrement.get(p.cleabs!); // RATT-5 — % de la surface sous l'emprise (défini SSI au-dessus du seuil)
        const recouvert = tauxRecouvert !== undefined;
        // RATT-6 — MIXTE = fait géométrique : recouvert PARTIELLEMENT (au-dessus du seuil mais sous le recouvrement total, à la tolérance
        //   près) OU statut 'mixte' déjà enregistré. Non modifiable → les deux boutons sont DÉSACTIVÉS (jamais masqués : Arno voit pourquoi).
        const estMixteGeo = recouvert && tauxRecouvert! < 100 - TOLERANCE_RECOUVREMENT_TOTAL_PCT;
        const estMixte = decide === 'mixte' || estMixteGeo;
        return (
          <div key={p.cleabs} style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
            <div style={{ fontSize: 12 }}>
              <strong>Polygone {p.repere}</strong> <span style={{ fontFamily: 'var(--font-svv-mono, monospace)', userSelect: 'all', fontSize: 11, color: 'var(--color-svv-muted)', wordBreak: 'break-all' }}>{p.cleabs}</span>
            </div>
            {/* SOURCE et DÉCISION côte à côte — jamais l'une à la place de l'autre. */}
            <div style={{ fontSize: 12, display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <span><span style={{ color: 'var(--color-svv-muted)' }}>BD TOPO :</span> <strong>{p.etat ?? 'inconnu'}</strong></span>
              <span><span style={{ color: 'var(--color-svv-muted)' }}>votre décision :</span> <strong>{decide ? libelleStatut(decide) : <span style={{ color: 'var(--color-svv-muted)', fontWeight: 400 }}>aucune</span>}</strong></span>
            </div>
            {/* RATT-6 — MIXTE : mention ROUGE dédiée « partiellement détruit — recouvert à XX % » (le bâtiment survit en partie). Sinon RATT-2/RATT-5 :
                recouvert total → « recouvert à XX % … statut détruit par défaut ». Le TAUX est toujours affiché : Arno voit DE COMBIEN il s'agit. */}
            {estMixte
              ? <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-red)', fontWeight: 700 }}>partiellement détruit — recouvert à {Math.round(tauxRecouvert ?? 0)} % par l’emprise projetée</span>
              : recouvert && <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-red)', fontWeight: 700 }}>recouvert à {Math.round(tauxRecouvert!)} % par l’emprise projetée — statut détruit par défaut</span>}
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              {/* RATT-6 — sur un 'mixte' (fait géométrique), les deux boutons sont DÉSACTIVÉS (disabled + aria-disabled), jamais masqués : la mention rouge dit POURQUOI. */}
              <button type="button" disabled={estMixte} aria-disabled={estMixte} style={{ ...btn, cursor: estMixte ? 'not-allowed' : 'pointer', opacity: estMixte ? 0.5 : 1, fontWeight: decide === 'preserve' ? 700 : 400, borderColor: decide === 'preserve' ? 'var(--color-svv-ink)' : 'var(--color-svv-line)' }} aria-pressed={decide === 'preserve'} onClick={() => { if (!estMixte) onStatuer(p.cleabs!, 'preserve'); }}>bâtiment préservé</button>
              <button type="button" disabled={estMixte} aria-disabled={estMixte} style={{ ...btn, cursor: estMixte ? 'not-allowed' : 'pointer', opacity: estMixte ? 0.5 : 1, fontWeight: decide === 'detruit' ? 700 : 400, borderColor: decide === 'detruit' ? 'var(--color-svv-ink)' : 'var(--color-svv-line)' }} aria-pressed={decide === 'detruit'} onClick={() => { if (!estMixte) onStatuer(p.cleabs!, 'detruit'); }}>bâtiment détruit</button>
              {decide && !estMixte && <button type="button" style={btn} onClick={() => onStatuer(p.cleabs!, 'revoque')}>annuler ma décision</button>}
            </div>
            {/* RATT-6 — POURQUOI les boutons sont grisés : le mixte est un fait géométrique déduit, pas une décision d'Arno. */}
            {estMixte && <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Une partie du bâtiment tombe sous l’emprise, l’autre survit : statut déduit de la géométrie — non modifiable à la main. (Le découpage précis et l’altitude par partie relèvent d’un chantier ultérieur.)</span>}
            {decide === 'detruit' && <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-ink)', background: '#fff8f8', border: '1px solid var(--color-svv-red)', borderRadius: '.35rem', padding: '.2rem .4rem' }}>Prévision : effacé de la PROJECTION de la future parcelle (jamais de BD TOPO). Sera confirmé ou infirmé à la mise à jour de la planche cadastrale.</span>}
            {decide === 'preserve' && st?.etatBdtopoAuMoment && st.etatBdtopoAuMoment !== p.etat && <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>BD TOPO disait « {st.etatBdtopoAuMoment} » au moment de votre décision — votre « préservé » prime, la source reste lisible.</span>}
            {st && st.historique.length > 0 && (
              <details style={{ fontSize: 11 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--color-svv-muted)' }}>historique de mes décisions ({st.historique.length})</summary>
                <ul style={{ margin: '.15rem 0 0', paddingLeft: '1rem', color: 'var(--color-svv-muted)' }}>
                  {st.historique.map((h, i) => (
                    <li key={`${h.decideLe}-${i}`}>{h.statut === 'revoque' ? 'annulation' : libelleStatut(h.statut)}{h.decidePar ? ` · ${h.decidePar}` : ''} · {jjmmaaaaStatut(h.decideLe)}{h.etatBdtopoAuMoment ? ` (BD TOPO : ${h.etatBdtopoAuMoment})` : ''}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** AFF-1 — aire (m²) d'un anneau Lambert-93 par la formule du lacet (shoelace). Sert au décompte par polygone du bloc « projet ». PUR. */
export function aireAnneauM2(anneau: PointLambert[]): number {
  let s = 0;
  for (let i = 0; i < anneau.length; i++) { const a = anneau[i], b = anneau[(i + 1) % anneau.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/** AFF-1 — cleabs SOURCES d'une emprise ADOPTÉE (mémorisées dans son calage : {adoptionIgn, cleabs}). `[]` pour un tracé manuel. PUR. */
function cleabsSourceEmprise(e: EmpriseReconstruite): string[] {
  const c = (e.calage as unknown as { cleabs?: unknown } | null)?.cleabs;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string') : [];
}

export interface LignePolygoneProjet { cleabs: string; repere: string; aireM2: number }
export interface GroupeProjet { corpsId: number; nom: string; polygones: LignePolygoneProjet[] }
/**
 * AFF-1 — regroupe les polygones « en projet » de BD TOPO AFFECTÉS à un bâtiment du permis, PAR bâtiment (nom résolu). L'affectation
 * vient des emprises ADOPTÉES (calage.cleabs → corps). Chaque polygone porte SON repère (D/C/I…) et SA surface (aire de son anneau).
 * Un « en projet » non affecté à un bâtiment reste hors de ce bloc. PUR (aucune I/O).
 */
export function polygonesProjetParBatiment(
  emprises: EmpriseReconstruite[], polygones: PolygoneRepere[],
  batiments: { corpsId: number; repere: string | null; nomRepli?: string | null }[],
): { groupes: GroupeProjet[]; total: number } {
  const corpsDeCleabs = new Map<string, number>();
  for (const e of emprises) { if (e.corpsId === null) continue; for (const c of cleabsSourceEmprise(e)) if (!corpsDeCleabs.has(c)) corpsDeCleabs.set(c, e.corpsId); }
  const nomDe = new Map(batiments.map((b) => [b.corpsId, nomAffichageCorps({ repere: b.repere, nomRepli: b.nomRepli, corpsId: b.corpsId })]));
  const parCorps = new Map<number, LignePolygoneProjet[]>();
  for (const p of polygones) {
    if (p.cleabs === null || !estFuturBati(p.etat)) continue;
    const corpsId = corpsDeCleabs.get(p.cleabs);
    if (corpsId === undefined) continue; // « en projet » non affecté → hors de ce bloc
    (parCorps.get(corpsId) ?? parCorps.set(corpsId, []).get(corpsId)!).push({ cleabs: p.cleabs, repere: p.repere, aireM2: aireAnneauM2(p.anneau) });
  }
  const groupes: GroupeProjet[] = [];
  let total = 0;
  for (const [corpsId, polys] of parCorps) { groupes.push({ corpsId, nom: nomDe.get(corpsId) ?? nomAffichageCorps({ repere: null, corpsId }), polygones: polys }); total += polys.length; }
  return { groupes, total };
}

/**
 * AFF-3 — label de la ligne d'une emprise : le(s) repère(s) du/des POLYGONE(S) BD TOPO source(s) (« Polygone C », « Polygones C + D »),
 * relié(s) via la CLÉ `calage.cleabs` (cleabs mémorisés à l'adoption). Une emprise SANS source repérée (tracé manuel) → « Emprise
 * reconstituée » — JAMAIS le libellé stocké « bâtiment 3 ». On ne FUSIONNE pas deux objets : la ligne EST l'emprise (provenance, surface,
 * résidu, page), seulement ÉTIQUETÉE par le polygone dont elle a été reconstituée. PUR.
 */
function labelEmpriseParPolygone(e: EmpriseReconstruite, reperesParCleabs: Map<string, string>): string {
  const cleabsRec = cleabsSourceEmprise(e).filter((c) => reperesParCleabs.has(c));
  return cleabsRec.length ? libellePolygones(cleabsRec, (c) => reperesParCleabs.get(c)!) : 'Emprise reconstituée';
}

/**
 * AFF-1 / AFF-3 — BLOC REPLIÉ (fermé par défaut) « Bâtiment(s) au statut projet… affecté(s) ». Résumé = titre + décompte. UNE SEULE
 * liste : par bâtiment (nom résolu UNE fois), les EMPRISES rattachées, chaque ligne ÉTIQUETÉE par le repère de son polygone source
 * (Polygone C/D/I…) et portant TOUTE la richesse (provenance, surface, résidu, page — via ListeEmprises). Les emprises NON rattachées
 * (orphelines) sont listées à part (nature distincte, jamais mélangée). `<details>` natif. Rien si aucune emprise. PUR.
 */
export function BlocProjetRepliable({ emprises, polygones, batiments }: {
  emprises: EmpriseReconstruite[]; polygones: PolygoneRepere[]; batiments: { corpsId: number; repere: string | null; nomRepli?: string | null }[];
}) {
  const reperesParCleabs = new Map(polygones.filter((p) => p.cleabs).map((p) => [p.cleabs as string, p.repere]));
  const repereSource = (e: EmpriseReconstruite) => labelEmpriseParPolygone(e, reperesParCleabs);
  const parBatiment = batiments
    .map((b) => ({ b, emp: emprises.filter((e) => e.corpsId === b.corpsId) }))
    .filter((x) => x.emp.length > 0);
  const orphelines = emprises.filter((e) => e.corpsId === null || !batiments.some((b) => b.corpsId === e.corpsId));
  const total = parBatiment.reduce((s, x) => s + x.emp.length, 0);
  if (total === 0 && orphelines.length === 0) return null;
  return (
    <details style={{ ...carte }} data-bloc="projet">
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Bâtiment(s) au statut « projet » en base BD TOPO affecté(s) au projet de bâtiment <span style={{ fontWeight: 400, color: 'var(--color-svv-muted)' }}>— {total} emprise{total > 1 ? 's' : ''}{orphelines.length > 0 ? ` + ${orphelines.length} non rattachée${orphelines.length > 1 ? 's' : ''}` : ''}</span></summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.4rem' }}>
        {parBatiment.map(({ b, emp }) => (
          <div key={b.corpsId} data-corps={b.corpsId}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{nomAffichageCorps({ repere: b.repere, nomRepli: b.nomRepli, corpsId: b.corpsId })}</div>
            <ListeEmprises emprises={emp} repereSource={repereSource} />
          </div>
        ))}
        {orphelines.length > 0 && (
          <div data-orphelines="true">
            <div style={{ fontSize: 12, fontWeight: 600 }}>Emprises non rattachées à un bâtiment</div>
            <ListeEmprises emprises={orphelines} repereSource={repereSource} />
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * AFF-1 — BLOC REPLIÉ (fermé par défaut) « Bâtiments existants de la ou des parcelles du permis ». Résumé = titre + décompte (N
 * bâtiments). Ouvert : EXACTEMENT le contenu de StatutPolygonesExistants (mention rouge, taux, mixte, boutons, historique), sans son
 * titre interne (porté par le résumé). `<details>` natif. Rien si aucun bâtiment statuable. PUR.
 */
export function BlocExistantsRepliable({ polygones, recouverts, statuts, onStatuer }: {
  polygones: PolygoneRepere[]; recouverts: readonly PolygoneRecouvert[]; statuts: Map<string, EtatStatutPolygone>;
  onStatuer: (cleabs: string, statut: 'preserve' | 'detruit' | 'revoque') => void;
}) {
  const n = nbBatimentsStatuables(polygones, recouverts);
  if (n === 0) return null;
  return (
    <details style={{ ...carte }} data-bloc="existants">
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Affectation (préservé/détruit) des bâtiments existants de la ou des parcelles du permis <span style={{ fontWeight: 400, color: 'var(--color-svv-muted)' }}>— {n} bâtiment{n > 1 ? 's' : ''}</span></summary>
      <div style={{ marginTop: '.4rem' }}>
        <StatutPolygonesExistants polygones={polygones} recouverts={recouverts} statuts={statuts} onStatuer={onStatuer} sansEntete />
      </div>
    </details>
  );
}

/**
 * PROJ-3h/3i ④ — LÉGENDE : nomme les TROIS catégories (le mot porte l'info) + un picto « ⓘ » (natif `<details>`, sans JS) qui ouvre
 * une explication courte en français simple : d'où vient chaque catégorie. PUR.
 */
export function LegendeSchemaProjection() {
  const item = (bord: CSSProperties, texte: string) => (
    <span style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center', fontSize: 11 }}>
      <span aria-hidden style={{ width: 14, height: 10, display: 'inline-block', ...bord }} /><span>{texte}</span>
    </span>
  );
  return (
    <div role="note" style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', marginTop: '.15rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
        {item({ background: 'rgba(0,0,0,.06)', border: '1px solid #888' }, 'Bâti existant (BD TOPO)')}
        {item({ background: 'rgba(31,119,180,.14)', border: '1px dashed #1f77b4' }, 'En projet (donnée IGN)')}
        {item({ background: 'rgba(163,4,2,.18)', border: '1px solid var(--color-svv-red)' }, 'Emprise tracée (reconstitution — jamais une mesure)')}
        {/* RATT-3 — DÉCISIONS enregistrées sur l'existant (jamais des faits) : une couleur ne traduit qu'une décision en base. */}
        {item({ background: 'rgba(46,158,91,.22)', border: '1px solid var(--color-svv-green-ink)' }, 'Décidé « préservé » (prévision)')}
        {item({ background: 'rgba(217,119,6,.22)', border: '1px solid #c26a00' }, 'Décidé « détruit » (prévision)')}
      </div>
      <details style={{ fontSize: 11 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--color-svv-red)' }} aria-label="Explication des catégories du schéma">ⓘ Que veut dire chaque catégorie ?</summary>
        <div style={{ color: 'var(--color-svv-muted)', marginTop: '.2rem', lineHeight: 1.35 }}>
          <div><strong>Bâti existant</strong> : donnée officielle IGN — des bâtiments déjà construits sur le terrain.</div>
          <div><strong>En projet</strong> : donnée officielle IGN — des bâtiments dessinés dans les données mais pas encore construits.</div>
          <div><strong>Emprise tracée</strong> : un contour que vous avez dessiné à la main (une reconstitution, jamais une mesure). Il ne sert qu’à visualiser : il n’alimente ni le verdict, ni l’altitude, ni un certificat.</div>
          <div><strong>Décidé « préservé » / « détruit »</strong> : votre décision ENREGISTRÉE sur un bâtiment existant (vert = préservé, orange = détruit). C’est une PRÉVISION, à confronter à la mise à jour cadastrale — jamais un fait. Un bâtiment sans décision reste gris, même recouvert par l’emprise projetée.</div>
        </div>
      </details>
    </div>
  );
}

/** AFF-2 — dimensions de la ZONE DE DESSIN des miniatures : identiques à l'origine (SchemaEmpreinteSvg = 320×240) pour un cadrage/échelle
 *  strictement partagés (3b/3c). Ce sont des tailles d'affichage, jamais des variables métier. */
const MINI_L = 320, MINI_H = 240;
const miniTitre: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' }; // AFF-2 (3a) — titre AU-DESSUS, jamais en surimpression
const miniSvgStyle: CSSProperties = { width: MINI_L, maxWidth: '100%', height: 'auto', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: '#fff', display: 'block' };

/**
 * RATT-3 / AFF-2 — miniature « Configuration projetée ». ÉCHELLE IDENTIQUE À L'ORIGINE : on dessine dans le MÊME schéma (`origine.schema`),
 * donc le MÊME viewBox (0 0 largeur hauteur) et la MÊME projection Lambert→boîte (`transform`) — un bâtiment occupe EXACTEMENT la même
 * place que dans « Configuration d'origine ». On réutilise les tracés DÉJÀ projetés (`schema.polygones[].path`), on RETIRE les bâtiments
 * décidés « détruit », on dessine le reste en GRIS (aucun vert/orange), et l'emprise projetée en ROUGE (projetée au MÊME cadre). PUR.
 */
export function MiniConfigProjetee({ schema, statuts, emprises = [] }: {
  schema: SchemaEmpreinte; statuts: Map<string, EtatStatutPolygone>; emprises?: { anneau: [number, number][] }[];
}) {
  if (schema.motif || !schema.transform) {
    return (
      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        <figcaption style={miniTitre}>Configuration projetée</figcaption>
        <div style={{ ...miniSvgStyle, width: MINI_L, aspectRatio: `${MINI_L} / ${MINI_H}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-svv-muted)', fontSize: 11, textAlign: 'center', padding: '.4rem' }}>{schema.motif ?? 'schéma indisponible'}</div>
      </figure>
    );
  }
  const t = schema.transform;
  const restants = schema.polygones.filter((p) => !(p.cleabs !== null && statuts.get(p.cleabs)?.statut === 'detruit')); // « détruits » retirés
  const cheminEmprise = (anneau: [number, number][]) => anneau.map((pt, i) => `${i === 0 ? 'M' : 'L'}${projeterLambertDansSchema(t, pt[0], pt[1]).join(',')}`).join(' ') + ' Z';
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
      <figcaption style={miniTitre}>Configuration projetée</figcaption>
      <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} style={miniSvgStyle} role="img" aria-label="Configuration projetée : la parcelle après travaux, bâtiments détruits retirés, emprise projetée en rouge">
        {schema.empreintePath && <path d={schema.empreintePath} fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.2} />}
        {restants.map((p) => <path key={p.cleabs ?? p.repere} d={p.path} data-repere={p.repere} fill="rgba(0,0,0,.06)" stroke="#888" strokeWidth={1} />)}
        {emprises.map((e, i) => (e.anneau.length >= 3 ? <path key={i} d={cheminEmprise(e.anneau)} fill="rgba(163,4,2,.18)" stroke="var(--color-svv-red)" strokeWidth={1.4} data-emprise-projetee={i} /> : null))}
      </svg>
      <div style={{ fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.35 }}>La parcelle telle qu’elle sera après travaux : bâtiments décidés « détruits » retirés, emprise projetée en rouge. Prévision, à confronter à la configuration officielle.</div>
    </figure>
  );
}

/**
 * RATT-3 / AFF-2 — 3e emplacement « Configuration officielle » : case GRISÉE, non cliquable, en attente de la mise à jour cadastrale.
 * AFF-2 (3b) : même structure que les deux miniatures — titre AU-DESSUS + zone de MÊME taille (320×240) — pour un alignement propre.
 * AUCUNE donnée à charger. PUR.
 */
export function CaseConfigOfficielle({ millesime }: { millesime: string | null }) {
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
      <figcaption style={{ ...miniTitre, opacity: 0.55 }}>Configuration officielle</figcaption>
      <div aria-disabled="true" style={{ width: MINI_L, maxWidth: '100%', aspectRatio: `${MINI_L} / ${MINI_H}`, border: '1px dashed var(--color-svv-line)', borderRadius: '.4rem', background: 'rgba(0,0,0,.03)', display: 'flex', flexDirection: 'column', gap: '.35rem', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '.6rem .7rem', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>en attente de la mise à jour par l’administration</div>
        <div style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>BD TOPO courant : {millesime ?? 'non renseigné'}</div>
      </div>
    </figure>
  );
}

/** NOM-2 — libellé lisible d'un statut proposé au rattrapage. */
function libelleStatutRattrapage(s: 'detruit' | 'mixte' | 'revoque'): string {
  return s === 'detruit' ? 'détruit' : s === 'mixte' ? 'partiellement détruit' : 'révocation (plus recouvert)';
}

/**
 * NOM-2 — PANNEAU de RATTRAPAGE du dossier courant. FERMÉ : un bouton qui dit combien d'écritures sont en attente. OUVERT : l'APERÇU
 * exact de ce qui sera écrit (noms de bâtiment manquants + statuts de recouvrement, avec taux) AVANT toute écriture — rien ne part en
 * base sans qu'Arno ait vu la liste et confirmé. Append-only : une écriture non voulue ne se corrige pas, elle s'ajoute (dit à l'écran).
 * S'auto-masque s'il n'y a rien à rattraper. PUR (l'état vit dans la Vue ; les gestes ne font que remonter l'intention).
 */
export function PanneauRattrapage({ apercu, ouvert, occupe = false, onOuvrir, onAppliquer, onAnnuler }: {
  apercu: ApercuRattrapage; ouvert: boolean; occupe?: boolean; onOuvrir: () => void; onAppliquer: () => void; onAnnuler: () => void;
}) {
  if (rattrapageVide(apercu)) return null; // rien à rattraper → pas de bouton
  const n = apercu.noms.length + apercu.statuts.length;
  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .7rem', fontSize: 12 };
  if (!ouvert) {
    return (
      <button type="button" style={{ ...btn, fontWeight: 700 }} onClick={onOuvrir}>Rattraper les noms et statuts manquants <span style={{ fontWeight: 400, color: 'var(--color-svv-muted)' }}>({n} en attente)</span></button>
    );
  }
  return (
    <div style={{ ...carte }} role="group" aria-label="rattrapage : ce qui sera écrit">
      <div style={{ fontSize: 12, fontWeight: 700 }}>Rattrapage — ce qui sera écrit</div>
      <div style={{ fontSize: 11, color: 'var(--color-svv-muted)', marginBottom: '.3rem' }}>Registre append-only : une écriture non voulue ne se corrige pas, elle s’ajoute. Vérifiez avant d’appliquer. Une décision prise à la main (« préservé »/« détruit » saisi) n’est jamais proposée ici.</div>
      {apercu.noms.length > 0 && (
        <div style={{ marginBottom: '.4rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Noms de bâtiment</div>
          <ul style={{ margin: '.1rem 0 0', paddingLeft: '1.1rem', fontSize: 12 }}>
            {apercu.noms.map((nm) => <li key={nm.corpsId} data-nom={nm.corpsId}>{nm.nomActuel} → <strong>{nm.nomFutur}</strong></li>)}
          </ul>
        </div>
      )}
      {apercu.statuts.length > 0 && (
        <div style={{ marginBottom: '.4rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Statuts de recouvrement</div>
          <ul style={{ margin: '.1rem 0 0', paddingLeft: '1.1rem', fontSize: 12 }}>
            {apercu.statuts.map((s) => <li key={s.cleabs} data-statut={s.cleabs}>Polygone {s.repere} → <strong>{libelleStatutRattrapage(s.statut)}</strong>{s.tauxPct !== null ? ` (recouvert à ${Math.round(s.tauxPct)} %)` : ''}</li>)}
          </ul>
        </div>
      )}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <button type="button" style={{ ...btn, fontWeight: 700 }} disabled={occupe} onClick={onAppliquer}>Appliquer</button>
        <button type="button" style={btn} disabled={occupe} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}
