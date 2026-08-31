'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ETIQUETTE_PROFIL, type ProfilDemandeur } from '../../../../lib/sitadel/demande';
import type { DemandeListe, DemandeDetail, AlerteIdentite } from '../../../../lib/sitadel/demandeRepo';
import { type Tri, type Perimetre, filtrerDemandes, trierDemandes, basculerTri, OPTIONS_TRI, cleTri, triDepuisCle, dansPerimetre, statutsDuPerimetre, statutsVivants, statutsMorts, statutsAffiches, partitionnerParDus, visiblesEnCours, partitionnerAnnulationMasse, CHOIX_STATUT_DEFAUT, categorieEnCours, CATEGORIE_EN_COURS_LIBELLE } from '../../../../lib/sitadel/demandesListe';
import { dansProcess, horsProcess, PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import { MessageRetour, repartirRetour, FiltreTypes, TableDemandes, PanneauDetailDemande, MentionMasquage, etatRetourMairie, libelleRetourMairie, BlocContactMairie, DecompteDelai, STATUT_LIBELLE, type RetourAction } from './DemandesRendu';
// T6-A — « En cours » réutilise les composants PURS de « Réponses » (compte à rebours + 7 actions), la SOURCE UNIQUE de la donnée
//   riche (chargerDemandesSuivi via /en-cours) et le calcul d'échéance INTOUCHÉ (etatEcheance). Aucun de ces imports n'affecte « À demander ».
import { DetailDossiers, ActionsCloture, BlocLiens, BlocAlertesGed, BlocMessagesAutre, BlocPiecesReponses, demandeADuRetour, formaterDate, type RetourCible } from './ReponsesRendu';
import { decompteButoirCada, ordinalRelance, type Decompte } from '../../../../lib/veille/decompteButoir'; // LOT-8 B/C : décompte butoir + grade cascade partielle
import { statutCascade, prochaineEtape, libelleCourtCascade, type EnvoiAutoInfos } from '../../../../lib/veille/statutCascade';
import { libelleSuspension, dateButoirPartiel, libelleDelaiProlonge } from '../../../../lib/permis/dossierPartiel'; // CASC-1/CASC-2 : suspension + délai CADA prolongé (dossier partiel)
import { RefMairieCellule } from './RefMairieCellule';
// UNIF-1 — encart de familles (socle UNIF-0) + les 4 blocs PER-PERMIS réutilisés depuis « Analyse » (chargés paresseusement au dépliage).
import { EncartFamilles, SousSectionsPermis } from './EncartFamilles';
import { BlocFilEchanges } from './BlocFilEchanges'; // LOT-4 — même fil d'échanges mail qu'en Analyse/Archives
import { SousBlocRepliable } from './SousBlocRepliable'; // LOT-5 — repli léger (1 clic) du sous-bloc artefacts, sans BlocRepliable imbriqué
import { LIBELLE_FAMILLE } from '../../../../lib/permis/encartFamilles';
import { BlocCompletude } from './BlocCompletude';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { BlocTraceEmprise } from './BlocTraceEmprise';
import { BlocPiecesPermis } from './BlocPiecesPermis';
import { LiseusePieces } from './LiseusePieces';
import { MentionFamillesManquantes, MentionEchanges, FriseSuivi } from './FriseSuiviRendu'; // LOT 13 A / LOT 15 frise / LOT 17-C mention échanges
import { projeterParcours } from '../../../../lib/veille/friseSuivi'; // LOT 18 : projection pure du parcours complet (faits + étapes à venir datées)
import type { ReglagesCascadePartielle } from '../../../../lib/veille/cascadePartielle';
import type { DemandeSuivi, ReglagesReleve } from '../../../../lib/veille/reponsesSuivi';
import type { ReglagesCascade } from '../../../../lib/veille/cascadeRelance';

/**
 * Q6 — tableau des demandes d'UN PÉRIMÈTRE (partagé par « À demander » et « En cours »). Le périmètre est un pré-filtre DUR par
 * statut (`dansPerimetre`) appliqué AVANT le filtre de l'utilisateur : un onglet ne peut JAMAIS afficher les demandes de
 * l'autre, et son sélecteur Statut ne propose QUE ses statuts. Q6b — le DÉFAUT du sélecteur n'est plus « Tous » mais les statuts
 * VIVANTS (à traiter) : les statuts MORTS (annulée, close = trace) sont masqués par défaut pour ne pas noyer les vivantes,
 * MAIS jamais en silence (mention + décompte + « les afficher » = bascule sur « Toutes »). Le PÉRIMÈTRE Q6 est inchangé. Les
 * compteurs comptent CE QUI EST AFFICHÉ. `avecActionsGroupees` (⇒ « à demander ») expose « Passer en prête » / « Annuler la demande » / « Basculer »
 * (elles portent sur des brouillons) ; « en cours » n'en a aucune. Le panneau détail s'ouvre des DEUX côtés. AUCUN envoi ; on
 * change CE QUI EST AFFICHÉ, pas ce qui est permis (les transitions serveur restent inchangées). Le tri, le filtre multi-types
 * et la pagination portent sur l'ENSEMBLE du périmètre, jamais sur la page.
 */
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];
const PAGE_SIZE = 20;
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };

const TEXTES: Record<Perimetre, { intro: string; vide: string }> = {
  a_demander: {
    intro: 'Demandes préparées mais pas encore parties auprès d’une mairie (brouillon, prête). Tant qu’elles ne sont pas envoyées, ce n’est pas une démarche engagée.',
    vide: 'Aucune demande en préparation. Créez-en depuis l’aperçu des lots ci-dessus.',
  },
  en_cours: {
    intro: 'Demandes INITIÉES auprès des mairies, en attente de retour (envoyée, close). L’envoi effectif reste une étape ultérieure.',
    vide: 'Aucune demande en cours. Elles apparaîtront ici une fois initiées (préparez-les dans l’onglet « À demander »).',
  },
};

type Bascule = { ids: number[]; profil: ProfilDemandeur };
interface Props {
  categories: { cle: string; libelle: string; rang: number }[];
  perimetre: Perimetre;
  process: Process; // D2 : process actif du commutateur — SCOPE D'AFFICHAGE (filtre client sur le canal), jamais un WHERE serveur.
  signalRafraichir?: number; // Q6 : incrémenté par le parent (ex. après une création) → force un rechargement de la liste
}

async function erreurServeur(res: Response, repli: string): Promise<string> {
  try { const d = (await res.json()) as { erreur?: string }; return d?.erreur && d.erreur.trim() !== '' ? d.erreur : repli; }
  catch { return repli; }
}

export function SuiviDemandes({ categories, perimetre, process, signalRafraichir = 0 }: Props) {
  const avecActionsGroupees = perimetre === 'a_demander';
  const statutsFiltre = statutsDuPerimetre(perimetre);
  const avecAlertes = statutsFiltre.includes('brouillon'); // alertes d'identité = brouillons → uniquement « à demander »

  const [liste, setListe] = useState<{ demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; referencesIndisponibles?: boolean } | null>(null);
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [corps, setCorps] = useState('');
  const [retour, setRetour] = useState<RetourAction>(null);
  const [version, setVersion] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [choixStatut, setChoixStatut] = useState<string>(CHOIX_STATUT_DEFAUT); // Q6b : défaut = statuts VIVANTS, pas « Tous »
  const [fCommune, setFCommune] = useState('');
  const [fProfil, setFProfil] = useState('');
  const [fTypes, setFTypes] = useState<Set<number>>(new Set());
  const [fReference, setFReference] = useState('');
  const [tri, setTri] = useState<Tri>({ colonne: 'date', sens: 'desc' });
  const [page, setPage] = useState(1);
  const [confBascule, setConfBascule] = useState<Bascule | null>(null);
  // D1 — annulation en masse (brouillons de la VUE filtrée, prêtes exclues) : confirmation EN DEUX TEMPS + compte rendu chiffré.
  type PreteVue = { id: number; reference: string; communeNom: string | null };
  const [confMasse, setConfMasse] = useState<{ etape: 1 | 2; ids: number[]; nbPermis: number; pretes: PreteVue[] } | null>(null);
  const [confPrete, setConfPrete] = useState<PreteVue | null>(null); // geste DÉDIÉ à une demande prête (nommée)
  const [rapportMasse, setRapportMasse] = useState<{ annulees: number; permisLiberes: number; refusees: { reference: string | null; statut: string | null; raison: string }[] } | null>(null);

  // T6-A — « En cours » UNIQUEMENT : donnée riche partagée (source unique `chargerDemandesSuivi` via /en-cours) pour le compte à
  //   rebours (etatEcheance INTOUCHÉ), la colonne « Retour mairie » et les 7 actions du détail. `retourReponse` (cle-based) est le
  //   retour des actions /reponses, DISTINCT de `retour` (zone-based) des actions /demandes. RIEN de ceci n'existe pour « À demander ».
  const enCours = perimetre === 'en_cours';
  const [suivi, setSuivi] = useState<{ parId: Map<number, DemandeSuivi>; derniereOkLe: string | null; reglages: ReglagesReleve; cascade: ReglagesCascade; envoi: EnvoiAutoInfos; partielDelai: { mois: number; jours: number }; reglagesPartiel: ReglagesCascadePartielle } | null>(null);
  const [maintenant, setMaintenant] = useState<Date>(() => new Date());
  const [versionSuivi, setVersionSuivi] = useState(0);
  const [retourReponse, setRetourReponse] = useState<RetourCible>(null);
  const [refus, setRefus] = useState<{ demandeId: number; dossierId: number; date: string } | null>(null); // formulaire « refus mairie » ouvert
  const [retrait, setRetrait] = useState<{ demandeId: number; dossierId: number } | null>(null);            // avertissement « retirer » ouvert
  const [reattach, setReattach] = useState<{ demandeId: number; dossierId: number } | null>(null);          // T1 : confirmation « annuler le retrait » ouverte
  const [motifCloture, setMotifCloture] = useState<Record<number, string>>({});                              // motif de clôture par demande

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);
  const rafraichirSuivi = useCallback(() => setVersionSuivi((v) => v + 1), []);
  const annoncer = useCallback((texte: string, ok: boolean, zone: 'haut' | 'detail' = 'haut') => setRetour(texte === '' ? null : { texte, ok, zone }), []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes', { cache: 'no-store' });
        if (!annule && res.ok) setListe((await res.json()) as { demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; referencesIndisponibles?: boolean });
      } catch { /* liste indisponible */ }
    })();
    return () => { annule = true; };
  }, [version, signalRafraichir]);

  // T6-A — « En cours » : charge la donnée riche (SOURCE UNIQUE partagée avec « Réponses »). Le tableau (liste) reste piloté par
  //   /demandes ; /en-cours ne fournit QUE l'échéance + le retour + les dossiers riches, fusionnés par id. « À demander » ne fetch jamais ceci.
  useEffect(() => {
    if (!enCours) return;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/en-cours', { cache: 'no-store' });
        if (!annule && res.ok) {
          const d = (await res.json()) as { demandes: DemandeSuivi[]; derniereOkLe: string | null; reglages: ReglagesReleve; cascade: ReglagesCascade; envoi: EnvoiAutoInfos; partielDelai: { mois: number; jours: number }; reglagesPartiel: ReglagesCascadePartielle };
          setSuivi({ parId: new Map(d.demandes.map((x) => [x.demandeId, x])), derniereOkLe: d.derniereOkLe, reglages: d.reglages, cascade: d.cascade, envoi: d.envoi, partielDelai: d.partielDelai ?? { mois: 1, jours: 4 }, reglagesPartiel: d.reglagesPartiel ?? { relanceJours: 10, nbRelancesAvantAnnonce: 2, annonceJours: 10, saisineJours: 4 } });
          setMaintenant(new Date());
        }
      } catch { /* suivi indisponible : le tableau reste, sans compte à rebours (jamais un écran vide) */ }
    })();
    return () => { annule = true; };
  }, [enCours, version, versionSuivi, signalRafraichir]);

  // LOT-8 (B) — DÉCOMPTE en jours par demande, calculé UNE FOIS. `decompteButoirCada` choisit la date qui FAIT FOI (butoir PARTIEL
  //   prolongé si marqueur actif, sinon butoir ORDINAIRE via etatEcheance) et remonte `joursRestants` (jamais recalculé ailleurs).
  const decompteParId = useMemo(() => {
    const m = new Map<number, Decompte>();
    if (!suivi) return m;
    const reg = { echeanceAlerteJours: suivi.reglages.alerteJours, releveFraicheurHeures: suivi.reglages.fraicheurHeures };
    const derniere = suivi.derniereOkLe ? new Date(suivi.derniereOkLe) : null;
    for (const d of suivi.parId.values()) {
      const entree = { envoyeLe: d.envoyeLe ? new Date(d.envoyeLe) : null, statutAcheminement: d.statutAcheminement, dossiersActifs: d.dossiersActifs, dossiersSatisfaits: d.dossiersSatisfaits, derniereReleveOkLe: derniere };
      const partiel = { actif: d.suspension !== null, le: d.suspension?.le ?? null, delaiMois: suivi.partielDelai.mois, delaiJours: suivi.partielDelai.jours };
      m.set(d.demandeId, decompteButoirCada(entree, maintenant, reg, partiel));
    }
    return m;
  }, [suivi, maintenant]);

  // Lot 4 — STATUT DÉRIVÉ de la cascade (libellé + prochaine étape), calculé À LA LECTURE, jamais stocké. Colonne STATUT.
  const cascadeParId = useMemo(() => {
    const m = new Map<number, { libelle: string; prochaine: string; court: string }>();
    if (!suivi) return m;
    for (const d of suivi.parId.values()) {
      const entree = {
        statut: d.statut, envoyeLe: d.envoyeLe, statutAcheminement: d.statutAcheminement,
        dossiersDus: d.dossiersActifs - d.dossiersSatisfaits,
        dernierEnvoiRelance: d.dernierEnvoiRelance, relancePreparee: d.relancePreparee, saisineCadaEnvoyeeLe: d.saisineCadaEnvoyeeLe,
      };
      // CASC-1 — SUSPENSION VISIBLE : si « dossier partiel » actif, le libellé de cascade DIT la suspension (raison + date) et il n'y a
      //   pas de prochaine étape ordinaire. CASC-2 — EN PLUS (jamais à la place), la date butoir CADA prolongée (partiel_le + 1 mois + 4 j).
      m.set(d.demandeId, d.suspension
        // LOT-8 (C) — cascade PARTIELLE : le GRADE ordinal (« 1re relance », « 2e relance »…) prime ; date du dernier mail envoyé dans
        //   l'infobulle (jamais dans la cellule). Grade = nbReclamationsComplement (marqueur + relances partielles). LOT 17 (B, point 5) :
        //   forme courte repli « Relance pièces » (2 mots, nowrap, aligné sur le vocabulaire de la frise), l'infobulle porte le texte complet.
        ? { libelle: `${libelleSuspension(d.suspension)} ${libelleDelaiProlonge(dateButoirPartiel(new Date(d.suspension.le), suivi.partielDelai.mois, suivi.partielDelai.jours))}${d.dernierEnvoiRelance ? ` Dernier mail envoyé le ${formaterDate(d.dernierEnvoiRelance.envoyeLe)}.` : ''}`, prochaine: '', court: d.nbReclamationsComplement >= 1 ? `${ordinalRelance(d.nbReclamationsComplement)} relance` : 'Relance pièces' }
        : { libelle: statutCascade(entree, maintenant, suivi.cascade, suivi.envoi), prochaine: prochaineEtape(entree, maintenant, suivi.cascade), court: libelleCourtCascade(entree, maintenant, suivi.cascade) });
    }
    return m;
  }, [suivi, maintenant]);

  // Q6 — PRÉ-FILTRE DUR par périmètre (hermeticité). Q6b — puis restreint aux statuts AFFICHÉS selon le choix du sélecteur
  // (défaut = VIVANTS). `filtrerDemandes` ne refiltre PAS le statut (déjà fait ici) : profil / commune / type / référence seulement.
  const dansPTous = useMemo(() => dansPerimetre(liste?.demandes ?? [], perimetre), [liste, perimetre]);
  // D2 — SCOPE PROCESS (filtre d'affichage sur le canal figé de la demande). Tout l'aval (statuts, morts, masse) est ainsi
  //   automatiquement scopé. Les demandes HORS process (canal 'courrier'/inconnu) sont écartées de la vue mais COMPTÉES (mention
  //   non silencieuse ci-dessous) — jamais masquées en silence.
  const dansP = useMemo(() => dansPTous.filter((d) => dansProcess(d.canal, process)), [dansPTous, process]);
  const horsProcessN = useMemo(() => dansPTous.filter((d) => horsProcess(d.canal)).length, [dansPTous]);
  const statutsVus = useMemo(() => new Set(statutsAffiches(perimetre, choixStatut)), [perimetre, choixStatut]);
  const dansVueStatut = useMemo(() => dansP.filter((d) => statutsVus.has(d.statut)), [dansP, statutsVus]);
  // T2-C — « En cours » applique la règle du commit A de Réponses : une demande sans AUCUN dossier dû (actif ET non satisfait)
  //   sort de la liste PAR DÉFAUT. Choisir un statut explicite (≠ défaut) désactive ce masquage → elle reste accessible via le
  //   filtre Statut existant. `À demander` n'est PAS concerné (ses brouillons/prêtes n'ont pas de dossiers retirés/satisfaits).
  const enCoursDefaut = perimetre === 'en_cours' && choixStatut === CHOIX_STATUT_DEFAUT;
  // FIX-2 — un « dossier partiel » ACTIF garde la demande dans « En cours » MÊME à 0 dossier dû (dossier satisfait mais incomplet, la
  //   réclamation court). Le tableau (DemandeListe) ne porte pas le marqueur : on l'attache depuis la donnée riche (suivi.parId, source
  //   unique) pour que partitionnerParDus/visiblesEnCours le voient via estVivanteEnCours — le compteur du commutateur applique déjà
  //   ce même foyer sur suivi.demandes. Symétrique de l'exclusion « Analyse » : le permis quitte Analyse et réapparaît ici.
  const dansVueSusp = useMemo(
    () => (suivi ? dansVueStatut.map((d) => (suivi.parId.get(d.id)?.suspension != null ? { ...d, suspension: true } : d)) : dansVueStatut),
    [dansVueStatut, suivi],
  );
  const partDus = useMemo(() => partitionnerParDus(dansVueSusp), [dansVueSusp]);
  // T8 — « En cours » : les SOLDÉES (tous dossiers actifs marqués reçus) sont TOUJOURS exclues, sous TOUT filtre (non révélable,
  //   foyer Archives : un permis n'est jamais dans deux onglets). Les sansDossier gardent le masquage révélable de défaut (T2-C).
  const dansVue = perimetre === 'en_cours' ? visiblesEnCours(dansVueSusp, enCoursDefaut) : dansVueStatut;
  // FUS — FOYER UNIQUE, « Réponses prime » : une demande à RETOUR (demandeADuRetour, MÊME règle que l'onglet Réponses, réutilisée
  //   telle quelle — un seul foyer) quitte l'AFFICHAGE « En cours ». Son échéance/compte à rebours reste sous les yeux dans
  //   Réponses (colonnes Échéance/État, etatEcheance INTOUCHÉ). Exclusion NON RÉVÉLABLE (comme les soldées). FILTRE D'AFFICHAGE
  //   SEUL : ne touche NI chargerDemandesSuivi (source partagée) NI relance/alerte/CADA/échéance (qui lisent la base). Donnée riche suivi.parId.
  const aRetourIds = useMemo(() => {
    if (perimetre !== 'en_cours' || !suivi) return new Set<number>();
    return new Set(dansVue.filter((d) => { const rich = suivi.parId.get(d.id); return rich !== undefined && demandeADuRetour(rich); }).map((d) => d.id));
  }, [perimetre, suivi, dansVue]);
  // LOT-10 — SAISISSABLES : quittent « En cours » pour « Saisines CADA » (même flag `rich.saisissable` dérivé de lireSaisinesEligibles que
  //   le compteur ; foyer unique). Une demande à retour ET saisissable est déjà hors En cours par le retour → on la compte côté Saisines.
  const saisissablesIds = useMemo(() => {
    if (perimetre !== 'en_cours' || !suivi) return new Set<number>();
    return new Set(dansVue.filter((d) => { const rich = suivi.parId.get(d.id); return rich !== undefined && rich.saisissable && !aRetourIds.has(d.id); }).map((d) => d.id));
  }, [perimetre, suivi, dansVue, aRetourIds]);
  const dansVueAffiche = (aRetourIds.size > 0 || saisissablesIds.size > 0) ? dansVue.filter((d) => !aRetourIds.has(d.id) && !saisissablesIds.has(d.id)) : dansVue;
  const filtrees = useMemo(
    () => trierDemandes(filtrerDemandes(dansVueAffiche, { statut: '', profil: fProfil, commune: fCommune, types: [...fTypes], reference: fReference }), tri),
    [dansVueAffiche, fCommune, fProfil, fTypes, fReference, tri],
  );

  // D1 — partition d'annulation en masse de la VUE FILTRÉE (brouillons = cibles du « Tout annuler » ; prêtes = geste dédié).
  const masse = useMemo(() => partitionnerAnnulationMasse(filtrees), [filtrees]);

  // Q6b — compteurs de CE QUI EST AFFICHÉ (statuts vus), décompte par statut. Le PÉRIMÈTRE ne bouge pas.
  const compteursVus = statutsDuPerimetre(perimetre).map((s) => ({ s, n: dansVueAffiche.filter((d) => d.statut === s).length })).filter((x) => x.n > 0);
  const dossiersVus = dansVueAffiche.reduce((acc, d) => acc + d.nbDossiers, 0);
  // Q6b — lignes MORTES (trace) écartées par le DÉFAUT : mention NON silencieuse. Uniquement en mode 'vivants' (choix
  // explicite « Toutes » ou un statut précis → rien de masqué, donc pas de mention).
  const mortsDetail = useMemo(
    () => statutsMorts(perimetre).map((s) => ({ statut: s, n: dansP.filter((d) => d.statut === s).length })),
    [perimetre, dansP],
  );
  // T2-C — sansDossier (0 dossier actif) : masquage RÉVÉLABLE de défaut, annoncé avec les morts (« les afficher » = « Toutes »).
  const mortsSansDossier = enCoursDefaut ? [{ statut: 'sans dossier actif', n: partDus.sansDossier.length }] : [];
  const morts = choixStatut === CHOIX_STATUT_DEFAUT ? [...mortsDetail, ...mortsSansDossier] : [];
  // T8 — SOLDÉES : exclusion NON RÉVÉLABLE (mention séparée, sans bouton, → Archives), sous TOUT filtre. Jamais confondue avec le masquage révélable.
  const exclusSoldees = perimetre === 'en_cours' && partDus.soldees.length > 0 ? { n: partDus.soldees.length, libelle: 'soldée(s) — voir l’onglet Archives' } : undefined;
  // FUS — 2e registre NON RÉVÉLABLE : demandes à retour, foyer désormais « Réponses ». Même traitement visuel que les soldées.
  const exclusReponses = perimetre === 'en_cours' && aRetourIds.size > 0 ? { n: aRetourIds.size, libelle: 'suivie(s) dans l’onglet Réponses' } : undefined;
  // LOT-10 — mention NON RÉVÉLABLE : les saisissables sont désormais dans « Saisines CADA » (invariant « jamais dans deux onglets »).
  const exclusSaisines = perimetre === 'en_cours' && saisissablesIds.size > 0 ? { n: saisissablesIds.size, libelle: 'à saisir devant la CADA — voir l’onglet Saisines CADA' } : undefined;
  const exclus = [exclusSoldees, exclusReponses, exclusSaisines].filter((x): x is { n: number; libelle: string } => x !== undefined);
  // PART-B — décompte par CATÉGORIE de CE QUI EST AFFICHÉ (En cours seulement). Exhaustif ET exclusif (categorieEnCours) → la somme
  //   vaut TOUJOURS dansVueAffiche.length : compteur exact, chaque permis dans une seule catégorie (précédent 18/08). La catégorie
  //   vient de la donnée riche (suspension) ; défaut 'premiere' si la riche manque (chargement). Hors En cours → aucun décompte.
  const categoriesVues = enCours && suivi
    ? (['premiere', 'relance'] as const)
        .map((c) => ({ c, n: dansVueAffiche.filter((d) => categorieEnCours(suivi.parId.get(d.id) ?? {}) === c).length }))
        .filter((x) => x.n > 0)
    : [];

  const nbPages = Math.max(1, Math.ceil(filtrees.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages);
  const visibles = filtrees.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);
  const majFiltre = (fn: () => void): void => { fn(); setPage(1); };
  const trierPar = (colonne: Parameters<typeof basculerTri>[1]): void => { setTri((t) => basculerTri(t, colonne)); setPage(1); };
  const basculerType = (rang: number): void => majFiltre(() => setFTypes((s) => { const n = new Set(s); if (n.has(rang)) n.delete(rang); else n.add(rang); return n; }));

  const basculer = (id: number): void => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toutSelectionner = (): void => setSel((s) => {
    const tousVisibles = visibles.every((d) => s.has(d.id));
    const n = new Set(s);
    for (const d of visibles) { if (tousVisibles) n.delete(d.id); else n.add(d.id); }
    return n;
  });

  async function ouvrir(id: number, conserverRetour = false): Promise<void> {
    if (!conserverRetour) setRetour(null);
    const res = await fetch(`/api/admin/permis/demandes/${id}`, { cache: 'no-store' });
    if (res.ok) { const d = (await res.json()) as DemandeDetail; setDetail(d); setCorps(d.corps ?? ''); }
    else annoncer(await erreurServeur(res, 'Ouverture impossible.'), false);
  }
  async function sauverCorps(): Promise<void> {
    if (!detail) return;
    const res = await fetch(`/api/admin/permis/demandes/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ corps }) });
    if (res.ok) { setDetail((await res.json()) as DemandeDetail); annoncer('Texte enregistré.', true, 'detail'); }
    else annoncer(await erreurServeur(res, 'Enregistrement impossible.'), false, 'detail');
  }

  // FUS-4 — actions « Réf. mairie » DEPUIS LE TABLEAU (En cours). MÊME route que le détail (POST ajoute, DELETE retire) → un
  //   SEUL chemin d'écriture, jamais un second. Rafraîchissent le suivi (source des colonnes). Renvoient un message d'erreur
  //   (affiché dans la cellule) ou null. La route n'écrit jamais statut/envoye_le → effacer/modifier ne défait aucun envoi.
  const URL_REF = '/api/admin/permis/demandes/reference';
  async function ajouterRefTable(demandeId: number, reference: string): Promise<string | null> {
    const res = await fetch(URL_REF, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference }) });
    if (res.ok) { rafraichirSuivi(); return null; }
    return await erreurServeur(res, 'Ajout impossible.');
  }
  async function supprimerRefTable(demandeId: number, reference: string): Promise<string | null> {
    const res = await fetch(URL_REF, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference }) });
    if (res.ok) { rafraichirSuivi(); return null; }
    return await erreurServeur(res, 'Effacement impossible.');
  }
  async function modifierRefTable(demandeId: number, ancien: string, nouveau: string): Promise<string | null> {
    if (nouveau === ancien) return null;
    // Remplacer SANS jamais laisser la demande sans référence : on AJOUTE d'abord le nouveau ; on ne retire l'ancien que si le
    //   nouveau est en place (ajouté, ou 409 = déjà présent sur cette demande). Un échec RÉEL de l'ajout garde l'ancien intact.
    const resAjout = await fetch(URL_REF, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference: nouveau }) });
    if (!resAjout.ok && resAjout.status !== 409) return await erreurServeur(resAjout, 'Modification impossible.');
    await fetch(URL_REF, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference: ancien }) });
    rafraichirSuivi();
    return null;
  }
  async function transition(ids: number[], statut: 'prete' | 'annulee', origine: 'haut' | 'detail' = 'haut'): Promise<void> {
    if (ids.length === 0) return;
    const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, statut }) });
    if (res.ok) {
      const r = (await res.json()) as { traites: number; conflitsReactivation?: { numDau: string; dejaActiveSurDemandeId: number }[] };
      const base = `${r.traites} demande(s) ${statut === 'prete' ? 'marquée(s) prête(s)' : 'annulée(s) (permis remis au stock)'}.`;
      // B1 — compte rendu de réouverture : dossiers NON réactivés car déjà rattachés à une autre demande active (jamais silencieux).
      const conflits = r.conflitsReactivation ?? [];
      const suffixe = conflits.length > 0
        ? ` ⚠️ ${conflits.length} dossier(s) NON réactivé(s), déjà rattaché(s) à une autre demande active : ${conflits.map((c) => `${c.numDau} (demande ${c.dejaActiveSurDemandeId})`).join(', ')}.`
        : '';
      annoncer(base + suffixe, conflits.length === 0, origine);
      setSel(new Set()); if (detail && ids.includes(detail.id)) void ouvrir(detail.id, true); rafraichir();
      return;
    }
    if (res.status === 409) {
      const d = (await res.json()) as { champs?: string[] };
      annoncer(`Aucune demande modifiée : identité du demandeur incomplète — ${(d.champs ?? []).join(' ; ')}. Complétez la configuration dans l’onglet Réglages.`, false, origine);
    } else annoncer(await erreurServeur(res, 'Action impossible.'), false, origine);
  }
  async function appliquerBascule(): Promise<void> {
    if (!confBascule) return;
    const { ids, profil } = confBascule;
    setConfBascule(null);
    const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, profil }) });
    if (res.ok) {
      const r = (await res.json()) as { traites: number };
      annoncer(`${r.traites} demande(s) basculée(s) en ${ETIQUETTE_PROFIL[profil].toLowerCase()} (texte régénéré).`, true);
      setSel(new Set()); if (detail && ids.includes(detail.id)) void ouvrir(detail.id, true); rafraichir();
      return;
    }
    if (res.status === 409) { const d = (await res.json()) as { erreur?: string }; annoncer(`Aucune bascule : ${d.erreur ?? 'transition interdite'}.`, false); }
    else annoncer(await erreurServeur(res, 'Bascule impossible.'), false);
  }

  // D1 — « Tout annuler » : cible les BROUILLONS de la VUE FILTRÉE (jamais plus large que ce que le porteur voit), PRÊTES EXCLUES.
  //   nbPermis = somme des dossiers des brouillons (chaque dossier actif n'appartient qu'à UNE demande → décompte exact). Étape 1.
  function demarrerToutAnnuler(): void {
    const { brouillons, pretes } = partitionnerAnnulationMasse(filtrees);
    setRapportMasse(null);
    if (brouillons.length === 0) {
      annoncer(pretes.length > 0 ? 'Aucun brouillon à annuler dans la vue (seules des prêtes y figurent — geste dédié).' : 'Aucune demande à annuler dans la vue actuelle.', false);
      return;
    }
    const nbPermis = brouillons.reduce((n, d) => n + d.nbDossiers, 0);
    setConfMasse({ etape: 1, ids: brouillons.map((d) => d.id), nbPermis, pretes: pretes.map((d) => ({ id: d.id, reference: d.reference, communeNom: d.communeNom })) });
  }

  // D1 — appel réel de l'annulation en masse (après confirmation en 2 temps). Compte rendu CHIFFRÉ + détail des refus.
  async function confirmerToutAnnuler(): Promise<void> {
    if (!confMasse) return;
    const ids = confMasse.ids;
    setConfMasse(null);
    const res = await fetch('/api/admin/permis/demandes/annuler-lot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    if (res.ok) {
      const r = (await res.json()) as { annulees: number; permisLiberes: number; refusees: { reference: string | null; statut: string | null; raison: string }[] };
      setRapportMasse(r);
      annoncer(`${r.annulees} demande(s) annulée(s) · ${r.permisLiberes} permis rendu(s) au réservoir${r.refusees.length ? ` · ${r.refusees.length} refusée(s)` : ''}.`, r.refusees.length === 0);
      setSel(new Set()); rafraichir();
    } else annoncer(await erreurServeur(res, 'Annulation impossible.'), false);
  }

  // D1 — GESTE DÉDIÉ à une demande PRÊTE (autoriserPrete=true) : nommée, distincte du geste de masse (elle partait au prochain envoi).
  async function confirmerAnnulerPrete(): Promise<void> {
    if (!confPrete) return;
    const { id, reference } = confPrete;
    setConfPrete(null);
    const res = await fetch('/api/admin/permis/demandes/annuler-lot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], autoriserPrete: true }) });
    if (res.ok) {
      const r = (await res.json()) as { annulees: number; permisLiberes: number; refusees: { raison: string }[] };
      if (r.annulees > 0) annoncer(`Demande prête ${reference} annulée · ${r.permisLiberes} permis rendu(s) au réservoir.`, true);
      else annoncer(`Annulation refusée : ${r.refusees[0]?.raison ?? 'refusée'}.`, false);
      setSel(new Set()); rafraichir();
    } else annoncer(await erreurServeur(res, 'Annulation impossible.'), false);
  }

  // T6-A — actions du détail « En cours » (7 gestes des dossiers/clôture) : MÊME route POST /reponses que « Réponses » (aucune 2e
  //   implémentation). Retour cle-based (`retourReponse`) ; succès → recharge la liste, la donnée riche ET le détail ouvert (statut/clôture à jour).
  async function agirReponse(corps: Record<string, unknown>, cle: string, texteOk: string): Promise<void> {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (res.ok) {
      setRetourReponse({ cle, texte: texteOk, ok: true });
      rafraichir(); rafraichirSuivi();
      if (detail) void ouvrir(detail.id, true); // rafraîchit l'en-tête du détail (statut après clôture/réouverture) sans effacer le retour
    } else setRetourReponse({ cle, texte: await erreurServeur(res, 'Action impossible.'), ok: false });
  }

  // T1 — RÉ-ATTACHER un dossier retiré (« annuler le retrait »). Route EXISTANTE, réutilisée telle quelle. Trois issues rendues
  //   clairement : 200 {ok:true} → de nouveau dû (recharge) ; 200 {ok:false} → 'introuvable' (le retrait n'existe plus) ; 409 →
  //   'conflit' (message serveur : déjà actif sur une autre demande). Sur échec, AUCUN changement d'état.
  async function reattacher(demandeId: number, dossierId: number): Promise<void> {
    const cle = `dossier-${demandeId}-${dossierId}`;
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reattacher_dossier', demandeId, dossierId }) });
    if (res.ok) {
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (d.ok) { setRetourReponse({ cle, texte: 'Dossier ré-attaché — il redevient dû.', ok: true }); rafraichir(); rafraichirSuivi(); if (detail) void ouvrir(detail.id, true); }
      else setRetourReponse({ cle, texte: 'Ré-attachement impossible : ce retrait n’existe plus (déjà ré-attaché ?).', ok: false });
    } else setRetourReponse({ cle, texte: await erreurServeur(res, 'Ré-attachement impossible.'), ok: false });
  }

  // T5 — téléchargement d'une pièce de réponse : SEUL signeur `url_piece` (source 'reponse' par défaut). Le client n'envoie
  //   qu'un pieceId ; le serveur lit la clé et renvoie une URL signée (la clé ne transite jamais). Aucune 2e implémentation.
  async function telechargerPiece(pieceId: number): Promise<void> {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId }) });
    if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    else setRetourReponse({ cle: `piece-${pieceId}`, texte: await erreurServeur(res, 'Lien indisponible.'), ok: false });
  }

  // UNIF-1 — ouverture d'une pièce À LA PAGE (visionneur) pour les familles per-permis (Caractéristiques / Pièces du permis). MÊME
  //   signeur unique `url_piece` (inline) que « Analyse et projection » ; la clé ne transite jamais. Silencieux si indisponible.
  const ouvrirPiece = useCallback(async (pieceId: number, source: 'reponse' | 'dossier', page?: number): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source, inline: true }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux */ }
  }, []);

  const selProfil = (id: string) => id as ProfilDemandeur;
  const zonesRetour = repartirRetour(retour, detail !== null);
  const aujourdhui = formaterDate(maintenant.toISOString()); // borne « refus le » (max) — la route reste l'autorité
  // LOT-8 — colonnes injectées en « En cours » : DÉLAI (décompte en jours, DecompteDelai) + Réf. mairie. Retirées : Catégorie
  //   (redondante avec « Arrêtée » du Statut ; le résumé « Dont N en relance » reste en tête) et Retour mairie (passée en tête d'encart).
  const colonnesSuivi = enCours && suivi ? {
    largeur: 2,
    entetes: (
      <>
        <th style={{ padding: '.4rem .5rem', textAlign: 'center' as const, whiteSpace: 'nowrap' as const, minWidth: 90 }}>Délai</th>
        <th style={{ padding: '.4rem .5rem', textAlign: 'center' as const, whiteSpace: 'nowrap' as const }}>Réf. mairie</th>
      </>
    ),
    cellule: (d: { id: number }) => {
      const rich = suivi.parId.get(d.id);
      const dec = decompteParId.get(d.id);
      return (
        <>
          {/* LOT-8 (B) — DÉLAI = décompte en jours (J-N / dépassé / obtenu / indéterminé), date en infobulle. */}
          <td style={{ padding: '.4rem .5rem', textAlign: 'center' as const, verticalAlign: 'middle' as const }}>
            {dec ? <DecompteDelai d={dec} id={d.id} /> : <span style={{ color: 'var(--color-svv-muted)' }}>—</span>}
          </td>
          {/* FUS-4 — Réf. mairie éditable (ajouter/modifier/effacer) via la MÊME route que le détail. « accusé reçu » DÉRIVÉ (aAccuse). */}
          {rich
            ? <RefMairieCellule references={rich.referencesMairie}
                onAjouter={(r) => ajouterRefTable(d.id, r)} onModifier={(a, n) => modifierRefTable(d.id, a, n)} onSupprimer={(r) => supprimerRefTable(d.id, r)} />
            : <td style={{ padding: '.4rem .5rem', textAlign: 'center' as const, verticalAlign: 'middle' as const, color: 'var(--color-svv-muted)' }}>—</td>}
        </>
      );
    },
  } : undefined;
  // CASC-1 — pas de levée MANUELLE : une fois en cascade partielle, on ne revient pas dans la cascade ordinaire (règle porteur). La SEULE
  //   sortie est automatique (`evaluerLeveeAutoPartiel`) quand toutes les pièces sont arrivées → le permis passe en « Analyse et projection ».

  // CASC-3 — PRÉPARATION (2 temps) d'une relance/annonce de cascade partielle : brouillon pré-rempli, relu/modifié, envoyé au clic.
  const [cascadeEd, setCascadeEd] = useState<{ objet: string; corps: string } | null>(null);
  const [cascadeEnvoi, setCascadeEnvoi] = useState(false);
  async function envoyerCascade(demandeId: number, etape: 'relance' | 'annonce', rang: number | null): Promise<void> {
    if (cascadeEd === null || cascadeEnvoi) return;
    setCascadeEnvoi(true);
    try {
      const res = await fetch('/api/admin/permis/cascade-partielle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, etape, rang, objet: cascadeEd.objet, corps: cascadeEd.corps }) });
      if (res.ok) { annoncer(etape === 'annonce' ? 'Annonce envoyée — étape enregistrée.' : 'Relance envoyée — étape enregistrée.', true, 'detail'); setCascadeEd(null); rafraichirSuivi(); if (detail) void ouvrir(detail.id, true); }
      else annoncer(await erreurServeur(res, 'Envoi impossible.'), false, 'detail');
    } catch { annoncer('Envoi impossible.', false, 'detail'); } finally { setCascadeEnvoi(false); }
  }

  // T6-A — donnée riche de la demande OUVERTE (détail « En cours ») : dossiers + statut + compteurs pour DetailDossiers/ActionsCloture.
  const richDetail = enCours && detail && suivi ? suivi.parId.get(detail.id) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Q6b — compteurs de CE QUI EST AFFICHÉ + mention NON silencieuse des lignes mortes masquées par le défaut. */}
      {liste && (
        <div className="svv-card" style={{ fontSize: 13 }}>
          <strong>{dansVueAffiche.length} demande(s)</strong> · {dossiersVus} dossier(s) couvert(s) — {compteursVus.map((x) => `${x.n} ${STATUT_LIBELLE[x.s]}`).join(' · ') || 'aucune'}.
          {/* PART-B — ventilation en DEUX catégories (En cours seulement) : 1re demande vs en relance (dossier partiel). Somme = total affiché. */}
          {enCours && categoriesVues.length > 0 && (
            <div style={{ color: 'var(--color-svv-muted)', marginTop: '.3rem' }}>
              Dont {categoriesVues.map((x) => `${x.n} en ${CATEGORIE_EN_COURS_LIBELLE[x.c].toLowerCase()}`).join(' · ')}.
            </div>
          )}
          <MentionMasquage morts={morts} onAfficherTout={() => majFiltre(() => setChoixStatut('tous'))} exclus={exclus} />
          <div style={{ color: 'var(--color-svv-muted)', marginTop: '.3rem' }}>
            Process <strong>{PROCESS_META[process].court}</strong> — {TEXTES[perimetre].intro}
          </div>
          {/* D2 — jamais de masquage silencieux : les demandes hors des deux process (canal courrier/inconnu) sont comptées ici. */}
          {horsProcessN > 0 && (
            <div style={{ color: 'var(--color-svv-red)', marginTop: '.3rem', fontSize: 12 }}>
              {horsProcessN} demande(s) au canal « courrier »/inconnu, hors des deux process (voir le bloc hors process du commutateur).
            </div>
          )}
        </div>
      )}

      {avecAlertes && liste?.alertesIdentite.map((a) => (
        <div key={a.profil} className="svv-page-note" style={{ marginTop: 0, color: 'var(--color-svv-red)' }}>
          Profil « {a.libelle} » incomplet ({a.manque.join(' ; ')}). Les demandes en {a.libelle.toLowerCase()} ne pourront pas passer « prête » tant que ce n&rsquo;est pas complété (onglet Réglages).
        </div>
      ))}

      <MessageRetour r={zonesRetour.haut} />

      {confBascule && (
        <div className="svv-card" style={{ borderColor: 'var(--color-svv-red)', fontSize: 13 }}>
          <strong>Basculer {confBascule.ids.length} demande(s) en {ETIQUETTE_PROFIL[confBascule.profil].toLowerCase()} ?</strong>
          <div style={{ color: 'var(--color-svv-muted)', margin: '.3rem 0 .5rem' }}>Le texte va être régénéré depuis l’identité de ce profil : <strong>les modifications manuelles du corps seront perdues</strong>.</div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .8rem' }} onClick={() => void appliquerBascule()}>Confirmer la bascule</button>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .8rem' }} onClick={() => setConfBascule(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* D1 — « Tout annuler » : confirmation EN DEUX TEMPS. Étape 1 = annonce chiffrée (N demandes, M permis) + prêtes EXCLUES
          nommées ; Étape 2 = confirmation finale. Aucune 'prete' n'est jamais dans le lot (partitionnerAnnulationMasse). */}
      {confMasse && (
        <div className="svv-card" style={{ borderColor: 'var(--color-svv-red)', fontSize: 13 }}>
          {confMasse.etape === 1 ? (
            <>
              <strong>Annuler {confMasse.ids.length} demande(s) brouillon de la vue ?</strong>
              <div style={{ color: 'var(--color-svv-muted)', margin: '.3rem 0 .5rem' }}>
                <strong>{confMasse.nbPermis} permis</strong> redeviendront demandables (rendus au réservoir). L’annulation est réversible (réouverture possible). Aucun envoi.
              </div>
              {confMasse.pretes.length > 0 && (
                <div style={{ color: 'var(--color-svv-red)', margin: '0 0 .5rem' }}>
                  {confMasse.pretes.length === 1
                    ? <>La demande <strong>prête</strong> {confMasse.pretes[0].reference}{confMasse.pretes[0].communeNom ? ` (${confMasse.pretes[0].communeNom})` : ''} n’est <strong>pas</strong> incluse : elle part au prochain envoi. Pour l’annuler, utilisez le geste dédié ci-dessous.</>
                    : <>{confMasse.pretes.length} demandes <strong>prêtes</strong> ne sont <strong>pas</strong> incluses (elles partent au prochain envoi) : geste dédié ci-dessous.</>}
                </div>
              )}
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .8rem' }} onClick={() => setConfMasse({ ...confMasse, etape: 2 })}>Poursuivre</button>
                <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .8rem' }} onClick={() => setConfMasse(null)}>Renoncer</button>
              </div>
            </>
          ) : (
            <>
              <strong>Confirmer l’annulation de {confMasse.ids.length} demande(s) ? {confMasse.nbPermis} permis reviendront au réservoir.</strong>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
                <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .8rem', background: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }} onClick={() => void confirmerToutAnnuler()}>Oui, annuler {confMasse.ids.length} demande(s)</button>
                <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .8rem' }} onClick={() => setConfMasse({ ...confMasse, etape: 1 })}>Revenir</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* D1 — geste DÉDIÉ à une demande PRÊTE : nommée + rappel qu’elle était sur le point de partir (jamais un geste de masse). */}
      {confPrete && (
        <div className="svv-card" style={{ borderColor: 'var(--color-svv-red)', fontSize: 13 }}>
          <strong>Annuler la demande PRÊTE {confPrete.reference}{confPrete.communeNom ? ` (${confPrete.communeNom})` : ''} ?</strong>
          <div style={{ color: 'var(--color-svv-red)', margin: '.3rem 0 .5rem' }}>Cette demande était <strong>sur le point de partir</strong> au prochain envoi. L’annuler la retire de la file d’envoi et rend ses permis au réservoir.</div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .8rem', background: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }} onClick={() => void confirmerAnnulerPrete()}>Oui, annuler cette prête</button>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .8rem' }} onClick={() => setConfPrete(null)}>Renoncer</button>
          </div>
        </div>
      )}

      {/* D1 — COMPTE RENDU chiffré de la dernière annulation en masse : N annulées, M permis rendus, détail des refusées. */}
      {rapportMasse && (
        <div className="svv-card" style={{ fontSize: 13 }} role="status">
          <strong>{rapportMasse.annulees} demande(s) annulée(s)</strong> · {rapportMasse.permisLiberes} permis redevenu(s) demandable(s).
          {rapportMasse.refusees.length > 0 && (
            <div style={{ color: 'var(--color-svv-red)', marginTop: '.35rem' }}>
              {rapportMasse.refusees.length} refusée(s) :
              <ul style={{ margin: '.2rem 0 0 1rem' }}>
                {rapportMasse.refusees.map((r, i) => (
                  <li key={i}>{r.reference ?? `demande ${i + 1}`} — {r.raison}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.2rem .6rem', marginTop: '.4rem' }} onClick={() => setRapportMasse(null)}>Fermer</button>
        </div>
      )}

      {/* U7 — le détail ne s'affiche PLUS ici (en haut) : il est rendu SOUS sa ligne, dans TableDemandes (slot `panneau`). */}

      {/* Filtres + tri (+ actions groupées si le périmètre en a) */}
      <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center', fontSize: 12 }}>
        {/* Q6b — le DÉFAUT est « Actives » (vivants), pas « Tous ». Chaque libellé dit ce qu'il montre ; « Toutes » nomme les morts. */}
        <label className="flex flex-col gap-1">Statut
          <select value={choixStatut} onChange={(e) => majFiltre(() => setChoixStatut(e.target.value))} style={styleChamp}>
            <option value="vivants">Actives ({statutsVivants(perimetre).map((s) => STATUT_LIBELLE[s]).join(', ')})</option>
            <option value="tous">Toutes (dont {statutsMorts(perimetre).map((s) => STATUT_LIBELLE[s]).join(', ')})</option>
            {statutsDuPerimetre(perimetre).map((s) => <option key={s} value={s}>{STATUT_LIBELLE[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Profil
          <select value={fProfil} onChange={(e) => majFiltre(() => setFProfil(e.target.value))} style={styleChamp}>
            <option value="">Tous</option>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Commune
          <input value={fCommune} onChange={(e) => majFiltre(() => setFCommune(e.target.value))} placeholder="nom ou code" style={styleChamp} />
        </label>
        <label className="flex flex-col gap-1">Référence
          <input value={fReference} onChange={(e) => majFiltre(() => setFReference(e.target.value))} placeholder="mairie, SVAV ou n° permis" style={styleChamp}
            aria-label="Rechercher par référence (mairie, SVAV ou n° de permis)" />
        </label>
        <label className="flex flex-col gap-1">Tri
          <select value={cleTri(tri)} onChange={(e) => setTri(triDepuisCle(e.target.value))} style={styleChamp}>
            {OPTIONS_TRI.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
          </select>
        </label>
        <div style={{ flex: '1 1 100%' }}>
          <FiltreTypes categories={categories} coches={fTypes} onToggle={basculerType} />
        </div>
        {avecActionsGroupees && (
          <>
            <span style={{ marginLeft: 'auto' }}>{sel.size} sélectionnée(s)</span>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'prete')}>Passer en prête</button>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'annulee')}>Annuler la demande</button>
            <label className="flex flex-col gap-1">Basculer la sélection en…
              <select value="" disabled={sel.size === 0} onChange={(e) => { if (e.target.value) setConfBascule({ ids: [...sel], profil: selProfil(e.target.value) }); }} style={{ ...styleChamp, opacity: sel.size ? 1 : 0.5 }}>
                <option value="">—</option>
                {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
              </select>
            </label>
            {/* D1 — geste de MASSE : annule TOUS les brouillons de la vue filtrée (prêtes exclues). Séparé de la sélection ci-dessus. */}
            <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-svv-line)', margin: '0 .2rem' }} />
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', color: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)', opacity: masse.brouillons.length ? 1 : 0.5 }}
              disabled={masse.brouillons.length === 0} onClick={demarrerToutAnnuler}
              title="Annuler tous les brouillons de la vue filtrée actuelle (les prêtes sont exclues)">
              Tout annuler ({masse.brouillons.length} brouillon{masse.brouillons.length > 1 ? 's' : ''})
            </button>
            {/* D1 — geste DÉDIÉ par demande PRÊTE présente dans la vue : nommée, distincte du geste de masse. */}
            {masse.pretes.map((d) => (
              <button key={d.id} type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', color: 'var(--color-svv-red)', borderColor: 'var(--color-svv-red)' }}
                onClick={() => setConfPrete({ id: d.id, reference: d.reference, communeNom: d.communeNom })}
                title={`Annuler la demande prête ${d.reference} (sur le point de partir)`}>
                Annuler la prête {d.reference}
              </button>
            ))}
          </>
        )}
      </div>

      {liste?.referencesIndisponibles && (
        <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>
          Recherche par référence mairie indisponible (lecture en erreur) — seule la référence SVAV est prise en compte.
        </div>
      )}

      <TableDemandes
        /* FUS / lot 4 — En cours : greffe la date d'envoi ET le statut de cascade (libellé + prochaine étape) sur la ligne pour la colonne Statut. Aucun WHERE ajouté, aucune source modifiée. */
        visibles={enCours && suivi ? visibles.map((d) => ({ ...d, envoyeLe: suivi.parId.get(d.id)?.envoyeLe ?? null, cascade: cascadeParId.get(d.id) ?? null })) : visibles}
        categories={categories} tri={tri} sel={sel} avecSelection={avecActionsGroupees}
        toutCoche={visibles.length > 0 && visibles.every((d) => sel.has(d.id))}
        messageVide={!liste ? 'Chargement…' : (fReference.trim() !== ''
          ? `Aucune demande ne correspond à « ${fReference.trim()} » (mairie, SVAV ou n° de permis ; casse, espaces et tirets ignorés).`
          : TEXTES[perimetre].vide)}
        // U7 — accordéon À UN SEUL VOLET : `detail` est UN objet (jamais un Set) → au plus une ligne dépliée ; le panneau se rend SOUS sa ligne.
        demandeOuverte={detail?.id ?? null}
        // LOT-8 — colonnes Délai + Réf. mairie (En cours seulement ; undefined → « À demander » inchangé).
        colonnesSuivi={colonnesSuivi}
        // LOT-8 (A) — En cours : Origine (= le rail sélectionné) et Destinataire (dans l'en-tête du détail) masquées pour gagner de la place.
        masquerOrigineDest={enCours}
        panneau={detail ? (
          <PanneauDetailDemande
            detail={detail} corps={corps} retour={zonesRetour.detail}
            /* LOT 16 (B, point 8) — titre du pli daté par la MÊME donnée que la 1re entrée de la frise : l'envoi 'initiale' de historiqueEnvois
               (pas un 2e calcul). null hors « En cours » (richDetail absent) ou tant qu'aucun envoi initial → titre brouillon/sans date. */
            dateInitialeEnvoi={richDetail ? (richDetail.historiqueEnvois.find((e) => e.nature === 'initiale')?.le ?? null) : null}
            onCorps={setCorps}
            onFermer={() => setDetail(null)}
            onSauverCorps={() => void sauverCorps()}
            /* FUS — éditeur de référence PARTAGÉ avec le tableau : MÊMES handlers (POST/DELETE /reference) + rafraîchit le détail après succès. */
            onAjouterRef={async (r) => { const e = await ajouterRefTable(detail.id, r); if (!e) await ouvrir(detail.id, true); return e; }}
            onModifierRef={async (a, n) => { const e = await modifierRefTable(detail.id, a, n); if (!e) await ouvrir(detail.id, true); return e; }}
            onSupprimerRef={async (r) => { const e = await supprimerRefTable(detail.id, r); if (!e) await ouvrir(detail.id, true); return e; }}
            onBascule={(p) => setConfBascule({ ids: [detail.id], profil: p })}
            onTransition={(statut) => void transition([detail.id], statut, 'detail')}
            // T6-A — En cours : les 7 actions (DetailDossiers + ActionsCloture) via la MÊME route POST /reponses. À demander : slots absents → détail inchangé.
            // UNIF-1 — le détail « En cours » adopte le format « Analyse » : un ENCART de familles repliées (EncartFamilles), règle
            //   d'affichage unique (familleAffichee). « Suivi & actions » (remplissable) réunit TOUS les gestes de pilotage ; les 4
            //   familles per-permis (Complétude/Caractéristiques/Bâtiments/Pièces) s'affichent SI non vides (signal batché), en
            //   sous-sections par permis chargées PARESSEUSEMENT (SousSectionsPermis). Aucun geste perdu (mêmes composants/handlers).
            masquerRefMairie
            slotActions={undefined}
            slotDossiers={richDetail ? (
              <EncartFamilles onglet="en_cours" familles={[
                {
                  cle: 'suivi_actions', nonVide: true, titre: LIBELLE_FAMILLE.suivi_actions,
                  contenu: () => (
                  <>
                {/* LOT 18 — PARCOURS COMPLET : projeterParcours DÉRIVE à chaque rendu les faits ET les étapes à venir datées, depuis l'état
                    courant (envoi initial, envois réels, bifurcation, annonce/saisine CADA) + les réglages de config (ordinaire + partiel).
                    Aucune lecture ajoutée ici (tout est déjà dans richDetail/suivi). Le GESTE « préparer le brouillon » est CONSERVÉ, sous la frise. */}
                {(() => {
                  const evenements = suivi ? projeterParcours({
                    envoyeLe: richDetail.envoyeLe, envois: richDetail.historiqueEnvois, suspension: richDetail.suspension,
                    saisineCadaEnvoyeeLe: richDetail.saisineCadaEnvoyeeLe, annonceCadaEnvoyeeLe: richDetail.annonceCadaEnvoyeeLe,
                    reglages: { ordinaire: suivi.cascade, partiel: suivi.reglagesPartiel, cadaPartielMois: suivi.partielDelai.mois, cadaPartielJours: suivi.partielDelai.jours },
                  }) : [];
                  const c = richDetail.cascade;
                  const actionCascade = c && c.brouillon ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                      {cascadeEd === null && (
                        <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto', padding: '.3rem .7rem' }} onClick={() => setCascadeEd({ objet: c.brouillon!.objet, corps: c.brouillon!.corps })}>
                          {c.etape === 'annonce' ? 'Préparer l’annonce CADA' : `Préparer la relance ${c.rang}`}
                        </button>
                      )}
                      {cascadeEd !== null && (c.etape === 'relance' || c.etape === 'annonce') && (
                        <div className="flex flex-col gap-2" style={{ padding: '.4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Brouillon pré-rempli — relisez et modifiez. Le texte envoyé sera EXACTEMENT ce qui est affiché, dans le fil du dernier message de la mairie.</span>
                          <input type="text" value={cascadeEd.objet} onChange={(e) => setCascadeEd({ ...cascadeEd, objet: e.target.value })} aria-label="Objet" style={{ width: '100%', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, boxSizing: 'border-box' }} />
                          <textarea value={cascadeEd.corps} onChange={(e) => setCascadeEd({ ...cascadeEd, corps: e.target.value })} rows={9} aria-label="Message" style={{ width: '100%', padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical', boxSizing: 'border-box' }} />
                          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                            <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto', padding: '.3rem .7rem' }} disabled={cascadeEnvoi || cascadeEd.objet.trim() === '' || cascadeEd.corps.trim() === ''} onClick={() => void envoyerCascade(detail.id, c.etape as 'relance' | 'annonce', c.rang)}>{cascadeEnvoi ? 'Envoi…' : 'Envoyer'}</button>
                            <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', padding: '.3rem .7rem' }} onClick={() => setCascadeEd(null)}>Abandonner</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null;
                  return <FriseSuivi evenements={evenements} actionAvenir={actionCascade} />;
                })()}
                <DetailDossiers demandeId={detail.id} statut={richDetail.statut} dossiers={richDetail.dossiers} nbSatisfaits={richDetail.dossiersSatisfaits} retour={retourReponse}
                  aujourdhui={aujourdhui} prefillRefus={richDetail.derniereReponseLe ? formaterDate(richDetail.derniereReponseLe) : aujourdhui}
                  onMarquer={(demandeId, dossierId, satisfait) => void agirReponse({ action: 'marquer_dossier', demandeId, dossierId, satisfait }, `dossier-${demandeId}-${dossierId}`, satisfait ? 'Marqué reçu.' : 'Satisfaction annulée.')}
                  onNonFourni={(demandeId, dossierId) => void agirReponse({ action: 'dossier_non_fourni', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Marqué « non fourni » — le dossier reste dû.')}
                  onAnnulerTriage={(demandeId, dossierId) => void agirReponse({ action: 'annuler_triage', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Statut annulé — retour à « dû ».')}
                  refusOuvertDossierId={refus?.demandeId === detail.id ? refus.dossierId : null}
                  refusDate={refus?.demandeId === detail.id ? refus.date : undefined}
                  onRefusOuvrir={(demandeId, dossierId, prefill) => setRefus({ demandeId, dossierId, date: prefill })}
                  onRefusDateChange={(date) => setRefus((r) => (r ? { ...r, date } : r))}
                  onRefusConfirmer={(demandeId, dossierId, date) => { setRefus(null); void agirReponse({ action: 'dossier_refus_mairie', demandeId, dossierId, refusLe: date }, `dossier-${demandeId}-${dossierId}`, 'Refus mairie enregistré — candidat à la saisine CADA.'); }}
                  onRefusAnnuler={() => setRefus(null)}
                  retirerOuvertDossierId={retrait?.demandeId === detail.id ? retrait.dossierId : null}
                  onRetirerOuvrir={(dossierId) => setRetrait({ demandeId: detail.id, dossierId })}
                  onRetirerConfirmer={(demandeId, dossierId) => { setRetrait(null); void agirReponse({ action: 'retirer_dossier', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Dossier retiré — il redevient demandable dans « À demander ».'); }}
                  onRetirerAnnuler={() => setRetrait(null)}
                  dossiersRetires={richDetail.dossiersRetires}
                  reattachOuvertDossierId={reattach?.demandeId === detail.id ? reattach.dossierId : null}
                  onReattachOuvrir={(dossierId) => setReattach({ demandeId: detail.id, dossierId })}
                  onReattachConfirmer={(demandeId, dossierId) => { setReattach(null); void reattacher(demandeId, dossierId); }}
                  onReattachAnnuler={() => setReattach(null)} />
                {/* LOT 15 (point 8) — le bloc « Références mairie » de l'encart est RETIRÉ : DOUBLON de la colonne « Réf. mairie » du
                    tableau (RefMairieCellule), qui écrit la MÊME donnée par le MÊME chemin (ajouterRefTable(detail.id) → POST /demandes/reference,
                    portée PAR DEMANDE). Le geste reste pleinement accessible via cette colonne. */}
                {/* LOT 15 (point 9) — Clôturer : seul geste d'ARRÊT DÉFINITIF, CONSERVÉ, placé proprement en bas de la famille (séparateur). */}
                <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.5rem', marginTop: '.2rem' }}>
                  <ActionsCloture demandeId={detail.id} statut={richDetail.statut} dossiersDus={richDetail.dossiersActifs - richDetail.dossiersSatisfaits}
                    motif={motifCloture[detail.id]} retour={retourReponse}
                    onMotif={(demandeId, v) => setMotifCloture((s) => ({ ...s, [demandeId]: v }))}
                    onCloturer={(demandeId) => void agirReponse({ action: 'cloturer', demandeId, motif: motifCloture[demandeId] ?? '' }, `cloturer-${demandeId}`, 'Demande clôturée.')}
                    onRouvrir={(demandeId) => void agirReponse({ action: 'rouvrir', demandeId }, `rouvrir-${demandeId}`, 'Demande rouverte.')} />
                </div>
                  </>
                  ),
                },
                {
                  cle: 'historique',
                  // LOT 17-C — mention NEUTRE « N échanges — dernier le … » dans le prolongement du titre, visible REPLIÉE (compte + date
                  //   batchés hors `dem`, périmètre du fil). Rien si 0.
                  titre: <>{LIBELLE_FAMILLE.historique}<MentionEchanges nbEchanges={richDetail.nbEchanges} dernierLe={richDetail.dernierEchangeLe} /></>,
                  // LOT-4 — signal = « ≥ 1 entrée de fil » (historiqueNonVide, batché à part, hors `dem`), pas les liens/pièces : la
                  //   famille reflète le FIL (mêmes messages qu'en Analyse). Comme historiqueNonVide inclut les reçus, elle est vraie
                  //   dès qu'un artefact (lien/pièce/message/alerte) existe → aucun geste ci-dessous n'est jamais caché.
                  nonVide: richDetail.historiqueNonVide,
                  contenu: () => (
                  <>
                {/* LOT-4 — LE FIL des échanges mail (mêmes messages qu'en Analyse), par permis via SousSectionsPermis, comme Archives. */}
                <SousSectionsPermis dossiers={richDetail.dossiersEncart} rendre={(id) => <BlocFilEchanges key={id} dossierId={id} />} />
                {/* Artefacts de réponses (liens/pièces/messages « autre »/alertes GED) : REPLIÉS par défaut (le fil ci-dessus est le contenu principal), 1 clic pour ouvrir, GESTES conservés derrière le pli. */}
                {(richDetail.messagesAutre.length > 0 || richDetail.liens.length > 0 || richDetail.piecesReponses.length > 0 || richDetail.alertesGed.length > 0) && (
                <SousBlocRepliable titre={`Liens, pièces et messages des réponses (${richDetail.messagesAutre.length + new Set(richDetail.liens.map((l) => l.url)).size + richDetail.piecesReponses.reduce((n, g) => n + g.pieces.length, 0) + richDetail.alertesGed.length})`}>
                {/* T7-B (cas ③) — messages « autre » : bouton « répondu » MANUEL et RÉVERSIBLE par message. */}
                <BlocMessagesAutre messages={richDetail.messagesAutre} retour={retourReponse} compteReleve={suivi?.reglages.adresseReleve}
                  onRepondu={(reponseId) => void agirReponse({ action: 'repondu', reponseId }, `repondu-${reponseId}`, 'Message marqué « répondu ».')}
                  onAnnulerRepondu={(reponseId) => void agirReponse({ action: 'annuler_repondu', reponseId }, `repondu-${reponseId}`, '« Répondu » annulé.')}
                  onReclasser={(reponseId, nature) => void agirReponse({ action: 'reclasser', reponseId, nature }, `repondu-${reponseId}`, `Message reclassé « ${nature} ».`)} />
                {/* L1 — liens captés (un accusé porteur d'un lien reste hors de « Réponses » mais visible ici). */}
                <BlocLiens liens={richDetail.liens} maintenant={new Date()} />
                {/* T5 — pièces des réponses rattachées, consultables/téléchargeables. */}
                <BlocPiecesReponses groupes={richDetail.piecesReponses} onTelecharger={(pieceId) => void telechargerPiece(pieceId)} />
                {/* G1 — alertes « à classer/télécharger en GED » envoyées pour cette demande (retard rendu visible). */}
                <BlocAlertesGed alertes={richDetail.alertesGed} />
                </SousBlocRepliable>
                )}
                  </>
                  ),
                },
                {
                  // LOT-9 (C) — CONTACT MAIRIE : carnet d'adresses (interlocuteurs + destinataire), 1 clic, homogène aux autres familles.
                  //   Le BILAN d'état (LOT 8 : documents obtenus / à classer en GED / message reçu (N) / accusé / aucun) est CONSERVÉ,
                  //   déplacé du bandeau vers le TITRE de cette famille (visible replié) ; le contenu ne porte QUE le carnet (pas le fil).
                  cle: 'contact', nonVide: richDetail.contactNonVide,
                  titre: `${LIBELLE_FAMILLE.contact} — ${libelleRetourMairie(etatRetourMairie(richDetail), richDetail.nbReponsesReelles)}`,
                  contenu: () => <BlocContactMairie contact={richDetail.contactMairie} />,
                },
                // UNIF-1 — familles PER-PERMIS (si non vides) : sous-sections par permis, contenu chargé AU DÉPLIAGE (SousSectionsPermis) → jamais N appels lourds d'un coup.
                { cle: 'completude',
                  // LOT 13-A — le compteur ROUGE de familles manquantes est posé DANS le titre de famille (visible replié : c'est tout
                  //   l'intérêt). Rien si 0 (point 4). MÊME formulation que le bilan de « Analyse et projection » (source unique).
                  titre: <>{LIBELLE_FAMILLE.completude}<MentionFamillesManquantes manquantes={richDetail.completudeManquantes} /></>,
                  nonVide: richDetail.completudeNonVide,
                  contenu: () => <SousSectionsPermis dossiers={richDetail.dossiersEncart} rendre={(id) => <BlocCompletude key={id} dossierId={id} sansPli />} /> },
                { cle: 'caracteristiques', titre: LIBELLE_FAMILLE.caracteristiques, nonVide: richDetail.caracteristiquesNonVide,
                  contenu: () => <SousSectionsPermis dossiers={richDetail.dossiersEncart} rendre={(id) => <CaracteristiquesBloc key={id} dossierId={id} onOuvrir={(pid, source, page) => void ouvrirPiece(pid, source, page)} />} /> },
                { cle: 'batiments', titre: LIBELLE_FAMILLE.batiments, nonVide: richDetail.batimentsNonVide,
                  contenu: () => <SousSectionsPermis dossiers={richDetail.dossiersEncart} rendre={(id) => <BlocTraceEmprise key={id} dossierId={id} />} /> },
                { cle: 'pieces', titre: LIBELLE_FAMILLE.pieces, nonVide: richDetail.piecesNonVide,
                  // LOT 14b — la LISEUSE (best-of + aperçu, lecture seule) est EN HAUT ; la liste des pièces avec ses téléchargements reste EN DESSOUS
                  //   (précédent 18/08). Un seul dépli (celui de la famille) : la liseuse ne s'enveloppe d'aucun BlocRepliable. Montée paresseuse (thunk `contenu`).
                  contenu: () => <SousSectionsPermis dossiers={richDetail.dossiersEncart} rendre={(id) => (
                    <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                      <LiseusePieces dossierId={id} />
                      <BlocPiecesPermis dossierId={id} onOuvrir={(pid, source, page) => void ouvrirPiece(pid, source, page)} />
                    </div>
                  )} /> },
              ]} />
            ) : undefined}
          />
        ) : null}
        onTrier={trierPar} onToutSelectionner={avecActionsGroupees ? toutSelectionner : undefined} onBasculer={avecActionsGroupees ? basculer : undefined}
        // U7 — le bouton de ligne BASCULE : rouvrir la ligne ouverte la referme ; ouvrir une AUTRE remplace le détail (un seul volet).
        onOuvrir={(id) => { if (detail?.id === id) setDetail(null); else void ouvrir(id); }}
      />

      {nbPages > 1 && (
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
          <span>Page {pageCourante} / {nbPages} ({filtrees.length} demande(s))</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante >= nbPages} onClick={() => setPage((p) => Math.min(nbPages, p + 1))}>Suivant</button>
        </div>
      )}
    </div>
  );
}
