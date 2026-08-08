import type { CSSProperties } from 'react';
import type { EtatEcheance } from '../../../../lib/veille/echeance';
import type { LigneRun, DossierSuivi, ReponseARattacher, RelancePreparee, ReglagesReleve } from '../../../../lib/veille/reponsesSuivi';
import { MessageRetour, type RetourAction } from './DemandesRendu';

/**
 * R5a/R5b — rendu PUR de l'écran « Réponses » : aucun état, aucun effet → testable en Node via `renderToStaticMarkup`. Les
 * ACTIONS (R5b) sont des CALLBACKS fournis par la Vue ; le rendu reste pur. ⚠️ a11y : l'information est portée par le TEXTE
 * (libellés, phrases), la couleur n'est qu'un appui. L'état d'échéance est CALCULÉ par etatEcheance (côté Vue), affiché ici.
 *
 * RETOUR d'action (motif de DemandesRendu) : `RetourCible` porte une CLÉ d'emplacement ; `messageIci` n'affiche le message
 * qu'à l'emplacement correspondant → exactement UNE zone non nulle, jamais dédoublée (la Vue gère le repli dans le bandeau).
 */
export type RetourCible = { cle: string; texte: string; ok: boolean } | null;
export function messageIci(retour: RetourCible, cle: string): RetourAction {
  return retour && retour.cle === cle ? { texte: retour.texte, ok: retour.ok, zone: 'haut' } : null;
}

/** Option du sélecteur de demande (rattachement manuel) : jamais un id brut à saisir — référence + commune + date d'envoi. */
export interface OptionDemande { demandeId: number; reference: string; communeNom: string | null; envoyeLe: string | null }

const MS_HEURE = 3_600_000;
const styleCarte: CSSProperties = { fontSize: 13 };
const styleMuted: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
const styleTh: CSSProperties = { padding: '.4rem .5rem', textAlign: 'left' };
const styleTd: CSSProperties = { padding: '.4rem .5rem', verticalAlign: 'top' };

/** Durée lisible depuis un delta en ms (« 12 minutes », « 3 heures », « 3 jours »). Pur. */
export function dureeRelative(deltaMs: number): string {
  const min = Math.floor(deltaMs / 60_000);
  if (min < 1) return 'moins d’une minute';
  if (min < 60) return `${min} minute${min > 1 ? 's' : ''}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} heure${h > 1 ? 's' : ''}`;
  const j = Math.floor(h / 24);
  return `${j} jour${j > 1 ? 's' : ''}`;
}

/** Horodatage ISO → « AAAA-MM-JJ HH:MM » (déterministe, sans dépendance de fuseau pour les tests). */
export function formaterDateHeure(iso: string | null): string {
  return iso ? iso.replace('T', ' ').slice(0, 16) : '—';
}
/** Date ISO → « AAAA-MM-JJ ». */
export function formaterDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—';
}

/** Phrase explicative pour un bloc VIDE — jamais un tableau muet (rôle « note » pour lecteur d'écran). */
export function PhraseVide({ children }: { children: React.ReactNode }) {
  return <p role="note" style={{ ...styleMuted, margin: 0, fontStyle: 'italic' }}>{children}</p>;
}

// ── Bloc 1 : indicateur de fraîcheur de la relève ─────────────────────────────
/**
 * Indicateur FRANC de l'état de la relève (le plus important). Trois signaux distincts, portés par le TEXTE :
 *  - désactivée ; - jamais / trop ancienne (> releve_fraicheur_heures) : AVERTISSEMENT ; - fraîche : rassurant.
 */
export function IndicateurReleve({ active, derniereOkLe, fraicheurHeures, maintenant }: {
  active: boolean; derniereOkLe: string | null; fraicheurHeures: number; maintenant: Date;
}) {
  const base: CSSProperties = { ...styleCarte, borderLeft: '4px solid', padding: '.6rem .8rem', borderRadius: '.5rem' };
  const alerte: CSSProperties = { ...base, background: '#fdecec', borderLeftColor: 'var(--color-svv-red)', color: 'var(--color-svv-red)', fontWeight: 600 };
  const neutre: CSSProperties = { ...base, background: 'var(--color-svv-field)', borderLeftColor: 'var(--color-svv-muted)', color: 'var(--color-svv-ink)' };
  const ok: CSSProperties = { ...base, background: 'var(--color-svv-green-soft)', borderLeftColor: 'var(--color-svv-green-ink)', color: 'var(--color-svv-green-ink)' };

  if (!active) {
    return <div role="status" style={neutre}>Relève automatique désactivée : rien n’est relevé tout seul. Les échéances affichées ne peuvent pas être confirmées tant que la relève ne tourne pas (onglet Réglages).</div>;
  }
  if (derniereOkLe === null) {
    return <div role="status" style={alerte}>Aucune relève réussie à ce jour : les échéances affichées sont indéterminées, on ne peut pas affirmer qu’une mairie n’a pas répondu.</div>;
  }
  const age = maintenant.getTime() - new Date(derniereOkLe).getTime();
  const duree = dureeRelative(age);
  if (age > fraicheurHeures * MS_HEURE) {
    return <div role="status" style={alerte}>Aucune relève réussie depuis {duree} : les échéances affichées sont indéterminées, on ne peut pas affirmer qu’une mairie n’a pas répondu.</div>;
  }
  return <div role="status" style={ok}>Dernière relève réussie il y a {duree}.</div>;
}

/** Rappel LECTURE SEULE des réglages de relève en vigueur (le changement se fait dans l'onglet Réglages). */
export function RappelReglages({ reglages }: { reglages: ReglagesReleve }) {
  return (
    <p style={{ ...styleMuted, margin: '.4rem 0 0' }}>
      Réglages en vigueur : relève {reglages.active ? 'activée' : 'désactivée'} · intervalle {reglages.intervalleMinutes} min ·
      boîte relevée « {reglages.profil} » · fraîcheur exigée {reglages.fraicheurHeures} h. À modifier dans l’onglet Réglages.
    </p>
  );
}

/** Les 10 dernières lignes de releve_run (date, déclencheur, résultat, compteurs, erreur). Vide → phrase. */
export function TableRuns({ runs }: { runs: LigneRun[] }) {
  if (runs.length === 0) return <PhraseVide>Aucune relève enregistrée pour l’instant.</PhraseVide>;
  const cols = ['vus', 'déjà connus', 'hors périm.', 'retenus', 'rattachés', 'reb. détectés', 'reb. rattachés', 'reb. étrangers', 'reb. appliqués', 'enregistrées', 'pièces dép.', 'pièces non dép.'];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
            {['Démarrée', 'Déclencheur', 'Résultat', ...cols].map((h) => <th key={h} style={styleTh}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={`${r.demarreLe}-${i}`} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
              <td style={styleTd}>{formaterDateHeure(r.demarreLe)}</td>
              <td style={styleTd}>{r.declencheur}</td>
              <td style={styleTd}>
                <span style={{ fontWeight: 600, color: r.resultat === 'erreur' ? 'var(--color-svv-red)' : r.resultat === 'ok' ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)' }}>{r.resultat}</span>
                {r.resultat === 'erreur' && r.erreur ? <div role="alert" style={{ color: 'var(--color-svv-red)', fontSize: 11 }}>{r.erreur}</div> : null}
              </td>
              {[r.vus, r.dejaConnus, r.horsPerimetre, r.retenus, r.rattaches, r.rebondsDetectes, r.rebondsRattaches, r.rebondsEtrangers, r.rebondsAppliques, r.enregistrees, r.piecesDeposees, r.piecesNonDeposees]
                .map((v, j) => <td key={j} style={{ ...styleTd, textAlign: 'right' }}>{v ?? '·'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bloc 2 : états d'échéance (présentation) ──────────────────────────────────
/** Table de PRÉSENTATION des états (libellés distincts + couleurs). La DÉCISION vient d'etatEcheance (jamais recopiée). */
export const ETAT_LABELS: Record<EtatEcheance, { libelle: string; fond: string; couleur: string }> = {
  non_delivree: { libelle: 'Non délivrée', fond: 'var(--color-svv-field)', couleur: 'var(--color-svv-muted)' },
  repondue: { libelle: 'Répondue', fond: 'var(--color-svv-green-soft)', couleur: 'var(--color-svv-green-ink)' },
  repondue_partiellement: { libelle: 'Partiellement répondue', fond: '#fff4e0', couleur: '#8a5a00' },
  indeterminee: { libelle: 'Indéterminée', fond: '#fff4e0', couleur: '#8a5a00' },
  depassee: { libelle: 'Échéance dépassée', fond: '#fdecec', couleur: 'var(--color-svv-red)' },
  proche: { libelle: 'Échéance proche', fond: '#fff4e0', couleur: '#8a5a00' },
  en_cours: { libelle: 'Délai en cours', fond: 'var(--color-svv-field)', couleur: 'var(--color-svv-ink)' },
};

/** Badge d'un état d'échéance : libellé (TEXTE, la couleur n'est qu'un appui) + motif lisible en dessous. */
export function BadgeEtat({ etat, motif }: { etat: EtatEcheance; motif?: string }) {
  const l = ETAT_LABELS[etat];
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, padding: '.1rem .45rem', borderRadius: '.35rem', background: l.fond, color: l.couleur, whiteSpace: 'nowrap' }}>{l.libelle}</span>
      {motif ? <span style={{ ...styleMuted, lineHeight: 1.35 }}>{motif}</span> : null}
    </div>
  );
}

/** Compte de dossiers satisfaits sur total (« 2 / 5 ») — le TEXTE porte l'information. */
export function CompteSatisfaction({ satisfaits, total }: { satisfaits: number; total: number }) {
  const complet = total > 0 && satisfaits >= total;
  return <span style={{ fontWeight: 600, color: complet ? 'var(--color-svv-green-ink)' : 'var(--color-svv-ink)' }}>{satisfaits} / {total}</span>;
}

/** Détail des dossiers d'une demande (dépliant) : numéro, adresse si connue, satisfait/dû et par quoi. */
export function DetailDossiers({ demandeId, statut, dossiers, retour, onMarquer }: {
  demandeId: number; statut: string; dossiers: DossierSuivi[]; retour?: RetourCible;
  onMarquer?: (demandeId: number, dossierId: number, satisfait: boolean) => void;
}) {
  if (dossiers.length === 0) return <PhraseVide>Aucun dossier rattaché à cette demande.</PhraseVide>;
  // R5b — garde-fou : demande close → on ne marque/démarque rien (message explicite, jamais un bouton inerte).
  const close = statut === 'close';
  return (
    <ul style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem', fontSize: 12, lineHeight: 1.6 }}>
      {dossiers.map((d) => {
        const m = messageIci(retour ?? null, `dossier-${demandeId}-${d.dossierId}`);
        return (
          <li key={d.dossierId}>
            <span style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.numDau}</span>
            {d.adresse ? ` — ${d.adresse}` : ''}
            {' — '}
            {d.satisfait
              ? <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>obtenu{d.satisfaitPar ? ` (${d.satisfaitPar})` : ''}</span>
              : <span style={{ color: 'var(--color-svv-muted)' }}>dû</span>}
            {!close && onMarquer && (
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .4rem', marginLeft: '.4rem' }}
                onClick={() => onMarquer(demandeId, d.dossierId, !d.satisfait)}>
                {d.satisfait ? 'annuler' : 'marquer reçu'}
              </button>
            )}
            {m && <span style={{ marginLeft: '.4rem' }}><MessageRetour r={m} /></span>}
          </li>
        );
      })}
      {close && <li style={{ ...styleMuted, listStyle: 'none', marginLeft: '-1.1rem' }}>Demande close : le marquage des dossiers est désactivé (rouvrir la demande d’abord — chantier ultérieur).</li>}
    </ul>
  );
}

// ── Bloc 3 : file « à rattacher » (R5b : rattacher / traiter / télécharger) ────────────────────────────────────────────
/** Table de la file « à rattacher ». Vide → phrase explicative, JAMAIS un tableau muet. Les actions sont des callbacks. */
export function BlocARattacher({ reponses, demandes, selection, retour, onChoisir, onRattacher, onTraiter, onTelecharger }: {
  reponses: ReponseARattacher[];
  demandes?: OptionDemande[];
  selection?: Record<number, number>;
  retour?: RetourCible;
  onChoisir?: (reponseId: number, demandeId: number) => void;
  onRattacher?: (reponseId: number) => void;
  onTraiter?: (reponseId: number) => void;
  onTelecharger?: (reponseId: number, pieceId: number) => void;
}) {
  if (reponses.length === 0) return <PhraseVide>Aucune réponse en attente de rattachement.</PhraseVide>;
  const options = demandes ?? [];
  const actif = onRattacher !== undefined; // false = rendu lecture seule (compat)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
            {['Reçu le', 'Expéditeur', 'Objet', 'Pièces', 'Motif', ...(actif ? ['Rattacher à…'] : [])].map((h) => <th key={h} style={styleTh}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {reponses.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
              <td style={styleTd}>{formaterDateHeure(r.recuLe)}</td>
              <td style={styleTd}>{r.deNom ? `${r.deNom} · ` : ''}{r.deAdresse}</td>
              <td style={styleTd}>{r.objet ?? '(sans objet)'}</td>
              <td style={styleTd}>
                {r.pieces.length === 0 ? <span style={styleMuted}>aucune</span> : (
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: 12 }}>
                    {r.pieces.map((p) => (
                      <li key={p.id}>
                        {p.nomFichier} —{' '}
                        {p.stockee
                          ? (onTelecharger
                            ? <button type="button" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }} onClick={() => onTelecharger(r.id, p.id)}>télécharger</button>
                            : <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>stockée</span>)
                          : <span style={{ color: 'var(--color-svv-red)' }}>non stockée{p.motif ? ` (${p.motif})` : ''}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td style={styleTd}>{r.rattachementMethode}</td>
              {actif && (
                <td style={styleTd}>
                  <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select aria-label={`Demande pour la réponse ${r.id}`} value={selection?.[r.id] ?? ''} onChange={(e) => onChoisir?.(r.id, Number(e.target.value))}
                      style={{ padding: '.25rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 12, maxWidth: 260 }}>
                      <option value="">— choisir une demande —</option>
                      {options.map((o) => <option key={o.demandeId} value={o.demandeId}>{o.reference} · {o.communeNom ?? ''} · {formaterDate(o.envoyeLe)}</option>)}
                    </select>
                    <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.25rem .6rem' }} disabled={!selection?.[r.id]} onClick={() => onRattacher?.(r.id)}>Rattacher</button>
                    <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.25rem .6rem' }} onClick={() => onTraiter?.(r.id)}>Traitée</button>
                    <MessageRetour r={messageIci(retour ?? null, `rattacher-${r.id}`)} />
                    <MessageRetour r={messageIci(retour ?? null, `traiter-${r.id}`)} />
                    <MessageRetour r={messageIci(retour ?? null, `piece-${r.id}`)} />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bloc 4 : relances préparées ───────────────────────────────────────────────
/** Carte d'un brouillon de relance : en-tête + corps CONSULTABLE dans un dépliant. LECTURE SEULE (aucun champ, aucun bouton). */
export function RelanceCarte({ relance, ouvert, id }: { relance: RelancePreparee; ouvert: boolean; id?: string }) {
  return (
    <article id={id} className="svv-card flex flex-col gap-1" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{relance.communeNom ?? relance.reference ?? `demande ${relance.demandeId}`}</strong>
        <span style={styleMuted}>{relance.reference ?? `demande ${relance.demandeId}`} · générée le {formaterDateHeure(relance.genereeLe)}</span>
      </div>
      <div style={{ fontSize: 13 }}>{relance.objet}</div>
      {ouvert
        ? <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '.3rem 0 0', padding: '.5rem', background: 'var(--color-svv-field)', borderRadius: '.4rem', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12 }}>{relance.corps}</pre>
        : null}
    </article>
  );
}
