import type { CSSProperties } from 'react';
import type { EtatEcheance } from '../../../../lib/veille/echeance';
import type { LigneRun, DossierSuivi, ReponseARattacher, RelancePreparee, ReglagesReleve } from '../../../../lib/veille/reponsesSuivi';

/**
 * R5a — rendu PUR de l'écran « Réponses » (suivi de la boucle CRPA) : aucun état, aucun effet → testable en Node via
 * `renderToStaticMarkup`. LECTURE SEULE (aucune action, aucun champ éditable). ⚠️ a11y : l'information est portée par le
 * TEXTE (libellés, phrases), la couleur n'est qu'un appui. L'état d'échéance est CALCULÉ par etatEcheance (côté Vue) et
 * seulement AFFICHÉ ici : ETAT_LABELS est une table de présentation, pas une règle.
 */
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
  const cols = ['vus', 'déjà connus', 'hors périm.', 'retenus', 'rattachés', 'reb. détectés', 'reb. rattachés', 'reb. étrangers', 'reb. appliqués', 'enregistrées'];
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
              {[r.vus, r.dejaConnus, r.horsPerimetre, r.retenus, r.rattaches, r.rebondsDetectes, r.rebondsRattaches, r.rebondsEtrangers, r.rebondsAppliques, r.enregistrees]
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
export function DetailDossiers({ dossiers }: { dossiers: DossierSuivi[] }) {
  if (dossiers.length === 0) return <PhraseVide>Aucun dossier rattaché à cette demande.</PhraseVide>;
  return (
    <ul style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem', fontSize: 12, lineHeight: 1.5 }}>
      {dossiers.map((d) => (
        <li key={d.numDau}>
          <span style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.numDau}</span>
          {d.adresse ? ` — ${d.adresse}` : ''}
          {' — '}
          {d.satisfait
            ? <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>obtenu{d.satisfaitPar ? ` (${d.satisfaitPar})` : ''}</span>
            : <span style={{ color: 'var(--color-svv-muted)' }}>dû</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Bloc 3 : file « à rattacher » ─────────────────────────────────────────────
/** Table de la file « à rattacher ». Vide → phrase explicative, JAMAIS un tableau muet. */
export function BlocARattacher({ reponses }: { reponses: ReponseARattacher[] }) {
  if (reponses.length === 0) return <PhraseVide>Aucune réponse en attente de rattachement.</PhraseVide>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
            {['Reçu le', 'Expéditeur', 'Objet', 'Pièces', 'Motif de non-rattachement'].map((h) => <th key={h} style={styleTh}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {reponses.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
              <td style={styleTd}>{formaterDateHeure(r.recuLe)}</td>
              <td style={styleTd}>{r.deNom ? `${r.deNom} · ` : ''}{r.deAdresse}</td>
              <td style={styleTd}>{r.objet ?? '(sans objet)'}</td>
              <td style={{ ...styleTd, textAlign: 'right' }}>{r.nbPieces}</td>
              <td style={styleTd}>{r.rattachementMethode}</td>
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
