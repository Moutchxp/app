'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoutonAffichage, FournisseurAffichage, FournisseurChangerAffichage, FournisseurConsolide, FournisseurNoms, useAffichageRetenu } from '../transaction/commun';
import { AGENCES, caAgence, estAgence, LIBELLE_AGENCE, type Agence } from '../../../../lib/mon-espace/agence';
import { LIBELLE_TRI_LISTE, TRI_LISTE_DEFAUT, TRIS_LISTE, trierListe, type TriListe } from '../../../../lib/transaction/listeCartes';
import { personnesNegociateurs } from '../../../../lib/transaction/nomNegociateur';
import { negociateursDe } from '../../../../lib/transaction/modele';
import { CSS } from '../transaction/EcransTransaction';
import { CarteAffaire, DetailAffaire, useColonnesNegociateurs, type HoteDetail, type VuePersonnelle } from '../transaction/OngletCompromis';
import { resolveurDe } from '../../../../lib/transaction/statutLigne';
import { empreinteDe, type MesAffaires, type VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';
import { CSS_NOUVEAU_COMPROMIS, envoyerMonEspace, NouveauCompromis, URL_REFERENCES } from './NouveauCompromis';
import { HistoriqueAffaire } from './HistoriqueAffaire';
import { GestesAffaire } from './GestesAffaire';
import { AccueilMonEspace } from './AccueilMonEspace';
import { AnneesMonEspace } from './AnneesMonEspace';
import { CSS_LISTE_PERIODE, TableauParApporteur } from './ListeAffairesPeriode';
import { CartesCompromis, CSS_CARTES_COMPROMIS } from './CartesCompromis';
import { affairesCompromisAgence, affairesCompromisPerso, cartesCompromis, tableauApporteursCompromis } from '../../../../lib/mon-espace/compromisCartes';
import { CoutsMonEspace } from './CoutsMonEspace';
import { ongletCoutsVisible, URL_COUTS } from '../../../../lib/mon-espace/couts';
import { OngletsVues, useLigneDesAnnees, useLigneDesMois, vueInitiale } from '../transaction/EcransTransaction';
import { ecrireAdresse, parametre } from '../transaction/commun';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';
import { ecrireAnnees, listeDesAnnees } from '../../../../lib/transaction/periodeAnnees';
import { anneesDe } from '../../../../lib/transaction/modele';
import { MesApporteurs, posterApporteur, URL_APPORTEURS } from './MesApporteurs';
import { ContexteNouvelApporteur, type FaconNouvelApporteur } from '../transaction/NouvelApporteur';
import type { Doublon, SaisieApporteur } from '../../../../lib/mon-espace/apporteurs';

/** 🔴 LOT 9 — les doublons de TOUT l'annuaire pour une saisie (le serveur) ; trop peu de saisi pour comparer : aucun. */
async function chercherDoublons(s: SaisieApporteur): Promise<Doublon[]> {
  const assez = `${s.prenom}${s.nom}`.replace(/\s/g, '').length >= 3 || s.telephone.replace(/\D/g, '').length >= 9 || s.email.includes('@');
  if (!assez) return [];
  try {
    const q = new URLSearchParams({ nom: s.nom, prenom: s.prenom, telephone: s.telephone, email: s.email });
    const r = await fetch(`${URL_APPORTEURS}/doublons?${q.toString()}`, { cache: 'no-store' });
    const j = (await r.json()) as { etat?: string; data?: Doublon[] };
    return j.etat === 'ok' && Array.isArray(j.data) ? j.data : [];
  } catch { return []; }
}
import { DUREE_SURBRILLANCE_MS, doitRelire, messageMiseAJour, misesAJourDesAutres, peutBattre, PERIODE_MON_ESPACE_MS } from '../../../../lib/mon-espace/rafraichir';
import { FormulaireDossier, etatRepartitionDe, type References } from '../transaction/FormulaireDossier';

/**
 * 🔴 MON ESPACE (Arno, 02/11/2026) — l'accueil de l'espace.
 *   · LOT 3 : deux compteurs, « Mes compromis en cours » et « Mes ventes actées cette année » (nombre — mon CA, décision 1), bascule « HT | TTC »
 *     du Suivi CA (la même mémoire du navigateur) ; données de /api/admin/mon-espace/affaires, déjà filtrées par le serveur.
 *   · LOT 4 : les compteurs ouvrent leur onglet ; « Mes compromis en cours » et « Mes ventes » (toutes années, sélecteur d'année, total de
 *     l'année) avec EXACTEMENT la carte et la fiche dépliée de la tuile Suivi CA (`CarteAffaire`, `DetailAffaire`), en vue personnelle : sans la
 *     commission de l'autre collègue, sans aucun geste (ils arrivent aux lots 5 à 7). Les listes montrent les ventes que le serveur a comptées
 *     pour moi (les mêmes identifiants que les compteurs), rien d'autre.
 *   · LOT 5 : « + Nouveau compromis » (le parcours `NouveauCompromis`) ; enregistré, l'écran relit ses affaires et rouvre « Mes compromis en
 *     cours », la nouvelle affaire en haut, dépliée.
 *   · LOT 6 : sous la fiche dépliée, « Modifier » (ses négociateurs et les administrateurs : le formulaire de la tuile, les commissions non
 *     visibles pour un collaborateur, garde de version) et « Historique des modifications » (lecture seule).
 *   · LOT 7 : les gestes (« Acte signé », « Annuler le compromis », « Revenir en compromis », `GestesAffaire`, confirmés dans la page) ; le
 *     RAFRAÎCHISSEMENT AUTOMATIQUE (`rafraichir.ts`) : l'empreinte relue toutes les 15 s et au retour sur l'onglet, les listes relues seulement si
 *     elle a changé, jamais pendant une saisie ou une confirmation ; « Léa a mis à jour « X » » et la ligne éclairée quand c'est un autre.
 *   · LOT 10 : le MODE AGENCE (administrateurs seulement ; le serveur refuse les autres, 403) : « Mon espace / Agence : CRITERIMMO / MACJ / FUSION ».
 *     Les mêmes onglets, sur toute la structure : les données et les chiffres du Suivi CA (`agence.ts`), la carte complète (commissions des deux
 *     côtés), tri et filtre par négociateur sur les compromis ; les gestes et le rafraîchissement restent (empreinte de la structure).
 */
type Espace = 'moi' | Agence;
/** 🔴 Arno (05/11/2026) — le message d'un espace personnel sans aucune affaire rattachée au compte. */
export const MESSAGE_ESPACE_VIDE = 'Aucune vente ni compromis rattaché à votre compte pour l’instant.';

/** L'adresse de lecture (et d'empreinte) d'un espace : le mien, ou une structure (`?agence=`). PUR. */
export const avecEspace = (url: string, e: Espace): string => (e === 'moi' ? url : `${url}?agence=${e}`);
/** En mode agence, la carte et la fiche montrent tout (les deux côtés, leurs commissions), en lecture : les gestes passent par « Mon espace ». */
const TOUT_VOIR: VuePersonnelle = { mesCotes: ['entree', 'sortie', 'unique'], commissionsRetirees: false };
export const URL_EMPREINTE = '/api/admin/mon-espace/empreinte';
type Lu = { etat: 'chargement' } | { etat: 'ok'; data: MesAffaires } | { etat: 'erreur' };
// Décisions 11 et 14 (Arno, 02/11/2026) : des onglets « Mes … », seul « Mes apporteurs » reste. 🔴 « Les coûts » (03/11/2026) : associés, mode agence.
type Onglet = 'apporteurs' | 'couts';

export const URL_MES_AFFAIRES = '/api/admin/mon-espace/affaires';
const MOTS_ONGLETS: Record<Onglet, string> = { apporteurs: 'Mes apporteurs', couts: 'Les coûts' };
const MOTS_ONGLETS_AGENCE: Record<Onglet, string> = { apporteurs: 'Apporteurs', couts: 'Les coûts' };
/** L'onglet d'arrivée : la règle de la Transaction (`vueInitiale`) ; une adresse d'un onglet retiré (« Mes ventes », « Mes statistiques ») → « Mois ». PUR. */
export const vueDArrivee = (vue: string | null, avecMois: boolean): 'compromis' | 'mois' | 'annee' =>
  (vue === 'ventes' || vue === 'statistiques' || vue === 'mes-ventes' || vue === 'mes-statistiques' ? 'mois' : vueInitiale(vue, avecMois));
const rien = (): void => {};

/** Tri : compromis par date de signature (plus récent en haut, sans date en bas) ; ventes par date d'acte (à défaut, son mois). PUR. */
export function trierMesCompromis(vs: readonly VenteMonEspace[]): VenteMonEspace[] {
  return [...vs].sort((a, b) => (b.dateCompromis ?? '').localeCompare(a.dateCompromis ?? '') || b.id - a.id);
}
const jourActe = (v: VenteMonEspace): string => v.dossier?.dateActe ?? (v.mois === null ? `${v.annee}-00-00` : `${v.annee}-${String(v.mois).padStart(2, '0')}-00`);
export function trierMesVentes(vs: readonly VenteMonEspace[]): VenteMonEspace[] {
  return [...vs].sort((a, b) => jourActe(b).localeCompare(jourActe(a)) || b.id - a.id);
}

export function MesCompteurs() {
  const [lu, setLu] = useState<Lu>({ etat: 'chargement' });
  const [unite, setUnite] = useAffichageRetenu();
  // Les onglets : « Compromis | Mois | Année(s) » du Suivi CA (`vue`, l'adresse ?vue= comme la Transaction), puis à la suite « Mes compromis en
  // cours | Mes ventes | Mes statistiques | Mes apporteurs » (`onglet`) ; un seul des deux est choisi à la fois.
  const jourEcran = aujourdhuiParis();
  const avecMois = parametre('mois') !== null || parametre('periode') !== null || parametre('vue-mois') !== null;
  // 🔴 R3 (03/11/2026) — le lien « Saisir dans Les coûts » du Suivi CA : `?espace=criterimmo&onglet=couts` ouvre directement l'onglet, sur la structure
  const ongletDemande = parametre('onglet') === 'couts' ? 'couts' as const : null;
  const [vue, setVueEtat] = useState<'compromis' | 'mois' | 'annee' | null>(() => (ongletDemande !== null ? null : vueDArrivee(parametre('vue'), avecMois)));
  const [onglet, setOngletEtat] = useState<Onglet | null>(ongletDemande);
  const choisirVue = (v: 'compromis' | 'mois' | 'annee'): void => { setVueEtat(v); setOngletEtat(null); };
  const setOnglet = (o: Onglet): void => { setOngletEtat(o); setVueEtat(null); };
  const ligneMois = useLigneDesMois(jourEcran);
  // 🔴 LOT 10 — l'espace vu (le mien, ou une structure : administrateurs) ; tri et filtre « Négociateur » des compromis de la structure.
  const espaceDemande: Espace = estAgence(parametre('espace')) ? parametre('espace') as Agence : 'moi';
  const [espace, setEspace] = useState<Espace>(espaceDemande);
  const espaceVu = useRef<Espace>(espaceDemande);
  // l'adresse ne garde pas la demande (un rechargement repart de l'écran normal)
  useEffect(() => { ecrireAdresse({ espace: null, onglet: null }); }, []);
  const [tri, setTri] = useState<TriListe>(TRI_LISTE_DEFAUT);
  const [filtreNego, setFiltreNego] = useState('');
  // retenu d'une lecture à l'autre : le sélecteur reste pendant le chargement d'un autre espace
  const [estAdmin, setEstAdmin] = useState(false);
  // 🔴 LOT 5 — le parcours de création ouvert ; l'affaire qui vient d'être créée (en haut, dépliée) ; le compteur de relecture.
  const [parcours, setParcours] = useState(false);
  const [nouvelle, setNouvelle] = useState<number | null>(null);
  const [lecture, setLecture] = useState(0);
  // 🔴 LOT 6 — l'affaire en cours de modification, l'historique ouvert, les références du formulaire (lues à la première modification).
  const [edition, setEdition] = useState<VenteMonEspace | null>(null);
  const [historique, setHistorique] = useState<number | null>(null);
  const [refs, setRefs] = useState<(References & { titulaireId: number; administrateur: boolean }) | null>(null);
  const [motifEdition, setMotifEdition] = useState<string | null>(null);
  // 🔴 « Les coûts », lot 3 (C17) — le rappel « Coûts d'octobre à saisir » (lu par la route, relu après chaque saisie) ; un clic ouvre la saisie du mois
  const [rappelCouts, setRappelCouts] = useState<string | null>(null);
  const [rappelRelu, setRappelRelu] = useState(0);
  const [saisieDemandee, setSaisieDemandee] = useState(0);
  const modifier = async (v: VenteMonEspace): Promise<void> => {
    setMotifEdition(null);
    if (refs !== null) { setEdition(v); return; }
    try {
      const r = await fetch(URL_REFERENCES, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; data?: References & { titulaireId: number; administrateur: boolean } };
      if (r.ok && j.etat === 'ok' && j.data !== undefined) { setRefs(j.data); setEdition(v); } else setMotifEdition('Le formulaire n’a pas pu être préparé. Rechargez la page.');
    } catch { setMotifEdition('Le formulaire n’a pas pu être préparé. Rechargez la page.'); }
  };
  const listes = useRef<HTMLDivElement>(null);
  useColonnesNegociateurs(listes);
  // 🔴 LOT 7 — le rafraîchissement automatique : l'empreinte vue en dernier, les affaires d'avant (pour dire qui a changé quoi), la relecture en
  // cours est-elle automatique, les gestes ouverts (pause) ; le message, les lignes éclairées, « reconnectez-vous ».
  const empreinteVue = useRef<string | null>(null);
  const precedentes = useRef<VenteMonEspace[] | null>(null);
  const relectureAuto = useRef(false);
  const gestesOuverts = useRef(new Set<number>());
  const occupe = useRef(false);
  const [miseAJour, setMiseAJour] = useState<string | null>(null);
  const [eclairees, setEclairees] = useState<number[]>([]);
  const [reconnexion, setReconnexion] = useState(false);
  const surOccupe = useCallback((id: number, o: boolean): void => { if (o) gestesOuverts.current.add(id); else gestesOuverts.current.delete(id); }, []);
  useEffect(() => { occupe.current = parcours || edition !== null || lu.etat === 'chargement'; });
  // un geste ouvert (saisie, confirmation) ne redessine pas cet écran : la pause relit l'ensemble des gestes ouverts au moment du battement
  const enPause = (): boolean => occupe.current || gestesOuverts.current.size > 0;
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(avecEspace(URL_MES_AFFAIRES, espace), { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; data?: MesAffaires };
        if (!vivant) return;
        if (!(r.ok && j.etat === 'ok' && j.data !== undefined)) { if (!relectureAuto.current) setLu({ etat: 'erreur' }); relectureAuto.current = false; return; }
        const nouvelles = j.data.ventes;
        // 🔴 LOT 7 — une relecture AUTOMATIQUE : ce qu'un AUTRE collaborateur a changé se dit, et sa ligne s'éclaire brièvement.
        if (relectureAuto.current && precedentes.current !== null) {
          const m = misesAJourDesAutres(precedentes.current, nouvelles, j.data.titulaire.id);
          if (m.length > 0) { setMiseAJour(messageMiseAJour(m)); setEclairees(m.map((x) => x.id)); setTimeout(() => { if (vivant) setEclairees([]); }, DUREE_SURBRILLANCE_MS); }
        }
        relectureAuto.current = false;
        precedentes.current = nouvelles;
        // L'empreinte de RÉFÉRENCE = celle des affaires réellement chargées (la même fonction que le serveur) : un changement survenu entre ce
        // chargement et le battement suivant n'est jamais perdu.
        empreinteVue.current = empreinteDe(nouvelles);
        setEstAdmin(j.data.titulaire.administrateur);
        setLu({ etat: 'ok', data: j.data });
      } catch { if (vivant && !relectureAuto.current) setLu({ etat: 'erreur' }); relectureAuto.current = false; }
    })();
    return () => { vivant = false; };
  }, [lecture, espace]);
  useEffect(() => {
    let vivant = true;
    const battre = async (): Promise<void> => {
      if (!peutBattre({ visible: document.visibilityState === 'visible', chargementEnCours: false, gesteEnCours: enPause(), releveEnCours: false })) return;
      try {
        const r = await fetch(avecEspace(URL_EMPREINTE, espaceVu.current), { cache: 'no-store' });
        if (!vivant) return;
        // session expirée : « reconnectez-vous » ; toute autre panne : nouvel essai silencieux au prochain battement (aucun faux message)
        if (r.status === 401) { setReconnexion(true); return; }
        if (!r.ok) return;
        const j = (await r.json()) as { data?: { empreinte?: unknown } };
        const e = j.data?.empreinte;
        if (typeof e !== 'string') return;
        setReconnexion(false);
        if (enPause()) return;
        if (doitRelire(empreinteVue.current, e)) { relectureAuto.current = true; setLecture((x) => x + 1); }
      } catch { /* réseau : nouvel essai silencieux */ }
    };
    const minuterie = setInterval(() => { void battre(); }, PERIODE_MON_ESPACE_MS);
    const auRetour = (): void => { if (document.visibilityState === 'visible') void battre(); };
    document.addEventListener('visibilitychange', auRetour);
    void battre();
    return () => { vivant = false; clearInterval(minuterie); document.removeEventListener('visibilitychange', auRetour); };
  }, []);
  const data = lu.etat === 'ok' ? lu.data : null;
  // 🔴 « Les coûts », lot 3 (C17) — le rappel du mois précédent, pour l'espace vu (associés, mode agence)
  const agenceRappel = data !== null && ongletCoutsVisible(data.titulaire, data.agence?.cle ?? null) ? data.agence!.cle : null;
  useEffect(() => {
    if (agenceRappel === null) return; // le rappel n'est montré qu'avec `agenceRappel` (voir le rendu)
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(`${URL_COUTS}?rappel=1&agence=${agenceRappel}`, { cache: 'no-store' });
        const j = (await r.json()) as { data?: { rappel?: { mot?: unknown } | null } };
        if (vivant) setRappelCouts(r.ok && typeof j.data?.rappel?.mot === 'string' ? j.data.rappel.mot : null);
      } catch { if (vivant) setRappelCouts(null); }
    })();
    return () => { vivant = false; };
  }, [agenceRappel, lecture, rappelRelu]);
  // 🔴 LOT 9 — « + Nouvel apporteur » (onglet et formulaire de compromis) : la façon de « Mon espace » (zéro doublon, « L'utiliser »).
  const titulaireId = data?.titulaire.id ?? null;
  const facon = useMemo((): FaconNouvelApporteur => ({
    envoyer: async (apporteur) => { const r = await posterApporteur({ action: 'creer', apporteur }); return { motif: r.motif, id: r.data?.id, doublons: r.doublons }; },
    chercher: chercherDoublons,
    // Sans la 450, le refus est sans conséquence : l'apporteur est quand même choisi (dans le compromis, il est enregistré sur la vente).
    utiliser: async (id) => { await posterApporteur({ action: 'utiliser', apporteurId: id }); },
    collegueDefaut: titulaireId,
  }), [titulaireId]);
  const agence = data?.agence ?? null;
  // « Année(s) » : les années (celles du Suivi CA en mode agence, `anneesDe` ; les miennes sinon) et celles qui ont une donnée comptée (lot DH).
  const anneesDispo = data === null ? null : agence !== null ? anneesDe({ ventes: data.ventes, retrocessions: data.retrocessions ?? [] }, data.aujourdhui)
    : (data.statistiques?.annees ?? []).map((x) => x.annee);
  const compteAnnee = (a: number): boolean => data !== null && (agence !== null
    ? listeDesAnnees(data.ventes, [a], 'vendu', data.aujourdhui).length > 0 || (data.retrocessions ?? []).some((r) => r.annee === a)
    : (data.statistiques?.annees ?? []).some((x) => x.annee === a && (x.nb.some((n) => n > 0) || x.aConfirmerNb > 0)));
  const ligneAnnees = useLigneDesAnnees(jourEcran, anneesDispo, vueInitiale(parametre('vue'), false) === 'annee', compteAnnee);
  // L'adresse, comme la Transaction : ?vue=mois (son mois, sa période) / ?vue=annee (ses années) ; « Compromis » et les onglets « Mes … » : rien.
  const { annee: anM, mois: moM, decoupage: decM, periodeTexte } = ligneMois;
  const { choixA, cleChoixA } = ligneAnnees;
  useEffect(() => {
    ecrireAdresse(vue === 'mois' ? { vue: 'mois', annee: String(anM), mois: String(moM), debut: null, fin: null, 'vue-mois': decM, periode: decM === 'periode' ? periodeTexte : null }
      : vue === 'annee' ? (choixA === null ? {} : { vue: 'annee', annee: String(choixA.annee), mois: null, debut: null, fin: null, periode: null, 'vue-mois': null,
        'vue-annee': choixA.decoupage === 'annee' ? null : choixA.decoupage, annees: choixA.decoupage === 'periode' ? ecrireAnnees(choixA.annees) : null })
      : { vue: null, annee: null, mois: null, debut: null, fin: null, periode: null, 'vue-mois': null });
    if (vue !== 'annee') ecrireAdresse({ 'vue-annee': null, annees: null, graphe: null });
  }, [vue, anM, moM, decM, periodeTexte, cleChoixA]); // eslint-disable-line react-hooks/exhaustive-deps
  /** « Année(s) » : un mois du graphique ouvre l'onglet « Mois » sur ce mois (comme la Transaction). */
  const ouvrirMois = (a: number, m: number): void => { ligneMois.setAnneeEntiere(false); ligneMois.setPeriode(null); ligneMois.setAnnee(a); ligneMois.setMois(m); choisirVue('mois'); };
  /** Arno (03/11/2026) — « Mois » ouvert sur une ANNÉE entière (« Année ») : l'onglet « Mois » de la barre → l'année en cours, mois courant ; une année
   *  du graphique « Année par année » → cette année-là (la seule navigation qui porte une autre année). */
  const ouvrirAnnee = (a: number): void => {
    const an = Number(jourEcran.slice(0, 4));
    ligneMois.setPeriode(null); ligneMois.setAnneeEntiere(true); ligneMois.setAnnee(a); ligneMois.setMois(a === an ? Number(jourEcran.slice(5, 7)) : 12); choisirVue('mois');
  };
  /** La barre d'onglets : « Mois » repart TOUJOURS de l'année en cours (jamais l'année vue dans « Année(s) ») ; les autres onglets, inchangés. */
  const choisirOnglet = (v: 'compromis' | 'mois' | 'annee'): void => { if (v === 'mois') ouvrirAnnee(Number(jourEcran.slice(0, 4))); else choisirVue(v); };
  const changerEspace = (e: Espace): void => {
    if (e === espace) return;
    // 🔴 « Les coûts » n'existe pas dans la vue perso (décision C2) : on revient sur « Mois »
    if (e === 'moi' && onglet === 'couts') choisirOnglet('mois');
    // une autre liste : rien à comparer (aucun « X a mis à jour »), l'empreinte de référence sera celle du nouveau chargement
    espaceVu.current = e; precedentes.current = null; empreinteVue.current = null; relectureAuto.current = false;
    setEspace(e); setLu({ etat: 'chargement' }); setFiltreNego(''); setMiseAJour(null); setHistorique(null); setEdition(null);
  };
  const hote = useMemo((): HoteDetail | null => (data === null ? null : {
    d: { lotD: data.schema?.lotD ?? true, personneType: data.schema?.personneType ?? true, uniteCommission: data.schema?.uniteCommission ?? true,
      prixVente: data.schema?.prixVente ?? true, mandat: data.schema?.mandat ?? false, negociateurs: [], apporteurs: [], personnes: [], disponible: data.disponible,
      aujourdhui: data.aujourdhui, annulation: false },
    vue: data.agence?.societe ?? null, societe: data.agence?.cle ?? 'tous', statutDuLibelle: resolveurDe(data.statutsNegociateurs), relire: rien, signalerPorteuse: rien,
    enregistrerApporteur: async () => null, ouvrirEdition: rien, ouvrirPersonnes: rien, acte: null, setActe: rien, signer: async () => {},
    historique: null, setHistorique: rien, ouvrirAnnulation: rien,
  }), [data]);

  // 🔴 LOT 10 — le sélecteur, pour un administrateur seulement (vu une fois les affaires lues : le serveur dit qui est administrateur).
  const selecteur = estAdmin && (
    <div className="mes-espaces" role="group" aria-label="Espace affiché" data-selecteur-espace>
      <span className="loc-muet">Voir</span>
      <div className="trx-unites">
        {(['moi', ...AGENCES] as const).map((e) => <button key={e} type="button" className="trx-unite" aria-pressed={espace === e} onClick={() => changerEspace(e)}
          data-espace={e}>{e === 'moi' ? 'Mon espace' : e === 'criterimmo' ? `Agence : ${LIBELLE_AGENCE[e]}` : LIBELLE_AGENCE[e]}</button>)}
      </div>
    </div>
  );
  if (lu.etat === 'chargement') return <><div className="mes-ligne-espace" data-ligne-espace>{selecteur}</div><p className="loc-muet" role="status" data-mon-espace-chargement>{espace === 'moi' ? 'Chargement de vos affaires…' : `Chargement de ${LIBELLE_AGENCE[espace]}…`}</p></>;
  if (lu.etat === 'erreur' || data === null || hote === null) return <><div className="mes-ligne-espace" data-ligne-espace>{selecteur}</div><p className="loc-alerte loc-alerte--orange" role="alert" data-mon-espace-erreur>{espace === 'moi' ? 'Vos affaires n’ont pas pu être lues.' : `Les affaires de ${LIBELLE_AGENCE[espace]} n’ont pas pu être lues.`} Rechargez la page.</p></>;
  const { compteurs, disponible } = data;
  const parId = new Map(data.ventes.map((v) => [v.id, v]));
  const des = (ids: readonly number[]): VenteMonEspace[] => ids.flatMap((id) => { const v = parId.get(id); return v === undefined ? [] : [v]; });
  // 🔴 LOT 10 — mode agence : le tri des listes du Suivi CA (`trierListe`, CA = la somme des cartes) et le filtre « Négociateur » (une personne).
  const dAgence = agence === null ? null : { societe: agence.societe, ventes: data.ventes, retrocessions: data.retrocessions ?? [], statutsNegociateurs: data.statutsNegociateurs };
  const nommer = (l: string): string => data.nomsNegociateurs?.[l] ?? l;
  const tousCompromis = des(compteurs.compromis.ids);
  const personnes = agence === null ? [] : personnesNegociateurs([...new Set(tousCompromis.flatMap(negociateursDe))], nommer);
  const libellesFiltre = personnes.find((p) => p.nom === filtreNego)?.libelles ?? null;
  const filtres = libellesFiltre === null ? tousCompromis : tousCompromis.filter((v) => negociateursDe(v).some((l) => libellesFiltre.includes(l)));
  const tries = dAgence === null ? trierMesCompromis(filtres)
    : trierListe(filtres, tri, (v) => { const c = caAgence(dAgence, [v]); return unite === 'ht' ? c.htC : c.ttcC; }, (v) => v.libelle);
  // 🔴 LOT 5 — l'affaire qui vient d'être créée : en haut, quelle que soit sa date de compromis.
  const compromis = nouvelle === null ? tries : [...tries.filter((v) => v.id === nouvelle), ...tries.filter((v) => v.id !== nouvelle)];
  // Une tuile ouvre la liste de ses affaires (décision 8) : les compromis → l'onglet « Compromis » (décision 11) ; les ventes → la liste de la
  // période, juste sous le graphique du même onglet (décision 14 : elle remplace « Mes ventes »).
  const ouvrir = (o: 'compromis' | 'ventes'): void => {
    if (o === 'compromis') { choisirVue('compromis'); return; }
    const l = document.querySelector('[data-liste-periode]');
    if (l !== null && typeof (l as HTMLElement).scrollIntoView === 'function') (l as HTMLElement).scrollIntoView({ block: 'start' });
  };
  // 🔴 D27 / D28 — les compromis affichés (filtre « Négociateur » compris) : « Mon espace », ce que le serveur a calculé sur chaque vente entière ;
  // mode agence, la carte de la structure (les rétrocessions et le statut des négociateurs de sa page du Suivi CA).
  const affairesEnTete = agence === null ? affairesCompromisPerso(compromis)
    : affairesCompromisAgence(compromis, agence.societe, { retros: data.retrocessions ?? [], statutDuLibelle: resolveurDe(data.statutsNegociateurs) });
  const personnel = (v: VenteMonEspace): VuePersonnelle => (agence !== null ? TOUT_VOIR : { mesCotes: v.mesCotes, commissionsRetirees: v.commissionsRetirees === true });
  const nomAgence = agence === null ? null : LIBELLE_AGENCE[agence.cle];
  // 🔴 « Les coûts » (Arno, 03/11/2026) — décision C1 : les associés ; décision C2 : en mode agence (« Voir »), jamais dans la vue perso
  const avecCouts = ongletCoutsVisible(data.titulaire, agence?.cle ?? null);
  const ongletsEspace: Onglet[] = avecCouts ? ['apporteurs', 'couts'] : ['apporteurs'];
  const peutAgir = (v: VenteMonEspace): boolean => (v.mesCotes.length > 0 || data.titulaire.administrateur) && disponible;
  const relire = (): void => setLecture((x) => x + 1);
  const carte = (v: VenteMonEspace, section: 'compromis' | 'vente', montant?: { m: { htC: number; ttcC: number }; mot?: string }) => (
    <div key={v.id} className={eclairees.includes(v.id) ? 'mes-eclairee' : undefined} data-eclairee={eclairees.includes(v.id) ? 'oui' : undefined}>
    <CarteAffaire v={v} aujourdhui={data.aujourdhui} section={`mon-espace-${section}`} vue={agence?.societe ?? null} retros={agence === null ? undefined : data.retrocessions} statutDuLibelle={hote.statutDuLibelle} personnel={personnel(v)}
      donnees={{ 'data-ma-vente': String(v.id) }} ouvertInitial={section === 'compromis' && v.id === nouvelle} {...(montant === undefined ? {} : { montant })}>
      <DetailAffaire v={v} hote={hote} etiquettes={section === 'vente'} personnel={personnel(v)} />
      {/* 🔴 LOT 6 — « Modifier » : ses négociateurs et les administrateurs (le serveur refuse les autres, 403) ; l'historique, en lecture. */}
      <div className="trx-actions trx-barre-actions mes-actions">
        {/* 🔴 LOT 7 — les gestes (décision 5) : un négociateur de l'affaire ou un administrateur ; confirmés dans la page. */}
        <GestesAffaire v={v} aujourdhui={data.aujourdhui} peutAgir={peutAgir(v)} onFait={relire} onOccupe={surOccupe} />
        {peutAgir(v) && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void modifier(v)}
          data-modifier-mon-espace={v.id}>Modifier</button>}
        <button type="button" className="svv-btn svv-btn-outline gst-btn" aria-expanded={historique === v.id} onClick={() => setHistorique(historique === v.id ? null : v.id)}
          data-historique-bouton={v.id}>{historique === v.id ? 'Masquer l’historique' : 'Historique des modifications'}</button>
      </div>
      {historique === v.id && <HistoriqueAffaire id={v.id} />}
    </CarteAffaire>
    </div>
  );
  return (
    <ContexteNouvelApporteur.Provider value={facon}>
    <FournisseurNoms value={data.nomsNegociateurs ?? {}}><FournisseurAffichage value={unite}><FournisseurChangerAffichage value={setUnite}><FournisseurConsolide value={agence === null || agence.cle === 'tous'}>
    <div className="mes-compteurs-bloc" data-espace-vu={espace}>
      <style>{CSS}{CSS_MES_COMPTEURS}{CSS_NOUVEAU_COMPROMIS}{CSS_LISTE_PERIODE}{CSS_CARTES_COMPROMIS}</style>
      {/* L'accueil : « Voir … » à gauche (administrateurs), « + Nouveau compromis » à droite, sur la même ligne (au téléphone : dessous, à droite). */}
      <div className="mes-ligne-espace" data-ligne-espace>
        {selecteur}
        {/* 🔴 LOT 5 — créer un compromis : structure, n° de mandat, vérification, puis le formulaire de la tuile Suivi CA. */}
        {disponible && !parcours && <button type="button" className="svv-btn svv-btn-primary gst-btn mes-nouveau" onClick={() => setParcours(true)} data-nouveau-compromis-mon-espace>+ Nouveau compromis</button>}
      </div>
      {/* Les onglets du Suivi CA (« Compromis | Mois | Année(s) », le même composant), puis, à la suite, ceux de « Mon espace » (inchangés) ; JUSTE SOUS « Voir … ». */}
      {/* Décisions 11 et 14 (Arno, 02/11/2026) : « Mes compromis en cours » (= « Compromis »), « Mes ventes » (= la liste sous le graphique, mêmes
          cartes, mêmes gestes) et « Mes statistiques » (= cartes, graphique et tableaux sous le graphique) sont retirés ; « Mes apporteurs » reste. */}
      {/* Une seule ligne : les onglets à gauche, « Montants en HT | TTC » à droite (au téléphone : les onglets défilent, HT | TTC dessous). */}
      <div className="mes-ligne-onglets" data-ligne-onglets>
        <OngletsVues vue={vue} onVue={choisirOnglet} apres={[...ongletsEspace.map((o) => (
          <button key={o} type="button" role="tab" id={`mon-espace-onglet-${o}`} aria-selected={onglet === o} aria-controls="mon-espace-listes" className="tdb-onglet mes-onglet"
            onClick={() => setOnglet(o)} data-onglet-mon-espace={o}>{(nomAgence === null ? MOTS_ONGLETS : MOTS_ONGLETS_AGENCE)[o]}</button>
        )), ...(avecCouts && agenceRappel !== null && rappelCouts !== null ? [<button key="rappel" type="button" className="mes-rappel-couts" onClick={() => { setOnglet('couts'); setSaisieDemandee((x) => x + 1); }}
          data-rappel-couts>{rappelCouts}</button>] : [])]} />
        <div className="mes-compteurs-tete">
          <span className="loc-muet">Montants en</span><BoutonAffichage unite={unite} onChange={setUnite} /></div>
      </div>
      {!disponible && <p className="loc-alerte loc-alerte--orange" role="status">Le Suivi CA n’est pas encore en place dans la base : aucune affaire à montrer.</p>}
      {/* 🔴 Arno (05/11/2026) — un collaborateur sans aucune affaire rattachée à son compte : un message clair, jamais un espace muet. */}
      {disponible && nomAgence === null && !data.ventes.some((v) => v.mesCotes.length > 0) && <p className="loc-alerte" role="status" data-espace-vide>{MESSAGE_ESPACE_VIDE}</p>}
      {/* Décision 10 (Arno, 02/11/2026) : la phrase « Le montant est votre CA … » est retirée de « Mon espace » ; celle du mode agence reste. */}
      {nomAgence !== null && <p className="loc-muet mes-compteurs-note" data-note-ca>{`Le montant est le CA de ${nomAgence}, calculé comme dans le Suivi CA (la somme des cartes ; les compromis en cours : la même règle).`}</p>}
      {motifEdition !== null && <p className="trx-erreur" role="alert" data-motif-edition>{motifEdition}</p>}
      {/* 🔴 LOT 7 — ce qu'un collègue vient de changer (discret) ; une session expirée (jamais un faux message de panne). */}
      {miseAJour !== null && <p className="mes-mise-a-jour" role="status" data-mise-a-jour>{miseAJour}
        <button type="button" className="mes-mise-a-jour-fermer" aria-label="Fermer le message" onClick={() => setMiseAJour(null)}>×</button></p>}
      {reconnexion && <p className="loc-alerte loc-alerte--orange" role="alert" data-reconnexion>Votre session a expiré : <a href="/admin/login">reconnectez-vous</a> pour voir les dernières mises à jour.</p>}
      {/* 🔴 LOT 6 — le formulaire de la tuile, sur l'affaire telle que je la reçois ; la version lue part avec l'enregistrement (409 si un collègue a
          enregistré entre-temps : le message le dit, rien n'est écrasé). */}
      {edition !== null && refs !== null && <FormulaireDossier societe={edition.societe} vente={edition} references={refs}
        repartitionInitiale={etatRepartitionDe(edition, refs.negociateurs, refs.uniteCommission === true)} commissionsMasquees={!refs.administrateur}
        envoyer={envoyerMonEspace} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); setLecture((x) => x + 1); }} />}
      {parcours && <NouveauCompromis modeAgence={espace !== 'moi'} onFermer={() => setParcours(false)} onCree={(id) => { setParcours(false); choisirVue('compromis'); setNouvelle(id); setLecture((x) => x + 1); }} />}
      <div id="mon-espace-listes" role="tabpanel" ref={listes} data-liste-mon-espace={onglet ?? `vue-${vue}`}>
        {/* « Mois » : l'accueil au format « Le mois » du Suivi CA ; « Année(s) » : celui de « L'année ». */}
        {vue === 'mois' ? <AccueilMonEspace data={data} ligne={ligneMois} onOuvrir={ouvrir} carte={carte} />
        : vue === 'annee' ? <AnneesMonEspace data={data} ligne={ligneAnnees} annees={anneesDispo ?? []} onOuvrirMois={ouvrirMois} onOuvrirAnnee={ouvrirAnnee} onOuvrir={ouvrir} carte={carte} />
        : onglet === 'apporteurs' ? <MesApporteurs />
        : onglet === 'couts' && !avecCouts ? <p className="loc-muet mes-vide" data-couts-reserve>« Les coûts » est réservé aux comptes qui ont la case « Les coûts », dans « Voir » : CRITERIMMO, MACJ ou FUSION.</p>
        : onglet === 'couts' ? (avecCouts && agence !== null ? <CoutsMonEspace agence={agence.cle} jour={data.aujourdhui} lecture={lecture} saisieDemandee={saisieDemandee}
          onEcrit={() => setRappelRelu((x) => x + 1)} /> : null) : (
          <>
          {agence !== null && tousCompromis.length > 0 && (
            <div className="mes-ventes-tete" data-outils-agence>
              <label className="mes-annee">Négociateur
                <select value={filtreNego} onChange={(e) => setFiltreNego(e.target.value)} data-filtre-negociateur>
                  <option value="">Tous</option>
                  {personnes.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}</select></label>
              <label className="mes-annee">Trier
                <select value={tri} onChange={(e) => setTri(e.target.value as TriListe)} data-tri-compromis>
                  {TRIS_LISTE.map((t) => <option key={t} value={t}>{LIBELLE_TRI_LISTE[t]}</option>)}</select></label>
            </div>
          )}
          {/* 🔴 D27 (Arno, 03/11/2026) — 4 cartes en tête, sur les compromis affichés dans la liste ; 🔴 D28 — sous la liste, leurs apporteurs. */}
          <CartesCompromis c={cartesCompromis(affairesEnTete)} agence={agence !== null} />
          {compromis.length === 0
            ? <p className="loc-muet mes-vide" data-liste-vide="compromis">{nomAgence === null ? 'Aucun compromis en cours à votre nom.' : libellesFiltre === null ? `Aucun compromis en cours pour ${nomAgence}.` : 'Aucun compromis en cours pour ce négociateur.'}</p>
            : <div className="trx-cartes mes-cartes">{compromis.map((v) => carte(v, 'compromis'))}</div>}
          <TableauParApporteur lignes={tableauApporteursCompromis(affairesEnTete)} libelle={null} agence={agence !== null} sorte="compromis" />
          </>
        )}
      </div>
    </div>
    </FournisseurConsolide></FournisseurChangerAffichage></FournisseurAffichage></FournisseurNoms>
    </ContexteNouvelApporteur.Provider>
  );
}

// Les jetons de la charte seulement (Clair et Sombre) ; cibles de 44 px au moins ; une colonne sur téléphone.
const CSS_MES_COMPTEURS = `
.mes-ligne-espace{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0 0 .75rem}
.mes-ligne-espace .mes-nouveau{width:auto;flex:0 0 auto;margin-left:auto;min-height:44px;padding:0 1.25rem}
/* Arno (02/11/2026) — « Mois » : la rangée (sélecteur compris) a la largeur du graphique ; les mois se RÉPARTISSENT sur toute la largeur
   disponible, centrés, tous entiers (au téléphone : défilement, comme le Suivi CA). Décision 16 : la rangée des ANNÉES garde le format du
   Suivi CA (celui d'avant e83e882), sans répartition. Les cartes : des colonnes égales
   qui tiennent toujours dans la largeur du conteneur (et non de l'écran), titres qui passent à la ligne, jamais coupés. */
@media (min-width:721px){
  .mes-accueil .trx-rangee-mois:not(.trx-rangee-annees) .tdb-onglets>.tdb-onglet{flex:1 1 auto;text-align:center}
}
.mes-accueil{container-type:inline-size;container-name:mes-accueil}
.mes-annees{container-type:inline-size;container-name:mes-annees}
.mes-accueil .tdb-tuiles,.mes-annees .tdb-tuiles{grid-template-columns:repeat(4,minmax(0,1fr))}
.mes-accueil .tdb-tuiles.trx-tuiles-gestion,.mes-annees .tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(5,minmax(0,1fr))}
@container mes-accueil (max-width:900px){ .tdb-tuiles,.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(3,minmax(0,1fr))} }
@container mes-annees (max-width:900px){ .tdb-tuiles,.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(3,minmax(0,1fr))} }
@container mes-accueil (max-width:620px){ .tdb-tuiles,.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(2,minmax(0,1fr))} }
@container mes-annees (max-width:620px){ .tdb-tuiles,.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(2,minmax(0,1fr))} }
@container mes-accueil (max-width:380px){ .tdb-tuiles,.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:minmax(0,1fr)} }
@container mes-annees (max-width:380px){ .tdb-tuiles,.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:minmax(0,1fr)} }
.mes-accueil .tdb-tuile>*,.mes-annees .tdb-tuile>*{overflow-wrap:anywhere;white-space:normal}
/* sous la barre d'onglets : le même écart que la page d'une structure du Suivi CA (.tdb : 18 px) */
#mon-espace-listes{margin-top:18px}
.mes-espaces{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0}
/* 🔴 Les couts, lot 3 (C17) — le rappel, discret, a cote de l onglet */
.mes-rappel-couts{align-self:center;margin:0 0 4px 4px;padding:2px 10px;min-height:32px;border-radius:999px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer;
  background:var(--color-svv-amber-soft);color:var(--color-svv-ink);border:1px solid var(--color-svv-amber);white-space:nowrap}
.mes-espaces .trx-unites{flex-wrap:wrap}
.mes-espaces .trx-unite{min-height:44px}
.mes-compteurs-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:.5rem;margin:0 0 .75rem}
.mes-ligne-onglets{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 0 .75rem;border-bottom:1px solid var(--color-svv-line)}
.mes-ligne-onglets .trx-barre{flex:1 1 auto;min-width:0;margin:0}
.mes-ligne-onglets .trx-vues{overflow-x:auto;scrollbar-width:thin;border-bottom:0}
.mes-ligne-onglets .mes-compteurs-tete{flex:0 0 auto;margin:0 0 6px}
@media (max-width:720px){ .mes-ligne-onglets{flex-direction:column;align-items:stretch;gap:6px} .mes-ligne-onglets .mes-compteurs-tete{align-self:flex-end} }
.mes-compteurs-note{margin:.75rem 0 1rem;font-size:.9rem}
.mes-ventes-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin:0 0 .75rem}
.mes-annee{display:flex;align-items:center;gap:.5rem;font-weight:600}
.mes-annee select{min-height:44px;padding:0 .75rem;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:8px}
.mes-ventes-total{margin:0}
.mes-ventes-total strong{color:var(--color-svv-green)}
.mes-cartes{display:flex;flex-direction:column;gap:.5rem}
.mes-vide{margin:.5rem 0}
.trx-negociateur-lecture{margin:.25rem 0;font-weight:600}
.mes-mise-a-jour{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin:0 0 .75rem;padding:.25rem .25rem .25rem .75rem;border-radius:8px;
  background:var(--color-svv-amber-soft);color:var(--color-svv-ink);border:1px solid var(--color-svv-amber)}
.mes-mise-a-jour-fermer{min-width:44px;min-height:44px;font:inherit;font-size:1.25rem;background:none;border:0;color:var(--color-svv-ink);cursor:pointer}
.mes-eclairee{border-radius:12px;outline:2px solid var(--color-svv-amber);outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.mes-eclairee{animation:mes-eclat 1s ease-out}@keyframes mes-eclat{from{outline-color:transparent}to{outline-color:var(--color-svv-amber)}}}
.mes-confirmation{display:flex;flex-direction:column;gap:.5rem;width:100%}
.mes-confirmation-question{margin:0;font-weight:600}
.trx-societe-cote-lecture{font-weight:600;color:var(--color-svv-muted)}
`;
