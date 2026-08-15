import type { CSSProperties } from 'react';
import type { OrigineValeur } from '../../../../lib/permis/caracteristiquesRepo';
// ⚠️ Bundle client (piège du 13/08) : de `journalLecture` (module serveur, pg) on n'importe QUE des `type`, jamais une valeur.
import type { JournalChamp } from '../../../../lib/permis/journalLecture';
import { MESURES, libelleBornes, type Bornes, type FaitsPermis } from './caracteristiquesForm';

/**
 * N3-C — rendu PUR de l'éditeur des caractéristiques physiques (motifs ContactRendu + CarteReglageEntier). Aucun état, aucun
 * effet → testable en Node via `renderToStaticMarkup`. Les BORNES viennent des CHECK de la base (jamais recopiées) ; un champ
 * VIDE reste vide (jamais 0) ; chaque valeur affiche son ORIGINE. Mobile-first (colonnes fluides). Aucune animation.
 */
const styleAide: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleInput: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };
const styleErreur: CSSProperties = { fontSize: 11, color: 'var(--color-svv-red)', fontWeight: 600 };

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

/** Faits LECTURE SEULE du permis (motif FicheCommune) — informatifs, jamais éditables. La surface n'apparaît que si Sitadel la porte. */
export function FaitsPermisBloc({ faits }: { faits: FaitsPermis }) {
  const lignes: [string, string][] = [
    ['N° permis', `${faits.numDau} (${faits.type})`],
    ['Commune', faits.communeNom ? `${faits.communeNom} (INSEE ${faits.codeInsee})` : `INSEE ${faits.codeInsee}`],
    ['Adresse', faits.adresse ?? 'non renseignée'],
    ['Nature des travaux', faits.natureTravaux ?? 'non renseignée'],
    ['Date d’acceptation', faits.dateAutorisation ?? 'non renseignée'],
  ];
  if (faits.surfaceCreee) lignes.push(['Surface créée', `${faits.surfaceCreee} m²`]);
  return (
    <div className="svv-card" role="note" style={{ fontSize: 12 }}>
      <div style={{ ...styleAide, marginBottom: '.35rem' }}>Faits connus du permis (Sitadel) — lecture seule, non modifiables ici.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.2rem .8rem' }}>
        {lignes.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}><span style={{ color: 'var(--color-svv-muted)' }}>{k} : </span><strong style={{ overflowWrap: 'anywhere' }}>{v}</strong></div>
        ))}
      </div>
    </div>
  );
}

/** Éditeur du PARKING en TROIS états (select : non renseigné / oui / non), avec son origine. Jamais une case binaire. */
export function EditeurParking({ valeur, origine, onValeur }: { valeur: '' | 'oui' | 'non'; origine: OrigineValeur | null; onValeur: (v: '' | 'oui' | 'non') => void }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={styleLabel}>Parking</span><PastilleOrigineValeur origine={origine} />
      </span>
      <select value={valeur} onChange={(e) => onValeur(e.target.value as '' | 'oui' | 'non')} style={styleInput} aria-label="Parking">
        <option value="">— non renseigné —</option>
        <option value="oui">oui</option>
        <option value="non">non</option>
      </select>
    </div>
  );
}

/** N5-D — texte de la PROVENANCE (pièce p.page), atteignable via un repliable discret. « — » si une donnée manque. */
function texteProvenance(p: { piece: string | null; page: number | null }): string {
  const piece = p.piece ?? 'pièce inconnue';
  return p.page !== null ? `${piece} p.${p.page}` : piece;
}

/**
 * Champ d'UNE mesure : input numérique (VIDE autorisé → jamais 0 par défaut), bornes LUES de la base sous le champ, origine, et
 * message d'erreur (au niveau du champ, citant les bornes réelles). Le SOMMET est signalé visuellement + une ligne dit ce qu'il désigne.
 *
 * N5-D — pour une valeur d'origine 'extraite', on montre EN PLUS ce que le journal en dit : sa CONFIANCE (pastille distincte de
 * l'origine), sa RÉSERVE en toutes lettres sous le champ, et sa PROVENANCE (pièce/page) dans un repliable. Pour une valeur
 * 'saisie' : rien de tout ça (jamais de « à vérifier » par défaut).
 * N5-E — pour un champ VIDE (non renseigné) dont le journal porte un MOTIF de non-écriture, on affiche ce motif en une phrase
 * courte (même bloc note lisible que la réserve). Un champ vide SANS motif journalisé n'affiche rien (pas de note orpheline).
 */
export function ChampMesureEditeur({ mesure, bornes, valeur, origine, erreur, journal, onValeur }: {
  mesure: (typeof MESURES)[number]; bornes?: Bornes; valeur: string; origine: OrigineValeur | null; erreur?: string; journal?: JournalChamp; onValeur: (v: string) => void;
}) {
  const cadreSommet: CSSProperties = mesure.estSommet
    ? { border: '1px solid var(--color-svv-red)', borderRadius: '.5rem', padding: '.4rem .5rem', background: '#fff8f8' }
    : {};
  // La confiance/réserve/provenance ne concernent QUE l'extraction : une saisie ou un champ vide n'en portent aucune.
  const j = origine === 'extraite' ? journal : undefined;
  const provenances = j?.provenances ?? [];
  // N5-E — le MOTIF ne s'affiche que sous un champ VIDE (non renseigné). Une saisie ou une valeur extraite n'en montre pas.
  const motif = origine === null ? journal?.motif ?? null : null;
  const styleNote: CSSProperties = { fontSize: 11, lineHeight: 1.4, color: 'var(--color-svv-ink)', background: '#fff8f8', border: '1px solid var(--color-svv-red)', borderRadius: '.35rem', padding: '.25rem .4rem' };
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0, ...cadreSommet }}>
      <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={styleLabel}>{mesure.libelle}{mesure.unite ? ` (${mesure.unite})` : ''}{mesure.estSommet ? ' ★' : ''}</span>
        <PastilleOrigineValeur origine={origine} />
        {j?.confiance && <PastilleConfiance confiance={j.confiance} />}
      </span>
      <input type="number" inputMode="decimal" value={valeur} placeholder="vide = non renseigné"
        min={bornes?.min} max={bornes?.max} step={mesure.entier ? 1 : 'any'}
        onChange={(e) => onValeur(e.target.value)} style={styleInput} aria-label={mesure.libelle} />
      <span style={styleAide}>{libelleBornes(mesure, bornes)}</span>
      {mesure.estSommet && <span style={{ ...styleAide, color: 'var(--color-svv-red)' }}>{mesure.aide}</span>}
      {erreur && <span role="alert" style={styleErreur}>{erreur}</span>}
      {j?.reserve && <span role="note" style={styleNote}>⚠ {j.reserve}</span>}
      {motif && <span role="note" style={{ ...styleNote, color: 'var(--color-svv-muted)' }}>vide : {motif}</span>}
      {provenances.length > 0 && (
        <details style={{ fontSize: 11 }}>
          <summary style={{ ...styleAide, cursor: 'pointer' }}>provenance ({provenances.length} pièce{provenances.length > 1 ? 's' : ''})</summary>
          <span style={{ ...styleAide, display: 'block', marginTop: '.15rem', overflowWrap: 'anywhere' }}>{provenances.map(texteProvenance).join(' · ')}</span>
        </details>
      )}
    </div>
  );
}

/** Message quand un permis n'a encore AUCUN corps de bâtiment (jamais un vide muet). */
export const MESSAGE_AUCUN_CORPS = 'Aucun corps de bâtiment renseigné. Ajoutez-en un pour saisir étages, altitudes et hauteur.';
