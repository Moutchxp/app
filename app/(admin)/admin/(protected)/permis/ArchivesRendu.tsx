import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { ConteneurTableDefilant } from './DemandesRendu';
import { jjmm, tronquerObjet } from './ReponsesRendu'; // T5 : mêmes helpers d'étiquette que BlocPiecesReponses (cohérence Réponses/Archives)
import { formaterDateJour } from '../../../../lib/sitadel/priorite';
import { expirationEffective, SEUIL_ARCHIVE_GRIS_MOIS } from '../../../../lib/veille/alerteGed'; // G2 : on IMPORTE les définitions G1 (délai), on ne les recopie pas
import { BLEU_SOURCE } from './CaracteristiquesRendu'; // N10 : MÊME bleu que les liens de provenance (source unique = « même sens »)
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

/**
 * A1a/A1b — Rendu PUR de l'onglet Archives (permis renseignés par les mairies + leurs pièces, reçues par e-mail OU ajoutées à
 * la main). Aucun état, aucun effet → testable en Node via `renderToStaticMarkup`. ⚠️ SÉCURITÉ : la CLÉ de stockage n'existe
 * PAS dans ces props (seul un booléen `deposee` + l'id de la pièce) — elle ne peut jamais apparaître dans le HTML. Le
 * téléchargement passe par un id + une `source`, signés côté serveur. Mobile-first (conteneur défilant a11y). Aucune animation.
 */

const styleTd: CSSProperties = { padding: '.4rem .55rem', whiteSpace: 'nowrap', verticalAlign: 'top' };
const muted: CSSProperties = { color: 'var(--color-svv-muted)' };

/** Libellé FR de l'origine du marquage « satisfait » (`satisfait_par`). Valeur inattendue/nulle → « — » (jamais muet). */
export function libelleOrigineSatisfaction(satisfaitPar: string | null): string {
  return satisfaitPar === 'automatique' ? 'automatique' : satisfaitPar === 'manuel' ? 'manuel' : '—';
}

// ── G2 : état visuel d'une ligne d'archive (couleur de ligne + mot, exception « versement oublié » au-delà de 2 mois) ────────
const ORANGE = '#8a5a00';                        // convention existante des badges d'échéance (aucun jeton orange dans le thème)
const VERT = 'var(--color-svv-green-ink)';
const ROUGE = 'var(--color-svv-red)';

export type EtatArchiveCle = 'obtenu' | 'attente' | 'depasse' | 'sans_contenu' | 'versement_oublie' | 'incomplet';
export interface EtatArchive {
  cle: EtatArchiveCle;
  mot: string;                  // TOUJOURS rendu (la couleur ne porte jamais seule l'info — lisible en noir et blanc)
  couleurLigne: string | null;  // couleur du TEXTE de la ligne (null = neutre, « comme aujourd'hui »)
  couleurPieces: string | null; // couleur du mot d'état dans la colonne Pièces (null = neutre)
}

/** > `mois` mois CALENDAIRES depuis `satisfaitLe` ('YYYY-MM-DD'). */
function apresMoisCalendaires(satisfaitLe: string, maintenant: Date, mois: number): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(satisfaitLe);
  if (!m) return false;
  const seuil = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + mois, Number(m[3])));
  return maintenant.getTime() >= seuil.getTime();
}

/**
 * G2 — état visuel d'une ligne d'archive. PUR. ALIGNÉ G1/T8 (définitions IMPORTÉES, pas recopiées). DEUX notions DISTINCTES :
 *   - `enGed` = « des PIÈCES sont en GED » = ∃ `dossier_document` REÇU. N6-G : c'est origine ∈ {'manuel', 'auto'} (les deux
 *     vivent dans dossier_document), quelle que soit la façon dont elles y sont arrivées (à la main, versement auto, Drive). On
 *     EXCLUT 'genere' (notre fiche de synthèse, pas une pièce obtenue) et 'email' (une pièce e-mail vit dans
 *     demande_reponse_piece, PAS ENCORE en GED). ⚠️ N6-F a requalifié les pièces versées auto de 'manuel' → 'auto' : tester
 *     'manuel' SEUL faisait retomber un permis plein de pièces sur « sans contenu reçu ». C'est ce calcul qu'on corrige, pas la donnée.
 *   - `aContenu` = « la MAIRIE a envoyé du contenu (pas forcément classé en GED) » = pièce e-mail rattachée OU lien fort.
 * États : obtenu (VERT, enGed) ; en attente (ORANGE, contenu reçu non classé, délai non passé) ; délai dépassé (ROUGE) ;
 * sans contenu reçu (NEUTRE : ni pièce en GED, ni contenu reçu → rien à classer, JAMAIS rouge). Après 2 mois (satisfait_le) : la
 * LIGNE repasse en neutre. EXCEPTION : un contenu reçu jamais classé (aContenu sans enGed) garde la colonne Pièces en ROUGE « versement oublié ».
 */
export function etatArchive(l: Pick<LigneArchive, 'satisfaitLe' | 'recuLe' | 'expireLeCapte' | 'aLienFort' | 'pieces' | 'completudeIncomplete'>, maintenant: Date): EtatArchive {
  // POLISH-1 — le diagnostic « dossier INCOMPLET » (par contenu) PRIME sur tout : toute la ligne en ROUGE, mot « incomplet ». Le
  //   ROUGE réutilisé = var(--color-svv-red), IDENTIQUE à BlocCompletude (aucune nouvelle teinte). a11y : le MOT porte l'info, jamais
  //   la seule couleur. `completudeIncomplete` = false quand le permis n'a PAS de diagnostic connu → « pas encore diagnostiqué »
  //   n'est JAMAIS « incomplet » (comportement inchangé, ligne neutre).
  if (l.completudeIncomplete) return { cle: 'incomplet', mot: 'incomplet', couleurLigne: ROUGE, couleurPieces: ROUGE };
  const enGed = l.pieces.some((p) => p.origine === 'manuel' || p.origine === 'auto'); // ∃ dossier_document REÇU = obtenu (T8) ; 'genere'/'email' exclus
  const aContenu = l.pieces.some((p) => p.origine === 'email') || l.aLienFort;

  let cle: EtatArchiveCle, mot: string;
  if (enGed) { cle = 'obtenu'; mot = 'obtenu'; }
  else if (!aContenu) { cle = 'sans_contenu'; mot = 'sans contenu reçu'; } // jamais rouge : on ne reproche pas un contenu inexistant
  else {
    const delai = l.recuLe !== null ? expirationEffective(new Date(l.recuLe), l.expireLeCapte !== null ? new Date(l.expireLeCapte) : null) : null;
    const depasse = delai !== null && maintenant.getTime() >= delai.getTime();
    cle = depasse ? 'depasse' : 'attente';
    mot = depasse ? 'délai dépassé' : 'en attente';
  }

  const ancien = l.satisfaitLe !== null && apresMoisCalendaires(l.satisfaitLe, maintenant, SEUIL_ARCHIVE_GRIS_MOIS);
  if (!ancien) {
    const c = cle === 'obtenu' ? VERT : cle === 'attente' ? ORANGE : cle === 'depasse' ? ROUGE : null;
    return { cle, mot, couleurLigne: c, couleurPieces: c };
  }
  if (!enGed && aContenu) return { cle: 'versement_oublie', mot: 'versement oublié', couleurLigne: null, couleurPieces: ROUGE };
  return { cle, mot, couleurLigne: null, couleurPieces: null }; // > 2 mois, rien à signaler → neutre (mot conservé)
}

/** G2 — mot d'état d'une ligne d'archive (colonne Pièces). Le MOT est TOUJOURS rendu ; la couleur n'est qu'un appui. PUR. */
export function BadgeEtatArchive({ etat }: { etat: EtatArchive }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: etat.couleurPieces ?? 'var(--color-svv-muted)' }}>{etat.mot}</span>
  );
}

/** Pastille d'ORIGINE d'une pièce : reçue par e-mail · ajoutée à la main · N1-B fiche générée · N6-F versée automatiquement. Texte porteur, couleur en appui. */
function PastilleOrigine({ origine }: { origine: PieceArchive['origine'] }) {
  const base: CSSProperties = { fontSize: 10, fontWeight: 700, padding: '.03rem .3rem', borderRadius: '.3rem', whiteSpace: 'nowrap' };
  if (origine === 'genere') return <span style={{ ...base, background: '#fdecec', color: 'var(--color-svv-red)' }}>fiche de synthèse</span>;
  if (origine === 'auto') return <span style={{ ...base, background: '#fdf1dd', color: '#8a5a00' }}>versée automatiquement</span>;
  if (origine === 'manuel') return <span style={{ ...base, background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' }}>ajoutée à la main</span>;
  return <span style={{ ...base, background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)' }}>reçue par e-mail</span>;
}

/**
 * Une pièce : ORIGINE visible + DÉPOSÉE → bouton « télécharger » (le serveur signera l'URL — la clé ne transite JAMAIS ;
 * `source` dérivée de l'origine : 'reponse' pour l'e-mail, 'dossier' pour un document/fiche/versement du dossier) ; NON déposée →
 * son MOTIF, jamais un bouton mort. SUPPRIMABLE : document ajouté À LA MAIN et pièce VERSÉE AUTOMATIQUEMENT (N6-F : un versement
 * auto peut se tromper, on doit pouvoir défaire) ; JAMAIS une pièce e-mail (registre) ni la FICHE générée (N1-B : régénérée). Pour
 * une pièce 'auto', l'EXPÉDITEUR du mail d'origine est affiché (d'où vient la pièce). PURE.
 */
export function PieceLien({ piece, onTelecharger, onSupprimer }: {
  piece: PieceArchive; onTelecharger?: (id: number, source: 'reponse' | 'dossier') => void; onSupprimer?: (documentId: number) => void;
}) {
  const source: 'reponse' | 'dossier' = piece.origine === 'email' ? 'reponse' : 'dossier'; // manuel, auto ET genere vivent dans dossier_document
  const supprimable = piece.origine === 'manuel' || piece.origine === 'auto'; // N6-F : l'auto est défaisable ; la fiche générée non
  return (
    <span style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <PastilleOrigine origine={piece.origine} />
      {piece.origine === 'auto' && piece.deposePar ? <span style={{ fontSize: 10, ...muted }}>· {piece.deposePar}</span> : null}
      {/* N10 — une pièce SOURCE (ayant servi à extraire une valeur) est écrite en BLEU, même sens que les liens de provenance. */}
      {piece.deposee
        ? <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', textAlign: 'left', color: piece.estSource ? BLEU_SOURCE : undefined, fontWeight: piece.estSource ? 700 : undefined }} onClick={() => onTelecharger?.(piece.id, source)}>{piece.nomFichier} ↓</button>
        : <span style={{ fontSize: 12, ...(piece.estSource ? { color: BLEU_SOURCE, fontWeight: 700 } : muted) }}>{piece.nomFichier} — <em>non déposée{piece.motifNonStocke ? ` : ${piece.motifNonStocke}` : ''}</em></span>}
      {/* N10-J — LIBELLÉ TEXTE de la source (jamais la couleur seule) : ce que la pièce a servi à remplir. */}
      {piece.estSource && piece.nbChampsSource != null && (
        <span style={{ fontSize: 10, color: BLEU_SOURCE }}>· a servi à remplir {piece.nbChampsSource} champ{piece.nbChampsSource > 1 ? 's' : ''}</span>
      )}
      {supprimable && onSupprimer ? <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', color: 'var(--color-svv-red)' }} onClick={() => onSupprimer(piece.id)}>supprimer</button> : null}
    </span>
  );
}

/**
 * N3-D — CLASSEMENT des pièces du dossier par CATÉGORIE, sur le NOM DE FICHIER. Table de motifs DOCUMENTÉE ICI (source UNIQUE),
 * fonction PURE et testée. Ordre : plans · décision · avis · cerfa · autres.
 *
 * ⚠️ LIMITE ASSUMÉE (à redire dans le rapport) : ces motifs viennent d'UNE SEULE commune (Paris, permis 07512025V0035 — recon
 * N6-A). Les conventions de nommage varient d'une mairie à l'autre → le classement sera IMPARFAIT ailleurs. C'est acceptable car
 * toute pièce non reconnue tombe dans « autres » et reste VISIBLE + TÉLÉCHARGEABLE (T5) : RIEN n'est jamais masqué, filtré ni
 * perdu par ce classement. La seule source VRAIMENT robuste serait un type de document STRUCTURÉ, or ni Sitadel ni la GED n'en
 * portent (recon N3-A) → le nom de fichier est le seul signal disponible ; on ne DEVINE rien de plus.
 */
export type CategoriePiece = 'plans' | 'decision' | 'avis' | 'cerfa' | 'autres';
export const ORDRE_CATEGORIES_PIECES: readonly { cle: Exclude<CategoriePiece, 'autres'>; libelle: string; motifs: RegExp[] }[] = [
  { cle: 'plans', libelle: 'Plans', motifs: [/^\s*PC\d/i, /^\s*C_A/i] },                                    // « PC1… », « PC16.1… », « C_A1… »
  { cle: 'decision', libelle: 'Décision (arrêté, autorisation, notification)', motifs: [/autorisation/i, /notification/i, /arr[eê]t[eé]/i] },
  { cle: 'avis', libelle: 'Avis de services', motifs: [/favorable/i, /udap/i, /ratp/i] },                    // « Favorable… », « UDAP… », « RATP… »
  { cle: 'cerfa', libelle: 'Cerfa', motifs: [/cerfa/i] },
];
export const LIBELLE_CATEGORIE_AUTRES = 'Autres pièces';
/** Première catégorie dont un motif reconnaît le nom ; sinon « autres » (jamais masqué). PURE. */
export function categoriePiece(nomFichier: string): CategoriePiece {
  for (const c of ORDRE_CATEGORIES_PIECES) if (c.motifs.some((r) => r.test(nomFichier))) return c.cle;
  return 'autres';
}

/** Cellule « pièces » : N1-B la FICHE DE SYNTHÈSE en tête ; N3-D les documents du dossier CLASSÉS PAR CATÉGORIE (ordre d'origine
 *  conservé à l'intérieur) ; puis les pièces e-mail GROUPÉES PAR RÉPONSE (T5). « aucun document attaché » si sans document. PURE. */
export function CellulePieces({ pieces, sourcesNonResolues, onTelecharger, onSupprimer }: {
  pieces: PieceArchive[]; sourcesNonResolues?: string[]; onTelecharger?: (id: number, source: 'reponse' | 'dossier') => void; onSupprimer?: (documentId: number) => void;
}) {
  if (pieces.length === 0) return <span style={{ fontSize: 12, ...muted }}>aucun document attaché</span>;
  const generes = pieces.filter((p) => p.origine === 'genere'); // N1-B : la ou les fiche(s) générée(s) — affichées en tête
  const documentsDossier = pieces.filter((p) => p.origine === 'manuel' || p.origine === 'auto'); // N6-F : versées auto + ajoutées à la main
  // T5 — regroupe les pièces e-mail par réponse (clé recuLe|objet), ordre de première apparition préservé (SQL trié par recu_le DESC).
  const groupes = new Map<string, { recuLe: string | null; objet: string | null; items: PieceArchive[] }>();
  for (const p of pieces) {
    if (p.origine !== 'email') continue;
    const cle = `${p.recuLe ?? ''}|${p.objet ?? ''}`;
    const g = groupes.get(cle) ?? groupes.set(cle, { recuLe: p.recuLe, objet: p.objet, items: [] }).get(cle)!;
    g.items.push(p);
  }
  // N10 — À L'INTÉRIEUR d'une catégorie, les pièces SOURCES remontent EN TÊTE ; l'ordre des catégories (N3-D) et l'ordre relatif des
  //   pièces non sources restent stables (partition, pas un tri comparatif). L'ordre des catégories lui-même n'est jamais touché.
  const sourcesEnTete = (items: PieceArchive[]): PieceArchive[] => [...items.filter((p) => p.estSource), ...items.filter((p) => !p.estSource)];
  // N3-D — répartition des documents du dossier par catégorie, dans l'ORDRE défini ; ordre d'origine conservé (filter stable).
  const parCategorie = [
    ...ORDRE_CATEGORIES_PIECES.map((c) => ({ cle: c.cle as CategoriePiece, libelle: c.libelle, items: sourcesEnTete(documentsDossier.filter((p) => categoriePiece(p.nomFichier) === c.cle)) })),
    { cle: 'autres' as CategoriePiece, libelle: LIBELLE_CATEGORIE_AUTRES, items: sourcesEnTete(documentsDossier.filter((p) => categoriePiece(p.nomFichier) === 'autres')) },
  ].filter((g) => g.items.length > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      {generes.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
          {generes.map((p) => <li key={`genere-${p.id}`}><PieceLien piece={p} onTelecharger={onTelecharger} onSupprimer={onSupprimer} /></li>)}
        </ul>
      )}
      {parCategorie.map((g) => (
        <div key={`cat-${g.cle}`}>
          <span style={{ fontSize: 11, ...muted }}>{g.libelle}</span>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
            {g.items.map((p) => <li key={`doc-${p.id}`}><PieceLien piece={p} onTelecharger={onTelecharger} onSupprimer={onSupprimer} /></li>)}
          </ul>
        </div>
      ))}
      {/* N10-J — sources du journal NON résolues (homonyme ambigu, ou nom absent de la GED) : rien épinglé, mais RENDU VISIBLE. */}
      {sourcesNonResolues && sourcesNonResolues.length > 0 && (
        <span role="note" style={{ fontSize: 11, ...muted }}>
          source{sourcesNonResolues.length > 1 ? 's' : ''} non résolue{sourcesNonResolues.length > 1 ? 's' : ''} (non épinglée{sourcesNonResolues.length > 1 ? 's' : ''}) : {sourcesNonResolues.join(', ')}
        </span>
      )}
      {[...groupes.values()].map((g, i) => (
        <div key={`e-${i}`}>
          <span style={{ fontSize: 11, ...muted }}>reçues le {jjmm(g.recuLe)} — {tronquerObjet(g.objet)}</span>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
            {g.items.map((p) => <li key={`email-${p.id}`}><PieceLien piece={p} onTelecharger={onTelecharger} onSupprimer={onSupprimer} /></li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * A1b — contrôle d'ajout d'un document À LA MAIN sur un permis. PUR : le fichier choisi est remonté à la Vue (`onFichier`),
 * qui le téléverse. Pas d'attribut `accept` : la whitelist MIME reste l'AUTORITÉ du serveur (aucune copie côté client). Le
 * champ `file` est masqué derrière un libellé cliquable (cible tactile suffisante, pas d'input brut disgracieux).
 */
export function AjoutDocument({ dossierId, onFichier, enCours }: { dossierId: number; onFichier?: (dossierId: number, fichier: File) => void; enCours?: boolean }) {
  return (
    <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center', fontSize: 12, cursor: enCours ? 'default' : 'pointer' }}>
      <span className="svv-link" style={{ padding: '.1rem .3rem' }} aria-hidden="true">{enCours ? 'Envoi…' : '+ ajouter un document'}</span>
      <input type="file" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} disabled={enCours}
        aria-label={`Ajouter un document au permis ${dossierId}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFichier?.(dossierId, f); e.target.value = ''; }} />
    </label>
  );
}

/** N1-C — libellé du COMPTE de pièces porté par la ligne repliée (leçon U6 : une ligne repliée SANS son chiffre perd sa raison
 *  d'être). Jamais muet : 0 → « aucune pièce ». PUR. */
export function labelNbPieces(n: number): string {
  return n === 0 ? 'aucune pièce' : `${n} pièce${n > 1 ? 's' : ''}`;
}

/** N1-C — id du panneau déplié d'un permis : cible de `aria-controls` du bouton « Déplier » (disclosure natif, motif Q2b/C3). */
const ancrePieces = (dossierId: number): string => `archive-pieces-${dossierId}`;

/** Nombre de colonnes du tableau (N° permis · Commune · Type · Autorisation · Satisfaction · Origine · Demande · Pièces) → colSpan du panneau. */
const NB_COLONNES_ARCHIVES = 8;

export const MESSAGE_VIDE_ARCHIVES = 'Aucun permis renseigné pour l’instant.';
export const EXPLICATION_VIDE_ARCHIVES =
  'Ces lignes apparaîtront quand une mairie aura répondu à une demande et que les pièces reçues auront été rattachées au dossier (onglet Réponses) : le permis passe alors en « renseigné » et rejoint les archives.';

/**
 * A1a/A1b + N1-C — TABLEAU des archives, PUR. Une ligne = un permis renseigné, REPLIÉE par défaut (le fondateur : « toutes les
 * pièces s'accumulent et prennent tout l'écran »). Colonnes : N° permis · Commune · Type · Autorisation · Satisfaction ·
 * Origine · Demande · Pièces. La colonne « Pièces » de la ligne repliée reste INFORMATIVE : compte de pièces (« 13 pièces »,
 * leçon U6) + mot d'état G2 + bouton « Déplier ». Déplier ouvre une 2ᵉ `<tr><td colSpan>` sous la ligne (disclosure NATIF,
 * motif a11y Q2b/C3 : `aria-expanded`/`aria-controls` ; pas de BlocRepliable = `<section>`, INVALIDE dans un `<tbody>`) qui porte
 * les pièces condensées + l'ajout à la main. Accordéon à UN volet (état `dossierOuvert` levé dans la Vue). Conteneur défilant
 * a11y (mobile). État vide EXPLICITE. Aucune animation → prefers-reduced-motion sans objet. Tri (satisfaction ↓) côté serveur.
 */
export function TableArchives({ lignes, maintenant, dossierOuvert, onDeplier, onTelecharger, onSupprimer, onFichier, uploadEnCours, slotCaracteristiques }: {
  lignes: LigneArchive[];
  maintenant: Date; // G2 : « aujourd'hui » (fourni par la Vue) — pilote les 2 mois et le « délai dépassé ». Injecté → rendu déterministe/testable.
  dossierOuvert?: number | null; // N1-C : le dossierId de l'UNIQUE ligne dépliée (null = toutes repliées). État levé dans la Vue.
  onDeplier?: (dossierId: number) => void; // bascule le repli d'une ligne (accordéon à un volet, géré par la Vue)
  onTelecharger?: (id: number, source: 'reponse' | 'dossier') => void;
  onSupprimer?: (documentId: number) => void;
  onFichier?: (dossierId: number, fichier: File) => void;
  uploadEnCours?: number | null;
  slotCaracteristiques?: (dossierId: number) => ReactNode; // N3-C : bloc « Caractéristiques » injecté par la Vue APRÈS pièces + ajout (facultatif → tests inchangés)
}) {
  if (lignes.length === 0) {
    return (
      <div className="svv-card" role="note" style={{ fontSize: 13 }}>
        <strong>{MESSAGE_VIDE_ARCHIVES}</strong>
        <p style={{ fontSize: 12, ...muted, margin: '.4rem 0 0', lineHeight: 1.5 }}>{EXPLICATION_VIDE_ARCHIVES}</p>
      </div>
    );
  }
  return (
    <ConteneurTableDefilant ariaLabel="Tableau des permis archivés, défilement horizontal">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', ...muted, borderBottom: '1px solid var(--color-svv-line)' }}>
            <th style={{ ...styleTd, minWidth: 130 }}>N° permis</th>
            <th style={{ ...styleTd, whiteSpace: 'normal' }}>Commune</th>
            <th style={styleTd}>Type</th>
            <th style={styleTd}>Autorisation</th>
            <th style={styleTd}>Satisfaction</th>
            <th style={styleTd}>Origine</th>
            <th style={styleTd}>Demande</th>
            <th style={{ ...styleTd, whiteSpace: 'normal', minWidth: 160 }}>Pièces</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            // G2 — état visuel : le TEXTE de la ligne prend la couleur (couleurLigne), le MOT d'état reste sur la ligne repliée.
            const e = etatArchive(l, maintenant);
            const ouvert = dossierOuvert === l.dossierId;
            return (
              <Fragment key={l.dossierId}>
                <tr style={{ borderBottom: ouvert ? 'none' : '1px solid var(--color-svv-line)', color: e.couleurLigne ?? undefined }}>
                  <td style={{ ...styleTd, fontFamily: 'var(--font-svv-mono, monospace)' }}>{l.numDau}</td>
                  <td style={{ ...styleTd, whiteSpace: 'normal' }}>{l.communeNom ?? l.codeInsee} <span style={{ fontSize: 11, ...muted }}>({l.codeInsee})</span></td>
                  <td style={styleTd}>{l.libelleCategorie}</td>
                  <td style={styleTd}>{formaterDateJour(l.dateAutorisation)}</td>
                  <td style={styleTd}>{formaterDateJour(l.satisfaitLe)}</td>
                  <td style={styleTd}>{libelleOrigineSatisfaction(l.satisfaitPar)}</td>
                  <td style={{ ...styleTd, fontFamily: 'var(--font-svv-mono, monospace)' }}>{l.demandeReference}</td>
                  {/* N1-C — ligne repliée informative : compte de pièces (U6) + mot d'état G2 + bouton de disclosure natif. */}
                  <td style={{ ...styleTd, whiteSpace: 'normal' }}>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, ...muted }}>{labelNbPieces(l.pieces.length)}</span>
                      <BadgeEtatArchive etat={e} />
                      <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .5rem' }}
                        aria-expanded={ouvert} aria-controls={ancrePieces(l.dossierId)} onClick={() => onDeplier?.(l.dossierId)}>
                        {ouvert ? 'Fermer' : 'Déplier'}
                      </button>
                    </div>
                  </td>
                </tr>
                {ouvert && (
                  <tr>
                    {/* Panneau condensé : pièces (une par ligne compacte, actions alignées — CellulePieces) + ajout à la main. */}
                    <td id={ancrePieces(l.dossierId)} colSpan={NB_COLONNES_ARCHIVES}
                      style={{ padding: '.6rem .8rem', borderBottom: '1px solid var(--color-svv-line)', background: 'var(--color-svv-field)', whiteSpace: 'normal' }}>
                      {/* N3-D — le bloc « Caractéristiques du bâtiment » (contenu MÉTIER) passe EN PREMIER ; les documents se consultent ensuite. Slot facultatif. */}
                      {slotCaracteristiques ? slotCaracteristiques(l.dossierId) : null}
                      <div style={{ marginTop: slotCaracteristiques ? '.6rem' : 0 }}>
                        <CellulePieces pieces={l.pieces} sourcesNonResolues={l.sourcesNonResolues} onTelecharger={onTelecharger} onSupprimer={onSupprimer} />
                      </div>
                      <div style={{ marginTop: '.5rem' }}><AjoutDocument dossierId={l.dossierId} onFichier={onFichier} enCours={uploadEnCours === l.dossierId} /></div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </ConteneurTableDefilant>
  );
}
