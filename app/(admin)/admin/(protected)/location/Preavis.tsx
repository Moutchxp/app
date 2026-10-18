'use client';

import { useId, useState } from 'react';
import {
  dateFrPreavis, dateIsoValide, dateMaxPreavis, mentionCourtePreavis, mentionPreavis, MOTIF_MAX, statutPreavis, verifierPreavis,
  type DureeMois, type ModePreavis, type PreavisAffiche,
} from '../../../../lib/location/preavis';

/**
 * ══ 🔴🔴 LE PRÉAVIS DU LOCATAIRE — LES BRIQUES D'ÉCRAN (Arno, 18/10/2026) ════════════════════════════════════════════════
 * La mention (« en préavis — sortie au plus tard le JJ/MM/AAAA » ou « Préavis échu — sortie à saisir ») en ORANGE AVEC LE
 * MOT ; le formulaire (date de réception du recommandé*, durée proposée et modifiable, date maximale calculée en grand,
 * motif facultatif) ; les gestes « Corriger le préavis » / « Annuler le préavis ». Partagées par l'écran de sortie de la
 * Location et les sections « Location » de la fiche commune (Gestion et Location) — la porte d'écriture est passée en
 * paramètre (`envoyerGeste`), les mêmes fonctions serveur derrière. Jetons --color-svv-* seulement ; cibles ≥ 44 px.
 */

/** Aujourd'hui à Paris (AAAA-MM-JJ), côté écran — le serveur refait le contrôle avec sa date. */
export const aujourdhuiParisEcran = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

export function MentionPreavis({ p, jour, court = false }: { p: Pick<PreavisAffiche, 'dateMax'>; jour: string; court?: boolean }) {
  const statut = statutPreavis(p, jour);
  return <span className={`pvs-mention pvs-mention--${statut}`} data-preavis={statut}>{court ? mentionCourtePreavis(p, jour) : mentionPreavis(p, jour)}</span>;
}

type Choix = '1' | '3' | 'manuelle';

export interface SaisiePreavis { occupationIds?: number[]; recuLe: string; choix: ModePreavis; motif: string | null }

/**
 * LE FORMULAIRE DU PRÉAVIS — création (avec les locataires à cocher, tous cochés par défaut) ou correction (sans cases).
 * « Enregistrer » reste désactivé tant que la saisie ne va pas, et le message dit pourquoi (mêmes règles que le serveur).
 */
export function FormulairePreavis({
  locataires, entrees, dureeProposee, raison, initial, onEnregistrer, onAnnuler, libelleBouton = 'Enregistrer le préavis',
}: {
  locataires?: { occupationId: number; nom: string; entree: string | null; enPreavis: boolean }[];
  entrees: readonly (string | null)[];
  dureeProposee: DureeMois;
  raison: string;
  initial?: { recuLe: string; choix: ModePreavis; motif: string | null };
  onEnregistrer: (s: SaisiePreavis) => Promise<string | null>;
  onAnnuler: () => void;
  libelleBouton?: string;
}) {
  const jour = aujourdhuiParisEcran();
  const [coches, setCoches] = useState<number[]>(() => (locataires ?? []).filter((l) => !l.enPreavis).map((l) => l.occupationId));
  const [recuLe, setRecuLe] = useState(initial?.recuLe ?? '');
  const [choix, setChoix] = useState<Choix>(() => (initial === undefined ? (String(dureeProposee) as Choix)
    : initial.choix.mode === 'date_manuelle' ? 'manuelle' : (String(initial.choix.duree) as Choix)));
  const [dateManuelle, setDateManuelle] = useState(initial?.choix.mode === 'date_manuelle' ? initial.choix.dateMax : '');
  const [motif, setMotif] = useState(initial?.motif ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const mode: ModePreavis = choix === 'manuelle' ? { mode: 'date_manuelle', dateMax: dateManuelle } : { mode: 'mois', duree: Number(choix) as DureeMois };
  const entreesCochees = locataires === undefined ? entrees : locataires.filter((l) => coches.includes(l.occupationId)).map((l) => l.entree);
  const verdict = verifierPreavis({ recuLe, choix: mode, motif, entrees: entreesCochees }, jour);
  const message = locataires !== undefined && coches.length === 0 ? 'Cochez au moins un locataire' : verdict.ok ? null : verdict.motif;
  const dateMax = dateIsoValide(recuLe) && (mode.mode === 'mois' || dateIsoValide(mode.dateMax)) ? dateMaxPreavis(recuLe, mode) : null;
  const enregistrer = async (): Promise<void> => {
    if (message !== null) return;
    setEnvoi(true); setRefus(null);
    const r = await onEnregistrer({ ...(locataires !== undefined ? { occupationIds: coches } : {}), recuLe, choix: mode, motif: motif.trim() === '' ? null : motif.trim() });
    setEnvoi(false);
    if (r !== null) setRefus(r);
  };
  const autre = dureeProposee === 1 ? 3 : 1;
  return (
    <div className="loc-confirmation arc-confirmation pvs-form" role="group" aria-label="Préavis" data-formulaire-preavis>
      {locataires !== undefined && (
        <fieldset className="pvs-cases">
          <legend>Locataires concernés</legend>
          {locataires.map((l) => (
            <label key={l.occupationId} className="pvs-case">
              <input type="checkbox" checked={coches.includes(l.occupationId)} disabled={l.enPreavis} data-case-preavis={l.occupationId}
                onChange={() => setCoches((c) => (c.includes(l.occupationId) ? c.filter((x) => x !== l.occupationId) : [...c, l.occupationId]))} />
              <span>{l.nom}{l.enPreavis ? ' — déjà en préavis (corrigez son préavis)' : ''}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="pvs-champ" htmlFor="pvs-recu">
        <span className="pvs-libelle">Date de réception du recommandé *</span>
        <input id="pvs-recu" type="date" value={recuLe} max={jour} onChange={(e) => setRecuLe(e.target.value)} required aria-required="true" data-recu-le />
      </label>
      <fieldset className="pvs-duree">
        <legend>Durée du préavis</legend>
        <label className="pvs-case"><input type="radio" name="pvs-duree" checked={choix === String(dureeProposee)} onChange={() => setChoix(String(dureeProposee) as Choix)} data-duree="proposee" />
          <span><strong>{dureeProposee} mois</strong> — proposé ({raison})</span></label>
        <label className="pvs-case"><input type="radio" name="pvs-duree" checked={choix === String(autre)} onChange={() => setChoix(String(autre) as Choix)} data-duree="autre" />
          <span>{autre} mois</span></label>
        <label className="pvs-case"><input type="radio" name="pvs-duree" checked={choix === 'manuelle'} onChange={() => setChoix('manuelle')} data-duree="manuelle" />
          <span>Date maximale saisie à la main</span></label>
        {choix === 'manuelle' && (
          <input type="date" className="pvs-date-manuelle" value={dateManuelle} min={dateIsoValide(recuLe) ? recuLe : undefined}
            onChange={(e) => setDateManuelle(e.target.value)} aria-label="Date maximale de sortie" data-date-manuelle />
        )}
      </fieldset>
      <div className="pvs-max" data-date-max>
        <span className="pvs-libelle">Date maximale de sortie</span>
        <strong className="pvs-max-valeur">{dateMax === null ? '—' : dateFrPreavis(dateMax)}</strong>
      </div>
      <label className="pvs-champ">
        <span className="pvs-libelle">Motif <small className="loc-muet">(facultatif)</small></span>
        <textarea value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={MOTIF_MAX} rows={2} data-motif />
      </label>
      {message !== null && <p className="cp-refus" role="status" data-message-preavis>{message}</p>}
      {refus !== null && <p className="cp-refus" role="alert" data-refus-preavis>{refus}</p>}
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void enregistrer(); }} disabled={envoi || message !== null} data-enregistrer-preavis>
          {envoi ? 'Enregistrement…' : libelleBouton}</button>
      </div>
    </div>
  );
}

/**
 * ══ Arno (19/10/2026) — LE BLOC « ENREGISTRER UN PRÉAVIS » COMPACT, de l'ÉCRAN DE SORTIE (?sortie=) ═════════════════════
 * Trois lignes : « Locataires concernés : » + étiquettes (la sélection des CARTES décide — plus de cases propres au bloc,
 * avec l'accord d'Arno) ; réception du recommandé, durée en contrôle segmenté (la proposition marquée « proposé »), date
 * maximale à la main si « À la main », « → sortie au plus tard le … » ; motif sur une ligne, Annuler / Enregistrer. Aucun
 * texte d'aide permanent : un message n'apparaît que pour un vrai problème, ou si l'on enregistre sans la réception.
 * Mêmes règles que le serveur (`verifierPreavis`) ; la liste envoyée est celle des cartes sélectionnées (hors préavis ouverts).
 */
export function FormulairePreavisCompact({ selection, dureeProposee, raison, onEnregistrer, onAnnuler }: {
  selection: { occupationId: number; nom: string; entree: string | null; enPreavis: boolean }[];
  dureeProposee: DureeMois;
  raison: string;
  onEnregistrer: (s: SaisiePreavis) => Promise<string | null>;
  onAnnuler: () => void;
}) {
  const jour = aujourdhuiParisEcran();
  const id = useId();
  const [recuLe, setRecuLe] = useState('');
  const [choix, setChoix] = useState<Choix>(String(dureeProposee) as Choix);
  const [dateManuelle, setDateManuelle] = useState('');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [tente, setTente] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const concernes = selection.filter((l) => !l.enPreavis);
  const mode: ModePreavis = choix === 'manuelle' ? { mode: 'date_manuelle', dateMax: dateManuelle } : { mode: 'mois', duree: Number(choix) as DureeMois };
  const verdict = verifierPreavis({ recuLe, choix: mode, motif, entrees: concernes.map((l) => l.entree) }, jour);
  // Un message « manquant » (réception, date à la main, aucun locataire) n'apparaît qu'après une tentative ; un vrai problème, tout de suite.
  const manque = concernes.length === 0 ? 'Sélectionnez au moins un locataire (cartes ci-dessous) qui n’est pas déjà en préavis'
    : recuLe === '' ? (verdict.ok ? null : verdict.motif)
      : choix === 'manuelle' && dateManuelle === '' ? (verdict.ok ? null : verdict.motif) : null;
  const probleme = manque === null && !verdict.ok ? verdict.motif : null;
  const erreur = refus ?? probleme ?? (tente ? manque : null);
  const dateMax = dateIsoValide(recuLe) && (mode.mode === 'mois' || dateIsoValide(mode.dateMax)) ? dateMaxPreavis(recuLe, mode) : null;
  const enregistrer = async (): Promise<void> => {
    setTente(true);
    if (manque !== null || probleme !== null) return;
    setEnvoi(true); setRefus(null);
    const r = await onEnregistrer({ occupationIds: concernes.map((l) => l.occupationId), recuLe, choix: mode, motif: motif.trim() === '' ? null : motif.trim() });
    setEnvoi(false);
    if (r !== null) setRefus(r);
  };
  const segments: { cle: Choix; mot: string }[] = [
    { cle: '1', mot: `1 mois${dureeProposee === 1 ? ' (proposé)' : ''}` },
    { cle: '3', mot: `3 mois${dureeProposee === 3 ? ' (proposé)' : ''}` },
    { cle: 'manuelle', mot: 'À la main' },
  ];
  return (
    <div className="loc-confirmation pvs-compact" role="group" aria-label="Enregistrer un préavis" data-formulaire-preavis data-compact>
      <div className="pvs-compact-ligne" data-concernes>
        <span className="pvs-compact-libelle">Locataires concernés :</span>
        {selection.length === 0 ? <span className="loc-muet">aucun (sélectionnez une carte)</span> : selection.map((l) => (
          <span key={l.occupationId} className={`sor-etiquette${l.enPreavis ? ' sor-etiquette--exclue' : ''}`} data-concerne={l.occupationId}>
            <strong>{l.nom}</strong>{l.enPreavis ? ' · déjà en préavis' : ''}</span>
        ))}
      </div>
      <div className="pvs-compact-ligne">
        <label className="pvs-compact-champ" htmlFor={`${id}-recu`}>
          <span className="pvs-compact-libelle">Réception du recommandé *</span>
          <input id={`${id}-recu`} type="date" value={recuLe} max={jour} onChange={(e) => { setRecuLe(e.target.value); setRefus(null); }} required aria-required="true"
            aria-describedby={erreur !== null ? `${id}-message` : undefined} aria-invalid={erreur !== null} data-recu-le />
        </label>
        <span className="pvs-segments" role="group" aria-label="Durée du préavis" title={`Proposé : ${raison}`}>
          {segments.map((x) => (
            <button key={x.cle} type="button" className="pvs-segment" aria-pressed={choix === x.cle} onClick={() => { setChoix(x.cle); setRefus(null); }}
              data-duree={x.cle === String(dureeProposee) ? 'proposee' : x.cle === 'manuelle' ? 'manuelle' : 'autre'}>{x.mot}</button>
          ))}
        </span>
        {choix === 'manuelle' && (
          <input type="date" className="pvs-date-manuelle" value={dateManuelle} min={dateIsoValide(recuLe) ? recuLe : undefined}
            onChange={(e) => { setDateManuelle(e.target.value); setRefus(null); }} aria-label="Date maximale de sortie" data-date-manuelle />
        )}
        <span className="pvs-compact-max" data-date-max>→ sortie au plus tard le <strong className="pvs-max-valeur">{dateMax === null ? '—' : dateFrPreavis(dateMax)}</strong></span>
      </div>
      <div className="pvs-compact-ligne">
        <label className="pvs-compact-champ pvs-compact-motif">
          <span className="pvs-compact-libelle">Motif (facultatif)</span>
          <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={MOTIF_MAX} placeholder="ex. mutation professionnelle" data-motif />
        </label>
        <span className="sor-compact-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi}>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn sor-confirmer-btn" onClick={() => { void enregistrer(); }} disabled={envoi || probleme !== null} data-enregistrer-preavis>
            {envoi ? 'Enregistrement…' : 'Enregistrer le préavis'}</button>
        </span>
      </div>
      <p className="loc-muet pvs-compact-raison" data-raison>Durée proposée : {dureeProposee} mois ({raison}).</p>
      {erreur !== null && <p id={`${id}-message`} className="cp-refus" role="alert" data-message-preavis>{erreur}</p>}
    </div>
  );
}

/** « Corriger le préavis » / « Annuler le préavis » d'un préavis ouvert (gestes journalisés côté serveur). */
export function GestesPreavis({ p, entree, envoyerGeste, apres }: {
  p: PreavisAffiche & { dureeProposee?: number | null };
  entree: string | null;
  envoyerGeste: (corps: Record<string, unknown>) => Promise<string | null>;
  apres: () => void;
}) {
  const [mode, setMode] = useState<'lecture' | 'corriger' | 'annuler'>('lecture');
  const [refus, setRefus] = useState<string | null>(null);
  const proposee: DureeMois = p.dureeProposee === 1 || p.dureeProposee === 3 ? p.dureeProposee : (p.dureeMois === 1 ? 1 : 3);
  if (mode === 'corriger') {
    return (
      <FormulairePreavis entrees={[entree]} dureeProposee={proposee} raison="durée proposée à la saisie"
        initial={{ recuLe: p.recuLe, choix: p.mode === 'date_manuelle' ? { mode: 'date_manuelle', dateMax: p.dateMax } : { mode: 'mois', duree: p.dureeMois === 1 ? 1 : 3 }, motif: p.motif }}
        libelleBouton="Enregistrer la correction" onAnnuler={() => setMode('lecture')}
        onEnregistrer={async (s) => {
          const r = await envoyerGeste({ action: 'corriger-preavis', preavisId: p.id, recuLe: s.recuLe, choix: s.choix, motif: s.motif });
          if (r === null) { setMode('lecture'); apres(); }
          return r;
        }} />
    );
  }
  return (
    <div className="pvs-gestes" data-gestes-preavis={p.id}>
      <span className="loc-muet">Reçu le {dateFrPreavis(p.recuLe)}{p.motif ? ` — ${p.motif}` : ''} · saisi par {p.creePar}</span>
      {p.etatDesLieuxLe ? <span data-etat-des-lieux>État des lieux le {dateFrPreavis(p.etatDesLieuxLe)}</span> : null}
      {mode === 'lecture' ? (
        <span className="pvs-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('corriger')} data-corriger-preavis>Corriger le préavis</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('annuler')} data-annuler-preavis>Annuler le préavis</button>
        </span>
      ) : (
        <span className="pvs-boutons">
          <span>Annuler ce préavis ? La ligne est gardée au journal.</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setMode('lecture'); setRefus(null); }}>Revenir</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" data-confirmer-annulation-preavis onClick={() => {
            void (async () => {
              const r = await envoyerGeste({ action: 'annuler-preavis', preavisId: p.id });
              if (r === null) { setMode('lecture'); apres(); } else setRefus(r);
            })();
          }}>Confirmer l’annulation</button>
        </span>
      )}
      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
    </div>
  );
}

/** Orange d'alerte du thème + mot : jamais la couleur seule. */
export const CSS_PREAVIS = `
/* Arno (19/10/2026) — « en préavis » en BLEU TRANSPARENT (paire bleue du thème, Clair ET Sombre) ; « Préavis échu — sortie à
   saisir » GARDE sa couleur d'alerte (orange plein), distincte, pour rester repérable. Toujours avec le mot. */
.pvs-mention{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.85rem;font-weight:800;background:var(--color-svv-blue-soft);color:var(--color-svv-blue);border:1px solid var(--color-svv-blue)}
.pvs-compact{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
.pvs-compact-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0}
.pvs-compact-libelle{font-weight:700;color:var(--color-svv-ink)}
.pvs-compact-champ{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}
.pvs-compact-champ input{min-height:44px;box-sizing:border-box;max-width:100%}
.pvs-compact-motif{flex:1 1 220px}
.pvs-compact-motif input{flex:1 1 160px;min-width:0}
.pvs-segments{display:inline-flex;flex-wrap:wrap;gap:4px}
.pvs-segment{min-height:44px;padding:6px 12px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.9rem;cursor:pointer}
.pvs-segment[aria-pressed="true"]{background:var(--color-svv-ink);color:var(--color-svv-surface);border-color:var(--color-svv-ink);font-weight:700}
.pvs-compact-max{color:var(--color-svv-blue);font-weight:600}
.pvs-compact-max .pvs-max-valeur{color:var(--color-svv-blue)}
.pvs-compact-raison{margin:0;font-size:.82rem}
@media (max-width:760px){ .pvs-compact-ligne{flex-direction:column;align-items:stretch} .pvs-compact-champ{flex-direction:column;align-items:stretch} }
.pvs-mention--echu{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface);border-color:var(--color-svv-urgence-orange)}
.pvs-form{display:flex;flex-direction:column;gap:12px}
.pvs-cases,.pvs-duree{border:1px solid var(--color-svv-line);border-radius:12px;padding:8px 12px;margin:0;display:flex;flex-direction:column;gap:2px}
.pvs-cases legend,.pvs-duree legend{font-weight:700;padding:0 4px}
.pvs-case{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}
.pvs-case input{width:22px;height:22px;flex:0 0 auto}
.pvs-champ{display:flex;flex-direction:column;gap:4px}
.pvs-libelle{font-weight:800;color:var(--color-svv-ink)}
.pvs-champ input,.pvs-date-manuelle{box-sizing:border-box;width:100%;max-width:22rem;min-height:48px;padding:8px 12px;border:2px solid var(--color-svv-ink);border-radius:12px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.05rem}
.pvs-champ textarea{box-sizing:border-box;width:100%;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:8px 10px;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-surface)}
.pvs-max{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;background:var(--color-svv-amber-soft);border:1px solid var(--color-svv-urgence-orange)}
.pvs-max-valeur{font-size:1.5rem;font-weight:800;color:var(--color-svv-ink)}
.pvs-gestes{display:flex;flex-direction:column;gap:6px}
.pvs-boutons{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
`;
