import type { CSSProperties, ReactNode } from 'react';
import { descriptionActeurParcelle } from '../../../../lib/permis/acteurParcelle'; // PL-C4 — provenance honnête de la sélection
import type { SelectionInfo } from '../../../../lib/permis/plancheParcellesRepo';
import { jourFrParis } from '../../../../lib/permis/horodatageParis'; // LOT 49 : « décidé le … » en heure de Paris
import {
  projeterDansBoite, boiteEnglobanteRotee, clicVersBoiteMeet, type Boite, type PointLambert, type VerdictCalage, type VerdictVraisemblance, type Debordement, type CadreVue,
} from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite, ProjectionIgnoree, PolygoneBdTopo, ProvenanceEmprise, ObjetContexte } from '../../../../lib/permis/empriseReconstruiteRepo';
import { libelleBatiment, resumeProjection, type VerdictProjection } from '../../../../lib/permis/projectionBatiments';
import { nomAffichageCorps } from '../../../../lib/permis/nomCorps'; // NOM-1 — le SEUL décideur du nom d'affichage d'un corps
import { estTracable, type FamillePlan } from '../../../../lib/permis/planMasse';
import { estFuturBati } from '../../../../lib/permis/etatBati';
import { estStatuable, TOLERANCE_RECOUVREMENT_TOTAL_PCT, type EtatStatutPolygone, type PolygoneRecouvert } from '../../../../lib/permis/polygoneStatut'; // RATT-1 (2) : statut décidé ; RATT-5 : recouvert + taux ; RATT-6 : mixte
import { rattrapageVide, type ApercuRattrapage } from '../../../../lib/permis/rattrapage'; // NOM-2 — aperçu du rattrapage (noms + statuts)
import { repereDepuisIndex, projeterLambertDansSchema, type SchemaEmpreinte } from '../../../../lib/permis/affectationSchema'; // AFF-2 : projetée au MÊME cadre que l'origine

/**
 * PL-C4 — BANDEAU « Empreinte : sélection validée / configuration automatique » sous le curseur Rotation, avant le schéma. PUR
 * (aucun état interne ; le geste de retrait est un GESTE DÉLIBÉRÉ à deux temps piloté par le parent : `confirme` + callbacks). Le
 * retrait RECALCULE (empreinte + bâti + projection) → on le DIT, jamais un lien anodin. Provenance HONNÊTE (acteur résolu, sinon brut).
 */
export function BandeauSelection({ selection, confirme, enCours, onDemander, onConfirmer, onAnnuler }: {
  selection: SelectionInfo; confirme: boolean; enCours: boolean; onDemander: () => void; onConfirmer: () => void; onAnnuler: () => void;
}) {
  if (!selection.active) return <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>Empreinte : <strong style={{ color: 'var(--color-svv-ink)' }}>configuration automatique</strong>.</div>;
  const d = descriptionActeurParcelle({ majPar: selection.validePar, majLe: selection.valideLe, acteurNom: selection.acteurNom });
  const lien: CSSProperties = { width: 'auto', padding: '.05rem .3rem', fontSize: 11.5, alignSelf: 'flex-start' };
  return (
    <div role="note" style={{ fontSize: 12, border: '1px solid var(--color-svv-green-ink)', borderRadius: '.4rem', padding: '.35rem .55rem', display: 'flex', flexDirection: 'column', gap: '.25rem', background: 'var(--color-svv-field)' }}>
      <div>
        <strong style={{ color: 'var(--color-svv-green-ink)' }}>Empreinte : sélection validée</strong> ({selection.idus.length} parcelle{selection.idus.length > 1 ? 's' : ''}) —{' '}
        par <strong>{d.qui}</strong>{d.aLaMain ? null : <span style={{ fontStyle: 'italic', color: 'var(--color-svv-muted)' }}> (auteur non identifié)</span>}{d.quand ? <> le {d.quand}</> : null}.
      </div>
      {!confirme ? (
        <button type="button" className="svv-link" style={lien} disabled={enCours} onClick={onDemander}>revenir à la configuration d’origine…</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
          <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>⚠ Cela RECALCULE l’empreinte, la photo du bâti et la projection de ce permis (réversible).</span>
          <span style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.25rem .55rem', fontSize: 11.5, minHeight: 34 }} disabled={enCours} onClick={onConfirmer}>Confirmer le retour à l’origine</button>
            <button type="button" className="svv-link" style={{ ...lien, alignSelf: 'center' }} disabled={enCours} onClick={onAnnuler}>annuler</button>
          </span>
        </div>
      )}
    </div>
  );
}

/** PROJ-3g — libellé lisible d'une famille (le MOT porte l'info, jamais la couleur seule). PUR. */
export function libelleFamille(f: FamillePlan | null): string {
  return f === 'masse' ? 'plan de masse' : f === 'etage' ? 'plan d’étage' : f === 'cerfa' ? 'Cerfa (formulaire)' : f === 'coupe' ? 'coupe / élévation' : 'plan'; // LOT 92 : null (page ajoutée, famille inconnue) → « plan »
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
const carte: CSSProperties = { border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.6rem .8rem', background: 'var(--color-svv-surface)' }; // LOT 84 : surface (= #fff exact en clair) → texte token lisible en sombre

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
export interface PiecePlan { id: number; nomFichier: string; propose?: boolean; famille?: FamillePlan | null; planches?: Planche[]; confirme?: boolean; niveaux?: string[]; cerfa?: boolean }

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
export function SelecteurPiecePlan({ pieces, pieceId, onChoisir, nonSupportees = [] }: { pieces: PiecePlan[]; pieceId: number | null; onChoisir: (id: number) => void; nonSupportees?: { id: number; nomFichier: string; motif: string }[] }) {
  const { proposees, autres } = grouperPieces(pieces);
  // BUG « voir toutes les pièces » — les pièces NON AFFICHABLES (format non PDF) étaient ÉCARTÉES SILENCIEUSEMENT (jamais passées ici).
  //   Règle du projet (piège LOT 71 / demande Arno) : ne jamais faire disparaître sans le dire → on les liste AVEC leur motif, DÉSACTIVÉES.
  return (
    <select value={pieceId ?? ''} onChange={(e) => onChoisir(Number(e.target.value) || 0)} aria-label="Pièce à tracer (plans de masse proposés en tête ; pièces non affichables signalées)" style={{ maxWidth: 320, fontSize: 12 }}>
      {pieces.length === 0 && nonSupportees.length === 0 && <option value="">aucune pièce</option>}
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
      {nonSupportees.length > 0 && (
        <optgroup label="Non affichables (format)">
          {nonSupportees.map((p) => <option key={`ns${p.id}`} value="" disabled>{p.nomFichier} — {p.motif}</option>)}
        </optgroup>
      )}
    </select>
  );
}

/** LOT 64 — état d'analyse PAYANTE (par image) d'une pièce : nb de planches trouvées + date lisible (déjà formatée par l'appelant). */
// ── LOT 97 — ÉTAT D'ANALYSE IA d'une pièce, à DEUX AXES INDÉPENDANTS (à ne jamais écraser l'un par l'autre) ────────────────────────
//   · ÉTENDUE : 'complete' (analyse du FICHIER entier = repérage LOT 62, grain PIÈCE) vs 'partielle' (LECTURE DE PAGE LOT 95, grain PAGE).
//   · ORIGINE : 'manuelle' | 'auto' | 'indeterminee'. 🔴 FAIT SOURCÉ (recon LOT 97) : les DEUX mécaniques d'analyse IMAGE sont MANUELLES
//     par construction — seuls les gestes de la liseuse écrivent `permis_planche_vision_run` / `permis_page_lecture` ; AUCUNE analyse
//     image automatique n'y écrit (le diagnostic auto 56-C passe par le journal d'extraction, pas ces tables). On n'INVENTE donc JAMAIS
//     'auto' : `etatAnalyseIA` conclut 'manuelle'. 'auto'/'indeterminee' existent pour le jour où une origine serait réellement persistée.
export type EtendueAnalyse = 'complete' | 'partielle';
export type OrigineAnalyse = 'manuelle' | 'auto' | 'indeterminee';
export interface EtatAnalyseIA { etendue: EtendueAnalyse; origine: OrigineAnalyse; dateLisible: string | null; nbPlanches: number; nbPagesLues: number }

/** Entrées BRUTES par pièce (résilientes : `undefined` si repérage absent / migration 195 absente → aucune lecture). */
export interface EntreesAnalyseIA {
  reperage?: { nbPlanches: number; creeLe: string | null };   // LOT 62 — grain PIÈCE (fichier complet)
  lectures?: { envoyee: boolean; creeLe: string | null }[];   // LOT 95 — grain PAGE (une entrée par page passée)
}

/** PROV — date la plus RÉCENTE d'une liste d'ISO (tri lexical = chronologique sur ISO). PUR. */
function dateMaxIso(iso: readonly (string | null)[]): string | null {
  const ok = iso.filter((x): x is string => !!x).slice().sort();
  return ok.length ? ok[ok.length - 1] : null;
}

/**
 * PURE — combine repérage (grain PIÈCE = FICHIER COMPLET) et lectures de page (grain PAGE = PARTIELLE) en un état d'analyse IA à deux
 * axes, ou `null` si AUCUNE analyse (→ « jamais analysée », pas de pastille). Le repérage PRIME l'étendue (le fichier entier l'emporte
 * sur une page). ORIGINE = 'manuelle' (fait sourcé, jamais 'auto' inventé). `formaterDate` injecté (jourParisISO en prod, identité en
 * test). RÉSILIENT : entrées absentes → `null`.
 */
export function etatAnalyseIA(e: EntreesAnalyseIA, formaterDate: (iso: string) => string = (s) => s): EtatAnalyseIA | null {
  const lectures = e.lectures ?? [];
  const nbPagesLues = lectures.filter((l) => l.envoyee).length; // pages réellement ENVOYÉES à l'IA (une page abstenue RGPD ne compte pas)
  if (e.reperage) {
    return { etendue: 'complete', origine: 'manuelle', dateLisible: e.reperage.creeLe ? formaterDate(e.reperage.creeLe) : null, nbPlanches: e.reperage.nbPlanches, nbPagesLues };
  }
  if (lectures.length > 0) {
    const d = dateMaxIso(lectures.map((l) => l.creeLe));
    return { etendue: 'partielle', origine: 'manuelle', dateLisible: d ? formaterDate(d) : null, nbPlanches: 0, nbPagesLues };
  }
  return null; // aucune analyse → jamais analysée (pas de pastille)
}

/** PURE — libellé EXPLICITE (title/aria) : étendue ET origine EN TOUTES LETTRES + date (l'info ne repose JAMAIS sur la couleur seule). */
export function libelleAnalyseIA(s: EtatAnalyseIA): string {
  const etendue = s.etendue === 'complete' ? 'analyse IA du fichier complet' : 'analyse IA partielle (pages seules)';
  const origine = s.origine === 'manuelle' ? 'déclenchée manuellement' : s.origine === 'auto' ? 'automatique' : 'origine indéterminée';
  const quand = s.dateLisible ? `, le ${s.dateLisible}` : '';
  const detail = s.etendue === 'complete'
    ? (s.nbPlanches > 0 ? ` — ${s.nbPlanches} planche${s.nbPlanches > 1 ? 's' : ''} repérée${s.nbPlanches > 1 ? 's' : ''}` : ' — aucune planche repérée')
    : (s.nbPagesLues > 0 ? ` — ${s.nbPagesLues} page${s.nbPagesLues > 1 ? 's' : ''} analysée${s.nbPagesLues > 1 ? 's' : ''}` : '');
  return `${etendue}, ${origine}${quand}${detail}`;
}

/** PURE — lettre d'ORIGINE portée par la pastille (2e variable visuelle, JAMAIS un 3e ton de bleu). */
export function lettreOrigineAnalyse(o: OrigineAnalyse): string { return o === 'manuelle' ? 'M' : o === 'auto' ? 'A' : '?'; }

/**
 * LOT 97 — PASTILLE d'état d'analyse IA (bas à droite d'une ligne de pièce). DEUX AXES : l'ÉTENDUE par le TON de bleu (complète = bleu
 * plein · partielle = bleu pâle) ; l'ORIGINE par une LETTRE (M/A/?), jamais un 3e ton. Zone hors canvas → tokens `--color-svv-*` (fond ET
 * texte basculent ensemble, clair comme sombre, contraste ≥ 4,5:1). `title`/`aria-label` disent tout EN TOUTES LETTRES (jamais la couleur
 * seule). Non cliquable (marqueur informatif). Aucune animation (prefers-reduced-motion respecté d'office).
 */
export function PastilleAnalyseIA({ s }: { s: EtatAnalyseIA }) {
  const libelle = libelleAnalyseIA(s);
  const complete = s.etendue === 'complete';
  return (
    <span role="img" title={libelle} aria-label={libelle}
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '.15rem', height: 18, padding: '0 .4rem', borderRadius: 999,
        fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
        background: complete ? 'var(--color-svv-blue)' : 'var(--color-svv-blue-soft)',
        color: complete ? 'var(--color-svv-surface)' : 'var(--color-svv-blue)',
        border: '1px solid var(--color-svv-blue)' }}>
      IA {lettreOrigineAnalyse(s.origine)}
    </span>
  );
}

// ── LOT 99 — STATUT D'ANALYSE PAR PAGE : TROIS AXES INDÉPENDANTS (jamais écrasés l'un dans l'autre) ────────────────────────────────
//   · NATURE   : 'ia' (vision) · 'sans_ia' (texte/AcroForm du document) · 'aucune'.
//   · ORIGINE  : 'manuelle' · 'auto' · 'indeterminee'. 🔴 FAITS SOURCÉS (recon LOT 99) :
//       - IA → TOUJOURS 'manuelle' (fait d'architecture : seuls les 2 boutons de la liseuse écrivent 191/195).
//       - sans_ia → 'indeterminee' : l'origine N'EST PAS TRACÉE. `permis_extraction_journal` n'a AUCUNE colonne d'origine/acteur ; le
//         discriminant existe au CALL (`analysePassage` auto vs `extraire/route` `majPar='extraction:relance:…'`) mais n'est écrit que
//         sur `maj_par` des colonnes de valeur (dernier écrivain, par champ), jamais par ligne de journal → on ne PRÉSUME jamais 'auto'.
//   · ÉTAT     : 'non_identifiee' · 'identifiee_non_lue' · 'valeurs_lues' · 'rien_lisible' · 'non_analysable' · 'ecarte_rgpd'.
//   GRAIN (recon) : l'IA au grain PAGE est MESURÉE (`permis_page_lecture`) ; le repérage IA et l'identification sans-IA (famille/Cerfa)
//   sont au grain FICHIER → statut de page DÉRIVÉ (`derive:true`, dit « d'après l'analyse du fichier »). L'extraction sans-IA de VALEURS
//   est de fait au grain FICHIER (page NULL sur données réelles) → NON attribuable à une page → volontairement ABSENTE du statut de page.
export type NatureAnalyse = 'ia' | 'sans_ia' | 'aucune';
export type EtatAnalyse = 'non_identifiee' | 'identifiee_non_lue' | 'valeurs_lues' | 'rien_lisible' | 'non_analysable' | 'ecarte_rgpd';
export interface StatutPage { nature: NatureAnalyse; origine: OrigineAnalyse | null; etat: EtatAnalyse; derive: boolean; dateLisible: string | null }

/** Un motif d'abstention nomme-t-il un manque de TEXTE (→ non analysable) ou une donnée PERSONNELLE (→ écarté RGPD) ? PUR. */
function etatAbstention(motif: string | null | undefined): EtatAnalyse {
  return /sans texte/i.test(motif ?? '') ? 'non_analysable' : 'ecarte_rgpd';
}

/** Entrées BRUTES par page (toutes optionnelles → résilient). */
export interface EntreesStatutPage {
  lecturePage?: { envoyee: boolean; nbValeurs: number; motif: string | null; creeLe: string | null }; // LOT 95 — IA grain PAGE (mesuré)
  ecarteeReperage?: { motif: string };                                                                 // LOT 62 — cette page écartée pendant le repérage
  reperage?: { creeLe: string | null };                                                                // LOT 62 — repérage IA du FICHIER (dérivé)
  identifieeSansIa?: boolean;                                                                           // famille/Cerfa connue par le texte/nom (dérivé, sans IA)
  dateSansIa?: string | null;                                                                           // date d'identification sans-IA si connue
  origineSansIa?: OrigineAnalyse;                                                                        // LOT 100 — origine TRACÉE de l'extraction non-IA du dossier ('auto'/'manuelle'), sinon indéterminée
}

/**
 * PURE, SOURCE UNIQUE — les TROIS axes d'UNE page, EXCLUSIF (un seul état) et EXHAUSTIF (toute page a un état). Priorité : le MESURÉ au
 * grain page (IA) prime le DÉRIVÉ du fichier ; « lu » prime « identifié ». `formaterDate` injecté (jourParisISO en prod).
 */
export function statutPageAnalyse(e: EntreesStatutPage, formaterDate: (iso: string) => string = (s) => s): StatutPage {
  const d = (iso: string | null | undefined) => (iso ? formaterDate(iso) : null);
  if (e.lecturePage) {
    const l = e.lecturePage;
    if (!l.envoyee) return { nature: 'ia', origine: 'manuelle', etat: etatAbstention(l.motif), derive: false, dateLisible: d(l.creeLe) };
    if (l.nbValeurs > 0) return { nature: 'ia', origine: 'manuelle', etat: 'valeurs_lues', derive: false, dateLisible: d(l.creeLe) };
    return { nature: 'ia', origine: 'manuelle', etat: 'rien_lisible', derive: false, dateLisible: d(l.creeLe) };
  }
  if (e.ecarteeReperage) return { nature: 'ia', origine: 'manuelle', etat: etatAbstention(e.ecarteeReperage.motif), derive: false, dateLisible: d(e.reperage?.creeLe) };
  if (e.reperage) return { nature: 'ia', origine: 'manuelle', etat: 'identifiee_non_lue', derive: true, dateLisible: d(e.reperage.creeLe) };
  if (e.identifieeSansIa) return { nature: 'sans_ia', origine: e.origineSansIa ?? 'indeterminee', etat: 'identifiee_non_lue', derive: true, dateLisible: d(e.dateSansIa) }; // LOT 100 — origine tracée si connue, sinon indéterminée (jamais présumée)
  return { nature: 'aucune', origine: null, etat: 'non_identifiee', derive: false, dateLisible: null };
}

/** LIBELLÉ COURT à l'écran (en FRANÇAIS CLAIR, sans jargon interne). « page identifiée mais non analysée » remplace « page couverte (fichier) » (LOT 98). PUR. */
export function libelleStatutPage(s: StatutPage): string {
  switch (s.etat) {
    case 'valeurs_lues': return 'valeurs lues et intégrées';
    case 'rien_lisible': return 'analysée, aucune valeur lisible';
    case 'non_analysable': return 'non analysable (page sans texte)';
    case 'ecarte_rgpd': return 'écartée (données personnelles)';
    case 'identifiee_non_lue': return 'page identifiée mais non analysée';
    default: return 'page non identifiée';
  }
}

/** TITRE COMPLET (title/aria) — NATURE + ORIGINE + ÉTAT EN TOUTES LETTRES + date + « d'après l'analyse du fichier » si dérivé. PUR. */
export function titreStatutPage(s: StatutPage): string {
  const nature = s.nature === 'ia' ? 'analyse par IA (vision)' : s.nature === 'sans_ia' ? 'analyse sans IA (texte du document)' : 'aucune analyse';
  const origine = s.origine === 'manuelle' ? ', déclenchée manuellement' : s.origine === 'auto' ? ', automatique' : s.origine === 'indeterminee' ? ', origine indéterminée' : '';
  const quand = s.dateLisible ? `, le ${s.dateLisible}` : '';
  const derive = s.derive ? ' (d’après l’analyse du fichier)' : '';
  return `${libelleStatutPage(s)} — ${nature}${origine}${quand}${derive}`;
}

/** Lettres compactes portées par la pastille (2e/3e variables, jamais un ton de bleu de plus). NATURE : « IA » / « texte » ; ORIGINE : M / A / ?. */
function natureCourte(n: NatureAnalyse): string { return n === 'ia' ? 'IA' : n === 'sans_ia' ? 'texte' : ''; }
function lettreOriginePage(o: OrigineAnalyse | null): string { return o === 'manuelle' ? 'M' : o === 'auto' ? 'A' : o === 'indeterminee' ? '?' : ''; }

/** PURE — vue d'ensemble des pages analysées d'une pièce (individuelles triées + présence d'un repérage fichier). */
export interface ResumePagesAnalysees { pagesIndividuelles: number[]; fichier: boolean; dateFichier: string | null }
export function resumePagesAnalysees(
  lectures: readonly { page: number }[] | undefined,
  reperage: { creeLe: string | null } | undefined,
  formaterDate: (iso: string) => string = (s) => s,
): ResumePagesAnalysees {
  const pages = [...new Set((lectures ?? []).map((l) => l.page))].sort((a, b) => a - b);
  return { pagesIndividuelles: pages, fichier: !!reperage, dateFichier: reperage?.creeLe ? formaterDate(reperage.creeLe) : null };
}

/**
 * LOT 99 — PASTILLE de STATUT DE PAGE : la GRAMMAIRE du LOT 97 conservée (aucune 3e palette de bleu) — le TON porte la « famille » d'état
 * (valeurs lues = bleu PLEIN ; identifiée non lue = bleu PÂLE ; abstention/rien lisible = NEUTRE) ; NATURE (« IA »/« texte ») + ORIGINE
 * (M/A/?) portées par des LETTRES, jamais par la couleur. Le MOT (libellé à côté) porte l'état ; `title`/`aria-label` énoncent tout +
 * la date. 'non_identifiee' → aucune pastille. Hors canvas → tokens `--color-svv-*` (clair ET sombre).
 */
export function PastilleStatutPage({ s }: { s: StatutPage }) {
  if (s.etat === 'non_identifiee') return null;
  const titre = titreStatutPage(s);
  const fond = s.etat === 'valeurs_lues'
    ? { background: 'var(--color-svv-blue)', color: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-blue)' }
    : s.etat === 'identifiee_non_lue'
      ? { background: 'var(--color-svv-blue-soft)', color: 'var(--color-svv-blue)', border: '1px solid var(--color-svv-blue)' }
      : { background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)', border: '1px solid var(--color-svv-line)' }; // rien lisible / écartée / non analysable
  const lettres = [natureCourte(s.nature), lettreOriginePage(s.origine)].filter(Boolean).join('·');
  return (
    <span role="img" title={titre} aria-label={titre}
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 .4rem', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '.02em', ...fond }}>
      {lettres}
    </span>
  );
}

/**
 * LOT 64 — LISTE EXPLICITE des pièces du dossier pour la liseuse (remplace le `<select>` natif, qui replié n'affichait qu'UNE ligne
 * → Arno croyait n'avoir qu'une pièce). TOUTES les pièces sont visibles et cliquables ; les NON PDF apparaissent désactivées avec la
 * raison (jamais absentes en silence). ORDRE : pièces JAMAIS analysées PAR IMAGE d'abord (celles qui en ont le plus besoin, ex. PC200
 * « hors des pièces suivies »), puis les analysées — épinglage N10-J : on ne retrie PAS l'intérieur d'un groupe. L'ÉTAT porte sur
 * l'analyse PAYANTE seule (le best-of textuel gratuit ne compte pas), écrit en TEXTE (jamais la couleur seule). PUR.
 */
/**
 * DEMANDE 2 — CATÉGORIE(S) d'affichage d'une pièce dans la liste groupée. Ordre imposé (Arno) : masse → coupe → étage → cerfa →
 * indéterminé. DÉCISION Arno : une pièce est DUPLIQUÉE dans CHAQUE catégorie où AU MOINS UNE de ses pages appartient. Source réelle :
 * `planches[].famille` (par page) ; le booléen `cerfa` (contenu, n°13409) ajoute la catégorie Cerfa ; À DÉFAUT DE PLANCHE, la famille
 * de PIÈCE (nom/contenu) sert de repli ; sinon « indéterminé ». JAMAIS de catégorie devinée. PUR (testable sans DOM).
 */
export type CategoriePiece = 'masse' | 'coupe' | 'etage' | 'cerfa' | 'indetermine';
export const ORDRE_CATEGORIES: CategoriePiece[] = ['masse', 'coupe', 'etage', 'cerfa', 'indetermine'];
export function libelleCategoriePiece(c: CategoriePiece): string {
  return c === 'masse' ? 'Plan de masse' : c === 'coupe' ? 'Plan de coupe' : c === 'etage' ? 'Plan d’étage' : c === 'cerfa' ? 'Cerfa (formulaire)' : 'Indéterminé';
}
export function categoriesPiece(p: Pick<PiecePlan, 'planches' | 'famille' | 'cerfa'>): CategoriePiece[] {
  const cats = new Set<CategoriePiece>();
  for (const pl of p.planches ?? []) if (pl.famille === 'masse' || pl.famille === 'coupe' || pl.famille === 'etage') cats.add(pl.famille); // par PAGE
  if (p.cerfa) cats.add('cerfa');
  if (cats.size === 0 && (p.famille === 'masse' || p.famille === 'coupe' || p.famille === 'etage' || p.famille === 'cerfa')) cats.add(p.famille); // repli : famille de PIÈCE (nom/contenu) quand aucune planche
  if (cats.size === 0) cats.add('indetermine');
  return ORDRE_CATEGORIES.filter((c) => cats.has(c)); // toujours dans l'ordre canonique
}

export function ListePiecesAnalyse({ pieces, analyseParPiece, nonSupportees, pieceId, onChoisir, piecesBestOf }: {
  pieces: PiecePlan[];
  analyseParPiece: Record<number, EtatAnalyseIA>; // LOT 97 — état d'analyse IA à deux axes (repérage LOT 62 + lecture de page LOT 95)
  nonSupportees: { id: number; nomFichier: string; motif: string }[];
  pieceId: number | null;
  onChoisir: (id: number) => void;
  piecesBestOf?: ReadonlySet<number>; // DEMANDE 3 — pièces ayant AU MOINS une page/image dans le best-of (écrites en BLEU + repère textuel)
}) {
  const bestOf = piecesBestOf ?? new Set<number>();
  const etat = (p: PiecePlan): string => {
    const a = analyseParPiece[p.id];
    if (!a) return 'jamais analysée par image';
    if (a.etendue === 'complete') { const n = a.nbPlanches; return `analysée par image le ${a.dateLisible ?? '—'} · ${n > 0 ? `${n} planche${n > 1 ? 's' : ''} trouvée${n > 1 ? 's' : ''}` : 'aucune planche trouvée'}`; }
    const k = a.nbPagesLues; return `analysée par image (pages) le ${a.dateLisible ?? '—'} · ${k} page${k > 1 ? 's' : ''} analysée${k > 1 ? 's' : ''}`;
  };
  const ligne: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '.05rem', width: '100%', textAlign: 'left', minHeight: 36, padding: '.3rem .45rem', borderRadius: '.4rem', fontSize: 12, wordBreak: 'break-word' };
  const enteteCat: CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--color-svv-muted)', margin: '.35rem 0 .1rem' };
  const ulStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.25rem' };
  // DEMANDE 3 — le best-of est porté par un REPÈRE TEXTUEL (★ best-of) EN PLUS du bleu (jamais la couleur seule → accessible). Le bleu
  //   `--color-svv-blue` est THÉMATISÉ (clair #1a4d8f / sombre #7ab0f5) et le fond de la liste suit le thème → lisible dans les deux.
  const rendreItem = (p: PiecePlan, cat: CategoriePiece) => {
    const courante = p.id === pieceId;
    const a = analyseParPiece[p.id];
    const enBestOf = bestOf.has(p.id);
    return (
      <li key={`${cat}-${p.id}`}>
        <button type="button" onClick={() => onChoisir(p.id)} aria-current={courante ? 'true' : undefined}
          title={enBestOf ? 'au moins une page de ce document est dans le best-of' : undefined}
          style={{ ...ligne, cursor: 'pointer', border: `1px solid ${courante ? 'var(--color-svv-ink)' : 'var(--color-svv-line)'}`, background: courante ? 'var(--color-svv-field)' : 'transparent', color: 'inherit' }}>
          <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap', color: enBestOf ? 'var(--color-svv-blue)' : undefined }}>
            {/* LOT 66 — catégorie « Cerfa » : marqueur posé PAR CONTENU (n° 13409). */}
            {p.cerfa && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', padding: '.05rem .3rem', borderRadius: '.25rem', background: 'var(--color-svv-red)', color: '#fff' }}>Cerfa</span>}
            {/* DEMANDE 3 — repère TEXTUEL du best-of (compréhensible sans distinguer les couleurs). */}
            {enBestOf && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-svv-blue)', border: '1px solid var(--color-svv-blue)', borderRadius: '.25rem', padding: '.02rem .25rem' }}>★ best-of</span>}
            <span>{p.nomFichier}{p.propose ? '' : ' — hors des pièces suivies'}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <span style={{ fontSize: 11, color: 'var(--color-svv-muted)', flex: '1 1 auto', minWidth: 0 }}>{etat(p)}</span>
            {a && <PastilleAnalyseIA s={a} />}
          </span>
        </button>
      </li>
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
      {/* DEMANDE 2 — GROUPES par catégorie, dans l'ordre imposé. Une pièce multi-types apparaît dans CHAQUE groupe concerné (décision Arno). */}
      {ORDRE_CATEGORIES.map((cat) => {
        const membres = pieces.filter((p) => categoriesPiece(p).includes(cat));
        if (membres.length === 0) return null;
        return (
          <div key={cat}>
            <div style={enteteCat}>{libelleCategoriePiece(cat)}</div>
            <ul role="list" style={ulStyle}>{membres.map((p) => rendreItem(p, cat))}</ul>
          </div>
        );
      })}
      {/* Acquis 9decccf — pièces NON AFFICHABLES (format) : listées, DÉSACTIVÉES, avec motif. Jamais écartées en silence. */}
      {nonSupportees.length > 0 && (
        <div>
          <div style={enteteCat}>Non affichables (format)</div>
          <ul role="list" style={ulStyle}>
            {nonSupportees.map((p) => (
              <li key={`ns-${p.id}`}>
                <div style={{ ...ligne, opacity: 0.6, border: '1px solid var(--color-svv-line)', cursor: 'not-allowed' }} aria-disabled="true">
                  <span style={{ fontWeight: 600 }}>{p.nomFichier}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>impossible à ouvrir — {p.motif}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── PROJ-3e — BANDE DE PLANS : l'unité manipulée est LE PLAN (une page précise d'une pièce), plus « pièce » + « n° de page ». ──
export interface Plan { pieceId: number; page: number; nomFichier: string; echelle: string | null; confirme: boolean; famille: FamillePlan | null; tracable: boolean; ambigu: boolean; niveaux?: string[]; origine: 'texte' | 'image'; manuel?: boolean } // LOT 92 : famille null = page AJOUTÉE dont la famille est inconnue ; manuel = ajoutée à la main

/**
 * Construit la bande à feuilleter à partir des pièces déjà CLASSÉES (ordre masse → étage → coupe, PAS recalculé). PROJ-3f : un
 * plan = une PAGE ; une pièce proposée est ÉCLATÉE en une entrée par PLANCHE (pages hors cartouche, calculées serveur), sinon REPLI
 * page 1. PROJ-3g/3m : chaque entrée porte sa FAMILLE et sa TRAÇABILITÉ PAR PAGE (une planche de niveau d'une pièce PC3 est traçable).
 * Repli (non confirmée) : traçabilité au niveau de la PIÈCE. LOT 88 : la famille `cerfa` est EXCLUE (best-of = plans seuls). PUR.
 */
export function construireBandePlans(pieces: PiecePlan[]): Plan[] {
  const out: Plan[] = [];
  for (const p of pieces) {
    // LOT 88 — le best-of est « PLANS SEULS » : une pièce classée `cerfa` (par son contenu/nom) N'ENTRE PAS dans la bande (un Cerfa
    //   n'est pas un plan). On ne touche PAS au CLASSEMENT (la pièce RESTE un cerfa pour la complétude / recapCerfa) : seule la BANDE change.
    if (p.famille === 'cerfa') continue;
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

/** LOT 92 — rang d'ordre d'une famille dans la bande (masse → étage → coupe → cerfa → reste). `null` (page ajoutée de famille inconnue)
 *  se range en DERNIER (« reste »), après les familles connues. PUR. */
function rangFamillePlan(f: FamillePlan | null): number { return f === 'masse' ? 0 : f === 'etage' ? 1 : f === 'coupe' ? 2 : f === 'cerfa' ? 3 : 4; }

/**
 * LOT 92 — applique les OVERRIDES MANUELS (exclusions LOT 61 + inclusions LOT 92) à la bande AUTO. Le geste manuel L'EMPORTE sur le
 * calcul, dans les deux sens : on RETIRE les pages exclues, on AJOUTE les pages incluses ABSENTES de la bande (chacune construite depuis
 * sa pièce : nomFichier + famille du fichier, `null` si inconnue). Les ajouts se rangent dans leur famille (masse → coupe → …), les pages
 * de famille INCONNUE en fin (« reste »). Ordre stable : à rang égal, les pages AUTO gardent leur ordre, les ajouts viennent après. Une
 * page incluse dont la pièce a disparu de la GED est ignorée (jamais une entrée fantôme). Exclusions/inclusions sont mutuellement
 * exclusives (garanti côté route) → aucune page dans les deux. PUR (aucune I/O).
 */
export function bandeAvecOverrides(bandeAuto: Plan[], pieces: PiecePlan[], exclus: ReadonlySet<string>, inclus: ReadonlySet<string>): Plan[] {
  const cle = (pieceId: number, page: number) => `${pieceId}:${page}`;
  const visible = bandeAuto.filter((pl) => !exclus.has(cle(pl.pieceId, pl.page)));
  const dejaLa = new Set(visible.map((pl) => cle(pl.pieceId, pl.page)));
  const parId = new Map(pieces.map((p) => [p.id, p]));
  const ajoutees: Plan[] = [];
  for (const k of inclus) {
    if (dejaLa.has(k)) continue; // déjà proposée par l'auto → pas de doublon
    const [pid, pg] = k.split(':').map(Number);
    const p = parId.get(pid); if (!p) continue; // pièce disparue de la GED → inclusion sans objet
    const f = p.famille ?? null;
    ajoutees.push({ pieceId: pid, page: pg, nomFichier: p.nomFichier, echelle: null, confirme: true, famille: f, tracable: estTracable(f), ambigu: false, origine: 'texte', manuel: true });
  }
  const items = [
    ...visible.map((p, i) => ({ p, r: rangFamillePlan(p.famille), i })),
    ...ajoutees.map((p, i) => ({ p, r: rangFamillePlan(p.famille), i: 1_000_000 + i })), // après les auto de même rang
  ];
  items.sort((a, b) => a.r - b.r || a.i - b.i);
  return items.map((x) => x.p);
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
 * FIX « ascenseur du guide » — le bloc « Étape 1 — caler la vue » doit rester SOUS LE SCHÉMA pendant TOUT le processus de création
 * (calage amorcé → 1/2 → 2/2 → tracé des sommets → jusqu'à la validation), puis REVENIR à sa place initiale. Sa POSITION suit
 * l'EXISTENCE d'un travail en cours, JAMAIS le dernier côté cliqué. PUR (testable sans DOM).
 *
 * `arme` = mémoire « un processus est en cours », armée dès le 1er point posé et désarmée À LA VALIDATION par l'appelant — nécessaire car
 * les PAIRES de calage sont CONSERVÉES après enregistrement (« repère conservé ») : un simple `nbPaires>0` ne distinguerait pas « en cours »
 * de « validé ». `enPose` (planEnAttente ou un sommet) donne déjà la bonne réponse DANS le rendu courant, avant que `arme` ne persiste.
 * Le ET avec le travail réel (planEnAttente | paires | sommets) ramène le guide à sa place initiale à TOUTE remise à zéro
 * (annuler / Reprendre / Recommencer / changement de plan), sans câbler chaque handler. Retourne true ⇒ guide SOUS LE SCHÉMA.
 */
export function guideCalageSousSchema(arme: boolean, planEnAttente: boolean, nbPaires: number, nbSommets: number): boolean {
  const enPose = planEnAttente || nbSommets > 0;
  return (arme || enPose) && (planEnAttente || nbPaires > 0 || nbSommets > 0);
}

/**
 * PROJ-3e — barre de navigation « ‹ précédent / suivant › » d'une bande de plans, avec l'indicateur « plan i sur n » et le libellé
 * lisible du plan courant. Bande vide → renvoie vers le repli (jamais un cul-de-sac). PUR (renderToStaticMarkup).
 */
/**
 * CONSTAT — fond de la capsule de TYPE DE PAGE (« PLAN DE MASSE »…) : FOND VERT (jeton « validé » = `--color-svv-green-soft`, thème-aware,
 * texte sombre lisible dessus) quand l'IMAGE affichée est d'un type TRAÇABLE, sinon AUCUN fond. RÉUTILISE la notion existante `Plan.tracable`
 * (la MÊME que `accesTrace` / `estTracable`) : jamais une 2ᵉ règle qui pourrait diverger. La capsule décrit l'IMAGE, PAS l'avancement — elle
 * NE dépend NI du calage, NI du nombre de bâtiments, NI d'une emprise déjà tracée (ces empêchements restent portés par accesTrace + les
 * boutons). Type inconnu/absent → `tracable` faux/absent → aucun fond. N'active rien, ne débloque rien. PUR (seul le fond change, aucun reflow).
 */
export function fondCapsuleType(tracable: boolean | null | undefined): CSSProperties | null {
  return tracable === true ? { background: 'var(--color-svv-green-soft)' } : null;
}

export function BandePlans({ bande, index, onPrecedent, onSuivant }: { bande: Plan[]; index: number; onPrecedent: () => void; onSuivant: () => void }) {
  if (bande.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>Aucun plan de masse proposé — ouvrez « voir toutes les pièces du dossier » ci-dessous pour en choisir un.</p>;
  }
  const i = bornerIndex(index, bande.length);
  const p = bande[i];
  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .6rem', fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      {/* LOT « ligne de statut » — le TITRE « Best-of des plans proposés » a été DÉPLACÉ dans la barre partagée (ligne de statut, sous
          l'image) : ici ne reste que la paire de navigation entre PLANS. */}
      {/* LOT « paire unique » — l'UNIQUE paire ‹ précédent / suivant › visible sous l'image : « précédent » à l'EXTRÊME GAUCHE,
          « suivant » à l'EXTRÊME DROITE (space-between) ; tout le BLOC D'INFORMATION (plan i sur n, type/famille, niveaux, origine,
          nom du fichier + page + échelle) est CENTRÉ ENTRE les deux. C'est la navigation entre PLANS du best-of (jamais des pages). */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <button type="button" style={{ ...btn, flex: '0 0 auto', opacity: i <= 0 ? 0.4 : 1 }} disabled={i <= 0} onClick={onPrecedent} aria-label="Plan précédent">‹ précédent</button>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.15rem', textAlign: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>plan {i + 1} sur {bande.length}</span>
          <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* PROJ-3g — la FAMILLE est écrite (le mot porte l'info, jamais la couleur seule). CONSTAT : FOND VERT si l'image affichée est
                d'un type TRAÇABLE (fondCapsuleType ← p.tracable, même notion qu'accesTrace) ; seul le fond change (texte/taille/position inchangés, aucun reflow). */}
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', padding: '.05rem .35rem', ...fondCapsuleType(p.tracable) }}>{libelleFamille(p.famille)}</span>
            {/* SUITE — les NIVEAUX que porte une planche d'étage (RDC/SSOL/R+n), pour savoir ce qu'on ouvre (une planche multi-niveaux entre une seule fois). */}
            {p.niveaux && p.niveaux.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', padding: '.05rem .35rem' }}>niveaux : {p.niveaux.join(', ')}</span>}
            {/* LOT 62 — ORIGINE distinguée (le mot porte l'info) : « repérée par image » = analyse d'image (présence seule, fiabilité différente du texte) → Arno sait ce qu'il regarde. */}
            {p.origine === 'image' && <span style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', padding: '.05rem .35rem', color: 'var(--color-svv-muted)' }}>repérée par image</span>}
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-svv-muted)', wordBreak: 'break-word' }}>{libellePlan(p)}{p.confirme ? '' : ' (page à confirmer)'}</span>
        </div>
        <button type="button" style={{ ...btn, flex: '0 0 auto', opacity: i >= bande.length - 1 ? 0.4 : 1 }} disabled={i >= bande.length - 1} onClick={onSuivant} aria-label="Plan suivant">suivant ›</button>
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
export function NavPieceLibre({ page, nbPages, onPagePrecedente, onPageSuivante }: {
  page: number; nbPages: number; onPagePrecedente: () => void; onPageSuivante: () => void;
}) {
  const p = bornerPage(page, nbPages);
  const n = Math.max(1, nbPages);
  const btn: CSSProperties = { cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', padding: '.25rem .6rem', fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      {/* LOT « ligne de statut » — le TITRE « Pièce : … » et le « revenir au best-of » ont été DÉPLACÉS dans la ligne de statut de la barre
          (sous l'image). Ici ne reste que la paire de navigation entre PAGES de la pièce ouverte. */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <button type="button" style={{ ...btn, flex: '0 0 auto', opacity: p <= 1 ? 0.4 : 1 }} disabled={p <= 1} onClick={onPagePrecedente} aria-label="Page précédente">‹ page précédente</button>
        <span style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>page {p} sur {n}</span>
        <button type="button" style={{ ...btn, flex: '0 0 auto', opacity: p >= n ? 0.4 : 1 }} disabled={p >= n} onClick={onPageSuivante} aria-label="Page suivante">page suivante ›</button>
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
/**
 * LOT « cadre stable » — HAUTEUR FIXE de la zone de rendu (liseuse ET surface de dessin). Le cadre ne change plus de hauteur d'un plan
 * à l'autre : le contenu (canvas, width:100%, collé en haut-gauche, taille RÉELLE) DÉFILE dans ce cadre s'il dépasse (overflow:auto sur
 * un WRAPPER — jamais sur le conteneur de coordonnées, dont getBoundingClientRect reste live → calage intact). Valeur '62vh' : COHÉRENTE
 * avec le `hauteurMax='62vh'` du schéma (SchemaParcelleTrace) → les deux colonnes ont la même hauteur visuelle. Une seule constante, à ajuster ici.
 */
export const HAUTEUR_CADRE_RENDU = '62vh';

export function BandeauProjection({ verdict, nbValides = 0, nbAValider = 0 }: { verdict: VerdictProjection; nbValides?: number; nbAValider?: number }) {
  // SOURCE UNIQUE : resumeProjection décide le TON à partir de l'AVANCEMENT PAR BÂTIMENT. Jamais un ✓ vert tant que tout n'est pas
  //   validé : traçage incomplet → ROUGE « K en attente » ; tout couvert mais des emprises à valider → AMBRE « M validés · K à valider ».
  const r = resumeProjection(verdict, nbValides, nbAValider);
  const T = ({
    vert: { bord: 'var(--color-svv-green-ink)', fond: 'var(--color-svv-green-soft)', icone: '✓' },
    ambre: { bord: 'var(--color-svv-amber)', fond: 'var(--color-svv-amber-soft)', icone: '◐' },
    rouge: { bord: 'var(--color-svv-red)', fond: 'var(--color-svv-red-soft)', icone: '✕' },
    neutre: { bord: 'var(--color-svv-line)', fond: 'var(--color-svv-field)', icone: '—' }, // SANS OBJET (0 bâtiment) : gris neutre, ni vert ni rouge
  } as const)[r.ton];
  return (
    <div className="svv-card" data-peut-valider={verdict.peutValider} data-tout-valide={r.valide} data-ton={r.ton} style={{ fontSize: 12, borderColor: T.bord, background: T.fond }}>
      <div style={{ fontWeight: 700 }}>{T.icone} Projection des emprises — {r.texte}</div>
      {/* Phrase d'aide sous la capsule, sans jamais laisser de ponctuation orpheline : à 0 bâtiment il n'y a AUCUN manquant à lister
          (« En attente : . » supprimé) ; sinon on liste les bâtiments manquants comme avant. */}
      {verdict.aucunBatiment
        ? <div style={{ color: 'var(--color-svv-ink)' }}>Déclarez un bâtiment pour tracer une emprise.</div>
        : (!verdict.peutValider && verdict.manquants.length > 0 && <div style={{ color: 'var(--color-svv-ink)' }}>En attente : {verdict.manquants.map((m) => libelleBatiment(m)).join(', ')}. Tracez une emprise ou ignorez explicitement la projection pour chacun avant de valider.</div>)}
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
// PROJ-CTX — `contexte` FACULTATIF (rétro-compatible avec les littéraux existants) : parcelles voisines + bâti autour de l'empreinte
//   (3e registre). Par DÉFAUT ALLUMÉ (FILTRES_SCHEMA_DEFAUT). Le gate de rendu ET de fetch teste `contexte === true` (undefined = éteint).
export interface FiltresSchema { existant: boolean; futur: boolean; reperes: boolean; emprises: boolean; contexte?: boolean }
export const FILTRES_SCHEMA_DEFAUT: FiltresSchema = { existant: true, futur: true, reperes: true, emprises: true, contexte: true };

/**
 * Quels polygones BD TOPO sont VISIBLES : le FUTUR BÂTI (En projet OU En construction) piloté par `futur`, le reste (existant :
 * En service / En ruine) par `existant`. PUR (testable pour toute combinaison, y compris tout éteint → liste vide).
 */
export function polygonesVisibles<T extends { etat: string | null }>(polygones: T[], f: { existant: boolean; futur: boolean }): T[] {
  return polygones.filter((p) => (estFuturBati(p.etat) ? f.futur : f.existant));
}

/** PROJ-3i ① / RÈGLE ARNO — le repérage alphabétique (A, B, C…) ne NUMÉROTE QUE les bâtiments DU PERMIS (`appartientPermis !== false`) et
 *  repart de A ; les VOISINS (contexte) restent affichés mais SANS lettre (`repere: ''`). Ordre reçu (déterministe côté serveur). PUR.
 *  Rétro-compat : `appartientPermis` absent (fixtures) = traité comme permis (numéroté), comportement d'avant. */
export type PolygoneRepere = PolygoneBdTopo & { repere: string };
export function attribuerReperes(polygones: PolygoneBdTopo[]): PolygoneRepere[] {
  let n = 0;
  return polygones.map((p) => p.appartientPermis === false ? { ...p, repere: '' } : { ...p, repere: repereDepuisIndex(n++) });
}

/** Centre approximatif d'un anneau (moyenne des sommets) — pour poser la lettre du repère. PUR. */
function centreAnneau(anneau: PointLambert[]): PointLambert {
  const n = anneau.length || 1;
  return { x: anneau.reduce((s, p) => s + p.x, 0) / n, y: anneau.reduce((s, p) => s + p.y, 0) / n };
}

// ── LOT 82 — étiquettes NOM + ALTITUDE posées SUR le schéma (point d'ancrage GARANTI intérieur, placement dedans/déporté) ──

/** LOT 82 — point GARANTI INTÉRIEUR d'un anneau (≈ `ST_PointOnSurface`) : milieu de la plus large travée intérieure, sur une horizontale
 *  au milieu de la bbox. Robuste aux formes CONCAVES / EN L où la moyenne des sommets (`centreAnneau`, ≈ `ST_Centroid`) tombe DEHORS.
 *  Repli sur la moyenne si aucune travée (dégénéré). PUR — sert d'ancre à l'étiquette, jamais au verdict ni à une géométrie stockée. */
export function pointOnSurfaceAnneau(anneau: PointLambert[]): PointLambert {
  if (anneau.length < 3) return centreAnneau(anneau);
  const ys = anneau.map((p) => p.y);
  const yScan = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs: number[] = [];
  for (let i = 0; i < anneau.length; i++) {
    const a = anneau[i], b = anneau[(i + 1) % anneau.length];
    if ((a.y <= yScan && b.y > yScan) || (b.y <= yScan && a.y > yScan)) xs.push(a.x + ((yScan - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  xs.sort((u, v) => u - v);
  let best = -1, bx = 0;
  for (let k = 0; k + 1 < xs.length; k += 2) { const w = xs[k + 1] - xs[k]; if (w > best) { best = w; bx = (xs[k] + xs[k + 1]) / 2; } }
  return best >= 0 ? { x: bx, y: yScan } : centreAnneau(anneau);
}

/** LOT 82 — test pair-impair « le point (x,y) est-il dans l'anneau ? » (pixels OU Lambert, indifférent). PUR. */
export function pointDansAnneau(x: number, y: number, anneau: { x: number; y: number }[]): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const a = anneau[i], b = anneau[j];
    if (((a.y > y) !== (b.y > y)) && (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)) dedans = !dedans;
  }
  return dedans;
}

// Gabarit d'étiquette (unités de la boîte SVG). Volontairement modeste : le schéma reste lisible, la légende dessous est le repli.
const ETIQ = { police: 8.5, hauteurLigne: 10, largeurCar: 4.9, pad: 2.5 };
const ETIQ_MARGE = 3;   // LOT 83 — marge de sécurité (px) autour de la boîte pour les tests de collision : jamais à ras d'une forme
const ETIQ_PAS = 5;     // LOT 83 — pas radial du balayage des positions candidates (fin → trouve plus souvent une position libre)
type Pt = { x: number; y: number };

/** Dimensions (px) de la boîte d'une étiquette d'après ses lignes. PUR. */
export function dimsBoiteEtiquette(lignes: readonly string[]): { w: number; h: number } {
  return { w: ETIQ.pad * 2 + Math.max(1, ...lignes.map((s) => s.length)) * ETIQ.largeurCar, h: ETIQ.pad * 2 + lignes.length * ETIQ.hauteurLigne };
}

/** Deux segments [p1,p2] et [p3,p4] se croisent-ils (intersection propre) ? PUR. */
function segmentsSeCroisent(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)));
}

/**
 * LOT 83 — la boîte `r` (px, {x,y,w,h}) intersecte-t-elle le POLYGONE `poly` (collision de FORME, pas de bbox — ces polygones sont des
 * bandes obliques dont la bbox déborde très largement la surface réelle) ? Testé avec une marge de sécurité `marge`. Vrai si un coin de la
 * boîte est dans le polygone, OU un sommet du polygone dans la boîte, OU une arête de la boîte croise une arête du polygone. PUR.
 */
export function boiteIntersectePolygone(r: { x: number; y: number; w: number; h: number }, poly: Pt[], marge = 0): boolean {
  if (poly.length < 3) return false;
  const x0 = r.x - marge, y0 = r.y - marge, x1 = r.x + r.w + marge, y1 = r.y + r.h + marge;
  const coins: Pt[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  if (coins.some((c) => pointDansAnneau(c.x, c.y, poly))) return true;
  if (poly.some((v) => v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1)) return true;
  for (let i = 0; i < 4; i++) {
    const a = coins[i], b = coins[(i + 1) % 4];
    for (let j = 0; j < poly.length; j++) if (segmentsSeCroisent(a, b, poly[j], poly[(j + 1) % poly.length])) return true;
  }
  return false;
}

/** Deux boîtes axis-aligned se chevauchent-elles (marge incluse) ? PUR. */
export function boitesSeChevauchent(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, marge = 0): boolean {
  return !(a.x + a.w + marge <= b.x || b.x + b.w + marge <= a.x || a.y + a.h + marge <= b.y || b.y + b.h + marge <= a.y);
}

export interface ItemEtiquette { cle: string; lignes: string[]; nature: 'reel' | 'projete'; trou?: boolean; anneauPx: Pt[]; ancre: Pt }
export interface EtiquettePlacee { cle: string; lignes: string[]; nature: 'reel' | 'projete'; trou?: boolean; x: number; y: number; w: number; h: number; deportee: boolean; ax: number; ay: number; reduit?: boolean; recours?: boolean }

/**
 * LOT 83 — PLACE TOUTES les étiquettes ENSEMBLE (le placement d'une boîte dépend des autres), en px. Pour chacune, dans l'ordre :
 *  1. DEDANS : si la boîte tient ENTIÈREMENT dans son polygone (4 coins intérieurs) ET dans le cadre → posée là (aucun trait de rappel).
 *  2. DÉPORTÉE : balayage DÉTERMINISTE d'une couronne (rayon croissant × 8 directions), on retient la PREMIÈRE position dont la boîte est
 *     ENTIÈREMENT dans le cadre ET ne collisionne NI aucune forme dessinée (`obstacles` : polygones + emprises, y compris la sienne) NI
 *     une boîte déjà placée. → jamais à cheval sur une forme (défaut LOT 82 corrigé).
 *  3. DERNIER RECOURS (parcelle saturée) : on retente en NOM SEUL (boîte plus petite) ; si toujours rien, on retient la position de
 *     MOINDRE recouvrement (marquée `recours`), JAMAIS une boîte à cheval silencieuse. Toujours clampée au cadre.
 * Le trait de rappel (rendu ailleurs) peut, lui, traverser des formes : seule la BOÎTE doit être dégagée. PUR (aucune I/O).
 */
export function placerEtiquettes(items: readonly ItemEtiquette[], obstacles: readonly Pt[][], vb: CadreVue): EtiquettePlacee[] {
  // 16 directions (ordre stable, déterministe) normalisées : plus de positions candidates → on libère plus souvent une boîte sans recours.
  const DIRS: [number, number][] = ([[1, 0], [0, -1], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1],
    [2, -1], [2, 1], [-2, -1], [-2, 1], [1, -2], [1, 2], [-1, -2], [-1, 2]] as [number, number][]).map(([x, y]) => { const n = Math.hypot(x, y); return [x / n, y / n] as [number, number]; });
  const dansCadre = (x: number, y: number, w: number, h: number) => x >= vb.minX && y >= vb.minY && x + w <= vb.minX + vb.w && y + h <= vb.minY + vb.h;
  const placees: EtiquettePlacee[] = [];
  for (const it of items) {
    const base = { cle: it.cle, nature: it.nature, trou: it.trou, ax: it.ancre.x, ay: it.ancre.y };
    const { w, h } = dimsBoiteEtiquette(it.lignes);
    const cx = it.ancre.x, cy = it.ancre.y;
    // 1) DEDANS
    const coins: [number, number][] = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
    if (it.anneauPx.length >= 3 && dansCadre(cx - w / 2, cy - h / 2, w, h) && coins.every(([x, y]) => pointDansAnneau(x, y, it.anneauPx))) {
      const p: EtiquettePlacee = { ...base, lignes: it.lignes, x: cx - w / 2, y: cy - h / 2, w, h, deportee: false };
      placees.push(p); continue;
    }
    // 2) DÉPORTÉE — couronne déterministe ; boîte PLEINE puis, si saturé, NOM SEUL. On garde en réserve la MOINDRE collision.
    let retenue: EtiquettePlacee | null = null;
    let moindre: { p: EtiquettePlacee; penalite: number } | null = null;
    for (const essai of [{ lignes: it.lignes, reduit: false }, { lignes: [it.lignes[0]], reduit: true }]) {
      const d = dimsBoiteEtiquette(essai.lignes);
      const rMax = Math.max(vb.w, vb.h);
      for (let r = Math.max(d.w, d.h) / 2 + ETIQ_PAS; r <= rMax && !retenue; r += ETIQ_PAS) {
        for (const [dx, dy] of DIRS) {
          const bx = cx + dx * r - d.w / 2, by = cy + dy * r - d.h / 2;
          if (!dansCadre(bx, by, d.w, d.h)) continue;
          const rect = { x: bx, y: by, w: d.w, h: d.h };
          const nColl = obstacles.reduce((s, o) => s + (boiteIntersectePolygone(rect, o as Pt[], ETIQ_MARGE) ? 1 : 0), 0)
            + placees.reduce((s, b) => s + (boitesSeChevauchent(rect, b, ETIQ_MARGE) ? 1 : 0), 0);
          const p: EtiquettePlacee = { ...base, lignes: essai.lignes, x: bx, y: by, w: d.w, h: d.h, deportee: true, reduit: essai.reduit || undefined };
          if (nColl === 0) { retenue = p; break; }
          if (!moindre || nColl < moindre.penalite) moindre = { p, penalite: nColl };
        }
      }
      if (retenue) break;
    }
    const choix = retenue ?? (moindre ? { ...moindre.p, recours: true } : { ...base, lignes: it.lignes, x: Math.max(vb.minX, Math.min(cx - w / 2, vb.minX + vb.w - w)), y: Math.max(vb.minY, Math.min(cy - h / 2, vb.minY + vb.h - h)), w, h, deportee: true, recours: true });
    placees.push(choix);
  }
  return placees;
}

/** LOT 82 — descripteur d'étiquette à poser sur le schéma (semantique + géométrie d'ancrage). `nature` : ① `reel` (polygone BD TOPO,
 *  verdict certifié) vs ② `projete` (emprise tracée d'après les plans, verdict projeté) — distingués à l'œil ; `trou` : polygone « en
 *  projet » non affecté (le vrai trou). `anneau` (Lambert) sert au point d'ancrage intérieur + au test « tient dedans ». */
export interface EtiquetteProjection { cle: string; lignes: string[]; nature: 'reel' | 'projete'; trou?: boolean; anneau: PointLambert[] }
// 🔴 COULEURS FIXES (le canvas du schéma reste CLAIR en permanence, même en thème sombre) — JAMAIS les tokens `--color-svv-*` de texte,
//    qui basculeraient en sombre et deviendraient illisibles sur fond clair. La légende SOUS le schéma, elle, garde les tokens.
const ETIQ_ENCRE = '#1b1b1b';  // texte foncé, lisible sur aplat clair
const ETIQ_HALO = '#ffffff';   // halo/contour clair (paint-order stroke) pour passer au-dessus d'un aplat
const ETIQ_ALERTE = '#a30402'; // rouge SVAV en dur : emprise projetée (②) + vrai trou « en projet non affecté »
// LOT 90 — EMPREINTE de la parcelle : couleur FIXE (le canvas reste clair en permanence, même en thème sombre — l'ancien
//   `var(--color-svv-ink)` basculait en clair et devenait INVISIBLE sur fond blanc en sombre). Distincte du bâti par la couleur ET
//   l'épaisseur ET un remplissage très léger (jamais la couleur seule). #1b2430 ≈ ink clair → rendu clair inchangé, visible en sombre.
const EMPREINTE_TRAIT = '#1b2430';
const EMPREINTE_FOND = 'rgba(90,99,113,.06)';

// PROJ-HIÉRARCHIE / RÈGLE ARNO — TROIS FAMILLES, TROIS TEINTES DISTINCTES, FIXES (canvas blanc dans les 2 thèmes ; un token basculerait
//   → invisible, piège du lot afa97b2). Le PERMIS domine ; les VOISINS (hors permis) et le CONTEXTE se lisent comme « autour », en BLEU :
//   ① PERMIS (bâtiment du permis, parcelle dominante du permis) = TEAL franc + contour ÉPAIS → DOMINE la composition (INCHANGÉ) ;
//   ② BÂTIMENT VOISIN (hors permis — parcelle dominante hors permis, ET bâti de contexte du voisinage) = BLEU, présent mais second ;
//   ③ PARCELLE VOISINE (contour de contexte, sans bâti) = BLEU CLAIR, le plus discret (situer, pas capter l'attention).
// 🟦 JETONS DE COULEUR CRÉÉS (fixes, canvas clair permanent — jamais les tokens `--color-svv-*`) : bleu voisin `#2563eb`, bleu clair
//   parcelle `#7ab4e6`. Distincts du bleu « en projet » IGN (`#1f77b4`, tireté) par la teinte ET le trait plein.
const PERMIS_FILL = 'rgba(15,118,110,.34)', PERMIS_TRAIT = '#0f766e';      // ① teal (sarcelle foncé) — bâtiment DU PERMIS, inchangé
const VOISIN_FILL = 'rgba(37,99,235,.18)', VOISIN_TRAIT = '#2563eb';       // ② BLEU — bâtiment voisin (hors permis)
const CONTEXTE_FOND = 'rgba(122,180,230,.10)', CONTEXTE_TRAIT = '#7ab4e6'; // ③ BLEU CLAIR — parcelle voisine (contexte)

// Repères (A, B, C…) — RÈGLE ARNO : lettre NETTEMENT LISIBLE, taille ADAPTÉE à DEUX facteurs — ① la taille d'AFFICHAGE du schéma (le
//   plancher ET le plafond sont des FRACTIONS du viewBox → un schéma deux fois plus grand donne une lettre proportionnellement plus
//   grande : c'est ce qui corrige le plein écran, où l'ancien plafond en unités-boîte absolues devenait minuscule) ; ② la taille du
//   POLYGONE (dim × ratio). Un polygone trop petit pour contenir la lettre AU PLANCHER → lettre DÉPORTÉE à l'extérieur (taille plancher
//   conservée) + TRAIT de rappel (cf. placerReperes). ⚠️ La taille ne sert QU'AU RENDU du <text> (fontSize) : elle ne touche NI le calage
//   NI le tracé (aucune conversion de coordonnées gelée).
const REPERE_MIN_FRAC = 0.075, REPERE_MAX_FRAC = 0.11, REPERE_RATIO = 0.55; // fractions du plus petit côté du viewBox (suivent le zoom d'affichage)
const REPERE_MARGE = 3, REPERE_PAS = 5; // collision : marge de sécurité + pas radial du balayage (mêmes valeurs que placerEtiquettes)
/** Boîte approximative d'UNE lettre capitale à `taille` (pour collision/ajustement) : ~0,72×taille de large, ~taille de haut. */
const boiteLettre = (taille: number): { w: number; h: number } => ({ w: taille * 0.72, h: taille });

/** Taille de police d'un repère : proportionnelle au polygone (dim × ratio), BORNÉE par un plancher et un plafond eux-mêmes proportionnels
 *  à la taille d'AFFICHAGE (`refVb` = plus petit côté du viewBox) → nettement plus grande sur un schéma plus grand. PUR. */
export function tailleRepere(anneauPx: readonly { x: number; y: number }[], refVb: number): number {
  const Fmin = refVb * REPERE_MIN_FRAC, Fmax = refVb * REPERE_MAX_FRAC;
  if (anneauPx.length < 3) return Fmin;
  const xs = anneauPx.map((p) => p.x), ys = anneauPx.map((p) => p.y);
  const dim = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return Math.max(Fmin, Math.min(Fmax, dim * REPERE_RATIO));
}

export interface RepereAPlacer { repere: string; anneauPx: readonly Pt[]; ancre: Pt }
export interface RepereePlace { repere: string; taille: number; x: number; y: number; deporte: boolean; ax: number; ay: number }

// Couronne déterministe (16 directions normalisées) — MÊME esprit que placerEtiquettes : plus de candidats → on libère plus souvent.
const DIRS_REPERE: [number, number][] = ([[1, 0], [0, -1], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1],
  [2, -1], [2, 1], [-2, -1], [-2, 1], [1, -2], [1, 2], [-1, -2], [-1, 2]] as [number, number][]).map(([x, y]) => { const n = Math.hypot(x, y); return [x / n, y / n] as [number, number]; });

/**
 * PLACEMENT des repères (A, B, C…), PUR et COLLISION-AWARE (même esprit que placerEtiquettes). Pour chaque repère : DEDANS (à l'ancre
 * intérieure `pointOnSurfaceAnneau`, taille adaptée) SI le polygone est assez grand pour contenir la lettre au plancher (`dim × ratio ≥
 * plancher`) ; SINON DÉPORTÉE au PLANCHER (taille lisible CONSERVÉE, jamais rétrécie sous le plancher) dans une couronne déterministe
 * (16 directions, rayon croissant) qui évite les POLYGONES (obstacles) ET les lettres DÉJÀ posées → deux petits polygones voisins ne se
 * chevauchent jamais, ni leurs traits ; on réserve la MOINDRE collision en dernier recours. Renvoie taille + position (centre) + l'ancre
 * du trait de rappel. Vaut dans TOUS les contextes (le viewBox reflète la taille d'affichage). Aucune coordonnée de calage/tracé touchée.
 */
export function placerReperes(reperes: readonly RepereAPlacer[], obstacles: readonly Pt[][], vb: CadreVue): RepereePlace[] {
  const refVb = Math.min(vb.w, vb.h);
  const Fmin = refVb * REPERE_MIN_FRAC;
  const dansCadre = (x: number, y: number, w: number, h: number) => x >= vb.minX && y >= vb.minY && x + w <= vb.minX + vb.w && y + h <= vb.minY + vb.h;
  const placees: RepereePlace[] = [];
  const boitesPosees: { x: number; y: number; w: number; h: number }[] = [];
  for (const r of reperes) {
    const taille = tailleRepere(r.anneauPx, refVb);
    const ax = r.ancre.x, ay = r.ancre.y;
    const xs = r.anneauPx.map((p) => p.x), ys = r.anneauPx.map((p) => p.y);
    const dim = r.anneauPx.length >= 3 ? Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
    // DEDANS — polygone assez grand pour une lettre AU PLANCHER (jamais rétrécie dessous) : à l'ancre intérieure.
    if (r.anneauPx.length >= 3 && dim * REPERE_RATIO >= Fmin) {
      const b = boiteLettre(taille);
      placees.push({ repere: r.repere, taille, x: ax, y: ay, deporte: false, ax, ay });
      boitesPosees.push({ x: ax - b.w / 2, y: ay - b.h / 2, w: b.w, h: b.h });
      continue;
    }
    // DÉPORTÉE au PLANCHER — couronne déterministe : évite obstacles + lettres posées ; réserve la MOINDRE collision en recours.
    const bt = boiteLettre(Fmin);
    const rMax = Math.max(vb.w, vb.h);
    let retenue: RepereePlace | null = null, moindre: { p: RepereePlace; n: number } | null = null;
    for (let rad = Math.max(bt.w, bt.h) / 2 + REPERE_PAS; rad <= rMax && !retenue; rad += REPERE_PAS) {
      for (const [dx, dy] of DIRS_REPERE) {
        const cx = ax + dx * rad, cy = ay + dy * rad;
        const rect = { x: cx - bt.w / 2, y: cy - bt.h / 2, w: bt.w, h: bt.h };
        if (!dansCadre(rect.x, rect.y, bt.w, bt.h)) continue;
        const n = obstacles.reduce((s, o) => s + (boiteIntersectePolygone(rect, o as Pt[], REPERE_MARGE) ? 1 : 0), 0)
          + boitesPosees.reduce((s, b) => s + (boitesSeChevauchent(rect, b, REPERE_MARGE) ? 1 : 0), 0);
        const p: RepereePlace = { repere: r.repere, taille: Fmin, x: cx, y: cy, deporte: true, ax, ay };
        if (n === 0) { retenue = p; break; }
        if (!moindre || n < moindre.n) moindre = { p, n };
      }
    }
    const choix = retenue ?? moindre?.p ?? { repere: r.repere, taille: Fmin, x: ax, y: ay, deporte: true, ax, ay };
    placees.push(choix);
    boitesPosees.push({ x: choix.x - bt.w / 2, y: choix.y - bt.h / 2, w: bt.w, h: bt.h });
  }
  return placees;
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
export function SchemaParcelleTrace({ boite, parcelle, emprises, polygones = [], filtres = FILTRES_SCHEMA_DEFAUT, ecartes = [], calageLambert, angle = 0, hauteurMax = '62vh', onCliquer, retoucheAnneau = null, sommetSelectionne = null, statuts, etiquettes = [], voisinage = [] }: {
  boite: Boite | null; parcelle: PointLambert[][]; emprises: EmpriseReconstruite[]; polygones?: PolygoneRepere[]; filtres?: FiltresSchema; ecartes?: string[]; calageLambert: PointLambert[]; angle?: number; hauteurMax?: string; onCliquer?: (px: { x: number; y: number }) => void;
  retoucheAnneau?: PointLambert[] | null; sommetSelectionne?: number | null; // PROJ-3s — contour en RETOUCHE (poignées éditables) + sommet sélectionné
  statuts?: Map<string, EtatStatutPolygone>; // RATT-3 — statut décidé par cleabs : colore l'existant (préservé vert / détruit orange). Absent → gris d'origine.
  etiquettes?: EtiquetteProjection[]; // LOT 82 — nom du bâtiment + altitude posés SUR le dessin (suivent la case « repères / infos »). Vide = aucune (écran de tracé).
  voisinage?: ObjetContexte[]; // PROJ-CTX — contexte (parcelles voisines + bâti), 3e registre. Rendu seulement si filtres.contexte === true.
}) {
  if (!boite || parcelle.length === 0) return <p style={muted}>Parcelle du permis absente : schéma non dessiné (aucun point fiable).</p>;
  const proj = (p: PointLambert) => projeterDansBoite(boite, p);
  const path = (anneau: PointLambert[]) => anneau.map((p, i) => { const q = proj(p); return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ') + ' Z';
  const visibles = polygonesVisibles(polygones, filtres);
  const ecarte = (p: PolygoneRepere) => p.cleabs !== null && ecartes.includes(p.cleabs);
  // PROJ-CTX — contexte visible SEULEMENT si l'interrupteur est allumé ET qu'on a de la matière (côté client, éteint ⇒ voisinage vide,
  //   aucune requête). Dessiné DERRIÈRE le rendu principal (le principal, contour épais + aplats pleins, reste au premier plan).
  const contexteVisible = filtres.contexte === true && voisinage.length > 0;
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
  // PROJ-CTX — le contexte fait partie du cadrage QUAND il est allumé (sinon il resterait hors champ, invisible). Le rendu principal
  //   reste identifiable par son POIDS visuel (contour épais foncé + aplats pleins) même si le cadre s'élargit pour montrer l'entour.
  if (contexteVisible) for (const o of voisinage) if (o.anneau.length >= 3) for (const p of o.anneau) pts.push(proj(p));
  // LOT 83 — MARGE DE RESPIRATION : quand des étiquettes sont posées, on élargit le cadre (pad 4 % → 16 %) pour offrir une zone
  //   d'accueil aux boîtes déportées HORS des formes. N'affecte NI l'échelle du tracé NI les coordonnées (juste plus de blanc autour).
  const vb = boiteEnglobanteRotee(pts, centre, angle, etiquettes.length > 0 ? 0.2 : 0.04);
  return (
    <svg viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="schéma de la parcelle, du bâti BD TOPO et des emprises reconstituées"
      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: hauteurMax, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: '#fff', cursor: onCliquer ? 'crosshair' : 'default' }}
      onClick={onCliquer ? (ev) => { const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect(); onCliquer(clicVersBoiteMeet(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height, vb, centre, angle)); } : undefined}>
      <g transform={angle ? `rotate(${angle} ${centre.x} ${centre.y})` : undefined}>
        {/* PROJ-CTX — 3e REGISTRE, dessiné EN PREMIER (donc DERRIÈRE tout le reste) : parcelles voisines (contour mauve fin tireté, sans
            aplat) + leur bâti (aplat mauve très léger). Teinte DISTINCTE des gris du principal/mitoyen → « ce qu'il y a autour », jamais
            « ma parcelle ». Couleurs FIXES (canvas clair permanent, lisible dans les 2 thèmes). AUCUN clic : contexte non sélectionnable. */}
        {contexteVisible && voisinage.map((o, i) => o.anneau.length < 3 ? null : (
          o.genre === 'parcelle'
            ? <path key={`vp${i}`} d={path(o.anneau)} fill={CONTEXTE_FOND} stroke={CONTEXTE_TRAIT} strokeWidth={0.7} strokeDasharray="3 2" strokeOpacity={0.9} data-contexte="parcelle" pointerEvents="none" />
            : <path key={`vb${i}`} d={path(o.anneau)} fill={VOISIN_FILL} stroke={VOISIN_TRAIT} strokeWidth={0.9} data-contexte="batiment" pointerEvents="none" />
        ))}
        {/* LOT 90 — EMPREINTE (contour de la parcelle fusionnée, référence) : trait FIXE épais + remplissage très léger → distincte des
            aplats de bâti (gris #888, trait fin 1,2) et visible sur le canvas clair dans les DEUX thèmes. */}
        {parcelle.map((a, i) => <path key={`p${i}`} d={path(a)} fill={EMPREINTE_FOND} stroke={EMPREINTE_TRAIT} strokeWidth={2.2} strokeLinejoin="round" data-empreinte="true" />)}
        {/* (a) existant gris / (b) futur bâti bleu tireté (donnée IGN) ; un futur bâti ÉCARTÉ est grisé (décision d'Arno). Distinct par le TRAIT. */}
        {visibles.map((poly, i) => {
          if (poly.anneau.length < 3) return null;
          const futur = estFuturBati(poly.etat), off = futur && ecarte(poly);
          // RATT-3/RATT-6 — un bâtiment EXISTANT prend le traitement de son statut ENREGISTRÉ : préservé → vert, détruit total → orange,
          //   MIXTE (partiellement détruit) → gris + tireté ardoise (il survit, il reste visible ; JAMAIS l'orange du détruit). Sans statut
          //   (ou révoqué), ou pour du futur bâti, la couleur d'origine reste INCHANGÉE — on ne colore jamais d'après une prévision non enregistrée.
          // RÈGLE ARNO — un statut (préservé/détruit) ne colore QUE les bâtiments DU PERMIS : les décisions posées jadis sur des voisins
          //   deviennent INERTES (plus lues par l'affichage) → un voisin reste BLEU même s'il porte encore une vieille décision en base.
          const voisin = poly.appartientPermis === false && !futur && !off; // ② bâtiment VOISIN (hors permis) → bleu, jamais de statut
          const statut = !futur && !voisin ? statuts?.get(poly.cleabs ?? '')?.statut : null;
          const coul = couleurStatutPolygone(statut);
          const surParcelle = !futur && !off && !coul && !voisin;           // ① le bâtiment DU PERMIS (parcelle dominante du permis)
          return <path key={`b${i}`} d={path(poly.anneau)} data-etat={poly.etat ?? ''} data-futur={futur} data-ecarte={off || undefined} data-statut={coul ? statut : undefined} data-qualification={poly.qualification || undefined} data-appartient-permis={poly.appartientPermis === false ? 'false' : undefined}
            fill={off ? 'rgba(0,0,0,.04)' : futur ? 'rgba(31,119,180,.14)' : coul ? coul.fill : voisin ? VOISIN_FILL : PERMIS_FILL}
            stroke={off ? '#bbb' : futur ? '#1f77b4' : coul ? coul.stroke : voisin ? VOISIN_TRAIT : PERMIS_TRAIT} strokeWidth={surParcelle ? 1.9 : voisin ? 1.3 : 1.2} strokeDasharray={futur ? '4 2' : coul?.dash} strokeOpacity={off ? 0.6 : 1} />;
        })}
        {/* (c) emprises TRACÉES = reconstitution (rouge), si « Afficher la projection » est actif. */}
        {filtres.emprises && emprises.flatMap((e) => (e.anneaux?.length ? e.anneaux : [e.anneau]).map((ring, ri) => ring.length >= 3
          ? <path key={`e${e.id}-${ri}`} d={path(ring)} fill="rgba(163,4,2,.18)" stroke="var(--color-svv-red)" strokeWidth={1.4} data-emprise={e.id} data-provenance={e.provenance} />
          : null))}
        {/* PROJ-3i ① — repères alphabétiques (mêmes lettres que le Rattachement), au CENTRE VISUEL de chaque polygone visible.
            🐛 correctif : le canvas est CLAIR EN PERMANENCE (background #fff, les 2 thèmes) → couleur FIXE + halo blanc (paintOrder),
            comme les étiquettes et le contour d'empreinte (EMPREINTE_TRAIT). L'ancien `var(--color-svv-ink)` basculait à #e8ebef en
            thème sombre → blanc sur blanc, invisible. Ancre = pointOnSurfaceAnneau (intérieur GARANTI, robuste aux formes concaves/en L
            où le centroïde tombe dehors) ; baseline centrale → la lettre est posée SUR le point. Rendu APRÈS le bâti → au-dessus de lui. */}
        {filtres.reperes && (() => {
          // TAILLE ADAPTÉE (affichage via viewBox + polygone) + DÉPORT collision-aware calculé pour TOUS ENSEMBLE : un polygone trop petit
          //   pour une lettre au plancher voit sa lettre déportée dehors + trait de rappel, sans chevaucher un autre polygone ni une autre
          //   lettre (cf. placerReperes). Obstacles = MÊMES formes que les étiquettes (polygones visibles + emprises), en px.
          const reperes: RepereAPlacer[] = visibles.filter((p) => p.anneau.length >= 3 && p.repere).map((p) => ({
            repere: p.repere as string, anneauPx: p.anneau.map(proj), ancre: projeterDansBoite(boite, pointOnSurfaceAnneau(p.anneau)),
          }));
          const obstacles: { x: number; y: number }[][] = [
            ...visibles.filter((p) => p.anneau.length >= 3).map((p) => p.anneau.map(proj)),
            ...(filtres.emprises ? emprises.flatMap((e) => (e.anneaux?.length ? e.anneaux : [e.anneau]).filter((ring) => ring.length >= 3).map((ring) => ring.map(proj))) : []),
          ];
          return placerReperes(reperes, obstacles, vb).map((pos, i) => (
            <g key={`r${i}`} data-repere={pos.repere} data-deportee={pos.deporte || undefined}>
              {pos.deporte && <line x1={pos.ax} y1={pos.ay} x2={pos.x} y2={pos.y} stroke={ETIQ_ENCRE} strokeWidth={0.5} strokeOpacity={0.55} />}
              <text x={pos.x} y={pos.y} fontSize={pos.taille} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill={ETIQ_ENCRE} stroke={ETIQ_HALO} strokeWidth={Math.max(1, pos.taille * 0.12)} paintOrder="stroke">{pos.repere}</text>
            </g>
          ));
        })()}
        {/* LOT 82/83 — ÉTIQUETTES sur le dessin : nom du bâtiment + altitude de sommet, ancre GARANTIE intérieure (pointOnSurfaceAnneau).
            LOT 83 : placement COLLISION-AWARE calculé pour TOUTES ENSEMBLE (placerEtiquettes) — DEDANS si la boîte tient, sinon DÉPORTÉE
            ENTIÈREMENT hors de TOUTES les formes (obstacles = polygones + emprises) et des autres boîtes, jamais à cheval ; trait de
            rappel vers le point intérieur. Couleurs FIXES (canvas clair permanent) — jamais les tokens. Distinction ① réel (▪, bord plein)
            vs ② projeté (◇, bord tireté rouge) : forme + trait, PAS la couleur seule. Suit la case « repères » ; légende = repli. */}
        {filtres.reperes && (() => {
          const items: ItemEtiquette[] = etiquettes.filter((et) => et.anneau.length >= 3).map((et) => ({
            cle: et.cle, lignes: et.lignes, nature: et.nature, trou: et.trou, anneauPx: et.anneau.map(proj), ancre: projeterDansBoite(boite, pointOnSurfaceAnneau(et.anneau)),
          }));
          // Obstacles = TOUTES les formes dessinées (polygones BD TOPO visibles + emprises), en px — la boîte doit toutes les éviter.
          const obstacles: { x: number; y: number }[][] = [
            ...visibles.filter((p) => p.anneau.length >= 3).map((p) => p.anneau.map(proj)),
            ...(filtres.emprises ? emprises.flatMap((e) => (e.anneaux?.length ? e.anneaux : [e.anneau]).filter((ring) => ring.length >= 3).map((ring) => ring.map(proj))) : []),
          ];
          return placerEtiquettes(items, obstacles, vb).map((pos) => {
            const bord = pos.trou || pos.nature === 'projete' ? ETIQ_ALERTE : ETIQ_ENCRE;
            const marque = pos.trou ? '⚠ ' : pos.nature === 'projete' ? '◇ ' : '▪ ';
            return (
              <g key={`et-${pos.cle}`} data-etiquette={pos.cle} data-nature={pos.nature} data-trou={pos.trou || undefined} data-deportee={pos.deportee || undefined} data-recours={pos.recours || undefined}>
                {pos.deportee && <line x1={pos.ax} y1={pos.ay} x2={pos.x + pos.w / 2} y2={pos.y + pos.h / 2} stroke={ETIQ_ENCRE} strokeWidth={0.5} strokeOpacity={0.55} />}
                <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx={2} fill="rgba(255,255,255,.82)" stroke={bord} strokeWidth={0.7} strokeDasharray={pos.nature === 'projete' ? '2.5 1.5' : undefined} />
                <text x={pos.x + ETIQ.pad} y={pos.y + ETIQ.pad + ETIQ.police} fontSize={ETIQ.police} fontWeight={700} fill={ETIQ_ENCRE} stroke={ETIQ_HALO} strokeWidth={0.6} paintOrder="stroke">{marque}{pos.lignes[0]}</text>
                {pos.lignes[1] && <text x={pos.x + ETIQ.pad} y={pos.y + ETIQ.pad + ETIQ.hauteurLigne + ETIQ.police} fontSize={ETIQ.police - 0.5} fill={pos.trou ? ETIQ_ALERTE : ETIQ_ENCRE} stroke={ETIQ_HALO} strokeWidth={0.5} paintOrder="stroke">{pos.lignes[1]}</text>}
              </g>
            );
          });
        })()}
        {/* PROJ — points de calage PERSISTANTS (côté schéma) : rayon DOUBLÉ (8) pour être bien visibles ; ce ne sont PAS le pointeur de
            visée du plan (cssAttente, inchangé). Positionnés exactement sous le clic depuis le correctif clicVersBoiteMeet. */}
        {calageLambert.map((p, i) => { const q = projeterDansBoite(boite, p); return <g key={`c${i}`}><circle cx={q.x} cy={q.y} r={8} fill="var(--color-svv-red)" /><text x={q.x + 10} y={q.y - 10} fontSize={12} fontWeight={700} fill="var(--color-svv-red)">{i + 1}</text></g>; })}
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
export function RotationSchema({ angle, onAngle, largeurCurseur = 120 }: { angle: number; onAngle: (a: number) => void; largeurCurseur?: number }) {
  // `largeurCurseur` — largeur du curseur en px. DÉFAUT 120 (inchangé partout ailleurs). Un appelant à colonne étroite (barre droite de
  //   « Bâtiments et projection ») peut la RÉDUIRE pour que toute la barre tienne sur une ligne, SANS toucher les autres écrans. Le pas reste
  //   1° et les flèches clavier gardent la précision au degré : le curseur plus court reste utilisable (réglage grossier + fin au clavier).
  return (
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
      <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
        Rotation
        <input type="range" min={0} max={360} step={1} value={angle} onChange={(e) => onAngle(Number(e.target.value))} aria-label="Rotation du schéma en degrés" style={{ width: largeurCurseur }} />
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

/**
 * LOT « calage avant tracé » — DÉCISION PURE : le tracé est-il accessible sur la page COURANTE, sinon POURQUOI et QUOI faire ? RÈGLE MÉTIER :
 * on ne peut pas dessiner le polygone avant d'avoir calé la vue — sans calage, le tracé n'a AUCUNE référence géographique (emprise fausse mais
 * enregistrable). Le calage n'est PAS retenu entre sessions et n'est valable QUE pour UNE page → la décision se fonde sur l'état de SESSION
 * (nombre de paires plan↔schéma de la page courante), jamais sur une donnée en base. HIÉRARCHIE des empêchements, le plus AMONT gagne :
 *   ① page non traçable (coupe/façade) → ② calage incomplet (2 paires requises) → sinon tracé disponible.
 * Le cas « aucun bâtiment » est traité EN AMONT (branche 0 bâtiment, message dédié) et n'arrive jamais ici (une page traçable implique un
 * bâtiment sélectionné). `message` progressif : distingue 0/2 (rien posé) de 1/2 (une paire posée) — plus utile qu'un texte figé.
 */
export type AccesTrace = { disponible: boolean; motif: 'ok' | 'non-plan' | 'calage'; message: string | null };
export function accesTrace(tracable: boolean, nbPaires: number): AccesTrace {
  if (!tracable) return { disponible: false, motif: 'non-plan', message: 'Cette page n’est pas une vue en plan (coupe/façade) : on ne peut pas y tracer d’emprise.' };
  if (nbPaires < 2) return {
    disponible: false, motif: 'calage',
    message: nbPaires <= 0
      ? 'Faites d’abord le calage : cliquez un point reconnaissable du plan, puis le MÊME point sur le schéma (2 paires à poser pour débloquer le tracé).'
      : 'Calage en cours (1/2) : posez la 2ᵉ paire — un point du plan puis le même sur le schéma — pour débloquer le tracé.',
  };
  return { disponible: true, motif: 'ok', message: null };
}

/** PROJ-3m ② — encart de guidage AFFICHÉ À CÔTÉ du geste (jamais un texte lointain). PUR. */
export function GuidageTraceBox({ g, onAnnulerDernier, onRecommencer, peutAnnuler = false }: {
  g: Guidage;
  // PROJ — annulation du CALAGE (état de travail LOCAL, aucune écriture base) : revenir de 2/2→1/2→0/2, ou tout recommencer (0/2).
  //   Optionnels : affichés seulement quand fournis (pendant le calage). `peutAnnuler` grise les boutons quand rien n'est posé.
  onAnnulerDernier?: () => void; onRecommencer?: () => void; peutAnnuler?: boolean;
}) {
  const bAnn: CSSProperties = { cursor: peutAnnuler ? 'pointer' : 'default', opacity: peutAnnuler ? 1 : 0.4, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', padding: '.2rem .5rem', fontSize: 12 };
  return (
    <div role="note" style={{ fontSize: 12, border: '1px solid var(--color-svv-red)', background: 'var(--color-svv-red-soft, #fff5f4)', borderRadius: '.4rem', padding: '.3rem .5rem' }}>
      <div style={{ fontWeight: 700 }}>{g.titre}</div>
      <div style={{ color: 'var(--color-svv-ink)' }}>{g.instruction}</div>
      {(onAnnulerDernier || onRecommencer) && (
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.35rem', flexWrap: 'wrap' }}>
          {onAnnulerDernier && <button type="button" style={bAnn} disabled={!peutAnnuler} onClick={onAnnulerDernier}>↩ Annuler le dernier point</button>}
          {onRecommencer && <button type="button" style={bAnn} disabled={!peutAnnuler} onClick={onRecommencer}>✕ Recommencer le calage</button>}
        </div>
      )}
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
      {/* PROJ-CTX — contexte : parcelles voisines + leur bâti autour de la parcelle du permis. Allumé par défaut (FILTRES_SCHEMA_DEFAUT). */}
      {ligne('contexte', 'Afficher les parcelles voisines et leur bâti (contexte)')}
      {/* Séparation CLAIRE entre les INTERRUPTEURS (cochables, ci-dessus) et la LÉGENDE (repère de lecture, non cliquable, ci-dessous). */}
      <div style={{ borderTop: '1px solid var(--color-svv-line)', margin: '.15rem 0 0' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-svv-muted)' }}>Légende (repère de lecture)</div>
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
            {decide === 'detruit' && <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-ink)', background: 'var(--color-svv-note-bg)', border: '1px solid var(--color-svv-red)', borderRadius: '.35rem', padding: '.2rem .4rem' }}>Prévision : effacé de la PROJECTION de la future parcelle (jamais de BD TOPO). Sera confirmé ou infirmé à la mise à jour de la planche cadastrale.</span>}
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
        {/* LOT 90 — l'EMPREINTE (contour épais foncé) distincte du bâti : le mot dit ce que c'est (référence, pas une mesure). */}
        {item({ background: EMPREINTE_FOND, border: `2px solid ${EMPREINTE_TRAIT}` }, 'Empreinte de la parcelle (référence — pas une mesure)')}
        {/* PROJ-HIÉRARCHIE / RÈGLE ARNO — bâtiment du permis (teal) ; voisins hors permis (bleu) ; parcelles voisines de contexte (bleu clair). */}
        {item({ background: PERMIS_FILL, border: `2px solid ${PERMIS_TRAIT}` }, 'Le bâtiment du permis (repéré A, B, C…)')}
        {item({ background: VOISIN_FILL, border: `1px solid ${VOISIN_TRAIT}` }, 'Bâtiment voisin (hors permis — contexte, sans repère)')}
        {item({ background: CONTEXTE_FOND, border: `1px dashed ${CONTEXTE_TRAIT}` }, 'Parcelle voisine (contexte)')}
        {item({ background: 'rgba(31,119,180,.14)', border: '1px dashed #1f77b4' }, 'En projet (donnée IGN)')}
        {item({ background: 'rgba(163,4,2,.18)', border: '1px solid var(--color-svv-red)' }, 'Emprise tracée (reconstitution — jamais une mesure)')}
        {/* RATT-3 — DÉCISIONS enregistrées sur l'existant (jamais des faits) : une couleur ne traduit qu'une décision en base. */}
        {item({ background: 'rgba(46,158,91,.22)', border: '1px solid var(--color-svv-green-ink)' }, 'Décidé « préservé » (prévision)')}
        {item({ background: 'rgba(217,119,6,.22)', border: '1px solid #c26a00' }, 'Décidé « détruit » (prévision)')}
      </div>
      <details style={{ fontSize: 11 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--color-svv-red)' }} aria-label="Explication des catégories du schéma">ⓘ Que veut dire chaque catégorie ?</summary>
        <div style={{ color: 'var(--color-svv-muted)', marginTop: '.2rem', lineHeight: 1.35 }}>
          <div><strong>Empreinte de la parcelle</strong> : le contour attendu de la (ou des) parcelle(s) fusionnée(s) du permis — un REPÈRE de cadrage, jamais une mesure.</div>
          <div><strong>Le bâtiment du permis</strong> (teal) : donnée officielle IGN — le(s) bâtiment(s) dont la parcelle DOMINANTE (celle où se trouve la majeure partie du bâtiment) fait partie du permis. C’est le SUJET de l’écran : couleur franche + contour marqué, il domine la composition. Lui seul reçoit un repère (A, B, C…) et entre dans l’affectation préservé/détruit.</div>
          <div><strong>Bâtiment voisin</strong> (bleu) : un bâtiment dont la parcelle dominante N’EST PAS une parcelle du permis (immeuble mitoyen, bâti alentour). Il reste AFFICHÉ pour le contexte de lecture — ce qui compte pour le vis-à-vis — mais il ne reçoit PAS de repère et n’entre PAS dans l’affectation préservé/détruit.</div>
          <div><strong>Parcelle voisine</strong> (bleu clair) : le contour des parcelles alentour dans un rayon (réglable), pour SITUER. Ces objets ne sont JAMAIS candidats à l’affectation ni à l’empreinte. L’interrupteur « Afficher les parcelles voisines et leur bâti » les masque (aucun chargement quand il est éteint).</div>
          <div><strong>En projet</strong> : donnée officielle IGN — des bâtiments dessinés dans les données mais pas encore construits.</div>
          <div><strong>Emprise tracée</strong> : un contour que vous avez dessiné à la main (une reconstitution, jamais une mesure). Il ne sert qu’à visualiser : il n’alimente ni le verdict, ni l’altitude, ni un certificat.</div>
          <div><strong>Décidé « préservé » / « détruit »</strong> : votre décision ENREGISTRÉE sur un bâtiment existant (vert = préservé, orange = détruit). C’est une PRÉVISION, à confronter à la mise à jour cadastrale — jamais un fait. Un bâtiment sans décision reste gris, même recouvert par l’emprise projetée.</div>
        </div>
      </details>
    </div>
  );
}

// ── LOT 81 — LÉGENDE DU SCHÉMA « PROJECTION DES EMPRISES » : DEUX NATURES DISTINCTES (jamais mélangées, cf. cadre métier Arno) ──
//   ① POLYGONES BD TOPO RÉELS (verdict certifié) ; ② EMPRISES PROJETÉES tracées d'après les plans du permis (verdict projeté, sans
//   certificat). Correction du LOT 80 : une emprise tracée à la main N'EST PAS à exclure — c'est elle qui porte le bâtiment + l'altitude
//   quand BD TOPO ne connaît pas encore le futur bâtiment.

/** Nature d'un polygone BD TOPO réel dans la légende. `affecte` : adopté à un bâtiment du permis ; `projet_non_affecte` : futur bâti
 *  « en projet » non adopté (un VRAI trou, doit se voir) ; `existant_sans_objet` : bâti existant, sans raison d'être rattaché au permis. */
export type NaturePolygoneLegende = 'affecte' | 'projet_non_affecte' | 'existant_sans_objet';
export interface LignePolygoneReel {
  cleabs: string;
  repere: string;                    // repère du SCHÉMA (ordre de DESSIN, A/B/C…) — retrouve le polygone sur le schéma ; JAMAIS le nom du bâtiment
  nature: NaturePolygoneLegende;
  nomBatiment: string | null;        // nom du BÂTIMENT DU PERMIS affecté (nomAffichageCorps) ; null hors 'affecte'
  altitudeSommetNgf: number | null;  // altitude de sommet VALIDÉE, PORTÉE PAR LE BÂTIMENT (héritée) ; null = altitude non validée
  nbPolygonesDuBatiment: number;     // ≥ 2 → altitude commune, héritée (jamais mesurée sur le polygone)
}
export interface LigneEmpriseProjetee {
  empriseId: number;
  nomBatiment: string;               // le bâtiment du permis que l'emprise SIMULE
  altitudeSommetNgf: number | null;  // altitude de sommet du bâtiment (héritée) ; null = altitude non validée
  nbEmprisesDuBatiment: number;      // ≥ 2 → altitude commune à plusieurs emprises du même bâtiment
}
export interface LegendeProjection { polygones: LignePolygoneReel[]; emprisesProjetees: LigneEmpriseProjetee[] }

/**
 * LOT 81 — construit la légende à DEUX GROUPES du schéma « Projection des emprises ». Source unique du schéma : les polygones RÉELS
 * (identité/ORDRE = repère `attribuerReperes`) ET les emprises reconstituées, RÉPARTIS par NATURE :
 *  ① `polygones` — chaque polygone BD TOPO dessiné : `affecte` (adopté à un bâtiment via `calage.cleabs → corps`), `projet_non_affecte`
 *     (futur bâti « en projet » non adopté = vrai trou), ou `existant_sans_objet` (bâti existant, aucun lien au permis attendu).
 *  ② `emprisesProjetees` — chaque emprise TRACÉE À LA MAIN (aucun polygone BD TOPO source, `calage.cleabs` vide) reliée à SON bâtiment :
 *     c'est le geste VOULU quand BD TOPO ne connaît pas encore le futur bâtiment (simulation d'après les plans). PAS de `cleabs` (normal).
 * 🔴 L'altitude est portée par le BÂTIMENT (`permis_corps_batiment.altitude_sommet_ngf`), donc HÉRITÉE (jamais mesurée sur l'entité) ;
 *    `null` = non validée. Les deux mondes ne se mélangent jamais (réel → verdict certifié ; projeté → verdict projeté sans certificat). PUR.
 */
export function legendeProjection(
  polygones: PolygoneRepere[], emprises: EmpriseReconstruite[],
  batiments: { corpsId: number; repere: string | null; nomRepli?: string | null; altitudeSommetNgf?: number | null }[],
): LegendeProjection {
  const batParCorps = new Map(batiments.map((b) => [b.corpsId, b]));
  const nomEtAlt = (corpsId: number): { nom: string; alt: number | null } => {
    const b = batParCorps.get(corpsId);
    return { nom: nomAffichageCorps({ repere: b?.repere ?? null, nomRepli: b?.nomRepli, corpsId }), alt: b?.altitudeSommetNgf ?? null };
  };
  // ① cleabs → corps, via les emprises ADOPTÉES (première emprise qui porte ce cleabs) — même liaison que polygonesProjetParBatiment.
  const corpsDeCleabs = new Map<string, number>();
  for (const e of emprises) { if (e.corpsId === null) continue; for (const c of cleabsSourceEmprise(e)) if (!corpsDeCleabs.has(c)) corpsDeCleabs.set(c, e.corpsId); }
  const polyBase = polygones.filter((p) => p.cleabs !== null && p.anneau.length >= 3).map((p) => {
    const corpsId = corpsDeCleabs.get(p.cleabs as string);
    if (corpsId !== undefined) { const { nom, alt } = nomEtAlt(corpsId); return { cleabs: p.cleabs as string, repere: p.repere, corpsId: corpsId as number | null, nature: 'affecte' as NaturePolygoneLegende, nomBatiment: nom, altitudeSommetNgf: alt }; }
    // Pas d'emprise-source : bâti existant (sans objet) OU futur bâti « en projet » non adopté (vrai trou). Le MOT porte l'info.
    const nature: NaturePolygoneLegende = estFuturBati(p.etat) ? 'projet_non_affecte' : 'existant_sans_objet';
    return { cleabs: p.cleabs as string, repere: p.repere, corpsId: null as number | null, nature, nomBatiment: null, altitudeSommetNgf: null };
  });
  const comptePoly = new Map<number, number>();
  for (const l of polyBase) if (l.corpsId !== null) comptePoly.set(l.corpsId, (comptePoly.get(l.corpsId) ?? 0) + 1);
  const polygonesL = polyBase.map(({ corpsId, ...l }) => ({ ...l, nbPolygonesDuBatiment: corpsId === null ? 0 : (comptePoly.get(corpsId) ?? 0) }));
  // ② emprises PROJETÉES tracées à la main (aucun polygone BD TOPO source) reliées à leur bâtiment. Une emprise ADOPTÉE (avec cleabs)
  //    est déjà représentée par son polygone en ① → jamais recomptée ici.
  const traceBase = emprises.filter((e) => e.corpsId !== null && cleabsSourceEmprise(e).length === 0)
    .map((e) => { const { nom, alt } = nomEtAlt(e.corpsId as number); return { empriseId: e.id, corpsId: e.corpsId as number, nomBatiment: nom, altitudeSommetNgf: alt }; });
  const compteEmp = new Map<number, number>();
  for (const l of traceBase) compteEmp.set(l.corpsId, (compteEmp.get(l.corpsId) ?? 0) + 1);
  const emprisesProjetees = traceBase.map(({ corpsId, ...l }) => ({ ...l, nbEmprisesDuBatiment: compteEmp.get(corpsId) ?? 0 }));
  return { polygones: polygonesL, emprisesProjetees };
}

/** LOT 80 — cleabs abrégé pour l'affichage (valeur complète conservée en `title`) : jamais tronqué silencieusement, jamais de blanc. PUR. */
export function abregerCleabs(cleabs: string): string {
  return cleabs.length > 20 ? `${cleabs.slice(0, 12)}…${cleabs.slice(-6)}` : cleabs;
}

/** LOT 82 — libellé d'altitude d'une étiquette : « 88,91 m NGF » ou « altitude non validée » (jamais un blanc). PUR. */
function texteAltitude(alt: number | null): string { return alt === null ? 'altitude non validée' : `${fmtM(alt)} NGF`; }

/**
 * LOT 82 — ÉTIQUETTES à poser SUR le schéma, dérivées de la MÊME source que la légende (`legendeProjection`) — jamais un recalcul
 * parallèle — puis reliées à leur géométrie d'ancrage. Deux natures conservées (① polygone BD TOPO réel, ② emprise projetée tracée) :
 *  - polygone `affecte` → nom du bâtiment + altitude (nature 'reel') ;
 *  - polygone `projet_non_affecte` → « en projet / non affecté » (nature 'reel', `trou` = le vrai trou, doit se voir) ;
 *  - polygone `existant_sans_objet` → AUCUNE étiquette (ne pas encombrer le dessin d'un « sans objet » par bâti existant) ;
 *  - emprise projetée → nom du bâtiment + altitude (nature 'projete').
 * Le cleabs n'est JAMAIS mis sur le dessin (illisible) — il reste dans la légende. PUR (aucune I/O).
 */
export function etiquettesProjection(
  polygones: PolygoneRepere[], emprises: EmpriseReconstruite[],
  batiments: { corpsId: number; repere: string | null; nomRepli?: string | null; altitudeSommetNgf?: number | null }[],
): EtiquetteProjection[] {
  const { polygones: lp, emprisesProjetees: le } = legendeProjection(polygones, emprises, batiments);
  const anneauDeCleabs = new Map(polygones.filter((p) => p.cleabs !== null && p.anneau.length >= 3).map((p) => [p.cleabs as string, p.anneau]));
  const anneauDeEmprise = new Map(emprises.map((e) => [e.id, (e.anneaux?.length ? e.anneaux[0] : e.anneau)] as const));
  const out: EtiquetteProjection[] = [];
  for (const l of lp) {
    if (l.nature === 'existant_sans_objet') continue; // bâti existant → affectation SANS OBJET → pas d'étiquette (ne pas encombrer)
    const anneau = anneauDeCleabs.get(l.cleabs);
    if (!anneau || anneau.length < 3) continue;
    out.push(l.nature === 'affecte'
      ? { cle: `p-${l.cleabs}`, lignes: [l.nomBatiment as string, texteAltitude(l.altitudeSommetNgf)], nature: 'reel', anneau }
      : { cle: `p-${l.cleabs}`, lignes: ['en projet', 'non affecté'], nature: 'reel', trou: true, anneau });
  }
  for (const l of le) {
    const anneau = anneauDeEmprise.get(l.empriseId);
    if (!anneau || anneau.length < 3) continue;
    out.push({ cle: `e-${l.empriseId}`, lignes: [l.nomBatiment, texteAltitude(l.altitudeSommetNgf)], nature: 'projete', anneau });
  }
  return out;
}

/** LOT 81 — fragment « altitude … NGF » (ou « altitude non validée ») + mention de partage (héritée du bâtiment). PUR (renderToStaticMarkup). */
function fragmentAltitude(alt: number | null, nbPartage: number, unite: 'polygones' | 'emprises') {
  if (alt === null) return <span style={{ color: 'var(--color-svv-muted)' }}>altitude non validée</span>;
  return <>altitude de sommet du bâtiment {fmtM(alt)} NGF{nbPartage > 1 ? <span style={muted}> (commune à ses {nbPartage} {unite})</span> : null}</>;
}

/**
 * LOT 81 — LÉGENDE à DEUX GROUPES sous la légende de catégories. Vocabulaire STRICT (« bâtiment », jamais « corps ») ; le repère
 * « Polygone A/B/C » est celui du SCHÉMA (dessin), distinct du nom du bâtiment. Chaque cas dit CE QU'IL EST (jamais un état par défaut) :
 * bâti existant → « sans objet » ; en projet non adopté → « non affecté » (vrai trou, mis en évidence) ; emprise projetée → mention
 * « simulée d'après les plans, aucun polygone BD TOPO à ce jour » (l'absence de cleabs n'est PAS un défaut). Un groupe vide affiche un
 * « aucun … à ce jour » explicite, JAMAIS un « satisfait » (piège LOT 71). Mobile-first (empilement, cleabs qui casse). PUR.
 */
export function LegendeProjectionEmprises({ legende }: { legende: LegendeProjection }) {
  const { polygones, emprisesProjetees } = legende;
  const titre: CSSProperties = { fontSize: 12, fontWeight: 700 };
  const ligne: CSSProperties = { fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '.1rem .4rem', alignItems: 'baseline', lineHeight: 1.35 };
  const clef: CSSProperties = { fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 11, color: 'var(--color-svv-muted)', wordBreak: 'break-all' };
  return (
    <div role="note" style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.15rem' }}>
      {/* ① Monde RÉEL — bord neutre. Sert au verdict CERTIFIÉ. */}
      <div style={{ borderLeft: '3px solid var(--color-svv-ink)', paddingLeft: '.5rem', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        <div style={titre}>Polygones BD TOPO réels <span style={muted}>— servent au verdict certifié</span></div>
        {polygones.length === 0
          ? <p style={{ ...muted, margin: 0 }}>Aucun polygone BD TOPO dans l’emprise à ce jour (le futur bâtiment n’y figure pas encore).</p>
          : <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              {polygones.map((l) => (
                <li key={l.cleabs} data-cleabs={l.cleabs} data-nature={l.nature} style={ligne}>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Polygone {l.repere}</span>
                  <span title={l.cleabs} style={clef}>{abregerCleabs(l.cleabs)}</span>
                  <span aria-hidden>—</span>
                  {l.nature === 'affecte'
                    ? <span><strong>{l.nomBatiment}</strong>{' · '}{fragmentAltitude(l.altitudeSommetNgf, l.nbPolygonesDuBatiment, 'polygones')}</span>
                    : l.nature === 'projet_non_affecte'
                      ? <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>⚠ en projet, non affecté à un bâtiment</span>
                      : <span style={{ color: 'var(--color-svv-muted)' }}>bâti existant — affectation sans objet</span>}
                </li>
              ))}
            </ul>}
      </div>
      {/* ② Monde PROJETÉ — bord rouge (couleur de l'emprise sur le schéma). Sert au verdict PROJETÉ, jamais au certificat. */}
      <div style={{ borderLeft: '3px solid var(--color-svv-red)', paddingLeft: '.5rem', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        <div style={titre}>Emprises projetées <span style={muted}>— tracées d’après les plans du permis · verdict projeté, jamais un certificat</span></div>
        {emprisesProjetees.length === 0
          ? <p style={{ ...muted, margin: 0 }}>Aucune emprise simulée d’après les plans à ce jour.</p>
          : <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              {emprisesProjetees.map((l) => (
                <li key={l.empriseId} data-emprise-projetee={l.empriseId} style={ligne}>
                  <span><strong>{l.nomBatiment}</strong>{' · '}{fragmentAltitude(l.altitudeSommetNgf, l.nbEmprisesDuBatiment, 'emprises')}</span>
                  <span aria-hidden>·</span>
                  <span style={{ ...muted, fontStyle: 'italic' }}>emprise simulée d’après les plans du permis — aucun polygone BD TOPO à ce jour</span>
                </li>
              ))}
            </ul>}
      </div>
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
