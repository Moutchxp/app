'use client';

import { useEffect, useState } from 'react';
import { FONCTIONS, LIBELLE_FONCTION, lignesHistoriqueFonctions, type EtatFonctions, type Fonction } from '../../../../lib/admin/fonctionsCompteModele';

/** Aujourd'hui à Paris (« AAAA-MM-JJ »), la date proposée pour « À compter du ». */
const aujourdhui = (): string => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * ══ 🔴 « LES COÛTS », LOT 2 (Arno, 03/11/2026, décision C9) — LES FONCTIONS D'UN PROFIL ═════════════════════════════════════════════════════════
 * Une case par fonction (Vente, Location, Gestion), plusieurs possibles ; pré-cochées d'après les données existantes (« déduite » : à confirmer
 * en enregistrant). Elles ne donnent aucun droit : elles rangent les profils proposés pour un salaire chargé dans « Les coûts ». Le bloc lit et
 * enregistre lui-même (journalisé). Sans la migration 451 : il le dit, rien ne s'écrit.
 * 🔴 D35 (Arno, 03/11/2026, option C, migration 453) — DATÉES comme la Société : « À compter du », « Activité principale (salaire) » — UNE parmi les
 * fonctions cochées, elle porte 100 % du salaire chargé (le mois d'un changement : au prorata des jours) —, et l'historique lisible. Les autres
 * fonctions ne portent aucune part du salaire : elles rangent les profils proposés et la liste du graphique.
 */
export function BlocFonctionsCompte({ compteId }: { compteId: number }) {
  const [etat, setEtat] = useState<EtatFonctions | null>(null);
  const [choix, setChoix] = useState<Fonction[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [lecture, setLecture] = useState(0);
  const [principale, setPrincipale] = useState<Fonction | null>(null);
  const [depuis, setDepuis] = useState(aujourdhui());
  const [toujours, setToujours] = useState(false);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/comptes/${compteId}/fonctions`, { cache: 'no-store' });
        const j = (await r.json()) as EtatFonctions;
        // une réponse qui n'a pas la forme attendue (route absente, autre réponse) : le bloc reste absent
        if (vivant && r.ok && Array.isArray(j?.valeur) && Array.isArray(j?.deduites) && typeof j?.disponible === 'boolean') { setEtat(j); setChoix(j.valeur); setPrincipale(j.principale ?? null); setToujours(false); }
      } catch { /* le bloc reste absent */ }
    })();
    return () => { vivant = false; };
  }, [compteId, lecture]);
  if (etat === null) return null;
  const datees = etat.datees === true;
  const basculer = (f: Fonction): void => {
    const xs = choix.includes(f) ? choix.filter((x) => x !== f) : [...choix, f];
    setChoix(xs);
    // l'activité principale reste parmi les fonctions cochées ; une seule cochée : c'est elle
    if (principale !== null && !xs.includes(principale)) setPrincipale(xs.length === 1 ? xs[0] : null);
    else if (principale === null && xs.length === 1) setPrincipale(xs[0]);
  };
  // « Depuis toujours » : un profil sans rien de daté (le premier état), comme la règle du serveur
  const sansDate = datees && !(etat.periodes ?? []).some((p) => p.depuis !== null || p.jusqua !== null) && !(etat.principales ?? []).some((v) => v.depuis !== null);
  const changeP = datees && principale !== (etat.principale ?? null);
  const change = JSON.stringify([...choix].sort()) !== JSON.stringify([...etat.valeur].sort()) || etat.deduites.length > 0 || changeP || etat.principaleDeduite === true;
  const manquePrincipale = datees && choix.length > 0 && (principale === null || !choix.includes(principale));
  const historique = datees ? lignesHistoriqueFonctions(etat) : [];
  const enregistrer = async (): Promise<void> => {
    setEnvoi(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${compteId}/fonctions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datees
        ? { fonctions: choix, principale, depuis: toujours && sansDate ? null : depuis } : { fonctions: choix }) });
      const body = await res.json().catch(() => null) as { change?: boolean; erreur?: string } | null;
      if (res.ok) { setMsg(body?.change === false ? 'Fonctions inchangées.' : 'Fonctions enregistrées.'); setLecture((x) => x + 1); }
      else setMsg(body?.erreur ?? 'Enregistrement refusé.');
    } finally { setEnvoi(false); }
  };
  return (
    <div className="cpt-identite" role="group" aria-labelledby={`fonctions-${compteId}`} style={{ marginTop: 8 }} data-fonctions-compte>
      <div className="cpt-perms-titre" id={`fonctions-${compteId}`}>Fonctions</div>
      {!etat.disponible ? <span className="cpt-aide" data-fonctions-indisponibles>Disponible après la mise à jour de la base (migration 451).</span> : <>
        <div className="cpt-ouinon" data-choix-fonctions>
          {FONCTIONS.map((f) => (
            <button key={f} type="button" className="cpt-ouinon__btn" aria-pressed={choix.includes(f)} disabled={envoi} onClick={() => basculer(f)} data-fonction={f}>
              <span className="cpt-ouinon__ind" aria-hidden="true">{choix.includes(f) ? '☑' : '☐'}</span>{LIBELLE_FONCTION[f]}
              {etat.deduites.includes(f) && <small className="cpt-aide" data-fonction-deduite> (déduite)</small>}
            </button>
          ))}
        </div>
        <span className="cpt-aide">Plusieurs possibles. Aucun droit n’en découle : elles rangent les profils proposés pour un salaire dans « Les coûts ».</span>
        {datees && <>
          <div className="cpt-perms-titre" id={`principale-${compteId}`} style={{ marginTop: 6 }}>Activité principale (salaire)</div>
          <div className="cpt-ouinon" role="radiogroup" aria-labelledby={`principale-${compteId}`} data-choix-principale>
            {FONCTIONS.filter((f) => choix.includes(f)).map((f) => (
              <button key={f} type="button" role="radio" className="cpt-ouinon__btn" aria-checked={principale === f} disabled={envoi}
                onClick={() => setPrincipale(f)} data-principale={f}>
                <span className="cpt-ouinon__ind" aria-hidden="true">{principale === f ? '◉' : '○'}</span>{LIBELLE_FONCTION[f]}
                {etat.principaleDeduite === true && etat.principale === f && <small className="cpt-aide" data-principale-deduite> (déduite)</small>}
              </button>
            ))}
            {choix.length === 0 && <span className="cpt-aide">Cochez au moins une fonction.</span>}
          </div>
          <span className="cpt-aide">Elle porte 100 % du salaire chargé ; les autres fonctions n’en portent aucune part. Le mois d’un changement, le salaire se partage au prorata des jours.</span>
          {manquePrincipale && <span className="cpt-err" role="status" data-principale-a-choisir>Choisissez l’activité principale parmi les fonctions cochées.</span>}
          <label className="cpt-libc">
            <span className="cpt-libc-t">À compter du</span>
            <input className="cpt-champ" type="date" value={toujours && sansDate ? '' : depuis} disabled={envoi || (toujours && sansDate)} onChange={(e) => setDepuis(e.target.value)} data-fonctions-depuis />
          </label>
          {sansDate && <label className="cpt-aide" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={toujours} onChange={(e) => setToujours(e.target.checked)} data-fonctions-toujours />Depuis toujours</label>}
        </>}
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={envoi || !change || manquePrincipale || (datees && !(toujours && sansDate) && depuis === '')}
            onClick={() => void enregistrer()} data-enregistrer-fonctions>Enregistrer les fonctions</button>
        </div>
        {datees && <span className="cpt-note">Un changement vaut à compter de sa date : les mois d’avant gardent leur répartition.</span>}
        {historique.length > 0 && (
          <ul className="cpt-note" data-fonctions-historique style={{ margin: 0, paddingLeft: 18 }}>
            {historique.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        )}
      </>}
      {msg !== null && <span className="cpt-aide" role="status" data-fonctions-message>{msg}</span>}
    </div>
  );
}
