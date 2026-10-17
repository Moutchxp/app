'use client';

import { useCallback, useEffect, useState } from 'react';
import { CSS_LOCATION, LocationCarte } from './LocationCarte';
import { CSS_LOCATION_ECRANS } from '../location/commun';
import { MOTIF_SANS_MIGRATION } from '../../../../lib/gestion/annuaireEdition';
import { formaterDateIso, periodeOccupation } from '../../../../lib/gestion/annuaireRecherche';
import { estAncienLocataire } from '../../../../lib/gestion/historiqueBien';
import {
  CATEGORIES, CATEGORIES_ANNEXE, LIBELLE_CATEGORIE, libelleEtage, resumeBien, verifierChampsBien,
  type BienLocation, type Categorie,
} from '../../../../lib/location/locationBien';
import {
  CHAUFFAGES, CLASSES_DPE, EPOQUES_CONSTRUCTION, familleDeCategorie, LIBELLE_FAMILLE, LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_LOCAL,
  LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, SITUATIONS_PARKING, TYPES_LOCAL, TYPES_LOGEMENT, TYPES_PARKING, type ComplementsFiche,
  type SituationParking, type TypeLocal, type TypeLogement, type TypeParking,
} from '../../../../lib/location/bienComplet';
import { titreAnnexe } from '../../../../lib/location/bienComplet';
import { LIBELLE_AG } from '../../../../lib/location/immeubleAg';
import type { SortiePortefeuille } from '../../../../lib/location/recherchePortefeuille';
import type {
  FicheBienLocation, FicheLocataireLocation, FicheProprietaireLocation,
} from '../../../../lib/location/locationRepo';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';

/**
 * ══ 🔴🔴 FICHE COMMUNE — LES SECTIONS « LOCATION » (règle d'Arno du 17/10/2026 : « une seule fiche ») ═══════════════════
 *
 * « Il ne doit exister QU'UN SEUL type de fiche propriétaire, de fiche locataire et de fiche bien : celles du module
 * Gestion, PARTAGÉES entre les tuiles Location et Gestion. Ce qui avait été ajouté aux fiches de la Location rejoint la
 * FICHE COMMUNE, SANS rien retirer ni déplacer de ce qui existe, en sections repliables discrètes. » (Arno)
 *
 * 🔴 AJOUTÉES À LA FIN des trois fiches (`VueProprietaire`, `VueLot`, `VueLocataire`), REPLIÉES par défaut : rien de ce
 * que la fiche montrait ne bouge. Elles lisent et écrivent par `/api/admin/gestion/annuaire/location` (droit Gestion,
 * comme toute la fiche) avec les mêmes fonctions du dépôt que la tuile Location.
 * 🔴 Les liens ouvrent la fiche par `ouvrir` — celui de la tuile où l'on est (Gestion ou Location).
 */
const API = '/api/admin/gestion/annuaire/location';
type Ouvrir = (sorte: FicheUrl['sorte'], id: number) => void;
type Lu<T> = { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; data: T };

function useFiche<T>(parametres: string): { lu: Lu<T>; relire: () => void } {
  const [lu, setLu] = useState<{ cle: string; etat: Lu<T> } | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`${API}?${parametres}`, { cache: 'no-store' });
        const d = await res.json() as { etat?: string; data?: T; message?: string };
        if (!vivant) return;
        if (d.etat === 'ok' && d.data !== undefined) setLu({ cle: parametres, etat: { etat: 'ok', data: d.data } });
        else setLu({ cle: parametres, etat: { etat: 'erreur', message: d.etat === 'sans_schema' ? MOTIF_SANS_MIGRATION : d.message ?? 'Lecture impossible.' } });
      } catch {
        if (vivant) setLu({ cle: parametres, etat: { etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' } });
      }
    })();
    return () => { vivant = false; };
  }, [parametres, n]);
  return { lu: lu !== null && lu.cle === parametres ? lu.etat : { etat: 'charge' }, relire: useCallback(() => setN((x) => x + 1), []) };
}

async function envoyer(corps: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await res.json() as { etat?: string; motif?: string; message?: string };
    if (d.etat === 'ok') return null;
    if (d.etat === 'sans_schema') return MOTIF_SANS_MIGRATION;
    if (d.etat === 'inconnu') return 'Cette fiche n’existe plus.';
    return d.motif ?? d.message ?? 'Enregistrement refusé.';
  } catch {
    return 'Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.';
  }
}

const liste = <T,>(x: readonly T[] | null | undefined): readonly T[] => (Array.isArray(x) ? x : []);

/** Le cadre repliable, discret, commun aux trois fiches. */
function Repli({ titre, resume, children }: { titre: string; resume?: string; children: React.ReactNode }) {
  return (
    <details className="slf" data-section-location>
      <summary><span className="slf-titre">{titre}</span>{resume !== undefined && resume !== '' && <span className="slf-resume"> · {resume}</span>}</summary>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION + CSS_SECTIONS}</style>
      <div className="slf-corps loc-page">{children}</div>
    </details>
  );
}

function Lecture<T>({ lu, children }: { lu: Lu<T>; children: (d: T) => React.ReactNode }) {
  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  return <>{children(lu.data)}</>;
}

/** Un lien qui ouvre une fiche dans la tuile où l'on est. */
function LienFiche({ sorte, id, ouvrir, children }: { sorte: FicheUrl['sorte']; id: number; ouvrir: Ouvrir; children: React.ReactNode }) {
  return <button type="button" className="slf-lien" onClick={() => ouvrir(sorte, id)}>{children}</button>;
}

// ══ « SUPPRIMER » = SORTIR DU PORTEFEUILLE (jamais un effacement), réactivable ═════════════════════════════════════════

export function BlocSortie({ sujet, id, sortie, apres, explication }: {
  sujet: 'proprietaire' | 'locataire' | 'bien'; id: number; sortie: SortiePortefeuille | null; apres: () => void; explication: string;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const agir = async (action: 'sortir' | 'reactiver'): Promise<void> => {
    setEnvoi(true);
    const m = await envoyer({ action, sujet, id });
    setEnvoi(false);
    setMotif(m);
    if (m === null) { setConfirmer(false); apres(); }
  };
  const date = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <section aria-label="Portefeuille">
      {sortie !== null ? (
        <div className="loc-sortie" role="status" data-sortie>
          <span><strong>Sorti du portefeuille</strong> le {date(sortie.le)}{sortie.par === null ? '' : ` par ${sortie.par}`} — la fiche reste consultable, rien n’a été effacé.</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => void agir('reactiver')}>Réactiver</button>
        </div>
      ) : !confirmer ? (
        <div className="loc-boutons" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setConfirmer(true); setMotif(null); }}>Sortir du portefeuille…</button>
        </div>
      ) : (
        <div className="loc-confirmation" role="alertdialog" aria-label="Confirmer la sortie du portefeuille">
          <p style={{ margin: '0 0 8px' }}><strong>Sortir du portefeuille ?</strong> {explication}</p>
          <p className="loc-muet" style={{ margin: '0 0 8px' }}>Rien n’est effacé : la fiche quitte les listes actives et la recherche de la Location, reste dans « Anciens » et peut être réactivée. L’historique, les mails et les tâches restent.</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setConfirmer(false)}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void agir('sortir')}>Confirmer la sortie</button>
          </div>
        </div>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </section>
  );
}

// ══ ① LE PROPRIÉTAIRE : en gestion ? · N° de mandat · portefeuille ═══════════════════════════════════════════════════

export function SectionLocationProprietaire({ proprietaireId }: { proprietaireId: number }) {
  const { lu, relire } = useFiche<FicheProprietaireLocation>(`proprietaire=${proprietaireId}`);
  const resume = lu.etat === 'ok'
    ? [lu.data.enGestion === null ? null : `en gestion : ${lu.data.enGestion ? 'oui' : 'non'}`, lu.data.numeroMandat === null ? null : `mandat ${lu.data.numeroMandat}`,
      lu.data.sortie === null ? null : 'sorti du portefeuille'].filter((x) => x).join(' · ')
    : '';
  return (
    <Repli titre="Location — gestion, mandat et portefeuille" resume={resume}>
      <Lecture lu={lu}>{(d) => (
        <>
          <EnGestion proprietaireId={proprietaireId} valeur={d.enGestion} apres={relire} />
          {d.location372 && <Mandat proprietaireId={proprietaireId} valeur={d.numeroMandat} apres={relire} />}
          <BlocSortie sujet="proprietaire" id={proprietaireId} sortie={d.sortie ?? null} apres={relire}
            explication="Le propriétaire sort avec ses biens encore dans le portefeuille (et leurs annexes)." />
          <p className="loc-muet" style={{ margin: 0 }}>
            <a href={`/admin/location/nouveau-bien?proprietaires=${proprietaireId}`}>+ Ajouter un bien à ce propriétaire (formulaire de la Location)</a>
          </p>
        </>
      )}</Lecture>
    </Repli>
  );
}

function EnGestion({ proprietaireId, valeur, apres }: { proprietaireId: number; valeur: boolean | null; apres: () => void }) {
  const [motif, setMotif] = useState<string | null>(null);
  const poser = async (v: boolean | null): Promise<void> => {
    const m = await envoyer({ action: 'en-gestion', id: proprietaireId, enGestion: v });
    setMotif(m);
    if (m === null) apres();
  };
  return (
    <section className="loc-bloc">
      <h3>Propriétaire en gestion ?</h3>
      <div className="loc-bascule" role="group" aria-label="Propriétaire en gestion ?">
        <button type="button" aria-pressed={valeur === true} onClick={() => void poser(true)}>Oui</button>
        <button type="button" aria-pressed={valeur === false} onClick={() => void poser(false)}>Non</button>
        <button type="button" aria-pressed={valeur === null} onClick={() => void poser(null)}>Non renseigné</button>
      </div>
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </section>
  );
}

function Mandat({ proprietaireId, valeur, apres }: { proprietaireId: number; valeur: string | null; apres: () => void }) {
  const [texte, setTexte] = useState(valeur ?? '');
  const [motif, setMotif] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  return (
    <section className="loc-bloc">
      <h3>N° de mandat de gestion</h3>
      <form className="loc-actions" style={{ alignItems: 'flex-end' }} onSubmit={(e) => {
        e.preventDefault();
        void envoyer({ action: 'numero-mandat', id: proprietaireId, numeroMandat: texte }).then((m) => {
          setMotif(m); setFait(m === null); if (m === null) apres();
        });
      }}>
        <label className="loc-champ" style={{ flex: '1 1 16rem' }}>Texte libre, facultatif — jamais généré ni numéroté par l’outil
          <input value={texte} onChange={(e) => { setTexte(e.target.value); setFait(false); }} placeholder="ex. MG 2026-041" /></label>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn">Enregistrer</button>
      </form>
      {fait && <p className="loc-muet" role="status">Enregistré.</p>}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </section>
  );
}

// ══ ② LE BIEN : portefeuille · annexes en arbre · caractéristiques · compléments · loyer de départ et taux ═══════════

export function SectionLocationBien({ lotId, ouvrir }: { lotId: number; ouvrir: Ouvrir }) {
  const { lu, relire } = useFiche<FicheBienLocation>(`lot=${lotId}`);
  const resume = lu.etat === 'ok'
    ? [lu.data.parent !== null ? 'annexe' : liste(lu.data.annexes).length > 0 ? `${liste(lu.data.annexes).length} annexe(s)` : null,
      lu.data.complements?.typeLogement ? LIBELLE_TYPE_LOGEMENT[lu.data.complements.typeLogement as TypeLogement] : null,
      lu.data.sortie === null || lu.data.sortie === undefined ? null : 'sorti du portefeuille'].filter((x) => x).join(' · ')
    : '';
  return (
    <Repli titre="Location — annexes, caractéristiques, loyer et portefeuille" resume={resume}>
      <Lecture lu={lu}>{(d) => {
        const b = d.bien;
        const f = d.fiche;
        const logement = d.parent ?? b;
        const annexes = d.parent === null ? liste(d.annexes) : [];
        const conditions = new Map(liste(d.locations).map((l) => [l.occupationId, l.location]));
        const enregistrerConditions = async (occupationId: number, c: Record<string, unknown>): Promise<string | null> => {
          const m = await envoyer({ action: 'conditions-location', occupationId, conditions: c });
          if (m === null) relire();
          return m;
        };
        const occupations = liste(f.occupations);
        return (
          <>
            {d.parent !== null && (
              <p className="loc-alerte">Annexe du logement <LienFiche sorte="lot" id={d.parent.id} ouvrir={ouvrir}>
                {[d.parent.adresse, d.parent.commune].filter((x) => x).join(', ')}{d.parent.etage === null ? '' : ` — ${libelleEtage(d.parent.etage)}`}
              </LienFiche> : ce lien est gardé pour toujours.</p>
            )}
            <section className="loc-bloc" data-arbre>
              <h3>Le logement et ses annexes</h3>
              <ul className="loc-arbre">
                <LigneArbre b={logement} courant={logement.id === b.id} ouvrir={ouvrir} />
                {annexes.map((a) => <LigneArbre key={a.id} b={a} enfant courant={a.id === b.id} ouvrir={ouvrir} />)}
              </ul>
              {d.parent === null && d.location372 && <AjoutAnnexes parentId={b.id} rattachables={[...liste(d.rattachables)]} apres={relire} />}
            </section>
            <Caracteristiques b={b} modifiable={d.location372} apres={relire} />
            {d.complements !== null && d.complements !== undefined
              && <Complements id={b.id} c={d.complements} apres={relire} annexe={b.parentId !== null} categorie={b.categorie} />}
            {d.location372 !== false && occupations.length > 0 && (
              <section className="loc-bloc" data-loyers>
                <h3>Loyer de départ et taux de gestion</h3>
                <ul className="loc-liste">
                  {occupations.map((o) => (
                    <li key={o.occupationId} style={{ display: 'block' }}>
                      <p style={{ margin: '0 0 6px' }}>
                        <LienFiche sorte="locataire" id={o.locataireId} ouvrir={ouvrir}>{o.nom}</LienFiche>{' '}
                        <span className="loc-muet">{o.encours ? `en place${o.entree === null ? '' : ` depuis le ${formaterDateIso(o.entree)}`}` : periodeOccupation(o.entree, o.sortie)}</span>
                      </p>
                      <div className="cp-lignes">
                        <LocationCarte location={conditions.get(o.occupationId) ?? null} modifiable={f.modifiable} onEnregistrer={enregistrerConditions} lecture={!o.encours} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <BlocSortie sujet="bien" id={b.id} sortie={d.sortie ?? null} apres={relire}
              explication={d.parent === null ? 'Le bien sort avec ses annexes.' : 'Cette annexe sort seule ; son lien avec le logement est gardé.'} />
          </>
        );
      }}</Lecture>
    </Repli>
  );
}

function LigneArbre({ b, enfant = false, courant, ouvrir }: { b: BienLocation; enfant?: boolean; courant: boolean; ouvrir: Ouvrir }) {
  const parking = [b.parkingSituation ? LIBELLE_SITUATION_PARKING[b.parkingSituation as SituationParking] : null,
    b.parkingType ? LIBELLE_TYPE_PARKING[b.parkingType as TypeParking] : null].filter((x) => x).join(' · ');
  const titre = enfant
    ? `${titreAnnexe(b, LIBELLE_CATEGORIE[b.categorie])}${b.porte === null ? '' : ` n° ${b.porte}`}${parking === '' ? '' : ` (${parking})`}`
      + (b.adresseAutre ? ` — autre adresse : ${[b.adresse, b.commune].filter((x) => x).join(', ')}` : '')
    : `${LIBELLE_CATEGORIE[b.categorie]} · ${[b.adresse, b.commune].filter((x) => x).join(', ')}`;
  return (
    <li className={enfant ? 'loc-enfant' : undefined} data-annexe={enfant ? 'oui' : undefined}>
      <span>
        {courant ? <strong>{titre}</strong> : <LienFiche sorte="lot" id={b.id} ouvrir={ouvrir}>{titre}</LienFiche>}
        {resumeBien(b) !== '' && <span className="loc-muet"> · {resumeBien(b)}</span>}
      </span>
      <span className="loc-muet">{b.locataireEnPlace === null ? 'libre' : `loué à ${b.locataireEnPlace}`}</span>
    </li>
  );
}

function AjoutAnnexes({ parentId, rattachables, apres }: { parentId: number; rattachables: BienLocation[]; apres: () => void }) {
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [champs, setChamps] = useState({ etage: '', numLotCopro: '', porte: '', nomAnnexe: '' });
  const [choisi, setChoisi] = useState('');
  const [motif, setMotif] = useState<string | null>(null);
  const ajouter = async (): Promise<void> => {
    const m = await envoyer({ action: 'ajouter-annexe', id: parentId, champs: { ...champs, categorie } });
    setMotif(m);
    if (m === null) { setCategorie(null); setChamps({ etage: '', numLotCopro: '', porte: '', nomAnnexe: '' }); apres(); }
  };
  const rattacher = async (): Promise<void> => {
    const m = await envoyer({ action: 'rattacher-annexe', id: parentId, annexeId: Number(choisi) });
    setMotif(m);
    if (m === null) { setChoisi(''); apres(); }
  };
  return (
    <div style={{ marginTop: 10 }}>
      <div className="loc-actions">
        {(['cave', 'parking', 'autre'] as const).map((c) => (
          <button key={c} type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setCategorie(c)}>
            + {c === 'autre' ? 'Autre annexe' : LIBELLE_CATEGORIE[c]}
          </button>
        ))}
      </div>
      {categorie !== null && (
        <form className="loc-bloc" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); void ajouter(); }}>
          <div className="loc-grille">
            {categorie === 'autre' && (
              <label className="loc-champ loc-pleine" data-nom-annexe>Nom de l’annexe <span className="loc-oblig">*</span>
                <input value={champs.nomAnnexe} maxLength={80} placeholder="ex. Cellier, Grenier, Local vélo" autoFocus
                  onChange={(e) => setChamps({ ...champs, nomAnnexe: e.target.value })} /></label>
            )}
            <label className="loc-champ">Catégorie
              <select value={categorie} onChange={(e) => setCategorie(e.target.value as Categorie)}>
                {CATEGORIES_ANNEXE.map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}
              </select></label>
            <label className="loc-champ">Étage<input value={champs.etage} onChange={(e) => setChamps({ ...champs, etage: e.target.value })} placeholder="ex. -1" /></label>
            <label className="loc-champ">N° de lot de copropriété<input value={champs.numLotCopro} onChange={(e) => setChamps({ ...champs, numLotCopro: e.target.value })} /></label>
            <label className="loc-champ">{categorie === 'parking' || categorie === 'box' ? 'N° de place' : 'N° de porte'}
              <input autoFocus={categorie !== 'autre'} value={champs.porte} onChange={(e) => setChamps({ ...champs, porte: e.target.value })} /></label>
          </div>
          <div className="loc-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setCategorie(null)}>Annuler</button>
            <button type="submit" className="svv-btn svv-btn-primary gst-btn">Ajouter l’annexe</button>
          </div>
          <p className="loc-muet">L’annexe hérite de l’adresse et du propriétaire du logement ; son lien avec lui est gardé pour toujours.</p>
        </form>
      )}
      {rattachables.length > 0 && (
        <div className="loc-actions" style={{ marginTop: 10, alignItems: 'center' }}>
          <select className="loc-select" value={choisi} onChange={(e) => setChoisi(e.target.value)} aria-label="Bien existant à rattacher">
            <option value="">Rattacher un bien existant du même propriétaire…</option>
            {rattachables.map((r) => (
              <option key={r.id} value={r.id}>{LIBELLE_CATEGORIE[r.categorie]} · {[r.adresse, r.commune].filter((x) => x).join(', ')} (réf. {r.numero})</option>
            ))}
          </select>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={choisi === ''} onClick={() => void rattacher()}>Rattacher comme annexe</button>
        </div>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </div>
  );
}

function Caracteristiques({ b, modifiable, apres }: { b: BienLocation; modifiable: boolean; apres: () => void }) {
  const initial = {
    categorie: b.categorie as string, etage: b.etage ?? '', porte: b.porte ?? '', numLotCopro: b.numLotCopro ?? '',
    surfaceCarrezM2: b.surfaceCarrezM2 === null ? '' : String(b.surfaceCarrezM2).replace('.', ','),
    surfaceExterieureM2: b.surfaceExterieureM2 === null ? '' : String(b.surfaceExterieureM2).replace('.', ','),
    adresse: b.adresse ?? '', codePostal: b.codePostal ?? '', commune: b.commune ?? '', nomAnnexe: b.nomAnnexe ?? '',
  };
  const [edition, setEdition] = useState(false);
  const [v, setV] = useState(initial);
  const [motif, setMotif] = useState<string | null>(null);
  const champ = (k: keyof typeof initial, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={v[k]} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, [k]: val })); }} {...props} /></label>
  );
  const enregistrer = async (): Promise<void> => {
    const verdict = verifierChampsBien(v);
    if (!verdict.ok) { setMotif(verdict.motif); return; }
    const m = await envoyer({ action: 'modifier-bien', id: b.id, champs: v });
    setMotif(m);
    if (m === null) { setEdition(false); apres(); }
  };
  return (
    <section className="loc-bloc">
      <h3>Caractéristiques</h3>
      {!edition ? (
        <>
          <dl className="loc-grille" style={{ margin: 0 }}>
            {[...(b.categorie === 'autre' ? [['Nom de l’annexe', b.nomAnnexe ?? null]] : []),
              ['Catégorie', LIBELLE_CATEGORIE[b.categorie]], ['Étage', libelleEtage(b.etage)], ['N° de porte / place', b.porte],
              ['N° de lot de copropriété', b.numLotCopro],
              ['Surface Carrez', b.surfaceCarrezM2 === null ? null : `${String(b.surfaceCarrezM2).replace('.', ',')} m²`],
              ['Surface extérieure', b.surfaceExterieureM2 === null ? null : `${String(b.surfaceExterieureM2).replace('.', ',')} m²`]]
              .map(([mot, val]) => (
                <div key={mot}><dt className="loc-muet">{mot}</dt><dd style={{ margin: 0 }}>{val ?? <span className="loc-muet">non renseigné</span>}</dd></div>
              ))}
          </dl>
          {modifiable && <div className="loc-boutons"><button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setV(initial); setEdition(true); }}>Modifier</button></div>}
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
          <div className="loc-grille">
            <label className="loc-champ">Catégorie
              <select value={v.categorie} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, categorie: val })); }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}
              </select></label>
            {v.categorie === 'autre' && champ('nomAnnexe', 'Nom de l’annexe *', { placeholder: 'ex. Cellier, Grenier, Local vélo', maxLength: 80 })}
            {champ('etage', 'Étage', { placeholder: 'ex. 3, RDC, -1' })}
            {champ('porte', 'N° de porte / de place')}
            {champ('numLotCopro', 'N° de lot de copropriété')}
            {champ('surfaceCarrezM2', 'Surface Carrez (m²)', { inputMode: 'decimal' })}
            {champ('surfaceExterieureM2', 'Surface extérieure (m²)', { inputMode: 'decimal' })}
            {b.creeDansLApplication && <>{champ('adresse', 'Adresse')}{champ('codePostal', 'Code postal', { inputMode: 'numeric' })}{champ('commune', 'Commune')}</>}
          </div>
          {!b.creeDansLApplication && <p className="loc-muet">L’adresse de ce bien est tenue par WIPPIMMO : elle se corrige là-bas.</p>}
          <div className="loc-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEdition(false)}>Annuler</button>
            <button type="submit" className="svv-btn svv-btn-primary gst-btn">Enregistrer</button>
          </div>
        </form>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </section>
  );
}

/** Les informations complémentaires du bien (migration 374) : saisies au formulaire complet, complétables ici. */
function Complements({ id, c, apres, annexe = false, categorie }: {
  id: number; c: ComplementsFiche; apres: () => void; annexe?: boolean; categorie: string;
}) {
  // La famille se DÉDUIT de la catégorie (migration 376) : elle choisit les champs montrés. Une annexe : parking, accès, commentaire.
  const famille = familleDeCategorie(categorie);
  const parking = famille === 'parking' || categorie === 'box';
  const initial = {
    batiment: c.batiment ?? '', escalier: c.escalier ?? '', typeLogement: c.typeLogement ?? '', nombrePieces: c.nombrePieces === null ? '' : String(c.nombrePieces),
    meuble: c.meuble === null ? '' : c.meuble ? 'oui' : 'non', surfaceHabitableM2: c.surfaceHabitableM2 === null ? '' : String(c.surfaceHabitableM2).replace('.', ','),
    syndicId: c.syndicId === null ? '' : String(c.syndicId), epoqueConstruction: c.epoqueConstruction ?? '', chauffage: c.chauffage ?? '',
    dpeClasse: c.dpeClasse ?? '', dpeDate: c.dpeDate ?? '', commentaire: c.commentaire ?? '',
    typeLocal: c.typeLocal ?? '', parkingSituation: c.parkingSituation ?? '', parkingType: c.parkingType ?? '',
    surfaceM2: c.surfaceM2 === null ? '' : String(c.surfaceM2).replace('.', ','),
    ascenseur: c.ascenseur === null ? '' : c.ascenseur ? 'oui' : 'non', digicode: c.digicode === null ? '' : c.digicode ? 'oui' : 'non',
    digicodeCode: c.digicodeCode ?? '', precisionAcces: c.precisionAcces ?? '', derniereAg: c.derniereAg ?? '',
    assurancePno: c.assurancePno === undefined || c.assurancePno === null ? '' : c.assurancePno ? 'oui' : 'non', pnoDateAnniversaire: c.pnoDateAnniversaire ?? '',
  };
  // La dernière AG (Arno, 18/10/2026) : celle de l'IMMEUBLE du bien, partagée par ses lots ; masquée sans immeuble (parking nu).
  const avecAg = !annexe && c.agApplicable === true;
  const [edition, setEdition] = useState(false);
  const [v, setV] = useState(initial);
  const [motif, setMotif] = useState<string | null>(null);
  const [syndics, setSyndics] = useState<{ id: number; nom: string }[]>([]);
  useEffect(() => {
    if (!edition) return;
    let vivant = true;
    void fetch(`${API}?syndics=1`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: { id: number; nom: string }[] }>).then((d) => {
      if (vivant) setSyndics(d.etat === 'ok' && Array.isArray(d.data) ? d.data : []);
    }).catch(() => {});
    return () => { vivant = false; };
  }, [edition]);
  const enregistrer = async (): Promise<void> => {
    const { derniereAg, assurancePno, pnoDateAnniversaire, ...reste } = v;
    // L'assurance PNO (Arno, 18/10/2026) : sur le bien (pas sur une annexe) ; Non (ou non renseigné) vide la date.
    const pno = annexe ? {} : { assurancePno, pnoDateAnniversaire: assurancePno === 'oui' ? pnoDateAnniversaire : '' };
    const m = await envoyer({ action: 'complements-bien', id, champs: { ...(avecAg ? { ...reste, derniereAg } : reste), ...pno } });
    setMotif(m);
    if (m === null) { setEdition(false); apres(); }
  };
  const date = c.dpeDate === null ? null : new Date(`${c.dpeDate}T12:00:00`).toLocaleDateString('fr-FR');
  const ouiNon = (x: boolean | null): string | null => (x === null ? null : x ? 'oui' : 'non');
  const lignesAcces: [string, string | null][] = [
    ['Ascenseur', ouiNon(c.ascenseur)],
    ['Digicode', c.digicode === null ? null : c.digicode ? `oui${c.digicodeCode ? ` · code ${c.digicodeCode}` : ''}` : 'non'],
    ['Précision d’accès', c.precisionAcces],
  ];
  const lignesParking: [string, string | null][] = [
    ['Intérieur / extérieur', c.parkingSituation === null ? null : LIBELLE_SITUATION_PARKING[c.parkingSituation]],
    ['Type de parking', c.parkingType === null ? null : LIBELLE_TYPE_PARKING[c.parkingType]],
  ];
  const lignesPrincipal: [string, string | null][] = [
    ['Famille', famille === null ? null : LIBELLE_FAMILLE[famille]],
    ...(famille === 'local' ? [['Type de local', c.typeLocal === null ? null : LIBELLE_TYPE_LOCAL[c.typeLocal]] as [string, string | null]] : []),
    ...(parking ? [...lignesParking, ['Surface', c.surfaceM2 === null ? null : `${String(c.surfaceM2).replace('.', ',')} m²`] as [string, string | null]] : []),
  ];
  const lignesBrutes: [string, string | null][] = [
    ['Type de logement', c.typeLogement === null ? null : LIBELLE_TYPE_LOGEMENT[c.typeLogement as TypeLogement] ?? c.typeLogement],
    ['Nombre de pièces', c.nombrePieces === null ? null : String(c.nombrePieces)],
    ['Meublé', c.meuble === null ? null : c.meuble ? 'Meublé' : 'Non meublé'],
    ['Surface habitable', c.surfaceHabitableM2 === null ? null : `${String(c.surfaceHabitableM2).replace('.', ',')} m²`],
    ['Bâtiment', c.batiment], ['Escalier', c.escalier], ['Syndic', c.syndicNom],
    ['Époque de construction', c.epoqueConstruction], ['Chauffage', c.chauffage],
    ['DPE', c.dpeClasse === null && date === null ? null : [c.dpeClasse === null ? null : `classe ${c.dpeClasse}`, date === null ? null : `du ${date}`].filter((x) => x).join(' ')],
    ...(avecAg ? [[LIBELLE_AG, c.derniereAg ? new Date(`${c.derniereAg}T12:00:00`).toLocaleDateString('fr-FR') : null] as [string, string | null]] : []),
    ['Assurance PNO', c.assurancePno === undefined || c.assurancePno === null ? null : c.assurancePno
      ? `oui${c.pnoDateAnniversaire ? ` · date anniversaire le ${new Date(`${c.pnoDateAnniversaire}T12:00:00`).toLocaleDateString('fr-FR')}` : ''}` : 'non'],
    ['Commentaire', c.commentaire],
  ];
  // Ce qui ne concerne pas la famille n'est pas montré (un parking n'a ni pièces, ni meublé, ni DPE…).
  const horsParking = new Set(['Type de logement', 'Nombre de pièces', 'Meublé', 'Surface habitable', 'Époque de construction', 'Chauffage', 'DPE']);
  const lignes: [string, string | null][] = annexe
    ? [...(parking ? lignesParking : []), ...lignesAcces, ['Commentaire', c.commentaire]]
    : [...lignesPrincipal, ...lignesBrutes.filter(([mot]) => !(parking && horsParking.has(mot))
      && !(famille === 'local' && (mot === 'Type de logement' || mot === 'Meublé'))), ...lignesAcces];
  const champ = (k: keyof typeof initial, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={v[k]} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, [k]: val })); }} {...props} /></label>
  );
  const choix = (k: keyof typeof initial, mot: string, options: readonly (readonly [string, string])[]) => (
    <label className="loc-champ">{mot}
      <select value={v[k]} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, [k]: val })); }}>
        <option value="">— non renseigné —</option>{options.map(([val, lib]) => <option key={val} value={val}>{lib}</option>)}
      </select></label>
  );
  return (
    <section className="loc-bloc" data-complements>
      <h3>Informations complémentaires</h3>
      {!edition ? (
        <>
          <dl className="loc-grille" style={{ margin: 0 }}>
            {lignes.map(([mot, val]) => (
              <div key={mot}><dt className="loc-muet">{mot}</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{val ?? <span className="loc-muet">non renseigné</span>}</dd></div>
            ))}
          </dl>
          <div className="loc-boutons"><button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setV(initial); setMotif(null); setEdition(true); }}>Modifier</button></div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
          <div className="loc-grille">
            {parking && choix('parkingSituation', 'Intérieur / extérieur', SITUATIONS_PARKING.map((t) => [t, LIBELLE_SITUATION_PARKING[t]] as const))}
            {parking && choix('parkingType', 'Type de parking', TYPES_PARKING.map((t) => [t, LIBELLE_TYPE_PARKING[t]] as const))}
            {parking && !annexe && champ('surfaceM2', 'Surface (m²)', { inputMode: 'decimal' })}
            {!annexe && famille === 'local' && choix('typeLocal', 'Type de local', TYPES_LOCAL.map((t) => [t, LIBELLE_TYPE_LOCAL[t as TypeLocal]] as const))}
            {choix('ascenseur', 'Ascenseur', [['oui', 'Oui'], ['non', 'Non']])}
            {choix('digicode', 'Digicode', [['oui', 'Oui'], ['non', 'Non']])}
            {v.digicode === 'oui' && champ('digicodeCode', 'Code du digicode')}
            {champ('precisionAcces', 'Précision d’accès')}
          </div>
          {!annexe && <div className="loc-grille" style={{ marginTop: 10 }}>
            {!parking && famille !== 'local' && choix('typeLogement', 'Type de logement', TYPES_LOGEMENT.map((t) => [t, LIBELLE_TYPE_LOGEMENT[t]] as const))}
            {!parking && champ('nombrePieces', famille === 'local' ? 'Nombre de bureaux / pièces' : 'Nombre de pièces', { inputMode: 'numeric' })}
            {!parking && famille !== 'local' && choix('meuble', 'Meublé', [['oui', 'Meublé'], ['non', 'Non meublé']])}
            {!parking && champ('surfaceHabitableM2', famille === 'local' ? 'Surface (m²)' : 'Surface habitable (m²)', { inputMode: 'decimal' })}
            {champ('batiment', 'Bâtiment')}
            {champ('escalier', 'Escalier')}
            {choix('syndicId', 'Syndic (Gestion)', [...(c.syndicId !== null && !syndics.some((s) => s.id === c.syndicId) ? [[String(c.syndicId), c.syndicNom ?? `Syndic ${c.syndicId}`] as const] : []),
              ...syndics.map((x) => [String(x.id), x.nom] as const)])}
            {!parking && choix('epoqueConstruction', 'Époque de construction', EPOQUES_CONSTRUCTION.map((x) => [x, x] as const))}
            {!parking && choix('chauffage', 'Chauffage', CHAUFFAGES.map((x) => [x, x] as const))}
            {!parking && choix('dpeClasse', 'Classe DPE', CLASSES_DPE.map((x) => [x, x] as const))}
            {!parking && champ('dpeDate', 'Date du DPE', { type: 'date' })}
            {choix('assurancePno', 'Assurance PNO', [['oui', 'Oui'], ['non', 'Non']])}
            {v.assurancePno === 'oui' && <span data-pno-date>{champ('pnoDateAnniversaire', 'Date anniversaire (PNO)', { type: 'date' })}</span>}
            {avecAg && <label className="loc-champ" data-derniere-ag>{LIBELLE_AG}
              <input type="date" value={v.derniereAg} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, derniereAg: val })); }} />
              <small className="loc-muet">Partagée par tous les lots de l’immeuble : la modifier ici la met à jour pour eux.</small></label>}
          </div>}
          <div className="loc-grille" style={{ marginTop: 10 }}>
            <label className="loc-champ" style={{ gridColumn: '1 / -1' }}>Commentaire
              <textarea className="slf-texte" value={v.commentaire} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, commentaire: val })); }} maxLength={4000} rows={4} /></label>
          </div>
          {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
          <div className="loc-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEdition(false)}>Annuler</button>
            <button type="submit" className="svv-btn svv-btn-primary gst-btn">Enregistrer</button>
          </div>
        </form>
      )}
    </section>
  );
}

// ══ ③ LE LOCATAIRE : ses locations (loyer de départ, taux) · portefeuille ═══════════════════════════════════════════

export function SectionLocationLocataire({ locataireId, ouvrir }: { locataireId: number; ouvrir: Ouvrir }) {
  const { lu, relire } = useFiche<FicheLocataireLocation>(`locataire=${locataireId}`);
  const resume = lu.etat === 'ok'
    ? [`${liste(lu.data.locations).length} location(s)`, lu.data.sortie === null ? null : 'sorti du portefeuille'].filter((x) => x).join(' · ')
    : '';
  return (
    <Repli titre="Location — loyers, taux et portefeuille" resume={resume}>
      <Lecture lu={lu}>{(d) => {
        const enregistrerConditions = async (occupationId: number, c: Record<string, unknown>): Promise<string | null> => {
          const m = await envoyer({ action: 'conditions-location', occupationId, conditions: c });
          if (m === null) relire();
          return m;
        };
        return (
          <>
            <section className="loc-bloc" data-loyers>
              <h3>Ses locations — loyer de départ et taux de gestion</h3>
              {liste(d.locations).length === 0 ? <p className="loc-muet">Aucune location connue.</p> : (
                <ul className="loc-liste">
                  {liste(d.locations).map((l) => (
                    <li key={l.occupationId} style={{ display: 'block' }}>
                      <p style={{ margin: '0 0 6px' }}>
                        {l.lotId === null ? <strong>Lot hors gestion</strong>
                          : <LienFiche sorte="lot" id={l.lotId} ouvrir={ouvrir}>{[l.adresse, l.commune].filter((x) => x).join(', ') || `Bien ${l.lotId}`}</LienFiche>}{' '}
                        <span className="loc-muet">{periodeOccupation(l.entree, l.sortie)}</span>
                      </p>
                      <div className="cp-lignes">
                        <LocationCarte location={l.location} modifiable={d.fiche.modifiable} onEnregistrer={enregistrerConditions} lecture={estAncienLocataire(l)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <BlocSortie sujet="locataire" id={locataireId} sortie={d.sortie ?? null} apres={relire}
              explication="Possible seulement quand il n’est plus en place (son départ s’enregistre d’abord)." />
          </>
        );
      }}</Lecture>
    </Repli>
  );
}

const CSS_SECTIONS = `
.slf{margin-top:14px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface)}
.slf > summary{cursor:pointer;list-style:none;padding:12px 14px;min-height:44px;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:4px;color:var(--color-svv-ink)}
.slf > summary::-webkit-details-marker{display:none}
.slf > summary::before{content:"▸";margin-right:8px;color:var(--color-svv-muted)}
.slf[open] > summary::before{content:"▾"}
.slf-titre{font-weight:700;font-size:.92rem}
.slf-resume{font-size:.85rem;color:var(--color-svv-muted)}
.slf-corps{padding:0 14px 14px;gap:12px}
.slf-lien{border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer;text-align:left}
.slf-texte{border:1px solid var(--color-svv-line);border-radius:9px;padding:10px;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-surface)}
`;
