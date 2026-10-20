'use client';

import { useCallback, useEffect, useState } from 'react';
import { CSS_LOCATION, LocationCarte } from './LocationCarte';
import { CSS_ANNEXE_CARTE, CSS_LOCATION_ECRANS } from '../location/commun';
import { MOTIF_SANS_MIGRATION } from '../../../../lib/gestion/annuaireEdition';
import { formaterDateIso, periodeOccupation } from '../../../../lib/gestion/annuaireRecherche';
import { estAncienLocataire } from '../../../../lib/gestion/historiqueBien';
import {
  CATEGORIES, CATEGORIES_ANNEXE, categorieDuBien, LIBELLE_CATEGORIE, libelleEtage, resumeBien, verifierChampsBien,
  type BienLocation, type Categorie,
} from '../../../../lib/location/locationBien';
import {
  CHAUFFAGES, CLASSES_DPE, EPOQUES_CONSTRUCTION, familleDeCategorie, LIBELLE_FAMILLE, LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_LOCAL,
  LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, SITUATIONS_PARKING, TYPES_LOCAL, TYPES_LOGEMENT, TYPES_PARKING, type ComplementsFiche,
  type SituationParking, type TypeLocal, type TypeLogement, type TypeParking,
} from '../../../../lib/location/bienComplet';
import { aRenseignerDuBien, DPE_NON_SOUMIS, LIBELLE_DPE_NON_SOUMIS, titreAnnexe } from '../../../../lib/location/bienComplet';
import { resumeAnnexe } from '../../../../lib/location/annexeLocation';
import { libelleEntretien } from '../../../../lib/location/entretien';
import { BlocEntretien, CSS_ENTRETIEN, versEnvoiEntretien, versSaisieEntretien } from '../location/EntretienBien';
import { CSS_ZONE_AUTO, ZoneAuto } from '../location/ZoneAuto';
import { ModaleArchivage } from '../location/ModaleArchivage';
import { BlocConditionsEntree, CSS_CONDITIONS } from '../location/ConditionsEntree';
import {
  manquesConditions, versEnvoiConditions, versSaisieConditions, type ConditionsEntreeLues, type SaisieConditions,
} from '../../../../lib/location/conditionsEntree';
import { QuestionOrigine } from '../location/QuestionOrigine';
import { aujourdhuiParisEcran, CSS_PREAVIS, GestesPreavis, MentionPreavis } from '../location/Preavis';
import type { PreavisAffiche } from '../../../../lib/location/preavis';
import { libelleBien, phraseArchivage, type ApercuArchivage, type OrigineArchivage } from '../../../../lib/location/archivage';
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

/** Le dernier état de mail rendu par la route (sortie / réactivation, Arno 18/10/2026) — lu juste après `envoyer`. */
let dernierMail: { envoye: boolean; ignore: boolean; motif: string | null } | undefined;

async function envoyer(corps: Record<string, unknown>): Promise<string | null> {
  dernierMail = undefined;
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await res.json() as { etat?: string; motif?: string; message?: string; mail?: { envoye: boolean; ignore: boolean; motif: string | null } };
    if (d.etat === 'ok') { dernierMail = d.mail; return null; }
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
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION + CSS_SECTIONS + CSS_ANNEXE_CARTE + CSS_ENTRETIEN + CSS_ZONE_AUTO + CSS_PREAVIS + CSS_CONDITIONS}</style>
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

// ══ LE PRÉAVIS (Arno, 18/10/2026) : statut « en préavis » / « préavis échu », avec « Corriger » / « Annuler » ══════════════

type PreavisDeLaFiche = { occupationId: number; preavis: PreavisAffiche & { dureeProposee: number | null } };

/** Le bloc des préavis OUVERTS d'une fiche : le locataire reste OCCUPANT ; gestes journalisés (mêmes fonctions que la Location). */
function BlocPreavis({ lignes, apres }: {
  lignes: { cle: number; libelle: React.ReactNode; entree: string | null; p: PreavisDeLaFiche['preavis'] }[];
  apres: () => void;
}) {
  if (lignes.length === 0) return null;
  const jour = aujourdhuiParisEcran();
  return (
    <section className="loc-bloc" data-preavis-fiche>
      <h3>Préavis en cours</h3>
      <ul className="loc-liste">
        {lignes.map((l) => (
          <li key={l.cle} style={{ display: 'block' }}>
            <p style={{ margin: '0 0 6px' }}>{l.libelle} <MentionPreavis p={l.p} jour={jour} /></p>
            <GestesPreavis p={l.p} entree={l.entree} envoyerGeste={envoyer} apres={apres} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « en préavis » dans le résumé replié d'une section (visible sans l'ouvrir). PUR. */
function resumePreavis(liste: readonly PreavisDeLaFiche[] | undefined): string | null {
  const n = (liste ?? []).length;
  if (n === 0) return null;
  const jour = aujourdhuiParisEcran();
  return (liste ?? []).some((x) => x.preavis.dateMax < jour) ? 'préavis échu — sortie à saisir' : n > 1 ? `${n} locataires en préavis` : 'locataire en préavis';
}

// ══ « SUPPRIMER » = SORTIR DU PORTEFEUILLE (jamais un effacement), réactivable ═════════════════════════════════════════

/**
 * Ce que la sortie fera (biens, locations en cours, biens partagés…) — l'APERÇU du serveur, le même calcul que l'écriture.
 * Rend le motif (texte) si la lecture échoue.
 */
async function lireApercu(sujet: ApercuArchivage['sujet'], id: number): Promise<ApercuArchivage | string> {
  try {
    const res = await fetch(`${API}?apercuArchivage=${id}&sujet=${sujet}`, { cache: 'no-store' });
    const d = await res.json() as { etat?: string; data?: ApercuArchivage; message?: string };
    if (d.etat === 'ok' && d.data !== undefined) return d.data;
    if (d.etat === 'inconnu') return 'Cette fiche n’existe plus.';
    return d.message ?? 'Lecture impossible.';
  } catch {
    return 'Lecture impossible : le serveur n’a pas répondu. Rien n’a été modifié.';
  }
}

/**
 * 🔴 RÈGLE D'ARNO DU 18/10/2026 — elle REMPLACE « sortie refusée si locataire en place » : une location en cours ne
 * bloque plus ; l'écran montre d'abord l'AVERTISSEMENT (la modale des biens occupés, la même que l'écran « Archiver un
 * propriétaire »), puis la sortie clôt ces locations à la date du jour. Sans location en cours : la confirmation simple.
 */
export function BlocSortie({ sujet, id, sortie, apres, explication }: {
  sujet: 'proprietaire' | 'locataire' | 'bien'; id: number; sortie: SortiePortefeuille | null; apres: () => void; explication: string;
}) {
  const [apercu, setApercu] = useState<ApercuArchivage | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Un PROPRIÉTAIRE : la dernière question (origine de l'archivage) avant le seul clic qui écrit (Arno, 18/10/2026).
  const [etapeOrigine, setEtapeOrigine] = useState(false);
  const [mailEchec, setMailEchec] = useState<string | null>(null);
  const agir = async (action: 'sortir' | 'reactiver', confirmeOccupation = false, origine?: OrigineArchivage): Promise<void> => {
    setEnvoi(true);
    const m = await envoyer({ action, sujet, id, ...(confirmeOccupation ? { confirmeOccupation: true } : {}), ...(origine === undefined ? {} : { origine }) });
    setEnvoi(false);
    setMotif(m);
    // Arno (18/10/2026) : le mail de confirmation ne bloque jamais — mais un échec se DIT.
    const dm = dernierMail as { envoye: boolean; ignore: boolean; motif: string | null } | undefined;
    setMailEchec(m === null && dm !== undefined && !dm.envoye && !dm.ignore ? `Enregistré, mais mail de confirmation non envoyé${dm.motif ? ` : ${dm.motif}` : ''}.` : null);
    if (m === null) { setApercu(null); setEtapeOrigine(false); apres(); }
  };
  const preparer = async (): Promise<void> => {
    setMotif(null);
    setEnvoi(true);
    const a = await lireApercu(sujet, id);
    setEnvoi(false);
    if (typeof a === 'string') setMotif(a); else setApercu(a);
  };
  const date = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const occupe = apercu !== null && apercu.occupees.length > 0;
  return (
    <section aria-label="Portefeuille">
      {sortie !== null ? (
        <div className="loc-sortie" role="status" data-sortie>
          {sujet === 'proprietaire'
            ? <span data-origine-archivage><strong>Archivé le {date(sortie.le)}{sortie.par === null ? '' : ` par ${sortie.par}`}{sortie.origine ? ` — ${sortie.origine}` : ''}</strong> · sorti du portefeuille, la fiche reste consultable, rien n’a été effacé.</span>
            : <span data-origine-sortie><strong>Sorti du portefeuille</strong> le {date(sortie.le)}{sortie.par === null ? '' : ` par ${sortie.par}`}{sortie.origine ? ` — ${sortie.origine}` : ''} — la fiche reste consultable, rien n’a été effacé.</span>}
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => void agir('reactiver')}>Réactiver</button>
        </div>
      ) : apercu === null || occupe ? (
        <div className="loc-boutons" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => { setEtapeOrigine(false); void preparer(); }}>Sortir du portefeuille…</button>
        </div>
      ) : etapeOrigine ? (
        <div className="loc-confirmation" role="alertdialog" aria-label="Dernière question avant l’archivage définitif" data-etape="origine">
          <QuestionOrigine envoi={envoi} motif={motif} onRetour={() => { setEtapeOrigine(false); setMotif(null); }} onArchiver={(o) => void agir('sortir', false, o)} />
        </div>
      ) : (
        <div className="loc-confirmation" role="alertdialog" aria-label="Confirmer la sortie du portefeuille">
          <p style={{ margin: '0 0 8px' }}><strong>Sortir du portefeuille ?</strong> {explication}</p>
          {apercu.partages.length > 0 && (
            <p className="loc-sortie" style={{ margin: '0 0 8px' }} data-biens-partages>Non archivé{apercu.partages.length > 1 ? 's' : ''}, détenu{apercu.partages.length > 1 ? 's' : ''} aussi par un autre propriétaire actif : {apercu.partages.map((p) => `${libelleBien(p)} (avec ${p.autres.join(', ')})`).join(' ; ')}.</p>
          )}
          <p className="loc-muet" style={{ margin: '0 0 8px' }}>{phraseArchivage(sujet)}</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setApercu(null)}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi}
              onClick={() => { if (sujet === 'proprietaire') setEtapeOrigine(true); else void agir('sortir'); }}>Confirmer la sortie</button>
          </div>
        </div>
      )}
      {occupe && sortie === null && (
        <ModaleArchivage apercu={apercu} envoi={envoi} motif={motif} demanderOrigine={sujet === 'proprietaire'}
          onConfirmer={(o) => void agir('sortir', true, o)} onAnnuler={() => { setApercu(null); setMotif(null); }} />
      )}
      {motif !== null && !occupe && !etapeOrigine && <p className="cp-refus" role="alert">{motif}</p>}
      {mailEchec !== null && <p className="loc-alerte loc-alerte--orange" role="alert" data-mail-echec>{mailEchec}</p>}
    </section>
  );
}

// ══ ① LE PROPRIÉTAIRE : en gestion ? · N° de mandat · portefeuille ═══════════════════════════════════════════════════

export function SectionLocationProprietaire({ proprietaireId }: { proprietaireId: number }) {
  const { lu, relire } = useFiche<FicheProprietaireLocation>(`proprietaire=${proprietaireId}`);
  const resume = lu.etat === 'ok'
    ? [lu.data.enGestion === null ? null : `en gestion : ${lu.data.enGestion ? 'oui' : 'non'}`, lu.data.numeroMandat === null ? null : `mandat ${lu.data.numeroMandat}`,
      lu.data.numeroMandatTransaction ? `mandat de transaction ${lu.data.numeroMandatTransaction}` : null,
      lu.data.sortie === null ? null : `archivé${lu.data.sortie.origine ? ` — ${lu.data.sortie.origine}` : ''}`].filter((x) => x).join(' · ')
    : '';
  return (
    <Repli titre="Location — gestion, mandat et portefeuille" resume={resume}>
      <Lecture lu={lu}>{(d) => (
        <>
          <EnGestion proprietaireId={proprietaireId} valeur={d.enGestion} apres={relire} />
          {d.location372 && <Mandat proprietaireId={proprietaireId} valeur={d.numeroMandat} apres={relire} />}
          {d.location372 && d.numeroMandatTransaction !== undefined
            && <Mandat proprietaireId={proprietaireId} valeur={d.numeroMandatTransaction} apres={relire} sorte="transaction" />}
          <BlocSortie sujet="proprietaire" id={proprietaireId} sortie={d.sortie ?? null} apres={relire}
            explication="Le propriétaire sort avec ses biens encore dans le portefeuille (et leurs annexes) ; un bien qu’un autre propriétaire actif détient aussi reste." />
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

function Mandat({ proprietaireId, valeur, apres, sorte = 'gestion' }: { proprietaireId: number; valeur: string | null; apres: () => void; sorte?: 'gestion' | 'transaction' }) {
  const [texte, setTexte] = useState(valeur ?? '');
  const [motif, setMotif] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  return (
    <section className="loc-bloc" data-mandat={sorte}>
      <h3>{sorte === 'transaction' ? 'N° de mandat de transaction locative' : 'N° de mandat de gestion'}</h3>
      <form className="loc-actions" style={{ alignItems: 'flex-end' }} onSubmit={(e) => {
        e.preventDefault();
        void envoyer({ action: 'numero-mandat', id: proprietaireId, numeroMandat: texte, sorte }).then((m) => {
          setMotif(m); setFait(m === null); if (m === null) apres();
        });
      }}>
        <label className="loc-champ" style={{ flex: '1 1 16rem' }}>Texte libre, facultatif — jamais généré ni numéroté par l’outil
          <input value={texte} onChange={(e) => { setTexte(e.target.value); setFait(false); }} placeholder={sorte === 'transaction' ? 'ex. MT 2026-041' : 'ex. MG 2026-041'} /></label>
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
      lu.data.sortie === null || lu.data.sortie === undefined ? null : 'sorti du portefeuille',
      resumePreavis(lu.data.preavis),
      // Arno (18/10/2026) : « DPE à renseigner » / « Entretien à renseigner » d'un bien existant — visibles, jamais bloquants.
      // Un import WIPPIMMO n'a pas de catégorie : sa famille se DÉDUIT de sa nature (la règle commune `categorieDuBien`).
      ...(lu.data.parent === null && lu.data.complements ? aRenseignerDuBien(lu.data.complements, familleDeCategorie(categorieDuBien(lu.data.bien))) : [])].filter((x) => x).join(' · ')
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
            <FichesAutonomes d={d} ouvrir={ouvrir} />
            <section className="loc-bloc" data-arbre>
              <h3>Le logement et ses annexes</h3>
              <ul className="loc-arbre">
                <LigneArbre b={logement} courant={logement.id === b.id} ouvrir={ouvrir} />
                {annexes.map((a) => <LigneArbre key={a.id} b={a} enfant courant={a.id === b.id} ouvrir={ouvrir} carte={d.location372 ? relire : undefined}
                  ficheAutonome={liste(d.autonomes).find((g) => g.statut === 'active' && g.lotIds.includes(a.id))?.teteId ?? a.id} />)}
              </ul>
              {d.parent === null && d.location372 && <AjoutAnnexes parentId={b.id} rattachables={[...liste(d.rattachables)]} apres={relire} />}
            </section>
            <BlocPreavis apres={relire} lignes={liste(d.preavis).map((x) => {
              const o = occupations.find((y) => y.occupationId === x.occupationId);
              return { cle: x.occupationId, entree: o?.entree ?? null, p: x.preavis,
                libelle: o === undefined ? <strong>Occupation {x.occupationId}</strong> : <LienFiche sorte="locataire" id={o.locataireId} ouvrir={ouvrir}>{o.nom}</LienFiche> };
            })} />
            <Caracteristiques b={b} modifiable={d.location372} apres={relire} />
            {d.complements !== null && d.complements !== undefined
              && <Complements id={b.id} c={d.complements} apres={relire} annexe={b.parentId !== null} categorie={b.categorie}
                familleMention={familleDeCategorie(categorieDuBien(b))} />}
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

/**
 * Arno (19/10/2026) — LES FICHES AUTONOMES d'un bien (migration 386) : pour un lot qui en fait partie, « Issu de : [bien
 * d'origine] » et les lots de ce bien autonome ; une fiche réintégrée reste consultable, avec son statut. Pour une fiche
 * d'origine, les lots RÉINTÉGRÉS : leur historique reste visible depuis ici (lien vers la fiche du lot, qui le porte).
 */
function FichesAutonomes({ d, ouvrir }: { d: FicheBienLocation; ouvrir: Ouvrir }) {
  const toutes = liste(d.autonomes);
  const siennes = toutes.filter((g) => g.lotIds.includes(d.bien.id));
  const active = siennes.find((g) => g.statut === 'active') ?? null;
  const reintegrees = siennes.filter((g) => g.statut === 'reintegree');
  const deLOrigine = d.parent === null ? toutes.filter((g) => g.origineId === d.bien.id && g.statut === 'reintegree') : [];
  if (active === null && reintegrees.length === 0 && deLOrigine.length === 0) return null;
  const date = (iso: string | null): string => (iso === null ? '' : formaterDateIso(iso.slice(0, 10)));
  return (
    <section className="loc-bloc" data-fiches-autonomes>
      {active !== null && (
        <div data-fiche-autonome-active>
          <p style={{ margin: 0 }}><strong>Bien autonome</strong> — issu de : <LienFiche sorte="lot" id={active.origineId} ouvrir={ouvrir}>{active.origineTitre}</LienFiche>
            {' '}<span className="loc-muet">(depuis le {date(active.creeLe)})</span></p>
          {active.lotIds.length > 1 && (
            <p style={{ margin: 0 }} data-lots-autonomes>Lots de ce bien : {active.lotIds.map((id, i) => (
              <span key={id}>{i > 0 ? ' · ' : ''}{id === d.bien.id ? <strong>ce lot</strong> : <LienFiche sorte="lot" id={id} ouvrir={ouvrir}>lot {id}</LienFiche>}</span>))}</p>
          )}
        </div>
      )}
      {reintegrees.map((g) => (
        <p key={g.id} className="loc-muet" style={{ margin: 0 }} data-fiche-reintegree={g.id}>
          Fiche autonome du {date(g.creeLe)} : <strong>réintégrée dans</strong> <LienFiche sorte="lot" id={g.origineId} ouvrir={ouvrir}>{g.origineTitre}</LienFiche> le {date(g.closLe)}.</p>
      ))}
      {deLOrigine.length > 0 && (
        <div data-lots-reintegres>
          <p style={{ margin: 0 }}><strong>Lots réintégrés</strong> — leur historique reste visible :</p>
          <ul className="loc-liste">
            {[...new Set(deLOrigine.flatMap((g) => g.lotIds))].map((id) => {
              const g = deLOrigine.find((x) => x.lotIds.includes(id))!;
              return <li key={id}><LienFiche sorte="lot" id={id} ouvrir={ouvrir}>Lot {id} — historique</LienFiche> <span className="loc-muet">réintégré le {date(g.closLe)}</span></li>;
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function LigneArbre({ b, enfant = false, courant, ouvrir, carte, ficheAutonome }: {
  b: BienLocation; enfant?: boolean; courant: boolean; ouvrir: Ouvrir;
  /** Arno (19/10/2026) — la fiche du bien autonome d'une annexe détachée (le lot qui la présente). */
  ficheAutonome?: number;
  /** Arno, 18/10/2026 — sous le logement, chaque annexe porte sa carte (annotation, Supprimer · Détacher · Fermer). */
  carte?: () => void;
}) {
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
      {/* Arno (19/10/2026) — sous le logement, l'annexe détachée : « Bien autonome — détaché le JJ/MM/AAAA », avec le lien vers sa fiche. */}
      <span className="loc-muet">{b.detachee ? (
        <span className="loc-etiquette-detachee" data-bien-autonome>Bien autonome{b.detacheeLe ? ` — détaché le ${formaterDateIso(b.detacheeLe.slice(0, 10))}` : ''}</span>
      ) : null}{b.detachee && enfant ? <>{' '}<LienFiche sorte="lot" id={ficheAutonome ?? b.id} ouvrir={ouvrir}>sa fiche</LienFiche></> : null}{' '}
        {b.sorti ? 'sorti du portefeuille' : b.locataireEnPlace === null ? 'libre' : `loué à ${b.locataireEnPlace}`}</span>
      {enfant && carte !== undefined && !b.sorti && <CarteAnnexe b={b} apres={carte} />}
    </li>
  );
}

/**
 * La carte d'une annexe dans la fiche du logement (Arno, 18/10/2026) : « Annotation » (2 lignes, s'agrandit), et « Supprimer »
 * (après confirmation : l'annexe SORT du portefeuille comme les autres fiches — jamais d'effacement en base), « Détacher » /
 * « Rattacher » (une marque ; le lien avec le logement est gardé), « Fermer » (une ligne résumée ; un clic la rouvre).
 */
function CarteAnnexe({ b, apres }: { b: BienLocation; apres: () => void }) {
  const [fermee, setFermee] = useState(false);
  const [aConfirmer, setAConfirmer] = useState(false);
  const [annotation, setAnnotation] = useState(b.annotation ?? '');
  const [motif, setMotif] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [occupee, setOccupee] = useState<ApercuArchivage | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const geste = async (corps: Record<string, unknown>): Promise<void> => {
    setEnvoi(true);
    const m = await envoyer(corps);
    setEnvoi(false);
    setMotif(m);
    if (m === null) { setOccupee(null); apres(); }
  };
  // « Oui, supprimer » : une annexe LOUÉE (un parking, par exemple) passe d'abord par l'avertissement — règle d'Arno du
  // 18/10/2026, la même que pour un bien ou un propriétaire.
  const supprimer = async (): Promise<void> => {
    setAConfirmer(false);
    const a = await lireApercu('bien', b.id);
    if (typeof a === 'string') { setMotif(a); return; }
    if (a.occupees.length > 0) { setOccupee(a); return; }
    await geste({ action: 'sortir', sujet: 'bien', id: b.id });
  };
  return (
    <div className={`loc-carte-annexe${fermee ? ' loc-carte-annexe--fermee' : ''}`} data-carte-annexe={b.id}>
      <div className="loc-annexe-tete">
        {fermee
          ? <button type="button" className="loc-annexe-resume" onClick={() => setFermee(false)} aria-expanded={false} data-resume-annexe>{resumeAnnexe(b)}</button>
          : <span className="loc-annexe-titre loc-muet">{resumeAnnexe(b)}</span>}
        <span className="loc-annexe-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAConfirmer(true)}>Supprimer</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void geste({ action: 'detacher-annexe', id: b.id, detacher: !b.detachee })}>
            {b.detachee ? 'Rattacher' : 'Détacher'}</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setFermee((x) => !x)} aria-expanded={!fermee}>{fermee ? 'Ouvrir' : 'Fermer'}</button>
        </span>
      </div>
      {aConfirmer && (
        <div className="loc-confirmer" role="alert" data-confirmer-suppression>
          <span>Supprimer cette annexe ? Elle sort du portefeuille (rien n’est effacé : son historique et son lien avec le logement restent).</span>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void supprimer()}>Oui, supprimer</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAConfirmer(false)}>Non</button>
        </div>
      )}
      {!fermee && (
        <form className="loc-grille" onSubmit={(e) => { e.preventDefault(); void envoyer({ action: 'modifier-bien', id: b.id, champs: {
          categorie: b.categorie, etage: b.etage ?? '', porte: b.porte ?? '', numLotCopro: b.numLotCopro ?? '',
          surfaceCarrezM2: b.surfaceCarrezM2 ?? '', surfaceExterieureM2: b.surfaceExterieureM2 ?? '', annotation,
        } }).then((m) => { setMotif(m); setFait(m === null); if (m === null) apres(); }); }}>
          {b.detachee && <p className="loc-muet loc-pleine" style={{ margin: 0 }}>Louable séparément : hors de l’ensemble loué avec le logement, mais rattachée à lui pour toujours.</p>}
          <ZoneAuto etiquette="Annotation" valeur={annotation} placeholder="ex. Accès par la cour, clé chez le gardien" onChange={(v) => { setAnnotation(v); setFait(false); }} />
          <div className="loc-boutons loc-pleine"><button type="submit" className="svv-btn svv-btn-primary gst-btn">Enregistrer l’annotation</button></div>
        </form>
      )}
      {occupee !== null && (
        <ModaleArchivage apercu={occupee} envoi={envoi} motif={motif}
          onConfirmer={() => void geste({ action: 'sortir', sujet: 'bien', id: b.id, confirmeOccupation: true })} onAnnuler={() => { setOccupee(null); setMotif(null); }} />
      )}
      {fait && <p className="loc-muet" role="status">Enregistré.</p>}
      {motif !== null && occupee === null && <p className="cp-refus" role="alert">{motif}</p>}
    </div>
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
              ['Surface Carrez/Boutin m²', b.surfaceCarrezM2 === null ? null : `${String(b.surfaceCarrezM2).replace('.', ',')} m²`],
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
            {champ('surfaceCarrezM2', 'Surface Carrez/Boutin m²', { inputMode: 'decimal' })}
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
function Complements({ id, c, apres, annexe = false, categorie, familleMention = null }: {
  id: number; c: ComplementsFiche; apres: () => void; annexe?: boolean; categorie: string;
  /** La famille DÉDUITE (nature WIPPIMMO pour un import) — seulement pour les mentions « à renseigner », rien d'autre. */
  familleMention?: ReturnType<typeof familleDeCategorie>;
}) {
  // La famille se DÉDUIT de la catégorie (migration 376) : elle choisit les champs montrés. Une annexe : parking, accès, commentaire.
  const famille = familleDeCategorie(categorie);
  const parking = famille === 'parking' || categorie === 'box';
  const initial = {
    batiment: c.batiment ?? '', escalier: c.escalier ?? '', typeLogement: c.typeLogement ?? '', nombrePieces: c.nombrePieces === null ? '' : String(c.nombrePieces),
    meuble: c.meuble === null ? '' : c.meuble ? 'oui' : 'non', surfaceHabitableM2: c.surfaceHabitableM2 === null ? '' : String(c.surfaceHabitableM2).replace('.', ','),
    syndicId: c.syndicId === null ? '' : String(c.syndicId), epoqueConstruction: c.epoqueConstruction ?? '', chauffage: c.chauffage ?? '',
    dpeClasse: c.dpeNonSoumis === true ? DPE_NON_SOUMIS : c.dpeClasse ?? '', dpeDate: c.dpeDate ?? '', commentaire: c.commentaire ?? '',
    typeLocal: c.typeLocal ?? '', parkingSituation: c.parkingSituation ?? '', parkingType: c.parkingType ?? '',
    surfaceM2: c.surfaceM2 === null ? '' : String(c.surfaceM2).replace('.', ','),
    ascenseur: c.ascenseur === null ? '' : c.ascenseur ? 'oui' : 'non', digicode: c.digicode === null ? '' : c.digicode ? 'oui' : 'non',
    digicodeCode: c.digicodeCode ?? '', precisionAcces: c.precisionAcces ?? '', derniereAg: c.derniereAg ?? '',
    assurancePno: c.assurancePno === undefined || c.assurancePno === null ? '' : c.assurancePno ? 'oui' : 'non', pnoDateAnniversaire: c.pnoDateAnniversaire ?? '',
  };
  // La dernière AG (Arno, 18/10/2026) : celle de l'IMMEUBLE du bien, partagée par ses lots ; masquée sans immeuble (parking nu).
  const avecAg = !annexe && c.agApplicable === true;
  // L'entretien à prévoir (Arno, 18/10/2026, migration 379) : sur le bien, pas sur une annexe ; absent sans la migration.
  const avecEntretien = !annexe && c.entretiens !== undefined;
  const [entretien, setEntretien] = useState(() => versSaisieEntretien(c.entretienAPrevoir, c.entretiens));
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
    const m = await envoyer({ action: 'complements-bien', id, champs: { ...(avecAg ? { ...reste, derniereAg } : reste), ...pno, ...(avecEntretien ? versEnvoiEntretien(entretien) : {}) } });
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
    ['DPE', c.dpeNonSoumis === true ? 'non soumis (bien dispensé de DPE)' : c.dpeClasse === null && date === null ? null : [c.dpeClasse === null ? null : `classe ${c.dpeClasse}`, date === null ? null : `du ${date}`].filter((x) => x).join(' ')],
    ...(avecAg ? [[LIBELLE_AG, c.derniereAg ? new Date(`${c.derniereAg}T12:00:00`).toLocaleDateString('fr-FR') : null] as [string, string | null]] : []),
    ['Assurance PNO', c.assurancePno === undefined || c.assurancePno === null ? null : c.assurancePno
      ? `oui${c.pnoDateAnniversaire ? ` · date anniversaire le ${new Date(`${c.pnoDateAnniversaire}T12:00:00`).toLocaleDateString('fr-FR')}` : ''}` : 'non'],
    ...(avecEntretien ? [['Entretien à prévoir', c.entretienAPrevoir === null || c.entretienAPrevoir === undefined ? null : !c.entretienAPrevoir ? 'non'
      : (c.entretiens ?? []).length === 0 ? 'oui' : (c.entretiens ?? []).map((e) => `${libelleEntretien(e)}${e.dateAnniversaire ? ` (le ${new Date(`${e.dateAnniversaire}T12:00:00`).toLocaleDateString('fr-FR')})` : ''}`).join(' · ')] as [string, string | null]] : []),
    ['Commentaire', c.commentaire],
  ];
  // Ce qui ne concerne pas la famille n'est pas montré (un parking n'a ni pièces, ni meublé, ni DPE…).
  const horsParking = new Set(['Type de logement', 'Nombre de pièces', 'Meublé', 'Surface habitable', 'Époque de construction', 'Chauffage', 'DPE']);
  // Les mentions « à renseigner » (Arno, 18/10/2026) : logement / local seulement, jamais sur une annexe ; jamais bloquantes.
  const aRenseigner = annexe ? [] : aRenseignerDuBien(c, famille ?? familleMention);
  const mentionDe = (mot: string): string | null => (mot === 'DPE' && aRenseigner.includes('DPE à renseigner') ? 'DPE à renseigner'
    : mot === 'Entretien à prévoir' && aRenseigner.includes('Entretien à renseigner') ? 'Entretien à renseigner' : null);
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
          {aRenseigner.length > 0 && (
            <p className="loc-a-renseigner-ligne" data-a-renseigner-bien>{aRenseigner.map((m) => <span key={m} className="loc-a-renseigner">{m}</span>)}</p>
          )}
          <dl className="loc-grille" style={{ margin: 0 }}>
            {lignes.map(([mot, val]) => {
              const mention = val === null ? mentionDe(mot) : null;
              return (
                <div key={mot}><dt className="loc-muet">{mot}</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {val ?? (mention !== null ? <span className="loc-a-renseigner" data-a-renseigner={mot}>{mention}</span> : <span className="loc-muet">non renseigné</span>)}</dd></div>
              );
            })}
          </dl>
          <div className="loc-boutons"><button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setV(initial); setEntretien(versSaisieEntretien(c.entretienAPrevoir, c.entretiens)); setMotif(null); setEdition(true); }}>Modifier</button></div>
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
            {!parking && choix('dpeClasse', 'Classe DPE', [...CLASSES_DPE.map((x) => [x, x] as const), [DPE_NON_SOUMIS, LIBELLE_DPE_NON_SOUMIS] as const])}
            {!parking && champ('dpeDate', 'Date du DPE', { type: 'date', disabled: v.dpeClasse === DPE_NON_SOUMIS })}
            {choix('assurancePno', 'Assurance PNO', [['oui', 'Oui'], ['non', 'Non']])}
            {v.assurancePno === 'oui' && <span data-pno-date>{champ('pnoDateAnniversaire', 'Date anniversaire (PNO)', { type: 'date' })}</span>}
            {avecAg && <label className="loc-champ" data-derniere-ag>{LIBELLE_AG}
              <input type="date" value={v.derniereAg} onChange={(e) => { const val = e.target.value; setV((x) => ({ ...x, derniereAg: val })); }} />
              <small className="loc-muet">Partagée par tous les lots de l’immeuble : la modifier ici la met à jour pour eux.</small></label>}
          </div>}
          {avecEntretien && <div style={{ marginTop: 10 }}><BlocEntretien valeur={entretien} onChange={setEntretien} /></div>}
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
    ? [`${liste(lu.data.locations).length} location(s)`, lu.data.sortie === null ? null : 'sorti du portefeuille', resumePreavis(lu.data.preavis)].filter((x) => x).join(' · ')
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
            <EncartConditionsEntree d={d} modifiable={d.fiche.modifiable} apres={relire} ouvrir={ouvrir} />
            <BlocPreavis apres={relire} lignes={liste(d.preavis).map((x) => {
              const l = liste(d.locations).find((y) => y.occupationId === x.occupationId);
              return { cle: x.occupationId, entree: l?.entree ?? null, p: x.preavis,
                libelle: l === undefined || l.lotId === null ? <strong>Location {x.occupationId}</strong>
                  : <LienFiche sorte="lot" id={l.lotId} ouvrir={ouvrir}>{[l.adresse, l.commune].filter((z) => z).join(', ') || `Bien ${l.lotId}`}</LienFiche> };
            })} />
            <BlocSortie sujet="locataire" id={locataireId} sortie={d.sortie ?? null} apres={relire}
              explication="S’il a une location en cours, elle est close à la date du jour, après avertissement." />
          </>
        );
      }}</Lecture>
    </Repli>
  );
}

/**
 * ══ L'ENCART « CONDITIONS D'ENTRÉE » (Arno, 20/10/2026) ═════════════════════════════════════════════════════════════════
 * Une par bail (une entrée = un jeu de conditions, migration 391), en LECTURE ; « Modifier » ouvre LE MÊME formulaire que
 * le bloc 3 de « Nouveau locataire » (`BlocConditionsEntree`) et AJOUTE une ligne (la précédente reste lisible).
 * L'entretien à prévoir n'y est pas : c'est la donnée du bien, sur sa fiche.
 */
function EncartConditionsEntree({ d, modifiable, apres, ouvrir }: { d: FicheLocataireLocation; modifiable: boolean; apres: () => void; ouvrir: Ouvrir }) {
  const baux = liste(d.conditionsEntree);
  return (
    <section className="loc-bloc" data-encart-conditions-entree>
      <h3>Conditions d’entrée</h3>
      {d.conditionsEntreeDisponible === false
        ? <p className="loc-muet" style={{ margin: 0 }}>Mise à jour de la base à appliquer (migration 391) : les conditions d’entrée ne sont pas encore disponibles.</p>
        : baux.length === 0
          ? <p className="loc-muet" style={{ margin: 0 }}>Aucune condition d’entrée enregistrée (elles se saisissent à l’entrée, depuis « Nouveau locataire »).</p>
          : baux.map((c) => <ConditionsDuBail key={c.bailCle} c={c} d={d} modifiable={modifiable} apres={apres} ouvrir={ouvrir} />)}
    </section>
  );
}

function ConditionsDuBail({ c, d, modifiable, apres, ouvrir }: { c: ConditionsEntreeLues; d: FicheLocataireLocation; modifiable: boolean; apres: () => void; ouvrir: Ouvrir }) {
  const [saisie, setSaisie] = useState<SaisieConditions | null>(null);
  const [tente, setTente] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Le bail se présente par son logement : la première location de la fiche qui en fait partie.
  const l = liste(d.locations).find((x) => c.occupationIds.includes(x.occupationId));
  const manque = saisie === null ? {} : manquesConditions(versEnvoiConditions(saisie));
  const manqueDe = (k: string): React.ReactNode => (tente && manque[k] !== undefined ? <p className="loc-manque" role="alert">{manque[k]}</p> : null);
  const enregistrer = async (): Promise<void> => {
    if (saisie === null || l === undefined) return;
    setTente(true);
    if (Object.keys(manque).length > 0) { setMotif(`Reste à renseigner : ${Object.values(manque).map((m) => m.replace(/[.?]$/, '')).join(' · ')}.`); return; }
    setEnvoi(true);
    const m = await envoyer({ action: 'conditions-entree', occupationId: l.occupationId, conditions: versEnvoiConditions(saisie) });
    setEnvoi(false);
    if (m !== null) { setMotif(m); return; }
    setSaisie(null); setTente(false); setMotif(null); apres();
  };
  return (
    <div className="loc-cond-bail" data-conditions-bail={c.bailCle}>
      <p style={{ margin: 0 }}>
        {l === undefined || l.lotId === null ? <strong>Bail</strong>
          : <LienFiche sorte="lot" id={l.lotId} ouvrir={ouvrir}>{[l.adresse, l.commune].filter((x) => x).join(', ') || `Bien ${l.lotId}`}</LienFiche>}{' '}
        <span className="loc-muet">— {c.modifiees ? 'modifiées' : 'saisies'} le {formaterDateIso(c.saisiLe.slice(0, 10))} par {c.saisiPar}</span>
      </p>
      {saisie === null ? (
        <>
          <dl className="loc-cond-lecture">
            {c.lignes.map((x, i) => (
              <div key={`${i}-${x.mot}`} style={{ display: 'contents' }}>
                <dt>{x.mot}</dt><dd>{x.valeur}{x.detail !== undefined && <small className="loc-cond-detail"> — {x.detail}</small>}</dd>
              </div>
            ))}
          </dl>
          {modifiable && l !== undefined && (
            <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setSaisie(versSaisieConditions(c.conditions, c.loyer ?? null))} data-modifier-conditions>Modifier</button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Les honoraires propriétaire : ceux CALCULÉS À L'ENTRÉE, relus (jamais recalculés après coup). */}
          <BlocConditionsEntree valeur={saisie} onChange={(v) => { setSaisie(v); setMotif(null); }} manque={manqueDe}
            honoraires={{ calcul: c.honoraires ?? null, lienBien: null }} dateEntree={l?.entree ?? null} />
          {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void enregistrer(); }} data-enregistrer-conditions>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setSaisie(null); setTente(false); setMotif(null); }}>Annuler</button>
          </div>
        </>
      )}
    </div>
  );
}

const CSS_SECTIONS = `
.loc-cond-bail{display:flex;flex-direction:column;gap:8px;padding:12px 0;border-top:1px solid var(--color-svv-line)}
.loc-cond-bail:first-of-type{border-top:0;padding-top:0}
.loc-cond-bail .slf-lien{display:inline-flex;align-items:center;min-height:44px}
.loc-cond-detail{color:var(--color-svv-muted)}
.loc-a-renseigner-ligne{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.loc-a-renseigner{display:inline-block;border-radius:999px;padding:2px 10px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);font-weight:700;font-size:.85rem}
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
