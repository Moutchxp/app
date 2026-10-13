'use client';

import { useState } from 'react';
import { BADGE_ACCEPTATION, erreurMotif, type TacheRecue, type VerdictLien } from '../../../../lib/gestion/acceptationTache';
import { echeanceLisible, horodatageLisible, MESSAGE_SESSION_EXPIREE } from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — « MES TÂCHES », CÔTÉ ÉCRAN ════════════════════════════════════════════════════════
 *
 * En haut, la demande du lien reçu par mail (s'il y en a un) : la tâche, et « Accepter » ou « Refuser » (motif
 * obligatoire), la décision du lien étant pré-choisie. En dessous, SES tâches, avec leur statut ; une tâche encore en
 * attente peut aussi être acceptée ou refusée d'ici, sans le lien.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : seuls les modules purs entrent ici.
 */
type Demande = { tache: TacheRecue | null; verdict: VerdictLien };

export function MesTaches({ nom, taches, jeton, decisionProposee, demande }: {
  nom: string; taches: TacheRecue[]; jeton: string | null; decisionProposee: 'accepter' | 'refuser' | null; demande: Demande | null;
}) {
  const [liste, setListe] = useState(taches);
  return (
    <div className="mtc">
      <style>{CSS_MES_TACHES}</style>
      {demande !== null && (
        <section className="svv-card mtc-demande" aria-label="Demande reçue par mail">
          <h2 className="mtc-titre">Demande reçue par mail</h2>
          {!demande.verdict.ok && <p className="mtc-alerte" role="alert">{demande.verdict.message}</p>}
          {demande.tache !== null && <Resume t={demande.tache} />}
          {demande.verdict.ok && demande.tache !== null && (
            <Reponse cle={{ jeton }} decisionProposee={decisionProposee}
              onRepondu={(statut) => setListe((l) => l.map((x) => (x.tacheId === demande.tache?.tacheId ? { ...x, statut } : x)))} />
          )}
        </section>
      )}
      <section className="svv-card" aria-label="Mes tâches">
        <h2 className="mtc-titre">Tâches confiées à {nom}</h2>
        {liste.length === 0 && <p className="mtc-gris">Aucune tâche ne vous est confiée.</p>}
        <ul className="mtc-liste">
          {liste.map((t) => (
            <li key={t.tacheId} className="mtc-ligne" data-tache={t.tacheId} data-statut={t.statut}>
              <Resume t={t} />
              {t.statut === 'en_attente' && t.etat === 'a_faire' && (
                <Reponse cle={{ tacheId: t.tacheId }} decisionProposee={null}
                  onRepondu={(statut) => setListe((l) => l.map((x) => (x.tacheId === t.tacheId ? { ...x, statut } : x)))} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Resume({ t }: { t: TacheRecue }) {
  return (
    <div className="mtc-resume">
      <p className="mtc-haut">
        <b>{echeanceLisible(t.jour, t.heure)}</b>
        <span className={`mtc-badge mtc-badge--${t.statut}`}>{BADGE_ACCEPTATION[t.statut]}</span>
        {t.etat === 'faite' && <span className="mtc-gris">Faite</span>}
      </p>
      <p className="mtc-objet">{t.objet}</p>
      <p className="mtc-gris">{t.adresseBien} — demandée par {t.demandeurLibelle} le {horodatageLisible(t.demandeLe)}</p>
      {t.note && <p className="mtc-note">{t.note}</p>}
      {t.statut === 'refusee' && t.motif && <p className="mtc-gris">Motif du refus : {t.motif}</p>}
    </div>
  );
}

function Reponse({ cle, decisionProposee, onRepondu }: {
  cle: { jeton: string | null } | { tacheId: number };
  decisionProposee: 'accepter' | 'refuser' | null;
  onRepondu: (statut: 'acceptee' | 'refusee') => void;
}) {
  const [refuser, setRefuser] = useState(decisionProposee === 'refuser');
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [fini, setFini] = useState(false);

  const envoyer = async (decision: 'accepter' | 'refuser') => {
    if (decision === 'refuser') {
      const e = erreurMotif(motif);
      if (e !== null) { setMessage({ ok: false, texte: e }); return; }
    }
    setOccupe(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/taches/reponse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cle, decision, motif: decision === 'refuser' ? motif : null }),
      });
      const d = (await res.json().catch(() => null)) as { message?: string; erreur?: string; statut?: 'acceptee' | 'refusee' } | null;
      if (res.status === 401) setMessage({ ok: false, texte: MESSAGE_SESSION_EXPIREE });
      else if (!res.ok || d === null) setMessage({ ok: false, texte: d?.erreur ?? `Réponse refusée (erreur ${res.status}).` });
      else { setMessage({ ok: true, texte: d.message ?? 'Réponse enregistrée.' }); setFini(true); if (d.statut) onRepondu(d.statut); }
    } catch {
      setMessage({ ok: false, texte: 'Le serveur ne répond pas : rien n’a été enregistré.' });
    }
    setOccupe(false);
  };

  return (
    <div className="mtc-reponse">
      {message && <p className={message.ok ? 'mtc-ok' : 'mtc-alerte'} role={message.ok ? 'status' : 'alert'}>{message.texte}</p>}
      {!fini && (refuser ? (
        <>
          <label className="mtc-champ">
            <span>Motif du refus (obligatoire)</span>
            <textarea rows={2} value={motif} maxLength={1000} onChange={(e) => setMotif(e.target.value)} />
          </label>
          <div className="mtc-boutons">
            <button type="button" className="svv-btn mtc-btn mtc-refuser" disabled={occupe} onClick={() => void envoyer('refuser')}>
              {occupe ? 'Enregistrement…' : 'Confirmer le refus'}
            </button>
            <button type="button" className="svv-btn svv-btn-outline mtc-btn" disabled={occupe} onClick={() => setRefuser(false)}>
              Revenir
            </button>
          </div>
        </>
      ) : (
        <div className="mtc-boutons">
          <button type="button" className="svv-btn mtc-btn" disabled={occupe} onClick={() => void envoyer('accepter')}>
            {occupe ? 'Enregistrement…' : decisionProposee === 'accepter' ? 'Confirmer : j’accepte' : 'Accepter'}
          </button>
          <button type="button" className="svv-btn svv-btn-outline mtc-btn" disabled={occupe} onClick={() => setRefuser(true)}>
            Refuser…
          </button>
        </div>
      ))}
    </div>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous. */
const CSS_MES_TACHES = `
.mtc{display:flex;flex-direction:column;gap:14px}
.mtc-titre{margin:0 0 8px;font-size:1rem;font-weight:700;color:var(--color-svv-ink)}
.mtc-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.mtc-ligne{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface)}
.mtc-resume p{margin:2px 0}
.mtc-haut{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;color:var(--color-svv-ink)}
.mtc-objet{font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mtc-note{white-space:pre-wrap;font-size:.88rem;color:var(--color-svv-ink)}
.mtc-gris{font-size:.84rem;color:var(--color-svv-muted)}
.mtc-badge{display:inline-flex;align-items:center;padding:.1rem .55rem;border-radius:999px;font-size:.78rem;font-weight:700;
  border:1px solid var(--color-svv-line-strong);color:var(--color-svv-ink);background:var(--color-svv-field)}
.mtc-badge--acceptee{border-color:var(--color-svv-green);color:var(--color-svv-green-ink)}
.mtc-badge--refusee{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.mtc-reponse{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.mtc-boutons{display:flex;flex-wrap:wrap;gap:8px}
.mtc-btn{width:auto;min-height:44px;padding:0 1rem}
.mtc-refuser{background:var(--color-svv-red);border-color:var(--color-svv-red)}
.mtc-champ{display:flex;flex-direction:column;gap:3px;font-size:.84rem;color:var(--color-svv-muted)}
.mtc-champ textarea{min-height:3.5rem;padding:.4rem .5rem;border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit}
.mtc-alerte{margin:0;padding:8px 10px;border:1px solid var(--color-svv-red);border-left-width:4px;border-radius:.5rem;
  background:var(--color-svv-red-soft);color:var(--color-svv-ink);font-weight:600}
.mtc-ok{margin:0;font-weight:600;color:var(--color-svv-green-ink)}
`;
