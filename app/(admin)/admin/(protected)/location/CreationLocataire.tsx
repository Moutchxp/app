'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, envoyer, liste, useLecture } from './commun';
import { etageFr } from '../../../../lib/location/sortieLocataires';
import { CSS_CARTES } from '../gestion/CartesPersonnes';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import { nomDeCarte, SaisieCartes, type EtatCartes } from './SaisieCartes';
import { BlocConditionsEntree, CSS_CONDITIONS } from './ConditionsEntree';
import { BlocEntretien, CSS_ENTRETIEN, ENTRETIEN_VIDE, versEnvoiEntretien, versSaisieEntretien, type SaisieEntretien } from './EntretienBien';
import { CONDITIONS_VIDES, manquesConditions, montantSaisi, versEnvoiConditions, type SaisieConditions } from '../../../../lib/location/conditionsEntree';
import { familleDeCategorie, manquesEntretien } from '../../../../lib/location/bienComplet';
import type { FicheBienLocation } from '../../../../lib/location/locationRepo';
import { estGarant, QUALITE_GARANT } from '../../../../lib/location/cartesLocation';
import type { CalculHonoraires } from '../../../../lib/location/honorairesProprietaire';
import { EnvoiAdhocMonga } from './EnvoiAdhocMonga';

/** Une ligne de lot, telle que la route `lotsBail` la rend (le module `regroupement`). */
interface LotLu { id: number; role: 'logement' | 'annexe'; libelle: string; type: string | null; etage: string | null; numeroLot: string | null;
  porte: string | null; place: boolean; occupants: number[]; noms: string[] }

/**
 * Arno (19/10/2026) — « LOTS LOUÉS » : une ligne par lot du bien choisi (le logement et chaque annexe), avec type, étage,
 * n° de lot, n° de porte ou de place et son état écrit en toutes lettres. Tous les lots LIBRES sont cochés d'office ; un
 * lot loué à quelqu'un d'autre est affiché, non cochable, « loué à X ». Au moins un lot doit être coché.
 */
export function LotsLoues({ lotId, coches, onCoches }: { lotId: number; coches: number[] | null; onCoches: (c: number[]) => void }) {
  const lu = useLecture<{ lots: LotLu[]; sorte: string; origineLibelle: string }>(`lotsBail=${lotId}`);
  const lots = useMemo(() => (lu.etat.etat === 'ok' && Array.isArray(lu.etat.data.lots) ? lu.etat.data.lots : []), [lu.etat]);
  // Tous les lots libres cochés par défaut, à la première lecture.
  useEffect(() => { if (coches === null && lots.length > 0) onCoches(lots.filter((l) => l.occupants.length === 0).map((l) => l.id)); }, [coches, lots, onCoches]);
  if (lu.etat.etat !== 'ok') return <EtatLecture etat={lu.etat} />;
  const cases = coches ?? [];
  return (
    <fieldset className="loc-lots-loues" data-lots-loues>
      <legend>Lots loués</legend>
      <ul>
        {lots.map((l) => {
          const libre = l.occupants.length === 0;
          const details = [l.type, etageFr(l.etage), l.numeroLot ? `lot n° ${l.numeroLot}` : null, l.porte ? `${l.place ? 'place' : 'porte'} n° ${l.porte}` : null]
            .filter((x) => x !== null && x !== '').join(' · ');
          return (
            <li key={l.id} data-lot={l.id} data-role={l.role}>
              <label className={`loc-lot${libre ? '' : ' loc-lot--pris'}`}>
                <input type="checkbox" checked={libre && cases.includes(l.id)} disabled={!libre}
                  onChange={() => onCoches(cases.includes(l.id) ? cases.filter((x) => x !== l.id) : [...cases, l.id])} data-coche-lot={l.id} />
                <span className="loc-lot-textes">
                  <strong>{l.libelle.charAt(0).toUpperCase() + l.libelle.slice(1)}</strong>
                  {details !== '' && <span className="loc-muet">{details}</span>}
                  <span className={libre ? 'loc-lot-etat' : 'loc-lot-etat loc-lot-etat--pris'} data-etat-lot>{libre ? 'libre' : `loué à ${l.noms.join(', ')}`}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {cases.length === 0 && lots.length > 0 && <p className="cp-refus" role="status" data-aucun-lot>Cochez au moins un lot loué.</p>}
    </fieldset>
  );
}

/**
 * ══ 🔴🔴 TUILE LOCATION — « NOUVEAU LOCATAIRE » (/admin/location/nouveau-locataire), refonte du 17/10/2026 ═══════════
 * « Création d'un locataire rattaché à un bien (dédoublonnage dès la saisie comme pour le propriétaire). » Un téléphone ou
 * un e-mail déjà connu est SIGNALÉ ; « Utiliser cette fiche » rattache le locataire existant au bien — jamais de fusion.
 * Le bien se choisit parmi ceux du PORTEFEUILLE (en gestion, non sortis).
 *
 * ══ CLIENTS ET CONTACTS (Arno, 17/10/2026) ═════════════════════════════════════════════════════════════════════════════
 * Même principe que le propriétaire : « + Ajouter… » → « Locataire (client) » (un ou plusieurs : colocation, couple) ou
 * « Contact du locataire » (garant, conjoint, employeur…). Au moins UN locataire ; les contacts sont rangés sur le bien,
 * côté locataire, comme « Contact du locataire » de la Gestion. Obligatoires allégés pour un locataire : le nom, un
 * téléphone ou un e-mail.
 *
 * ⚠️ PAS DE <form> AUTOUR DES CARTES (correctif du 19/10/2026). Chaque carte (`FormulaireCarte`) est elle-même un <form> ;
 * un <form> dans un <form> est du HTML invalide : le navigateur jette le formulaire intérieur à la lecture de la page
 * serveur, et React tombe en erreur d'hydratation. Le formulaire de la PAGE reste, mais VIDE, et se relie par l'attribut
 * HTML `form` au bouton « Enregistrer » et aux champs de la page : la touche Entrée et le bouton font exactement ce
 * qu'ils faisaient.
 *
 * ══ BLOC 3 « CONDITIONS D'ENTRÉE » (Arno, 20/10/2026) ═══════════════════════════════════════════════════════════════════
 * La fiche papier « Nouveau dossier » : dépôt de garantie, prélèvement, garanties, entretien à prévoir, honoraires, sommes
 * dues, mode de règlement, commentaires (`ConditionsEntree.tsx`). Les choix sont OBLIGATOIRES (« Reste à renseigner »,
 * « Enregistrer » bloqué) ; montants et commentaire non. Enregistrées sur le BAIL créé (migration 391). L'ENTRETIEN À
 * PRÉVOIR est la donnée DU BIEN (même composant, même donnée que « Nouveau bien ») : pré-rempli depuis le bien, posé sur
 * lui ; un parking ou une cave n'en a pas. Sans la migration 391, le bloc le dit et le locataire se crée comme avant.
 */
export function CreationLocataire() {
  const [etat, setEtat] = useState<EtatCartes>({ clients: [], contacts: [], existants: [], ouvertes: 1 });
  const [filtreBien, setFiltreBien] = useState('');
  const [terme, setTerme] = useState('');
  const [bien, setBien] = useState<{ id: number; titre: string } | null>(null);
  const [entree, setEntree] = useState('');
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Arno (19/10/2026) — les LOTS LOUÉS cochés, le récapitulatif avant validation, et l'annonce d'une réintégration.
  const [coches, setCoches] = useState<number[] | null>(null);
  const [recap, setRecap] = useState<string[] | null>(null);
  const [fait, setFait] = useState<{ messages: string[]; lien: string; bailId?: number | null; ouvrirEnvoi?: boolean } | null>(null);
  /* Arno (21/10/2026) — « Enregistrer et envoyer à ADHOC & MONGA » : le MÊME enregistrement que « Enregistrer » (récapitulatif
     puis confirmation compris), puis la fenêtre d'envoi s'ouvre pour le bail créé. Le dernier bouton cliqué décide. */
  const envoyerApres = useRef(false);
  const [intentionEnvoi, setIntentionEnvoi] = useState(false);
  const idForm = useId();
  // Bloc 3 — les conditions d'entrée et l'entretien du bien ; `tente` : les messages sous chaque champ après un essai.
  const [conditions, setConditions] = useState<SaisieConditions>(CONDITIONS_VIDES);
  const [entretien, setEntretien] = useState<SaisieEntretien>(ENTRETIEN_VIDE);
  const [entretienDuBien, setEntretienDuBien] = useState<number | null>(null);
  const [tente, setTente] = useState(false);
  // Arno (20/10/2026) — partie par partie, ce que la base sait enregistrer : le bloc est TOUJOURS montré ; ce qui manque est dit
  // par un bandeau (« migration NNN ») et seule l'écriture de la partie concernée est désactivée.
  const lu = useLecture<{ conditions: boolean; loyer: boolean; rattachements?: boolean; manquantes: string[] }>('schemaConditionsEntree');
  const schema = lu.etat.etat === 'ok' && lu.etat.data !== null && typeof lu.etat.data === 'object' && !Array.isArray(lu.etat.data) ? lu.etat.data : null;
  const avecConditions = schema?.conditions === true;
  const avecLoyer = schema?.loyer === true;
  const ficheBien = useLecture<FicheBienLocation>(bien !== null ? `lot=${bien.id}` : null);
  const lueBien = ficheBien.etat.etat === 'ok' && bien !== null && ficheBien.etat.data.bien?.id === bien.id ? ficheBien.etat.data : null;
  const famille = lueBien === null ? null : familleDeCategorie(lueBien.bien.categorie);
  // L'entretien n'existe que pour un logement / local, et avec la migration 379 (sinon `entretiens` est absent).
  const avecEntretien = lueBien !== null && (famille === 'logement' || famille === 'local') && Array.isArray(lueBien.complements?.entretiens);
  // Pré-rempli UNE fois par bien choisi, avec ce que le bien sait déjà (la même donnée que sa fiche).
  useEffect(() => {
    if (lueBien === null || entretienDuBien === lueBien.bien.id) return;
    setEntretienDuBien(lueBien.bien.id);
    setEntretien(versSaisieEntretien(lueBien.complements?.entretienAPrevoir ?? null, lueBien.complements?.entretiens));
  }, [lueBien, entretienDuBien]);
  const envoiEntretien = versEnvoiEntretien(entretien);
  // Ce qui manque, seulement pour ce qui s'ENREGISTRE : les choix (391/392), le loyer (370 : son format), l'entretien du bien (379).
  const manquesBloc = manquesConditions(versEnvoiConditions(conditions));
  const manque: Record<string, string> = {
    ...Object.fromEntries(Object.entries(manquesBloc).filter(([k]) => (k.startsWith('loyer-') ? avecLoyer : avecConditions))),
    ...(avecEntretien ? manquesEntretien({ entretienAPrevoir: envoiEntretien.entretienAPrevoir, entretiens: envoiEntretien.entretiens }) : {}),
  };
  // Le LOYER DE DÉPART déjà connu pour le bien (migration 370) : pré-remplit le « Loyer mensuel », une fois par bien, s'il est vide.
  const loyerConnu = useLecture<{ principal: number | null; provisions: number | null; entree: string | null } | null>(avecLoyer && bien !== null ? `loyerDuBien=${bien.id}` : null);
  const [loyerDuBien, setLoyerDuBien] = useState<{ id: number; note: string | null } | null>(null);
  useEffect(() => {
    if (bien === null || loyerConnu.etat.etat !== 'ok' || loyerDuBien?.id === bien.id) return;
    const l = loyerConnu.etat.data;
    const connu = l !== null && typeof l === 'object' && !Array.isArray(l) && (l.principal !== null || l.provisions !== null) ? l : null;
    setLoyerDuBien({ id: bien.id, note: connu === null ? null
      : `Pré-rempli avec le loyer de départ de la location précédente${connu.entree ? ` (entrée le ${connu.entree.split('-').reverse().join('/')})` : ''} — modifiable.` });
    if (connu !== null) {
      setConditions((c) => (c.loyer.principal.trim() !== '' || c.loyer.provisions.trim() !== '' ? c
        : { ...c, loyer: { principal: montantSaisi(connu.principal), provisions: montantSaisi(connu.provisions) } }));
    }
  }, [bien, loyerConnu.etat, loyerDuBien]);
  const manqueDe = (k: string): React.ReactNode => (tente && manque[k] !== undefined ? <p className="loc-manque" role="alert">{manque[k]}</p> : null);
  // Arno (20/10/2026) — LES GARANTS : les contacts « Garant » validés au bloc 1. S'il y en a, « Garant personne physique » passe
  // d'office à Oui (à chaque NOUVEAU garant ; on peut toujours répondre Non) ; « Ajouter un garant » ouvre une carte contact.
  const garants = etat.contacts.filter((c) => estGarant(c.qualite)).map((c) => [(c.nom ?? '').toUpperCase(), c.prenom].filter((x) => x).join(' '));
  const nbGarants = useRef(0);
  useEffect(() => {
    if (garants.length > nbGarants.current) setConditions((c) => (c.garant === true ? c : { ...c, garant: true }));
    nbGarants.current = garants.length;
  }, [garants.length]);
  const [demandeGarant, setDemandeGarant] = useState({ n: 0, qualite: QUALITE_GARANT });
  // Arno (20/10/2026) — LES HONORAIRES PROPRIÉTAIRE du bien loué, à la date d'entrée : calculés par le serveur (barème daté,
  // zone, surface Carrez/Boutin de la fiche du bien), relus quand le bien ou la date change.
  const hono = useLecture<CalculHonoraires>(bien !== null
    ? `honorairesProprietaire=${bien.id}${/^\d{4}-\d{2}-\d{2}$/.test(entree) ? `&entree=${entree}` : ''}` : null);
  const surCartes = useCallback((e: EtatCartes) => { setEtat(e); setMotif(null); }, []);
  /* Arno (20/10/2026, 393) — GARANTS ET CONTACTS RATTACHÉS. Les locataires de l'écran (cartes validées puis fiches retenues, l'ordre
     du serveur) ; chaque contact validé dit à qui il se rattache : un garant « Garantit : » (tous cochés par défaut), un autre
     contact « Contact de : » (le premier par défaut). Un seul locataire : d'office, rien à choisir. */
  const avecRattachements = schema?.rattachements === true;
  const locatairesEcran = [
    ...etat.clients.map((c, i) => ({ cle: `c${etat.clesClients?.[i] ?? i}`, nom: nomDeCarte(c) })),
    ...etat.existants.map((x) => ({ cle: `e${x.id}`, nom: x.nom })),
  ];
  const [liens, setLiens] = useState<Record<number, { garantit?: string[]; locataire?: string }>>({});
  const garantitDe = (cle: number): string[] => (liens[cle]?.garantit ?? locatairesEcran.map((l) => l.cle)).filter((k) => locatairesEcran.some((l) => l.cle === k));
  const contactDe = (cle: number): string | null => {
    const k = liens[cle]?.locataire;
    return k !== undefined && locatairesEcran.some((l) => l.cle === k) ? k : (locatairesEcran[0]?.cle ?? null);
  };
  const sousContact = (cle: number, champs: { qualite?: string | null }): React.ReactNode => {
    if (!avecRattachements || locatairesEcran.length === 0) return null;
    if (locatairesEcran.length === 1) {
      return <span className="loc-muet" data-rattachement="auto">{estGarant(champs.qualite) ? 'Garantit' : 'Contact de'} : {locatairesEcran[0].nom}</span>;
    }
    if (estGarant(champs.qualite)) {
      const coches = garantitDe(cle);
      return (
        <fieldset className="loc-garantit" data-garantit={cle}>
          <legend>Garantit :</legend>
          {locatairesEcran.map((l) => (
            <label key={l.cle} className="loc-garantit-choix">
              <input type="checkbox" checked={coches.includes(l.cle)} data-garantit-locataire={l.cle}
                onChange={() => setLiens((x) => ({ ...x, [cle]: { ...x[cle], garantit: coches.includes(l.cle) ? coches.filter((k) => k !== l.cle) : [...coches, l.cle] } }))} />
              <span>{l.nom}</span>
            </label>
          ))}
          {coches.length === 0 && <span className="loc-manque" role="alert">Cochez au moins un locataire garanti.</span>}
        </fieldset>
      );
    }
    return (
      <label className="loc-champ loc-contact-de" data-contact-de={cle}>Contact de :
        <select value={contactDe(cle) ?? ''} onChange={(e) => setLiens((x) => ({ ...x, [cle]: { ...x[cle], locataire: e.target.value } }))}>
          {locatairesEcran.map((l) => <option key={l.cle} value={l.cle}>{l.nom}</option>)}
        </select>
      </label>
    );
  };
  const rattachementsAEnvoyer = (): { garantit?: number[]; locataire?: number | null }[] => etat.contacts.map((c, i) => {
    const cle = etat.clesContacts?.[i] ?? -1;
    const rang = (k: string | null): number => locatairesEcran.findIndex((l) => l.cle === k);
    if (estGarant(c.qualite)) return { garantit: garantitDe(cle).map(rang).filter((x) => x >= 0) };
    const r = rang(contactDe(cle));
    return { locataire: r >= 0 ? r : null };
  });
  const garantSansLocataire = avecRattachements && locatairesEcran.length > 1
    && etat.contacts.some((c, i) => estGarant(c.qualite) && garantitDe(etat.clesContacts?.[i] ?? -1).length === 0);
  // Arno (20/10/2026, faille 7) : sans date d'entrée, le barème du JOUR sert au calcul des honoraires — dit, jamais bloquant.
  const AVERTISSEMENT_DATE = 'Sans date d’entrée, le barème du jour a été utilisé.';

  useEffect(() => { const t = setTimeout(() => setTerme(filtreBien.trim()), 250); return () => clearTimeout(t); }, [filtreBien]);
  const biens = useLecture<{ id: number; titre: string; detail: string | null; loue?: boolean }[]>(`biensPourLocataire=${encodeURIComponent(terme)}`);

  const nbLocataires = etat.clients.length + etat.existants.length;
  const dateEntreeSaisie = /^\d{4}-\d{2}-\d{2}$/.test(entree);
  const enregistrer = async (): Promise<void> => {
    if (nbLocataires === 0) {
      setMotif(etat.contacts.length > 0 ? 'Un contact n’est pas un client : ajoutez au moins une carte « Locataire (client) ».'
        : 'Remplissez et enregistrez au moins une carte « Locataire (client) » (ou utilisez une fiche déjà connue).');
      return;
    }
    if (etat.ouvertes > 0) { setMotif('Une carte est encore ouverte : enregistrez-la (ou annulez-la) avant de continuer.'); return; }
    if (bien === null) { setMotif('Choisissez le bien loué.'); return; }
    if (!dateEntreeSaisie) { setMotif('Indiquez la date d’entrée dans les lieux.'); return; }
    if (coches !== null && coches.length === 0) { setMotif('Cochez au moins un lot loué.'); return; }
    if (garantSansLocataire) { setMotif('Un garant doit garantir au moins un locataire : cochez-le sous « Garantit : ».'); return; }
    // Bloc 3 : tant qu'un choix manque, rien n'est envoyé ; le message est sous le champ et la page y descend.
    if (Object.keys(manque).length > 0) {
      setTente(true); setMotif(null);
      setTimeout(() => {
        const premier = document.querySelector('[data-conditions-entree] .loc-manque');
        const bloc = premier?.closest('.loc-cond-bloc') ?? premier;
        const reduit = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (bloc instanceof HTMLElement && typeof bloc.scrollIntoView === 'function') bloc.scrollIntoView({ block: 'center', behavior: reduit ? 'auto' : 'smooth' });
      }, 0);
      return;
    }
    // ① LE RÉCAPITULATIF d'abord : ce que le bail va faire des lots (rien n'est écrit).
    if (recap === null) {
      setEnvoi(true);
      const a = await envoyer({ action: 'apercu-lots', lotId: bien.id, lotIds: coches ?? [bien.id] });
      setEnvoi(false);
      if (a.motif !== null) { setMotif(a.motif); return; }
      setRecap((a.data as { recap?: string[] } | undefined)?.recap ?? []);
      return;
    }
    // ② LA CONFIRMATION : l'entrée des locataires, les fiches autonomes, la réintégration — une seule transaction.
    setEnvoi(true);
    const r = await envoyer({
      action: 'creer-locataires', cartes: etat.clients, existants: etat.existants.map((x) => x.id), contacts: etat.contacts,
      lotId: bien.id, entree: entree === '' ? null : entree, lotIds: coches ?? [bien.id],
      ...(avecConditions ? { conditions: versEnvoiConditions(conditions) } : {}),
      ...(avecLoyer ? { loyer: { ...conditions.loyer } } : {}),
      ...(avecEntretien ? { entretien: { aPrevoir: envoiEntretien.entretienAPrevoir, entretiens: envoiEntretien.entretiens } } : {}),
      ...(avecRattachements && etat.contacts.length > 0 ? { rattachements: rattachementsAEnvoyer() } : {}),
    });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); setRecap(null); return; }
    const d = r.data as { locataireIds?: number[]; reintegrations?: string[]; entretienRefus?: string | null; contactsRefus?: string | null;
      dateBaremeSupposee?: boolean; drive?: { ok: boolean; motif?: string }; bailId?: number | null } | undefined;
    const ids = d?.locataireIds ?? [];
    const lien = ids[0] !== undefined ? `/admin/location/locataire/${ids[0]}` : '/admin/location/locataires';
    // Une réintégration s'ANNONCE à l'écran avant de quitter la page.
    const annonces = [...(d?.reintegrations ?? []), ...(d?.entretienRefus ? [d.entretienRefus] : []), ...(d?.contactsRefus ? [d.contactsRefus] : []),
      ...(d?.dateBaremeSupposee === true ? [AVERTISSEMENT_DATE] : []),
      // Arno (20/10/2026, 394) : le Drive a échoué — le locataire est enregistré, son dossier reste à créer (bouton sur sa fiche).
      ...(d?.drive?.ok === false ? [`Le locataire est enregistré, mais le dossier Drive du bail n’a pas été créé : ${d.drive.motif ?? 'erreur'} « Créer le dossier » sur sa fiche le relance.`] : [])];
    /* Arno (21/10/2026) — après « Enregistrer » (bail créé, bien rattaché), l'écran RESTE et affiche le gros bouton « Envoi ADHOC
       & MONGA » ; le lien vers la fiche du locataire est dessous. Sans bail (base d'avant la 393), le départ vers la fiche est
       celui de toujours. */
    const bailId = typeof d?.bailId === 'number' ? d.bailId : null;
    // « Enregistrer et envoyer » : la fenêtre ne s'ouvre qu'ICI, après un enregistrement réussi et pour un bail créé.
    if (annonces.length > 0 || bailId !== null) { setFait({ messages: annonces, lien, bailId, ouvrirEnvoi: envoyerApres.current && bailId !== null }); return; }
    window.location.href = lien;
  };

  return (
    <div className="loc-page loc-ample">
      <form id={idForm} hidden onSubmit={(e) => { e.preventDefault(); envoyerApres.current = false; setIntentionEnvoi(false); void enregistrer(); }} data-formulaire-page />
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CHAMP_ADRESSE + CSS_LOTS_LOUES + CSS_CONDITIONS + CSS_ENTRETIEN}</style>
      <EnTeteLocation titre="Nouveau locataire" sous="Au moins un locataire (client) et le bien loué. Les contacts du locataire sont facultatifs." />

      <section className="loc-section" aria-labelledby="loc-l1">
        <h3 id="loc-l1"><span className="loc-num">1</span>Le ou les locataires</h3>
        <p className="loc-section-phrase">« + Ajouter… » : un <strong>locataire (client)</strong> ou un <strong>contact du locataire</strong> (conjoint,
          artisan, avocat, voisin…). « Enregistrer » valide la carte ; tout est enregistré en bas de page. Rien n’est jamais fusionné.</p>
        {schema !== null && !avecRattachements && etat.contacts.length > 0 && (
          <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} role="status" data-rattachements-sans-migration>
            Mise à jour de la base à appliquer (migration 393) : les contacts seront enregistrés sur le bien comme d’habitude, sans être
            rattachés à un locataire.</p>
        )}
        <SaisieCartes cote="locataire" onChange={surCartes} demandeContact={demandeGarant} confirmerRetrait sousContact={sousContact} />
      </section>

      <section className="loc-section" aria-labelledby="loc-l2">
        <h3 id="loc-l2"><span className="loc-num">2</span>Bien loué</h3>
        {bien !== null ? (
          <p>Bien : <a href={`/admin/location/bien/${bien.id}`}><strong>{bien.titre}</strong></a>{' '}
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setBien(null); setCoches(null); setRecap(null); }}>Changer de bien</button></p>
        ) : (
          <>
            {/* Arno (19/10/2026) — par l'adresse OU le nom du propriétaire (accents et casse ignorés), en temps réel. */}
            <label className="loc-champ">Chercher le bien par son adresse ou le nom du propriétaire (biens du portefeuille)
              <input form={idForm} value={filtreBien} onChange={(e) => setFiltreBien(e.target.value)} placeholder="ex. rue des Lilas ou Dupont" data-recherche-bien /></label>
            {biens.etat.etat === 'ok' && (
              liste(biens.etat.data).length === 0 ? <p className="loc-muet">Aucun bien du portefeuille ne correspond.</p> : (
                <ul className="loc-choix">
                  {liste(biens.etat.data).map((b) => (
                    <li key={b.id}><button type="button" aria-pressed={false} onClick={() => { setBien({ id: b.id, titre: b.titre }); setCoches(null); setRecap(null); }}>
                      <span>{b.titre}</span><span>{b.detail}</span>
                      {/* Arno (20/10/2026) : le MOT et la couleur (vert « Libre », rouge « déjà loué ») — jamais la couleur seule. */}
                      {b.loue !== undefined && <span className={`loc-etat-bien loc-etat-bien--${b.loue ? 'loue' : 'libre'}`} data-etat-bien={b.loue ? 'loue' : 'libre'}>{b.loue ? 'déjà loué' : 'Libre'}</span>}</button></li>
                  ))}
                </ul>
              ))}
          </>
        )}
        {bien !== null && <LotsLoues lotId={bien.id} coches={coches} onCoches={(c) => { setCoches(c); setRecap(null); setMotif(null); }} />}
        <div className="loc-grille">
          {/* Arno (20/10/2026) : la date d'entrée est OBLIGATOIRE — le dossier Drive du bail porte la date (« BAIL 01/09/2024 MARTIN »). */}
          <label className="loc-champ"><span>Date d’entrée <span className="loc-oblig">*</span></span><input form={idForm} type="date" value={entree} required
            onChange={(e) => { setEntree(e.target.value); setMotif(null); }} data-date-entree /></label>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-l3" data-bloc-conditions>
        <h3 id="loc-l3"><span className="loc-num">3</span>Conditions d’entrée</h3>
        {lu.etat.etat !== 'ok' ? <EtatLecture etat={lu.etat} /> : (
          <>
            {schema !== null && !avecConditions && (
              <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} role="status" data-conditions-sans-migration>
                Mise à jour de la base à appliquer (migration {schema.manquantes.filter((m) => m !== '370' && m !== '393').join(' et ')}) : les choix de ce bloc
                ne seront pas enregistrés (ni exigés). Le locataire et l’entretien du bien s’enregistrent comme d’habitude.</p>
            )}
            <p className="loc-section-phrase">La fiche « Nouveau dossier » : enregistrée sur le bail créé. Les choix marqués <span className="loc-oblig">*</span> sont obligatoires ; montants et commentaire facultatifs.</p>
            <BlocConditionsEntree valeur={conditions} onChange={(v) => { setConditions(v); setMotif(null); }} manque={manqueDe}
              garants={{ noms: garants, onAjouter: () => setDemandeGarant((d) => ({ ...d, n: d.n + 1 })) }}
              loyer={{ note: bien !== null && loyerDuBien?.id === bien.id ? loyerDuBien.note : null, indisponible: schema !== null && !avecLoyer }}
              dateEntree={entree}
              honoraires={{ calcul: bien === null ? null : hono.etat.etat === 'ok' ? hono.etat.data : null,
                charge: bien !== null && hono.etat.etat === 'charge', lienBien: bien === null ? null : `/admin/location/bien/${bien.id}` }}
              entretien={avecEntretien ? (
                <BlocEntretien valeur={entretien} onChange={setEntretien} obligatoire
                  manques={{ reponse: manqueDe('entretien'), liste: manqueDe('entretienListe'), autre: (k) => manqueDe(`entretien-autre-${k}`) }} />
              ) : undefined} />
            {avecEntretien && <p className="loc-muet" style={{ margin: 0 }} data-entretien-du-bien>« Entretien à prévoir » est celui du bien : le modifier ici le modifie sur sa fiche.</p>}
          </>
        )}
      </section>

      {recap !== null && (
        <section className="loc-section loc-recap-lots" aria-label="Ce qui va se passer" data-recap-lots>
          <h3>Avant d’enregistrer : ce qui va se passer</h3>
          <ul>{recap.map((x, i) => <li key={`${i}-${x}`}>{x}</li>)}</ul>
          {avecConditions && entree === '' && <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} role="status" data-avertissement-date>{AVERTISSEMENT_DATE}</p>}
          <p className="loc-muet" style={{ margin: 0 }}>« Confirmer » enregistre le bail ; « Modifier » revient au choix des lots. Rien n’est effacé.</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRecap(null)} data-modifier-lots>Modifier</button>
          </div>
        </section>
      )}
      {fait !== null && (
        <section className="loc-section" role="status" data-reintegration>
          {fait.messages.map((m, i) => <p key={`${i}-${m}`} className="gst-info" style={{ margin: 0 }}>{m}</p>)}
          {fait.bailId !== undefined && fait.bailId !== null && (
            <div className="loc-apres-enregistrer" data-apres-enregistrer>
              <p style={{ margin: 0 }}><strong>Le locataire et son bail sont enregistrés.</strong> Envoyez le dossier à ADHOC &amp; MONGA :</p>
              <EnvoiAdhocMonga bailId={fait.bailId} ouvrirAuMontage={fait.ouvrirEnvoi === true} />
            </div>
          )}
          <p style={{ margin: 0 }}><a href={fait.lien}>Ouvrir la fiche du locataire</a></p>
        </section>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
      <div className="loc-collant" data-collant>
        <p className="loc-manques" role="status">
          {nbLocataires === 0 ? 'Reste à renseigner : au moins un locataire (client).' : bien === null ? 'Reste à choisir : le bien loué.'
            : !dateEntreeSaisie ? 'Reste à renseigner : la date d’entrée dans les lieux.'
            : Object.keys(manque).length > 0 ? `Reste à renseigner : ${Object.values(manque).map((m) => m.replace(/[.?]$/, '')).join(' · ')}.`
            : `${nbLocataires} locataire${nbLocataires > 1 ? 's' : ''}${etat.contacts.length > 0 ? ` et ${etat.contacts.length} contact${etat.contacts.length > 1 ? 's' : ''}` : ''}, prêt${nbLocataires + etat.contacts.length > 1 ? 's' : ''} à enregistrer.`}
        </p>
        <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/locataires">Annuler</a>
        {/* Arno (21/10/2026) — à côté d'« Enregistrer », mêmes conditions d'activation : enregistre de la même façon, puis ouvre la
            fenêtre d'envoi du bail créé (jamais en cas d'échec ; rien ne part sans « Envoyer » dans la fenêtre). */}
        <button type="button" className="svv-btn svv-btn-outline gst-btn loc-enregistrer-envoyer" disabled={envoi || fait !== null || bien === null || !dateEntreeSaisie}
          onClick={() => { envoyerApres.current = true; setIntentionEnvoi(true); void enregistrer(); }} data-enregistrer-envoyer>
          {envoi && intentionEnvoi ? 'Enregistrement…' : recap === null ? 'Enregistrer et envoyer à ADHOC & MONGA' : 'Confirmer et envoyer à ADHOC & MONGA'}</button>
        {/* Arno (20/10/2026) : un locataire ne s'enregistre pas sans bien du portefeuille NI sans date d'entrée — « Enregistrer »
            reste inactif sans eux. */}
        <button type="submit" form={idForm} className="svv-btn svv-btn-primary gst-btn" disabled={envoi || fait !== null || bien === null || !dateEntreeSaisie} data-enregistrer-locataire>{envoi && !intentionEnvoi ? 'Enregistrement…' : recap === null ? 'Enregistrer' : 'Confirmer'}</button>
      </div>
    </div>
  );
}

/** Jetons du thème seulement ; cibles ≥ 44 px ; l'état toujours écrit. */
const CSS_LOTS_LOUES = `
.loc-lots-loues{border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px;margin:0;min-width:0}
.loc-lots-loues legend{font-weight:800;padding:0 4px}
.loc-lots-loues ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.loc-lot{display:flex;align-items:flex-start;gap:10px;min-height:44px;padding:6px 4px;cursor:pointer}
.loc-lot input{width:22px;height:22px;margin-top:2px;flex:0 0 auto}
.loc-lot--pris{cursor:not-allowed}
.loc-lot-textes{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.loc-lot-etat{font-weight:700;color:var(--color-svv-green-ink)}
.loc-lot-etat--pris{color:var(--color-svv-muted)}
.loc-etat-bien{font-weight:800}
.loc-etat-bien--libre{color:var(--color-svv-green-ink)}
.loc-etat-bien--loue{color:var(--color-svv-red)}
.loc-recap-lots ul{margin:0;padding-left:1.2rem;display:flex;flex-direction:column;gap:4px}
.loc-garantit{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;min-width:0}
.loc-garantit legend{font-weight:700;padding:0;float:left;margin-right:6px}
.loc-garantit-choix{display:inline-flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;overflow-wrap:anywhere}
.loc-garantit-choix input{width:22px;height:22px;flex:0 0 auto}
.loc-contact-de select{min-height:44px}
.loc-collant .loc-enregistrer-envoyer{width:auto;white-space:normal;text-align:center}
@media (max-width:760px){ .loc-collant .loc-enregistrer-envoyer{flex:1 1 100%;order:3} }
.loc-apres-enregistrer{display:flex;flex-direction:column;gap:10px;padding:14px;border:1.5px solid var(--color-svv-line-strong);border-radius:14px}
`;
