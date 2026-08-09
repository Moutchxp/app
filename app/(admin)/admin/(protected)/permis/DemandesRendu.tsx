import type { CSSProperties, ReactNode } from 'react';
import type { Tri, TriColonne } from '../../../../lib/sitadel/demandesListe';

/**
 * Rendu PUR de la visibilité PRADA de l'onglet Demandes (chantier S14e) — aucun état, aucun effet → testable en Node via
 * `renderToStaticMarkup`. ⚠️ a11y : l'information est portée par du TEXTE (« PRADA » / « contact mairie »), la couleur n'est
 * qu'un appui. Aucune dépendance serveur ici.
 */

export interface ArbitrageAffiche {
  codeInsee: string; communeNom: string | null; pradaNom: string | null; pradaCourriel: string | null;
  contactCanal: string | null; contactEmail: string | null; contactAdressePostale: string | null;
}
export interface AmbiguiteAffiche {
  id: number; nomAdministration: string | null; departement: string | null; codePostalVille: string | null;
  courriel: string | null; adresse: string | null; prenom: string | null; nom: string | null; millesime: string;
}
export interface CommuneInjoignableAffiche { codeInsee: string; nom: string; departement: string }
export interface DepotAffiche { id: number; reference: string; communeNom: string | null; url: string | null; corps: string | null; nbDossiers: number; statut: string }

/** Retire une commune d'une liste par son code (retrait optimiste après enregistrement). Pur → testable. */
export function retirerCommune<T extends { codeInsee: string }>(liste: T[], code: string): T[] {
  return liste.filter((c) => c.codeInsee !== code);
}

/**
 * S42 — message de retour d'une action de statut. `zone` = là où l'utilisateur a agi ('haut' = actions groupées,
 * 'detail' = boutons du panneau détail). `ok` distingue succès/échec (couleur + graisse ; le TEXTE reste porteur).
 */
export type RetourAction = { texte: string; ok: boolean; zone: 'haut' | 'detail' } | null;

/**
 * Répartit le message de retour dans UNE seule zone d'affichage (jamais deux à l'écran en même temps) : quand le message
 * vient du panneau détail ET que ce panneau est ouvert, il s'affiche là ; sinon dans le bandeau du haut (repli inclus si
 * le détail s'est refermé). Pur → testable en Node.
 */
export function repartirRetour(r: RetourAction, detailOuvert: boolean): { haut: RetourAction; detail: RetourAction } {
  if (!r) return { haut: null, detail: null };
  if (r.zone === 'detail' && detailOuvert) return { haut: null, detail: r };
  return { haut: r, detail: null };
}

/** Rend le message de retour : succès en vert, échec en rouge (gras) — role="status" pour lecteur d'écran. `null` si vide. */
export function MessageRetour({ r }: { r: RetourAction }) {
  if (!r || r.texte === '') return null;
  return (
    <span role="status" style={{ fontSize: 13, fontWeight: r.ok ? 400 : 600, color: r.ok ? 'var(--color-svv-green)' : 'var(--color-svv-red)' }}>
      {r.texte}
    </span>
  );
}

const aide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.45, margin: '.3rem 0 0' };

/** Indication d'origine du destinataire par ligne : « PRADA — Nom » ou « contact mairie ». Texte d'abord, couleur en appui. */
export function OrigineDest({ origine, nom }: { origine?: string | null; nom?: string | null }) {
  const prada = origine === 'prada';
  const style: CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '.05rem .4rem', borderRadius: '.35rem', whiteSpace: 'nowrap',
    background: prada ? 'var(--color-svv-green-soft)' : 'var(--color-svv-field)',
    color: prada ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)',
  };
  return <span style={style}>{prada ? `PRADA${nom && nom.trim() !== '' ? ` — ${nom}` : ''}` : 'contact mairie'}</span>;
}

const detailContact = (a: ArbitrageAffiche): string =>
  [a.contactCanal, a.contactEmail, a.contactAdressePostale].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' · ');

/**
 * Encart d'ARBITRAGE (information seule, AUCUNE bascule) : communes où une PRADA au courriel connu existe mais le contact
 * a été confirmé à la main → rien n'a basculé (le travail humain prime). Groupe nommé pour lecteur d'écran.
 */
export function EncartArbitrages({ arbitrages }: { arbitrages: ArbitrageAffiche[] }) {
  if (arbitrages.length === 0) return null;
  return (
    <section role="group" aria-label="Arbitrages PRADA à rendre" className="svv-card" style={{ background: '#fff4e0', color: '#8a5a00' }}>
      <strong>{arbitrages.length} commune(s) : PRADA disponible, mais contact confirmé conservé</strong>
      <p style={aide}>
        Une PRADA au courriel connu existe pour ces communes, mais leur destinataire a été validé À LA MAIN (contact
        « confirmé ») : <strong>rien n’a basculé automatiquement</strong> — le travail humain prime. À arbitrer manuellement
        si vous souhaitez plutôt écrire à la PRADA.
      </p>
      <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem', fontSize: 13, lineHeight: 1.5 }}>
        {arbitrages.map((a) => (
          <li key={a.codeInsee}>
            <strong>{a.communeNom ?? a.codeInsee}</strong> — PRADA {a.pradaNom ?? '(nom non renseigné)'}
            {a.pradaCourriel ? ` · ${a.pradaCourriel}` : ''} — <em>retenu&nbsp;:</em> {detailContact(a) || '(contact incomplet)'}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Carte d'une ligne AMBIGUË (mobile-first : repli en carte, jamais un tableau qui déborde). Affiche les colonnes brutes ;
 * les contrôles interactifs (recherche de commune, boutons) sont fournis par le parent via `children`.
 */
/**
 * Carte d'une commune INJOIGNABLE (aucune adresse e-mail) — mobile-first (carte). Le département est affiché en TEXTE
 * (« dép. 92 »), jamais porté par la seule couleur. Le champ e-mail + le bouton d'enregistrement sont fournis en `children`.
 */
export function CarteInjoignable({ c, children }: { c: CommuneInjoignableAffiche; children?: ReactNode }) {
  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{c.nom}</strong>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '.05rem .4rem', borderRadius: '.35rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)' }}>dép. {c.departement}</span>
        <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>({c.codeInsee})</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Carte « à déposer à la main » (S16) : commune, URL de téléservice cliquable (nouvel onglet, rel noopener), nombre de
 * dossiers, et le TEXTE COMPLET de la demande (celui de genererTexte, figé en base) prêt à copier. Boutons fournis en
 * `children`. Mobile-first (carte, texte en zone scrollable).
 */
export function CarteDepot({ d, children }: { d: DepotAffiche; children?: ReactNode }) {
  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{d.communeNom ?? d.reference}</strong>
        <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{d.nbDossiers} dossier(s)</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-svv-mono, monospace)', color: 'var(--color-svv-muted)' }}>{d.reference}</span>
      </div>
      {d.url && d.url.trim() !== ''
        ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="svv-link" style={{ width: 'auto', fontSize: 13 }}>Ouvrir le téléservice ↗</a>
        : <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>URL de téléservice manquante — à compléter dans l’éditeur de contact (canal formulaire).</span>}
      <textarea readOnly value={d.corps ?? ''} rows={10} aria-label={`Texte de la demande pour ${d.communeNom ?? d.reference}`}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
      {children}
    </div>
  );
}

// ── V3 : carte de PROPOSITION avec choix lot-par-lot ──────────────────────────
/** Un lot proposé, prêt à afficher/cocher. `cle` = clé stable (cleLot, ensemble trié des dossierId) — l'identité de sélection. */
export interface LotAffiche { cle: string; codeInsee: string; communeNom: string; canal: string; nbDossiers: number; destOrigine?: 'mairie_contact' | 'prada'; destNom?: string | null }

/**
 * Carte de proposition PURE (V3) : une case à cocher par lot, « tout sélectionner/désélectionner » (sur l'ENSEMBLE, via le
 * callback), un rappel du décompte TOUJOURS visible (lots ET dossiers, même quand les lots cochés ne sont pas sur la page), et
 * un bouton « Créer les demandes sélectionnées » DÉSACTIVÉ avec sa raison tant que rien n'est coché. La sélection vit dans la
 * Vue (Set de clés) : ce composant ne la stocke pas. Aucun état, aucun effet → testable via renderToStaticMarkup. Responsive.
 */
export function CartePropositions({
  resumeDiag, explication, total, profilLibelle, lotsVisibles, selection, nbSelLots, nbSelDossiers, toutCoche,
  pageCourante, nbPages, onBasculer, onToutSelectionner, onPage, onCreer,
}: {
  resumeDiag: string; explication: string; total: number; profilLibelle: string;
  lotsVisibles: LotAffiche[]; selection: ReadonlySet<string>; nbSelLots: number; nbSelDossiers: number; toutCoche: boolean;
  pageCourante: number; nbPages: number;
  onBasculer?: (cle: string) => void; onToutSelectionner?: () => void; onPage?: (p: number) => void; onCreer?: () => void;
}) {
  const muted: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
  const rien = nbSelLots === 0;
  return (
    <div className="svv-card">
      <p style={{ ...muted, margin: '0 0 .5rem' }}>{resumeDiag}</p>
      {total === 0 ? (
        <p role="note" style={{ ...muted, margin: 0 }}>{explication}</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.4rem' }}>
            <strong>{total} lot(s) proposé(s) — en {profilLibelle}</strong>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => onToutSelectionner?.()}>
              {toutCoche ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
          {/* Rappel du décompte TOUJOURS visible (compté sur l'ensemble des lots, jamais la seule page). */}
          <p role="status" style={{ ...muted, margin: '0 0 .5rem' }}>Sélection : <strong>{nbSelLots} lot(s)</strong> · <strong>{nbSelDossiers} dossier(s)</strong>.</p>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.5rem' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem', opacity: rien ? 0.5 : 1 }} disabled={rien} onClick={() => onCreer?.()}>
              Créer les demandes sélectionnées{rien ? '' : ` (${nbSelLots} lot(s) · ${nbSelDossiers} dossier(s))`}
            </button>
            {rien && <span role="note" style={muted}>Cochez au moins un lot pour créer des demandes.</span>}
          </div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 13 }}>
            {lotsVisibles.map((l) => (
              <li key={l.cle} style={{ marginBottom: '.2rem' }}>
                <label style={{ display: 'flex', gap: '.4rem', alignItems: 'baseline', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selection.has(l.cle)} onChange={() => onBasculer?.(l.cle)} aria-label={`Sélectionner ${l.communeNom} (${l.codeInsee})`} />
                  <span>{l.communeNom} ({l.codeInsee}) · {l.canal} · {l.nbDossiers} dossier(s) <OrigineDest origine={l.destOrigine} nom={l.destNom} /></span>
                </label>
              </li>
            ))}
          </ul>
          {nbPages > 1 && (
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13, marginTop: '.5rem' }}>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante <= 1} onClick={() => onPage?.(Math.max(1, pageCourante - 1))}>Précédent</button>
              <span>Page {pageCourante} / {nbPages} ({total} lot(s))</span>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante >= nbPages} onClick={() => onPage?.(Math.min(nbPages, pageCourante + 1))}>Suivant</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── D2 : en-tête de colonne TRIABLE (clic + clavier, aria-sort) ───────────────
/**
 * En-tête `<th>` triable, PUR : bouton activable au clic ET au clavier ; `aria-sort` posé sur la colonne active
 * (ascending/descending), 'none' sinon ; une flèche TEXTE (▲/▼) indique le sens à l'œil. Cliquer appelle `onTrier(colonne)`
 * (la Vue bascule le sens via `basculerTri`) — même état que le sélecteur Tri (une seule vérité).
 */
export function EnteteTriable({ libelle, colonne, tri, onTrier }: {
  libelle: string; colonne: TriColonne; tri: Tri; onTrier?: (c: TriColonne) => void;
}) {
  const actif = tri.colonne === colonne;
  const ariaSort: 'ascending' | 'descending' | 'none' = actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th aria-sort={ariaSort} style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>
      <button type="button" onClick={() => onTrier?.(colonne)}
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', fontWeight: actif ? 700 : 'inherit', display: 'inline-flex', gap: '.25rem', alignItems: 'center' }}>
        {libelle}<span aria-hidden="true">{actif ? (tri.sens === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

// ── D2 : filtre par TYPE de permis (multi-sélection, sémantique « au moins un dossier ») ──────────────────────────────
/**
 * Filtre multi-types PUR : une case par catégorie (libellés de l'app, jamais inventés). `coches` = rangs de catégorie
 * sélectionnés ; aucune case cochée = aucun filtre (tous). L'aide dit EXPLICITEMENT la sémantique « au moins un dossier ».
 */
export function FiltreTypes({ categories, coches, onToggle }: {
  categories: { cle: string; libelle: string; rang: number }[];
  coches: ReadonlySet<number>;
  onToggle?: (rang: number) => void;
}) {
  return (
    <fieldset style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .6rem', margin: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 12, padding: '0 .3rem' }}>Type de permis</legend>
      <div role="group" aria-label="Filtrer par type de permis" style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {categories.map((c) => (
          <label key={c.cle} style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={coches.has(c.rang)} onChange={() => onToggle?.(c.rang)} />
            {c.libelle}
          </label>
        ))}
      </div>
      <p style={aide}>Une demande est retenue si elle contient <strong>au moins un dossier</strong> de l’un des types cochés. Aucun type coché = tous.</p>
    </fieldset>
  );
}

export function CarteAmbiguite({ a, children }: { a: AmbiguiteAffiche; children?: ReactNode }) {
  const lignes: [string, string | null][] = [
    ['Département', a.departement],
    ['Code postal / ville', a.codePostalVille],
    ['Courriel', (a.courriel ?? '').trim() === '' ? '(vide)' : a.courriel],
    ['Adresse', a.adresse],
    ['PRADA', [a.prenom, a.nom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ') || null],
    ['Millésime', a.millesime],
  ];
  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <strong style={{ fontSize: 14 }}>{a.nomAdministration ?? '(sans nom d’administration)'}</strong>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '.15rem .6rem', fontSize: 12 }}>
        {lignes.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt style={{ color: 'var(--color-svv-muted)' }}>{k}</dt>
            <dd style={{ margin: 0, wordBreak: 'break-word' }}>{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
