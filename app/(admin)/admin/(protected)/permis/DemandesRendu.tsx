import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { typeDemande, type Tri, type TriColonne } from '../../../../lib/sitadel/demandesListe';
import { ETIQUETTE_PROFIL, ancreDetail, type ProfilDemandeur } from '../../../../lib/sitadel/demande';
import { formaterReferencePermis, resoudreAdresseAvecReplis } from '../../../../lib/sitadel/referencePermis';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';
import { PERIODES_STOCK, type LigneStock } from '../../../../lib/sitadel/stock';
import { EditeurReferenceMairie } from './RefMairieCellule'; // FUS — éditeur PARTAGÉ de la référence mairie (cellule tableau ET détail : un seul comportement)
import { BoutonCopier } from './BoutonCopier'; // DEPOT-1 — pastille de copie PARTAGÉE (texte + numéro de permis), même apparence
import { BlocRepliable as BlocLignePli } from './BlocRepliable'; // LOT 16 (B) — le pli « Texte de la demande » adopte la MÊME ligne repliable que les familles de l'encart (facture unique)
import type { Decompte } from '../../../../lib/veille/decompteButoir'; // LOT-8 (B) — décompte en jours avant le butoir qui fait foi
import type { ContactMairie } from '../../../../lib/veille/reponsesSuivi'; // LOT-9 (C) — carnet d'adresses « Contact mairie »
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
export function CarteDepot({ d, children, onCopieTexte, onCopieRef }: {
  d: DepotAffiche; children?: ReactNode;
  onCopieTexte?: () => void; onCopieRef?: () => void; // DEPOT-1 — traces best-effort (« a copié le texte / le numéro »), passées par BlocDepot
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
  const corps = d.corps ?? '';
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

      {/* DEPOT-1 — ORDRE DES BLOCS calqué sur le geste réel : (1) ADRESSE + arrondissement (identifier le dossier), (2) TEXTE +
          « Copier le texte », (3) NUMÉRO DE PERMIS + « Copier le numéro de permis ». Chaque retour de copie est la MÊME pastille,
          attachée à SON bouton (BoutonCopier). */}

      {/* (1) ADRESSE + ARRONDISSEMENT — U4/U5 : source unique, provenance STRICTEMENT opérateur (jamais dans le corps mairie). */}
      {adresseAffichee
        ? <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Adresse : {[adr!.voie, adr!.villeCP].filter((x) => x !== '').join(', ')}</span>
        : <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>Aucune adresse de voie n’est renseignée pour ce permis (base Sitadel) — à vérifier avant de déposer.</span>}
      {prov?.origine === 'repli' && <span role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>Adresse issue de la ligne {prov.soeurType} du même numéro de permis (parcelle {prov.parcelleCommune} commune vérifiée).</span>}
      {prov?.origine === 'non_verifiable' && <span role="note" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Une ligne {prov.soeurTypes.join('/')} du même numéro de permis porte une adresse, mais le lien n’a pas pu être vérifié (parcelles cadastrales absentes) — à vérifier avant de l’utiliser.</span>}
      {prov?.origine === 'ambigu' && <span role="note" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Plusieurs lignes sœurs portent des adresses différentes — ambiguïté à trancher manuellement, aucun choix automatique.</span>}
      <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Arrondissement : {adr?.arrondissement ?? 'indéterminé'}</span>

      {/* (2) TEXTE de la demande + « Copier le texte » (corps FIGÉ à la création — rendu tel quel, jamais régénéré). */}
      <textarea readOnly value={corps} rows={10} aria-label={`Texte de la demande pour ${d.communeNom ?? d.reference}`}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
      <BoutonCopier valeur={corps} libelle="Copier le texte" libelleMarque="Texte copié" disabled={corps.trim() === ''} onCopie={onCopieTexte} />

      {/* (3) NUMÉRO DE PERMIS + « Copier le numéro de permis » — cartouche encadré (source unique formaterReferencePermis). */}
      <div role="group" aria-label="Numéro de permis à copier"
        style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.5rem', background: 'var(--color-svv-field)', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', fontSize: 12, color: 'var(--color-svv-muted)' }}>
          Numéro de permis (dossier instruit — téléservice)
          {ref.ok ? (
            <span style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input readOnly value={ref.reference} aria-label="Numéro de permis"
                style={{ flex: '1 1 12rem', minWidth: 0, padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
              <BoutonCopier valeur={ref.reference} libelle="Copier le numéro de permis" libelleMarque="Numéro copié" onCopie={onCopieRef} />
            </span>
          ) : (
            <span role="note" style={{ color: 'var(--color-svv-red)' }}>impossible de pré-remplir : {ref.raison}.</span>
          )}
        </label>
      </div>

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

/** FUS-4 — ORIGINE d'une demande, en clair : 'formulaire' → « Téléservice », 'email' → « Mail ». Repli : la valeur brute. La
 *  colonne « Canal » du tableau devient « Origine » et affiche ce libellé (identique dans les deux onglets). PUR. */
export function libelleOrigine(canal: string | null | undefined): string {
  return canal === 'formulaire' ? 'Téléservice' : canal === 'email' ? 'Mail' : (canal ?? '—');
}

/** FUS-4 / décision 1 — « accusé de réception reçu » est DÉRIVÉ, jamais stocké : vrai si une référence mairie est présente OU
 *  si un message de nature `accuse` est rattaché. Effacer la référence fait donc revenir l'état antérieur TOUT SEUL. PUR. */
export function accuseRecu(d: { referencesMairie: string[]; aAccuse: boolean }): boolean {
  return d.referencesMairie.length > 0 || d.aAccuse;
}

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

export function MentionMasquage({ morts, onAfficherTout, exclus }: {
  morts: { statut: string; n: number }[];
  onAfficherTout?: () => void;
  // T6-A/2 — motif NON RÉVÉLABLE : ces demandes ne sont pas MASQUÉES par confort, elles sont EXCLUES (elles n'appartiennent pas à
  //   cet onglet — leur foyer est ailleurs). Donc AUCUN bouton d'affichage (un invariant qui saute au premier clic n'en est pas un),
  //   et une formulation DISTINCTE (« … — suivies dans … », jamais « masquée(s) — les afficher ») + une ligne séparée : révélable et
  //   non révélable ne se confondent ni visuellement ni dans le texte.
  exclus?: { n: number; libelle: string }[]; // plusieurs registres d'exclusion NON RÉVÉLABLES (soldées → Archives ; à retour → Réponses), chacun sur SA ligne
}) {
  const visibles = morts.filter((x) => x.n > 0);
  const total = visibles.reduce((a, x) => a + x.n, 0);
  const exclusVus = (exclus ?? []).filter((e) => e.n > 0);
  if (total === 0 && exclusVus.length === 0) return null;
  const texte = visibles.map((x) => `${x.n} ${STATUT_LIBELLE[x.statut] ?? x.statut}(s) masquée(s)`).join(' · ');
  return (
    <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', marginTop: '.3rem' }}>
      {total > 0 && (
        <div>
          {texte}
          {onAfficherTout && (
            <>
              {' — '}
              <button type="button" className="svv-link" style={{ width: 'auto', padding: 0 }} onClick={onAfficherTout}>les afficher</button>
            </>
          )}
        </div>
      )}
      {/* EXCLUSION (jamais révélable) : ni bouton, ni « masquée(s) ». On DIT le nombre ET où elles sont suivies. Une ligne par registre. */}
      {exclusVus.map((e, i) => (
        <div key={e.libelle} style={{ marginTop: (total > 0 || i > 0) ? '.15rem' : 0 }}>{e.n} demande(s) {e.libelle}</div>
      ))}
    </div>
  );
}

/** Horodatage ISO → « JJ/MM/AAAA HH:MM » en heure LOCALE Europe/Paris (convention du projet : certificat PDF, analytics —
 *  cf. publierCertificatPdf). Fuseau FIXE → DÉTERMINISTE (insensible au fuseau de la machine, testable). Distinct de
 *  formaterDateHeure (UTC brut, usage technique du journal). '' / date invalide → '—'. */
export function formaterDateHeureLocale(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** LOT 16 — JOUR seul (JJ/MM/AAAA, Europe/Paris), pour le titre du pli « Texte de la demande … envoyée le … ». '' / invalide → '—'. */
export function formaterJourLocale(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

// Cellule des tableaux de demandes : contenu CENTRÉ (horizontal + vertical). Scopé à ce fichier (TableDemandes + Cellule*), pas
//   à TableStock ni au panneau détail (styles propres). Le `<tr>` d'en-tête passe aussi en textAlign center (cf. thead).
const styleTdD: CSSProperties = { padding: '.4rem .5rem', textAlign: 'center', verticalAlign: 'middle' };

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
  numeros?: string[]; // T6-B — num_dau des dossiers ACTIFS (colonne « N° permis »)
  envoyeLe?: string | null; // FUS — date/heure effective d'envoi (min demande_acheminement.envoye_le), affichée sous le statut ; absente hors « En cours »
  cascade?: { libelle: string; prochaine: string; court: string } | null; // lot 4 — statut DÉRIVÉ de la cascade (colonne Statut, « En cours ») : libellé complet (infobulle) + prochaine étape + libellé COURT affiché (LOT-7). Absent ailleurs.
}

/** T6-B — n° de SÉQUENCE d'une référence SVAV-DEM-AAAA-NNNNNN (dernier segment « NNNNNN »). Repli : la référence entière si le format diffère. PUR. */
export function sequenceReference(reference: string): string {
  const parts = reference.split('-');
  return parts[parts.length - 1] || reference;
}

const styleMono: CSSProperties = { fontFamily: 'var(--font-svv-mono, monospace)' };

/**
 * T6-B — cellule d'AFFICHAGE avec INFOBULLE : mécanisme U1 RÉUTILISÉ tel quel (`.svv-tip-wrap` + `.svv-tip`, `aria-describedby`,
 * visible au SURVOL ET au FOCUS CLAVIER — cf. globals.css:62-66), aucun 2ᵉ mécanisme. Déclencheur = `<span tabIndex={0}>` (focusable
 * → `:focus-within` révèle l'infobulle au clavier). `idTip` doit être unique dans la page.
 */
function AvecInfobulle({ visible, complet, idTip, style, title }: { visible: ReactNode; complet: string; idTip: string; style?: CSSProperties; title?: string }) {
  return (
    <span className="svv-tip-wrap">
      {/* tabIndex=0 → bulle au FOCUS clavier (:focus-within) autant qu'au survol ; `title` natif = repli mobile/sans CSS (item 3). */}
      <span tabIndex={0} aria-describedby={idTip} title={title} style={{ cursor: 'help', ...style }}>{visible}</span>
      <span role="tooltip" id={idTip} className="svv-tip">{complet}</span>
    </span>
  );
}

/**
 * T6-B — cellule « N° permis » au grain DEMANDE. 1 dossier → le numéro SEUL (jamais un « + »). Plusieurs → premier numéro + « +N »,
 * la LISTE COMPLÈTE en infobulle U1. AUCUN dossier actif → texte EXPLICITE (« aucun dossier actif »), JAMAIS une cellule vide (qui
 * ressemblerait à un bug — même exigence que « rien en silence »). PUR.
 */
export function CellulePermis({ numeros, demandeId }: { numeros?: string[]; demandeId: number }) {
  const nums = numeros ?? [];
  if (nums.length === 0) return <td style={{ ...styleTdD, whiteSpace: 'nowrap' }}><span style={{ color: 'var(--color-svv-muted)' }}>aucun dossier actif</span></td>;
  if (nums.length === 1) return <td style={{ ...styleTdD, whiteSpace: 'nowrap', ...styleMono }}>{nums[0]}</td>;
  return (
    <td style={{ ...styleTdD, whiteSpace: 'nowrap' }}>
      <AvecInfobulle idTip={`permis-${demandeId}`} complet={nums.join(', ')} style={styleMono}
        visible={<>{nums[0]}<span style={{ ...styleMono, color: 'var(--color-svv-muted)', marginLeft: '.25rem' }}>+{nums.length - 1}</span></>} />
    </td>
  );
}

/**
 * T6-B — cellule « Référence » RÉDUITE : n° de séquence en clair (atténué). La référence COMPLÈTE reste atteignable pour TOUS —
 * (a) LISIBLE par un lecteur d'écran via `aria-label` SUR LA CELLULE (texte accessible), (b) visible au SURVOL souris (infobulle
 * `.svv-tip`, aria-hidden pour ne pas doubler la lecture). Retouche a11y : PLUS de `tabIndex` → la cellule cesse d'être un arrêt de
 * tabulation (info secondaire depuis que le N° permis est en 1re colonne), sans jamais rendre l'information inatteignable. PUR.
 */
export function CelluleReference({ reference }: { reference: string }) {
  return (
    <td style={{ ...styleTdD, whiteSpace: 'nowrap' }} aria-label={reference}>
      <span className="svv-tip-wrap">
        <span style={{ ...styleMono, color: 'var(--color-svv-muted)' }}>{sequenceReference(reference)}</span>
        <span aria-hidden="true" className="svv-tip">{reference}</span>
      </span>
    </td>
  );
}

/**
 * T6-A / T3 / T8 — état de RETOUR MAIRIE d'une demande, DÉRIVÉ UNIQUEMENT. ⚠️ VOCABULAIRE VERROUILLÉ (T8) : « OBTENU » est
 * RÉSERVÉ à un fichier réellement EN GED (`dossier_document`, déf. G1/G2, importée via `dossiersEnGed`) ; ce qui vient de
 * `satisfait_le` dit « MARQUÉ REÇU », jamais « obtenu » (une déclaration humaine n'est pas un fait vérifiable) :
 *  - 'obtenus'         : TOUS les dossiers actifs ont un fichier EN GED → « documents obtenus » ;
 *  - 'recu_a_classer'  : ≥ 1 dossier MARQUÉ REÇU (satisfait_le) mais PAS (tous) en GED → « reçu, à classer en GED » (nomme l'action attendue) ;
 *  - 'message'         : la mairie a ÉCRIT — ≥ 1 message rattaché (`nbReponses`, accusé compris, rebond exclu par nature) ;
 *  - 'accuse'          : FUS-4 — « accusé reçu » DÉRIVÉ (référence mairie présente OU message nature 'accuse'), rien de stocké.
 *                        Position BASSE : ne prend JAMAIS le pas sur obtenus/reçu-à-classer/message. Un accusé n'est PAS une
 *                        réponse (T3) → n'affecte NI le statut de la demande NI le vocabulaire T8 (« obtenu »/« marqué reçu »).
 *  - 'aucun'           : rien. Priorité obtenus > reçu-à-classer > message > accusé reçu > aucun. PUR.
 */
export type EtatRetourMairie = 'aucun' | 'accuse' | 'message' | 'recu_a_classer' | 'obtenus';
export function etatRetourMairie(d: { nbReponses: number; nbReponsesReelles?: number; dossiersActifs: number; dossiersSatisfaits: number; dossiersEnGed: number; referencesMairie?: string[]; aAccuse?: boolean }): EtatRetourMairie {
  if (d.dossiersActifs > 0 && d.dossiersEnGed >= d.dossiersActifs) return 'obtenus'; // OBTENU = fichiers EN GED (dossier_document), jamais satisfait_le
  if (d.dossiersSatisfaits > 0) return 'recu_a_classer';                              // marqué reçu, fichier pas (tout) en GED → à classer
  // 'message' = la mairie a RÉPONDU pour de vrai : nbReponsesReelles (accusé EXCLU). Un accusé SEUL rattaché relève de 'accuse'
  //   (sinon il masquerait « accusé reçu » derrière « message reçu »). Repli sur nbReponses si reelles absent (compat appelants).
  if ((d.nbReponsesReelles ?? d.nbReponses) > 0) return 'message';
  if (accuseRecu({ referencesMairie: d.referencesMairie ?? [], aAccuse: d.aAccuse ?? false })) return 'accuse'; // FUS-4 : sous message réel
  return 'aucun';
}

/** Un message porteur de CONTENU (lien fort OU pièce), pour la PROVENANCE affichée sur la ligne (source : `provenancesContenu`). */
export interface ProvenanceLigneContenu { recuLe: string; deAdresse: string; aLien: boolean; aPiece: boolean }

/** FUS — PROVENANCE du contenu sur la ligne : le message le PLUS RÉCENT porteur d'un lien/pièce (date+heure Europe/Paris +
 *  adresse COMPLÈTE, non tronquée — clé de recherche Gmail) + compteur « +N autre(s) ». Les autres sont au déplié. PUR. */
function ProvenanceContenuLigne({ provenances }: { provenances: ProvenanceLigneContenu[] }) {
  const p = provenances[0]; // le PLUS RÉCENT (source triée recu_le DESC)
  const reste = provenances.length - 1;
  const quoi = p.aLien && p.aPiece ? 'lien + pièces' : p.aLien ? 'lien' : 'pièces';
  return (
    <div style={{ fontSize: 11, marginTop: '.15rem', color: 'var(--color-svv-ink)' }}>
      <span style={{ color: 'var(--color-svv-muted)' }}>contenu ({quoi}) reçu le </span>
      {formaterDateHeureLocale(p.recuLe)}
      <span style={{ color: 'var(--color-svv-muted)' }}> · </span>
      <span style={{ wordBreak: 'break-all' }}>{p.deAdresse}</span>
      {reste > 0 ? <span style={{ color: 'var(--color-svv-muted)' }}> · +{reste} autre{reste > 1 ? 's' : ''}</span> : null}
    </div>
  );
}

/** T6-A / T8 — cellule « Retour mairie » (4 états dérivés). Le TEXTE porte l'information ; date en JJ/MM. « obtenu » = fichier
 *  EN GED (vert) ; « reçu, à classer en GED » = marqué reçu sans fichier (orange, mot G2). FUS — la PROVENANCE du contenu (le
 *  message porteur d'un lien/pièce le plus récent + expéditeur) est affichée SOUS le libellé, jamais pour un accusé seul. PUR. */
export function RetourMairie({ etat, nbReponses, derniereReponseLe, provenances }: {
  etat: EtatRetourMairie; nbReponses: number; derniereReponseLe: string | null; provenances?: ProvenanceLigneContenu[];
}) {
  const prov = provenances ?? [];
  const provBloc = prov.length > 0 ? <ProvenanceContenuLigne provenances={prov} /> : null; // rien sans lien ni pièce (accusé seul)
  // FUS — DATE/HEURE de l'événement qui FONDE l'état (heure locale Paris) : `derniereReponseLe` = max(recu_le) hors rebond, accusé
  //   COMPRIS. Pour « accusé reçu » fondé UNIQUEMENT sur une référence saisie (aucun message), `derniereReponseLe` est null → AUCUNE
  //   date. Les états dossier (obtenus / reçu-à-classer) n'affichent pas cette date, mais gardent la PROVENANCE si contenu.
  const dateRetour = derniereReponseLe ? <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>{formaterDateHeureLocale(derniereReponseLe)}</div> : null;
  const libelle = etat === 'obtenus' ? <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>documents obtenus</span>
    : etat === 'recu_a_classer' ? <span style={{ color: '#8a5a00', fontWeight: 600 }}>reçu, à classer en GED</span>
    : etat === 'message' ? <><span>message reçu ({nbReponses})</span>{dateRetour}</>
    // FUS-4 — accusé reçu (dérivé). Texte porteur (a11y), pas seulement une couleur. Un accusé n'est pas une réponse : le statut ne bouge pas.
    : etat === 'accuse' ? <><span style={{ color: '#1a4d8f', fontWeight: 600 }}>accusé reçu</span>{dateRetour}</>
    : <span style={{ color: 'var(--color-svv-muted)' }}>aucun retour</span>;
  return <div>{libelle}{provBloc}</div>;
}

/** LOT-9 (C) — libellé COURT de l'état « retour mairie » (pour le bilan de titre de la famille « Contact mairie »). PUR. */
export function libelleRetourMairie(etat: EtatRetourMairie, nbReponses: number): string {
  return etat === 'obtenus' ? 'documents obtenus'
    : etat === 'recu_a_classer' ? 'reçu, à classer en GED'
    : etat === 'message' ? `message reçu (${nbReponses})`
    : etat === 'accuse' ? 'accusé reçu'
    : 'aucun retour';
}

/**
 * LOT-9 (C) — CARNET D'ADRESSES « Contact mairie » (contenu de la famille). Ce n'est PAS l'état de synthèse (bilan de titre) ni le fil
 * (famille « Historique ») : uniquement les INTERLOCUTEURS (qui NOUS a écrit + date/heure de leur dernier message, du plus récent au
 * plus ancien) et le DESTINATAIRE d'origine (où NOUS avons écrit). PUR.
 */
export function BlocContactMairie({ contact }: { contact: ContactMairie }) {
  if (contact.interlocuteurs.length === 0 && !contact.destinataire) {
    return <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Aucun contact mairie connu pour l’instant.</span>;
  }
  // LOT 26 (①) — UNE seule liste au gabarit UNIFORME : les interlocuteurs (adresse + nom + date, du plus récent au plus ancien) puis, EN FIN de
  //   liste (aucune date connue), le destinataire d'origine s'il n'est pas déjà un interlocuteur (dédup insensible à la casse). Toutes les lignes
  //   partagent le MÊME alignement (flush, sans puce) et la même graisse ; le nom et la date ne s'affichent QUE s'ils existent → l'adresse seule
  //   ne décale jamais la ligne. Séparateur : un filet UNIFORME entre chaque ligne (jamais de hiérarchie factice). Mobile : l'adresse casse (word-break).
  const lignes: { adresse: string; nom: string | null; dernierLe: string | null }[] = contact.interlocuteurs.map((it) => ({ adresse: it.adresse, nom: it.nom, dernierLe: it.dernierLe }));
  if (contact.destinataire && !lignes.some((l) => l.adresse.toLowerCase() === contact.destinataire!.toLowerCase())) {
    lignes.push({ adresse: contact.destinataire, nom: null, dernierLe: null }); // adresse sans date connue → en fin de liste
  }
  return (
    <div className="svv-card flex flex-col gap-2" style={{ fontSize: 13, minWidth: 0 }}>
      {contact.interlocuteurs.length > 0 && <strong style={{ fontSize: 12 }}>Nous ont écrit (du plus récent au plus ancien)</strong>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lignes.map((l, i) => (
          <div key={`${l.adresse}-${i}`} style={{ fontSize: 13, marginTop: i > 0 ? '.35rem' : undefined, paddingTop: i > 0 ? '.35rem' : undefined, borderTop: i > 0 ? '1px solid var(--color-svv-line)' : undefined }}>
            <span style={{ fontFamily: 'var(--font-svv-mono, monospace)', wordBreak: 'break-all' }}>{l.adresse}</span>{l.nom ? ` — ${l.nom}` : ''}
            {l.dernierLe ? <span style={{ color: 'var(--color-svv-muted)' }}> · dernier message le {formaterDateHeureLocale(l.dernierLe)}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * D3/T6-B — tableau des demandes PUR. Colonnes : [sélection] · **N° permis** · Référence (réduite) · Type · Commune · Profil · Canal · Destinataire ·
 * Dossiers · Statut · [ouvrir]. Le TYPE est en 2e position DONNÉE (juste après Référence), aligné en-tête ↔ ligne par le même
 * ordre. Tenue à l'écran : conteneur défilant a11y + `nowrap`/`min-width` sobres, « Destinataire » absorbant le surplus. Le
 * tri (EnteteTriable), le filtre et la pagination restent pilotés par la Vue (callbacks). Aucun état ici → renderToStaticMarkup.
 * `avecSelection` (défaut vrai) masque la colonne de cases à cocher là où il n'y a aucune action groupée (Q6 : onglet « en
 * cours ») — pas de contrôle inerte à l'écran.
 */
/**
 * LOT-7 (A) — CELLULE STATUT : le libellé de cascade (jusqu'à ~200 caractères pour une suspension) NE DOIT PLUS dicter la largeur ni la
 * hauteur de la table. On n'affiche qu'un LIBELLÉ COURT (l'état : « Arrêtée », « Envoyée », « Rappel envoyé »…), sur UNE ligne (nowrap,
 * jamais de word-break), et le TEXTE COMPLET va dans une infobulle (survol + focus clavier + `title` natif en repli mobile). Le `nowrap`
 * partagé (`styleTdD`) des autres colonnes n'est pas touché : style DÉDIÉ à cette cellule.
 */
const STYLE_CELLULE_STATUT: CSSProperties = { ...styleTdD, whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' };
export function CelluleStatut({ d }: { d: DemandeAffichee }) {
  if (d.cascade) {
    const complet = [d.cascade.libelle, d.cascade.prochaine].filter((s) => s && s.trim() !== '').join(' · ');
    return (
      <td style={STYLE_CELLULE_STATUT}>
        <AvecInfobulle idTip={`statut-${d.id}`} complet={complet} title={complet} visible={d.cascade.court} style={{ whiteSpace: 'nowrap' }} />
      </td>
    );
  }
  return (
    <td style={STYLE_CELLULE_STATUT}>
      <div>{STATUT_LIBELLE[d.statut] ?? d.statut}</div>
      {d.envoyeLe ? <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>{formaterDateHeureLocale(d.envoyeLe)}</div> : null}
    </td>
  );
}

/**
 * LOT-8 (B) — colonne DÉLAI = un vrai DÉCOMPTE en jours avant le butoir qui fait foi (« J-32 » / « dépassé de N j » / « aujourd'hui »),
 * la DATE en infobulle. Cas « obtenu / indéterminé / non délivrée / pas encore envoyée » dits lisiblement (jamais un vide muet). Une
 * ligne, nowrap. Le butoir (ordinaire ou PARTIEL prolongé) est décidé en amont par `decompteButoirCada` (source unique).
 */
export function DecompteDelai({ d, id }: { d: Decompte; id: number }) {
  const muted: CSSProperties = { color: 'var(--color-svv-muted)' };
  if (d.etat === 'non_delivree') return <span style={muted} title="Rebond ou échec d’acheminement : aucun délai ne court.">non délivrée</span>;
  if (d.etat === 'non_envoyee') return <span style={muted}>—</span>;
  if (d.etat === 'obtenu') return <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }} title="Tous les documents ont été obtenus.">obtenu</span>;
  if (d.etat === 'indetermine') return <span style={muted} title="Relève trop ancienne : silence non vérifié.">indéterminé</span>;
  const j = d.jours ?? 0;
  const libelle = j < 0 ? `dépassé de ${-j} j` : j === 0 ? 'aujourd’hui' : `J-${j}`;
  const couleur = j <= 7 ? 'var(--color-svv-red)' : 'var(--color-svv-ink)'; // urgence/dépassé en rouge, sinon encre
  const dateFr = d.butoir ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(d.butoir)) : '';
  const complet = `Échéance ${d.source === 'partiel' ? 'CADA (dossier partiel, délai prolongé)' : 'du délai d’un mois'} le ${dateFr}`;
  return <AvecInfobulle idTip={`delai-${id}`} complet={complet} title={complet} visible={<span style={{ color: couleur, fontWeight: 600 }}>{libelle}</span>} style={{ whiteSpace: 'nowrap' }} />;
}

export function TableDemandes({
  visibles, categories, tri, sel, toutCoche, messageVide, avecSelection = true, demandeOuverte = null, panneau, colonnesSuivi, masquerOrigineDest = false, onTrier, onToutSelectionner, onBasculer, onOuvrir,
}: {
  visibles: DemandeAffichee[]; categories: { libelle: string; rang: number }[];
  tri: Tri; sel: ReadonlySet<number>; toutCoche: boolean; messageVide: string; avecSelection?: boolean;
  // U7 — accordéon À UN SEUL VOLET : `demandeOuverte` = l'unique demande dépliée (jamais un Set → jamais deux détails). `panneau` = son
  //   détail (bâti par la Vue), rendu dans une 2ᵉ `<tr><td colSpan>` JUSTE SOUS sa ligne. Motif de TableStock (disclosure natif au niveau ligne).
  demandeOuverte?: number | null; panneau?: ReactNode;
  // T6-A — colonnes SUPPLÉMENTAIRES (« En cours » : Délai + Réf. mairie), injectées APRÈS la colonne Statut. ABSENTES ailleurs →
  //   « À demander » rigoureusement inchangé (aucune colonne, aucun champ riche à null). `largeur` = nb de colonnes (pour le colSpan).
  colonnesSuivi?: { entetes: ReactNode; largeur: number; cellule: (d: DemandeAffichee) => ReactNode };
  // LOT-8 (A) — en « En cours », Origine (constante = le rail sélectionné) et Destinataire (repris dans l'en-tête du détail) sont
  //   MASQUÉES pour gagner de la place. Ailleurs (« À demander »), elles restent (aucun rail sélectionné en tête, avant envoi).
  masquerOrigineDest?: boolean;
  onTrier?: (c: TriColonne) => void; onToutSelectionner?: () => void; onBasculer?: (id: number) => void; onOuvrir?: (id: number) => void;
}) {
  const nowrap: CSSProperties = { ...styleTdD, whiteSpace: 'nowrap' };
  const nCols = (avecSelection ? 11 : 10) - (masquerOrigineDest ? 2 : 0) + (colonnesSuivi?.largeur ?? 0); // T6-B : +1 pour « N° permis ». colSpan du panneau et de la ligne « vide »
  return (
    <ConteneurTableDefilant ariaLabel="Tableau des demandes, défilement horizontal">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'center', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
            {avecSelection && <th style={styleTdD}><input type="checkbox" aria-label="Tout sélectionner" checked={toutCoche} onChange={() => onToutSelectionner?.()} /></th>}
            <th style={{ ...nowrap, minWidth: 130 }}>N° permis</th>
            <th style={nowrap}>Référence</th>
            <th style={nowrap}>Type</th>
            <EnteteTriable libelle="Commune" colonne="commune" tri={tri} onTrier={onTrier} />
            <th style={styleTdD}>Profil</th>
            {!masquerOrigineDest && <th style={nowrap}>Origine</th>}
            {!masquerOrigineDest && <th style={{ ...styleTdD, minWidth: 160 }}>Destinataire</th>}
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
                {/* LOT-9 (B) — TOUTE la ligne ouvre/ferme le détail (clic + Entrée/Espace, role=button, curseur pointeur). Les contrôles
                     internes (case à cocher, éditeur de réf. mairie, bouton « ouvrir ») stoppent la propagation pour garder leur geste. */}
                <tr
                  role={onOuvrir ? 'button' : undefined} tabIndex={onOuvrir ? 0 : undefined} aria-expanded={onOuvrir ? ouvert : undefined} aria-controls={onOuvrir ? ancreDetail(d.id) : undefined}
                  onClick={onOuvrir ? () => onOuvrir(d.id) : undefined}
                  onKeyDown={onOuvrir ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(d.id); } } : undefined}
                  style={{ borderBottom: ouvert ? 'none' : '1px solid var(--color-svv-line)', cursor: onOuvrir ? 'pointer' : undefined }}
                >
                  {avecSelection && <td style={styleTdD} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(d.id)} onChange={() => onBasculer?.(d.id)} aria-label={`Sélectionner ${d.reference}`} /></td>}
                  <CellulePermis numeros={d.numeros} demandeId={d.id} />
                  <CelluleReference reference={d.reference} />
                  <CelluleType rangs={d.rangs} categories={categories} />
                  <td style={styleTdD}>{d.communeNom ?? d.codeInsee}</td>
                  <td style={styleTdD}>{ETIQUETTE_PROFIL[d.profil as ProfilDemandeur] ?? d.profil}</td>
                  {!masquerOrigineDest && <td style={nowrap}>{libelleOrigine(d.canal)}</td>}
                  {!masquerOrigineDest && <td style={styleTdD}><OrigineDest origine={d.destOrigine} nom={d.destNom} /></td>}
                  <td style={styleTdD}>{d.nbDossiers}</td>
                  {/* FUS — Statut + DATE/HEURE effective d'envoi. Lot 4 (« En cours ») — le STATUT DÉRIVÉ de la cascade (libellé + prochaine
                       étape) prime : il reflète le dernier envoi RÉEL. La colonne « Retour mairie » (à côté) reste réservée à la MAIRIE.
                       Q3 — cellule BORNÉE (largeur max + retour à la ligne) : le long libellé ne dicte plus la largeur de la table. */}
                  <CelluleStatut d={d} />
                  {colonnesSuivi?.cellule(d) /* T6-A — Délai + Retour mairie (En cours) */}
                  <td style={styleTdD}>
                    {/* LOT-9 (B) — le bouton reste le repère visuel de l'action ; stopPropagation pour ne pas DOUBLER le toggle avec le clic de ligne. */}
                    <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }}
                      aria-expanded={ouvert} aria-controls={ancreDetail(d.id)} onClick={(e) => { e.stopPropagation(); onOuvrir?.(d.id); }}>
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
  detail, corps, retour, onCorps, onFermer, onSauverCorps, onAjouterRef, onModifierRef, onSupprimerRef, onBascule, onTransition, slotDossiers, slotActions, masquerRefMairie = false, dateInitialeEnvoi = null,
}: {
  detail: DemandeDetail; corps: string; retour: RetourAction;
  onCorps: (v: string) => void;
  onFermer: () => void; onSauverCorps: () => void;
  // FUS — édition de LA référence mairie via l'éditeur PARTAGÉ (mêmes callbacks que la cellule du tableau → un seul comportement).
  onAjouterRef: (reference: string) => Promise<string | null>;
  onModifierRef: (ancien: string, nouveau: string) => Promise<string | null>;
  onSupprimerRef: (reference: string) => Promise<string | null>;
  onBascule: (profil: ProfilDemandeur) => void; onTransition: (statut: 'prete' | 'annulee') => void;
  // T6-A — slots pour « En cours » : `slotDossiers` REMPLACE le détail brut des dossiers par DetailDossiers (actions T1) ;
  //   `slotActions` ajoute ActionsCloture (clôturer/rouvrir). ABSENTS pour « À demander » → rendu STRICTEMENT inchangé.
  slotDossiers?: ReactNode; slotActions?: ReactNode;
  // UNIF-1 — quand l'appelant range LUI-MÊME l'éditeur de référence mairie dans son encart (famille « Suivi & actions »), il
  //   masque ICI le bloc réf. mairie du panneau pour ne pas le dupliquer. DÉFAUT false → « À demander » et l'existant inchangés.
  masquerRefMairie?: boolean;
  // LOT 16 (B, point 8) — date (ISO) de l'ENVOI INITIAL, pour le titre dynamique du pli « Texte de la demande ». 🔴 MÊME DONNÉE que la
  //   1re entrée de la frise : l'appelant passe `richDetail.historiqueEnvois` de nature 'initiale' (pas un 2e calcul). null = brouillon / non envoyée.
  dateInitialeEnvoi?: string | null;
}) {
  const brouillon = detail.statut === 'brouillon';
  // LOT 16 (B, points 8/9) — titre DYNAMIQUE du pli. Date présente → « … initiale envoyée le JJ/MM/AAAA » ; brouillon (pas encore envoyée)
  //   → « Texte de la demande » (aucune date inventée) ; envoyée mais date absente (cas limite) → « Texte de la demande envoyée ».
  const titrePli = dateInitialeEnvoi
    ? `Texte de la demande initiale envoyée le ${formaterJourLocale(dateInitialeEnvoi)}`
    : brouillon ? 'Texte de la demande' : 'Texte de la demande envoyée';
  // LOT-11 (B/6) — libellé du profil : mapping 'entreprise'→'Société' / 'personne'→'Personne physique' ; repli propre sur un profil
  //   inattendu ou absent (valeur brute, sinon « — ») → jamais un vide muet ni un « undefined » à l'écran.
  const libelleProfil = ETIQUETTE_PROFIL[detail.profil as ProfilDemandeur] ?? (detail.profil?.trim() ? detail.profil : '—');
  return (
    <div className="flex flex-col gap-2" style={{ padding: '.6rem .5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        {/* LOT-11 (B) — profil dans le TITRE, en CAPSULE ROUGE (repérable d'un coup d'œil) : « … — envoyée — profil Société ». Le reste du titre garde son style. */}
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
          <span>{detail.reference} — {detail.communeNom ?? detail.codeInsee} — {STATUT_LIBELLE[detail.statut] ?? detail.statut} —</span>
          <span style={{ background: 'var(--color-svv-red)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '.1rem .5rem', borderRadius: 999, whiteSpace: 'nowrap' }}>profil {libelleProfil}</span>
        </strong>
        <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} onClick={() => onFermer()}>fermer</button>
      </div>
      {/* LOT-11 (A) — en BROUILLON uniquement : destinataire (où ça PARTIRA) + sélecteur de profil (le SEUL endroit où on le choisit avant
           envoi). Sur une demande déjà envoyée, ces éléments sont RETIRÉS (geste inerte, info portée par le titre + la famille « Contact mairie »). */}
      {brouillon && (
      <>
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
              style={{ padding: '.25rem .7rem', cursor: !actif ? 'pointer' : 'default' }}
              disabled={actif}
              onClick={() => onBascule(p)}>{ETIQUETTE_PROFIL[p]}</button>
          );
        })}
      </div>
      </>
      )}
      {/* LOT 26 (②) — REVIREMENT assumé du LOT 22 (A2) : le pli « Texte de la demande initiale envoyée le … » repasse en PREMIÈRE position,
           AVANT l'encart de familles (Contact mairie en tête). `slotDossiers` n'est fourni QU'en « En cours » (richDetail) → en « À demander »
           rien ne se rend ici et l'ordre visible est INCHANGÉ (le pli restait déjà avant le détail brut, qui vient plus bas). */}
      {/* LOT-7 / LOT 16 (B) — corps de la lettre derrière UN PLI (1 clic). LOT 16 : même ligne repliable que les familles (BlocLignePli). */}
      <BlocLignePli titre={titrePli} defautOuvert={brouillon}>
        {() => (
          <textarea value={corps} onChange={(e) => onCorps(e.target.value)} rows={16} readOnly={!brouillon}
            style={{ width: '100%', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', boxSizing: 'border-box', background: '#fff' }} />
        )}
      </BlocLignePli>
      {slotDossiers}
      {/* À demander (pas d'encart) : détail brut des dossiers, APRÈS le pli — ordre inchangé pour cet onglet. */}
      {!slotDossiers && <BlocDossiersDetail dossiers={detail.dossiers} retires={detail.dossiersRetires} />}
      {/* UNIF-1 — masqué quand l'appelant range l'éditeur dans son encart (famille « Suivi & actions ») ; sinon rendu ici (À demander). */}
      {!masquerRefMairie && (
      <div style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--color-svv-muted)' }}>Références mairie : </span>
        {detail.referencesMairieIndisponible
          ? <span role="status" style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>indisponibles (lecture en erreur — voir les journaux)</span>
          : <div style={{ marginTop: '.3rem' }}>
              {/* FUS — MÊME éditeur que la cellule du tableau (un seul comportement) : « ajouter » seulement si aucune référence ; sinon modifier/effacer. */}
              <EditeurReferenceMairie references={detail.referencesMairie.map((rf) => rf.reference)} onAjouter={onAjouterRef} onModifier={onModifierRef} onSupprimer={onSupprimerRef} />
            </div>}
      </div>
      )}
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
