'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
// ⚠️ Bundle client : uniquement des TYPES depuis les modules serveur.
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { ComparaisonRattachement } from '../../../../lib/permis/affectationRepo';
import { recopierCote, cotesEnNombres, type ActionAffectation } from '../../../../lib/permis/affectationSchema';
import { TableSuivi, DetailSuiviRendu, AffectationBloc, LegendeAffectation, ActionsRattachement, SaisieCotesInjection, OuvertureManuelle, BandeauOuvertureManuelle, ClotureAcheveSansBati, AccuseValidation, resumeValidation, composerAccuse, SchemaPleinEcran, ComparaisonPleinEcran, InterrupteurReperes, InterrupteurFuturBati, InterrupteurProjection, estFuturBati, descriptionSchemaOrigine, descriptionSchemaNouvelle, NOM_SCHEMA_NOUVELLE, type AccuseValidationData, type EmpriseProjetee } from './SuiviRattachementRendu';
import { RecapProjectionRattachement } from './ProjectionRecapRattachement';
// RATT-1 bis — le geste « statuer les polygones existants » réutilise le composant PUR d'Analyse + ses helpers (jamais dupliqué).
import { BlocProjetRepliable, BlocExistantsRepliable, PanneauRattrapage, attribuerReperes, MiniConfigProjetee, CaseConfigOfficielle } from './TraceEmpriseRendu';
import { apercuRattrapage } from '../../../../lib/permis/rattrapage'; // NOM-2 — aperçu PUR du rattrapage (client, aucune requête)
import { statutCourantParCleabs, type LigneStatutPolygone, type PolygoneRecouvert } from '../../../../lib/permis/polygoneStatut';
// TYPES seuls (modules serveur / purs) — pour le récap de projection (PROJ-4a), affichage pur.
import type { EmpriseReconstruite, PolygoneBdTopo } from '../../../../lib/permis/empriseReconstruiteRepo';
import type { PointLambert } from '../../../../lib/permis/calageEmprise';

// L11 — libellés de SOURCE des bulles (constat AVANT travaux). L'origine figée lit le SNAPSHOT ; sinon (et la nouvelle) la couche vivante.
const SOURCE_GEL = 'au moment du gel (état des lieux figé)';
const SOURCE_VIVANTE = 'état actuel (couche BD TOPO)';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { CellulePieces } from './ArchivesRendu';
import { recompterSiSucces } from './comptesActions';

/**
 * FUS-3c — onglet SUIVI DU RATTACHEMENT : au clic sur un permis, TOUT le contenu de décision est sur la même page — détail
 * comparatif « trois sources », Street View, ET le détail complet du permis rapatrié d'Archives (caractéristiques, bâtiments,
 * altitudes, parcelles, pièces jointes CONSULTABLES). Réutilise `CaracteristiquesBloc` et `CellulePieces` (déplacement de rendu,
 * pas de réécriture). FUS-3d ajoute l'AFFECTATION des polygones BD TOPO aux corps (schéma + sélecteurs) — SEULE écriture ici ;
 * toujours AUCUN bouton valider/refuser, AUCUNE injection d'altitude (FUS-3e). Les pièces sont téléchargeables mais ni supprimables
 * ni ajoutables ici (ça reste dans Archives). Le détail complet est REPLIÉ par défaut (lisible à 20 dossiers).
 */
export function SuiviRattachementVue({ onRecompter }: { onRecompter?: () => void } = {}) {
  const [liste, setListe] = useState<{ lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> } | null>(null);
  const [daactActif, setDaactActif] = useState<boolean | null>(null); // réglage : la DAACT déclenche-t-elle un dossier ?
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailSuivi | null>(null);
  const [comparaison, setComparaison] = useState<ComparaisonRattachement | null>(null); // L5 : origine (figée) + nouvelle (vivante) + rouge
  const [pleinEcran, setPleinEcran] = useState<'origine' | 'nouvelle' | 'comparer' | null>(null); // L3/L5 — quel plein écran est ouvert
  const [afficherReperes, setAfficherReperes] = useState(true); // L10 — réglage de LECTURE partagé par les deux schémas + plein écran + comparatif (persiste entre dossiers)
  const [afficherFutur, setAfficherFutur] = useState(true); // L13 — réglage INDÉPENDANT : masquer le futur bâti (en projet) pour l'état des lieux sans projection
  const [detailErreur, setDetailErreur] = useState(false);
  const [affErreur, setAffErreur] = useState('');
  const [permisOuvert, setPermisOuvert] = useState(false); // détail complet du permis (caractéristiques + pièces), replié par défaut
  // FUS-3e — décisions
  const [motifRefus, setMotifRefus] = useState('');
  const [accuse, setAccuse] = useState<AccuseValidationData | null>(null); // M8 — accusé de prise en compte (persistant), construit depuis la réponse serveur
  const [actionErreur, setActionErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [cotes, setCotes] = useState<Record<string, string>>({}); // M3 — cote saisie par polygone (cleabs → chaîne ; '' = non injecté)
  const [motifOuverture, setMotifOuverture] = useState(''); // M5 — motif d'une ouverture manuelle de l'arbitrage
  const [cleabsMisEnAvant, setCleabsMisEnAvant] = useState<string | null>(null); // M7 — polygone mis en avant dans le schéma (piloté par le focus d'un champ de cote ; PERSISTE après le blur)
  const [afficherProjection, setAfficherProjection] = useState(false); // PROJ-2c — filtre : superposer les emprises reconstituées au schéma d'origine
  const [emprisesProjetees, setEmprisesProjetees] = useState<EmpriseProjetee[]>([]); // PROJ-2c — emprises du dossier ouvert (Lambert), chargées à l'ouverture
  // PROJ-4a — DONNÉES du récap de projection (lecture seule) : emprises complètes + parcelle + bâti BD TOPO, pour l'état « en attente de bâti ».
  const [recapProjection, setRecapProjection] = useState<{ emprises: EmpriseReconstruite[]; parcelle: PointLambert[][]; polygones: PolygoneBdTopo[]; batiments: { corpsId: number; repere: string | null }[] } | null>(null);
  // RATT-1 bis — registre append-only des statuts décidés + cleabs recouverts par une emprise projetée, LUS de la MÊME réponse GET emprise (:82). + message d'erreur du geste.
  const [statutsLignes, setStatutsLignes] = useState<LigneStatutPolygone[]>([]);
  const [recouverts, setRecouverts] = useState<PolygoneRecouvert[]>([]); // RATT-5 — recouverts (au-dessus du seuil) + leur taux (%)
  const [statutErreur, setStatutErreur] = useState('');
  const [rattrapageOuvert, setRattrapageOuvert] = useState(false); // NOM-2 — aperçu du rattrapage déplié ?
  const [rattrapageEnCours, setRattrapageEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/rattachement', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) { const d = (await res.json()) as { lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number>; daactActif?: boolean }; setListe({ lignes: d.lignes, compteurs: d.compteurs }); setDaactActif(d.daactActif ?? null); }
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  // RATT-1 bis — APPLIQUE une réponse du GET emprise à l'état (SOURCE UNIQUE : emprises projetées + récap + statuts + recouverts).
  //   Partagé par le chargement du dossier ET le rafraîchissement après un statut posé (pas d'état local divergent). PROJ-2c/4a inchangés.
  type ReponseEmprise = { emprises?: EmpriseReconstruite[]; batiments?: { corpsId: number; repere: string | null }[]; contexte?: { empreinteAnneaux?: PointLambert[][] }; polygones?: PolygoneBdTopo[]; statutsPolygones?: LigneStatutPolygone[]; polygonesRecouverts?: PolygoneRecouvert[] };
  const appliquerEmprise = useCallback((je: ReponseEmprise) => {
    const emprises = je.emprises ?? [];
    setEmprisesProjetees(emprises.filter((e) => e.anneau.length >= 3).map((e) => ({ id: e.id, libelle: e.libelle, anneau: e.anneau.map((p) => [p.x, p.y] as [number, number]) })));
    setRecapProjection({ emprises, parcelle: je.contexte?.empreinteAnneaux ?? [], polygones: je.polygones ?? [], batiments: je.batiments ?? [] });
    setStatutsLignes(je.statutsPolygones ?? []); // RATT-1 bis — champs auparavant IGNORÉS de la même réponse
    setRecouverts(je.polygonesRecouverts ?? []);
  }, []);

  useEffect(() => {
    if (ouvert === null) return; // détail masqué au rendu quand ouvert === null (pas de setState synchrone ici)
    let annule = false;
    void (async () => {
      setDetail(null); setComparaison(null); setDetailErreur(false); setAffErreur(''); setPermisOuvert(false); setPleinEcran(null);
      setMotifRefus(''); setAccuse(null); setActionErreur(''); setMotifOuverture(''); setCleabsMisEnAvant(null); setAfficherProjection(false); setEmprisesProjetees([]); setRecapProjection(null); setStatutsLignes([]); setRecouverts([]); setStatutErreur(''); // reset décisions (DANS l'async)
      try {
        const res = await fetch(`/api/admin/permis/rattachement?dossierId=${ouvert}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) { const d = (await res.json()) as { detail: DetailSuivi; comparaison: ComparaisonRattachement | null }; setDetail(d.detail); setComparaison(d.comparaison); }
        else setDetailErreur(true);
        // PROJ-2c — emprises reconstituées du dossier (pour le filtre « Afficher la projection »). Best-effort, silencieux : leur
        //   absence ne dégrade JAMAIS le détail (l'interrupteur ne s'affiche alors pas). Lambert → [x,y] pour le schéma.
        try {
          const re = await fetch(`/api/admin/permis/emprise?dossierId=${ouvert}`, { cache: 'no-store' });
          if (!annule && re.ok) appliquerEmprise((await re.json()) as ReponseEmprise);
        } catch { /* emprises indisponibles : le récap reste simplement absent */ }
      } catch { if (!annule) setDetailErreur(true); }
    })();
    return () => { annule = true; };
  }, [ouvert, appliquerEmprise]);

  // RATT-1 bis — dérivés IDENTIQUES à BlocTraceEmprise (:146 / :440), mêmes helpers importés (jamais réécrits).
  const polygonesReperes = useMemo(() => attribuerReperes(recapProjection?.polygones ?? []), [recapProjection]);
  const statutParCleabs = useMemo(() => statutCourantParCleabs(statutsLignes), [statutsLignes]);
  // RATT-1 bis — STATUER un polygone existant (mêmes paramètres qu'en Analyse). Après succès, REJOUE le GET emprise (source unique).
  const statuerPolygone = useCallback(async (cleabs: string, statut: 'preserve' | 'detruit' | 'revoque') => {
    if (ouvert === null) return;
    setStatutErreur('');
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'statuer_polygone', dossierId: ouvert, cleabs, statut }) });
      const j = (await res.json()) as { ok?: boolean; erreur?: string };
      if (!res.ok || !j.ok) { setStatutErreur(j.erreur ?? 'statut impossible'); return; } // jamais un bouton muet (règle c4503da)
      const re = await fetch(`/api/admin/permis/emprise?dossierId=${ouvert}`, { cache: 'no-store' });
      if (re.ok) appliquerEmprise((await re.json()) as ReponseEmprise);
    } catch { setStatutErreur('statut impossible'); }
  }, [ouvert, appliquerEmprise]);

  // NOM-2 — APERÇU du rattrapage, calculé CÔTÉ CLIENT (PUR, aucune requête) à partir des données déjà en portée : batiments (nom/repli),
  //   statut courant, recouverts (déjà filtrés au seuil serveur). Dit ce qui SERAIT écrit ; l'écriture n'a lieu qu'après confirmation.
  const apercuRattrap = useMemo(() => {
    const reperesParCleabs = new Map(polygonesReperes.filter((p) => p.cleabs).map((p) => [p.cleabs as string, p.repere]));
    return apercuRattrapage(recapProjection?.batiments ?? [], reperesParCleabs, statutParCleabs, recouverts);
  }, [recapProjection, polygonesReperes, statutParCleabs, recouverts]);
  // NOM-2 — APPLIQUER le rattrapage (après confirmation) : POST 'rattraper' (writers existants, mêmes garanties), puis REJOUE le GET emprise (source unique).
  const appliquerRattrapage = useCallback(async () => {
    if (ouvert === null) return;
    setStatutErreur(''); setRattrapageEnCours(true);
    try {
      const res = await fetch('/api/admin/permis/emprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rattraper', dossierId: ouvert }) });
      const j = (await res.json()) as { ok?: boolean; erreur?: string };
      if (!res.ok || !j.ok) { setStatutErreur(j.erreur ?? 'rattrapage impossible'); return; }
      const re = await fetch(`/api/admin/permis/emprise?dossierId=${ouvert}`, { cache: 'no-store' });
      if (re.ok) appliquerEmprise((await re.json()) as ReponseEmprise);
      setRattrapageOuvert(false);
    } catch { setStatutErreur('rattrapage impossible'); }
    finally { setRattrapageEnCours(false); }
  }, [ouvert, appliquerEmprise]);

  // M3 — cotes EFFECTIVES affichées : la saisie d'Arno (`cotes`) si présente pour ce cleabs, sinon le DÉFAUT = altitude de sommet du
  //   bâtiment. DÉRIVÉ (useMemo), pas un effet : aucun état propagé, et le défaut n'est jamais FIGÉ dans l'état — donc jamais « recopié
  //   en douce ». `cotes` ne contient QUE des saisies explicites d'Arno.
  const cotesEffectives = useMemo(() => {
    const aff = comparaison?.nouvelle;
    const out: Record<string, string> = {};
    if (aff) for (const c of aff.corps) for (const cleabs of c.cleabsAffectes) {
      out[cleabs] = cleabs in cotes ? cotes[cleabs] : (c.altitudeSommetNgf != null ? String(c.altitudeSommetNgf) : '');
    }
    return out;
  }, [comparaison, cotes]);

  // M3 — saisie d'une cote : on ne touche QUE ce polygone (jamais de propagation implicite).
  const majCote = useCallback((cleabs: string, valeur: string) => { setCotes((prev) => ({ ...prev, [cleabs]: valeur })); }, []);
  // M3 — « recopier partout » : geste EXPLICITE d'Arno ; pousse la cote effective du 1er polygone du bâtiment sur ses autres polygones (helper pur).
  const recopierPourBatiment = useCallback((corpsId: number) => {
    const c = comparaison?.nouvelle.corps.find((x) => x.id === corpsId);
    if (!c || c.cleabsAffectes.length === 0) return;
    const first = c.cleabsAffectes[0];
    const source = first in cotes ? cotes[first] : (c.altitudeSommetNgf != null ? String(c.altitudeSommetNgf) : '');
    setCotes((prev) => recopierCote(prev, c.cleabsAffectes, source));
  }, [comparaison, cotes]);

  // FUS-3d / M2 — ajouter/retirer UN polygone d'un bâtiment (additif). L'exclusivité est garantie CÔTÉ BASE (index) ; un refus affiche son motif.
  const affecter = useCallback(async (corpsId: number, cleabs: string, operation: ActionAffectation): Promise<void> => {
    if (ouvert === null) return;
    setAffErreur('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'affecter', dossierId: ouvert, corpsId, cleabs, operation }) });
      const d = (await res.json().catch(() => ({}))) as { comparaison?: ComparaisonRattachement; erreur?: string };
      if (res.ok && d.comparaison) setComparaison(d.comparaison);
      else setAffErreur(d.erreur ?? 'Affectation impossible.');
    } catch { setAffErreur('Affectation impossible.'); }
  }, [ouvert]);

  // FUS-3e — décisions (valider / refuser / retour_lidar). La validation d'une cardinalité incohérente exige un motif (besoinConfirmation).
  // FUS-3e — refuser / retour LiDAR (le motif de refus reste obligatoire). 401 = session expirée, JAMAIS « panne » ni « échec ».
  const agir = useCallback(async (action: 'refuser' | 'retour_lidar', extra: { motif?: string } = {}): Promise<void> => {
    if (ouvert === null) return;
    setEnCours(true); setActionErreur(''); setAccuse(null);
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId: ouvert, ...extra }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; detail?: DetailSuivi; comparaison?: ComparaisonRattachement | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);
        if (d.comparaison !== undefined) setComparaison(d.comparaison ?? null);
        setMotifRefus('');
        recompterSiSucces(true, onRecompter);
      } else {
        setActionErreur(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'Action impossible.'));
      }
    } catch { setActionErreur('Action impossible.'); }
    finally { setEnCours(false); }
  }, [ouvert, onRecompter]);

  // M8 — VALIDER : plus de motif ; construit l'ACCUSÉ (persistant) à partir de ce que le SERVEUR retourne (injections réelles, état).
  const valider = useCallback(async (): Promise<void> => {
    if (ouvert === null) return;
    setEnCours(true); setActionErreur(''); setAccuse(null);
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'valider', dossierId: ouvert, cotes: cotesEnNombres(cotesEffectives) }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; nbInjectes?: number; injections?: { repere: string | null; cleabs: string; cote: number }[]; detail?: DetailSuivi; comparaison?: ComparaisonRattachement | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);
        if (d.comparaison !== undefined) setComparaison(d.comparaison ?? null);
        setAccuse(composerAccuse({ ok: true, nbInjectes: d.nbInjectes ?? 0, injections: d.injections ?? [] }));
        recompterSiSucces(true, onRecompter);
      } else {
        setAccuse(composerAccuse({ ok: false, statut: res.status, erreur: d.erreur ?? '' }));
      }
    } catch { setAccuse(composerAccuse({ ok: false, statut: 0, erreur: 'Réseau indisponible : la validation n’a pas pu être envoyée.' })); }
    finally { setEnCours(false); }
  }, [ouvert, cotesEffectives, onRecompter]);

  // ÉTAGE 1 — CLÔTURER un dossier « achevé, à confirmer » (surélévation / surface constante). Aucune injection : constat de workflow.
  const clore = useCallback(async (): Promise<void> => {
    if (ouvert === null) return;
    setEnCours(true); setActionErreur('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clore', dossierId: ouvert }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; detail?: DetailSuivi; comparaison?: ComparaisonRattachement | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);
        if (d.comparaison !== undefined) setComparaison(d.comparaison ?? null);
        recompterSiSucces(true, onRecompter); // pastille : un dossier « à faire » de moins
      } else setActionErreur(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'Clôture impossible.'));
    } catch { setActionErreur('Clôture impossible.'); }
    finally { setEnCours(false); }
  }, [ouvert, onRecompter]);

  // M5 — OUVRIR l'arbitrage À LA MAIN (aucun delta BD TOPO requis). Motif obligatoire (le bouton est inactif sans motif). Rafraîchit détail + comparaison.
  const ouvrirManuel = useCallback(async (): Promise<void> => {
    if (ouvert === null) return;
    setEnCours(true); setActionErreur('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ouvrir_manuel', dossierId: ouvert, motif: motifOuverture }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; detail?: DetailSuivi; comparaison?: ComparaisonRattachement | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);
        if (d.comparaison !== undefined) setComparaison(d.comparaison ?? null);
        setMotifOuverture('');
        recompterSiSucces(true, onRecompter); // pastille : un dossier arbitrable est apparu
      } else setActionErreur(d.erreur ?? 'Ouverture impossible.');
    } catch { setActionErreur('Ouverture impossible.'); }
    finally { setEnCours(false); }
  }, [ouvert, motifOuverture, onRecompter]);

  // Téléchargement d'une pièce — MÊME signeur unique qu'Archives (action url_piece de /reponses ; la clé ne transite jamais).
  // Réglage GLOBAL : la DAACT (achèvement déclaré) déclenche-t-elle l'ouverture d'un dossier de rattachement ?
  const basculerDaact = useCallback(async (actif: boolean): Promise<void> => {
    setDaactActif(actif); // optimiste
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reglage_daact', actif }) });
      if (!res.ok) setDaactActif(!actif); // rétablissement sur échec
    } catch { setDaactActif(!actif); }
  }, []);

  const telecharger = useCallback(async (pieceId: number, source: 'reponse' | 'dossier'): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux (lecture seule) */ }
  }, []);

  // N10-B — OUVERTURE d'une pièce À LA PAGE (variante `inline` de url_piece → visionneur, sans forcer le téléchargement) ; le fragment
  //   #page=N est ajouté ICI, côté client (jamais signé → sécurité intacte). MÊME signeur serveur, la clé ne transite jamais.
  const ouvrirPiece = useCallback(async (pieceId: number, source: 'reponse' | 'dossier', page?: number): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source, inline: true }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux (lecture seule) */ }
  }, []);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Suivi indisponible.</div>;
  if (!liste) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>;

  // L7 — CONTENU du détail (identique à avant : comparatif, schémas, décisions, détail complet). Rendu INLINE par TableSuivi sous la
  // ligne ouverte ; il n'est appelé QUE pour le dossier ouvert (ouvert === dossierId), donc les états `detail`/`comparaison` visent bien ce dossier.
  const renderDetail = (): ReactNode => {
    if (detailErreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Détail indisponible.</div>;
    if (!detail) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement du détail…</div>;
    // ÉTAGE 1 — un dossier « achevé, à confirmer » / « clôturé » N'entre PAS dans l'arbitrage (pas d'affectation, pas d'injection) :
    //   seule la clôture est proposée. On coupe donc la surface d'arbitrage (comparaison + ActionsRattachement) pour ces états.
    const estAcheveSansBati = detail.etat === 'acheve_sans_bati';
    const estClos = detail.etat === 'clos_sans_bati';
    return (
      <div className="flex flex-col gap-2">
        <DetailSuiviRendu detail={detail} />
        {detail.origineOuverture === 'manuelle' && <BandeauOuvertureManuelle motif={detail.motifOuverture} />}
        {/* PROJ-4a — RÉCAP (lecture seule) de l'emprise projetée : ne s'affiche QUE pour un permis « en attente de bâti ». Le composant
            gère lui-même l'absence d'emprise (message explicite, jamais un schéma vide) et l'état hors « en attente » (rien). */}
        {recapProjection && <RecapProjectionRattachement etat={detail.etat} emprises={recapProjection.emprises} parcelle={recapProjection.parcelle} polygones={recapProjection.polygones} batiments={recapProjection.batiments} statuts={statutParCleabs} />}
        {/* AFF-1 — sous le grand schéma, les DEUX blocs REPLIÉS (identiques à l'onglet Analyse) : polygones « projet » affectés, puis bâtiments existants. */}
        <BlocProjetRepliable emprises={recapProjection?.emprises ?? []} polygones={polygonesReperes} batiments={recapProjection?.batiments ?? []} />
        <BlocExistantsRepliable polygones={polygonesReperes} recouverts={recouverts} statuts={statutParCleabs} onStatuer={(cleabs, statut) => void statuerPolygone(cleabs, statut)} />
        {/* NOM-2 — RATTRAPAGE du dossier courant : nomme les corps anonymes + pose les statuts auto, APRÈS aperçu + confirmation. S'auto-masque si rien à rattraper. */}
        <PanneauRattrapage apercu={apercuRattrap} ouvert={rattrapageOuvert} occupe={rattrapageEnCours} onOuvrir={() => setRattrapageOuvert(true)} onAppliquer={() => void appliquerRattrapage()} onAnnuler={() => setRattrapageOuvert(false)} />
        {statutErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{statutErreur}</div>}
        {/* ÉTAGE 1 — dossier « achevé, à confirmer » (surélévation / surface constante) : on N'affiche PAS l'arbitrage (affectation +
            valider = injection), mais la CLÔTURE honnête. `clos_sans_bati` → note en lecture seule. */}
        {(estAcheveSansBati || estClos) && <ClotureAcheveSansBati clos={estClos} onClore={() => void clore()} enCours={enCours} />}
        {!estAcheveSansBati && !estClos && comparaison && (() => {
          const { origine, nouvelle, polygonesModifies, aChange } = comparaison;
          const persiste = detail.persiste, enAtt = detail.etat === 'en_attente_bati';
          const affecterCb = (corpsId: number, cleabs: string, operation: ActionAffectation) => void affecter(corpsId, cleabs, operation);
          const descO = descriptionSchemaOrigine(origine);
          const sourceOrigine = origine.figee ? SOURCE_GEL : SOURCE_VIVANTE; // l'origine non figée lit en réalité le vivant
          // L13/L14 — interrupteur du futur bâti : n'a de sens que s'il y a du projet à SIGNALER (sinon on ne le monte pas). Il ne
          //   retire aucun polygone → le COMPTE reste le nombre TOTAL (tous les polygones sont toujours visibles).
          const yaDuFutur = origine.schema.polygones.some((p) => estFuturBati(p.attributs?.etatDeLObjet)) || nouvelle.schema.polygones.some((p) => estFuturBati(p.attributs?.etatDeLObjet));
          const onFuturVue = yaDuFutur ? setAfficherFutur : undefined;
          const mentionN = descriptionSchemaNouvelle(nouvelle.polygones.length, polygonesModifies.length);
          return (
            <>
              {/* L10/L11/L13 — DEUX interrupteurs INDÉPENDANTS (repères ; futur bâti). Le futur n'apparaît que s'il y a du projet à masquer.
                  Mêmes réglages en vue réduite et en plein écran (état dans la Vue). */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
                <InterrupteurReperes afficherReperes={afficherReperes} onAfficherReperes={setAfficherReperes} />
                {yaDuFutur && <InterrupteurFuturBati afficherFutur={afficherFutur} onAfficherFutur={setAfficherFutur} />}
                {/* PROJ-2c — 3e interrupteur : superposer les emprises reconstituées au schéma d'origine (n'apparaît que s'il y en a). */}
                {emprisesProjetees.length > 0 && <InterrupteurProjection afficherProjection={afficherProjection} onAfficherProjection={setAfficherProjection} />}
              </div>
              {/* AFF-4 — `stretch` : les cases de la rangée partagent la MÊME hauteur (aucune ne flotte plus haut que ses voisines) ; en colonne (mobile), sans effet. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', alignItems: 'stretch' }}>
                {/* M6 — PANNEAU des polygones sélectionnés + leur cote, à GAUCHE du schéma (1er enfant → au-dessus quand la ligne passe
                    en colonne sur mobile). SEUL emplacement de la saisie (le bloc du bas est supprimé) : aucun champ en double. */}
                {persiste && nouvelle.corps.some((c) => c.cleabsAffectes.length > 0) && (
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <SaisieCotesInjection affectation={nouvelle} cotes={cotesEffectives} onCote={majCote} onRecopier={recopierPourBatiment} misEnAvant={cleabsMisEnAvant} onMiseEnAvant={setCleabsMisEnAvant} />
                  </div>
                )}
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <AffectationBloc affectation={origine} titre={descO.nom} mention={descO.mention} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onAgrandir={() => setPleinEcran('origine')} afficherReperes={afficherReperes} sourceLibelle={sourceOrigine} afficherFutur={afficherFutur} cleabsMisEnAvant={cleabsMisEnAvant} emprisesProjetees={afficherProjection ? emprisesProjetees : []} sansLegende />
                </div>
                {/* RATT-3 — à droite de « Configuration d'origine » : la configuration PROJETÉE (parcelle après travaux, détruits retirés,
                    emprise en rouge, aucun vert/orange) puis l'emplacement « Configuration officielle » (grisé, en attente de l'administration).
                    Données déjà en mémoire (recapProjection + statutParCleabs, GET emprise) — aucune requête supplémentaire. */}
                {/* AFF-2 (3b/3c) — projetée dessinée au MÊME cadre/échelle que « Configuration d'origine » (même origine.schema). */}
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <MiniConfigProjetee schema={origine.schema} statuts={statutParCleabs} emprises={emprisesProjetees} />
                </div>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <CaseConfigOfficielle millesime={origine.millesimeGel} />
                </div>
                {aChange && (
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <AffectationBloc affectation={nouvelle} titre={NOM_SCHEMA_NOUVELLE} mention={mentionN} rougeCleabs={polygonesModifies} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onAgrandir={() => setPleinEcran('nouvelle')} afficherReperes={afficherReperes} sourceLibelle={SOURCE_VIVANTE} afficherFutur={afficherFutur} cleabsMisEnAvant={cleabsMisEnAvant} sansLegende />
                  </div>
                )}
              </div>
              {/* AFF-4 — la légende des schémas, sortie de la case de gauche, sous la rangée ENTIÈRE (elle documente les trois schémas). */}
              <LegendeAffectation avecRouge={aChange && polygonesModifies.length > 0} />
              {origine.figee && !aChange && (
                <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>
                  La configuration actuelle est identique à l’origine : aucun changement détecté depuis le gel — pas de second schéma à comparer.
                </div>
              )}
              {aChange && (
                <div>
                  <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto' }} onClick={() => setPleinEcran('comparer')}>Comparer les schémas ⤢</button>
                </div>
              )}
              {pleinEcran === 'origine' && (
                <SchemaPleinEcran titre={descO.nom} mention={descO.mention} affectation={origine} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onFermer={() => setPleinEcran(null)} afficherReperes={afficherReperes} onAfficherReperes={setAfficherReperes} sourceLibelle={sourceOrigine} afficherFutur={afficherFutur} onAfficherFutur={onFuturVue} />
              )}
              {pleinEcran === 'nouvelle' && (
                <SchemaPleinEcran titre={NOM_SCHEMA_NOUVELLE} mention={mentionN} rougeCleabs={polygonesModifies} affectation={nouvelle} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onFermer={() => setPleinEcran(null)} afficherReperes={afficherReperes} onAfficherReperes={setAfficherReperes} sourceLibelle={SOURCE_VIVANTE} afficherFutur={afficherFutur} onAfficherFutur={onFuturVue} />
              )}
              {pleinEcran === 'comparer' && aChange && (
                <ComparaisonPleinEcran origine={origine} nouvelle={nouvelle} rougeCleabs={polygonesModifies}
                  nomOrigine={descO.nom} nomNouvelle={NOM_SCHEMA_NOUVELLE} mentionOrigine={descO.mention} mentionNouvelle={mentionN}
                  onFermer={() => setPleinEcran(null)} afficherReperes={afficherReperes} onAfficherReperes={setAfficherReperes} sourceOrigine={sourceOrigine} sourceNouvelle={SOURCE_VIVANTE} afficherFutur={afficherFutur} onAfficherFutur={onFuturVue} />
              )}
            </>
          );
        })()}
        {affErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{affErreur}</div>}
        {/* M5 — aucun dossier (aucun signal détecté) : proposer l'ouverture manuelle de l'arbitrage. */}
        {!detail.persiste && (
          <>
            <OuvertureManuelle motif={motifOuverture} onMotif={setMotifOuverture} onOuvrir={() => void ouvrirManuel()} enCours={enCours} />
            {actionErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{actionErreur}</div>}
          </>
        )}
        {detail.persiste && !estAcheveSansBati && !estClos && (
          <>
            <ActionsRattachement
              resume={comparaison ? resumeValidation({ corps: comparaison.nouvelle.corps, polygones: comparaison.nouvelle.polygones }, cotesEnNombres(cotesEffectives)) : { nbAffectes: 0, nbAvecCote: 0, nbVides: 0, nbNonAffectes: 0 }}
              motifRefus={motifRefus} onMotifRefus={setMotifRefus} enCours={enCours}
              onValider={() => void valider()}
              onRefuser={() => void agir('refuser', { motif: motifRefus })}
              onRetour={() => void agir('retour_lidar')} />
            {/* M8 — accusé de prise en compte PERSISTANT (aria-live), construit depuis la réponse serveur. */}
            {accuse && <AccuseValidation accuse={accuse} />}
            {actionErreur && <div role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>{actionErreur}</div>}
          </>
        )}
        {/* Détail complet du permis rapatrié d'Archives — replié par défaut. */}
        <div>
          <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .4rem' }}
            aria-expanded={permisOuvert} onClick={() => setPermisOuvert((v) => !v)}>
            {permisOuvert ? 'masquer' : 'afficher'} le détail complet du permis et ses pièces jointes {permisOuvert ? '▲' : '▼'}
          </button>
        </div>
        {permisOuvert && (
          <div className="flex flex-col gap-2">
            <CaracteristiquesBloc dossierId={detail.dossierId} onOuvrir={(id, source, page) => void ouvrirPiece(id, source, page)} />
            <div className="svv-card" style={{ fontSize: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: '.3rem' }}>Pièces jointes</div>
              <CellulePieces pieces={detail.pieces} onTelecharger={(id, source) => void telecharger(id, source)} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
        Suivi du rattachement des permis à leur parcelle et à leurs bâtiments futurs. Univers = permis dont les parcelles ont été
        analysées (la parcelle du permis est constituée). Lecture seule.
      </p>
      {/* Réglage : la DAACT (attestation d'achèvement) comme déclencheur. Ouvre un dossier « en attente du bâti » — jamais d'injection. */}
      {daactActif !== null && (
        <label className="svv-card" style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: 12 }}>
          <input type="checkbox" checked={daactActif} onChange={(e) => void basculerDaact(e.target.checked)} style={{ marginTop: '.15rem' }} />
          <span>
            <strong>Ouvrir un dossier dès l’achèvement déclaré (DAACT)</strong> — quand un permis passe « Terminé », un dossier de
            rattachement est créé, en attente du bâti dans BD TOPO. Il ouvre l’arbitrage, il ne l’injecte jamais : aucune altitude
            n’est écrite automatiquement. Décochez pour n’utiliser que les signaux cadastre / BD TOPO.
          </span>
        </label>
      )}
      {/* L7 — le détail est rendu par TableSuivi DANS LE FLUX, juste sous la ligne ouverte (trame grise), plus en bas de page. */}
      <TableSuivi lignes={liste.lignes} compteurs={liste.compteurs} ouvert={ouvert} onOuvrir={(id) => setOuvert(id === ouvert ? null : id)} renderDetail={renderDetail} />
    </div>
  );
}
