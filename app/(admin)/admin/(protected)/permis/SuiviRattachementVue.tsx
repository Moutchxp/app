'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
// ⚠️ Bundle client : uniquement des TYPES depuis les modules serveur.
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { ModePassageRattachement } from '../../../../lib/permis/rattachementConfig';
import type { ComparaisonRattachement } from '../../../../lib/permis/affectationRepo';
import { recopierCote, cotesEnNombres, type ActionAffectation } from '../../../../lib/permis/affectationSchema';
import { TableSuivi, PanneauRechercheSuivi, FILTRE_SUIVI_VIDE, filtreSuiviActif, DetailSuiviRendu, AffectationBloc, EnteteAffectation, LegendeAffectation, ActionsRattachement, SaisieCotesInjection, OuvertureManuelle, BandeauOuvertureManuelle, ClotureAcheveSansBati, AccuseValidation, resumeValidation, composerAccuse, SchemaPleinEcran, ComparaisonPleinEcran, InterrupteurReperes, InterrupteurFuturBati, InterrupteurProjection, estFuturBati, descriptionSchemaOrigine, descriptionSchemaNouvelle, NOM_SCHEMA_NOUVELLE, STYLE_BTN_RATT, type AccuseValidationData, type EmpriseProjetee, type FiltreSuiviValeurs } from './SuiviRattachementRendu'; // LOT 3 — STYLE_BTN_RATT : gabarit COMMUN des boutons d'action (homogénéité)
import { RecapProjectionRattachement } from './ProjectionRecapRattachement';
// RATT-1 bis — le geste « statuer les polygones existants » réutilise le composant PUR d'Analyse + ses helpers (jamais dupliqué).
import { BlocProjetRepliable, BlocExistantsRepliable, PanneauRattrapage, attribuerReperes, MiniConfigProjetee, CaseConfigOfficielle } from './TraceEmpriseRendu';
import { apercuRattrapage } from '../../../../lib/permis/rattrapage'; // NOM-2 — aperçu PUR du rattrapage (client, aucune requête)
import { resolveurNomEmprise } from '../../../../lib/permis/nomCorps'; // NOM-3 — nom DISTINCT par emprise (repère du corps + « (numéro) »)
import { statutCourantParCleabs, type LigneStatutPolygone, type PolygoneRecouvert } from '../../../../lib/permis/polygoneStatut';
// TYPES seuls (modules serveur / purs) — pour le récap de projection (PROJ-4a), affichage pur.
import type { EmpriseReconstruite, PolygoneBdTopo } from '../../../../lib/permis/empriseReconstruiteRepo';
import type { PointLambert } from '../../../../lib/permis/calageEmprise';

// L11 — libellés de SOURCE des bulles (constat AVANT travaux). L'origine figée lit le SNAPSHOT ; sinon (et la nouvelle) la couche vivante.
const SOURCE_GEL = 'au moment du gel (état des lieux figé)';
const SOURCE_VIVANTE = 'état actuel (couche BD TOPO)';
import { FichePermisBlocs } from './FichePermisBlocs'; // RATT-EDIT (lot 2) — fiche PARTAGÉE des 6 blocs (mode='rattachement') : Caractéristiques, éditeur d'emprise (déverrouillé) et pièces y vivent désormais (plus de CaracteristiquesBloc/BlocTraceEmprise/CellulePieces à plat)
import { BandeauModificationValidation, PopUpConfirmerModification, PopUpConfirmerRevalidation, PopUpConfirmerRestauration } from './ModifierValidation'; // RATT-EDIT (lot B2/B3/C1) — verrou + pop-up 1 (modifier) + pop-up 2 (revalider) + pop-up 3 (restaurer)
import type { VersionRestaurable } from '../../../../lib/permis/restaurationGel'; // RATT-EDIT (lot C1) — TYPE seul (module serveur) : versions de gel restaurables
import { recompterSiSucces } from './comptesActions';

/** RATT-EDIT (lot C1) — libellé lisible d'une version de gel restaurable (type + date + auteur en clair), pour le sélecteur et la pop-up 3. */
function libelleVersionRestaurable(v: VersionRestaurable): string {
  const type = v.type === 'validation_initiale' ? "Validation d’origine" : v.type === 'revalidation' ? 'Revalidation' : v.type === 'restauration' ? 'Restauration' : 'Version';
  const date = new Date(v.dateIso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${type} du ${date}${v.auteurNom ? ` par ${v.auteurNom}` : ''}`;
}

/**
 * FUS-3c — onglet SUIVI DU RATTACHEMENT : au clic sur un permis, TOUT le contenu de décision est sur la même page — détail
 * comparatif « trois sources », Street View, ET le détail complet du permis (caractéristiques, bâtiments, altitudes, parcelles,
 * pièces jointes CONSULTABLES). RATT-EDIT (lot 2) — ce détail est désormais la FICHE PARTAGÉE `FichePermisBlocs` (mode='rattachement',
 * les 6 mêmes lignes qu'Analyse), ouverte par deux gros boutons « Consulter » (lecture seule) / « Modifier » (pop-up 1 → édition), qui
 * remplacent l'ancien pli et le bandeau B2 verrouillé. FUS-3d ajoute l'AFFECTATION des polygones BD TOPO aux corps (schéma + sélecteurs)
 * — SEULE écriture directe ici ; toujours AUCUN bouton valider/refuser, AUCUNE injection d'altitude (FUS-3e). Les pièces sont
 * téléchargeables mais ni supprimables ni ajoutables ici (ça reste dans Archives).
 */
export function SuiviRattachementVue({ vue = 'rattachement', onRecompter, peutModifierPermis = false }: { vue?: 'rattachement' | 'surveillance'; onRecompter?: () => void; peutModifierPermis?: boolean } = {}) {
  const estSurveillance = vue === 'surveillance'; // « Sous surveillance » = le radar (permis suivis, aucun signal) + recherche ; « Rattachement » = le TRAVAIL (arbitrages à faire)
  const [liste, setListe] = useState<{ lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> } | null>(null);
  const [modePassage, setModePassage] = useState<ModePassageRattachement>('automatique'); // COMPLÉMENT — réglage lu du serveur, gouverne l'appartenance à Rattachement (TableSuivi)
  // RECHERCHE (les 6 critères) — FILTRAGE EN BASE + pagination. `resultats` non nul = mode recherche ; null = liste complète par défaut.
  const [filtre, setFiltre] = useState<FiltreSuiviValeurs>(FILTRE_SUIVI_VIDE);
  const [resultats, setResultats] = useState<{ lignes: LigneSuivi[]; total: number; page: number; nbPages: number } | null>(null);
  const [chargeRecherche, setChargeRecherche] = useState(false);
  const [rechercheErreur, setRechercheErreur] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState(false); // ④ — panneau de recherche REPLIÉ par défaut (rouvrir conserve les critères saisis, `filtre` est indépendant de l'ouverture)
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
  // RATT-EDIT (lot B2) — VERROU d'édition d'une validation : altitude + emprise en LECTURE SEULE par défaut pour TOUT LE MONDE (admin compris) ;
  //   « Modifier » + pop-up 1 déverrouillent. Réinitialisés à chaque changement de dossier (jamais un verrou ouvert hérité d'un autre permis).
  const [modifOuverte, setModifOuverte] = useState(false); // édition déverrouillée ?
  const [popupModif, setPopupModif] = useState(false);     // pop-up 1 (confirmation avant d'ouvrir la modification) visible ?
  // RATT-EDIT (lot B3) — REVALIDATION : pop-up 2 + état d'envoi + accusé/erreur. Le marqueur « modifié, à revalider » vient du SERVEUR (detail).
  const [popupReval, setPopupReval] = useState(false);
  const [revalEnCours, setRevalEnCours] = useState(false);
  const [revalMsg, setRevalMsg] = useState('');
  // RATT-EDIT (lot C1) — RESTAURATION : version choisie (null = défaut = validation d'origine), pop-up 3, envoi, message.
  const [versionRestauId, setVersionRestauId] = useState<number | null>(null);
  const [popupRestau, setPopupRestau] = useState(false);
  const [restauEnCours, setRestauEnCours] = useState(false);
  const [restauMsg, setRestauMsg] = useState('');
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
  const [recapProjection, setRecapProjection] = useState<{ emprises: EmpriseReconstruite[]; parcelle: PointLambert[][]; polygones: PolygoneBdTopo[]; batiments: { corpsId: number; repere: string | null; nomRepli?: string | null; altitudeSommetNgf?: number | null }[] } | null>(null); // LOT 80 — batiments porte nomRepli + altitude validée pour la légende par polygone
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
        if (res.ok) { const d = (await res.json()) as { lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number>; daactActif?: boolean; modePassage?: ModePassageRattachement }; setListe({ lignes: d.lignes, compteurs: d.compteurs }); setDaactActif(d.daactActif ?? null); setModePassage(d.modePassage === 'cloture_manuelle' ? 'cloture_manuelle' : 'automatique'); }
        else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  // RECHERCHE — FILTRAGE EN BASE + pagination. Combine les 6 critères ; `total` reflète le FILTRE en cours. À la soumission (jamais par frappe).
  const chercher = useCallback(async (page = 1): Promise<void> => {
    if (!filtreSuiviActif(filtre)) { setResultats(null); return; }
    setChargeRecherche(true); setRechercheErreur(false); setOuvert(null);
    const p = new URLSearchParams();
    if (filtre.num.trim()) p.set('num', filtre.num.trim());
    if (filtre.interne.trim()) p.set('interne', filtre.interne.trim());
    if (filtre.commune.trim()) p.set('commune', filtre.commune.trim());
    if (filtre.type) p.set('type', filtre.type);
    if (filtre.autorDe) p.set('autorDe', filtre.autorDe);
    if (filtre.autorA) p.set('autorA', filtre.autorA);
    if (filtre.entreeDe) p.set('entreeDe', filtre.entreeDe);
    if (filtre.entreeA) p.set('entreeA', filtre.entreeA);
    p.set('page', String(page));
    try {
      const res = await fetch(`/api/admin/permis/rattachement?${p.toString()}`, { cache: 'no-store' });
      if (res.ok) { const d = (await res.json()) as { lignes: LigneSuivi[]; total: number; page: number; nbPages: number }; setResultats({ lignes: d.lignes, total: d.total, page: d.page, nbPages: d.nbPages }); }
      else setRechercheErreur(true);
    } catch { setRechercheErreur(true); }
    finally { setChargeRecherche(false); }
  }, [filtre]);
  const reinitialiser = useCallback((): void => { setFiltre(FILTRE_SUIVI_VIDE); setResultats(null); setRechercheErreur(false); setOuvert(null); }, []);

  // RATT-1 bis — APPLIQUE une réponse du GET emprise à l'état (SOURCE UNIQUE : emprises projetées + récap + statuts + recouverts).
  //   Partagé par le chargement du dossier ET le rafraîchissement après un statut posé (pas d'état local divergent). PROJ-2c/4a inchangés.
  type ReponseEmprise = { emprises?: EmpriseReconstruite[]; batiments?: { corpsId: number; repere: string | null; nomRepli?: string | null; altitudeSommetNgf?: number | null }[]; contexte?: { empreinteAnneaux?: PointLambert[][] }; polygones?: PolygoneBdTopo[]; statutsPolygones?: LigneStatutPolygone[]; polygonesRecouverts?: PolygoneRecouvert[] };
  const appliquerEmprise = useCallback((je: ReponseEmprise) => {
    const emprises = je.emprises ?? [];
    const nomE = resolveurNomEmprise(je.batiments ?? [], emprises); // NOM-3 — même nom DISTINCT qu'à l'écran de projection (repère + « (numéro) »)
    setEmprisesProjetees(emprises.filter((e) => e.anneau.length >= 3).map((e) => ({ id: e.id, libelle: nomE(e), anneau: e.anneau.map((p) => [p.x, p.y] as [number, number]) })));
    setRecapProjection({ emprises, parcelle: je.contexte?.empreinteAnneaux ?? [], polygones: je.polygones ?? [], batiments: je.batiments ?? [] });
    setStatutsLignes(je.statutsPolygones ?? []); // RATT-1 bis — champs auparavant IGNORÉS de la même réponse
    setRecouverts(je.polygonesRecouverts ?? []);
  }, []);

  useEffect(() => {
    if (ouvert === null) return; // détail masqué au rendu quand ouvert === null (pas de setState synchrone ici)
    let annule = false;
    void (async () => {
      setDetail(null); setComparaison(null); setDetailErreur(false); setAffErreur(''); setPermisOuvert(false); setPleinEcran(null);
      setModifOuverte(false); setPopupModif(false); // B2 — un nouveau dossier s'ouvre TOUJOURS verrouillé (lecture seule), pop-up fermée
      setPopupReval(false); setRevalEnCours(false); setRevalMsg(''); // B3 — reset de la revalidation à chaque changement de dossier
      setVersionRestauId(null); setPopupRestau(false); setRestauEnCours(false); setRestauMsg(''); // C1 — reset de la restauration à chaque changement de dossier
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
  const statuerPolygone = useCallback(async (cleabs: string, statut: 'preserve' | 'detruit' | 'mixte' | 'revoque') => {
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

  // B3 — REVALIDER un permis modifié après validation, EN PLACE. POST 'revalider' → nouvelle version de gel (nouvelle référence) ; le SERVEUR
  //   renvoie le détail recalculé (modifieDepuisValidation = false → marqueur effacé). Refus 409 si un corps n'est pas enregistré (garde Lot 1).
  //   Ne change PAS l'état : le permis reste dans Rattachement. 401 = session expirée (jamais « panne »).
  const revalider = useCallback(async (): Promise<void> => {
    if (ouvert === null) return;
    setRevalEnCours(true); setRevalMsg('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revalider', dossierId: ouvert }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; detail?: DetailSuivi; comparaison?: ComparaisonRattachement | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);            // détail à jour → modifieDepuisValidation = false (marqueur effacé, sans rechargement)
        if (d.comparaison !== undefined) setComparaison(d.comparaison ?? null);
        setPopupReval(false); setModifOuverte(false); // revalidé → on referme l'édition ; retour en lecture seule, sans marqueur
        setRevalMsg('Permis revalidé — nouvelle validation de référence enregistrée (la précédente est conservée).');
        recompterSiSucces(true, onRecompter);
      } else {
        setRevalMsg(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'Revalidation impossible.'));
        setPopupReval(false); // referme la pop-up ; le message d'erreur reste affiché dans le détail
      }
    } catch { setRevalMsg('Revalidation impossible.'); setPopupReval(false); }
    finally { setRevalEnCours(false); }
  }, [ouvert, onRecompter]);

  // C1 — RESTAURER une version de gel choisie : POST 'restaurer' {gelId} → réécrit corps/emprises (recrée les supprimés), appende une version
  //   'restauration:' + événement, laisse le permis « à revalider » (marqueur B3). Le serveur renvoie le détail à jour (versions + marqueur).
  const restaurer = useCallback(async (gelId: number): Promise<void> => {
    if (ouvert === null) return;
    setRestauEnCours(true); setRestauMsg('');
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restaurer', dossierId: ouvert, gelId }) });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; nbCorps?: number; nbEmprises?: number; detail?: DetailSuivi; comparaison?: ComparaisonRattachement | null };
      if (res.ok && d.ok) {
        if (d.detail) setDetail(d.detail);             // détail à jour : marqueur « à revalider » ON, versions restaurables mises à jour
        if (d.comparaison !== undefined) setComparaison(d.comparaison ?? null);
        setPopupRestau(false); setModifOuverte(false); setVersionRestauId(null);
        setRestauMsg(`Validation d’origine restaurée — ${d.nbCorps ?? 0} bâtiment(s) et ${d.nbEmprises ?? 0} emprise(s) rétablis. Le permis est à revalider ; les versions précédentes restent consultables.`);
        recompterSiSucces(true, onRecompter);
      } else {
        setRestauMsg(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'Restauration impossible.'));
        setPopupRestau(false);
      }
    } catch { setRestauMsg('Restauration impossible.'); setPopupRestau(false); }
    finally { setRestauEnCours(false); }
  }, [ouvert, onRecompter]);

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

  // Réglage GLOBAL : la DAACT (achèvement déclaré) déclenche-t-elle l'ouverture d'un dossier de rattachement ?
  const basculerDaact = useCallback(async (actif: boolean): Promise<void> => {
    setDaactActif(actif); // optimiste
    try {
      const res = await fetch('/api/admin/permis/rattachement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reglage_daact', actif }) });
      if (!res.ok) setDaactActif(!actif); // rétablissement sur échec
    } catch { setDaactActif(!actif); }
  }, []);
  // RATT-EDIT (lot 2) — le téléchargement / l'ouverture des pièces (telecharger, ouvrirPiece) vivent désormais DANS FichePermisBlocs (bloc
  //   « Pièces du permis », MÊME signeur url_piece de /reponses ; la clé ne transite jamais) : le parent n'a plus à les porter.

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
              {/* AFF-5 — l'en-tête de SECTION titre la RANGÉE entière (sorti de la case de gauche) → les trois schémas démarrent à la même hauteur. */}
              <EnteteAffectation />
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
                  <AffectationBloc affectation={origine} titre={descO.nom} mention={descO.mention} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onAgrandir={() => setPleinEcran('origine')} afficherReperes={afficherReperes} sourceLibelle={sourceOrigine} afficherFutur={afficherFutur} cleabsMisEnAvant={cleabsMisEnAvant} emprisesProjetees={afficherProjection ? emprisesProjetees : []} sansLegende sansEntete />
                </div>
                {/* RATT-3 — à droite de « Configuration d'origine » : la configuration PROJETÉE (parcelle après travaux, détruits retirés,
                    emprise en rouge, aucun vert/orange) puis l'emplacement « Configuration officielle » (grisé, en attente de l'administration).
                    Données déjà en mémoire (recapProjection + statutParCleabs, GET emprise) — aucune requête supplémentaire. */}
                {/* AFF-2 (3b/3c) — projetée dessinée au MÊME cadre/échelle que « Configuration d'origine » (même origine.schema). */}
                {/* AFF-5 — même conteneur (svv-card) que la case de gauche → même ordonnée de départ du schéma dans les trois. */}
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                    <MiniConfigProjetee schema={origine.schema} statuts={statutParCleabs} emprises={emprisesProjetees} />
                  </div>
                </div>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                    <CaseConfigOfficielle millesime={origine.millesimeGel} />
                  </div>
                </div>
                {aChange && (
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <AffectationBloc affectation={nouvelle} titre={NOM_SCHEMA_NOUVELLE} mention={mentionN} rougeCleabs={polygonesModifies} persiste={persiste} enAttenteBati={enAtt} onAffecter={affecterCb} onAgrandir={() => setPleinEcran('nouvelle')} afficherReperes={afficherReperes} sourceLibelle={SOURCE_VIVANTE} afficherFutur={afficherFutur} cleabsMisEnAvant={cleabsMisEnAvant} sansLegende sansEntete />
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
                  <button type="button" className="svv-btn svv-btn-outline" style={{ ...STYLE_BTN_RATT, width: 'auto' }} onClick={() => setPleinEcran('comparer')}>Comparer les schémas ⤢</button>
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
        {/* RATT-EDIT (lot 2) — DEUX gros boutons (même taille, côte à côte sur ordinateur, empilés sur iPhone via flex-wrap) qui REMPLACENT le
            pli « afficher le détail complet » ET le bandeau B2 verrouillé « Ce permis est validé… Modifier ». Forme cible du lot 3 (svv-btn-outline
            / svv-btn-primary). « Modifier » est ABSENT (pas grisé) sans la capacité peutModifierPermis. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ ...STYLE_BTN_RATT, flex: '1 1 16rem' }}
            aria-expanded={permisOuvert && !modifOuverte} onClick={() => { setPermisOuvert(true); setModifOuverte(false); }}>
            Consulter les caractéristiques du permis validé
          </button>
          {peutModifierPermis && (
            <button type="button" className="svv-btn svv-btn-primary" style={{ ...STYLE_BTN_RATT, flex: '1 1 16rem' }}
              aria-expanded={modifOuverte} onClick={() => setPopupModif(true)}>
              Modifier les caractéristiques du permis validé
            </button>
          )}
        </div>
        {permisOuvert && (
          <div className="flex flex-col gap-2">
            {/* B2 — bandeau « Modification en cours — non revalidée » + « Verrouiller », UNIQUEMENT en édition (l'état VERROUILLÉ / lecture seule est
                désormais porté par les deux boutons ci-dessus — plus de bandeau « Ce permis est validé… Modifier »). Le permis NE redescend PAS
                en Analyse (aucune action de rattachement déclenchée). */}
            {modifOuverte && (
              <BandeauModificationValidation modifOuverte={modifOuverte} peutModifier={peutModifierPermis}
                onDemander={() => setPopupModif(true)} onVerrouiller={() => setModifOuverte(false)} />
            )}
            {/* B3 — MARQUEUR PERSISTANT (fait SERVEUR, survit au rechargement, vaut pour tout utilisateur) : ce permis a été modifié après sa
                validation et n'est pas encore revalidé. Visible SANS déplier (bannière en tête + badge sur la ligne fermée). En édition, le
                bandeau B2 « modification en cours » couvre déjà ce message → on n'affiche celui-ci qu'en lecture seule (évite le doublon). */}
            {detail.modifieDepuisValidation && !modifOuverte && (
              <div role="status" className="svv-card" style={{ fontSize: 13, borderColor: 'var(--color-svv-red)' }}>
                <strong style={{ color: 'var(--color-svv-red)' }}>⚠ Modifié après validation, non revalidé.</strong>{' '}
                {(() => {
                  const t = detail.derniereModif;
                  const qui = t?.parNom ? ` par ${t.parNom}` : '';
                  const quand = t?.le ? ` le ${new Date(t.le).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
                  return `L’altitude ou l’emprise a été modifiée${qui}${quand}. Revalidez pour en faire la nouvelle validation de référence.`;
                })()}
              </div>
            )}
            {/* B3 — REVALIDER (gaté par la capacité) : disponible dès qu'il y a quelque chose à revalider (édition en cours OU marqueur serveur).
                La revalidation N'injecte PAS d'altitude et ne change PAS l'état : le permis reste dans Rattachement. Garde Lot 1 côté serveur. */}
            {peutModifierPermis && (modifOuverte || detail.modifieDepuisValidation) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
                {/* LOT 3 — action PRINCIPALE du bloc B3 : bouton PLEIN (svv-btn-primary), pleine largeur, gabarit commun. */}
                <button type="button" className="svv-btn svv-btn-primary" style={STYLE_BTN_RATT}
                  disabled={revalEnCours} onClick={() => setPopupReval(true)}>Revalider ce permis</button>
              </div>
            )}
            {revalMsg && <div role="status" aria-live="polite" style={{ fontSize: 12, color: revalMsg.startsWith('Permis revalidé') ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)', fontWeight: 600 }}>{revalMsg}</div>}
            {/* C1 — RESTAURER la validation d'origine (gaté par la capacité). AUCUNE version restaurable (cas majoritaire du stock actuel) →
                message honnête, jamais un bouton qui échoue. Sinon : sélecteur (si plusieurs versions) + bouton → pop-up 3. */}
            {peutModifierPermis && (
              <div className="svv-card" style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
                {detail.versionsRestaurables.length === 0 ? (
                  <span style={{ color: 'var(--color-svv-muted)' }}>Aucune validation d’origine enregistrée pour ce permis — rien à restaurer.</span>
                ) : (() => {
                  const versions = detail.versionsRestaurables;
                  const parDefaut = versions.find((v) => v.type === 'validation_initiale') ?? versions[0];
                  const gelIdSel = versionRestauId ?? parDefaut.gelId;
                  return (
                    <>
                      <span style={{ minWidth: 0 }}>Restaurer une validation d’origine :</span>
                      {versions.length > 1 ? (
                        <select value={gelIdSel} onChange={(e) => setVersionRestauId(Number(e.target.value))} aria-label="Version à restaurer"
                          style={{ minHeight: 44, padding: '.35rem .5rem', border: '1px solid var(--color-svv-line-strong)', borderRadius: '.45rem', fontSize: 13, minWidth: 0, flex: '1 1 14rem', maxWidth: '100%', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)' }}>
                          {versions.map((v) => <option key={v.gelId} value={v.gelId}>{libelleVersionRestaurable(v)}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: 'var(--color-svv-muted)' }}>{libelleVersionRestaurable(versions[0])}</span>
                      )}
                      <button type="button" className="svv-btn svv-btn-outline" style={{ ...STYLE_BTN_RATT, width: 'auto' }}
                        disabled={restauEnCours} onClick={() => setPopupRestau(true)}>Restaurer la validation d’origine</button>
                    </>
                  );
                })()}
              </div>
            )}
            {restauMsg && <div role="status" aria-live="polite" style={{ fontSize: 12, color: restauMsg.startsWith('Validation') ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)', fontWeight: 600 }}>{restauMsg}</div>}
            {/* RATT-EDIT (lot 2) — FICHE PARTAGÉE : les 6 lignes d'Analyse (Complétude · Historique · Caractéristiques du permis (saisie) avec sa
                ligne mère et ses 4 sous-lignes surélevées · Bâtiments et projection · Planche cadastrale · Pièces du permis). `edition={modifOuverte}`
                → LECTURE SEULE par défaut pour tous (altitude/CaracteristiquesBloc, planche cadastrale et éditeur d'emprise ne s'éditent qu'après
                « Modifier »). AUCUNE des 4 actions propres à Analyse (valider/envoyer en Rattachement, terminer l'analyse, renvoyer En cours,
                auto-analyse) n'y est montée. Les pièces (BlocPiecesPermis) affichent la MÊME source qu'avant (listerPiecesDossier + CellulePieces :
                provenance et « a servi à remplir N champs » conservés). En consultation, le bloc « Bâtiments et projection » renvoie au comparatif
                « trois sources » ci-dessus (l'éditeur pdf.js n'est chargé qu'en modification — on garde les deux vues). */}
            <FichePermisBlocs mode="rattachement" edition={modifOuverte} dossierId={detail.dossierId}
              empriseConsultation={
                <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>
                  L’emprise des bâtiments est consultable dans le comparatif « trois sources » ci-dessus. Cliquez sur « Modifier les
                  caractéristiques du permis validé » pour l’éditer.
                </div>
              } />
          </div>
        )}
        {/* B2 — POP-UP 1 : confirmation AVANT d'ouvrir la modification d'une validation précédente. Confirmer → déverrouille ; Annuler → rien
            n'est déverrouillé. (La date/l'auteur de validation ne sont pas exposés au client dans ce lot → message générique honnête.) */}
        {popupModif && (
          <PopUpConfirmerModification
            onConfirmer={() => { setModifOuverte(true); setPopupModif(false); setPermisOuvert(true); }}
            onAnnuler={() => setPopupModif(false)} />
        )}
        {/* B3 — POP-UP 2 : confirmation AVANT de revalider. Dit ce qui sera enregistré (nouvelle référence) + que la précédente est conservée. */}
        {popupReval && (
          <PopUpConfirmerRevalidation
            modifieParNom={detail.derniereModif?.parNom ?? null} modifieLe={detail.derniereModif?.le ?? null}
            enCours={revalEnCours} onConfirmer={() => void revalider()} onAnnuler={() => setPopupReval(false)} />
        )}
        {/* C1 — POP-UP 3 : confirmation AVANT de restaurer. Dit ce qui est remplacé, par quelle version, que les supprimés sont recréés et que rien n'est effacé. */}
        {popupRestau && detail.versionsRestaurables.length > 0 && (() => {
          const versions = detail.versionsRestaurables;
          const parDefaut = versions.find((v) => v.type === 'validation_initiale') ?? versions[0];
          const choisie = versions.find((v) => v.gelId === (versionRestauId ?? parDefaut.gelId)) ?? parDefaut;
          return (
            <PopUpConfirmerRestauration versionLabel={libelleVersionRestaurable(choisie)} enCours={restauEnCours}
              onConfirmer={() => void restaurer(choisie.gelId)} onAnnuler={() => setPopupRestau(false)} />
          );
        })()}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
        {estSurveillance
          ? 'Sous surveillance : les permis SUIVIS et NON encore INSTRUITS (toutes leurs altitudes et emprises ne sont pas validées). Aucune décision à prendre ici — dès qu’un permis est entièrement validé, il quitte cette liste pour « Rattachement ». Utilisez la recherche pour retrouver un permis. Lecture seule.'
          : 'Rattachement : les permis ENTIÈREMENT VALIDÉS (toutes les altitudes de sommet ET toutes les emprises des bâtiments). Deux catégories, sans changer d’onglet : « Rattachement à faire » (un changement BD TOPO est détecté → décision attendue, en tête) et « Validés — en attente du signal de mise à jour » (en veille, en dessous). Lecture seule.'}
      </p>
      {/* Réglage : la DAACT (attestation d'achèvement) comme déclencheur. Réglage du TRAVAIL de rattachement → seulement sur « Rattachement ». */}
      {!estSurveillance && daactActif !== null && (
        <label className="svv-card" style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: 12 }}>
          <input type="checkbox" checked={daactActif} onChange={(e) => void basculerDaact(e.target.checked)} style={{ marginTop: '.15rem' }} />
          <span>
            <strong>Ouvrir un dossier dès l’achèvement déclaré (DAACT)</strong> — quand un permis passe « Terminé », un dossier de
            rattachement est créé, en attente du bâti dans BD TOPO. Il ouvre l’arbitrage, il ne l’injecte jamais : aucune altitude
            n’est écrite automatiquement. Décochez pour n’utiliser que les signaux cadastre / BD TOPO.
          </span>
        </label>
      )}
      {/* ④ RECHERCHE — UNIQUEMENT « Sous surveillance ». Patron repliable (comme le 3e groupe / le détail complet) : FERMÉ par défaut pour
          libérer le haut de l'écran. Fermé, il SIGNALE qu'un filtre tourne (nombre de résultats ou de critères) → jamais une liste courte
          inexpliquée. Rouvrir conserve les critères (`filtre` est indépendant de l'ouverture). */}
      {estSurveillance && (() => {
        const nbCriteres = Object.values(filtre).filter((x) => x.trim() !== '').length;
        const filtreActif = nbCriteres > 0;
        const resume = resultats !== null
          ? `${resultats.total} résultat${resultats.total > 1 ? 's' : ''}`
          : `${nbCriteres} critère${nbCriteres > 1 ? 's' : ''} actif${nbCriteres > 1 ? 's' : ''}`;
        return (
          <div className="svv-card" style={{ padding: '.5rem' }}>
            <button type="button" aria-expanded={rechercheOuverte} aria-controls="panneau-recherche-suivi" onClick={() => setRechercheOuverte((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '.4rem', width: '100%', minHeight: 40, textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-svv-ink)' }}>
              <span aria-hidden style={{ color: 'var(--color-svv-muted)', flexShrink: 0 }}>{rechercheOuverte ? '▾' : '▸'}</span>
              <span aria-hidden>🔍</span>
              <span style={{ flex: 1, minWidth: 0 }}>Rechercher dans les permis suivis</span>
              {!rechercheOuverte && filtreActif && (
                <span style={{ flexShrink: 0, background: 'var(--color-svv-red)', color: '#fff', fontWeight: 700, fontSize: 11, borderRadius: '.4rem', padding: '.1rem .4rem' }}>filtre actif · {resume}</span>
              )}
            </button>
            {rechercheOuverte && (
              <div id="panneau-recherche-suivi" style={{ marginTop: '.5rem' }}>
                <PanneauRechercheSuivi valeurs={filtre} onValeurs={setFiltre} onChercher={() => void chercher(1)} onReset={reinitialiser} chargement={chargeRecherche} />
              </div>
            )}
          </div>
        );
      })()}
      {(!estSurveillance || resultats === null) ? (
        /* L7 — le détail est rendu par TableSuivi DANS LE FLUX, juste sous la ligne ouverte. `vue` filtre les groupes affichés (travail vs radar). */
        <TableSuivi vue={vue} modePassage={modePassage} lignes={liste.lignes} compteurs={liste.compteurs} ouvert={ouvert} onOuvrir={(id) => setOuvert(id === ouvert ? null : id)} renderDetail={renderDetail} />
      ) : (
        <div className="flex flex-col gap-2" aria-live="polite">
          {rechercheErreur ? (
            <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Recherche indisponible.</div>
          ) : resultats.total === 0 ? (
            <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Aucun permis suivi ne correspond à ces critères. Élargissez la recherche ou réinitialisez.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{resultats.total} résultat{resultats.total > 1 ? 's' : ''} pour ce filtre <span style={{ color: 'var(--color-svv-muted)', fontWeight: 400 }}>· page {resultats.page} / {resultats.nbPages}</span></div>
              <TableSuivi plat lignes={resultats.lignes} ouvert={ouvert} onOuvrir={(id) => setOuvert(id === ouvert ? null : id)} renderDetail={renderDetail} />
              {resultats.nbPages > 1 && (
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="svv-btn svv-btn-outline" style={{ ...STYLE_BTN_RATT, width: 'auto' }} disabled={chargeRecherche || resultats.page <= 1} onClick={() => void chercher(resultats.page - 1)}>‹ Précédent</button>
                  <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>page {resultats.page} / {resultats.nbPages}</span>
                  <button type="button" className="svv-btn svv-btn-outline" style={{ ...STYLE_BTN_RATT, width: 'auto' }} disabled={chargeRecherche || resultats.page >= resultats.nbPages} onClick={() => void chercher(resultats.page + 1)}>Suivant ›</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
