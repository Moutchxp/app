import type { CSSProperties } from 'react';
import {
  projeterDansBoite, type Boite, type PointLambert, type VerdictCalage, type VerdictVraisemblance,
} from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite, ProjectionIgnoree } from '../../../../lib/permis/empriseReconstruiteRepo';
import type { VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import { estTracable, type FamillePlan } from '../../../../lib/permis/planMasse';

/** PROJ-3g — libellé lisible d'une famille (le MOT porte l'info, jamais la couleur seule). PUR. */
export function libelleFamille(f: FamillePlan): string {
  return f === 'masse' ? 'plan de masse' : f === 'etage' ? 'plan d’étage' : 'coupe / élévation';
}

/** PROJ-3g — message du VERROU métier : pourquoi on ne peut pas tracer ici (jamais un bouton grisé muet). null si traçable. PUR. */
export function messageVerrou(f: FamillePlan | null): string | null {
  if (estTracable(f)) return null;
  const quoi = f === 'coupe' ? 'une coupe / élévation' : f === 'etage' ? 'un plan d’étage' : 'une vue qui n’est pas un plan de masse';
  return `Cette vue est ${quoi} : on ne peut y tracer une emprise, qui se trace sur une vue du dessus (le plan de masse).`;
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
export interface Planche { page: number; echelle: string | null }
export interface PiecePlan { id: number; nomFichier: string; propose?: boolean; famille?: FamillePlan | null; planches?: Planche[]; confirme?: boolean }

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
export interface Plan { pieceId: number; page: number; nomFichier: string; echelle: string | null; confirme: boolean; famille: FamillePlan }

/**
 * Construit la bande à feuilleter à partir des pièces déjà CLASSÉES (ordre masse → étage → coupe, PAS recalculé). PROJ-3f : un
 * plan = une PAGE ; une pièce proposée est ÉCLATÉE en une entrée par PLANCHE (pages hors cartouche, calculées serveur), sinon REPLI
 * page 1. PROJ-3g : chaque entrée porte sa FAMILLE (le mot est affiché). Les pièces non proposées restent au repli. PUR.
 */
export function construireBandePlans(pieces: PiecePlan[]): Plan[] {
  const out: Plan[] = [];
  for (const p of pieces) {
    if (!p.propose) continue;
    const famille: FamillePlan = p.famille ?? 'masse';
    const confirme = !!(p.planches && p.planches.length > 0);
    const planches = confirme ? p.planches! : [{ page: 1, echelle: null }];
    for (const pl of planches) out.push({ pieceId: p.id, page: pl.page, nomFichier: p.nomFichier, echelle: pl.echelle, confirme, famille });
  }
  return out;
}

/** Borne un index dans [0 ; n-1] (0 si liste vide). PUR. */
export function bornerIndex(i: number, n: number): number { return n <= 0 ? 0 : Math.min(Math.max(0, i), n - 1); }
export function indexSuivant(i: number, n: number): number { return bornerIndex(i + 1, n); }
export function indexPrecedent(i: number, n: number): number { return bornerIndex(i - 1, n); }

/** Libellé lisible d'un plan (nom + n° de page dans la pièce + échelle si lue de façon fiable). PUR. */
export function libellePlan(p: Plan): string { return `${p.nomFichier} — page ${p.page}${p.echelle ? ` · échelle ${p.echelle}` : ''}`; }

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
      {!ok && <div style={{ color: 'var(--color-svv-ink)' }}>En attente : {verdict.manquants.map((m) => m.repere ?? `bâtiment ${m.corpsId}`).join(', ')}. Tracez une emprise ou ignorez explicitement la projection pour chacun avant de valider.</div>}
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

/** Liste des emprises DÉJÀ tracées : libellé, surface, 🔴 étiquette « reconstitution », résidu de calage, effacement. */
export function ListeEmprises({ emprises, onSupprimer }: { emprises: EmpriseReconstruite[]; onSupprimer?: (id: number) => void }) {
  if (emprises.length === 0) return <p style={muted}>Aucune emprise reconstituée pour ce dossier.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      {emprises.map((e) => (
        <li key={e.id} style={{ ...carte, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem' }}>
          <span>
            <strong>{e.libelle}</strong>{' '}
            <span style={{ ...muted, border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', padding: '0 .3rem' }}>reconstitution</span>{' '}
            {e.surfaceM2 !== null ? fmtM2(e.surfaceM2) : ''}{' '}
            <span style={muted}>· résidu {e.residuM !== null ? fmtM(e.residuM) : '—'}{e.page !== null ? ` · page ${e.page}` : ''}</span>
          </span>
          {onSupprimer && <button type="button" onClick={() => onSupprimer(e.id)} style={{ ...muted, cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', padding: '.15rem .5rem' }}>effacer</button>}
        </li>
      ))}
    </ul>
  );
}

/**
 * SCHÉMA de la PARCELLE (pur, SVG) : la parcelle en fond, les emprises reconstituées remplies + étiquetées, et — pendant le
 * calage — les points Lambert désignés. Projection Lambert→boîte PARTAGÉE (`projeterDansBoite`) : ce qui est dessiné ici est
 * exactement ce sur quoi Arno CLIQUE (l'inverse vit dans le module pur). `motif` explicite si la parcelle est absente.
 */
export function SchemaParcelleTrace({ boite, parcelle, emprises, calageLambert, onCliquer }: {
  boite: Boite | null; parcelle: PointLambert[][]; emprises: EmpriseReconstruite[]; calageLambert: PointLambert[]; onCliquer?: (px: { x: number; y: number }) => void;
}) {
  if (!boite || parcelle.length === 0) return <p style={muted}>Parcelle du permis absente : schéma non dessiné (aucun point fiable).</p>;
  const path = (anneau: PointLambert[]) => anneau.map((p, i) => { const q = projeterDansBoite(boite, p); return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ') + ' Z';
  return (
    <svg width={boite.largeur} height={boite.hauteur} viewBox={`0 0 ${boite.largeur} ${boite.hauteur}`} role="img" aria-label="schéma de la parcelle et des emprises reconstituées"
      style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: '#fff', cursor: onCliquer ? 'crosshair' : 'default' }}
      onClick={onCliquer ? (ev) => { const r = (ev.target as SVGElement).ownerSVGElement?.getBoundingClientRect() ?? (ev.currentTarget as SVGSVGElement).getBoundingClientRect(); onCliquer({ x: ev.clientX - r.left, y: ev.clientY - r.top }); } : undefined}>
      {parcelle.map((a, i) => <path key={`p${i}`} d={path(a)} fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.2} />)}
      {emprises.map((e) => e.anneau.length >= 3 && <path key={`e${e.id}`} d={path(e.anneau)} fill="rgba(163,4,2,.18)" stroke="var(--color-svv-red)" strokeWidth={1.4} data-emprise={e.id} />)}
      {calageLambert.map((p, i) => { const q = projeterDansBoite(boite, p); return <g key={`c${i}`}><circle cx={q.x} cy={q.y} r={4} fill="var(--color-svv-red)" /><text x={q.x + 6} y={q.y - 6} fontSize={11} fill="var(--color-svv-red)">{i + 1}</text></g>; })}
    </svg>
  );
}
