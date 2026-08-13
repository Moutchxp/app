import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { typeDemande, type Tri, type TriColonne } from '../../../../lib/sitadel/demandesListe';
import { ETIQUETTE_PROFIL, ancreDetail, type ProfilDemandeur } from '../../../../lib/sitadel/demande';
import { formaterReferencePermis, resoudreAdresseAvecReplis } from '../../../../lib/sitadel/referencePermis';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';
import { PERIODES_STOCK, type LigneStock } from '../../../../lib/sitadel/stock';
import type { PermisDetail, DemandeDetail } from '../../../../lib/sitadel/demandeRepo';

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
export interface DepotAffiche { id: number; reference: string; communeNom: string | null; url: string | null; corps: string | null; nbDossiers: number; statut: string;
  /** U2/U4/U5 : dossiers attachés (num_dau + adresse + parcelles + lignes SŒURS) → numéro instruit, arrondissement, adresse et repli cross-type vérifié. */
  dossiers: { type: 'PC' | 'PD'; numDau: string; adresse?: string | null; codePostal?: string | null; communeNom?: string | null; parcelles?: string[];
    soeurs?: { type: 'PC' | 'PD'; adresse?: string | null; codePostal?: string | null; communeNom?: string | null; parcelles?: string[] }[] }[] }

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

/**
 * Q4 — BANDEAU de rappel des réglages EN VIGUEUR (ancienneté maximale + ordre d'examen), en tête de l'onglet Demandes, avec
 * le FILTRE d'ancienneté (état d'écran, JAMAIS persisté). PUR : la config et l'état du filtre viennent de la Vue. Le libellé
 * d'ordre est celui d'`optionsEnumLabels` (source unique — même mot que dans Réglages, 3e valeur de Q3 incluse). Le maximum
 * DÉRIVE de la config (`maxMois` = 12 × ancienneté max), jamais figé. Mobile-first : les deux blocs s'empilent (flex-wrap) sur
 * écran étroit ; la borne est affichée sous le champ (motif `PlageParam`), pas de slider. Aucune animation → prefers-reduced-motion sans objet.
 */
export function BandeauReglages({
  ancienneteMaxAnnees, triLibelle, moisSaisie, maxMois, onMois, onAllerReglages,
}: {
  ancienneteMaxAnnees: number; triLibelle: string; moisSaisie: string; maxMois: number;
  onMois?: (v: string) => void; onAllerReglages?: () => void;
}) {
  const muted: CSSProperties = { color: 'var(--color-svv-muted)' };
  return (
    <section className="svv-card" aria-label="Réglages en vigueur"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '.8rem 1.4rem', alignItems: 'flex-start', fontSize: 13 }}>
      <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
        <div><span style={muted}>Ancienneté maximale des demandes : </span><strong>{ancienneteMaxAnnees} an{ancienneteMaxAnnees > 1 ? 's' : ''}</strong></div>
        <div><span style={muted}>Ordre d’examen : </span><strong>{triLibelle}</strong></div>
        <p style={{ ...muted, fontSize: 12, margin: '.3rem 0 0', lineHeight: 1.45 }}>
          Ces deux valeurs se règlent dans{' '}
          <button type="button" className="svv-link" style={{ width: 'auto', padding: 0, verticalAlign: 'baseline' }} onClick={() => onAllerReglages?.()}>l’onglet Réglages</button>.
        </p>
      </div>
      <label className="flex flex-col gap-1" style={{ flex: '0 1 auto', minWidth: 0 }}>
        <span style={{ fontSize: 12 }}>Filtrer par ancienneté</span>
        <input type="number" min={1} max={maxMois} step={1} inputMode="numeric" value={moisSaisie}
          onChange={(e) => onMois?.(e.target.value)} aria-label="Ancienneté à filtrer, en mois"
          style={{ width: '6.5rem', boxSizing: 'border-box', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 14, fontFamily: 'inherit' }} />
        <span style={{ ...muted, fontSize: 12 }}>Plage autorisée : 1 – {maxMois} mois</span>
      </label>
    </section>
  );
}

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
/**
 * C2 — REPLIABLE, fermé par défaut (l'état vit dans le parent, ce rendu reste PUR). Fermé : une ligne qui annonce le
 * décompte (calculé, jamais figé) ; disparaît si le décompte est nul. Ouvert : EXACTEMENT le contenu d'origine (explication
 * + liste commune par commune, PRADA + destinataire retenu). Bouton natif (aria-expanded, aria-controls) → clavier ok ;
 * aucun contenu masqué quand fermé (rien à animer → prefers-reduced-motion sans objet). AUCUNE logique métier ici.
 */
const ID_CONTENU_ARBITRAGES = 'arbitrages-prada-contenu';
export function EncartArbitrages({ arbitrages, ouvert, onToggle }: { arbitrages: ArbitrageAffiche[]; ouvert: boolean; onToggle?: () => void }) {
  if (arbitrages.length === 0) return null; // décompte nul → rien du tout
  const n = arbitrages.length;
  return (
    <section role="group" aria-label="Arbitrages PRADA à rendre" className="svv-card" style={{ background: '#fff4e0', color: '#8a5a00' }}>
      <button type="button" aria-expanded={ouvert} aria-controls={ID_CONTENU_ARBITRAGES} onClick={() => onToggle?.()}
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'flex', gap: '.4rem', alignItems: 'baseline', width: '100%', textAlign: 'left' }}>
        <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
        <strong>{n} commune{n > 1 ? 's' : ''} {n > 1 ? 'ont' : 'a'} une PRADA non adoptée</strong>
      </button>
      {ouvert && (
        <div id={ID_CONTENU_ARBITRAGES}>
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
        </div>
      )}
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

// ── C3 — bloc REPLIABLE réutilisable (disclosure) + bloc « communes sans adresse » ────────────────────────────────────
/**
 * C3 — primitive de repliage PURE (motif de C2 extrait pour réemploi), fermée/ouverte pilotée par le parent (le rendu reste
 * PUR). Bouton natif (aria-expanded, aria-controls) → clavier ok ; le contenu déplié n'est rendu QUE quand `ouvert`. ⚠️ Slot
 * `retour` : rendu TOUJOURS (hors du repli) → un message de saisie n'est jamais masqué par le geste de repli. Pas d'animation
 * → prefers-reduced-motion sans objet. N.B. : l'encart PRADA de C2 (EncartArbitrages) garde son repliable inline (non touché
 * par ce chantier) ; cette primitive est disponible pour l'y adopter ultérieurement.
 */
export function BlocRepliable({ ligne, ouvert, onToggle, idContenu, ariaLabel, retour, className = 'svv-card', style, children }: {
  ligne: ReactNode; ouvert: boolean; onToggle?: () => void; idContenu: string; ariaLabel: string;
  retour?: ReactNode; className?: string; style?: CSSProperties; children?: ReactNode;
}) {
  return (
    <section role="group" aria-label={ariaLabel} className={className} style={style}>
      <button type="button" aria-expanded={ouvert} aria-controls={idContenu} onClick={() => onToggle?.()}
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'flex', gap: '.4rem', alignItems: 'baseline', width: '100%', textAlign: 'left' }}>
        <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
        <strong>{ligne}</strong>
      </button>
      {/* retour de saisie : TOUJOURS visible (hors du repli) */}
      {retour ? <div style={{ marginTop: '.4rem' }}>{retour}</div> : null}
      {ouvert && <div id={idContenu} style={{ marginTop: '.4rem' }}>{children}</div>}
    </section>
  );
}

/** Étiquette de la ligne repliée du bloc « sans adresse » : décompte CALCULÉ, « commune » accordée (la locution « sans
 *  adresse e-mail » n'a pas de verbe à accorder, contrairement à la ligne PRADA de C2). PURE. */
export function libelleInjoignables(n: number): string {
  return `${n} commune${n > 1 ? 's' : ''} sans adresse e-mail`;
}

/**
 * C3 — bloc REPLIABLE « communes sans adresse e-mail », fermé par défaut. Décompte nul → `null` (rien du tout). Fermé : la
 * ligne (décompte accordé). Ouvert : les cartes de saisie (`children`, ACTIVES) + leur phrase d'explication. Le `retour` de
 * saisie (succès) est passé au slot toujours-visible de BlocRepliable → il survit au repli. PUR (l'état + les cartes
 * interactives viennent du parent).
 */
export function BlocInjoignables({ injoignables, ouvert, onToggle, retour, children }: {
  injoignables: CommuneInjoignableAffiche[]; ouvert: boolean; onToggle?: () => void; retour?: ReactNode; children?: ReactNode;
}) {
  if (injoignables.length === 0) return null; // décompte nul → rien du tout
  return (
    <BlocRepliable ariaLabel="Communes sans adresse e-mail à renseigner" idContenu="injoignables-contenu"
      ligne={libelleInjoignables(injoignables.length)} ouvert={ouvert} onToggle={onToggle} retour={retour}
      className="svv-card">
      {children}
    </BlocRepliable>
  );
}

/**
 * Carte « à déposer à la main » (S16) : commune, URL de téléservice cliquable (nouvel onglet, rel noopener), nombre de
 * dossiers, et le TEXTE COMPLET de la demande (celui de genererTexte, figé en base) prêt à copier. Boutons fournis en
 * `children`. Mobile-first (carte, texte en zone scrollable).
 */
export function CarteDepot({ d, children, onCopierRef, retourRef }: {
  d: DepotAffiche; children?: ReactNode;
  onCopierRef?: (valeur: string) => void; retourRef?: string;
}) {
  // U2 — téléservice = UN dossier par dépôt (P3). La référence « Numéro de dossier instruit » et l'arrondissement dérivent du
  //   dossier attaché via la SOURCE UNIQUE (formaterReferencePermis / formaterArrondissement). Type inconnu → on DIT pourquoi.
  const dossier = d.dossiers[0];
  const ref = dossier ? formaterReferencePermis(dossier.type, dossier.numDau) : { ok: false as const, raison: 'aucun dossier attaché à cette demande' };
  // U5 — résolution d'adresse avec repli cross-type VÉRIFIÉ PAR LE CADASTRE (opérateur uniquement ; le corps reste U4).
  const resolution = dossier ? resoudreAdresseAvecReplis(
    { ...dossier, parcelles: dossier.parcelles ?? [] },
    (dossier.soeurs ?? []).map((s) => ({ ...s, numDau: dossier.numDau, parcelles: s.parcelles ?? [] })),
  ) : null;
  const adr = resolution?.adresse ?? null;
  const prov = resolution?.provenance;
  const adresseAffichee = adr !== null && (prov?.origine === 'propre' || prov?.origine === 'repli');
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

      {/* U3 (A) — CARTOUCHE : le champ « Numéro de dossier instruit » et SON bouton « Copier » forment un ensemble encadré, pour
          qu'on ne puisse pas croire que ce bouton copie le texte du message. Le bouton « Copier le texte » (children) reste
          DEHORS et inchangé. La copie ne concerne QUE cette référence (formaterReferencePermis, source unique). */}
      <div role="group" aria-label="Numéro de dossier instruit à copier"
        style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.5rem', background: 'var(--color-svv-field)', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>
          Numéro de dossier instruit (téléservice)
          {ref.ok ? (
            <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input readOnly value={ref.reference} aria-label="Numéro de dossier instruit"
                style={{ flex: '1 1 12rem', minWidth: 0, padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
              {onCopierRef && <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => onCopierRef(ref.reference)}>Copier</button>}
            </span>
          ) : (
            <span role="note" style={{ color: 'var(--color-svv-red)' }}>impossible de pré-remplir : {ref.raison}.</span>
          )}
        </label>
        {retourRef && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)' }}>{retourRef}</span>}
      </div>

      {/* U4/U5 — adresse du permis (source unique). Propre OU repli cross-type VÉRIFIÉ → affichée ; sinon avertissement + éventuel
          signal (une sœur adressée non vérifiable, ou ambiguïté). TRANSPARENCE STRICTEMENT OPÉRATEUR : la provenance ne va JAMAIS
          au corps envoyé à la mairie. Le silence est acceptable vers la mairie, jamais vers l'opérateur avant un dépôt. */}
      {adresseAffichee
        ? <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Adresse : {[adr!.voie, adr!.villeCP].filter((x) => x !== '').join(', ')}</span>
        : <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>Aucune adresse de voie n’est renseignée pour ce permis (base Sitadel) — à vérifier avant de déposer.</span>}
      {prov?.origine === 'repli' && <span role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>Adresse issue de la ligne {prov.soeurType} du même numéro de permis (parcelle {prov.parcelleCommune} commune vérifiée).</span>}
      {prov?.origine === 'non_verifiable' && <span role="note" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Une ligne {prov.soeurTypes.join('/')} du même numéro de permis porte une adresse, mais le lien n’a pas pu être vérifié (parcelles cadastrales absentes) — à vérifier avant de l’utiliser.</span>}
      {prov?.origine === 'ambigu' && <span role="note" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Plusieurs lignes sœurs portent des adresses différentes — ambiguïté à trancher manuellement, aucun choix automatique.</span>}

      {/* U2 — arrondissement : simple MENTION (aide à choisir la bonne entrée de la liste déroulante Paris), SANS bouton de copie. */}
      <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Arrondissement : {adr?.arrondissement ?? 'indéterminé'}</span>

      <textarea readOnly value={d.corps ?? ''} rows={10} aria-label={`Texte de la demande pour ${d.communeNom ?? d.reference}`}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
      {children}
    </div>
  );
}

/**
 * U3 (B) — bouton « Annuler cette demande » de la carte de dépôt. Geste SECONDAIRE (lien rouge — JAMAIS un bouton primaire),
 * nettement séparé de « Marquer comme déposée » (svv-btn-primary) pour qu'on ne puisse pas les confondre. La confirmation DIT ce
 * qui se passe (pas un « êtes-vous sûr ? ») : la demande passe en « annulée » et ses dossiers redeviennent demandables → ils
 * réapparaissent dans « À demander ». PUR : l'ouverture/fermeture et l'appel réseau (chemin PATCH …/demandes existant) vivent
 * dans la Vue (BlocDepot) ; aucun nouvel écrivain de demande.statut.
 */
export function BoutonAnnulerDepot({ ouvert, onOuvrir, onConfirmer, onFermer }: {
  ouvert: boolean; onOuvrir: () => void; onConfirmer: () => void; onFermer: () => void;
}) {
  if (!ouvert) {
    return <button type="button" className="svv-link" style={{ width: 'auto', padding: '.2rem 0', alignSelf: 'flex-start', color: 'var(--color-svv-red)' }} onClick={onOuvrir}>Annuler cette demande</button>;
  }
  return (
    <span role="group" aria-label="Confirmer l’annulation de la demande" style={{ display: 'block', border: '1px solid var(--color-svv-red)', borderRadius: '.4rem', padding: '.4rem .5rem' }}>
      <span role="alert" style={{ display: 'block', fontSize: 12, color: 'var(--color-svv-red)', lineHeight: 1.4, marginBottom: '.35rem' }}>
        Annuler cette demande : elle passe en « annulée » et ses dossiers redeviennent demandables — ils réapparaîtront dans « À demander ». Rien n’est envoyé à la mairie.
      </span>
      <span style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.25rem .6rem', color: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }} onClick={onConfirmer}>Confirmer l’annulation</button>
        <button type="button" className="svv-link" style={{ width: 'auto', padding: '.25rem 0' }} onClick={onFermer}>Retour</button>
      </span>
    </span>
  );
}

// ── V3 : carte de PROPOSITION avec choix lot-par-lot ──────────────────────────
/** Un lot proposé, prêt à afficher/cocher. `cle` = clé stable (cleLot, ensemble trié des dossierId) — l'identité de sélection. */
export interface LotAffiche { cle: string; codeInsee: string; communeNom: string; canal: string; nbDossiers: number; destOrigine?: 'mairie_contact' | 'prada'; destNom?: string | null; profilImpose?: ProfilDemandeur | null }

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
                  <span>{l.communeNom} ({l.codeInsee}) · {l.canal} · {l.nbDossiers} dossier(s) <OrigineDest origine={l.destOrigine} nom={l.destNom} />
                    {/* P3 — profil IMPOSÉ par le téléservice de la commune : dit EXPLICITEMENT pourquoi, jamais substitué en silence. */}
                    {l.profilImpose ? <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}> · profil imposé par le téléservice de cette commune : {ETIQUETTE_PROFIL[l.profilImpose]}</span> : null}
                  </span>
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

// ── D3 : tableau des demandes — colonne « Type » + tenue à l'écran ────────────────────────────────────────────────────
/** Libellés d'affichage des statuts de demande. SOURCE UNIQUE (le rendu du tableau ET la Vue s'y réfèrent). */
// Q7 — 'annulee' a remplacé 'abandonnee' (annuler une demande = remettre ses permis au stock ; le vrai « abandon » définitif
// d'un permis n'existe pas). La clé 'abandonnee' est CONSERVÉE en traduction : `demande_journal` est append-only (jamais réécrit),
// ses lignes d'avant le renommage portent encore l'ancienne valeur → tout affichage historique reste lisible.
export const STATUT_LIBELLE: Record<string, string> = { brouillon: 'brouillon', prete: 'prête', envoyee: 'envoyée', close: 'close', annulee: 'annulée', abandonnee: 'annulée (ex-abandonnée)' };

/**
 * Q6b — mention NON silencieuse des lignes écartées par le DÉFAUT (statuts morts masqués). Rendu PUR. Rien si aucune ligne
 * masquée. Le bouton « les afficher » délègue à la Vue (bascule le filtre Statut sur « Toutes »). Sans cette mention, le défaut
 * serait un « zéro muet inversé » : l'utilisateur croirait ses demandes disparues. RAPPEL DE SENS : masquer une ligne annulée
 * ne cache AUCUN permis — ses dossiers sont déjà revenus au stock (demande_dossier.actif=false) et sont proposables ; la ligne
 * n'est qu'une trace.
 */
/**
 * T2-C — bloc « Dossiers » du DÉTAIL d'une demande. Le COMPTE (« Dossiers (N) ») ne porte que sur les dossiers ATTACHÉS. Les
 * dossiers RETIRÉS (actif=false) ne disparaissent PAS : ils restent listés sous une étiquette DISTINCTE (« N dossier(s) retiré(s)
 * de la demande »), jamais mêlés aux attachés ni comptés avec eux — le retrait est une correction traçable, pas un oubli muet.
 * Sans retrait, le rendu est EXACTEMENT celui d'avant (une seule ligne, fragment sans wrapper). PUR.
 */
export function BlocDossiersDetail({ dossiers, retires }: { dossiers: { numDau: string }[]; retires: { numDau: string }[] }) {
  return (
    <>
      <div><span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Dossiers ({dossiers.length}) : </span><span style={{ fontSize: 12 }}>{dossiers.map((x) => x.numDau).join(', ')}</span></div>
      {retires.length > 0 && (
        <div role="note" style={{ marginTop: '.2rem' }}>
          <span style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{retires.length} dossier{retires.length > 1 ? 's' : ''} retiré{retires.length > 1 ? 's' : ''} de la demande : </span>
          <span style={{ fontSize: 12, color: 'var(--color-svv-muted)', textDecoration: 'line-through' }}>{retires.map((x) => x.numDau).join(', ')}</span>
        </div>
      )}
    </>
  );
}

export function MentionMasquage({ morts, onAfficherTout }: {
  morts: { statut: string; n: number }[];
  onAfficherTout?: () => void;
}) {
  const visibles = morts.filter((x) => x.n > 0);
  const total = visibles.reduce((a, x) => a + x.n, 0);
  if (total === 0) return null;
  const texte = visibles.map((x) => `${x.n} ${STATUT_LIBELLE[x.statut] ?? x.statut}(s) masquée(s)`).join(' · ');
  return (
    <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', marginTop: '.3rem' }}>
      {texte}
      {onAfficherTout && (
        <>
          {' — '}
          <button type="button" className="svv-link" style={{ width: 'auto', padding: 0 }} onClick={onAfficherTout}>les afficher</button>
        </>
      )}
    </div>
  );
}

const styleTdD: CSSProperties = { padding: '.4rem .5rem' };

/**
 * D3 — cellule « Type » PURE. Badge du type le PLUS PRIORITAIRE ; « +N » = nombre d'autres types distincts ; `title` = tous
 * les types en clair. Catégorie « autre » (rang 9999) → libellé atténué ; aucun rang connu → « — » (jamais vide ambigu).
 * La dérivation est faite par `typeDemande` (pur, dans demandesListe.ts, testé à part).
 */
export function CelluleType({ rangs, categories }: { rangs?: number[]; categories: { libelle: string; rang: number }[] }) {
  const t = typeDemande(rangs, categories);
  if (t.vide) return <td style={{ ...styleTdD, whiteSpace: 'nowrap', color: 'var(--color-svv-muted)' }}>—</td>;
  const badge: CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '.05rem .4rem', borderRadius: '.35rem', whiteSpace: 'nowrap',
    background: 'var(--color-svv-field)', color: t.attenue ? 'var(--color-svv-muted)' : 'var(--color-svv-ink)',
  };
  return (
    <td style={{ ...styleTdD, whiteSpace: 'nowrap' }} title={t.titre}>
      <span style={badge}>{t.libelle}</span>
      {t.nAutres > 0 ? <span style={{ fontSize: 11, color: 'var(--color-svv-muted)', marginLeft: '.25rem' }}>+{t.nAutres}</span> : null}
    </td>
  );
}

/**
 * D3 — conteneur DÉFILANT horizontalement, atteignable au CLAVIER (`role="region"` + `tabIndex={0}` + `aria-label`) : sans ces
 * attributs, on ne peut pas faire défiler sans souris. Aucun défilement animé (pas de `scroll-behavior` → prefers-reduced-motion
 * sans objet). PURE.
 */
export function ConteneurTableDefilant({ ariaLabel, children }: { ariaLabel: string; children?: ReactNode }) {
  return <div role="region" aria-label={ariaLabel} tabIndex={0} style={{ overflowX: 'auto' }}>{children}</div>;
}

/** Sous-ensemble d'une demande nécessaire au tableau (DemandeListe est assignable). */
export interface DemandeAffichee {
  id: number; reference: string; communeNom: string | null; codeInsee: string;
  profil: string; canal: string | null; destOrigine?: string | null; destNom?: string | null;
  nbDossiers: number; statut: string; rangs?: number[];
}

/**
 * T6-A — état de RETOUR MAIRIE d'une demande, DÉRIVÉ UNIQUEMENT (aucune détection accusé/documents — chantier ultérieur explicite) :
 *  - 'obtenus' : TOUS les dossiers actifs sont satisfaits (documents obtenus et intégrés) ;
 *  - 'message' : au moins un message RATTACHÉ (la mairie a écrit — un accusé compte ; jamais pollué par les rebonds, cf. Q4) ;
 *  - 'aucun'   : ni message ni satisfaction. Priorité obtenus > message > aucun. PUR.
 */
export type EtatRetourMairie = 'aucun' | 'message' | 'obtenus';
export function etatRetourMairie(d: { nbReponses: number; dossiersActifs: number; dossiersSatisfaits: number }): EtatRetourMairie {
  if (d.dossiersActifs > 0 && d.dossiersSatisfaits >= d.dossiersActifs) return 'obtenus';
  if (d.nbReponses > 0) return 'message';
  return 'aucun';
}

/** T6-A — cellule « Retour mairie » (3 états dérivés). Le TEXTE porte l'information ; date en JJ/MM. PUR. */
export function RetourMairie({ etat, nbReponses, derniereReponseLe }: { etat: EtatRetourMairie; nbReponses: number; derniereReponseLe: string | null }) {
  if (etat === 'obtenus') return <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>documents obtenus</span>;
  if (etat === 'message') {
    const [a, m, j] = (derniereReponseLe ?? '').slice(0, 10).split('-');
    const jjmm = a && m && j ? `${j}/${m}` : '—';
    return <span>message reçu le {jjmm} ({nbReponses})</span>;
  }
  return <span style={{ color: 'var(--color-svv-muted)' }}>aucun retour</span>;
}

/**
 * D3 — tableau des demandes PUR. Colonnes : [sélection] · Référence · **Type** · Commune · Profil · Canal · Destinataire ·
 * Dossiers · Statut · [ouvrir]. Le TYPE est en 2e position DONNÉE (juste après Référence), aligné en-tête ↔ ligne par le même
 * ordre. Tenue à l'écran : conteneur défilant a11y + `nowrap`/`min-width` sobres, « Destinataire » absorbant le surplus. Le
 * tri (EnteteTriable), le filtre et la pagination restent pilotés par la Vue (callbacks). Aucun état ici → renderToStaticMarkup.
 * `avecSelection` (défaut vrai) masque la colonne de cases à cocher là où il n'y a aucune action groupée (Q6 : onglet « en
 * cours ») — pas de contrôle inerte à l'écran.
 */
export function TableDemandes({
  visibles, categories, tri, sel, toutCoche, messageVide, avecSelection = true, demandeOuverte = null, panneau, colonnesSuivi, onTrier, onToutSelectionner, onBasculer, onOuvrir,
}: {
  visibles: DemandeAffichee[]; categories: { libelle: string; rang: number }[];
  tri: Tri; sel: ReadonlySet<number>; toutCoche: boolean; messageVide: string; avecSelection?: boolean;
  // U7 — accordéon À UN SEUL VOLET : `demandeOuverte` = l'unique demande dépliée (jamais un Set → jamais deux détails). `panneau` = son
  //   détail (bâti par la Vue), rendu dans une 2ᵉ `<tr><td colSpan>` JUSTE SOUS sa ligne. Motif de TableStock (disclosure natif au niveau ligne).
  demandeOuverte?: number | null; panneau?: ReactNode;
  // T6-A — colonnes SUPPLÉMENTAIRES (« En cours » : Délai + Retour mairie), injectées APRÈS la colonne Statut. ABSENTES ailleurs →
  //   « À demander » rigoureusement inchangé (aucune colonne, aucun champ riche à null). `largeur` = nb de colonnes (pour le colSpan).
  colonnesSuivi?: { entetes: ReactNode; largeur: number; cellule: (d: DemandeAffichee) => ReactNode };
  onTrier?: (c: TriColonne) => void; onToutSelectionner?: () => void; onBasculer?: (id: number) => void; onOuvrir?: (id: number) => void;
}) {
  const nowrap: CSSProperties = { ...styleTdD, whiteSpace: 'nowrap' };
  const nCols = (avecSelection ? 10 : 9) + (colonnesSuivi?.largeur ?? 0); // colonnes du tableau → colSpan du panneau et de la ligne « vide »
  return (
    <ConteneurTableDefilant ariaLabel="Tableau des demandes, défilement horizontal">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
            {avecSelection && <th style={styleTdD}><input type="checkbox" aria-label="Tout sélectionner" checked={toutCoche} onChange={() => onToutSelectionner?.()} /></th>}
            <th style={{ ...nowrap, minWidth: 150 }}>Référence</th>
            <th style={nowrap}>Type</th>
            <EnteteTriable libelle="Commune" colonne="commune" tri={tri} onTrier={onTrier} />
            <th style={styleTdD}>Profil</th>
            <th style={nowrap}>Canal</th>
            <th style={{ ...styleTdD, minWidth: 160 }}>Destinataire</th>
            <EnteteTriable libelle="Dossiers" colonne="dossiers" tri={tri} onTrier={onTrier} />
            <EnteteTriable libelle="Statut" colonne="statut" tri={tri} onTrier={onTrier} />
            {colonnesSuivi?.entetes /* T6-A — Délai + Retour mairie (En cours) */}
            <th style={styleTdD} />
          </tr>
        </thead>
        <tbody>
          {visibles.map((d) => {
            const ouvert = demandeOuverte === d.id; // U7 — un seul volet : au plus une ligne satisfait ceci
            return (
              <Fragment key={d.id}>
                <tr style={{ borderBottom: ouvert ? 'none' : '1px solid var(--color-svv-line)' }}>
                  {avecSelection && <td style={styleTdD}><input type="checkbox" checked={sel.has(d.id)} onChange={() => onBasculer?.(d.id)} aria-label={`Sélectionner ${d.reference}`} /></td>}
                  <td style={{ ...nowrap, fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.reference}</td>
                  <CelluleType rangs={d.rangs} categories={categories} />
                  <td style={styleTdD}>{d.communeNom ?? d.codeInsee}</td>
                  <td style={styleTdD}>{ETIQUETTE_PROFIL[d.profil as ProfilDemandeur] ?? d.profil}</td>
                  <td style={nowrap}>{d.canal}</td>
                  <td style={styleTdD}><OrigineDest origine={d.destOrigine} nom={d.destNom} /></td>
                  <td style={styleTdD}>{d.nbDossiers}</td>
                  <td style={nowrap}>{STATUT_LIBELLE[d.statut] ?? d.statut}</td>
                  {colonnesSuivi?.cellule(d) /* T6-A — Délai + Retour mairie (En cours) */}
                  <td style={styleTdD}>
                    <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }}
                      aria-expanded={ouvert} aria-controls={ancreDetail(d.id)} onClick={() => onOuvrir?.(d.id)}>
                      {ouvert ? 'refermer' : 'ouvrir'}
                    </button>
                  </td>
                </tr>
                {ouvert && (
                  <tr>
                    <td id={ancreDetail(d.id)} colSpan={nCols} style={{ padding: 0, borderBottom: '1px solid var(--color-svv-line)', background: 'var(--color-svv-field)' }}>
                      {panneau}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {visibles.length === 0 && (
            <tr><td colSpan={nCols} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>{messageVide}</td></tr>
          )}
        </tbody>
      </table>
    </ConteneurTableDefilant>
  );
}

const PROFILS_DEMANDE: ProfilDemandeur[] = ['entreprise', 'personne'];

/**
 * U7 — PANNEAU de détail d'UNE demande (contenu de la 2ᵉ ligne dépliée, sous sa ligne). PUR : toutes les données (detail, corps
 * édité, référence en saisie, retour d'action de la ZONE détail) et TOUTES les actions (fermer, bascule de profil, enregistrer le
 * corps, ajouter une référence mairie, marquer prête / annuler) viennent de la Vue en props → mêmes routes, mêmes retours qu'avant
 * (le panneau a seulement CHANGÉ D'EMPLACEMENT). La bascule/les transitions ne sont offertes qu'en brouillon (garde inchangée).
 */
export function PanneauDetailDemande({
  detail, corps, refDetail, retour, onCorps, onRefDetail, onFermer, onSauverCorps, onAjouterReference, onBascule, onTransition, slotDossiers, slotActions,
}: {
  detail: DemandeDetail; corps: string; refDetail: string; retour: RetourAction;
  onCorps: (v: string) => void; onRefDetail: (v: string) => void;
  onFermer: () => void; onSauverCorps: () => void; onAjouterReference: () => void;
  onBascule: (profil: ProfilDemandeur) => void; onTransition: (statut: 'prete' | 'annulee') => void;
  // T6-A — slots pour « En cours » : `slotDossiers` REMPLACE le détail brut des dossiers par DetailDossiers (actions T1) ;
  //   `slotActions` ajoute ActionsCloture (clôturer/rouvrir). ABSENTS pour « À demander » → rendu STRICTEMENT inchangé.
  slotDossiers?: ReactNode; slotActions?: ReactNode;
}) {
  const brouillon = detail.statut === 'brouillon';
  return (
    <div className="flex flex-col gap-2" style={{ padding: '.6rem .5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong>{detail.reference} — {detail.communeNom ?? detail.codeInsee} — {STATUT_LIBELLE[detail.statut] ?? detail.statut} — {ETIQUETTE_PROFIL[detail.profil as ProfilDemandeur] ?? detail.profil}</strong>
        <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} onClick={() => onFermer()}>fermer</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-svv-muted)', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Destinataire figé : {detail.canal}{detail.destEmail ? ` · ${detail.destEmail}` : ''}{detail.destAdressePostale ? ` · ${detail.destAdressePostale}` : ''}{detail.destUrlFormulaire ? ` · ${detail.destUrlFormulaire}` : ''}</span>
        <OrigineDest origine={detail.destOrigine} nom={detail.destNom} />
      </div>
      <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ color: 'var(--color-svv-muted)' }}>Profil :</span>
        {PROFILS_DEMANDE.map((p) => {
          const actif = detail.profil === p;
          return (
            <button key={p} type="button"
              className={`svv-btn ${actif ? 'svv-btn-primary' : 'svv-btn-outline'}`}
              style={{ padding: '.25rem .7rem', opacity: brouillon || actif ? 1 : 0.5, cursor: brouillon && !actif ? 'pointer' : 'default' }}
              disabled={actif || !brouillon}
              onClick={() => onBascule(p)}>{ETIQUETTE_PROFIL[p]}</button>
          );
        })}
        {!brouillon && <span style={{ color: 'var(--color-svv-muted)' }}>bascule impossible : la demande n&rsquo;est plus en brouillon.</span>}
      </div>
      <textarea value={corps} onChange={(e) => onCorps(e.target.value)} rows={16} readOnly={!brouillon}
        style={{ width: '100%', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
      {/* T6-A — « En cours » injecte DetailDossiers (actions T1) ; sinon, détail brut des dossiers (À demander, inchangé). */}
      {slotDossiers ?? <BlocDossiersDetail dossiers={detail.dossiers} retires={detail.dossiersRetires} />}
      <div style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--color-svv-muted)' }}>Références mairie : </span>
        {detail.referencesMairieIndisponible
          ? <span role="status" style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>indisponibles (lecture en erreur — voir les journaux)</span>
          : detail.referencesMairie.length === 0
            ? <span style={{ color: 'var(--color-svv-muted)' }}>aucune enregistrée</span>
            : <span style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{detail.referencesMairie.map((rf) => rf.reference).join(', ')}</span>}
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.3rem', alignItems: 'center' }}>
          <input value={refDetail} onChange={(e) => onRefDetail(e.target.value)} placeholder="ajouter une référence mairie" aria-label="Ajouter une référence mairie"
            style={{ padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => onAjouterReference()}>Ajouter la référence</button>
        </div>
      </div>
      {slotActions /* T6-A — En cours : ActionsCloture (clôturer + motif / rouvrir) */}
      {brouillon && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => onSauverCorps()}>Enregistrer le texte</button>
          <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} onClick={() => onTransition('prete')}>Marquer prête</button>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => onTransition('annulee')}>Annuler la demande</button>
        </div>
      )}
      <MessageRetour r={retour} />
    </div>
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

// ── Q2b : STOCK de permis à demander (bloc repliable + tableau par commune + panneau de détail natif) ─────────────────

/**
 * Étiquette de la ligne repliée du bloc de stock : générique tant que rien n'est chargé, enrichie une fois le stock connu
 * (chiffre PRINCIPAL = immeubles neufs à demander, sur combien de communes). Décomptes CALCULÉS, jamais figés. PURE.
 */
export function libelleStock(stock: LigneStock[] | null, fenetreMois: number): string {
  const base = 'Stock de permis à demander (par commune)';
  if (stock === null) return base;
  const immeubles = stock.reduce((s, l) => s + (l.parType.immeuble_neuf ?? 0), 0);
  const communes = stock.filter((l) => (l.parType.immeuble_neuf ?? 0) > 0).length;
  return `${base} — ${immeubles} immeuble${immeubles > 1 ? 's' : ''} à demander sur ${communes} commune${communes > 1 ? 's' : ''} (${fenetreMois} derniers mois)`;
}

const styleTdStock: CSSProperties = { padding: '.4rem .55rem', whiteSpace: 'nowrap' };
/** Id du panneau déplié d'une commune — cible de `aria-controls` du bouton « Détail » de la ligne (disclosure natif). */
const idPanneauStock = (code: string): string => `stock-detail-${code}`;

/**
 * Q2b — PANNEAU de détail d'une commune (contenu de la 2ᵉ ligne dépliée). PUR : période + type + liste des permis délivrés
 * (déjà demandé → réf. de la demande ; sinon « à demander ») fournis par la Vue. Bouton « Refermer ». Mobile-first (colonne
 * + table défilante a11y). `permis === null` = en cours de chargement.
 */
export function PanneauDetailStock({
  communeNom, categories, periode, onPeriode, typeFiltre, onType, permis, chargement, onRefermer,
}: {
  communeNom: string; categories: { cle: string; libelle: string }[];
  periode: string; onPeriode?: (cle: string) => void; typeFiltre: string; onType?: (cle: string) => void;
  permis: PermisDetail[] | null; chargement: boolean; onRefermer?: () => void;
}) {
  const champ: CSSProperties = { padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 12, fontFamily: 'inherit' };
  return (
    <div className="flex flex-col gap-2" style={{ padding: '.6rem .5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Permis délivrés — {communeNom}</strong>
        <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} onClick={() => onRefermer?.()}>Refermer</button>
      </div>
      <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', gap: '.3rem', alignItems: 'center' }}>Période
          <select value={periode} onChange={(e) => onPeriode?.(e.target.value)} style={champ} aria-label="Période recherchée">
            {PERIODES_STOCK.map((p) => <option key={p.cle} value={p.cle}>{p.libelle}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, display: 'flex', gap: '.3rem', alignItems: 'center' }}>Type
          <select value={typeFiltre} onChange={(e) => onType?.(e.target.value)} style={champ} aria-label="Type de permis">
            <option value="tous">Tous les types</option>
            {categories.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
          </select>
        </label>
      </div>
      {chargement || permis === null
        ? <p role="status" style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>Chargement…</p>
        : permis.length === 0
          ? <p role="status" style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>Aucun permis délivré pour cette période et ce type.</p>
          : (
            <ConteneurTableDefilant ariaLabel={`Permis délivrés de ${communeNom}, défilement horizontal`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
                    <th style={styleTdStock}>N° Sitadel</th>
                    <th style={styleTdStock}>Date</th>
                    <th style={{ ...styleTdStock, whiteSpace: 'normal', minWidth: 160 }}>Adresse</th>
                    <th style={styleTdStock}>Type</th>
                    <th style={styleTdStock}>Demande</th>
                  </tr>
                </thead>
                <tbody>
                  {permis.map((p, i) => (
                    <tr key={`${p.numDau}-${i}`} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                      <td style={{ ...styleTdStock, fontFamily: 'var(--font-svv-mono, monospace)' }}>{p.numDau}</td>
                      <td style={styleTdStock}>{p.date ?? '—'}</td>
                      <td style={{ ...styleTdStock, whiteSpace: 'normal' }}>{p.adresse || '—'}</td>
                      <td style={styleTdStock}>{p.libelleCategorie}</td>
                      <td style={styleTdStock}>
                        {p.demandeReference
                          ? <span style={{ color: 'var(--color-svv-green-ink)' }}>demandé · <span style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{p.demandeReference}</span></span>
                          : <span style={{ color: 'var(--color-svv-muted)' }}>à demander</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ConteneurTableDefilant>
          )}
    </div>
  );
}

/**
 * Q2b — TABLEAU du stock par commune. Une ligne par commune : nom + code, décompte par type (immeuble neuf = chiffre
 * PRINCIPAL, en gras), puis bouton « Détail » (disclosure NATIF : `aria-expanded` + `aria-controls`). Ligne ouverte → une
 * 2ᵉ `<tr><td colSpan>` porte le `panneau` (fourni par la Vue). Motif a11y de C3 réutilisé au niveau LIGNE (BlocRepliable =
 * `<section>`, INVALIDE dans un `<tbody>`). Conteneur défilant a11y (mobile). PUR. Aucune animation → prefers-reduced-motion sans objet.
 */
export function TableStock({
  lignes, categories, communeOuverte, onDetail, panneau,
}: {
  lignes: LigneStock[]; categories: { cle: string; libelle: string; rang: number }[];
  communeOuverte: string | null; onDetail?: (codeInsee: string) => void; panneau?: ReactNode;
}) {
  const nCols = categories.length + 2; // Commune + N types + Détail
  return (
    <ConteneurTableDefilant ariaLabel="Stock de permis à demander par commune, défilement horizontal">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
            <th style={{ ...styleTdStock, minWidth: 150 }}>Commune</th>
            {categories.map((c) => (
              <th key={c.cle} style={{ ...styleTdStock, textAlign: 'right' }}
                title={c.cle === 'immeuble_neuf' ? 'Chiffre principal : immeubles neufs encore à demander' : undefined}>{c.libelle}</th>
            ))}
            <th style={styleTdStock} />
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const ouvert = communeOuverte === l.codeInsee;
            return (
              <Fragment key={l.codeInsee}>
                <tr style={{ borderBottom: ouvert ? 'none' : '1px solid var(--color-svv-line)' }}>
                  <td style={{ ...styleTdStock, whiteSpace: 'normal' }}>{l.communeNom ?? l.codeInsee} <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>({l.codeInsee})</span></td>
                  {categories.map((c) => {
                    const n = l.parType[c.cle as Exclude<CleCategorie, 'autre'>] ?? 0;
                    const principal = c.cle === 'immeuble_neuf';
                    return (
                      <td key={c.cle} style={{ ...styleTdStock, textAlign: 'right', fontWeight: principal ? 700 : 400, color: n === 0 ? 'var(--color-svv-muted)' : undefined }}>{n}</td>
                    );
                  })}
                  <td style={styleTdStock}>
                    <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .5rem' }}
                      aria-expanded={ouvert} aria-controls={idPanneauStock(l.codeInsee)} onClick={() => onDetail?.(l.codeInsee)}>
                      {ouvert ? 'Fermer' : 'Détail'}
                    </button>
                  </td>
                </tr>
                {ouvert && (
                  <tr>
                    <td id={idPanneauStock(l.codeInsee)} colSpan={nCols} style={{ padding: 0, borderBottom: '1px solid var(--color-svv-line)', background: 'var(--color-svv-field)' }}>
                      {panneau}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {lignes.length === 0 && (
            <tr><td colSpan={nCols} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>Aucun permis à demander sur cette fenêtre.</td></tr>
          )}
        </tbody>
      </table>
    </ConteneurTableDefilant>
  );
}

/**
 * Q2b — BLOC repliable « Stock de permis à demander (par commune) », FERMÉ par défaut (les données sont chargées par la Vue
 * à l'OUVERTURE, jamais au montage). Utilise `BlocRepliable` (motif C3 — `<section>`, valide hors tableau). PUR : tout l'état
 * (ouvert, chargement, stock, ligne ouverte, panneau) vient de la Vue. Mentionne EXPLICITEMENT que « moins de {fenetreMois} mois »
 * est un sous-ensemble d'AFFICHAGE de la fenêtre d'éligibilité (ne la modifie pas). Aucune animation → prefers-reduced-motion sans objet.
 */
export function BlocStock({
  ouvert, onToggle, chargement, stock, tronque, genereEnMs, fenetreMois, table,
}: {
  ouvert: boolean; onToggle?: () => void; chargement: boolean;
  stock: LigneStock[] | null; tronque?: boolean; genereEnMs?: number; fenetreMois: number; table?: ReactNode;
}) {
  return (
    <BlocRepliable ariaLabel="Stock de permis à demander par commune" idContenu="stock-permis-contenu"
      ligne={libelleStock(stock, fenetreMois)} ouvert={ouvert} onToggle={onToggle} className="svv-card">
      <p style={aide}>
        Permis d’<strong>immeuble neuf</strong> (et autres types) délivrés sur les <strong>{fenetreMois} derniers mois</strong> et
        <strong> pas encore demandés</strong> : le stock encore à demander, commune par commune, pour savoir combien de courriers reste à envoyer.
        La fenêtre « {fenetreMois} mois » est un <strong>sous-ensemble d’affichage</strong> de la fenêtre d’éligibilité (inchangée) — elle ne
        modifie pas l’éligibilité. « Déjà demandé » = rattaché à une demande active.
      </p>
      {chargement || stock === null
        ? <p role="status" style={{ fontSize: 13, color: 'var(--color-svv-muted)', margin: '.4rem 0 0' }}>Chargement du stock…</p>
        : (
          <>
            {table}
            <p style={{ ...aide, marginTop: '.5rem' }}>
              {tronque ? <strong style={{ color: 'var(--color-svv-red)' }}>Liste tronquée (plafond de chargement atteint) — stock possiblement incomplet. </strong> : null}
              Décompte via la définition unique d’éligibilité (la même que la préparation des demandes){typeof genereEnMs === 'number' ? `, calculé en ${genereEnMs} ms` : ''}.
            </p>
          </>
        )}
    </BlocRepliable>
  );
}
