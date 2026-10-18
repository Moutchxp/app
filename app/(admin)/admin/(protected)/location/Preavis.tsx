'use client';

import { useState } from 'react';
import {
  dateFrPreavis, dateIsoValide, dateMaxPreavis, mentionPreavis, MOTIF_MAX, statutPreavis, verifierPreavis,
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

export function MentionPreavis({ p, jour }: { p: Pick<PreavisAffiche, 'dateMax'>; jour: string }) {
  const statut = statutPreavis(p, jour);
  return <span className={`pvs-mention pvs-mention--${statut}`} data-preavis={statut}>{mentionPreavis(p, jour)}</span>;
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
.pvs-mention{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.85rem;font-weight:800;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border:1px solid var(--color-svv-urgence-orange)}
.pvs-mention--echu{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
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
