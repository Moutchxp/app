'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { PARAMS_VEILLE } from '../../../../lib/sitadel/reglagesVeille';
import { ETIQUETTE_PROFIL } from '../../../../lib/sitadel/demande';
import type { ConfigVeille } from '../../../../lib/sitadel/veilleConfig';

/**
 * Lot 3 (carrousel Téléservice) — RÉSUMÉ des critères qui décident quelles cartes apparaissent, sous le compteur et au-dessus du
 * carrousel. DEUX familles traitées DIFFÉREMMENT :
 *  ① PROPRES au téléservice (plafond mensuel, dossiers par dépôt, profil par défaut) → réglables ICI, en écriture, par le chemin
 *     EXISTANT des Réglages (PATCH /reglages → validerReglages). Les MODIFIER ne touche QUE le rail Téléservice.
 *  ② PARTAGÉS avec le rail E-mail (ancienneté maximale, ordre d'examen, profondeur d'examen) → AFFICHÉS EN LECTURE SEULE, avec la
 *     mention qu'ils valent aussi pour l'E-mail + un renvoi vers l'onglet Réglages. 🔴 Non éditables ici (on ne change pas l'E-mail
 *     à l'insu d'Arno depuis l'écran Téléservice).
 *
 * Écriture : aucun nouvel endpoint, aucune nouvelle fonction d'écriture, aucune migration. Bornes lues des CHECK (renvoyées par
 * GET /reglages), JAMAIS recopiées en dur. Après enregistrement, on rafraîchit par le signal EXISTANT (`onChangement`) → compteur +
 * carrousel + ce résumé (via `signalRafraichir`). Valeur hors bornes refusée AVANT l'appel. 401/403 → « reconnectez-vous ».
 * Rédigé pour un non-développeur : chaque critère est une phrase concrète, jamais un nom de variable. Mobile-first, texte (jamais
 * la couleur seule), REPLIÉ par défaut (<details> fermé au montage, comme les autres blocs repliables de l'écran). Purement additif.
 */
type Bornes = Record<string, { min: number; max: number }>;
interface EtatReglages { veille: ConfigVeille; bornes: Bornes }

const styleChamp: CSSProperties = { padding: '.25rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 13, width: '4.5rem' };
const styleLigne: CSSProperties = { fontSize: 13, display: 'block', margin: '.15rem 0' };
const styleAide: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleErr: CSSProperties = { color: 'var(--color-svv-red)', fontWeight: 600 };

/** Colonne DB d'un critère via son `cle` (source unique PARAMS_VEILLE) — jamais recopiée en dur. */
const colonneDe = (cle: keyof ConfigVeille): string => PARAMS_VEILLE.find((p) => p.cle === cle)?.colonne ?? '';
/** Libellés FR de l'ordre d'examen (source unique PARAMS_VEILLE) — pour l'affichage lecture seule du critère partagé. */
const TRI_LABELS: Record<string, string> = PARAMS_VEILLE.find((p) => p.cle === 'triCandidats')?.optionsEnumLabels ?? {};

/**
 * PUR — message si l'entier `v` est hors des bornes CHECK `b`, sinon `null`. Bornes absentes → pas de contrôle client (le serveur
 * tranchera). Sert au refus AVANT l'appel réseau. Testable sans DOM.
 */
export function messageHorsBornes(v: number, b?: { min: number; max: number }): string | null {
  if (!Number.isInteger(v)) return 'nombre entier attendu';
  if (!b) return null;
  if (v < b.min || v > b.max) return `valeur hors bornes (${b.min}–${b.max})`;
  return null;
}

export function ResumeCriteresTeleservice({ signalRafraichir, onChangement, onAllerReglages }: {
  signalRafraichir: number; onChangement: () => void; onAllerReglages: () => void;
}) {
  const [etat, setEtat] = useState<EtatReglages | null>(null);
  const [erreurChargement, setErreurChargement] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({}); // colonne → valeur saisie (tant qu'on n'a pas enregistré)
  const [messages, setMessages] = useState<Record<string, string>>({}); // erreurs de champ (par colonne)
  const [avis, setAvis] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Chargement (config + bornes) au montage et à chaque signal (préparation / dépôt / annulation / enregistrement d'un critère).
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reglages', { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setErreurChargement(res.status === 401 || res.status === 403 ? 'Session expirée — reconnectez-vous.' : 'Critères indisponibles.'); return; }
        const d = (await res.json()) as EtatReglages;
        setEtat(d); setEdits({}); setMessages({}); setAvis(''); setErreurChargement('');
      } catch { if (!annule) setErreurChargement('Critères indisponibles.'); }
    })();
    return () => { annule = true; };
  }, [signalRafraichir]);

  async function enregistrer(): Promise<void> {
    if (!etat) return;
    const { bornes } = etat;
    const patch: Record<string, number | string | boolean> = {};
    const errs: Record<string, string> = {};
    // Entiers propres au téléservice : validés AVANT l'appel contre les bornes CHECK (jamais une erreur brute de la base).
    for (const cle of ['teleservicePermisParCommuneParMois', 'teleserviceDossiersParDepot'] as const) {
      const col = colonneDe(cle);
      if (edits[col] === undefined) continue; // champ non touché
      const v = Number(edits[col]);
      const m = messageHorsBornes(v, bornes[col]);
      if (m) { errs[col] = m; continue; }
      patch[col] = v;
    }
    // Profil (liste fermée) : membre de optionsEnum, sinon refus.
    {
      const cle = 'teleserviceProfilDemandeurDefaut' as const;
      const col = colonneDe(cle);
      if (edits[col] !== undefined) {
        const options = PARAMS_VEILLE.find((p) => p.cle === cle)?.optionsEnum ?? [];
        if (!options.includes(edits[col])) errs[col] = 'valeur hors liste'; else patch[col] = edits[col];
      }
    }
    // Verrou « référence mairie » (booléen) : coché/décoché → true/false. Envoyé SEULEMENT si l'utilisateur y a touché (validerReglages attend un vrai booléen).
    {
      const col = colonneDe('teleserviceVerrouReferenceActif');
      if (edits[col] !== undefined) patch[col] = edits[col] === 'true';
    }
    setMessages(errs);
    if (Object.keys(errs).length > 0) { setAvis(''); return; }              // refusé AVANT l'appel
    if (Object.keys(patch).length === 0) { setAvis('Aucune modification à enregistrer.'); return; }
    setEnCours(true); setAvis('');
    try {
      const res = await fetch('/api/admin/permis/reglages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ veille: patch }) });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { setAvis('Session expirée — reconnectez-vous.'); return; }
        const d = (await res.json().catch(() => ({}))) as { erreurs?: { colonne: string; message: string }[] };
        if (d.erreurs?.length) { const m: Record<string, string> = {}; for (const e of d.erreurs) m[e.colonne] = e.message; setMessages(m); }
        else setAvis('Enregistrement refusé.');
        return;
      }
      setAvis('Critères mis à jour.');
      onChangement(); // signal EXISTANT → compteur + carrousel + ce résumé (via signalRafraichir) se rafraîchissent ; `edits` remis à zéro au rechargement
    } catch { setAvis('Enregistrement impossible.'); }
    finally { setEnCours(false); }
  }

  if (erreurChargement) return <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--color-svv-red)' }}>{erreurChargement}</p>;
  if (!etat) return <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--color-svv-muted)' }}>Chargement des critères…</p>;
  const { veille, bornes } = etat;

  const champEntier = (cle: 'teleservicePermisParCommuneParMois' | 'teleserviceDossiersParDepot', valeur: number, avant: string, apres: string) => {
    const col = colonneDe(cle); const b = bornes[col];
    return (
      <label style={styleLigne}>
        {avant}{' '}
        <input type="number" inputMode="numeric" min={b?.min} max={b?.max} value={edits[col] ?? String(valeur)}
          aria-label={`${avant} … ${apres}`.trim()}
          onChange={(e) => setEdits((s) => ({ ...s, [col]: e.target.value }))} style={styleChamp} />{' '}
        {apres}
        {messages[col] && <span role="alert" style={styleErr}> — {messages[col]}</span>}
      </label>
    );
  };

  const colProfil = colonneDe('teleserviceProfilDemandeurDefaut');
  const colVerrou = colonneDe('teleserviceVerrouReferenceActif');
  const verrouCoche = edits[colVerrou] !== undefined ? edits[colVerrou] === 'true' : veille.teleserviceVerrouReferenceActif;

  // §2 — ligne de titre repliable UNIFIÉE : le <summary> adopte `.svv-repli-titre` (+ chevron ▸/▾ en CSS via [open]) → même apparence,
  //   survol, focus et cible ≥44px que BlocRepliable. On retire `svv-card` (le bordé de la ligne suffit ; pas de double bordure) : ce bloc
  //   NEUTRE rejoint la famille « ligne encadrée » (moteur, bascule, ancienneté). Reste un <details> natif : PAS de conversion en React
  //   (le comportement — contenu monté même replié, fetch au montage — ne doit pas changer).
  return (
    <details style={{ fontSize: 13 }}>
      <summary className="svv-repli-titre">
        <span aria-hidden className="svv-repli-chevron" />
        <span className="svv-repli-libelle">Critères de sélection des cartes — rail Téléservice</span>
      </summary>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.5rem' }}>
        {/* ① Propres au téléservice — MODIFIABLES ICI (ne touchent que ce rail). */}
        <section aria-label="Critères propres au rail Téléservice (modifiables)">
          <strong style={{ fontSize: 12 }}>Propres au Téléservice — modifiables ici</strong>
          {champEntier('teleservicePermisParCommuneParMois', veille.teleservicePermisParCommuneParMois, 'Au plus', 'permis par mairie et par mois.')}
          {champEntier('teleserviceDossiersParDepot', veille.teleserviceDossiersParDepot, 'Au plus', 'dossiers regroupés par dépôt.')}
          <label style={styleLigne}>
            Demandeur par défaut :{' '}
            <select value={edits[colProfil] ?? veille.teleserviceProfilDemandeurDefaut}
              aria-label="Demandeur par défaut (téléservice)"
              onChange={(e) => setEdits((s) => ({ ...s, [colProfil]: e.target.value }))}
              style={{ ...styleChamp, width: 'auto' }}>
              <option value="entreprise">{ETIQUETTE_PROFIL.entreprise}</option>
              <option value="personne">{ETIQUETTE_PROFIL.personne}</option>
            </select>
            {messages[colProfil] && <span role="alert" style={styleErr}> — {messages[colProfil]}</span>}
          </label>
          {/* VERROU « référence mairie » (défaut ON) — le mot porte l'info, pas la couleur ; la case dit ce qu'elle fait. */}
          <label style={{ ...styleLigne, display: 'flex', alignItems: 'flex-start', gap: '.4rem' }}>
            <input type="checkbox" checked={verrouCoche}
              aria-label="Bloquer une commune tant que sa référence mairie n’est pas enregistrée"
              onChange={(e) => setEdits((s) => ({ ...s, [colVerrou]: String(e.target.checked) }))}
              style={{ marginTop: '.15rem' }} />
            <span>Bloquer une commune tant que sa référence mairie n’est pas enregistrée.
              <span style={styleAide}> Une fois une demande déposée, la commune sort du vivier et de « Préparer les demandes » jusqu’à ce que la mairie renvoie sa référence (ou que vous leviez le blocage). Les cartes déjà préparées restent affichées.</span>
            </span>
          </label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.2rem' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .7rem', minHeight: 36 }} disabled={enCours} onClick={() => void enregistrer()}>Enregistrer les critères modifiés</button>
            {avis && <span role="status" style={{ fontSize: 12, color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>{avis}</span>}
          </div>
        </section>

        {/* ② Partagés avec l'E-mail — LECTURE SEULE (ne pas changer l'E-mail à l'insu depuis ici). */}
        <section aria-label="Critères communs aux deux rails (lecture seule)" style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem' }}>
          <strong style={{ fontSize: 12 }}>Communs aux deux rails — lecture seule</strong>
          <p style={styleLigne}>On ne demande que les permis de moins de <strong>{veille.ancienneteMaxDemandeAnnees}</strong> an(s).</p>
          <p style={styleLigne}>Ordre d’examen : <strong>{TRI_LABELS[veille.triCandidats] ?? veille.triCandidats}</strong>.</p>
          <p style={styleLigne}>On examine les <strong>{veille.nbCandidatsExamines}</strong> premiers dossiers du haut du classement.</p>
          <p style={styleAide}>Ces trois critères valent <strong>AUSSI pour le rail E-mail</strong>. Pour les modifier, ouvrez <button type="button" className="svv-link" style={{ padding: 0, verticalAlign: 'baseline' }} onClick={onAllerReglages}>l’onglet Réglages</button>.</p>
        </section>
      </div>
    </details>
  );
}
