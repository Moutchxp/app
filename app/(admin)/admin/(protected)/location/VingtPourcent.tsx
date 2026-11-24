'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { CSS_LOCATION_ECRANS } from './commun';
import { ChampNombre } from './ChampNombre';
import { FicheCopropriete } from '../gestion/FicheCopropriete';
import { arreteFr } from '../../../../lib/location/arreteComptes';
import {
  classerVingtPourcent, joursRestantsVingt, LIBELLE_MANQUE, MENTION_DATE_PROVISOIRE, montantFr, TITRE_RESTITUTIONS_FAITES, verifierRestitution, type RestitutionFaite, libelleAlerte, libelleExercice, nombreCoproprietesACompleter, TITRES_CATEGORIES, TITRE_VINGT_POURCENT,
  type CategorieVingt, type GroupeManquant, type LigneDatesManquantes, type LigneVingtPourcent, type SuiviVingtLu,
} from '../../../../lib/location/vingtPourcent';

/**
 * ══ 🔴🔴 « 20 % À RESTITUER » (Arno, 23/11/2026) ═════════════════════════════════════════════════════════════════════════════════════════════════
 * En tête, la rubrique « DATES MANQUANTES » : les copropriétés d'au moins un locataire en attente, à qui il manque la dernière AGO et/ou la date
 * d'arrêté des comptes — ce qui manque, les locataires concernés, « Compléter la fiche Copropriété » (la fenêtre de la fiche, la même que dans
 * l'annuaire ; à sa fermeture la liste se relit : une copropriété complétée en sort). Puis les locataires sortis avec 20 % retenus : logement,
 * copropriété, date de sortie, exercice concerné, AGO qui compte (projetée / officielle, « incertaine » si besoin), limite de restitution,
 * alerte (toujours en mots). Tout est CALCULÉ à la lecture (`lireSuiviVingtPourcent`), rien n'est stocké par locataire. LECTURE SEULE.
 * 🔴🔴 Arno (24/11/2026) — CINQ CATÉGORIES EXCLUSIVES (`classerVingtPourcent`) : « Dates manquantes » (par copropriété, chaque locataire concerné
 * avec sa ligne complète dessous — rien n'est masqué), « Urgence », « AG passée — restitution à faire », « À préparer », « En attente » ; chacune
 * repliable, avec son compteur, triée de la restitution la plus urgente à la plus lointaine.
 * Le même écran sert la Location (`/api/admin/location`) et la Gestion (`/api/admin/gestion/preavis`). Jetons --color-svv-* ; cibles ≥ 44 px.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` (les types du dépôt seulement).
 */


const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** 🔴 Arno (24/11/2026) — les gestes (« Restitution faite », « Annuler ») passent par la route de la Location, depuis la Gestion comme depuis la Location
 *  (la route de la Gestion reste en lecture seule). */
export const API_GESTES_VINGT = '/api/admin/location';
type Geste = (corps: Record<string, unknown>) => Promise<string | null>;
const geste: Geste = async (corps) => {
  try {
    const r = await fetch(API_GESTES_VINGT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string };
    return d.etat === 'ok' ? null : d.motif ?? (r.status === 403 ? 'Accès refusé : droit « Location » nécessaire.' : 'Enregistrement impossible.');
  } catch { return 'Enregistrement impossible : le serveur n’a pas répondu.'; }
};

export { nombreCoproprietesACompleter, TITRE_VINGT_POURCENT };

export function EcranVingtPourcent({ api, retour }: { api: string; retour?: ReactNode }) {
  const [lu, setLu] = useState<{ etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; data: SuiviVingtLu }>({ etat: 'charge' });
  const [version, setVersion] = useState(0);
  const [fiche, setFiche] = useState<LigneDatesManquantes | null>(null);
  const [restituer, setRestituer] = useState<LigneVingtPourcent | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${api}?vingtPourcent=1&v=${version}`, { cache: 'no-store' })
      .then(async (r) => ({ statut: r.status, d: await r.json() as { etat?: string; data?: SuiviVingtLu; message?: string } }))
      .then(({ statut, d }) => {
        if (!vivant) return;
        if (d.etat === 'ok' && d.data) setLu({ etat: 'ok', data: d.data });
        else setLu({ etat: 'erreur', message: statut === 403 ? 'Accès refusé.' : d.message ?? 'Lecture impossible.' });
      })
      .catch(() => { if (vivant) setLu({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [api, version]);
  return (
    <div className="loc-page vgp" data-ecran-vingt-pourcent>
      <style>{CSS_LOCATION_ECRANS + CSS_VINGT_POURCENT}</style>
      {retour}
      <header className="svv-page-head">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">{TITRE_VINGT_POURCENT}</h1></div>
        <p className="svv-page-sub">Les locataires sortis avec 20 % du dépôt de garantie retenus : l’AGO qui arrête leurs comptes et la date limite de restitution (un mois après l’AGO).</p>
      </header>
      {lu.etat === 'charge' ? <p className="loc-muet" role="status">Lecture…</p>
        : lu.etat === 'erreur' ? <p className="cp-refus" role="alert">{lu.message}</p> : <>
          {(() => {
            const cl = classerVingtPourcent(lu.data);
            return <>
              <DatesManquantes lignes={lu.data.manquantes} groupes={cl.manquantes} onCompleter={setFiche} onRestituer={setRestituer} />
              {(['urgence', 'ag_passee', 'a_preparer', 'en_attente'] as const).map((k) => <Categorie key={k} cle={k} lignes={cl[k]} onRestituer={setRestituer} />)}
            </>;
          })()}
          {lu.data.lignes.length === 0 && <p className="loc-muet" data-vgp-aucun>Aucun locataire sorti avec 20 % retenus.</p>}
          <RestitutionsFaites faites={lu.data.faites ?? []} onAnnule={() => setVersion((v) => v + 1)} />
          <AlerteDuLundi api={api} />
        </>}
      {restituer !== null && lu.etat === 'ok' && <FenetreRestitution l={restituer} aujourdhui={lu.data.aujourdhui}
        onFermer={(fait) => { setRestituer(null); if (fait) setVersion((v) => v + 1); }} />}
      {fiche !== null && <FicheCopropriete immeuble={fiche.immeuble} lotId={fiche.immeuble === null ? fiche.lotId : null}
        onFerme={() => { setFiche(null); setVersion((v) => v + 1); }} />}
    </div>
  );
}

/** 🔴 Arno (24/11/2026) — une catégorie (b à e) : titre, compteur, repliable ; lignes par date limite croissante. */
function Categorie({ cle, lignes, onRestituer }: { cle: Exclude<CategorieVingt, 'manquantes'>; lignes: readonly LigneVingtPourcent[]; onRestituer: (l: LigneVingtPourcent) => void }) {
  return (
    <section className={`vgp-bloc vgp-cat vgp-cat--${cle}${cle === 'urgence' && lignes.length > 0 ? ' vgp-cat--a-faire' : ''}`} aria-label={TITRES_CATEGORIES[cle]} data-vgp-categorie={cle} data-vgp-nombre={lignes.length}>
      <details open className="vgp-repli">
        <summary className="vgp-titre">{TITRES_CATEGORIES[cle]} <span className={cle === 'urgence' && lignes.length > 0 ? 'vgp-pastille' : 'loc-pastille'} data-vgp-compteur>{lignes.length}</span></summary>
        {lignes.length === 0 ? <p className="loc-muet" data-vgp-categorie-vide>Aucun locataire.</p>
          : <ul className="vgp-liste">{lignes.map((l) => <LigneLocataire key={l.sortieId} l={l} onRestituer={onRestituer} />)}</ul>}
      </details>
    </section>
  );
}

/** La rubrique « Dates manquantes » : en tête de l'écran. */
function DatesManquantes({ lignes, groupes, onCompleter, onRestituer }: { lignes: readonly LigneDatesManquantes[]; groupes: readonly GroupeManquant[];
  onCompleter: (l: LigneDatesManquantes) => void; onRestituer: (l: LigneVingtPourcent) => void }) {
  // 🔴 Arno (24/11/2026) — les copropriétés dans l'ordre de leur locataire sorti le plus anciennement ; celles sans locataire classé ici, ensuite
  const ordre = new Map(groupes.map((g, i) => [g.copro.cle, i]));
  // une ligne classée ici dont la copropriété ne serait pas dans la liste lue garde sa carte (jamais une ligne perdue)
  const cartes = [...lignes, ...groupes.filter((g) => !lignes.some((m) => m.cle === g.copro.cle)).map((g) => g.copro)];
  const triees = cartes.sort((a, b) => (ordre.get(a.cle) ?? 1e9) - (ordre.get(b.cle) ?? 1e9));
  // 🔴 (Arno, 24/11/2026, 23h20) le compteur : les COPROPRIÉTÉS à compléter (la pastille) ; leurs locataires datés sont classés ailleurs
  return (
    <section className={`vgp-bloc vgp-manquantes${lignes.length > 0 ? ' vgp-manquantes--a-faire' : ''}`} aria-label="Dates manquantes" data-vgp-manquantes={lignes.length} data-vgp-categorie="manquantes" data-vgp-nombre={lignes.length}>
      <details open className="vgp-repli">
      <summary className="vgp-titre">Dates manquantes <span className={lignes.length > 0 ? 'vgp-pastille' : 'loc-pastille'} data-vgp-compteur>{lignes.length}</span></summary>
      {cartes.length === 0 ? <p className="loc-muet" data-vgp-manquantes-aucune>Toutes les copropriétés concernées ont leur dernière AGO et leur date d’arrêté des comptes.</p> : <>
        <p className="loc-muet vgp-aide">Ces copropriétés ont au moins un locataire en attente de restitution des 20 % : complétez leur fiche pour un suivi complet et fiable.</p>
        <p className="loc-muet vgp-aide" data-vgp-coproprietes-a-completer>{cartes.length} copropriété{cartes.length > 1 ? 's' : ''} à compléter.</p>
        <ul className="vgp-liste">
          {triees.map((m) => (
            <li key={m.cle} className="vgp-carte" data-vgp-manque={m.cle}>
              {/* 🔴 Arno (23/11/2026) — un bien sans copropriété : sous « Bien sans copropriété » (compté dans la pastille) */}
              {m.coproprieteId === null ? <p className="vgp-sans-copro" data-vgp-bien-sans-copro>Bien sans copropriété</p> : null}
              <p className="vgp-nom">{m.libelle}</p>
              {m.manque.length > 0 && <p className="vgp-manque" data-vgp-ce-qui-manque={m.manque.join(',')}>Manque : <strong>{m.manque.map((x) => LIBELLE_MANQUE[x]).join(' et ')}</strong></p>}
              {m.locataires.length > 0 && <p className="vgp-locataires" data-vgp-locataires={m.locataires.length}>
                {m.locataires.length} locataire{m.locataires.length > 1 ? 's' : ''} concerné{m.locataires.length > 1 ? 's' : ''} : {m.locataires.join(', ')}</p>}
              <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-completer" onClick={() => onCompleter(m)} data-vgp-completer={m.cle}>
                Compléter la fiche Copropriété</button>
              {(() => {
                const g = groupes.find((x) => x.copro.cle === m.cle);
                return g === undefined ? null : <ul className="vgp-liste vgp-sous-liste" data-vgp-lignes-manquantes={m.cle}>{g.lignes.map((l) => <LigneLocataire key={l.sortieId} l={l} onRestituer={onRestituer} />)}</ul>;
              })()}
            </li>
          ))}
        </ul>
      </>}
      </details>
    </section>
  );
}

/** Une ligne de locataire sorti avec 20 % retenus. */
function LigneLocataire({ l, onRestituer }: { l: LigneVingtPourcent; onRestituer: (l: LigneVingtPourcent) => void }) {
  const s = l.suivi;
  const alerte = s.etat === 'ok' ? s.alerte : 'sans';
  return (
    <li className={`vgp-carte vgp-carte--${alerte}`} data-vgp-sortie={l.sortieId} data-vgp-alerte={alerte}>
      <p className="vgp-nom">{l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`}</p>
      <dl className="vgp-dl">
        <div><dt>Logement</dt><dd>{l.logement ?? `Bien ${l.lotId}`}</dd></div>
        <div><dt>Copropriété</dt><dd>{l.copropriete === null ? 'Bien sans copropriété' : l.copropriete.libelle}{l.copropriete?.aRattacher ? ' (à rattacher à une copropriété)' : ''}</dd></div>
        <div><dt>Date de sortie</dt><dd>{dateFr(l.dateSortie)}</dd></div>
        <div><dt>Exercice concerné</dt><dd data-vgp-exercice>{libelleExercice(s.exercice)}{l.arrete !== null ? ` (arrêté au ${arreteFr(l.arrete)})` : ''}</dd></div>
        <div><dt>AGO qui compte</dt><dd data-vgp-ago={s.etat === 'ok' ? `${s.ago.date}:${s.ago.statut}` : 'inconnue'}>
          {s.etat !== 'ok' ? <span className="vgp-inconnue">{s.mention}</span> : <>
            <span className={s.ago.statut === 'projetee' ? 'vgp-projetee' : 'vgp-officielle'}>{dateFr(s.ago.date)} — {s.ago.statut === 'projetee' ? 'date projetée' : 'date officielle'}</span>
            {s.incertaine && <span className="vgp-incertaine" data-vgp-incertaine> · {MENTION_DATE_PROVISOIRE}</span>}
          </>}</dd></div>
        <div><dt>Restitution au plus tard le</dt><dd data-vgp-limite={s.etat === 'ok' ? s.limite : ''}>{s.etat === 'ok' ? dateFr(s.limite) : '—'}</dd></div>
        {/* 🔴 Arno (24/11/2026) — les jours restants ; dépassée : « Date limite dépassée de N jours », en rouge */}
        {s.etat === 'ok' && (() => {
          const j = joursRestantsVingt(s.joursRestants);
          return <div><dt>Jours restants</dt><dd className={j.depasse ? 'vgp-depasse' : undefined} data-vgp-jours={s.joursRestants}>{j.texte}</dd></div>;
        })()}
      </dl>
      {s.etat === 'ok'
        ? <p className={`vgp-alerte vgp-alerte--${s.alerte}`} role={s.alerte === 'a_venir' ? undefined : 'status'} data-vgp-alerte-texte>{libelleAlerte(s.alerte, s.limite, s.joursRestants)}</p>
        : <p className="vgp-alerte vgp-alerte--sans" data-vgp-alerte-texte>Pas de date limite — {s.mention} : à compléter dans la fiche Copropriété.</p>}
      {/* 🔴 Arno (24/11/2026) — « Restitution faite » : la fenêtre ; enregistrée, la ligne quitte la liste (section « Restitutions faites ») */}
      <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => onRestituer(l)} data-vgp-restituer={l.sortieId}>Restitution faite</button>
    </li>
  );
}

/** 🔴 Arno (24/11/2026) — la fenêtre « Restitution faite » : date, montant restitué, montant retenu au titre des charges (facultatif), commentaire. */
function FenetreRestitution({ l, aujourdhui, onFermer }: { l: LigneVingtPourcent; aujourdhui: string; onFermer: (fait: boolean) => void }) {
  const titreId = useId();
  const [date, setDate] = useState(aujourdhui);
  const [restitue, setRestitue] = useState('');
  const [retenu, setRetenu] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !envoi) onFermer(false); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, onFermer]);
  const enregistrer = async (): Promise<void> => {
    const v = verifierRestitution({ date, montantRestitue: restitue, montantRetenuCharges: retenu, commentaire }, { dateSortie: l.dateSortie, aujourdhui });
    if (!v.ok) { setRefus(v.motif); return; }
    setEnvoi(true); setRefus(null);
    const motif = await geste({ action: 'restitution-20-faite', sortieId: l.sortieId, date, montantRestitue: restitue, montantRetenuCharges: retenu, commentaire });
    setEnvoi(false);
    if (motif !== null) { setRefus(motif); return; }
    onFermer(true);
  };
  return (
    <div className="vgp-voile" data-fenetre-restitution={l.sortieId}>
      <div className="vgp-boite" role="dialog" aria-modal="true" aria-labelledby={titreId}>
        <h2 id={titreId} className="vgp-titre">Restitution faite — {l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`}</h2>
        <p className="loc-muet vgp-aide">{l.logement ?? `Bien ${l.lotId}`} — sortie le {dateFr(l.dateSortie)}. Enregistrée, la restitution est journalisée dans le dossier du locataire
          et la ligne quitte la liste (elle reste dans « {TITRE_RESTITUTIONS_FAITES} », où elle peut être annulée).</p>
        <label className="vgp-champ"><span>Date de restitution *</span>
          <input type="date" value={date} max={aujourdhui} min={l.dateSortie} onChange={(e) => setDate(e.target.value)} disabled={envoi} data-restitution-date /></label>
        <label className="vgp-champ"><span>Montant restitué (€) *</span>
          <ChampNombre value={restitue} placeholder="ex. 312,50" onChange={(e) => setRestitue(e.target.value)} disabled={envoi} data-restitution-montant /></label>
        <label className="vgp-champ"><span>Montant retenu au titre des charges (€, facultatif)</span>
          <ChampNombre value={retenu} placeholder="ex. 40,00" onChange={(e) => setRetenu(e.target.value)} disabled={envoi} data-restitution-retenu /></label>
        <label className="vgp-champ"><span>Commentaire (facultatif)</span>
          <textarea value={commentaire} rows={3} onChange={(e) => setCommentaire(e.target.value)} disabled={envoi} data-restitution-commentaire /></label>
        {refus !== null && <p className="cp-refus" role="alert" data-restitution-refus>{refus}</p>}
        <div className="vgp-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onFermer(false)} disabled={envoi} data-restitution-annuler>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void enregistrer(); }} disabled={envoi} data-restitution-enregistrer>
            {envoi ? 'Enregistrement…' : 'Enregistrer la restitution'}</button>
        </div>
      </div>
    </div>
  );
}

/** 🔴 Arno (24/11/2026) — « Restitutions faites (N) », repliée, en bas de page : l'historique, avec « Annuler » (journalisé) en cas d'erreur. */
function RestitutionsFaites({ faites, onAnnule }: { faites: readonly RestitutionFaite[]; onAnnule: () => void }) {
  const [confirmer, setConfirmer] = useState<number | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const annuler = async (id: number): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const motif = await geste({ action: 'restitution-20-annuler', restitutionId: id });
    setEnvoi(false);
    if (motif !== null) { setRefus(motif); return; }
    setConfirmer(null); onAnnule();
  };
  return (
    <section className="vgp-bloc vgp-faites" aria-label={TITRE_RESTITUTIONS_FAITES} data-vgp-faites={faites.length}>
      <details className="vgp-repli">
        <summary className="vgp-titre">{TITRE_RESTITUTIONS_FAITES} ({faites.length})</summary>
        {faites.length === 0 ? <p className="loc-muet" data-vgp-faites-aucune>Aucune restitution enregistrée.</p> : (
          <ul className="vgp-liste">{faites.map((f) => (
            <li key={f.id} className="vgp-carte" data-vgp-faite={f.id}>
              <p className="vgp-nom">{f.locataires.length > 0 ? f.locataires.join(', ') : `Sortie n° ${f.sortieId}`}</p>
              <dl className="vgp-dl">
                <div><dt>Logement</dt><dd>{f.logement ?? '—'}</dd></div>
                <div><dt>Date de sortie</dt><dd>{dateFr(f.dateSortie)}</dd></div>
                <div><dt>Restituée le</dt><dd data-vgp-faite-date>{dateFr(f.date)}</dd></div>
                <div><dt>Montant restitué</dt><dd data-vgp-faite-montant>{montantFr(f.montantRestitue)}</dd></div>
                {f.montantRetenuCharges !== null && <div><dt>Retenu au titre des charges</dt><dd data-vgp-faite-retenu>{montantFr(f.montantRetenuCharges)}</dd></div>}
                {f.commentaire !== null && <div><dt>Commentaire</dt><dd>{f.commentaire}</dd></div>}
                <div><dt>Enregistrée par</dt><dd>{f.par}, le {dateFr(f.le.slice(0, 10))} à {f.le.slice(11, 16)}</dd></div>
              </dl>
              {confirmer === f.id ? (
                <div className="vgp-confirmer" role="group" aria-label="Confirmer l’annulation" data-vgp-confirmer-annulation={f.id}>
                  <p className="vgp-aide">Annuler cette restitution ? Elle reste dans l’historique du dossier, et le locataire revient dans la liste « 20 % à restituer ».</p>
                  <div className="vgp-actions">
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setConfirmer(null)} disabled={envoi}>Non, garder</button>
                    <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void annuler(f.id); }} disabled={envoi} data-vgp-annuler-oui={f.id}>Oui, annuler</button>
                  </div>
                  {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
                </div>
              ) : <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => { setRefus(null); setConfirmer(f.id); }} data-vgp-annuler={f.id}>Annuler</button>}
            </li>))}</ul>
        )}
      </details>
    </section>
  );
}

/** 🔴 Arno (24/11/2026) — LE MODE ESSAI de l'alerte du lundi : le mail tel qu'il partirait, lu (GET) — rien n'est envoyé, rien n'est écrit. */
function AlerteDuLundi({ api }: { api: string }) {
  const [vu, setVu] = useState<{ etat: 'rien' } | { etat: 'charge' } | { etat: 'erreur'; message: string }
    | { etat: 'ok'; mail: { a: string[]; objet: string; texte: string; nombre: number } | null }>({ etat: 'rien' });
  const voir = async (): Promise<void> => {
    setVu({ etat: 'charge' });
    try {
      const r = await fetch(`${api}?alerteVingtEssai=1`, { cache: 'no-store' });
      const d = await r.json() as { etat?: string; data?: { mail?: { a: string[]; objet: string; texte: string; nombre: number } | null }; message?: string };
      setVu(d.etat === 'ok' ? { etat: 'ok', mail: d.data?.mail ?? null } : { etat: 'erreur', message: d.message ?? 'Lecture impossible.' });
    } catch { setVu({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' }); }
  };
  return (
    <section className="vgp-bloc" aria-label="Alerte du lundi" data-vgp-alerte-lundi>
      <details className="vgp-repli">
        <summary className="vgp-titre">Alerte du lundi</summary>
        <p className="loc-muet vgp-aide">Chaque lundi matin (heure de Paris), si au moins un locataire est en « Urgence », un mail récapitulatif part à l’adresse de la Gestion.
          Aucun mail si personne n’est en urgence ; jamais deux fois le même lundi.</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-restituer" onClick={() => { void voir(); }} disabled={vu.etat === 'charge'} data-vgp-alerte-essai>
          Voir le mail tel qu’il partirait (essai : rien n’est envoyé)</button>
        {vu.etat === 'charge' && <p className="loc-muet" role="status">Lecture…</p>}
        {vu.etat === 'erreur' && <p className="cp-refus" role="alert">{vu.message}</p>}
        {vu.etat === 'ok' && (vu.mail === null
          ? <p className="loc-muet" data-vgp-alerte-aucune>Aucun locataire en « Urgence » : aucun mail ne partirait.</p>
          : <div className="vgp-carte" data-vgp-alerte-apercu>
            <dl className="vgp-dl"><div><dt>À</dt><dd>{vu.mail.a.join(', ')}</dd></div><div><dt>Objet</dt><dd data-vgp-alerte-objet>{vu.mail.objet}</dd></div></dl>
            <pre className="vgp-texte" data-vgp-alerte-texte-mail>{vu.mail.texte}</pre>
          </div>)}
      </details>
    </section>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_VINGT_POURCENT = `
.vgp{display:flex;flex-direction:column;gap:14px;min-width:0}
.vgp-bloc{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--color-svv-line);border-radius:16px;background:var(--color-svv-field);min-width:0}
.vgp-manquantes--a-faire,.vgp-cat--a-faire{border-color:var(--color-svv-red)}
.vgp-repli{display:flex;flex-direction:column;gap:10px;min-width:0}
.vgp-repli > summary{cursor:pointer;min-height:44px;list-style:none}
.vgp-repli > summary::-webkit-details-marker{display:none}
.vgp-repli > summary::before{content:'▸';display:inline-block;width:1em;color:var(--color-svv-muted)}
.vgp-repli[open] > summary::before{content:'▾'}
.vgp-repli[open] > summary{margin-bottom:10px}
.vgp-sous-liste{margin-top:6px;padding-left:10px;border-left:3px solid var(--color-svv-line-strong)}
.vgp-dl dd.vgp-depasse{color:var(--color-svv-red);font-weight:800}
.vgp-titre{margin:0;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vgp-pastille{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--color-svv-red);color:var(--color-svv-surface);font-size:.8rem;font-weight:800}
.vgp-aide{margin:0;font-size:.9rem}
.vgp-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.vgp-carte{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface);min-width:0;overflow-wrap:anywhere}
.vgp-carte--depassee{border-left:4px solid var(--color-svv-red)}
.vgp-carte--proche{border-left:4px solid var(--color-svv-urgence-orange)}
.vgp-nom{margin:0;font-weight:800;color:var(--color-svv-ink)}
.vgp-sans-copro{margin:0;align-self:flex-start;padding:2px 10px;border-radius:999px;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.02em;background:var(--color-svv-amber-soft);color:var(--color-svv-ink);border:1px solid var(--color-svv-urgence-orange)}
.vgp-manque,.vgp-locataires{margin:0;color:var(--color-svv-ink)}
.vgp-completer{align-self:flex-start;min-height:44px;width:auto}
.vgp-dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:6px 16px;margin:0}
.vgp-dl > div{display:flex;flex-direction:column;gap:1px;min-width:0}
.vgp-dl dt{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.vgp-dl dd{margin:0;color:var(--color-svv-ink)}
.vgp-projetee{font-style:italic;text-decoration:underline dashed;text-underline-offset:3px}
.vgp-officielle{font-weight:700}
.vgp-incertaine,.vgp-inconnue{color:var(--color-svv-urgence-orange);font-weight:700}
.vgp-alerte{margin:0;padding:8px 10px;border-radius:10px;font-weight:700;background:var(--color-svv-field);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong)}
.vgp-alerte--depassee{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);border-color:var(--color-svv-red)}
.vgp-alerte--proche{background:var(--color-svv-amber-soft);border-color:var(--color-svv-urgence-orange)}
.vgp-alerte--sans{border-style:dashed;color:var(--color-svv-muted)}
.vgp-restituer{align-self:flex-start;min-height:44px;width:auto}
.vgp-texte{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.88rem;color:var(--color-svv-ink)}
.vgp-voile{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.vgp-boite{width:min(560px,100%);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.vgp-champ{display:flex;flex-direction:column;gap:3px;font-size:.88rem;font-weight:700;min-width:0}
.vgp-champ input,.vgp-champ textarea{min-height:44px;box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;
  background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:400}
.vgp-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.vgp-actions .gst-btn{min-height:44px;width:auto;margin:0}
.vgp-confirmer{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field)}
@media (max-width:640px){ .vgp-completer,.vgp-restituer{align-self:stretch;width:100%} .vgp-actions{flex-direction:column-reverse} .vgp-actions .gst-btn{width:100%} }
`;
