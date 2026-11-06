'use client';

import { useEffect, useRef, useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EtatLecture, envoyer, phraseMail, phrasesMailsAvis, useLecture } from './commun';
import { CSS_RESULTATS } from './AccueilLocation';
import { ModaleEnvois } from './ConfirmationEnvois';
import { ParcoursPreavisSortie, ParcoursSurBail, type FinParcours } from './ParcoursPreavisSortie';
import type { ConfirmationAction } from '../../../../lib/location/confirmationEnvois';
import { CSS_ECRAN_ARCHIVAGE } from './ArchivageProprietaire';
import { HistoriqueEchangesDuLogementLecture } from '../gestion/HistoriqueEchangesLecture';
import { CSS_PREAVIS, GestesPreavis, MentionPreavis, aujourdhuiParisEcran } from './Preavis';
import type { PreavisDuBail } from '../../../../lib/location/preavisRepo';
import {
  dateFr, descriptionLogement, libelleLotEncart, lignesEncart, type BailLogement, type EncartLogement, type OccupantTrouve, type SortieEnregistree,
} from '../../../../lib/location/sortieLocataires';

/**
 * ══ 🔴🔴 TUILE LOCATION — SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) ════════════════════════════════════════
 * ① « Supprimer un/des locataire(s) » : une seule ligne de recherche, résultats pendant la frappe (200 ms, requête
 *    précédente ANNULÉE), les seuls OCCUPANTS en place — en VERT avec le MOT « occupant » (jamais la couleur seule) ;
 * ② au clic : LA fiche locataire commune (aucune copie), surmontée du bloc « Sortie du logement » (`BlocSortieLogement`) :
 *    une case par locataire du bail, TOUTES cochées ; une date obligatoire, vide ; la phrase « VACANT » / « reste loué à » ;
 *    les annexes du bail qui suivent ; « Valider la sortie » → récapitulatif → « Confirmer » ;
 * ③ une sortie enregistrée se CORRIGE (date) ou s'ANNULE par un geste dédié, journalisé.
 * Couleurs : jetons --color-svv-* uniquement. Cibles ≥ 44 px, rien au survol seul.
 */

const API = '/api/admin/location';

/** L'écran de recherche des occupants. */
export function EcranSortieRecherche() {
  const [texte, setTexte] = useState('');
  const [etatLu, setEtat] = useState<{ etat: 'vide' } | { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; terme: string; data: OccupantTrouve[] }>({ etat: 'vide' });
  const controleur = useRef<AbortController | null>(null);
  useEffect(() => {
    const terme = texte.trim();
    controleur.current?.abort();
    if (terme.length < 2) return;   // l'état « vide » se déduit au rendu (`affiche`)
    const c = new AbortController();
    controleur.current = c;
    const t = setTimeout(() => {
      setEtat({ etat: 'charge' });
      void (async () => {
        try {
          const res = await fetch(`${API}?occupants=${encodeURIComponent(terme)}`, { cache: 'no-store', signal: c.signal });
          if (res.status === 403) { setEtat({ etat: 'erreur', message: 'Accès refusé : droit « Location » requis.' }); return; }
          const d = await res.json() as { etat?: string; data?: OccupantTrouve[]; message?: string };
          if (c.signal.aborted) return;
          if (d.etat === 'ok' && Array.isArray(d.data)) setEtat({ etat: 'ok', terme, data: d.data });
          else setEtat({ etat: 'erreur', message: d.message ?? 'Lecture impossible.' });
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') return;
          setEtat({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' });
        }
      })();
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [texte]);

  const etat = texte.trim().length < 2 ? { etat: 'vide' as const } : etatLu;
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_SORTIE + CSS_PREAVIS}</style>
      <p className="loc-retour"><a href="/admin/location/locataires">← Locataires</a></p>
      <header className="svv-page-head loc-tete-comme-accueil">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">Supprimer un/des locataire(s)</h1></div>
        <p className="svv-page-sub">Faire sortir un ou plusieurs locataires d’un logement. Rien n’est effacé : un sortant reste dans l’historique du bien.</p>
      </header>
      <label className="loc-recherche loc-recherche--large">
        <span aria-hidden="true">🔎</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} type="search" autoFocus data-recherche-occupants
          placeholder="Chercher un locataire occupant : nom, prénom, téléphone, e-mail ou adresse du logement"
          aria-label="Chercher un locataire occupant : nom, prénom, téléphone, e-mail ou adresse du logement" />
        {texte !== '' && <button type="button" className="loc-vider sor-vider" aria-label="Vider la recherche" onClick={() => setTexte('')}>×</button>}
      </label>
      <section aria-live="polite" aria-label="Locataires occupants trouvés" data-resultats-occupants>
        {etat.etat === 'vide' ? <p className="loc-muet">Tapez au moins deux caractères. Seuls les locataires <strong>occupants</strong> (en place aujourd’hui) apparaissent.</p>
          : etat.etat === 'charge' ? <p className="loc-muet" role="status">Recherche…</p>
            : etat.etat === 'erreur' ? <p className="cp-refus" role="alert">{etat.message}</p>
              : etat.data.length === 0 ? <p className="loc-muet">Aucun locataire occupant ne correspond à « {etat.terme} ».</p>
                : (
                  <ul className="sor-res">
                    {etat.data.map((o) => (
                      <li key={o.occupationId}>
                        <a className="sor-ligne" href={`/admin/location/locataire/${o.locataireId}?sortie=${o.occupationId}`} data-occupation={o.occupationId}>
                          {/* Arno (19/10/2026) — un occupant EN PRÉAVIS passe du vert au BLEU, et le mot le dit. */}
                          {o.preavisDateMax ? <span className="sor-occupant sor-occupant--preavis" data-statut="en_preavis">en préavis</span>
                            : <span className="sor-occupant" data-statut="occupant">occupant</span>}
                          <strong className="sor-nom">{o.nom}</strong>
                          {o.preavisDateMax ? <span className="sor-preavis"><MentionPreavis p={{ dateMax: o.preavisDateMax }} jour={aujourdhuiParisEcran()} /></span> : null}
                          <span className="sor-infos">
                            <span>{o.adresse ?? `Bien ${o.lotId}`}</span>
                            <span>{descriptionEtage(o.etage, o.porte)}</span>
                            <span>Propriétaire : {o.proprietaire ?? 'non renseigné'}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
      </section>
    </div>
  );
}

function descriptionEtage(etage: string | null, porte: string | null): string {
  const d = descriptionLogement({ type: null, etage, porte });
  return d === 'Logement' ? 'étage non renseigné' : d;
}

/** « Ajouter un/des locataire(s) » : à venir (la spécification arrive). Aucun formulaire. */
export function EcranAjouterLocatairesAVenir() {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION}</style>
      <p className="loc-retour"><a href="/admin/location/locataires">← Locataires</a></p>
      <header className="svv-page-head loc-tete-comme-accueil">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">Ajouter un/des locataire(s)</h1></div>
        <p className="svv-page-sub">Faire entrer un ou plusieurs locataires dans un logement.</p>
      </header>
      <section className="loc-bloc" data-a-venir>
        <h3>À venir</h3>
        <p>Cet écran est en préparation : sa description est en cours de rédaction. Rien ne peut encore être saisi ici.</p>
        <p className="loc-muet">En attendant, « + Nouveau locataire » reste disponible sur la page <a href="/admin/location/locataires">Locataires</a>.</p>
      </section>
    </div>
  );
}

// ══ LE BLOC « SORTIE DU LOGEMENT », au-dessus de la fiche locataire commune ═══════════════════════════════════════════

interface Baux { enPlace: { occupationId: number; adresse: string | null }[]; sorties: SortieEnregistree[] }

export function BlocSortieLogement({ locataireId, occupationDemandee, gestion = true }: { locataireId: number; occupationDemandee: number | null; gestion?: boolean }) {
  const baux = useLecture<Baux>(`bauxLocataire=${locataireId}`);
  const [choisie, setChoisie] = useState<number | null>(occupationDemandee);
  const [resultat, setResultat] = useState<{ geste: 'preavis' | 'sortie'; phrase: string; mail: string | null; sansMail: boolean } | null>(null);
  if (baux.etat.etat !== 'ok') return <section className="loc-bloc sor-bloc"><style>{CSS_LOCATION_ECRANS + CSS_SORTIE}</style><EtatLecture etat={baux.etat} /></section>;
  const d = baux.etat.data;
  const enPlace = d.enPlace;
  const occupation = choisie !== null && enPlace.some((b) => b.occupationId === choisie) ? choisie
    : enPlace.length === 1 ? enPlace[0].occupationId : null;
  if (enPlace.length === 0 && d.sorties.length === 0 && resultat === null) return null;
  return (
    <section className="loc-bloc sor-bloc" data-sortie-logement aria-label="Sortie du logement">
      <style>{CSS_LOCATION_ECRANS + CSS_SORTIE + CSS_PREAVIS}</style>
      <h3>Sortie du logement</h3>
      {resultat !== null && (
        <div className="sor-fait" role="status" {...(resultat.geste === 'sortie' ? { 'data-sortie-faite': '' } : { 'data-preavis-fait': '' })}>
          <p><strong>{resultat.geste === 'sortie' ? 'Sortie enregistrée.' : 'Préavis enregistré.'}</strong> {resultat.phrase}</p>
          {resultat.sansMail ? <p className="loc-muet" data-aucun-mail>Aucun mail n’a été envoyé.</p>
            : resultat.mail !== null ? <p className="cp-refus" role="alert" data-mail-echec>{resultat.mail}</p>
            : resultat.geste === 'sortie' ? <p className="loc-muet" data-mail-envoye>Mail de confirmation envoyé.</p> : null}
        </div>
      )}
      {enPlace.length === 0 ? <p className="loc-muet">Ce locataire n’occupe aucun logement aujourd’hui.</p>
        : occupation === null ? (
          <div className="sor-choix">
            <p>Ce locataire occupe plusieurs logements : lequel quitte-t-il ?</p>
            {enPlace.map((b) => (
              <button key={b.occupationId} type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setChoisie(b.occupationId)}>
                {b.adresse ?? `Logement (occupation ${b.occupationId})`}</button>
            ))}
          </div>
        ) : (
          <FormulaireSortie key={occupation} occupationId={occupation} gestion={gestion}
            apres={(f) => { setResultat({ geste: f.geste, phrase: f.phrase, sansMail: !f.avecMails, mail: f.geste === 'sortie' && f.avecMails && f.mail !== undefined ? phraseMail(f.mail) : null });
              baux.rafraichir(); }} />
        )}
      {d.sorties.length > 0 && <SortiesEnregistrees sorties={d.sorties} apres={() => { setResultat(null); baux.rafraichir(); }} />}
    </section>
  );
}

/** 🔴 Arno (06/11/2026) — la fiche locataire : LE MÊME PARCOURS que l'écran de sortie (cartes, Préavis / Sortie, deux boutons, récapitulatif, résultat). */
function FormulaireSortie({ occupationId, apres, gestion }: { occupationId: number; apres: (f: FinParcours) => void; gestion: boolean }) {
  const [version, setVersion] = useState(0);
  const lu = useLecture<BailLogement>(`bail=${occupationId}&v=${version}`);
  if (lu.etat.etat !== 'ok') return <EtatLecture etat={lu.etat} />;
  return <ParcoursSurBail bail={lu.etat.data} occupationId={occupationId} gestion={gestion} onFini={(f) => { setVersion((v) => v + 1); apres(f); }} />;
}

// ══ L'ÉCRAN DE SORTIE ALIGNÉ SUR « SUPPRIMER UN DES BIENS » (Arno, 18-19/10/2026) ═════════════════════════════════════

/** « Faire sortir 1 locataire » / « Faire sortir 2 locataires ». */
export const libelleFaireSortir = (n: number): string => `Faire sortir ${n} locataire${n > 1 ? 's' : ''}`;

/**
 * /admin/location/locataire/[id]?sortie=N — LA MÊME LOGIQUE QUE « Supprimer un des biens d'un propriétaire »
 * (`EcranArchivageProprietaire`, mode « biens ») : mêmes classes (`arc-*`), même bandeau collant (recherche + gros bouton
 * rouge à compteur), même grille de cartes à bouton bascule. 🔴 SUR CET ÉCRAN SEULEMENT (accord d'Arno, 18/10/2026) : ni
 * le bloc « Fiche commune avec la Gestion… » (texte, « Retour », barre « Annuaire »), ni la fiche complète — la fiche
 * normale (sans `?sortie=`) reste celle de toujours. Écriture, journal, mail, correction et annulation : ceux du commit
 * ad2568f9, inchangés (`sortie-locataires`).
 */
export function EcranSortieLocataire({ occupationInitiale, gestion = false }: { occupationInitiale: number; gestion?: boolean }) {
  const [occupation, setOccupation] = useState(occupationInitiale);
  const [texte, setTexte] = useState('');
  const [etatLu, setEtat] = useState<{ etat: 'vide' } | { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; terme: string; data: OccupantTrouve[] }>({ etat: 'vide' });
  const etat: EtatRecherche = texte.trim().length < 2 ? { etat: 'vide' } : etatLu;
  const [version, setVersion] = useState(0);
  const [bilan, setBilan] = useState<BilanSortie | null>(null);
  /** 🔴 Arno (05/11/2026) — la modale de confirmation de la sortie (hors du bail, qui se recharge après la sortie). */
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const controleur = useRef<AbortController | null>(null);
  useEffect(() => {
    const terme = texte.trim();
    controleur.current?.abort();
    if (terme.length < 2) return;   // l'état « vide » se déduit au rendu (`affiche`)
    const c = new AbortController();
    controleur.current = c;
    const t = setTimeout(() => {
      setEtat({ etat: 'charge' });
      void (async () => {
        try {
          const res = await fetch(`${API}?occupants=${encodeURIComponent(terme)}`, { cache: 'no-store', signal: c.signal });
          const d = await res.json() as { etat?: string; data?: OccupantTrouve[]; message?: string };
          if (c.signal.aborted) return;
          if (d.etat === 'ok' && Array.isArray(d.data)) setEtat({ etat: 'ok', terme, data: d.data });
          else setEtat({ etat: 'erreur', message: d.message ?? 'Lecture impossible.' });
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') return;
          setEtat({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' });
        }
      })();
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [texte]);
  const lu = useLecture<BailLogement>(`bail=${occupation}&v=${version}`);
  const choisir = (o: OccupantTrouve): void => {
    setTexte(''); setBilan(null); setOccupation(o.occupationId);
    // L'adresse suit le logement choisi (un rechargement retombe dessus), sans quitter l'écran.
    try { window.history.replaceState(null, '', `/admin/location/locataire/${o.locataireId}?sortie=${o.occupationId}`); } catch { /* sans effet */ }
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="loc-page arc-page" data-ecran-sortie-locataire>
      <style>{CSS_LOCATION_ECRANS + CSS_RESULTATS + CSS_ECRAN_ARCHIVAGE + CSS_SORTIE + CSS_PREAVIS}</style>
      <p className="loc-retour"><a href="/admin/location/locataires">← Ajouter ou supprimer un locataire</a></p>
      <h1 className="arc-cache">Faire sortir un ou plusieurs locataires</h1>
      {lu.etat.etat !== 'ok' ? (
        <>
          <BarreOccupants texte={texte} setTexte={setTexte} etat={etat} choisir={choisir} />
          <EtatLecture etat={lu.etat} />
        </>
      ) : (
        <SortieDuBail key={`${occupation}-${version}`} bail={lu.etat.data} occupationId={occupation} bilan={bilan} gestion={gestion}
          barre={<BarreOccupants texte={texte} setTexte={setTexte} etat={etat} choisir={choisir} />}
          apres={(phrase, mail, adhoc, c, sansMail) => { setBilan({ phrase, mail, adhoc, ...(sansMail === true ? { sansMail } : {}) }); setVersion((v) => v + 1); if (c !== undefined) setConfirmation(c); }} />
      )}
      {confirmation !== null && <ModaleEnvois issue={confirmation.issue} rappel={confirmation.rappel} onFermer={() => setConfirmation(null)} />}
    </div>
  );
}

type EtatRecherche = { etat: 'vide' } | { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; terme: string; data: OccupantTrouve[] };

/** La barre de recherche des OCCUPANTS, au gabarit de celle de l'écran des biens (panneau sous la barre). */
function BarreOccupants({ texte, setTexte, etat, choisir }: {
  texte: string; setTexte: (t: string) => void; etat: EtatRecherche; choisir: (o: OccupantTrouve) => void;
}) {
  return (
    <div className="arc-recherche">
      <label className="loc-recherche loc-recherche--large">
        <span aria-hidden="true">🔎</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} type="search" data-recherche-occupants
          placeholder="Chercher un locataire occupant : nom, prénom, téléphone, e-mail ou adresse du logement"
          aria-label="Chercher un autre locataire occupant (nom, prénom, téléphone, e-mail ou adresse du logement)"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setTexte(''); } }} />
        {texte !== '' && <button type="button" className="loc-vider" aria-label="Vider la recherche" onClick={() => setTexte('')}>×</button>}
      </label>
      {etat.etat !== 'vide' && (
        <div className="loc-panneau arc-panneau" data-panneau>
          {etat.etat === 'charge' ? <p className="loc-muet loc-panneau-vide" role="status">Recherche…</p>
            : etat.etat === 'erreur' ? <p className="cp-refus loc-panneau-vide" role="alert">{etat.message}</p>
              : etat.data.length === 0 ? <p className="loc-muet loc-panneau-vide">Aucun locataire occupant ne correspond à « {etat.terme} ».</p>
                : (
                  <ul className="loc-res" role="listbox">
                    {etat.data.map((o) => (
                      <li key={o.occupationId} role="presentation">
                        <button type="button" role="option" aria-selected={false} className="loc-res-ligne arc-res-ligne" data-occupation={o.occupationId} onClick={() => choisir(o)}>
                          <span className="loc-res-type loc-res-type--locataires" data-statut="occupant">occupant</span>
                          <strong className="loc-res-nom">{o.nom}{o.preavisDateMax ? <>{' '}<MentionPreavis p={{ dateMax: o.preavisDateMax }} jour={aujourdhuiParisEcran()} /></> : null}</strong>
                          <span className="loc-res-infos">
                            <span className="loc-res-tel">{descriptionEtage(o.etage, o.porte)}</span>
                            <span className="loc-res-mail">{o.proprietaire ? `Propriétaire : ${o.proprietaire}` : ''}</span>
                            <span className="loc-res-adr">{o.adresse ?? `Bien ${o.lotId}`}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
        </div>
      )}
    </div>
  );
}

/** Le bandeau de bilan d'une sortie (sous les boutons) ; `sansMail` : « Enregistrer » seul — aucun mail parti. */
interface BilanSortie { phrase: string; mail: string | null; adhoc?: { ok: boolean; texte: string }[]; sansMail?: boolean }

function SortieDuBail({ bail, occupationId, barre, bilan, apres, gestion }: {
  bail: BailLogement; occupationId: number; barre: React.ReactNode; bilan: BilanSortie | null; gestion: boolean;
  apres: (phrase: string, mail: string | null, adhoc?: { ok: boolean; texte: string }[], confirmation?: ConfirmationAction, sansMail?: boolean) => void;
}) {
  // 🔴 Arno (06/11/2026) — AUCUN locataire présélectionné : un clic sur sa carte le sélectionne (rouge), un second le retire.
  const [choix, setChoix] = useState<number[]>([]);
  const n = choix.length;
  const basculer = (id: number): void => { setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); };
  const encart = useLecture<EncartLogement & { locataireCle: string | null; lotCle: string }>(`encartBail=${occupationId}`);
  const [versionPreavis, setVersionPreavis] = useState(0);
  const preavis = useLecture<PreavisDuBail>(`preavisBail=${occupationId}&p=${versionPreavis}`);
  const [preavisFait, setPreavisFait] = useState<{ texte: string; sansMail: boolean } | null>(null);
  const [mailsPreavis, setMailsPreavis] = useState<{ ok: boolean; texte: string }[]>([]);
  const pv = preavis.etat.etat === 'ok' ? preavis.etat.data : null;
  const preavisDe = (occupation: number) => pv?.locataires.find((l) => l.occupationId === occupation)?.preavis ?? null;
  const envoyerGeste = async (corps: Record<string, unknown>): Promise<string | null> => (await envoyer(corps)).motif;
  const relirePreavis = (): void => setVersionPreavis((v) => v + 1);
  // Arno (05/11/2026) — le libellé du bouton suit le nombre de locataires choisis (hors préavis déjà ouverts) ; un seul occupant :
  // l'écran reste tel qu'avant (« Enregistrer un préavis »).
  const nPreavis = choix.filter((id) => preavisDe(id) === null).length;
  const libellePreavis = libelleEnregistrerPreavis(bail.locataires.length, nPreavis);
  // Arno (05/11/2026) — LE LOCATAIRE RECHERCHÉ en tête, mis en avant ; les autres occupants du logement sous la question.
  const recherche = bail.locataires.find((l) => l.occupationId === occupationId) ?? bail.locataires[0];
  const autres = bail.locataires.filter((l) => l !== recherche);
  const carte = (l: BailLogement['locataires'][number], enAvant: boolean) => {
    const pris = choix.includes(l.occupationId);
    return (
      <li key={l.occupationId} className={`arc-bien-carte sor-carte-cliquable${pris ? ' arc-bien-carte--choisi' : ''}${enAvant ? ' sor-carte--recherche' : ''}`} data-locataire={l.occupationId}
        {...(enAvant ? { 'data-recherche': '' } : {})}
        // 🔴 Arno (06/11/2026) — la carte entière sélectionne ; un lien ou un bouton de la carte garde son propre geste.
        onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button, input, select, textarea, summary')) basculer(l.occupationId); }}>
        {enAvant && autres.length > 0 && <span className="sor-recherche-mot" data-mot-recherche>Locataire recherché</span>}
        {/* Arno (19/10/2026) — EN PRÉAVIS : le nom passe du surlignage vert au BLEU ; la mention, dessous, le dit en mots. */}
        <ul className="arc-noms"><li>{preavisDe(l.occupationId) !== null
          ? <mark className="arc-surligne sor-surligne--preavis" data-en-preavis>{l.nom}</mark>
          : <mark className="arc-surligne arc-surligne--en-place" data-en-place>{l.nom}</mark>}</li></ul>
        {/* Arno (19/10/2026) — TOUS ses téléphones (avec leur libellé) et ses e-mails, cliquables, un par ligne. */}
        {encart.etat.etat === 'ok' && <CoordonneesCarte c={encart.etat.data.coordonnees?.locataires.find((x) => x.occupationId === l.occupationId) ?? null} />}
        <span className="loc-muet" data-entree-le>{l.entree === null ? 'Date d’entrée non renseignée' : `Entré(e) dans les lieux le ${dateFr(l.entree)}`}</span>
        {(() => {
          const p = preavisDe(l.occupationId);
          return p === null ? null : (
            <div className="sor-carte-preavis" data-carte-preavis={l.occupationId}>
              <MentionPreavis p={p} jour={aujourdhuiParisEcran()} />
              <GestesPreavis p={p} entree={l.entree} envoyerGeste={envoyerGeste} apres={relirePreavis} />
            </div>
          );
        })()}
        <a className="arc-lien sor-voir" href={`/admin/location/locataire/${l.locataireId}`} data-voir-fiche>Voir la fiche</a>
        <button type="button" className="arc-choisir" aria-pressed={pris} data-choisir={l.occupationId} onClick={() => basculer(l.occupationId)}>
          {pris ? '✓ Sélectionné' : 'Sélectionner'}
        </button>
      </li>
    );
  };
  return (
    <>
      <div className="arc-collant" data-collant>
        {barre}
        <div className="arc-action" data-bouton-sortie-locataires={n}>
          {pv !== null && !pv.disponible && <p className="loc-muet" style={{ margin: 0 }} data-preavis-indisponible>Préavis : la mise à jour de la base (migration 383) reste à appliquer.</p>}
          {/* 🔴 Arno (06/11/2026) — LE PARCOURS EN UNE PASSE (Préavis ou Sortie → dates → « Enregistrer » / « Enregistrer et envoyer les mails » →
              récapitulatif → résultat) ; le même sur l'accueil et la fiche locataire. */}
          <ParcoursPreavisSortie bail={bail} occupationId={occupationId} choix={choix} gestion={gestion}
            locataires={bail.locataires.map((l) => ({ occupationId: l.occupationId, nom: l.nom, entree: l.entree, dateMaxPreavis: preavisDe(l.occupationId)?.dateMax ?? null }))}
            dureeProposee={pv?.dureeProposee ?? 1} raison={pv?.raison ?? ''} preavisDisponible={pv !== null && pv.disponible}
            libellePreavis={libellePreavis} libelleSortie={libelleFaireSortir(n)}
            onFini={(f) => {
              setChoix([]);
              if (f.geste === 'preavis') {
                setPreavisFait({ texte: `Préavis enregistré — ${f.noms.join(', ')}${f.dateMax !== undefined ? `, fin du bail au plus tard le ${dateFr(f.dateMax)}` : ''}. Le logement reste occupé jusqu’à la sortie validée.`, sansMail: !f.avecMails });
                setMailsPreavis(f.avecMails ? phrasesMailsAvis(f.mails) : []);
                relirePreavis();
              } else {
                apres(f.phrase, f.avecMails ? (f.mail === undefined ? null : phraseMail(f.mail)) : null, f.avecMails ? phrasesMailsAvis(f.adhoc) : [], undefined, !f.avecMails);
              }
            }} />
          {preavisFait !== null && (
            <div className="gst-info arc-bilan" role="status" data-preavis-fait>
              <p style={{ margin: 0 }}>{preavisFait.texte}</p>
              {preavisFait.sansMail ? <p className="loc-muet" style={{ margin: 0 }} data-aucun-mail>Aucun mail n’a été envoyé.</p> : <PhrasesMails phrases={mailsPreavis} />}
            </div>
          )}
          {bilan !== null && (
            <div className="gst-info arc-bilan" role="status" data-sortie-faite>
              <p style={{ margin: 0 }}><strong>Sortie enregistrée.</strong> {bilan.phrase} — rien n’a été effacé.</p>
              {bilan.sansMail === true ? <p className="loc-muet" style={{ margin: 0 }} data-aucun-mail>Aucun mail n’a été envoyé.</p>
                : bilan.mail !== null ? <p className="cp-refus" role="alert" data-mail-echec>{bilan.mail}</p>
                : <p className="loc-muet" style={{ margin: 0 }} data-mail-envoye>Mail de confirmation envoyé.</p>}
              <PhrasesMails phrases={bilan.adhoc ?? []} />
            </div>
          )}
        </div>
      </div>
      {/* Arno (19/10/2026) — L'ENCART SUR TRAME GRISE, EN DEUX PARTIES NETTEMENT SÉPARÉES : « Le logement », « Les locataires ». */}
      <section className="arc-biens sor-cadre" aria-label="Le logement et ses locataires" data-selection-locataires>
        <div className="sor-partie" data-partie="logement">
          <h2 className="arc-biens-titre">Le logement</h2>
          {encart.etat.etat === 'ok' ? <EncartDuLogement e={encart.etat.data} /> : <EtatLecture etat={encart.etat} />}
        </div>
        <div className="sor-partie" data-partie="locataires">
        <h2 className="arc-biens-titre">Les locataires <span className="loc-pastille">{bail.locataires.length}</span></h2>
        {bail.locataires.length === 0 ? <p className="loc-muet">Plus aucun locataire en place dans ce logement : rien à faire sortir.</p>
          : autres.length === 0 ? <ul className="arc-biens-liste">{carte(recherche, true)}</ul> : (
            <>
              <ul className="arc-biens-liste">{carte(recherche, true)}</ul>
              {/* Arno (05/11/2026) — les autres occupants, cochés par défaut, décochables un par un (« Reste dans le logement »). */}
              <p className="sor-question" data-question-autres>{QUESTION_AUTRES_OCCUPANTS}</p>
              <ul className="arc-biens-liste" data-autres-occupants>{autres.map((l) => carte(l, false))}</ul>
            </>
          )}
        </div>
      </section>
      {encart.etat.etat === 'ok' && (
        <section className="arc-biens sor-historique" aria-label="Historique des échanges du logement" data-historique-logement>
          {!gestion ? <p className="svv-card" style={{ color: 'var(--color-svv-muted)', margin: 0 }} data-historique-refus>{REFUS_HISTORIQUE_GESTION}</p>
            : encart.etat.data.locataireCle === null || encart.etat.data.lotCle === '' ? <p className="loc-muet">Historique des échanges indisponible : ce locataire ou ce logement n’a pas de clé d’annuaire.</p>
              : <HistoriqueEchangesDuLogementLecture locataireCle={encart.etat.data.locataireCle} lotCle={encart.etat.data.lotCle} nom={bail.locataires[0]?.nom ?? ''} />}
        </section>
      )}
    </>
  );
}


/** Les coordonnées d'un locataire sur sa carte : chaque téléphone (avec son libellé) et chaque e-mail, un par ligne. */
function CoordonneesCarte({ c }: { c: { telephonesDetail?: { valeur: string; libelle: string | null }[]; telephones: string[]; emails: string[] } | null }) {
  if (c === null) return null;
  const tels = c.telephonesDetail ?? c.telephones.map((valeur) => ({ valeur, libelle: null }));
  if (tels.length + c.emails.length === 0) return null;
  return (
    <ul className="sor-coords-carte" data-coordonnees-carte>
      {tels.map((t) => <li key={`t${t.valeur}`}><a href={`tel:${t.valeur.replace(/\s+/g, '')}`} data-tel>{t.libelle ? `${t.libelle} : ` : ''}{t.valeur}</a></li>)}
      {c.emails.map((m) => <li key={`m${m}`}><a href={`mailto:${m}`} data-mail>{m}</a></li>)}
    </ul>
  );
}

/**
 * Arno (05/11/2026) — LE LIBELLÉ DU GROS BOUTON DE PRÉAVIS suit le nombre de locataires choisis (hors préavis déjà ouverts) :
 * « Enregistrer le préavis de N locataire(s) ». Un logement à UN occupant (ou aucun choisi) garde « Enregistrer un préavis ». PUR.
 */
export function libelleEnregistrerPreavis(occupants: number, choisis: number): string {
  return occupants <= 1 || choisis === 0 ? 'Enregistrer un préavis' : `Enregistrer le préavis de ${choisis} locataire${choisis > 1 ? 's' : ''}`;
}

/** Arno (05/11/2026) — la question au-dessus des AUTRES occupants du logement (cochés par défaut, décochables un par un). */
export const QUESTION_AUTRES_OCCUPANTS = 'Associer les autres occupants du logement à ce préavis / cette sortie ?';

/** Une phrase par mail automatique (envoyé : discrète ; non envoyé : en alerte, avec la raison). */
function PhrasesMails({ phrases }: { phrases: readonly { ok: boolean; texte: string }[] }) {
  if (phrases.length === 0) return null;
  return (
    <ul className="sor-mails" data-mails-automatiques>
      {phrases.map((p, i) => (
        <li key={`${i}-${p.texte}`} className={p.ok ? 'loc-muet' : 'cp-refus'} {...(p.ok ? { 'data-mail-ok': '' } : { 'data-mail-ko': '', role: 'alert' })}>{p.texte}</li>
      ))}
    </ul>
  );
}

/** Décision d'Arno (18/10/2026) : la sortie OFFICIELLE est validée par un utilisateur de la Gestion (droit vérifié au serveur). */
export const MESSAGE_SORTIE_GESTION = 'La sortie est validée par un utilisateur de la Gestion';

/** Sans le droit « Gestion », l'historique (celui de la Gestion) n'est pas lisible — même règle que la fiche commune. */
export const REFUS_HISTORIQUE_GESTION = 'L’historique des échanges est celui de la Gestion (mails et pièces) : il demande aussi le droit « Gestion ».';

/**
 * L'ENCART « LE LOGEMENT » : l'adresse en titre, puis UNIQUEMENT ce que la base connaît (`lignesEncart`) — une information
 * absente n'apparaît pas —, les lots du bail (logement + annexes) et le propriétaire avec le lien vers sa fiche.
 */
/** Arno (19/10/2026) — avec `coordonnees`, l'encart montre AUSSI les téléphones et e-mails (accueil, bloc des préavis). */
export function EncartDuLogement({ e, coordonnees = false }: { e: EncartLogement; coordonnees?: boolean }) {
  const lignes = lignesEncart(e);
  const lots = Array.isArray(e.lots) ? e.lots : [];
  return (
    <div className="loc-bloc sor-encart" data-encart-logement>
      <h3 className="sor-encart-titre">{e.adresse ?? `Bien ${e.lotId}`}</h3>
      {(lignes.length > 0 || (e.proprietaire ?? null) !== null) && (
        <dl className="sor-encart-dl">
          {e.proprietaire != null && (<div data-ligne="proprietaire"><dt>Propriétaire</dt>
            <dd><a href={`/admin/location/proprietaire/${e.proprietaire.id}`} data-lien-proprietaire>{e.proprietaire.nom}</a></dd></div>)}
          {lignes.map((l) => <div key={l.cle} data-ligne={l.cle}><dt>{l.libelle}</dt><dd>{l.valeur}</dd></div>)}
        </dl>
      )}
      <div className="sor-encart-lots" data-lots-du-bail>
        <p className="sor-encart-sous">{lots.length > 1 ? `Lots de ce bail (${lots.length})` : 'Lot de ce bail'}</p>
        <ul>
          {lots.map((l) => <li key={l.lotId} data-lot={l.lotId} data-role={l.role}>{libelleLotEncart(l)}</li>)}
        </ul>
      </div>
      {coordonnees && e.coordonnees && <CoordonneesEncart e={e} />}
    </div>
  );
}

/** Les coordonnées du propriétaire et des locataires — seulement celles qui existent ; liens « tel: » et « mailto: ». */
function CoordonneesEncart({ e }: { e: EncartLogement }) {
  const c = e.coordonnees!;
  const liste = (p: { telephones: string[]; emails: string[] }) => [
    ...p.telephones.map((t) => <a key={`t${t}`} href={`tel:${t.replace(/\s+/g, '')}`}>{t}</a>),
    ...p.emails.map((m) => <a key={`m${m}`} href={`mailto:${m}`}>{m}</a>),
  ];
  const proprio = e.proprietaire != null && c.proprietaire !== null && (c.proprietaire.telephones.length + c.proprietaire.emails.length) > 0;
  const locataires = c.locataires.filter((l) => l.telephones.length + l.emails.length > 0);
  if (!proprio && locataires.length === 0) return null;
  return (
    <div className="sor-encart-coords" data-coordonnees>
      <p className="sor-encart-sous">Coordonnées</p>
      <ul>
        {proprio && <li data-coord-proprietaire><strong>{e.proprietaire!.nom}</strong> (propriétaire) {liste(c.proprietaire!)}</li>}
        {locataires.map((l) => <li key={l.occupationId} data-coord-locataire={l.locataireId}><strong>{l.nom}</strong> (locataire) {liste(l)}</li>)}
      </ul>
    </div>
  );
}

function SortiesEnregistrees({ sorties, apres }: { sorties: SortieEnregistree[]; apres: () => void }) {
  return (
    <div className="sor-enregistrees" data-sorties-enregistrees>
      <h4>Sorties enregistrées</h4>
      <ul className="loc-liste">
        {sorties.map((s) => <LigneSortie key={`${s.lotId}-${s.sortie}-${s.occupationIds.join('-')}`} s={s} apres={apres} />)}
      </ul>
    </div>
  );
}

function LigneSortie({ s, apres }: { s: SortieEnregistree; apres: () => void }) {
  const [mode, setMode] = useState<'lecture' | 'corriger' | 'annuler'>('lecture');
  const [date, setDate] = useState(s.sortie);
  const [motif, setMotif] = useState<string | null>(null);
  const agir = async (corps: Record<string, unknown>): Promise<void> => {
    const r = await envoyer(corps);
    if (r.motif !== null) { setMotif(r.motif); return; }
    setMode('lecture'); setMotif(null); apres();
  };
  return (
    <li style={{ display: 'block' }} data-sortie={s.sortie}>
      <p style={{ margin: 0 }}><strong>{s.noms.join(', ')}</strong> — {s.adresse ?? `Bien ${s.lotId}`} — sortie le {dateFr(s.sortie)}</p>
      {mode === 'lecture' && (
        <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('corriger')} data-corriger>Corriger la date</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('annuler')} data-annuler>Annuler la sortie</button>
        </div>
      )}
      {mode === 'corriger' && (
        <form onSubmit={(e) => { e.preventDefault(); void agir({ action: 'corriger-sortie-locataires', occupationIds: s.occupationIds, date }); }}>
          <label className="loc-champ">Nouvelle date de sortie
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('lecture')}>Revenir</button>
            <button type="submit" className="svv-btn svv-btn-primary gst-btn">Enregistrer la nouvelle date</button>
          </div>
        </form>
      )}
      {mode === 'annuler' && (
        <div>
          <p>Annuler cette sortie ? {s.noms.join(', ')} redevien{s.noms.length > 1 ? 'nent' : 't'} occupant{s.noms.length > 1 ? 's' : ''} du logement. Le journal garde la trace de la sortie annulée.</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('lecture')}>Revenir</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void agir({ action: 'annuler-sortie-locataires', occupationIds: s.occupationIds }); }}>Confirmer l’annulation</button>
          </div>
        </div>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </li>
  );
}

/** Jetons du thème uniquement. Vert « occupant » = celui des pastilles locataire de l'accueil (`loc-res-type--locataires`). */
export const CSS_SORTIE = `
.sor-vider{flex:0 0 auto;min-width:44px;min-height:44px;border:0;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:1.3rem;cursor:pointer}
.sor-res{list-style:none;margin:0;padding:0;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.sor-res li + li .sor-ligne{border-top:1px solid var(--color-svv-line)}
.sor-ligne{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;gap:4px 10px;align-items:center;padding:10px 12px;min-height:44px;box-sizing:border-box;text-decoration:none;color:var(--color-svv-ink)}
.sor-ligne:focus-visible{outline:2px solid var(--color-svv-line-strong-hover);outline-offset:-2px;border-radius:10px}
.sor-occupant{grid-row:1;grid-column:1;justify-self:start;border-radius:999px;padding:3px 10px;font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.02em;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border:1px solid var(--color-svv-green)}
.sor-nom{grid-row:1;grid-column:2;font-weight:800;color:var(--color-svv-green-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sor-infos{grid-row:2;grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:2px 14px;color:var(--color-svv-muted);font-size:.9rem}
.sor-bloc{margin:0 0 14px}
.sor-bloc h3{margin:0 0 8px}
.sor-form{display:grid;gap:10px}
.sor-cases{border:1px solid var(--color-svv-line);border-radius:12px;padding:8px 12px;margin:0}
.sor-cases legend{font-weight:700;padding:0 4px}
.sor-case{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}
.sor-case input{width:22px;height:22px;flex:0 0 auto}
.sor-date input{min-height:44px}
.sor-issue{margin:0;padding:10px 12px;border-radius:10px;font-weight:800;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border:1px solid var(--color-svv-green)}
.sor-issue--vacant{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);border-color:var(--color-svv-red)}
.sor-recap{display:grid;gap:8px}
.sor-dl{display:grid;grid-template-columns:minmax(0,10rem) minmax(0,1fr);gap:6px 12px;margin:0}
.sor-dl dt{color:var(--color-svv-muted)}
.sor-dl dd{margin:0}
.sor-fait{border:1px solid var(--color-svv-line-strong);border-radius:12px;padding:10px 12px;margin:0 0 10px;background:var(--color-svv-field)}
.sor-fait p{margin:0 0 4px}
.sor-choix{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sor-enregistrees{margin-top:14px}
.sor-encart{display:flex;flex-direction:column;gap:10px;min-width:0;overflow-wrap:anywhere}
/* Arno (19/10/2026) — l'encart sur la trame GRISE des cartes de l'application (celle des grosses cases de l'accueil), en deux parties. */
.sor-cadre{background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:16px;padding:16px;gap:0;min-width:0}
.sor-partie{display:flex;flex-direction:column;gap:10px;min-width:0}
.sor-partie + .sor-partie{margin-top:16px;padding-top:16px;border-top:2px solid var(--color-svv-line-strong)}
.sor-coords-carte{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0;min-width:0}
.sor-coords-carte a{display:inline-flex;align-items:center;min-height:44px;color:var(--color-svv-ink);text-decoration:underline;overflow-wrap:anywhere}
.sor-encart-titre{margin:0;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.sor-encart-dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:8px 18px;margin:0}
.sor-encart-dl > div{display:flex;flex-direction:column;gap:1px;min-width:0}
.sor-encart-dl dt{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.sor-encart-dl dd{margin:0;color:var(--color-svv-ink)}
.sor-encart-dl a{color:var(--color-svv-ink);font-weight:700;text-decoration:underline;display:inline-flex;align-items:center;min-height:44px}
.sor-encart-sous{margin:0 0 4px;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.sor-encart-lots ul{margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:2px}
.sor-encart-coords ul{margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:4px}
.sor-encart-coords li{overflow-wrap:anywhere}
.sor-encart-coords a{display:inline-flex;align-items:center;min-height:44px;margin-left:10px;color:var(--color-svv-ink);text-decoration:underline}
.sor-historique{margin-top:6px;min-width:0}
.sor-confirmer{display:flex;flex-direction:column;gap:12px}
/* Arno (19/10/2026) — LE BLOC « FAIRE SORTIR » COMPACT (écran de sortie) : deux lignes, fond gris du bloc conservé. */
.sor-compact{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
.sor-compact-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0}
.sor-compact-libelle{font-weight:700;color:var(--color-svv-ink)}
.sor-compact-date{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}
.sor-compact-date input{min-height:44px;box-sizing:border-box;max-width:100%}
.sor-compact-boutons{display:inline-flex;flex-wrap:wrap;gap:8px;margin-left:auto}
.sor-compact-erreur{margin:0}
.sor-etiquette{display:inline-flex;align-items:center;min-height:32px;padding:2px 10px;border-radius:999px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);color:var(--color-svv-ink);overflow-wrap:anywhere}
.sor-etiquette--exclue{color:var(--color-svv-muted);border-style:dashed}
.sor-pastille{display:inline-flex;align-items:center;min-height:32px;padding:2px 10px;border-radius:999px;font-weight:700;overflow-wrap:anywhere}
.sor-pastille--vacant{background:var(--color-svv-red);color:var(--color-svv-surface)}
.sor-pastille--reste{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border:1px solid var(--color-svv-green)}
/* Arno (19/10/2026) — un bouton de confirmation DÉSACTIVÉ reste LISIBLE : fond gris, texte gris foncé, curseur interdit. */
.sor-compact .sor-confirmer-btn:disabled,.pvs-compact .sor-confirmer-btn:disabled{background:var(--color-svv-field);border-color:var(--color-svv-line-strong);color:var(--color-svv-muted);opacity:1;cursor:not-allowed}
@media (max-width:760px){ .sor-compact-ligne{flex-direction:column;align-items:stretch} .sor-compact-date{flex-direction:column;align-items:stretch} .sor-compact-boutons{margin-left:0} }
.sor-confirmer-titre{margin:0;font-size:1.1rem}
.sor-confirmer-sous{margin:0 0 4px;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.sor-qui{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.sor-qui li{min-width:0;overflow-wrap:anywhere}
.sor-date-forte{display:flex;flex-direction:column;gap:4px;max-width:100%}
.sor-date-libelle{font-weight:800;color:var(--color-svv-ink)}
.sor-date-forte input{box-sizing:border-box;width:100%;max-width:22rem;min-height:52px;padding:10px 14px;border:2px solid var(--color-svv-ink);border-radius:12px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.15rem;font-weight:700}
.sor-date-forte input:focus-visible{outline:3px solid var(--color-svv-line-strong-hover);outline-offset:2px}
.sor-date-forte input[aria-invalid="true"]{border-color:var(--color-svv-red)}
.sor-restants{padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-green);background:color-mix(in srgb, var(--color-svv-green) 12%, transparent);color:var(--color-svv-green-ink)}
.sor-restants p{margin:0 0 4px}
.sor-restants ul{margin:0;padding-left:1.1rem}
.sor-deux-boutons{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px}
.sor-gestion-seule{margin:0;cursor:default;background:var(--color-svv-field);color:var(--color-svv-ink);border-color:var(--color-svv-line-strong);font-size:1rem}
.sor-carte-preavis{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;background:var(--color-svv-blue-soft)}
/* Arno (05/11/2026) — le locataire RECHERCHÉ mis en avant (bord épais + mot), la question au-dessus des autres occupants. */
.sor-carte--recherche{border-width:2px;border-color:var(--color-svv-ink)}
.sor-recherche-mot{align-self:flex-start;border-radius:999px;padding:2px 10px;font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.02em;background:var(--color-svv-ink);color:var(--color-svv-surface)}
.sor-question{margin:14px 0 8px;font-weight:800;color:var(--color-svv-ink)}
.sor-mails{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}
/* Arno (19/10/2026) — LE STATUT « EN PRÉAVIS » EN BLEU TRANSPARENT (paire bleue du thème, Clair ET Sombre), toujours avec le mot. */
.sor-occupant--preavis{background:var(--color-svv-blue-soft);color:var(--color-svv-blue);border-color:var(--color-svv-blue)}
.sor-surligne--preavis{background:var(--color-svv-blue-soft);color:var(--color-svv-blue)}
/* Arno (19/10/2026) — LES DEUX BOUTONS : BLANCS (bordure et texte foncés) à l'ouverture, ROUGES (texte blanc) une fois choisis. */
.sor-bascule{background:var(--color-svv-surface);border-color:var(--color-svv-ink);color:var(--color-svv-ink)}
.sor-bascule[aria-pressed="true"]{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface)}
.sor-preavis{grid-row:3;grid-column:1 / -1}
.sor-voir{align-self:flex-start;display:inline-flex;align-items:center;font-size:.9rem;color:var(--color-svv-muted)}
.sor-enregistrees h4{margin:0 0 6px}
@media (max-width:760px){
  .sor-dl{grid-template-columns:1fr}
  .sor-dl dd{margin-bottom:6px}
  .sor-infos{display:block}
  .sor-infos > span{display:block}
}
`;
