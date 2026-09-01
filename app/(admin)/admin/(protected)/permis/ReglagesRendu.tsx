import type { CSSProperties, ReactNode } from 'react';
import { bandeauIdentite, type Bornes, type ParamVeille } from '../../../../lib/sitadel/reglagesVeille';

/**
 * E2 — carte autonome d'une SECTION de l'écran Réglages (chantier purement VISUEL) : conteneur (fond blanc, bordure fine,
 * coins arrondis, overflow caché) + en-tête PLEINE LARGEUR légèrement teinté (`--color-svv-field`) COLLANT en haut de la carte
 * (`position: sticky`) pour que le titre du bloc courant reste visible au défilement. L'icône est un glyphe `aria-hidden`
 * (convention de la tuile : aucune bibliothèque d'icônes, aucune dépendance). Contraste AA (ink sur field, thème clair unique).
 * PURE — aucun état, aucun effet, testable via renderToStaticMarkup. Le corps rend `children` tel quel.
 */
export function CarteSection({ titre, icone, children }: { titre: string; icone?: string; children?: ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.7rem', overflow: 'hidden', background: 'var(--color-svv-surface)' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: '.5rem',
        padding: '.55rem .8rem',
        background: 'var(--color-svv-field)', borderBottom: '1px solid var(--color-svv-line)',
      }}>
        {icone ? <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{icone}</span> : null}
        {/* minWidth:0 + overflowWrap → mobile-first : le titre s'enroule au lieu de déborder/tronquer sur écran étroit. */}
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, minWidth: 0, overflowWrap: 'anywhere', color: 'var(--color-svv-ink)' }}>{titre}</h2>
      </div>
      <div className="flex flex-col gap-3" style={{ padding: '.8rem' }}>{children}</div>
    </section>
  );
}

/**
 * Composants de rendu PURS de l'écran « Réglages » (chantier S7d) — aucun état, aucun effet → testables en Node via
 * `renderToStaticMarkup`. Sortent la logique d'affichage sensible (bandeau d'identité, plage tirée des CHECK) du
 * composant client interactif pour la verrouiller par des tests.
 */

const styleBase: CSSProperties = { padding: '.6rem .75rem', borderRadius: '.6rem', fontSize: 13, lineHeight: 1.45 };

/**
 * S13 — intitulés des deux sous-blocs de paramètres de l'écran Réglages. Le premier coiffe les réglages des demandes ; le
 * second, ceux de la classification/affichage des dossiers — son aide dit explicitement qu'il ne concerne PAS les demandes,
 * pour que le lecteur comprenne pourquoi ces réglages sont là. Exportés (et non « en dur » dans la vue) pour être testés.
 */
export const TITRE_PARAMS_DEMANDES = 'Paramètres des demandes'; // conservé (compat) — l'écran affiche désormais les 5 thèmes ci-dessous
// E1 — les 5 thèmes qui remplacent le groupe fourre-tout « Paramètres des demandes » (chantier purement présentationnel).
export const TITRE_THEME_PREPARATION = 'Préparation des demandes';
export const TITRE_THEME_ENVOI = 'Envoi aux mairies';
export const TITRE_THEME_REPONSES = 'Réponses et échéances';
export const TITRE_THEME_ALERTES = 'Alertes par e-mail';
export const TITRE_THEME_CADA = 'Saisine CADA';
export const TITRE_THEME_TELESERVICE = 'Téléservice (dépôt manuel)'; // D4 — réglages propres au process téléservice
export const TITRE_THEME_RATTACHEMENT = 'Rattachement au bâti';
export const TITRE_PARAMS_DOSSIERS = 'Classification et affichage des dossiers';
/** S40 — 4e sous-bloc : mentions ajoutées au courrier (phrases de pratique). */
export const TITRE_PARAMS_MENTIONS = 'Mentions ajoutées au courrier';
export const AIDE_PARAMS_MENTIONS = 'Phrases de PRATIQUE ajoutées au corps des demandes, que vous activez et rédigez vous-même. Le fondement juridique de la demande (articles de loi, formules, salutations) reste fixe et n’est pas modifiable ici.';
/** S30 — 3e sous-bloc : source de l'annuaire des mairies (URL DILA). */
export const TITRE_PARAMS_SOURCES = 'Source de l’annuaire des mairies';
export const AIDE_PARAMS_SOURCES = 'Adresse officielle depuis laquelle l’application récupère les coordonnées des mairies (téléphones, adresses). À ne modifier que si l’adresse publiée change.';
export const AIDE_PARAMS_DOSSIERS = 'Ces réglages ne concernent pas les demandes aux mairies : ils pilotent la mise à jour et l’affichage des dossiers (groupe « Mise à jour des dossiers ») — classement « immeuble », ordre des catégories et profondeur d’affichage par défaut.';

/** Bandeau permanent : identité complète (vert) → demandes « prête » possibles ; incomplète (rouge) → bloquées. */
export function BandeauIdentite({ problemes }: { problemes: string[] }) {
  const { complete, message } = bandeauIdentite(problemes);
  const style: CSSProperties = complete
    ? { ...styleBase, background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' }
    : { ...styleBase, background: '#fdecec', color: 'var(--color-svv-red)', fontWeight: 600 };
  return <div role="status" aria-live="polite" style={style}>{message}</div>;
}

/**
 * Ligne « plage autorisée » d'un paramètre. Les bornes proviennent des CHECK de la base (jamais d'une constante) : si
 * elles manquent, on le dit explicitement plutôt que d'inventer une plage. Pour un paramètre texte, on rappelle le format.
 */
export function PlageParam({ param, bornes }: { param: ParamVeille; bornes?: Bornes }) {
  const style: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
  if (param.type === 'enum') {
    // Libellés FR si fournis (optionsEnumLabels), sinon la valeur brute — les enum sans libellés (profil…) sont inchangés.
    const choix = (param.optionsEnum ?? []).map((o) => param.optionsEnumLabels?.[o] ?? o);
    return <span style={style}>Choix : {choix.join(' / ')}.</span>;
  }
  if (param.type === 'texte') {
    // F-N1 — le rappel de format est PROPRE au paramètre (formatHint) ; défaut générique si absent (jamais le hint « pièces » pour tous).
    return <span style={style}>Format : {param.formatHint ?? 'valeurs séparées par des virgules.'}</span>;
  }
  if (param.type === 'url') {
    return <span style={style}>Format : adresse web commençant par http:// ou https://</span>;
  }
  if (param.type === 'email') {
    return <span style={style}>Format : une adresse e-mail (ex. demandes@exemple.fr). Vide = non configurée, aucun envoi possible.</span>;
  }
  if (param.type === 'booleen') {
    return <span style={style}>Activé ou désactivé.</span>;
  }
  if (param.type === 'texte_libre') {
    return <span style={style}>Texte libre. Vide = rien n’est ajouté au courrier.</span>;
  }
  if (!bornes) {
    return <span style={{ ...style, color: 'var(--color-svv-red)' }}>Plage indisponible : contrainte introuvable en base.</span>;
  }
  return <span style={style}>Plage autorisée : {bornes.min} – {bornes.max}{param.unite ? ` ${param.unite}` : ''}</span>;
}

// ── Carte d'un paramètre ENTIER (S33) ────────────────────────────────────────
const styleLabelCarte: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' };
const styleAideCarte: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleInputCarte: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };
const styleErreurCarte: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 };

/**
 * Carte d'édition d'un paramètre ENTIER (S33 — les 8 réglages « Classification et affichage des dossiers » sont tous des
 * entiers). PURE : la valeur et les gestionnaires sont fournis par le composant client appelant (état lifté). La plage
 * autorisée vient des CHECK de la base via `PlageParam` (jamais recopiée). L'erreur est un TEXTE (jamais une couleur seule).
 */
export function CarteReglageEntier({ param, bornes, valeur, onValeur, onEnregistrer, message, erreur }: {
  param: ParamVeille; bornes?: Bornes; valeur: string;
  onValeur: (v: string) => void; onEnregistrer: () => void; message?: string; erreur?: string;
}) {
  return (
    <article className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
      <span style={styleLabelCarte}>{param.libelle}</span>
      <span style={styleAideCarte}>{param.aide}</span>
      <label className="flex flex-col gap-1" style={{ marginTop: '.2rem' }}>
        <input type="number" value={valeur} min={bornes?.min} max={bornes?.max} step={1}
          onChange={(e) => onValeur(e.target.value)} style={styleInputCarte} aria-label={param.libelle} />
        <PlageParam param={param} bornes={bornes} />
      </label>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={onEnregistrer}>Enregistrer</button>
        {message && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{message}</span>}
      </div>
      {erreur && <span role="alert" style={styleErreurCarte}>{erreur}</span>}
    </article>
  );
}

/**
 * Q1 — carte d'un paramètre VESTIGIAL : rendu LECTURE SEULE. L'input est `disabled` → non modifiable ET annoncé comme tel à
 * un lecteur d'écran (pas seulement grisé en CSS) et hors de l'ordre de tabulation. AUCUN bouton « Enregistrer » (rien à
 * envoyer ; l'API le refuse de toute façon). Mention explicite « n'agit plus — remplacé par … ». PURE. Aucune animation
 * (prefers-reduced-motion sans objet).
 */
export function CarteParamVestigial({ param, valeur }: { param: ParamVeille; valeur: string }) {
  return (
    <article className="svv-card flex flex-col gap-1" style={{ minWidth: 0, opacity: 0.7 }}>
      <span style={styleLabelCarte}>{param.libelle}</span>
      <span style={styleAideCarte}>{param.aide}</span>
      <label className="flex flex-col gap-1" style={{ marginTop: '.2rem' }}>
        <input type="number" value={valeur} disabled aria-disabled="true"
          aria-label={`${param.libelle} — réglage désactivé, non modifiable`}
          style={{ ...styleInputCarte, background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)', cursor: 'not-allowed' }} />
      </label>
      <span role="note" style={{ ...styleAideCarte, fontStyle: 'italic', color: 'var(--color-svv-red)' }}>
        Ce réglage n’agit plus{param.remplacePar ? ` — remplacé par « ${param.remplacePar} »` : ''}. Conservé pour l’historique.
      </span>
    </article>
  );
}
