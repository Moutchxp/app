import { Fragment, type CSSProperties } from 'react';
import type { OrigineValeur } from '../../../../lib/permis/caracteristiquesRepo';
// ⚠️ Bundle client (piège du 13/08) : de `journalLecture` (module serveur, pg) on n'importe QUE des `type`, jamais une valeur.
import type { JournalChamp } from '../../../../lib/permis/journalLecture';
import { MESURES, libelleBornes, type Bornes, type ChampDeclare, type FaitsPermis } from './caracteristiquesForm';

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
/** N10 — résout le nom de fichier d'une provenance en un déclencheur de téléchargement, ou `undefined` si la pièce n'est pas résolue
 *  (→ l'entrée reste en texte simple, jamais un lien mort). Fourni par la Vue (mappe nom → id `dossier_document`, unique par dossier). */
export type LienPiece = (nomFichier: string) => (() => void) | undefined;

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
 * Faits LECTURE SEULE du permis (motif FicheCommune) — informatifs, jamais éditables. La surface n'apparaît que si Sitadel la porte.
 * N12 — `nbBatiments` = nombre de lignes `permis_corps_batiment` du dossier. ⚠️ Ce N'EST PAS un fait Sitadel (Sitadel ne porte aucun
 * décompte de bâtiments — vérifié champ par champ : nb_lgt_tot_crees compte des LOGEMENTS) : c'est ce que la machine a IDENTIFIÉ dans
 * les pièces. On le rend donc SÉPARÉ de la grille Sitadel, avec la provenance « d'après les pièces ». Jamais « 0 bâtiment » (un PC en
 * comporte forcément un) : une absence de lecture s'écrit « aucun bâtiment identifié dans les pièces ».
 */
export function FaitsPermisBloc({ faits, nbBatiments }: { faits: FaitsPermis; nbBatiments?: number }) {
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
export function AnnotationsExtraction({ origine, journal, lienPiece }: { origine: OrigineValeur | null; journal?: JournalChamp; lienPiece?: LienPiece }) {
  const j = origine === 'extraite' ? journal : undefined;
  const motif = origine === null ? journal?.motif ?? null : null;
  // N10-D — DÉDOUBLONNAGE des entrées identiques (le journal peut répéter une même pièce/page). Le COMPTE annoncé est celui des
  // PIÈCES DISTINCTES (aligné sur la corroboration du moteur), et on précise le nombre de PAGES quand il diffère — libellé honnête.
  const provenances = [...new Map((j?.provenances ?? []).map((p) => [`${p.piece ?? ''}#${p.page ?? ''}`, p])).values()];
  const nbPieces = new Set(provenances.map((p) => p.piece)).size;
  const nbPages = provenances.length;
  const compte = `${nbPieces} pièce${nbPieces > 1 ? 's' : ''}${nbPages > nbPieces ? `, ${nbPages} pages` : ''}`;
  return (
    <>
      {j?.reserve && <span role="note" style={styleNote}>⚠ {j.reserve}</span>}
      {motif && <span role="note" style={{ ...styleNote, color: 'var(--color-svv-muted)' }}>vide : {motif}</span>}
      {provenances.length > 0 && (
        <details style={{ fontSize: 11 }}>
          <summary style={{ ...styleAide, cursor: 'pointer' }}>provenance ({compte})</summary>
          <span style={{ ...styleAide, display: 'block', marginTop: '.15rem', overflowWrap: 'anywhere' }}>
            {provenances.map((p, i) => {
              // N10-A — chaque entrée devient un LIEN bleu (téléchargement) si la pièce est résolue ; sinon texte simple (jamais un lien mort).
              const decl = p.piece ? lienPiece?.(p.piece) : undefined;
              const txt = texteProvenance(p);
              return (
                <Fragment key={`${p.piece ?? ''}#${p.page ?? ''}`}>
                  {i > 0 ? ' · ' : null}
                  {decl
                    ? <button type="button" onClick={decl} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: BLEU_SOURCE, textDecoration: 'underline', cursor: 'pointer' }}>{txt} ↓</button>
                    : <span>{txt}</span>}
                </Fragment>
              );
            })}
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
export function ChampMesureEditeur({ mesure, bornes, valeur, origine, erreur, journal, lienPiece, onValeur }: {
  mesure: (typeof MESURES)[number]; bornes?: Bornes; valeur: string; origine: OrigineValeur | null; erreur?: string; journal?: JournalChamp; lienPiece?: LienPiece; onValeur: (v: string) => void;
}) {
  const cadreSommet: CSSProperties = mesure.estSommet
    ? { border: '1px solid var(--color-svv-red)', borderRadius: '.5rem', padding: '.4rem .5rem', background: '#fff8f8' }
    : {};
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0, ...cadreSommet }}>
      <LigneLabel libelle={`${mesure.libelle}${mesure.unite ? ` (${mesure.unite})` : ''}${mesure.estSommet ? ' ★' : ''}`} origine={origine} journal={journal} />
      <input type="number" inputMode="decimal" value={valeur} placeholder="vide = non renseigné"
        min={bornes?.min} max={bornes?.max} step={mesure.entier ? 1 : 'any'}
        onChange={(e) => onValeur(e.target.value)} style={styleInput} aria-label={mesure.libelle} />
      <span style={styleAide}>{libelleBornes(mesure, bornes)}</span>
      {mesure.estSommet && <span style={{ ...styleAide, color: 'var(--color-svv-red)' }}>{mesure.aide}</span>}
      {erreur && <span role="alert" style={styleErreur}>{erreur}</span>}
      <AnnotationsExtraction origine={origine} journal={journal} lienPiece={lienPiece} />
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
