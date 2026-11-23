'use client';

import { useEffect, useId, useState } from 'react';
import {
  AIDE_ARRETE_COMPTES, arreteFr, joursDuMois, LIBELLE_ARRETE_COMPTES, MOIS_FR, verifierArrete, type ArreteComptesLu,
} from '../../../../lib/location/arreteComptes';
import { prenomNom } from '../../../../lib/location/triRdvPreavis';

/**
 * ══ 🔴 « DATE D'ARRÊTÉ DES COMPTES » DE LA COPROPRIÉTÉ — LE COMPOSANT UNIQUE (Arno, 23/11/2026, migration 512) ═══════════════════════════════════
 * Rendu dans la fiche Copropriété (bloc « AG », à côté des dates d'AGO) et dans la fenêtre « Valider la sortie » (case 20 % cochée), le MÊME :
 * la date (jour / mois annuels) ou « non renseignée », qui l'a saisie et quand ; « Renseigner » / « Modifier » ouvre deux listes (jour, mois) ;
 * vides toutes les deux = date effacée (elle est facultative). Enregistrée tout de suite (POST /api/admin/gestion/immeubles/ag, droit Gestion,
 * journalisée), indépendamment de la sortie. Jetons --color-svv-* seulement ; cibles ≥ 44 px. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
const API = '/api/admin/gestion/immeubles/ag';

type Lu = ArreteComptesLu & { disponible: boolean };

export function ArreteComptes({ coproprieteId, onChange }: { coproprieteId: number; onChange?: (lu: ArreteComptesLu) => void }) {
  const id = useId();
  const [lu, setLu] = useState<{ pour: number; etat: 'ok'; data: Lu } | { pour: number; etat: 'erreur' } | null>(null);
  const [edition, setEdition] = useState(false);
  const [jour, setJour] = useState('');
  const [mois, setMois] = useState('');
  const [tente, setTente] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?arreteCopropriete=${coproprieteId}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Lu }>).then((d) => {
      if (vivant) setLu(d.etat === 'ok' && d.data ? { pour: coproprieteId, etat: 'ok', data: d.data } : { pour: coproprieteId, etat: 'erreur' });
    }).catch(() => { if (vivant) setLu({ pour: coproprieteId, etat: 'erreur' }); });
    return () => { vivant = false; };
  }, [coproprieteId]);
  const etat = lu !== null && lu.pour === coproprieteId ? lu : null;
  if (etat === null) return <p className="loc-muet arc-arrete" role="status" data-arrete-comptes="lecture">{LIBELLE_ARRETE_COMPTES} : lecture…</p>;
  if (etat.etat === 'erreur') return <p className="loc-muet arc-arrete" data-arrete-comptes="erreur">{LIBELLE_ARRETE_COMPTES} : lecture impossible.</p>;
  const d = etat.data;
  if (!d.disponible) return <p className="loc-muet arc-arrete" data-arrete-comptes="sans-schema">{LIBELLE_ARRETE_COMPTES} : la mise à jour de la base (migration 512) reste à appliquer.</p>;
  const v = verifierArrete(jour, mois);
  const ouvrir = (): void => {
    setJour(d.arrete === null ? '' : String(d.arrete.jour)); setMois(d.arrete === null ? '' : String(d.arrete.mois));
    setTente(false); setRefus(null); setFait(false); setEdition(true);
  };
  const enregistrer = (): void => {
    setTente(true);
    if (!v.ok) return;
    setEnvoi(true); setRefus(null);
    void fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'arrete-comptes', coproprieteId, jour, mois }) })
      .then((r) => r.json() as Promise<{ etat?: string; data?: ArreteComptesLu; motif?: string; message?: string }>)
      .then((r) => {
        if (r.etat === 'ok' && r.data) {
          setLu({ pour: coproprieteId, etat: 'ok', data: { ...r.data, disponible: true } }); setEdition(false); setFait(true); onChange?.(r.data);
        } else setRefus(r.motif ?? r.message ?? 'La date d’arrêté des comptes n’a pas été enregistrée.');
      })
      .catch(() => setRefus('La date d’arrêté des comptes n’a pas été enregistrée : le serveur n’a pas répondu.'))
      .finally(() => setEnvoi(false));
  };
  const maxJour = mois === '' ? 31 : joursDuMois(Number(mois));
  return (
    <div className="arc-arrete" data-arrete-comptes={d.arrete === null ? 'vide' : 'renseignee'}>
      <p className="arc-arrete-ligne">
        <span className="arc-arrete-libelle">{LIBELLE_ARRETE_COMPTES} :</span>{' '}
        {d.arrete === null ? <span className="arc-arrete-vide" data-arrete-valeur="">non renseignée</span>
          : <strong data-arrete-valeur={arreteFr(d.arrete)}>{arreteFr(d.arrete)}</strong>}
        {d.arrete !== null && d.par !== null && <span className="loc-muet"> — saisie par {prenomNom(d.par)}{d.le ? ` le ${new Date(d.le).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}` : ''}</span>}
      </p>
      {!edition ? (
        <button type="button" className="svv-btn svv-btn-outline gst-btn arc-arrete-btn" onClick={ouvrir} data-arrete-modifier>
          {d.arrete === null ? 'Renseigner la date d’arrêté des comptes' : 'Modifier la date d’arrêté des comptes'}</button>
      ) : (
        <div className="arc-arrete-form" role="group" aria-label={LIBELLE_ARRETE_COMPTES} data-arrete-formulaire>
          <p className="loc-muet arc-arrete-aide">{AIDE_ARRETE_COMPTES}</p>
          <div className="arc-arrete-champs">
            <label className="arc-arrete-champ" htmlFor={`${id}-j`}><span>Jour</span>
              <select id={`${id}-j`} value={jour} disabled={envoi} onChange={(e) => setJour(e.target.value)} data-arrete-jour>
                <option value="">—</option>
                {Array.from({ length: maxJour }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{String(n).padStart(2, '0')}</option>)}
              </select></label>
            <label className="arc-arrete-champ" htmlFor={`${id}-m`}><span>Mois</span>
              <select id={`${id}-m`} value={mois} disabled={envoi} onChange={(e) => {
                const m = e.target.value; setMois(m);
                if (m !== '' && jour !== '' && Number(jour) > joursDuMois(Number(m))) setJour(String(joursDuMois(Number(m))));
              }} data-arrete-mois>
                <option value="">—</option>
                {MOIS_FR.map((nom, i) => <option key={nom} value={String(i + 1)}>{nom}</option>)}
              </select></label>
          </div>
          {jour === '' && mois === '' && d.arrete !== null && <p className="loc-muet arc-arrete-aide" data-arrete-effacer>Les deux champs vides : la date sera effacée (elle est facultative).</p>}
          {tente && !v.ok && <p className="cp-refus" role="status" data-arrete-message>{v.motif}</p>}
          {refus !== null && <p className="cp-refus" role="alert" data-arrete-refus>{refus}</p>}
          <div className="arc-arrete-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => { setEdition(false); setRefus(null); }} data-arrete-annuler>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={enregistrer} data-arrete-enregistrer>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
      {fait && <p className="loc-muet" role="status" data-arrete-enregistree>Date d’arrêté des comptes enregistrée.</p>}
      <style>{CSS_ARRETE_COMPTES}</style>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_ARRETE_COMPTES = `
.arc-arrete{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0 0 10px}
.arc-arrete-ligne{margin:0;overflow-wrap:anywhere;color:var(--color-svv-ink)}
.arc-arrete-libelle{font-weight:800}
.arc-arrete-vide{color:var(--color-svv-muted);font-style:italic}
.arc-arrete-btn{align-self:flex-start;min-height:44px;width:auto}
.arc-arrete-form{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface)}
.arc-arrete-aide{margin:0;font-size:.85rem}
.arc-arrete-champs{display:flex;flex-wrap:wrap;gap:8px 14px}
.arc-arrete-champ{display:flex;flex-direction:column;gap:4px;font-weight:700;color:var(--color-svv-ink)}
.arc-arrete-champ select{min-height:44px;min-width:7rem;padding:6px 10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit}
.arc-arrete-boutons{display:flex;flex-wrap:wrap;gap:8px}
.arc-arrete-boutons .gst-btn{min-height:44px;width:auto}
@media (max-width:640px){ .arc-arrete-btn{align-self:stretch;width:100%} .arc-arrete-boutons .gst-btn{flex:1} }
`;
