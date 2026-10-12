'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  basculerConcerne, choixModifie, choixParDefaut, cleConcerne, jourFr, optionsDuBien, phraseRattachement,
  recapRattachement, tonConcerne, type Concerne, type OccupationVue,
} from '../../../../lib/gestion/locatairesEvenement';

/**
 * ══ 🔴🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — « LOCATAIRE(S) CONCERNÉ(S) : … — MODIFIER » ═══════════════════
 *
 * Sous la phrase de rattachement du formulaire d'événement. « Modifier » ouvre une petite fenêtre à cases :
 *   · LOCATAIRES ACTUELS (vert, comme les puces locataire), avec leur date d'entrée — cochés par défaut ;
 *   · ANCIENS LOCATAIRES (violet, comme les puces ancien locataire) : les deux plus récents, entrée et sortie ;
 *   · « Autre personne… » : l'annuaire (nom, e-mail, téléphone), ou une saisie libre (nom, e-mail ou téléphone
 *     facultatifs) — enregistrée sur l'événement, SANS créer de fiche.
 * Le propriétaire reste toujours rattaché. Sans action, rien ne change : seul un choix MODIFIÉ remonte (`modifie`).
 */

/** Ce que le formulaire garde : le choix, et s'il diffère du choix par défaut (seul un choix modifié s'enregistre). */
export interface ChoixConcernes { choix: Concerne[]; modifie: boolean }

const aujourdhuiParis = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/** Les occupations des biens (fiche du bien, lecture seule). `null` tant qu'on ne sait pas. */
function useOccupations(bienCles: readonly string[]): OccupationVue[] | null {
  const cle = bienCles.join(',');
  const [occ, setOcc] = useState<OccupationVue[] | null>(null);
  useEffect(() => {
    if (cle === '') { setOcc([]); return undefined; }
    let vivant = true;
    setOcc(null);
    void Promise.all(cle.split(',').map((c) => fetch(`/api/admin/gestion/annuaire?lotCle=${encodeURIComponent(c)}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; data?: { occupations?: OccupationVue[] } }>)
      .then((j) => (j.etat === 'ok' ? j.data?.occupations ?? [] : []))
      .catch(() => [] as OccupationVue[])))
      .then((l) => { if (vivant) setOcc(l.flat()); });
    return () => { vivant = false; };
  }, [cle]);
  return occ;
}

interface Trouve {
  sujet: 'proprietaire' | 'locataire'; id: number; nomAffiche: string; email: string | null; mobile: string | null;
}

/**
 * ══ 🔴🔴 LOT FENETRE-EVENEMENT-STRUCTUREE-ET-BLOC-PARTIES (Arno, 12/10/2026) — LE BLOC « PARTIES CONCERNÉES » ═══════════
 *
 * Il REMPLACE la ligne « Locataire(s) concerné(s) : … — Modifier » partout (création depuis un mail ou depuis
 * l'encart, modification d'un événement existant) : un seul composant. Les choix sont VISIBLES DIRECTEMENT :
 *   · PROPRIÉTAIRE — puce rouge, toujours rattaché : case cochée et grisée, « toujours concerné » ;
 *   · LOCATAIRES ACTUELS — puce verte, « entré le … », cochés par défaut ;
 *   · ANCIENS LOCATAIRES — puce violette, « du … au … », les deux plus récents, décochés par défaut ;
 *   · « + Autre personne… » — l'annuaire ou la saisie libre d'avant, ajoutée en ligne grise ;
 *   · bien vacant — « Aucun locataire en place à la date du mail » (ou « aujourd'hui »).
 * En pied de bloc, le récapitulatif « Sera rattaché à : … » (création), mis à jour en direct.
 *
 * 🔴 LA RÈGLE D'ENREGISTREMENT NE CHANGE PAS : sans action, rien ne change ; seul un choix MODIFIÉ remonte
 * (`modifie`), et c'est lui seul que l'appelant envoie. Rien n'est écrit ici.
 */
export function PartiesConcernees({
  bienCles, libellesDesBiens, valeur, onChange, initial = null, sansPhrase = false, proprietaires = [], jour = null,
}: {
  bienCles: readonly string[];
  libellesDesBiens: readonly string[];
  /** Le choix courant ; `null` = le choix par défaut, intact. */
  valeur: ChoixConcernes | null;
  onChange: (c: ChoixConcernes | null) => void;
  /** En modification d'un événement : le choix déjà enregistré (sinon le choix par défaut). */
  initial?: Concerne[] | null;
  /** En modification : pas de récapitulatif « Sera rattaché à : … » (l'événement l'est déjà). */
  sansPhrase?: boolean;
  /** Le ou les propriétaires du bien, quand l'appelant les connaît (sinon « Propriétaire du bien »). */
  proprietaires?: readonly string[];
  /** Le jour de référence des « locataires actuels » (`AAAA-MM-JJ`, la date du mail) ; `null` = aujourd'hui. */
  jour?: string | null;
}) {
  const occupations = useOccupations(bienCles);
  const reference = jour ?? aujourdhuiParis();
  const options = useMemo(() => (occupations === null ? null : optionsDuBien(occupations, reference)), [occupations, reference]);
  const parDefaut = useMemo(() => (options === null ? null : (initial ?? choixParDefaut(options))), [options, initial]);
  const choix = valeur?.choix ?? parDefaut;
  const [autre, setAutre] = useState<'ferme' | 'recherche' | 'libre'>('ferme');
  const [q, setQ] = useState('');
  const [trouves, setTrouves] = useState<Trouve[] | null>(null);
  const [libre, setLibre] = useState({ nom: '', email: '', telephone: '' });

  useEffect(() => {
    if (autre !== 'recherche' || q.trim().length < 2) { setTrouves(null); return undefined; }
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`/api/admin/gestion/annuaire?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ etat?: string; data?: { personnes?: Trouve[] } }>)
        .then((j) => { if (vivant) setTrouves((j.data?.personnes ?? []).slice(0, 8)); })
        .catch(() => { if (vivant) setTrouves([]); });
    }, 250);
    return () => { vivant = false; clearTimeout(t); };
  }, [q, autre]);

  const titreBloc = <p className="lce-titre-bloc">Parties concernées</p>;
  if (options === null || choix === null || parDefaut === null) {
    return (
      <section className="lce lce-bloc" aria-label="Parties concernées">
        <style>{CSS_LOCATAIRES_CONCERNES}</style>
        {titreBloc}
        <p className="lce-vide">Lecture des locataires…</p>
        {!sansPhrase && <p className="lce-recap">{phraseRattachement(libellesDesBiens, null)}</p>}
      </section>
    );
  }
  const coche = (c: Concerne): boolean => choix.some((x) => cleConcerne(x) === cleConcerne(c));
  const changer = (suivant: Concerne[]): void => onChange({ choix: suivant, modifie: choixModifie(suivant, parDefaut) });
  const autres = choix.filter((c) => c.sorte === 'annuaire' || c.sorte === 'libre');
  const ajouter = (c: Concerne): void => {
    if (!coche(c)) changer([...choix, c]);
    setAutre('ferme'); setQ(''); setLibre({ nom: '', email: '', telephone: '' });
  };
  const ligne = (c: Concerne, detail: string) => (
    <li key={cleConcerne(c)}>
      <label className={`lce-case lce-case--${tonConcerne(c.sorte)}`}>
        <input type="checkbox" checked={coche(c)} onChange={() => changer(basculerConcerne(choix, c))} />
        <span className={`lce-puce lce-puce--${tonConcerne(c.sorte)}`}>{c.nom}</span>
        {detail !== '' && <span className="lce-detail">{detail}</span>}
      </label>
    </li>
  );

  return (
    <section className="lce lce-bloc" aria-label="Parties concernées">
      <style>{CSS_LOCATAIRES_CONCERNES}</style>
      {titreBloc}
      <p className="lce-groupe lce-groupe--rouge">Propriétaire</p>
      <ul className="lce-liste">
        {(proprietaires.length === 0 ? ['Propriétaire du bien'] : proprietaires).map((nom) => (
          <li key={nom}>
            <label className="lce-case lce-case--rouge lce-case--fixe">
              <input type="checkbox" checked disabled aria-describedby="lce-toujours" />
              <span className="lce-puce lce-puce--rouge">{nom}</span>
              <span className="lce-detail" id="lce-toujours">toujours concerné</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="lce-groupe lce-groupe--vert">Locataires actuels</p>
      {options.actuels.length === 0
        ? <p className="lce-vide">{jour === null ? 'Aucun locataire en place aujourd’hui.' : 'Aucun locataire en place à la date du mail.'}</p>
        : <ul className="lce-liste">{options.actuels.map((c) => ligne(c, c.entree ? `entré le ${jourFr(c.entree)}` : ''))}</ul>}
      <p className="lce-groupe lce-groupe--violet">Anciens locataires</p>
      {options.anciens.length === 0
        ? <p className="lce-vide">Aucun ancien locataire connu.</p>
        : <ul className="lce-liste">{options.anciens.map((c) => ligne(c,
          `${c.entree ? `du ${jourFr(c.entree)} ` : ''}${c.sortie ? `au ${jourFr(c.sortie)}` : ''}`.trim()))}</ul>}
      {autres.length > 0 && (
        <>
          <p className="lce-groupe lce-groupe--gris">Autres personnes</p>
          <ul className="lce-liste">{autres.map((c) => ligne(c, [c.email, c.telephone].filter(Boolean).join(' · ')))}</ul>
        </>
      )}
      {autre === 'ferme' && (
        <button type="button" className="lce-modifier" onClick={() => setAutre('recherche')}>+ Autre personne…</button>
      )}
      {autre === 'recherche' && (
        <div className="lce-autre">
          <label className="bev-champ">
            <span className="bev-label">Chercher dans l’annuaire (nom, e-mail, téléphone)</span>
            <input className="bev-saisie" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
          {trouves !== null && trouves.length > 0 && (
            <ul className="lce-liste">
              {trouves.map((t) => (
                <li key={`${t.sujet}-${t.id}`}>
                  <button type="button" className="lce-trouve" onClick={() => ajouter({
                    sorte: 'annuaire', locataireId: null, sujet: t.sujet, sujetId: t.id, nom: t.nomAffiche,
                    email: t.email, telephone: t.mobile, entree: null, sortie: null })}>
                    {t.nomAffiche}{t.email ? ` · ${t.email}` : ''}{t.mobile ? ` · ${t.mobile}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {trouves !== null && trouves.length === 0 && <p className="lce-vide">Personne ne correspond dans l’annuaire.</p>}
          <div className="lce-boutons lce-boutons--gauche">
            <button type="button" className="lce-modifier" onClick={() => setAutre('libre')}>Saisir librement (sans créer de fiche)</button>
            <button type="button" className="lce-modifier" onClick={() => setAutre('ferme')}>Annuler</button>
          </div>
        </div>
      )}
      {autre === 'libre' && (
        <div className="lce-autre">
          <label className="bev-champ"><span className="bev-label">Nom *</span>
            <input className="bev-saisie" value={libre.nom} onChange={(e) => setLibre({ ...libre, nom: e.target.value })} autoFocus /></label>
          <div className="bev-deux">
            <label className="bev-champ"><span className="bev-label">E-mail (facultatif)</span>
              <input className="bev-saisie" type="email" value={libre.email} onChange={(e) => setLibre({ ...libre, email: e.target.value })} /></label>
            <label className="bev-champ"><span className="bev-label">Téléphone (facultatif)</span>
              <input className="bev-saisie" type="tel" value={libre.telephone} onChange={(e) => setLibre({ ...libre, telephone: e.target.value })} /></label>
          </div>
          <p className="lce-vide">Enregistrée sur l’événement seulement : aucune fiche n’est créée dans l’annuaire.</p>
          <div className="lce-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAutre('ferme')}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={libre.nom.trim() === ''}
              onClick={() => ajouter({ sorte: 'libre', locataireId: null, sujet: null, sujetId: null, nom: libre.nom.trim(),
                email: libre.email.trim() || null, telephone: libre.telephone.trim() || null, entree: null, sortie: null })}>Ajouter</button>
          </div>
        </div>
      )}
      {!sansPhrase && (
        <p className="lce-recap" role="status">{recapRattachement(libellesDesBiens, proprietaires, choix)}</p>
      )}
    </section>
  );
}

/**
 * 🔴 L'ANCIEN NOM, GARDÉ : les appelants d'avant ce lot montent désormais le bloc « Parties concernées » sans changer
 * leur import. Un seul composant, deux noms pour le même.
 */
export const LocatairesConcernes = PartiesConcernees;

/**
 * 🔴 LOT FENETRE-EVENEMENT-STRUCTUREE-ET-BLOC-PARTIES — LE MÊME BLOC, EN LECTURE : les parties d'un événement existant
 * (onglet « Lier »). Propriétaires en rouge, locataires en vert, anciens en violet, autres en gris — aucune case.
 */
export function PartiesEnLecture({ proprietaires, personnes, enCours = false }: {
  proprietaires: readonly string[];
  personnes: readonly Concerne[];
  enCours?: boolean;
}) {
  return (
    <section className="lce lce-bloc" aria-label="Parties concernées">
      <style>{CSS_LOCATAIRES_CONCERNES}</style>
      <p className="lce-titre-bloc">Parties concernées</p>
      {enCours ? <p className="lce-vide">Lecture…</p> : (
        <>
          <p className="lce-groupe lce-groupe--rouge">Propriétaire</p>
          <p className="lce-puces">{proprietaires.length === 0 ? <span className="lce-vide">non renseigné</span>
            : proprietaires.map((n) => <span key={n} className="lce-puce lce-puce--rouge">{n}</span>)}</p>
          <p className="lce-groupe lce-groupe--vert">Locataires et autres personnes</p>
          <p className="lce-puces"><PucesConcernes concernes={personnes} /></p>
        </>
      )}
    </section>
  );
}

/** Les puces des personnes concernées, sur une carte d'événement (vert, violet, gris). */
export function PucesConcernes({ concernes }: { concernes: readonly Concerne[] }) {
  return (
    <>
      <style>{CSS_LOCATAIRES_CONCERNES}</style>
      {concernes.length === 0 ? <span className="lce-vide">aucun</span>
        : concernes.map((c) => (
          <span key={cleConcerne(c)} className={`lce-puce lce-puce--${tonConcerne(c.sorte)}`}
            title={c.sorte === 'ancien_locataire' && c.sortie ? `ancien locataire, sorti le ${jourFr(c.sortie)}`
              : c.sorte === 'locataire' ? 'locataire en place' : 'autre personne'}>{c.nom}</span>
        ))}
    </>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Vert = locataire (--color-svv-green), violet = ancien locataire
   (--color-svv-violet), gris = autre personne : les memes jetons que les puces des parties, dans les DEUX modes. */
export const CSS_LOCATAIRES_CONCERNES = `
.lce{display:flex;flex-direction:column;gap:.35rem;min-width:0}
/* LOT FENETRE-EVENEMENT-STRUCTUREE-ET-BLOC-PARTIES — le bloc encadre, au dessin des blocs de la fenetre des biens. */
.lce-bloc{margin:0;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:.7rem;
  background:var(--color-svv-surface);box-sizing:border-box;max-width:100%}
.lce-titre-bloc{margin:0 0 .2rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--color-svv-muted)}
.lce-groupe--rouge{color:var(--color-svv-red-dark)}
.lce-case--rouge{border-left-color:var(--color-svv-red);background:var(--color-svv-red-soft)}
.lce-case--fixe{cursor:default}
.lce-case--fixe input{accent-color:var(--color-svv-red)}
.lce-puce--rouge{color:var(--color-svv-red-dark);background:var(--color-svv-red-soft)}
.lce-puces{display:flex;flex-wrap:wrap;gap:.3rem;margin:0}
.lce-recap{margin:.3rem 0 0;padding-top:.45rem;border-top:1px solid var(--color-svv-line);font-size:.8rem;font-weight:600;
  color:var(--color-svv-ink);overflow-wrap:anywhere}
.lce-boutons--gauche{justify-content:flex-start}
.lce-ligne{margin:0;font-size:.84rem;display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0}
.lce-titre{font-weight:600;color:var(--color-svv-ink)}
.lce-vide{font-size:.82rem;color:var(--color-svv-muted);margin:0}
.lce-modifier{background:none;border:0;padding:0;font:inherit;font-size:.82rem;font-weight:600;color:var(--color-svv-red);
  cursor:pointer;text-decoration:underline;text-underline-offset:2px;align-self:flex-start;min-height:28px}
.lce-modifier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:4px}
.lce-puce{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:.8rem;font-weight:600;
  border:1px solid currentColor;overflow-wrap:anywhere}
.lce-puce--vert{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.lce-puce--violet{color:var(--color-svv-violet);background:var(--color-svv-violet-soft)}
.lce-puce--gris{color:var(--color-svv-gray);background:var(--color-svv-surface)}
.lce-fenetre{display:flex;flex-direction:column;gap:.4rem;padding:10px 12px;border-radius:10px;min-width:0;box-sizing:border-box;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface-raised);box-shadow:0 4px 14px rgba(0,0,0,.1)}
.lce-groupe{margin:.2rem 0 0;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.lce-groupe--vert{color:var(--color-svv-green-ink)}
.lce-groupe--violet{color:var(--color-svv-violet)}
.lce-groupe--gris{color:var(--color-svv-gray)}
.lce-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.25rem}
.lce-case{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .5rem;padding:4px 8px;border-radius:8px;cursor:pointer;
  min-height:36px;border-left:4px solid transparent}
.lce-case--vert{border-left-color:var(--color-svv-green);background:var(--color-svv-green-soft)}
.lce-case--vert input{accent-color:var(--color-svv-green)}
.lce-case--violet{border-left-color:var(--color-svv-violet);background:var(--color-svv-violet-soft)}
.lce-case--violet input{accent-color:var(--color-svv-violet)}
.lce-case--gris{border-left-color:var(--color-svv-line-strong);background:var(--color-svv-surface)}
.lce-nom{font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.lce-detail{font-size:.78rem;color:var(--color-svv-muted)}
.lce-autre{display:flex;flex-direction:column;gap:.35rem;padding-top:4px;border-top:1px solid var(--color-svv-line)}
.lce-trouve{background:none;border:1px solid var(--color-svv-line);border-radius:8px;padding:6px 8px;width:100%;text-align:left;
  font:inherit;font-size:.82rem;color:var(--color-svv-ink);cursor:pointer;overflow-wrap:anywhere;box-sizing:border-box}
.lce-trouve:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.lce-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
/* LOT FENETRE-EVENEMENT-STRUCTUREE-ET-BLOC-PARTIES — EN DERNIER, pour l'emporter sur .lce-case plus haut. */
/* La case reste a cote du nom : une grille (case | nom | detail), le detail passant sous le nom sur telephone. */
.lce-case{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;column-gap:.5rem}
.lce-case .lce-puce{justify-self:start;min-width:0}
@media (max-width:520px){
  .lce-case{grid-template-columns:auto minmax(0,1fr)}
  .lce-case .lce-detail{grid-column:2}
}
`;
