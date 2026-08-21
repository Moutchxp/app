import { Fragment, type CSSProperties } from 'react';
import type { OrigineValeur } from '../../../../lib/permis/caracteristiquesRepo';
// ⚠️ Bundle client (piège du 13/08) : de `journalLecture` (module serveur, pg) on n'importe QUE des `type`, jamais une valeur.
import type { JournalChamp, ProvenanceEcartee } from '../../../../lib/permis/journalLecture';
import { MESURES, libelleBornes, composerLibelleDestinations, raisonParcelleNonRattachee, ecartSuperficieCadastre, type Bornes, type ChampDeclare, type FaitsPermis } from './caracteristiquesForm';
import type { ParcelleLigne, EmpreinteLigne, BatiSnapshotResume } from '../../../../lib/permis/parcellesRepo'; // TYPE seulement (module serveur) — piège du bundle client

/**
 * N3-C — rendu PUR de l'éditeur des caractéristiques physiques (motifs ContactRendu + CarteReglageEntier). Aucun état, aucun
 * effet → testable en Node via `renderToStaticMarkup`. Les BORNES viennent des CHECK de la base (jamais recopiées) ; un champ
 * VIDE reste vide (jamais 0) ; chaque valeur affiche son ORIGINE. Mobile-first (colonnes fluides). Aucune animation.
 */
const styleAide: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };
const styleErreur: CSSProperties = { fontSize: 11, color: 'var(--color-svv-red)', fontWeight: 600 };
const styleNote: CSSProperties = { fontSize: 11, lineHeight: 1.4, color: 'var(--color-svv-ink)', background: '#fff8f8', border: '1px solid var(--color-svv-red)', borderRadius: '.35rem', padding: '.25rem .4rem' };
// N10 — bleu des PIÈCES SOURCES : même couleur pour un lien de provenance et pour une pièce-source dans la liste (« même sens »).
// Pas de jeton bleu dans la charte → couleur en dur, comme l'ORANGE d'échéance d'ArchivesRendu ; accessible sur fond blanc (AA).
export const BLEU_SOURCE = '#1a5fb4';
/** N10 / N10-B — résout le nom de fichier d'une provenance en un déclencheur d'OUVERTURE du document (à la page `page` si fournie, via
 *  la variante inline signée), ou `undefined` si la pièce n'est pas résolue (→ l'entrée reste en texte simple, jamais un lien mort).
 *  Fourni par la Vue (mappe nom → id `dossier_document`, unique par dossier). La clé de stockage ne transite jamais côté client. */
export type LienPiece = (nomFichier: string, page?: number | null) => (() => void) | undefined;

/** Pastille d'ORIGINE d'une valeur : saisie à la main · extraite d'une pièce · non renseignée. Texte porteur, couleur en appui. */
export function PastilleOrigineValeur({ origine }: { origine: OrigineValeur | null }) {
  const base: CSSProperties = { fontSize: 10, fontWeight: 700, padding: '.03rem .3rem', borderRadius: '.3rem', whiteSpace: 'nowrap' };
  if (origine === 'saisie') return <span style={{ ...base, background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' }}>saisie à la main</span>;
  if (origine === 'extraite') return <span style={{ ...base, background: '#fdf1dd', color: '#8a5a00' }}>extraite d’une pièce</span>;
  return <span style={{ ...base, background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)' }}>non renseignée</span>;
}

/**
 * N5-D — pastille de CONFIANCE d'une valeur extraite (lue du journal). AXE DIFFÉRENT de l'origine (d'où elle vient) → rendue
 * en CONTOUR (et non pleine) pour être visuellement distincte de la pastille d'origine. « à vérifier » (rouge) / « corroborée »
 * (vert). N'existe QUE pour une valeur extraite : jamais de « à vérifier » par défaut pour une saisie ou un champ vide.
 */
export function PastilleConfiance({ confiance }: { confiance: 'a_verifier' | 'confirmee' }) {
  const base: CSSProperties = { fontSize: 10, fontWeight: 700, padding: '.02rem .3rem', borderRadius: '.3rem', whiteSpace: 'nowrap', background: 'transparent', border: '1px solid' };
  if (confiance === 'confirmee') return <span style={{ ...base, color: 'var(--color-svv-green-ink)', borderColor: 'var(--color-svv-green-ink)' }}>corroborée</span>;
  return <span style={{ ...base, color: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }}>à vérifier</span>;
}

/**
 * N10-C — VIOLET « à confirmer » : une valeur du SOMMET issue de l'automatisation et JAMAIS examinée par un humain. RÈGLE DU PROJET
 * (précédent T2-B) : la couleur ne porte JAMAIS l'information seule — le MOT « à confirmer » est obligatoire, pas décoratif. Le violet
 * n'est qu'un appui. Contraste AA sur fond blanc. Distinct de la confiance (« corroborée » = axe du moteur, pas l'examen humain).
 */
export const VIOLET_A_CONFIRMER = '#7d3ac1';
export function PastilleAConfirmer() {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '.02rem .3rem', borderRadius: '.3rem', whiteSpace: 'nowrap', background: '#f3e8ff', color: VIOLET_A_CONFIRMER, border: `1px solid ${VIOLET_A_CONFIRMER}` }}>à confirmer</span>;
}

/** N10-C — « Cerfa = scan sans champ lisible » (liste fermée `methode='cerfa'`, jamais un rapprochement sur le TEXTE du motif) :
 *  tous les champs Cerfa du permis vides ET au moins une ligne de journal issue de l'extraction Cerfa. Sert à l'expliquer UNE FOIS. PURE. */
const CHAMPS_CERFA_PERMIS = ['surface_plancher_m2', 'nb_logements', 'nb_places_stationnement', 'adresse_terrain'];
export function cerfaEstScanSansChamps(journalPermis: Record<string, JournalChamp | undefined>, tousChampsCerfaVides: boolean): boolean {
  return tousChampsCerfaVides && CHAMPS_CERFA_PERMIS.some((c) => journalPermis[c]?.methode === 'cerfa');
}

/** N10-C — SITADEL et CERFA EN REGARD (lecture seule) : on VOIT ce que chaque source dit, sans jamais reporter l'une sur l'autre. */
export function SourcesEnRegard({ surfaceCreeeSitadel, surfacePlancherCerfa, adresseSitadel, adresseCerfa }: {
  surfaceCreeeSitadel: string | number | null; surfacePlancherCerfa: string | number | null; adresseSitadel: string | null; adresseCerfa: string | null;
}) {
  const nn = (v: string | number | null, unite = ''): string => (v === null || v === '' ? 'non renseignée' : `${v}${unite}`);
  return (
    <div style={{ fontSize: 12, lineHeight: 1.45, padding: '.4rem .55rem', borderRadius: '.4rem', background: 'var(--color-svv-field)', border: '1px solid var(--color-svv-line)', color: 'var(--color-svv-ink)', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
      <span><strong>Surface</strong> — Sitadel (créée) : {nn(surfaceCreeeSitadel, ' m²')}  ·  Cerfa (plancher) : {nn(surfacePlancherCerfa, ' m²')}</span>
      <span><strong>Adresse</strong> — Sitadel : {nn(adresseSitadel)}  ·  Cerfa (terrain) : {nn(adresseCerfa)}</span>
      <span style={{ ...styleAide, color: 'var(--color-svv-muted)' }}>La « surface créée » (Sitadel) et la « surface de plancher » (Cerfa) ne sont pas la même mesure — jamais reportées de l’une à l’autre.</span>
    </div>
  );
}

/**
 * Faits LECTURE SEULE du permis (motif FicheCommune) — informatifs, jamais éditables. La surface n'apparaît que si Sitadel la porte.
 * N12 — `nbBatiments` = nombre de lignes `permis_corps_batiment` du dossier. ⚠️ Ce N'EST PAS un fait Sitadel (Sitadel ne porte aucun
 * décompte de bâtiments — vérifié champ par champ : nb_lgt_tot_crees compte des LOGEMENTS) : c'est ce que la machine a IDENTIFIÉ dans
 * les pièces. On le rend donc SÉPARÉ de la grille Sitadel, avec la provenance « d'après les pièces ». Jamais « 0 bâtiment » (un PC en
 * comporte forcément un) : une absence de lecture s'écrit « aucun bâtiment identifié dans les pièces ».
 */
export function FaitsPermisBloc({ faits, nbBatiments, parcelles, ecartsParcelles, onExportGeojson, empreinte, onExportEmpreinte, bati }: {
  faits: FaitsPermis; nbBatiments?: number;
  parcelles?: ParcelleLigne[]; ecartsParcelles?: string[]; onExportGeojson?: () => void; // N3-E — parcelles cadastrales + export GeoJSON
  empreinte?: EmpreinteLigne | null; onExportEmpreinte?: () => void; // FUS-1 — empreinte attendue de la future parcelle fusionnée
  bati?: BatiSnapshotResume | null; // FUS-1b — photo du bâti au moment de l'analyse (sous l'empreinte)
}) {
  const lignes: [string, string][] = [
    ['N° permis', `${faits.numDau} (${faits.type})`],
    ['Commune', faits.communeNom ? `${faits.communeNom} (INSEE ${faits.codeInsee})` : `INSEE ${faits.codeInsee}`],
    ['Adresse', faits.adresse ?? 'non renseignée'],
    ['Nature des travaux', faits.natureTravaux ?? 'non renseignée'],
    ['Date d’acceptation', faits.dateAutorisation ?? 'non renseignée'],
  ];
  if (faits.surfaceCreee) lignes.push(['Surface créée', `${faits.surfaceCreee} m²`]);
  const n = nbBatiments ?? 0;
  return (
    <div className="svv-card" role="note" style={{ fontSize: 12 }}>
      <div style={{ ...styleAide, marginBottom: '.35rem' }}>Faits connus du permis (Sitadel) — lecture seule, non modifiables ici.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.2rem .8rem' }}>
        {lignes.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}><span style={{ color: 'var(--color-svv-muted)' }}>{k} : </span><strong style={{ overflowWrap: 'anywhere' }}>{v}</strong></div>
        ))}
      </div>
      {/* N12 — décompte de bâtiments : PAS un fait Sitadel → séparé de la grille + provenance explicite « d'après les pièces ». */}
      <div style={{ marginTop: '.4rem', paddingTop: '.35rem', borderTop: '1px solid var(--color-svv-line)', overflowWrap: 'anywhere' }}>
        {n > 0
          ? <><span style={{ color: 'var(--color-svv-muted)' }}>Bâtiments identifiés : </span><strong>{n}</strong><span style={{ color: 'var(--color-svv-muted)' }}> (d’après les pièces)</span></>
          : <span style={{ color: 'var(--color-svv-muted)' }}>aucun bâtiment identifié dans les pièces</span>}
      </div>
      {/* N3-E — PARCELLES CADASTRALES : une ligne par parcelle (section, n°, superficie déclarée, contenance cadastrale). Une parcelle
          non rattachée DIT pourquoi (jamais un vide muet). Écart déclaré/cadastre signalé. Le contour n'est pas déversé → export GeoJSON. */}
      {parcelles !== undefined && (
        <div style={{ marginTop: '.4rem', paddingTop: '.35rem', borderTop: '1px solid var(--color-svv-line)' }}>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '.2rem' }}>
            <span style={{ color: 'var(--color-svv-muted)' }}>Parcelles cadastrales :</span>
            {parcelles.some((p) => p.aGeometrie) && onExportGeojson
              ? <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }} onClick={onExportGeojson}>exporter le contour (GeoJSON) ↓</button>
              : null}
          </div>
          {parcelles.length === 0
            ? <span style={{ color: 'var(--color-svv-muted)' }}>aucune parcelle rattachée à ce permis</span>
            : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                {parcelles.map((p, i) => {
                  const raison = raisonParcelleNonRattachee(p);
                  const ecart = ecartSuperficieCadastre(p.superficieDeclareeM2, p.contenance);
                  return (
                    <li key={`${p.section}-${p.numero}-${i}`} style={{ overflowWrap: 'anywhere' }}>
                      <strong>Section {p.section} n° {p.numero}</strong>
                      {p.role === 'finale' ? <span style={{ ...styleAide }}> (parcelle finale)</span> : null}
                      {p.superficieDeclareeM2 !== null ? <span> — {p.superficieDeclareeM2} m² déclarés</span> : null}
                      {p.aGeometrie
                        ? <span style={{ color: 'var(--color-svv-muted)' }}> · cadastre {p.contenance} m² (ST_Area {p.aireCadastraleM2} m²)</span>
                        : <span style={{ color: 'var(--color-svv-red)' }}> · non rattachée : {raison}</span>}
                      {p.origine === 'extraite' && p.confiance ? <> <PastilleConfiance confiance={p.confiance} /></> : null}
                      {ecart ? <span role="note" style={{ ...styleNote, color: 'var(--color-svv-red)', marginLeft: '.3rem' }}>⚠ {ecart}</span> : null}
                      {p.aGeometrie && p.reserve ? <span role="note" style={{ ...styleNote, color: 'var(--color-svv-muted)', marginLeft: '.3rem' }}>{p.reserve}</span> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          {(ecartsParcelles ?? []).map((e, i) => <div key={`ec-${i}`} role="note" style={{ ...styleNote, color: 'var(--color-svv-red)', marginTop: '.2rem' }}>⚠ {e}</div>)}
          {/* FUS-1 — EMPREINTE ATTENDUE de la future parcelle fusionnée (union des parcelles d'origine). ⚠️ ATTENDUE, pas la vraie
              parcelle future : le projet peut n'occuper qu'une partie, un arpentage peut redécouper, le millésime suivant diffère. */}
          {empreinte != null && (
            <div style={{ marginTop: '.35rem', paddingTop: '.3rem', borderTop: '1px dashed var(--color-svv-line)', display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              {empreinte.complete
                ? <span><span style={{ color: 'var(--color-svv-muted)' }}>Empreinte attendue de la parcelle fusionnée : </span>
                    <strong>{empreinte.surfaceM2 !== null ? `${Math.round((empreinte.surfaceM2 + Number.EPSILON) * 10) / 10} m²` : '—'}</strong>
                    <span style={{ color: 'var(--color-svv-muted)' }}> (union de {empreinte.nbParcelles} parcelle{(empreinte.nbParcelles ?? 0) > 1 ? 's' : ''}{empreinte.millesime ? `, millésime ${empreinte.millesime}` : ''})</span></span>
                : <span style={{ color: 'var(--color-svv-red)' }}>Empreinte attendue : incomplète — {empreinte.motif}</span>}
              {empreinte.complete && empreinte.aGeometrie && onExportEmpreinte
                ? <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }} onClick={onExportEmpreinte}>exporter l’empreinte (GeoJSON) ↓</button>
                : null}
              <span style={{ ...styleAide, flexBasis: '100%' }}>Référence à comparer, pas la parcelle future réelle.</span>
            </div>
          )}
          {/* FUS-1b — BÂTI AU MOMENT DE L'ANALYSE : photo (footprint + cleabs) des bâtiments présents dans l'empreinte. Aucune détection
              de changement ici (chantiers suivants). 0 bâtiment = TERRAIN NU (info valable) ; empreinte incomplète = non figé + motif. */}
          {bati != null && (
            <div style={{ marginTop: '.35rem', paddingTop: '.3rem', borderTop: '1px dashed var(--color-svv-line)' }}>
              {!bati.capture
                ? <span style={{ color: 'var(--color-svv-muted)' }}>Bâti au moment de l’analyse : non figé{bati.motif ? ` — ${bati.motif}` : ''}</span>
                : (bati.nbBatiments ?? 0) === 0
                  ? <span><span style={{ color: 'var(--color-svv-muted)' }}>Bâti au moment de l’analyse : </span><strong>terrain nu</strong><span style={{ color: 'var(--color-svv-muted)' }}> — 0 bâtiment dans l’empreinte{bati.sourceMillesime ? ` (couche bâti au ${bati.sourceMillesime})` : ''}</span></span>
                  : (
                    <>
                      <span><span style={{ color: 'var(--color-svv-muted)' }}>Bâti au moment de l’analyse : </span><strong>{bati.nbBatiments} bâtiment{(bati.nbBatiments ?? 0) > 1 ? 's' : ''}</strong><span style={{ color: 'var(--color-svv-muted)' }}>{bati.sourceMillesime ? ` (couche bâti au ${bati.sourceMillesime})` : ''}</span></span>
                      <ul style={{ margin: '.2rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                        {bati.batiments.map((b, i) => {
                          const det = [b.nombreEtages !== null ? `${b.nombreEtages} étage${b.nombreEtages > 1 ? 's' : ''}` : null,
                                       b.altitudeMaxToit !== null ? `toit ${b.altitudeMaxToit} m NGF` : null].filter(Boolean).join(', ');
                          return (
                            <li key={b.cleabs ?? `b-${i}`} style={{ overflowWrap: 'anywhere' }}>
                              <span style={{ color: 'var(--color-svv-muted)' }}>· </span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{b.cleabs ?? '(cleabs inconnu)'}</span>
                              {det
                                ? <span style={{ color: 'var(--color-svv-muted)' }}> — {det}</span>
                                : <span style={{ ...styleAide }}> — étages/altitude non renseignés</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Éditeur du PARKING en TROIS états (select : non renseigné / oui / non), avec origine + confiance/motif (N7-E). Jamais binaire. */
export function EditeurParking({ valeur, origine, journal, lienPiece, onValeur }: { valeur: '' | 'oui' | 'non'; origine: OrigineValeur | null; journal?: JournalChamp; lienPiece?: LienPiece; onValeur: (v: '' | 'oui' | 'non') => void }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <LigneLabel libelle="Parking" origine={origine} journal={journal} />
      <select value={valeur} onChange={(e) => onValeur(e.target.value as '' | 'oui' | 'non')} style={styleInput} aria-label="Parking">
        <option value="">— non renseigné —</option>
        <option value="oui">oui</option>
        <option value="non">non</option>
      </select>
      <AnnotationsExtraction origine={origine} journal={journal} lienPiece={lienPiece} />
    </div>
  );
}

/** N5-D — texte de la PROVENANCE (pièce p.page), atteignable via un repliable discret. « — » si une donnée manque. */
function texteProvenance(p: { piece: string | null; page: number | null }): string {
  const piece = p.piece ?? 'pièce inconnue';
  return p.page !== null ? `${piece} p.${p.page}` : piece;
}

/**
 * N5-D/E (factorisé N7-E) — annotations d'un champ lues du journal, à AFFICHER SOUS le champ. RÉSERVE en toutes lettres +
 * PROVENANCE repliable (uniquement pour une valeur 'extraite'), et MOTIF de non-écriture (uniquement pour un champ VIDE, origine
 * null). Une saisie n'en montre aucune. UN SEUL composant, réutilisé par TOUS les éditeurs (mesures, parking, repère, permis).
 */
/** N10-B — une entrée de provenance : lien bleu OUVRANT le document à sa page si la pièce résout ; sinon texte simple. Quand la
 *  résolution a été TENTÉE (lienPiece fourni) mais a ÉCHOUÉ (doublon/renommage/pièce supprimée), on l'affiche « (document introuvable) »
 *  — jamais un lien mort, jamais une disparition silencieuse. Sans lienPiece (vue non câblée), texte nu (pas de fausse mention d'échec). */
function EntreeProvenance({ txt, piece, page, lienPiece }: { txt: string; piece: string | null; page: number | null; lienPiece?: LienPiece }) {
  const decl = piece ? lienPiece?.(piece, page) : undefined;
  if (decl) return <button type="button" onClick={decl} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: BLEU_SOURCE, textDecoration: 'underline', cursor: 'pointer' }}>{txt} ↗</button>;
  const echecResolution = lienPiece !== undefined; // la Vue a fourni le résolveur mais la pièce n'a pas été retrouvée
  return <span>{txt}{echecResolution ? ' (document introuvable)' : ''}</span>;
}

export function AnnotationsExtraction({ origine, journal, lienPiece, masquerEcartes }: { origine: OrigineValeur | null; journal?: JournalChamp; lienPiece?: LienPiece; masquerEcartes?: boolean }) {
  const j = origine === 'extraite' ? journal : undefined;
  const motif = origine === null ? journal?.motif ?? null : null;
  // N10-D — DÉDOUBLONNAGE des entrées identiques (le journal peut répéter une même pièce/page). Le COMPTE annoncé est celui des
  // PIÈCES DISTINCTES (aligné sur la corroboration du moteur), et on précise le nombre de PAGES quand il diffère — libellé honnête.
  const provenances = [...new Map((j?.provenances ?? []).map((p) => [`${p.piece ?? ''}#${p.page ?? ''}`, p])).values()];
  const nbPieces = new Set(provenances.map((p) => p.piece)).size;
  const nbPages = provenances.length;
  const compte = `${nbPieces} pièce${nbPieces > 1 ? 's' : ''}${nbPages > nbPieces ? `, ${nbPages} pages` : ''}`;
  // N10-B — les ÉCARTÉS avec provenance (superstructures au-dessus de la toiture…) : montrés SUR une valeur extraite (contexte de la réserve),
  //   chacun avec sa cote + pièce/page CLIQUABLE. Dédoublonnés par cote#pièce#page.
  const ecartes = j ? [...new Map((j.ecartes ?? []).map((e) => [`${e.valeur ?? ''}#${e.piece ?? ''}#${e.page ?? ''}`, e])).values()] : [];
  return (
    <>
      {j?.reserve && <span role="note" style={styleNote}>⚠ {j.reserve}</span>}
      {motif && <span role="note" style={{ ...styleNote, color: 'var(--color-svv-muted)' }}>vide : {motif}</span>}
      {provenances.length > 0 && (
        <details style={{ fontSize: 11 }}>
          <summary style={{ ...styleAide, cursor: 'pointer' }}>provenance ({compte})</summary>
          <span style={{ ...styleAide, display: 'block', marginTop: '.15rem', overflowWrap: 'anywhere' }}>
            {provenances.map((p, i) => (
              <Fragment key={`${p.piece ?? ''}#${p.page ?? ''}`}>
                {i > 0 ? ' · ' : null}
                <EntreeProvenance txt={texteProvenance(p)} piece={p.piece} page={p.page} lienPiece={lienPiece} />
              </Fragment>
            ))}
          </span>
        </details>
      )}
      {!masquerEcartes && ecartes.length > 0 && (
        <details style={{ fontSize: 11 }}>
          <summary style={{ ...styleAide, cursor: 'pointer' }}>cotes écartées au-dessus ({ecartes.length})</summary>
          <span style={{ ...styleAide, display: 'block', marginTop: '.15rem', overflowWrap: 'anywhere' }}>
            {ecartes.map((e, i) => (
              <Fragment key={`${e.valeur ?? ''}#${e.piece ?? ''}#${e.page ?? ''}`}>
                {i > 0 ? ' · ' : null}
                <EntreeProvenance txt={`${e.valeur ?? '?'} — ${texteProvenance(e)}`} piece={e.piece} page={e.page} lienPiece={lienPiece} />
              </Fragment>
            ))}
          </span>
        </details>
      )}
    </>
  );
}

/** Ligne de LABEL commune : libellé + pastille d'origine + pastille de confiance (si valeur extraite portant une confiance). */
function LigneLabel({ libelle, origine, journal }: { libelle: string; origine: OrigineValeur | null; journal?: JournalChamp }) {
  return (
    <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={styleLabel}>{libelle}</span>
      <PastilleOrigineValeur origine={origine} />
      {origine === 'extraite' && journal?.confiance && <PastilleConfiance confiance={journal.confiance} />}
    </span>
  );
}

/**
 * Champ d'UNE mesure : input numérique (VIDE autorisé → jamais 0 par défaut), bornes LUES de la base sous le champ, origine +
 * confiance + réserve + provenance + motif (via `AnnotationsExtraction`). Le SOMMET est signalé + une ligne dit ce qu'il désigne.
 */
/** N10-C — « JJ/MM/AAAA » depuis un ISO (trace de validation). */
function jjmmaaaa(iso: string): string { const d = iso.slice(0, 10); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`; }
/** N10-D — la valeur du champ diffère-t-elle de la valeur EN BASE ? (comparaison numérique, champ vide = null). Sert au garde « non validée ». */
function champDiffereBase(valeurChamp: string, base: number | null | undefined): boolean {
  const c = valeurChamp.trim() === '' ? null : Number(valeurChamp);
  if (c !== null && !Number.isFinite(c)) return false; // saisie en cours illisible → pas d'alerte parasite
  return (c ?? null) !== ((base ?? null) as number | null);
}

/** N10-I — groupe les cotes candidates du gabarit PLU (journalisées en 'plan', role='ecartee') par VALEUR (tolérance 0,05 m).
 *  Un seul groupe = concordant ; plusieurs = divergent (le gabarit NGF varie selon le plateau de nivellement). Aucune moyenne. */
function grouperCandidatsGabarit(ecartes: readonly ProvenanceEcartee[]): { valeur: number; sources: ProvenanceEcartee[] }[] {
  const dedup = [...new Map(ecartes.filter((e) => e.valeur != null).map((e) => [`${e.valeur}#${e.piece ?? ''}#${e.page ?? ''}`, e])).values()];
  const groupes: { valeur: number; sources: ProvenanceEcartee[] }[] = [];
  for (const e of dedup.sort((a, b) => (a.valeur as number) - (b.valeur as number))) {
    const g = groupes.find((g) => Math.abs(g.valeur - (e.valeur as number)) <= 0.05);
    if (g) g.sources.push(e); else groupes.push({ valeur: e.valeur as number, sources: [e] });
  }
  return groupes;
}

export function ChampMesureEditeur({ mesure, bornes, valeur, origine, erreur, journal, lienPiece, confirmeLe, confirmeParNom, valeurAuto, valeurBase, limitePluNgf, onValider, onValeur }: {
  mesure: (typeof MESURES)[number]; bornes?: Bornes; valeur: string; origine: OrigineValeur | null; erreur?: string; journal?: JournalChamp; lienPiece?: LienPiece;
  confirmeLe?: string | null; confirmeParNom?: string | null; valeurAuto?: number | null; valeurBase?: number | null; limitePluNgf?: number | null; onValider?: () => void; onValeur: (v: string) => void;
}) {
  const estSommet = mesure.estSommet === true;
  // N10-E — la LIMITE PLU s'affiche À CÔTÉ du sommet, pour que l'écart saute aux yeux. On SIGNALE un dépassement (hauteur retenue > limite),
  //   on N'INTERDIT PAS : un bâtiment peut légitimement dépasser un gabarit (superstructures techniques) ; ce n'est pas à nous d'arbitrer.
  const depasseLimite = estSommet && valeurBase !== null && valeurBase !== undefined && limitePluNgf !== null && limitePluNgf !== undefined && valeurBase > limitePluNgf;
  // « à confirmer » (violet) : le SOMMET extrait, JAMAIS examiné (origine 'extraite' ET confirme_le null). Une décision humaine (saisie
  //   validée) l'éteint. La TRACE « validée par NOM le … » s'affiche dès qu'une validation existe (confirme_le posé), quelle que soit l'origine.
  // N10-I — le gabarit PLU : ses cotes candidates (journal 'plan') sont montrées SOUS le champ, groupées par valeur, chacune avec
  //   planche + page cliquables et un bouton qui la POSE en saisie. Plusieurs groupes = divergence signalée (jamais tranchée ici).
  const estGabaritPlu = mesure.cle === 'hauteurMaxPluNgf';
  const candidatsGabarit = estGabaritPlu ? grouperCandidatsGabarit(journal?.ecartes ?? []) : [];
  const gabaritDivergent = candidatsGabarit.length > 1;
  const aConfirmer = estSommet && origine === 'extraite' && !confirmeLe;
  const valide = estSommet && !!confirmeLe;
  // N10-D — GARDE ANTI-PIÈGE JUMEAU : la hauteur du champ diffère de la base → elle n'est PAS validée. « Enregistrer ce bâtiment » ne
  //   l'écrira pas → on prévient, visiblement, près du bouton de validation.
  const modifieeNonValidee = estSommet && !!onValider && champDiffereBase(valeur, valeurBase);
  const cadreSommet: CSSProperties = estSommet
    ? { border: `1px solid ${aConfirmer ? VIOLET_A_CONFIRMER : 'var(--color-svv-red)'}`, borderRadius: '.5rem', padding: '.4rem .5rem', background: aConfirmer ? '#faf5ff' : '#fff8f8' }
    : {};
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0, ...cadreSommet }}>
      <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <LigneLabel libelle={`${mesure.libelle}${mesure.unite ? ` (${mesure.unite})` : ''}${estSommet ? ' ★' : ''}`} origine={origine} journal={journal} />
        {aConfirmer && <PastilleAConfirmer />}
      </span>
      <input type="number" inputMode="decimal" value={valeur} placeholder="vide = non renseigné"
        min={bornes?.min} max={bornes?.max} step={mesure.entier ? 1 : 'any'}
        onChange={(e) => onValeur(e.target.value)} style={styleInput} aria-label={mesure.libelle} />
      <span style={styleAide}>{libelleBornes(mesure, bornes)}</span>
      {estSommet && <span style={{ ...styleAide, color: 'var(--color-svv-red)' }}>{mesure.aide}</span>}
      {/* N10-E — la limite PLU À CÔTÉ de la hauteur retenue + le dépassement signalé (jamais bloquant). */}
      {estSommet && limitePluNgf !== null && limitePluNgf !== undefined && (
        <span style={styleAide}>limite PLU : {limitePluNgf} m{valeurBase !== null && valeurBase !== undefined ? ` — hauteur retenue : ${valeurBase} m` : ''}</span>
      )}
      {depasseLimite && <span role="note" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-svv-red)' }}>⚠ la hauteur retenue ({valeurBase} m) dépasse la limite PLU ({limitePluNgf} m) — signalé, non bloquant.</span>}
      {/* N10-D — B : la valeur AUTOMATIQUE (journal) reste accessible et remise en un clic dans le champ (aucune écriture ici). */}
      {estSommet && valeurAuto !== null && valeurAuto !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          <span style={styleAide}>valeur automatique : {valeurAuto}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.15rem .5rem' }} onClick={() => onValeur(String(valeurAuto))}>Remettre la valeur automatique</button>
        </div>
      )}
      {/* N10-D — le GESTE dédié au sommet : écrit LA VALEUR DU CHAMP (modifiée ou non) comme décision humaine. Périmètre disjoint d'« Enregistrer ce bâtiment ». */}
      {estSommet && onValider && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.25rem .7rem' }} onClick={onValider}>Valider cette hauteur</button>
          {modifieeNonValidee && <span role="note" style={{ fontSize: 11, fontWeight: 700, color: VIOLET_A_CONFIRMER }}>hauteur modifiée, non validée</span>}
        </div>
      )}
      {valide && <span role="note" style={{ ...styleAide, color: 'var(--color-svv-green-ink)' }}>✓ validée{confirmeParNom ? ` par ${confirmeParNom}` : ''}{confirmeLe ? ` le ${jjmmaaaa(confirmeLe)}` : ''}</span>}
      {erreur && <span role="alert" style={styleErreur}>{erreur}</span>}
      {/* N10-I — cotes de gabarit lues sur les planches : à choisir à la main (pose en 'saisie'). Divergence signalée, jamais tranchée. */}
      {estGabaritPlu && candidatsGabarit.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginTop: '.15rem' }}>
          <span style={styleAide}>gabarit PLU lu sur les planches :</span>
          {gabaritDivergent && (
            <span role="note" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-svv-red)' }}>
              ⚠ valeurs divergentes selon la planche — {journal?.reserve ?? 'le gabarit NGF varie selon le plateau de nivellement de la portion coupée'}. À trancher à la main.
            </span>
          )}
          {/* Chaque valeur = un bloc REPLIABLE (planches cachées par défaut), trié par VALEUR croissante — jamais par nombre : un
              compte présenté comme un score ferait cocher la majorité et masquerait le côté le plus haut. Le bouton « utiliser »
              reste HORS du repli (geste principal, toujours accessible). Le compte est un CONSTAT, pas un classement. */}
          {candidatsGabarit.map((c) => (
            <div key={c.valeur} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
              <details style={{ flex: '1 1 auto', minWidth: 0 }}>
                <summary style={{ ...styleAide, cursor: 'pointer' }}>{c.valeur} m — {c.sources.length} planche{c.sources.length > 1 ? 's montrent' : ' montre'} cette face</summary>
                <span style={{ ...styleAide, display: 'block', marginTop: '.15rem', overflowWrap: 'anywhere' }}>
                  {c.sources.map((s, i) => (
                    <Fragment key={`${s.piece ?? ''}#${s.page ?? ''}`}>{i > 0 ? ' · ' : null}<EntreeProvenance txt={texteProvenance(s)} piece={s.piece} page={s.page} lienPiece={lienPiece} /></Fragment>
                  ))}
                </span>
              </details>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.15rem .5rem' }} onClick={() => onValeur(String(c.valeur))}>utiliser {c.valeur}</button>
            </div>
          ))}
        </div>
      )}
      <AnnotationsExtraction origine={origine} journal={journal} lienPiece={lienPiece} masquerEcartes={estGabaritPlu} />
    </div>
  );
}

/** N7-E — éditeur d'UN champ DÉCLARÉ (niveau permis) : « nature » = sélecteur (options venant du CHECK), sinon nombre (≥0) / texte.
 *  Même traitement d'annotations que les mesures (confiance/réserve/provenance/motif). Tri-état préservé (vide = non renseigné). */
export function ChampDeclareEditeur({ champ, bornes, valeur, origine, erreur, journal, lienPiece, naturesPossibles, divergence, onValeur }: {
  champ: ChampDeclare; bornes?: Bornes; valeur: string; origine: OrigineValeur | null; erreur?: string; journal?: JournalChamp; lienPiece?: LienPiece; naturesPossibles?: readonly string[]; divergence?: string | null; onValeur: (v: string) => void;
}) {
  const libelle = `${champ.libelle}${champ.unite ? ` (${champ.unite})` : ''}`;
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <LigneLabel libelle={libelle} origine={origine} journal={journal} />
      {champ.genre === 'liste' ? (
        <select value={valeur} onChange={(e) => onValeur(e.target.value)} style={styleInput} aria-label={champ.libelle}>
          <option value="">— non renseigné —</option>
          {(naturesPossibles ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : champ.genre === 'nombre' ? (
        <input type="number" inputMode="decimal" value={valeur} placeholder="vide = non renseigné" min={bornes?.min ?? 0} max={bornes?.max} step={champ.entier ? 1 : 'any'}
          onChange={(e) => onValeur(e.target.value)} style={styleInput} aria-label={champ.libelle} />
      ) : (
        <input type="text" value={valeur} placeholder="vide = non renseignée" onChange={(e) => onValeur(e.target.value)} style={styleInput} aria-label={champ.libelle} />
      )}
      {bornes && <span style={styleAide}>valeur attendue entre {bornes.min} et {bornes.max}{champ.unite ? ` ${champ.unite}` : ''}</span>}
      {champ.aide && <span style={{ ...styleAide, color: 'var(--color-svv-red)' }}>{champ.aide}</span>}
      {erreur && <span role="alert" style={styleErreur}>{erreur}</span>}
      <AnnotationsExtraction origine={origine} journal={journal} lienPiece={lienPiece} />
      {/* N7-F — divergence signalée (ex. parking vestigial vs nombre de places) : information, jamais masquée. */}
      {divergence && <span role="note" style={{ ...styleNote, color: 'var(--color-svv-red)', fontWeight: 600 }}>⚠ divergence : {divergence}</span>}
    </div>
  );
}

/**
 * N13 — éditeur des DESTINATIONS : cases à cocher (liste fermée LUE du CHECK), avec la MÊME pastille d'origine / confiance / réserve /
 * provenance / motif que les autres champs (via `LigneLabel` + `AnnotationsExtraction`). Le libellé COMPOSÉ (« Bureau, artisanat et
 * commerce de détail, et restauration ») est GÉNÉRÉ ici, jamais stocké. Aucune valeur cochée → « non renseignée » (jamais « mixte »).
 */
export function ChampDestinationsEditeur({ possibles, valeurs, origine, erreur, journal, lienPiece, onToggle }: {
  possibles: readonly string[]; valeurs: readonly string[]; origine: OrigineValeur | null; erreur?: string; journal?: JournalChamp; lienPiece?: LienPiece; onToggle: (destination: string, coche: boolean) => void;
}) {
  const compose = composerLibelleDestinations(valeurs);
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0, gridColumn: '1 / -1' }}>
      <LigneLabel libelle="Destinations" origine={origine} journal={journal} />
      <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{compose || <span style={styleAide}>non renseignée</span>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.05rem .6rem', marginTop: '.15rem' }}>
        {possibles.map((d) => (
          <label key={d} style={{ display: 'flex', gap: '.35rem', alignItems: 'baseline', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={valeurs.includes(d)} onChange={(e) => onToggle(d, e.target.checked)} aria-label={d} />
            <span style={{ overflowWrap: 'anywhere' }}>{d}</span>
          </label>
        ))}
      </div>
      {erreur && <span role="alert" style={styleErreur}>{erreur}</span>}
      <AnnotationsExtraction origine={origine} journal={journal} lienPiece={lienPiece} />
    </div>
  );
}

/** N7-E — repère d'un corps : libellé humain (pas d'origine). On affiche son MOTIF s'il est VIDE et journalisé (ex. « attribution indécidable »). */
export function EditeurRepere({ valeur, journal, onValeur }: { valeur: string; journal?: JournalChamp; onValeur: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0, flex: '1 1 160px' }}>
      <span style={styleLabel}>Repère du bâtiment</span>
      <input value={valeur} placeholder="A1, 2D1…" onChange={(e) => onValeur(e.target.value)} style={styleInput} aria-label="Repère du bâtiment" />
      {/* origine = null si vide → le motif s'affiche ; sinon 'saisie' → rien. */}
      <AnnotationsExtraction origine={valeur.trim() === '' ? null : 'saisie'} journal={journal} />
    </div>
  );
}

/** Message quand un permis n'a encore AUCUN corps de bâtiment (jamais un vide muet). */
export const MESSAGE_AUCUN_CORPS = 'Aucun bâtiment renseigné. Ajoutez-en un pour saisir étages, altitudes et hauteur.';
