'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type Apporteur, LIBELLE_TYPE_APPORTEUR, pourcent, type RegleCommission, TYPES_APPORTEUR, type TypeApporteur, versionADate,
} from '../../../../lib/location/suivi/suivi';
import { API_SUIVI, aujourdhuiParis, posterSuivi } from './SuiviCommercial';

/**
 * ══ LOCATION — ROUE « PARAMÈTRES » : APPORTEURS ET COMMISSIONS (Arno, 22/10/2026, migration 406) ═══════════════════════════
 *   · « Apporteurs » : le référentiel (partenaire externe, agence, Internet, collaborateur) ; chaque taux et coût fixe mensuel
 *     est une VERSION DATÉE — « Nouveau taux » vaut pour les baux signés à partir de sa date, jamais en arrière ;
 *   · « Commissions » : la règle du négociateur (taux sur le CA net d'apporteurs, primes de nouvelle gestion logement /
 *     parking), datée elle aussi ; et les rétrocessions saisies à la main (annulables, jamais supprimées).
 * Chaque onglet enregistre par ses propres boutons (une ligne = un geste) ; le serveur exige un administrateur.
 */
interface Lu {
  disponible: boolean;
  apporteurs: Apporteur[];
  regles: RegleCommission[];
  retrocessions: { id: number; negociateurLibelle: string; negociateurId: number | null; mois: string; montant: number; libelle: string }[];
  negociateurs: { id: number; libelle: string }[];
}
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const moisFr = (iso: string): string => new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function useSuiviParametres(): { lu: Lu | null; erreur: string | null; relire: () => void } {
  const [lu, setLu] = useState<Lu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(API_SUIVI, { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: Partial<Lu>; message?: string }) => {
      if (!vivant) return;
      if (d.etat !== 'ok' || d.data === undefined) { setErreur(d.message ?? 'Lecture impossible.'); return; }
      const x = d.data;
      setLu({ disponible: x.disponible === true, apporteurs: Array.isArray(x.apporteurs) ? x.apporteurs : [], regles: Array.isArray(x.regles) ? x.regles : [],
        retrocessions: Array.isArray(x.retrocessions) ? x.retrocessions : [], negociateurs: Array.isArray(x.negociateurs) ? x.negociateurs : [] });
    }).catch(() => { if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [n]);
  return { lu, erreur, relire: useCallback(() => setN((x) => x + 1), []) };
}

function Etat({ lu, erreur }: { lu: Lu | null; erreur: string | null }) {
  if (lu === null) return <p className="plo-muet" role="status">{erreur ?? 'Lecture…'}</p>;
  if (!lu.disponible) return <p className="plo-alerte" role="status" data-suivi-sans-migration>Mise à jour de la base à appliquer (migration 406) : rien ne se lit ni ne s’enregistre ici tant qu’elle n’est pas appliquée.</p>;
  return null;
}

/** Un geste : envoi, puis relecture ; le motif d'un refus est dit sous le bouton. */
function useGeste(relire: () => void) {
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const faire = async (corps: Record<string, unknown>, reussite: string): Promise<boolean> => {
    setEnvoi(true); setMotif(null); setInfo(null);
    const r = await posterSuivi(corps);
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return false; }
    setInfo(reussite); relire();
    return true;
  };
  const retour = (
    <>
      {motif !== null && <p className="plo-erreur" role="alert" data-motif-suivi>{motif}</p>}
      {info !== null && <p className="plo-ok" role="status" data-info-suivi>{info}</p>}
    </>
  );
  return { envoi, faire, retour, effacer: () => { setMotif(null); setInfo(null); } };
}

export function OngletApporteurs() {
  const { lu, erreur, relire } = useSuiviParametres();
  const g = useGeste(relire);
  const jour = aujourdhuiParis();
  const [nouveau, setNouveau] = useState({ nom: '', type: 'partenaire' as TypeApporteur, taux: '', coutFixe: '', depuis: jour });
  const [version, setVersion] = useState<{ id: number; taux: string; coutFixe: string; depuis: string } | null>(null);
  return (
    <section data-onglet-apporteurs>
      <p className="plo-note">Les apporteurs d’affaires et leur commission (en % des honoraires HT du bail). <strong>Un nouveau taux crée une nouvelle version</strong> :
        il vaut pour les baux signés à partir de sa date ; les baux déjà signés gardent le leur. Un taux se corrige aussi bail par bail, à la saisie.</p>
      <Etat lu={lu} erreur={erreur} />
      {lu !== null && lu.disponible && (
        <>
          <ol className="plo-versions" data-liste-apporteurs>
            {lu.apporteurs.filter((a) => !a.archive).map((a) => {
              const enVigueur = versionADate(a.baremes, jour);
              return (
                <li key={a.id} data-apporteur={a.id}>
                  <p className="plo-version-titre"><strong>{a.nom}</strong><span className="plo-pastille">{LIBELLE_TYPE_APPORTEUR[a.type]}</span></p>
                  <p className="plo-version-valeurs">{enVigueur === null ? 'Aucun taux en vigueur aujourd’hui.'
                    : `Taux ${pourcent(enVigueur.taux)}${enVigueur.coutFixeMensuel > 0 ? ` · coût fixe ${euros(enVigueur.coutFixeMensuel)} / mois` : ''} (depuis le ${dateFr(enVigueur.depuis)})`}</p>
                  {a.baremes.length > 1 && (
                    <p className="plo-muet plo-petit-texte">Historique : {a.baremes.map((b) => `${dateFr(b.depuis)} → ${pourcent(b.taux)}${b.coutFixeMensuel > 0 ? ` + ${euros(b.coutFixeMensuel)}/mois` : ''}`).join(' · ')}</p>
                  )}
                  {version?.id === a.id ? (
                    <div className="plo-grille" data-nouvelle-version={a.id}>
                      <label className="plo-champ"><span>Taux (%)</span><input inputMode="decimal" value={version.taux} onChange={(e) => setVersion({ ...version, taux: e.target.value })} /></label>
                      <label className="plo-champ"><span>Coût fixe mensuel (€)</span><input inputMode="decimal" value={version.coutFixe} onChange={(e) => setVersion({ ...version, coutFixe: e.target.value })} /></label>
                      <label className="plo-champ"><span>Applicable à partir du</span><input type="date" value={version.depuis} onChange={(e) => setVersion({ ...version, depuis: e.target.value })} /></label>
                      <span className="plo-boutons" style={{ alignItems: 'end' }}>
                        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setVersion(null)} disabled={g.envoi}>Annuler</button>
                        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={g.envoi} data-enregistrer-version
                          onClick={() => { void g.faire({ action: 'bareme-apporteur', apporteurId: a.id, bareme: { taux: version.taux, coutFixe: version.coutFixe, depuis: version.depuis } },
                            `Nouveau taux de ${a.nom} enregistré.`).then((ok) => { if (ok) setVersion(null); }); }}>Enregistrer</button>
                      </span>
                    </div>
                  ) : (
                    <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" data-nouveau-taux={a.id}
                      onClick={() => { g.effacer(); setVersion({ id: a.id, taux: enVigueur === null ? '' : String(Math.round(enVigueur.taux * 1000000) / 10000).replace('.', ','), coutFixe: enVigueur === null ? '' : String(enVigueur.coutFixeMensuel).replace('.', ','), depuis: jour }); }}>
                      Nouveau taux</button>
                  )}
                </li>
              );
            })}
          </ol>
          {lu.apporteurs.length === 0 && <p className="plo-muet">Aucun apporteur pour l’instant.</p>}
          <h3 className="plo-h3">Ajouter un apporteur</h3>
          <div className="plo-grille" data-ajout-apporteur>
            <label className="plo-champ"><span>Nom</span><input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} data-nom-apporteur /></label>
            <label className="plo-champ"><span>Type</span>
              <select className="plo-select" value={nouveau.type} onChange={(e) => setNouveau({ ...nouveau, type: e.target.value as TypeApporteur })}>
                {TYPES_APPORTEUR.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_APPORTEUR[t]}</option>)}
              </select></label>
            <label className="plo-champ"><span>Taux (%)</span><input inputMode="decimal" value={nouveau.taux} placeholder="ex. 10" onChange={(e) => setNouveau({ ...nouveau, taux: e.target.value })} data-taux-apporteur /></label>
            <label className="plo-champ"><span>Coût fixe mensuel (€, facultatif)</span><input inputMode="decimal" value={nouveau.coutFixe} onChange={(e) => setNouveau({ ...nouveau, coutFixe: e.target.value })} /></label>
            <label className="plo-champ"><span>Taux applicable à partir du</span><input type="date" value={nouveau.depuis} onChange={(e) => setNouveau({ ...nouveau, depuis: e.target.value })} /></label>
          </div>
          <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={g.envoi} data-ajouter-apporteur
            onClick={() => { void g.faire({ action: 'creer-apporteur', apporteur: nouveau }, `Apporteur « ${nouveau.nom.trim()} » ajouté.`).then((ok) => { if (ok) setNouveau({ nom: '', type: 'partenaire', taux: '', coutFixe: '', depuis: jour }); }); }}>
            + Ajouter l’apporteur</button>
        </>
      )}
      {g.retour}
    </section>
  );
}

export function OngletCommissions() {
  const { lu, erreur, relire } = useSuiviParametres();
  const g = useGeste(relire);
  const jour = aujourdhuiParis();
  const enVigueur = lu === null ? null : versionADate(lu.regles, jour);
  const [regle, setRegle] = useState<{ depuis: string; tauxNegociateur: string; primeLogement: string; primeParking: string } | null>(null);
  const [retro, setRetro] = useState({ negociateurId: '', mois: jour.slice(0, 7), montant: '', libelle: '' });
  return (
    <section data-onglet-commissions>
      <p className="plo-note">La commission du négociateur, comme dans le suivi mensuel : <strong>taux × (CA HT − commissions des apporteurs) + primes de
        nouvelle gestion − rétrocessions</strong>. Une nouvelle règle vaut à partir de sa date, jamais en arrière.</p>
      <Etat lu={lu} erreur={erreur} />
      {lu !== null && lu.disponible && (
        <>
          <ol className="plo-versions" data-historique-regles>
            {[...lu.regles].reverse().map((r) => (
              <li key={r.depuis} data-regle={r.depuis}>
                <p className="plo-version-titre"><strong>Applicable à partir du {dateFr(r.depuis)}</strong>
                  {enVigueur?.depuis === r.depuis && <span className="plo-pastille plo-pastille--vigueur">en vigueur</span>}
                  {r.depuis > jour && <span className="plo-pastille">à venir</span>}</p>
                <p className="plo-version-valeurs">Taux {pourcent(r.tauxNegociateur)} · prime logement {euros(r.primeLogement)} · prime parking {euros(r.primeParking)}</p>
              </li>
            ))}
          </ol>
          {regle === null ? (
            <button type="button" className="svv-btn svv-btn-outline gst-btn plo-ajout" data-nouvelle-regle
              onClick={() => { g.effacer(); setRegle({ depuis: jour, tauxNegociateur: enVigueur ? String(Math.round(enVigueur.tauxNegociateur * 1000000) / 10000).replace('.', ',') : '',
                primeLogement: enVigueur ? String(enVigueur.primeLogement).replace('.', ',') : '', primeParking: enVigueur ? String(enVigueur.primeParking).replace('.', ',') : '' }); }}>
              Nouvelle règle</button>
          ) : (
            <div className="plo-grille" data-saisie-regle>
              <label className="plo-champ"><span>Taux du négociateur (%)</span><input inputMode="decimal" value={regle.tauxNegociateur} onChange={(e) => setRegle({ ...regle, tauxNegociateur: e.target.value })} /></label>
              <label className="plo-champ"><span>Prime nouvelle gestion — logement (€)</span><input inputMode="decimal" value={regle.primeLogement} onChange={(e) => setRegle({ ...regle, primeLogement: e.target.value })} /></label>
              <label className="plo-champ"><span>Prime nouvelle gestion — parking (€)</span><input inputMode="decimal" value={regle.primeParking} onChange={(e) => setRegle({ ...regle, primeParking: e.target.value })} /></label>
              <label className="plo-champ"><span>Applicable à partir du</span><input type="date" value={regle.depuis} onChange={(e) => setRegle({ ...regle, depuis: e.target.value })} /></label>
              <span className="plo-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRegle(null)} disabled={g.envoi}>Annuler</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={g.envoi} data-enregistrer-regle
                  onClick={() => { void g.faire({ action: 'regle', regle }, 'Nouvelle règle de commission enregistrée.').then((ok) => { if (ok) setRegle(null); }); }}>Enregistrer</button>
              </span>
            </div>
          )}
          <h3 className="plo-h3">Rétrocessions</h3>
          <p className="plo-muet plo-petit-texte">Retranchées de la commission du négociateur, le mois indiqué (ex. « Alex Coms », août 2026).</p>
          <ol className="plo-versions" data-liste-retrocessions>
            {lu.retrocessions.map((r) => (
              <li key={r.id} data-retrocession={r.id}>
                <p className="plo-version-titre"><strong>{r.libelle}</strong> — {euros(r.montant)}</p>
                <p className="plo-muet plo-petit-texte">{r.negociateurLibelle} · {moisFr(r.mois)}</p>
                <button type="button" className="plo-lien" disabled={g.envoi} data-annuler-retrocession={r.id}
                  onClick={() => { void g.faire({ action: 'annuler-retrocession', id: r.id }, 'Rétrocession annulée (elle reste au journal).'); }}>Annuler cette rétrocession</button>
              </li>
            ))}
          </ol>
          <div className="plo-grille" data-ajout-retrocession>
            <label className="plo-champ"><span>Négociateur</span>
              <select className="plo-select" value={retro.negociateurId} onChange={(e) => setRetro({ ...retro, negociateurId: e.target.value })}>
                <option value="">— choisir —</option>
                {lu.negociateurs.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
              </select></label>
            <label className="plo-champ"><span>Mois</span><input type="month" value={retro.mois} onChange={(e) => setRetro({ ...retro, mois: e.target.value })} /></label>
            <label className="plo-champ"><span>Montant (€)</span><input inputMode="decimal" value={retro.montant} onChange={(e) => setRetro({ ...retro, montant: e.target.value })} /></label>
            <label className="plo-champ"><span>Libellé</span><input value={retro.libelle} placeholder="ex. Alex Coms" onChange={(e) => setRetro({ ...retro, libelle: e.target.value })} /></label>
          </div>
          <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={g.envoi} data-ajouter-retrocession
            onClick={() => {
              const n = lu.negociateurs.find((x) => String(x.id) === retro.negociateurId);
              void g.faire({ action: 'retrocession', retrocession: { negociateurId: n?.id ?? null, negociateurLibelle: n?.libelle ?? '', mois: retro.mois, montant: retro.montant, libelle: retro.libelle } },
                'Rétrocession enregistrée.').then((ok) => { if (ok) setRetro({ ...retro, montant: '', libelle: '' }); });
            }}>+ Ajouter la rétrocession</button>
        </>
      )}
      {g.retour}
    </section>
  );
}

export const CSS_ONGLETS_SUIVI = `
.plo-select{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-surface);width:100%}
`;
