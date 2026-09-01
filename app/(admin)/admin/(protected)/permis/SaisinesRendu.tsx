import type { CSSProperties, ReactNode } from 'react';
import type {
  SaisissableAffichee, IndetermineeAffichee, SaisineEnCours, SaisineRecue, SaisineAbandonnee, FileDepotSaisine,
} from '../../../../lib/veille/saisinesSuivi';
import { PhraseVide, formaterDate, messageIci, type RetourCible } from './ReponsesRendu';
import { MessageRetour } from './DemandesRendu';

/**
 * X4 — rendu PUR de l'onglet « Saisines CADA » : aucun état, aucun effet → testable en Node via `renderToStaticMarkup`. Les
 * ACTIONS sont des CALLBACKS fournis par la Vue. ⚠️ a11y : l'information est portée par le TEXTE (libellés, phrases), la
 * couleur n'est qu'un appui ; cibles tactiles suffisantes ; aucune interaction au survol seul. Mise en page en CARTES (pas de
 * grande table) → utilisable sur smartphone en portrait. Aucune section muette : une section vide affiche POURQUOI elle l'est.
 * Aucune transition ajoutée → rien à neutraliser pour prefers-reduced-motion.
 */

// Seuil d'AFFICHAGE (pas une constante de calcul) : en deçà, les jours restants sont signalés distinctement (urgence).
export const SEUIL_JOURS_FORCLUSION_PROCHE = 7;

/** Libellés FR du sens d'un avis CADA (liste fermée, miroir du CHECK avis_sens). Repli = valeur brute si inattendue. */
export const SENS_AVIS_LABELS: Record<string, string> = { favorable: 'favorable', defavorable: 'défavorable', sans_suite: 'sans suite' };
/** Options du sélecteur d'avis (défini ICI, côté client, pour ne PAS importer un module serveur dans le bundle). */
export const OPTIONS_AVIS: { valeur: string; libelle: string }[] = [
  { valeur: 'favorable', libelle: 'favorable' },
  { valeur: 'defavorable', libelle: 'défavorable' },
  { valeur: 'sans_suite', libelle: 'sans suite' },
];

const styleH2: CSSProperties = { fontSize: 15, fontWeight: 700, margin: 0 };
const styleMuted: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const styleRef: CSSProperties = { fontFamily: 'var(--font-svv-mono, monospace)', fontWeight: 600, fontSize: 13 };
const btnMin: CSSProperties = { padding: '.4rem .7rem', minHeight: '2.2rem' }; // cible tactile

/** Ligne d'identité d'une saisine/demande : référence (mono) + commune. Le TEXTE porte tout. */
function EnteteItem({ reference, communeNom }: { reference: string; communeNom: string | null }) {
  return (
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={styleRef}>{reference}</span>
      <span style={styleMuted}>{communeNom ?? '(commune inconnue)'}</span>
    </div>
  );
}

/**
 * Lot 5b (B) — statut explicite d'une saisine (« envoyée le… » vs « déposée le… », « à lancer », etc.) + les NUMÉROS DE PERMIS
 * concernés (jamais seulement la référence interne). Le TEXTE porte tout ; la pastille n'est qu'un appui visuel.
 */
function StatutEtPermis({ statut, numeros }: { statut: string; numeros: string[] }) {
  return (
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 12, fontWeight: 700, padding: '.15rem .5rem', borderRadius: '.35rem',
        background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' }}>{statut}</span>
      <span style={styleMuted}>
        {numeros.length > 0 ? `Permis : ${numeros.join(', ')}` : 'Aucun numéro de permis rattaché'}
      </span>
    </div>
  );
}

/** Jours avant forclusion : signalé DISTINCTEMENT (rouge/gras + mot « urgent ») quand il en reste peu. Le TEXTE porte l'info. */
export function JoursForclusion({ jours, forclusionLe }: { jours: number; forclusionLe: string | null }) {
  const proche = jours <= SEUIL_JOURS_FORCLUSION_PROCHE;
  const date = forclusionLe ? ` (forclusion le ${formaterDate(forclusionLe)})` : '';
  const txt = jours <= 0
    ? `Dernier jour pour saisir${date}`
    : `${proche ? 'Urgent : plus que ' : 'Encore '}${jours} jour${jours > 1 ? 's' : ''} avant forclusion${date}`;
  return (
    <span role={proche ? 'alert' : undefined}
      style={{ fontSize: 12, fontWeight: proche ? 700 : 500, color: proche ? 'var(--color-svv-red)' : 'var(--color-svv-ink)',
        background: proche ? 'var(--color-svv-red-soft)' : 'var(--color-svv-field)', padding: '.15rem .5rem', borderRadius: '.35rem', alignSelf: 'flex-start' }}>
      {txt}
    </span>
  );
}

// ── Section 1a : demandes SAISISSABLES (bouton « Lancer la demande CADA ») ──────────────────────────────────────────────
/**
 * Une demande saisissable : identité, jours avant forclusion (signalés si peu), dossiers dus, puis la CONSÉQUENCE du clic
 * annoncée EN CLAIR (motif R5c) AVANT le bouton « Lancer la demande CADA ». Le message de conséquence dépend du canal :
 * e-mail immédiat (copie en PJ) si une adresse CADA est configurée, sinon mise en file de dépôt (saisie manuelle).
 */
export function CarteSaisissable({ d, cadaEmailVide, retour, onLancer }: {
  d: SaisissableAffichee; cadaEmailVide: boolean; retour?: RetourCible; onLancer?: (demandeId: number) => void;
}) {
  return (
    <article className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <EnteteItem reference={d.reference} communeNom={d.communeNom} />
      <StatutEtPermis statut={d.statut} numeros={d.numeros} />
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <JoursForclusion jours={d.joursAvantForclusion} forclusionLe={d.forclusionLe} />
        {/* T1 — la VOIE d'entrée CADA, distincte : refus exprès (notifié) vs refus tacite (silence d'un mois). */}
        <span style={styleMuted}>
          {d.voie === 'refus_expres' ? 'Refus exprès notifié le' : 'Refus tacite le'} {formaterDate(d.refusTaciteLe)} · demande envoyée le {formaterDate(d.envoyeLe)}
        </span>
      </div>
      <span style={{ fontSize: 13 }}>
        {d.dossiersDus} dossier{d.dossiersDus > 1 ? 's' : ''} encore dû{d.dossiersDus > 1 ? 's' : ''} à réclamer devant la CADA.
        {/* T1/Correction 3 — mention EXPLICITE des dossiers exclus du corps (jamais une omission muette). */}
        {d.dossiersExclusRefusNonAcquis > 0 && (
          <span role="note" style={{ ...styleMuted, display: 'block', marginTop: '.25rem', color: 'var(--color-svv-red)' }}>
            {d.dossiersExclusRefusNonAcquis} dossier{d.dossiersExclusRefusNonAcquis > 1 ? 's' : ''} non inclus : refus pas encore acquis (encore dans le mois de silence). La saisine ne portera que sur les dossiers dont le refus est acquis.
          </span>
        )}
      </span>
      <p role="note" style={{ ...styleMuted, margin: 0, lineHeight: 1.4 }}>
        {cadaEmailVide
          ? 'Lancer préparera la saisine et la placera dans la file de dépôt : aucune adresse CADA n’est configurée, il faudra la déposer à la main sur le formulaire en ligne.'
          : 'Lancer enverra immédiatement la saisine à la CADA, avec la copie de la demande initiale en pièce jointe.'}
      </p>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {onLancer && (
          <button type="button" className="svv-btn svv-btn-primary" style={btnMin} onClick={() => onLancer(d.demandeId)}>
            Lancer la demande CADA
          </button>
        )}
        <MessageRetour r={messageIci(retour ?? null, `lancer-${d.demandeId}`)} />
      </div>
    </article>
  );
}

export function SectionSaisissables({ saisissables, cadaEmailVide, retour, onLancer }: {
  saisissables: SaisissableAffichee[]; cadaEmailVide: boolean; retour?: RetourCible; onLancer?: (demandeId: number) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 style={styleH2}>Demandes CADA possibles</h2>
      {saisissables.length === 0 ? (
        <PhraseVide>Aucune demande n’est actuellement saisissable : soit le refus tacite d’un mois n’est pas encore acquis, soit le délai de saisine (deux mois) est forclos, soit tous les dossiers ont déjà été marqués reçus.</PhraseVide>
      ) : (
        saisissables.map((d) => <CarteSaisissable key={d.demandeId} d={d} cadaEmailVide={cadaEmailVide} retour={retour} onLancer={onLancer} />)
      )}
    </section>
  );
}

// ── Section 1b : demandes INDÉTERMINÉES (PAS de bouton, la raison + renvoi vers la relève) ──────────────────────────────
export function SectionIndeterminees({ indeterminees }: { indeterminees: IndetermineeAffichee[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 style={styleH2}>En attente de vérification (relève)</h2>
      {indeterminees.length === 0 ? (
        <PhraseVide>Aucune demande en attente : la relève des réponses est assez récente pour statuer sur toutes les demandes ci-dessus.</PhraseVide>
      ) : (
        indeterminees.map((d) => (
          <article key={d.demandeId} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
            <EnteteItem reference={d.reference} communeNom={d.communeNom} />
            {/* PAS de bouton : on n'affiche jamais une action inerte. La raison est explicite + renvoi vers la relève. */}
            <p role="note" style={{ ...styleMuted, margin: 0, lineHeight: 1.4 }}>{d.raison}</p>
          </article>
        ))
      )}
    </section>
  );
}

// ── Section 2 : saisines LANCÉES / EN COURS (enregistrer l'avis, abandonner) ────────────────────────────────────────────
export function SectionEnCours({ enCours, retour, sensAvis, onSens, onEnregistrerAvis, onAbandonner }: {
  enCours: SaisineEnCours[]; retour?: RetourCible;
  sensAvis?: Record<number, string>;
  onSens?: (saisineId: number, v: string) => void;
  onEnregistrerAvis?: (saisineId: number) => void;
  onAbandonner?: (saisineId: number) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 style={styleH2}>Saisines en cours</h2>
      {enCours.length === 0 ? (
        <PhraseVide>Aucune saisine en cours : aucune n’a encore été envoyée à la CADA, ou toutes ont déjà reçu leur avis.</PhraseVide>
      ) : (
        enCours.map((s) => (
          <article key={s.saisineId} className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
            <EnteteItem reference={s.reference} communeNom={s.communeNom} />
            <StatutEtPermis statut={s.statut} numeros={s.numeros} />
            <span style={styleMuted}>Saisine envoyée le {formaterDate(s.envoyeeLe)} · en attente de l’avis de la CADA (un mois, prorogeable).</span>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={styleMuted} htmlFor={`avis-${s.saisineId}`}>Avis reçu :</label>
              <select id={`avis-${s.saisineId}`} value={sensAvis?.[s.saisineId] ?? ''} onChange={(e) => onSens?.(s.saisineId, e.target.value)}
                style={{ ...btnMin, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 }}>
                <option value="">— sens de l’avis —</option>
                {OPTIONS_AVIS.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
              </select>
              {onEnregistrerAvis && (
                <button type="button" className="svv-btn svv-btn-primary" style={btnMin} disabled={!sensAvis?.[s.saisineId]} onClick={() => onEnregistrerAvis(s.saisineId)}>
                  Enregistrer l’avis
                </button>
              )}
              {onAbandonner && (
                <button type="button" className="svv-btn svv-btn-outline" style={btnMin} onClick={() => onAbandonner(s.saisineId)}>Abandonner</button>
              )}
              <MessageRetour r={messageIci(retour ?? null, `avis-${s.saisineId}`)} />
              <MessageRetour r={messageIci(retour ?? null, `abandon-${s.saisineId}`)} />
            </div>
          </article>
        ))
      )}
    </section>
  );
}

// ── Section 3 : avis REÇUS (lecture seule, le sens de l'avis) ───────────────────────────────────────────────────────────
export function SectionRecues({ recues }: { recues: SaisineRecue[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 style={styleH2}>Avis CADA reçus</h2>
      {recues.length === 0 ? (
        <PhraseVide>Aucun avis CADA reçu pour l’instant.</PhraseVide>
      ) : (
        recues.map((s) => {
          const sens = s.avisSens ? (SENS_AVIS_LABELS[s.avisSens] ?? s.avisSens) : 'non précisé';
          const fav = s.avisSens === 'favorable';
          return (
            <article key={s.saisineId} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
              <EnteteItem reference={s.reference} communeNom={s.communeNom} />
              <StatutEtPermis statut={s.statut} numeros={s.numeros} />
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '.15rem .5rem', borderRadius: '.35rem',
                  background: fav ? 'var(--color-svv-green-soft)' : 'var(--color-svv-field)',
                  color: fav ? 'var(--color-svv-green-ink)' : 'var(--color-svv-ink)' }}>Avis {sens}</span>
                <span style={styleMuted}>reçu le {formaterDate(s.avisRecuLe)} · saisine envoyée le {formaterDate(s.envoyeeLe)}</span>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}

// ── Section 4 : saisines ABANDONNÉES (lecture seule) ───────────────────────────────────────────────────────────────────
export function SectionAbandonnees({ abandonnees }: { abandonnees: SaisineAbandonnee[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 style={styleH2}>Saisines abandonnées</h2>
      {abandonnees.length === 0 ? (
        <PhraseVide>Aucune saisine abandonnée.</PhraseVide>
      ) : (
        abandonnees.map((s) => (
          <article key={s.saisineId} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
            <EnteteItem reference={s.reference} communeNom={s.communeNom} />
            <StatutEtPermis statut={s.statut} numeros={s.numeros} />
            <span style={styleMuted}>Abandonnée · préparée le {formaterDate(s.genereeLe)}. La demande redevient saisissable si la fenêtre CADA est encore ouverte.</span>
          </article>
        ))
      )}
    </section>
  );
}

// ── File de dépôt (dépôt manuel sur le formulaire) — visible quand cada_email est vide, ou s'il reste des brouillons ──────
/**
 * File de dépôt. VISIBLE quand aucune adresse CADA n'est configurée (mode de saisie normal : dépôt manuel), OU quand il reste
 * des brouillons dont l'envoi automatique n'a pas abouti (jamais orphelins). Retourne `null` sinon (canal e-mail, rien à
 * finaliser) → « n'apparaît que si cada_email est vide » dans le cas nominal. Chaque item : corps à copier + URL du formulaire.
 */
export function SectionFileDepot({ items, cadaEmailVide, urlFormulaire, retour, onMarquerDeposee, onAbandonner, renderExtra }: {
  items: FileDepotSaisine[]; cadaEmailVide: boolean; urlFormulaire: string; retour?: RetourCible;
  onMarquerDeposee?: (saisineId: number) => void; onAbandonner?: (saisineId: number) => void;
  // CADA lot A — encart interactif optionnel par saisine (carte de copier-coller). Optionnel → SectionFileDepot reste PUR/testable.
  renderExtra?: (s: FileDepotSaisine) => ReactNode;
}) {
  if (!cadaEmailVide && items.length === 0) return null; // canal e-mail nominal : rien à déposer
  return (
    <section className="flex flex-col gap-2">
      <h2 style={styleH2}>{cadaEmailVide ? 'À saisir sur le formulaire CADA' : 'Saisines préparées — envoi à finaliser'}</h2>
      <p role="note" style={{ ...styleMuted, margin: 0, lineHeight: 1.4 }}>
        {cadaEmailVide
          ? <>Aucune adresse e-mail CADA n’est configurée : déposez ces saisines à la main sur le formulaire en ligne, puis marquez-les « déposée ». Formulaire : <a href={urlFormulaire} target="_blank" rel="noopener noreferrer">{urlFormulaire}</a></>
          : 'L’envoi automatique n’a pas abouti : déposez-les à la main (ou réessayez plus tard), puis marquez-les « déposée », ou abandonnez-les.'}
      </p>
      {items.length === 0 ? (
        <PhraseVide>Aucune saisine à déposer pour l’instant.</PhraseVide>
      ) : (
        items.map((s) => (
          <article key={s.saisineId} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
            <EnteteItem reference={s.reference} communeNom={s.communeNom} />
            <StatutEtPermis statut={s.statut} numeros={s.numeros} />
            <div style={{ fontSize: 13 }}>{s.objet}</div>
            <details>
              <summary style={{ ...styleMuted, cursor: 'pointer' }}>voir / copier le corps de la saisine</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '.3rem 0 0', padding: '.5rem', background: 'var(--color-svv-field)', borderRadius: '.4rem', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12 }}>{s.corps}</pre>
            </details>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {onMarquerDeposee && (
                <button type="button" className="svv-btn svv-btn-primary" style={btnMin} onClick={() => onMarquerDeposee(s.saisineId)}>Marquer déposée</button>
              )}
              {onAbandonner && (
                <button type="button" className="svv-btn svv-btn-outline" style={btnMin} onClick={() => onAbandonner(s.saisineId)}>Abandonner</button>
              )}
              <MessageRetour r={messageIci(retour ?? null, `deposee-${s.saisineId}`)} />
              <MessageRetour r={messageIci(retour ?? null, `abandon-${s.saisineId}`)} />
            </div>
            {renderExtra && renderExtra(s)}
          </article>
        ))
      )}
    </section>
  );
}
