'use client';

import { type KeyboardEvent, useCallback, useEffect, useState } from 'react';
import {
  type Apporteur, aRattacher, collegueADate, LIBELLE_TYPE_APPORTEUR, pourcent, type RegleCommission, TYPES_APPORTEUR, type TypeApporteur, versionADate,
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
  collegues: { id: number; libelle: string }[];
  annuaire: boolean;
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
        retrocessions: Array.isArray(x.retrocessions) ? x.retrocessions : [], negociateurs: Array.isArray(x.negociateurs) ? x.negociateurs : [],
        collegues: Array.isArray(x.collegues) ? x.collegues : [], annuaire: x.annuaire === true });
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

/**
 * 🔴 Arno (23/10/2026) — une saisie ouverte dans une ligne (fiche, nouveau taux, nouvelle règle) se ferme QUAND ON VEUT, sans
 * condition : son bouton « Annuler » / « Fermer la fiche » ou Échap (qui ne ferme alors que la ligne, pas la roue).
 */
const echap = (fermer: () => void) => (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } };

const VIDE_APPORTEUR =(jour: string) => ({ nom: '', type: 'partenaire' as TypeApporteur, taux: '', coutFixe: '', depuis: jour, collegueId: '', societe: '', telephone: '', email: '' });
type Cumul = { parAnnee: { annee: number; nb: number; ca: number; commission: number }[]; parMois: { mois: string; nb: number; ca: number; commission: number }[] };

/** Le cumul d'un apporteur (affaires, CA apporté, honoraires d'apporteur), par an et par mois — lu à l'ouverture de sa fiche. */
function CumulApporteur({ id }: { id: number }) {
  const [c, setC] = useState<Cumul | null | 'erreur'>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_SUIVI}?vue=cumul-apporteur&id=${id}`, { cache: 'no-store' }).then((r) => r.json())
      .then((d: { etat?: string; data?: Cumul }) => { if (vivant) setC(d.etat === 'ok' && d.data && Array.isArray(d.data.parAnnee) ? d.data : 'erreur'); })
      .catch(() => { if (vivant) setC('erreur'); });
    return () => { vivant = false; };
  }, [id]);
  if (c === null) return <p className="plo-muet plo-petit-texte" role="status">Lecture du cumul…</p>;
  if (c === 'erreur') return <p className="plo-muet plo-petit-texte">Cumul indisponible.</p>;
  if (c.parAnnee.length === 0) return <p className="plo-muet plo-petit-texte" data-cumul-vide>Aucune affaire apportée pour l’instant.</p>;
  const ligne = (mot: string, x: { nb: number; ca: number; commission: number }) => (
    <tr key={mot}><th scope="row">{mot}</th><td data-mot="Affaires">{x.nb}</td><td data-mot="CA apporté">{euros(x.ca)}</td><td data-mot="Honoraires d’apporteur">{euros(x.commission)}</td></tr>
  );
  return (
    <table className="plo-cumul" data-cumul-apporteur>
      <thead><tr><th scope="col">Période</th><th scope="col">Affaires</th><th scope="col">CA apporté</th><th scope="col">Honoraires d’apporteur</th></tr></thead>
      <tbody>
        {c.parAnnee.map((a) => ligne(`Année ${a.annee}`, a))}
        {c.parMois.map((m) => ligne(moisFr(`${m.mois}-01`), m))}
      </tbody>
    </table>
  );
}

export function OngletApporteurs() {
  const { lu, erreur, relire } = useSuiviParametres();
  const g = useGeste(relire);
  const jour = aujourdhuiParis();
  const [nouveau, setNouveau] = useState(VIDE_APPORTEUR(jour));
  const [version, setVersion] = useState<{ id: number; taux: string; coutFixe: string; depuis: string } | null>(null);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [fiche, setFiche] = useState<{ societe: string; telephone: string; email: string; type: TypeApporteur }>({ societe: '', telephone: '', email: '', type: 'partenaire' });
  const [rattachement, setRattachement] = useState<{ collegueId: string; depuis: string }>({ collegueId: '', depuis: jour });
  /** Arno (23/10/2026) — « À rattacher (N) » : ne montrer que les apporteurs sans collègue. */
  const [seulementARattacher, setSeulementARattacher] = useState(false);
  const annuaire = lu?.annuaire === true;
  const ouvrir = (a: Apporteur) => {
    g.effacer();
    if (ouverte === a.id) { setOuverte(null); return; }
    setOuverte(a.id);
    setFiche({ societe: a.societe ?? '', telephone: a.telephone ?? '', email: a.email ?? '', type: a.type });
    setRattachement({ collegueId: '', depuis: (a.collegues ?? []).length === 0 ? `${jour.slice(0, 4)}-01-01` : jour });
  };
  return (
    <section data-onglet-apporteurs>
      <p className="plo-note">L’annuaire des apporteurs d’affaires et leur commission (en % des honoraires HT du bail). <strong>Un nouveau taux crée une nouvelle version</strong> :
        il vaut pour les baux signés à partir de sa date ; les baux déjà signés gardent le leur.{annuaire && <> Chaque apporteur est <strong>rattaché à un collègue</strong> ;
        un changement de collègue est daté : les affaires passées restent au collègue de l’époque.</>}</p>
      <Etat lu={lu} erreur={erreur} />
      {lu !== null && lu.disponible && (
        <>
          {annuaire && lu.apporteurs.some((a) => !a.archive && aRattacher(a)) && (
            <p className="plo-alerte" role="status" data-alerte-a-rattacher>
              {lu.apporteurs.filter((a) => !a.archive && aRattacher(a)).length} apporteur(s) « à rattacher » : tant qu’ils n’ont pas de collègue, ils ne peuvent pas être choisis pour une nouvelle location.</p>
          )}
          {annuaire && (
            <p className="plo-filtre-rattacher">
              <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" aria-pressed={seulementARattacher} onClick={() => setSeulementARattacher((x) => !x)} data-filtre-a-rattacher>
                {seulementARattacher ? 'Tous les apporteurs' : `À rattacher (${lu.apporteurs.filter((a) => !a.archive && aRattacher(a)).length})`}</button>
            </p>
          )}
          <ol className="plo-versions" data-liste-apporteurs>
            {lu.apporteurs.filter((a) => !a.archive && (!seulementARattacher || aRattacher(a))).map((a) => {
              const enVigueur = versionADate(a.baremes, jour);
              const orphelin = annuaire && aRattacher(a);
              const collegue = collegueADate(a, jour);
              return (
                <li key={a.id} data-apporteur={a.id} className={orphelin ? 'plo-a-rattacher' : undefined}>
                  <p className="plo-version-titre"><strong>{a.nom}</strong><span className="plo-pastille">{LIBELLE_TYPE_APPORTEUR[a.type]}</span>
                    {annuaire && (orphelin
                      ? <span className="plo-pastille plo-pastille--orange" data-a-rattacher>à rattacher</span>
                      : <span className="plo-pastille plo-pastille--vigueur" data-collegue-apporteur>{collegue?.collegueLibelle}</span>)}</p>
                  {annuaire && (a.societe || a.telephone || a.email) && <p className="plo-muet plo-petit-texte">{[a.societe, a.telephone, a.email].filter(Boolean).join(' · ')}</p>}
                  <p className="plo-version-valeurs">{enVigueur === null ? 'Aucun taux en vigueur aujourd’hui.'
                    : `Taux ${pourcent(enVigueur.taux)}${enVigueur.coutFixeMensuel > 0 ? ` · coût fixe ${euros(enVigueur.coutFixeMensuel)} / mois` : ''} (depuis le ${dateFr(enVigueur.depuis)})`}</p>
                  {a.baremes.length > 1 && (
                    <p className="plo-muet plo-petit-texte">Historique : {a.baremes.map((b) => `${dateFr(b.depuis)} → ${pourcent(b.taux)}${b.coutFixeMensuel > 0 ? ` + ${euros(b.coutFixeMensuel)}/mois` : ''}`).join(' · ')}</p>
                  )}
                  {version?.id === a.id ? (
                    <div className="plo-grille" data-nouvelle-version={a.id} onKeyDown={echap(() => setVersion(null))}>
                      <label className="plo-champ"><span>Taux (%)</span><input inputMode="decimal" value={version.taux} onChange={(e) => setVersion({ ...version, taux: e.target.value })} /></label>
                      <label className="plo-champ"><span>Coût fixe mensuel (€)</span><input inputMode="decimal" value={version.coutFixe} onChange={(e) => setVersion({ ...version, coutFixe: e.target.value })} /></label>
                      <label className="plo-champ"><span>Applicable à partir du</span><input type="date" value={version.depuis} onChange={(e) => setVersion({ ...version, depuis: e.target.value })} /></label>
                      <span className="plo-boutons" style={{ alignItems: 'end' }}>
                        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setVersion(null)} data-annuler-version>Annuler</button>
                        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={g.envoi} data-enregistrer-version
                          onClick={() => { void g.faire({ action: 'bareme-apporteur', apporteurId: a.id, bareme: { taux: version.taux, coutFixe: version.coutFixe, depuis: version.depuis } },
                            `Nouveau taux de ${a.nom} enregistré.`).then((ok) => { if (ok) setVersion(null); }); }}>Enregistrer</button>
                      </span>
                    </div>
                  ) : (
                    <span className="plo-gestes-ligne">
                      <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" data-nouveau-taux={a.id}
                        onClick={() => { g.effacer(); setVersion({ id: a.id, taux: enVigueur === null ? '' : String(Math.round(enVigueur.taux * 1000000) / 10000).replace('.', ','), coutFixe: enVigueur === null ? '' : String(enVigueur.coutFixeMensuel).replace('.', ','), depuis: jour }); }}>
                        Nouveau taux</button>
                      {annuaire && <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" aria-expanded={ouverte === a.id} onClick={() => ouvrir(a)} data-ouvrir-fiche={a.id}>
                        {ouverte === a.id ? 'Fermer la fiche' : 'Fiche et cumul'}</button>}
                    </span>
                  )}
                  {annuaire && ouverte === a.id && (
                    <div className="plo-fiche" data-fiche-apporteur={a.id} onKeyDown={echap(() => { g.effacer(); setOuverte(null); })}>
                      <h4 className="plo-h4">Fiche</h4>
                      <div className="plo-grille">
                        <label className="plo-champ"><span>Société</span><input value={fiche.societe} onChange={(e) => setFiche({ ...fiche, societe: e.target.value })} data-fiche-societe /></label>
                        <label className="plo-champ"><span>Type</span>
                          <select className="plo-select" value={fiche.type} onChange={(e) => setFiche({ ...fiche, type: e.target.value as TypeApporteur })}>
                            {TYPES_APPORTEUR.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_APPORTEUR[t]}</option>)}
                          </select></label>
                        <label className="plo-champ"><span>Téléphone</span><input inputMode="tel" value={fiche.telephone} onChange={(e) => setFiche({ ...fiche, telephone: e.target.value })} /></label>
                        <label className="plo-champ"><span>E-mail</span><input inputMode="email" value={fiche.email} onChange={(e) => setFiche({ ...fiche, email: e.target.value })} /></label>
                      </div>
                      <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={g.envoi} data-enregistrer-fiche
                        onClick={() => { void g.faire({ action: 'modifier-apporteur', apporteurId: a.id, fiche }, `Fiche de ${a.nom} enregistrée.`); }}>Enregistrer la fiche</button>
                      <h4 className="plo-h4">Collègue de rattachement</h4>
                      {(a.collegues ?? []).length === 0
                        ? <p className="plo-alerte" role="status">À rattacher : choisissez le collègue et la date à partir de laquelle ses affaires lui reviennent.</p>
                        : <p className="plo-muet plo-petit-texte" data-historique-collegues>{(a.collegues ?? []).map((c) => `depuis le ${dateFr(c.depuis)} : ${c.collegueLibelle}`).join(' · ')}</p>}
                      <div className="plo-grille">
                        <label className="plo-champ"><span>Collègue</span>
                          <select className="plo-select" value={rattachement.collegueId} onChange={(e) => setRattachement({ ...rattachement, collegueId: e.target.value })} data-rattacher-collegue>
                            <option value="">— choisir —</option>
                            {lu.collegues.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
                          </select></label>
                        <label className="plo-champ"><span>À partir du</span><input type="date" value={rattachement.depuis} onChange={(e) => setRattachement({ ...rattachement, depuis: e.target.value })} data-rattacher-depuis /></label>
                      </div>
                      <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={g.envoi} data-rattacher
                        onClick={() => { void g.faire({ action: 'rattacher-apporteur', apporteurId: a.id, rattachement: { collegueId: rattachement.collegueId === '' ? null : Number(rattachement.collegueId), depuis: rattachement.depuis } },
                          `${a.nom} est rattaché à ${lu.collegues.find((c) => String(c.id) === rattachement.collegueId)?.libelle ?? 'son collègue'}.`); }}>
                        {(a.collegues ?? []).length === 0 ? 'Rattacher' : 'Changer de collègue'}</button>
                      <h4 className="plo-h4">Cumul</h4>
                      <CumulApporteur id={a.id} />
                      <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" onClick={() => { g.effacer(); setOuverte(null); }} data-fermer-fiche={a.id}>Fermer la fiche</button>
                    </div>
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
            {annuaire && (
              <label className="plo-champ"><span>Collègue de rattachement *</span>
                <select className="plo-select" value={nouveau.collegueId} onChange={(e) => setNouveau({ ...nouveau, collegueId: e.target.value })} data-collegue-apporteur-nouveau>
                  <option value="">— choisir —</option>
                  {lu.collegues.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
                </select></label>
            )}
            <label className="plo-champ"><span>Taux (%)</span><input inputMode="decimal" value={nouveau.taux} placeholder="ex. 10" onChange={(e) => setNouveau({ ...nouveau, taux: e.target.value })} data-taux-apporteur /></label>
            <label className="plo-champ"><span>Coût fixe mensuel (€, facultatif)</span><input inputMode="decimal" value={nouveau.coutFixe} onChange={(e) => setNouveau({ ...nouveau, coutFixe: e.target.value })} /></label>
            <label className="plo-champ"><span>Taux applicable à partir du</span><input type="date" value={nouveau.depuis} onChange={(e) => setNouveau({ ...nouveau, depuis: e.target.value })} /></label>
            {annuaire && (
              <>
                <label className="plo-champ"><span>Société (facultatif)</span><input value={nouveau.societe} onChange={(e) => setNouveau({ ...nouveau, societe: e.target.value })} /></label>
                <label className="plo-champ"><span>Téléphone (facultatif)</span><input inputMode="tel" value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} /></label>
                <label className="plo-champ"><span>E-mail (facultatif)</span><input inputMode="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} /></label>
              </>
            )}
          </div>
          <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={g.envoi} data-ajouter-apporteur
            onClick={() => { void g.faire({ action: 'creer-apporteur', apporteur: { ...nouveau, collegueId: nouveau.collegueId === '' ? null : Number(nouveau.collegueId) } }, `Apporteur « ${nouveau.nom.trim()} » ajouté.`)
              .then((ok) => { if (ok) setNouveau(VIDE_APPORTEUR(jour)); }); }}>
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
            <div className="plo-grille" data-saisie-regle onKeyDown={echap(() => setRegle(null))}>
              <label className="plo-champ"><span>Taux du négociateur (%)</span><input inputMode="decimal" value={regle.tauxNegociateur} onChange={(e) => setRegle({ ...regle, tauxNegociateur: e.target.value })} /></label>
              <label className="plo-champ"><span>Prime nouvelle gestion — logement (€)</span><input inputMode="decimal" value={regle.primeLogement} onChange={(e) => setRegle({ ...regle, primeLogement: e.target.value })} /></label>
              <label className="plo-champ"><span>Prime nouvelle gestion — parking (€)</span><input inputMode="decimal" value={regle.primeParking} onChange={(e) => setRegle({ ...regle, primeParking: e.target.value })} /></label>
              <label className="plo-champ"><span>Applicable à partir du</span><input type="date" value={regle.depuis} onChange={(e) => setRegle({ ...regle, depuis: e.target.value })} /></label>
              <span className="plo-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRegle(null)} data-annuler-regle>Annuler</button>
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
.plo-a-rattacher{border-color:var(--color-svv-amber) !important;background:var(--color-svv-amber-soft)}
.plo-pastille--orange{background:var(--color-svv-amber);color:var(--color-svv-surface);border-color:transparent}
.plo-gestes-ligne{display:flex;flex-wrap:wrap;gap:8px}
.plo-filtre-rattacher{margin:0 0 8px}
.plo-filtre-rattacher .svv-btn[aria-pressed="true"]{border-color:var(--color-svv-amber);color:var(--color-svv-amber)}
.plo-fiche{margin-top:10px;padding-top:10px;border-top:1px dashed var(--color-svv-line-strong);display:flex;flex-direction:column;gap:8px}
.plo-h4{margin:6px 0 0;font-size:.92rem}
.plo-cumul{width:100%;border-collapse:collapse;font-size:.88rem}
.plo-cumul th,.plo-cumul td{padding:5px 6px;border-bottom:1px solid var(--color-svv-line);text-align:right}
.plo-cumul th[scope=row],.plo-cumul thead th:first-child{text-align:left}
@media (max-width:640px){
  .plo-cumul thead{display:none}
  .plo-cumul,.plo-cumul tbody,.plo-cumul tr,.plo-cumul th,.plo-cumul td{display:block;width:100%;box-sizing:border-box}
  .plo-cumul tr{border:1px solid var(--color-svv-line);border-radius:10px;padding:4px 8px;margin-bottom:6px}
  .plo-cumul td{display:flex;justify-content:space-between;border-bottom:0}
  .plo-cumul td::before{content:attr(data-mot);color:var(--color-svv-muted);font-weight:700}
}
.plo-select{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-surface);width:100%}
`;
