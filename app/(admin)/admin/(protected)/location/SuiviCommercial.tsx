'use client';

import { useCallback, useEffect, useState } from 'react';
import { ListeChoix } from './ListeChoix';
import {
  aRattacher, aujourdhuiParis, type Apporteur, CATEGORIES_PRIME, type CasGestion, type CategoriePrime, collegueADate, htVersTtc, LIBELLE_ORIGINE_CONTACT, LIBELLE_TYPE_APPORTEUR,
  LIBELLE_CATEGORIE_PRIME, lireMontant, lireTauxPourcent, type ModePrime, montantPrime, motPrimeDejaVersee, type Origine, originesProposees, type OrigineContact, pourcent,
  PRECISION_ORIGINE_MAX, preremplissageGestion, type RegleCommission,
  type SaisieActivite, ttcVersHt, TYPES_APPORTEUR, type TypeApporteur, verifierActivite, versionADate,
} from '../../../../lib/location/suivi/suivi';
import { ModaleAnnuaireApporteurs } from './ModaleAnnuaireApporteurs';
import { InfoBulle } from '../InfoBulle';
import { CaseEuros } from './ConditionsEntree';
import {
  type ActiviteCalcul, honorairesGestionDuBail, MOT_MANQUE_GESTION, partGestionMensuelleDe, partGestionSignatureDe, partLocationDe,
} from '../../../../lib/location/suivi/tableauBord';
import { LIBELLE_MODE_APPORTEUR, libelleApporteur, MODES_APPORTEUR, type ModeApporteur, origineApresCases, trierApporteurs, estInterne, badgeApporteur, baremeADate } from '../../../../lib/location/suivi/suivi';

/** Les champs d'une origine choisie : ceux des autres origines se vident (apporteur, collègue, texte « Personnalisé »). PUR. */
function champsOrigine(v: OrigineContact | null): Partial<SaisieSuivi> {
  return { origineContact: v, ...(v !== 'apporteur' ? { apporteurId: null, apporteurTaux: '', commissionApporteur: '' } : {}), ...(v !== 'collegue' ? { collegueId: null } : {}),
    ...(v !== 'personnalise' ? { origineContactPrecision: '' } : {}) };
}

/**
 * ══ LOCATION — « SUIVI COMMERCIAL » DU BAIL (Arno, 22/10/2026, migration 406) ══════════════════════════════════════════════
 * Le bloc 4 de « Nouveau locataire » : ce que le suivi mensuel d'Arno (CA_JBP_2026.xlsx) note pour chaque bail — date de
 * signature, honoraires HT propriétaire et locataire, négociateur, apporteur et son taux, nouvelle gestion, origine client.
 * 🔴 Les honoraires se SAISISSENT EN HT (décision d'Arno) ; les montants TTC des « Conditions d'entrée » (honoraires
 * propriétaire, honoraires agence) restent affichés et se tiennent à jour : HT × 1,2 = TTC, et inversement — un seul montant.
 * Enregistré sur le bail créé, juste après lui (`/api/admin/location/suivi`, action `enregistrer-activite`).
 * Sans la migration 406 : le bloc le dit, rien n'est exigé ni envoyé, le locataire se crée comme avant.
 *
 * 🔴 Arno (23/10/2026, migration 407) — L'ORIGINE DU CONTACT est obligatoire (liste fixe) : « Collègue directement » → le
 * collègue ; « Apporteur d'affaires » → l'apporteur de l'annuaire (un apporteur « à rattacher » n'est pas choisissable), son
 * collègue de rattachement s'affiche, la commission est proposée au taux de l'apporteur et reste modifiable ; « Relocation »
 * est proposée quand le bien était déjà en gestion avant le bail. LA PRIME DE GESTION : « 150 € » (par défaut quand un mandat
 * de gestion est signé), « Personnalisé » (montant libre) ou « Aucune ». Sans la 407 : comme avant (ni origine, ni menu).
 *
 * 🔴 Arno (24/10/2026) — TOUS LES MENUS du bloc sont la liste maison (`ListeChoix`, VERTE — Arno, 24/10/2026, après le rouge du matin) : ouverte exactement sous le
 * champ, de sa largeur ; clavier, Échap et toucher comme partout. La prime de nouvelle gestion : Logement · Local · Parking.
 */
export { API_SUIVI, posterSuivi } from './suiviApi';
import { API_SUIVI, posterSuivi } from './suiviApi';

export interface ParametresSuivi {
  disponible: boolean;
  apporteurs: Apporteur[];
  negociateurs: { id: number; libelle: string; actif?: boolean }[];
  moi: number | null;
  /** 407 — les collègues (comptes ayant accès à la Location), la règle de prime, et la migration est-elle là ? */
  collegues: { id: number; libelle: string; actif?: boolean }[];
  regles: RegleCommission[];
  annuaire: boolean;
  /** 411 — l'origine « Personnalisé » peut-elle être choisie ? */
  personnalisable?: boolean;
  /** 415 — l'origine « Propriétaire déjà client » peut-elle être choisie ? */
  dejaClient?: boolean;
}

export interface SaisieSuivi extends SaisieActivite { categoriePrime: CategoriePrime | null }

export { aujourdhuiParis };

export const SUIVI_VIDE = (): SaisieSuivi => ({
  type: 'bail', dateSignature: aujourdhuiParis(), honoProprietaireHt: '', honoLocataireHt: '', negociateurId: null, apporteurId: null,
  apporteurTaux: '', mandatGestion: false, avecGestion: false, origineProprietaire: null, origineLocataire: null, categoriePrime: null,
  origineContact: null, collegueId: null, commissionApporteur: '', primeMode: 'aucune', primeMontant: '', origineContactPrecision: '',
  apporteurMode: null, apporteurTauxGestion: '',
});

/** « 500 » → « 500,00 » (l'écriture des cases en euros de l'écran). */
const ecrire = (x: number): string => x.toFixed(2).replace('.', ',');
/** Un TTC saisi → le HT déduit (texte), vide si vide ou illisible. */
export const htDepuisTtc = (ttc: string): string => {
  const v = lireMontant(ttc);
  return typeof v === 'number' ? ecrire(ttcVersHt(v)) : '';
};
/** Un HT saisi → le TTC déduit (texte) ; `null` si illisible (le TTC n'est pas touché). */
export const ttcDepuisHt = (ht: string): string | null => {
  const v = lireMontant(ht);
  return v === null ? '' : v === undefined ? null : ecrire(htVersTtc(v));
};

/** Une réponse lue telle qu'attendue : listes toujours des tableaux ; une réponse d'une autre forme = suivi indisponible. PUR. */
export function lireParametres(d: unknown): ParametresSuivi {
  const o = (d !== null && typeof d === 'object' ? d : {}) as Partial<ParametresSuivi>;
  const apporteurs = Array.isArray(o.apporteurs) ? o.apporteurs.map((a) => ({ ...a, baremes: Array.isArray(a.baremes) ? a.baremes : [] })) : [];
  const negociateurs = Array.isArray(o.negociateurs) ? o.negociateurs : [];
  return { disponible: o.disponible === true && Array.isArray(o.apporteurs), apporteurs, negociateurs, moi: typeof o.moi === 'number' ? o.moi : null,
    collegues: Array.isArray(o.collegues) ? o.collegues : [], regles: Array.isArray(o.regles) ? o.regles : [], annuaire: o.annuaire === true,
    ...(o.personnalisable === true ? { personnalisable: true } : {}), ...(o.dejaClient === true ? { dejaClient: true } : {}) };
}

/** Lit les paramètres du suivi (apporteurs, négociateurs) ; `rafraichir` relit (après « + Nouvel apporteur »). */
export function useParametresSuivi(): { lu: ParametresSuivi | null; erreur: string | null; rafraichir: () => void } {
  const [lu, setLu] = useState<ParametresSuivi | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(API_SUIVI, { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: ParametresSuivi; message?: string }) => {
      if (!vivant) return;
      if (d.etat === 'ok' && d.data !== undefined) { setLu(lireParametres(d.data)); setErreur(null); } else setErreur(d.message ?? 'Lecture impossible.');
    }).catch(() => { if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [n]);
  return { lu, erreur, rafraichir: useCallback(() => setN((x) => x + 1), []) };
}

/** Le motif qui bloque l'enregistrement (la date de signature, un montant ou un taux illisible), ou null. PUR. */
export function motifSuivi(s: SaisieSuivi, annuaire = false): string | null {
  const v = verifierActivite(s, { origineObligatoire: annuaire });
  return v.ok ? null : v.motif;
}

/** La nature de l'affaire (liste du champ « Nature »). */
const NATURES = [{ id: 'bail', libelle: 'Bail' }, { id: 'avenant', libelle: 'Avenant' }] as const;

interface Props {
  valeur: SaisieSuivi;
  onChange: (v: SaisieSuivi) => void;
  parametres: { lu: ParametresSuivi | null; erreur: string | null; rafraichir: () => void };
  /** Le bien loué et les fiches de locataires déjà connues : l'origine client et la gestion du bien en sont déduites. */
  lotId: number | null;
  locataireIds: number[];
  /** Les montants TTC des « Conditions d'entrée » (texte saisi), et leur mise à jour depuis le HT. */
  ttcProprietaire: string;
  ttcLocataire: string;
  onTtcProprietaire: (ttc: string) => void;
  onTtcLocataire: (ttc: string) => void;
  manque: React.ReactNode;
  /** 413 — le loyer mensuel des « Conditions d'entrée » (texte saisi) : la base de la part gestion de l'apporteur, en direct. */
  loyer?: { principal: string; provisions: string };
  /**
   * Arno (24/10/2026) — le « Type de bien » d'après les LOTS LOUÉS cochés (`typeDeBienDesLots`) : « Parking » n'est proposé que si
   * tous les lots loués sont des parkings. null : pas encore de lots ; absent : un hôte sans lots (toutes les valeurs proposées).
   */
  typeBien?: { type: CategoriePrime; parkingPermis: boolean } | null;
  /**
   * 🔴 Arno (24/10/2026) — « DOSSIER DE LOCATION » (une ligne EXISTANTE rouverte) : aucun pré-remplissage de création (cases de
   * gestion, prime et origine d'après le bien, négociateur = la personne connectée) — les valeurs enregistrées restent telles
   * quelles, et seul ce que l'on modifie change. Absent : la création, inchangée.
   */
  sansPreremplissage?: boolean;
}

export function BlocSuiviCommercial({ valeur: s, onChange, parametres, lotId, locataireIds, ttcProprietaire, ttcLocataire, onTtcProprietaire, onTtcLocataire, manque, loyer, typeBien, sansPreremplissage = false }: Props) {
  const lu = parametres.lu;
  const poser = (p: Partial<SaisieSuivi>): void => onChange({ ...s, ...p });
  // Le HT affiché est celui du TTC (une seule vérité) ; pendant la frappe, la case garde ce qui est tapé.
  const [frappe, setFrappe] = useState<{ proprietaire: string | null; locataire: string | null }>({ proprietaire: null, locataire: null });
  const htProprietaire = frappe.proprietaire ?? htDepuisTtc(ttcProprietaire);
  const htLocataire = frappe.locataire ?? htDepuisTtc(ttcLocataire);
  useEffect(() => {
    if (s.honoProprietaireHt !== htProprietaire || s.honoLocataireHt !== htLocataire) onChange({ ...s, honoProprietaireHt: htProprietaire, honoLocataireHt: htLocataire });
  }, [s, htProprietaire, htLocataire, onChange]);

  // Le négociateur : par défaut, la personne connectée.
  useEffect(() => {
    if (sansPreremplissage || lu === null || s.negociateurId !== null || lu.moi === null || !lu.negociateurs.some((n) => n.id === lu.moi && n.actif !== false)) return;
    onChange({ ...s, negociateurId: lu.moi });
  }, [lu, s, onChange, sansPreremplissage]);

  // Ce que le serveur déduit : la gestion du bien, la catégorie de prime, l'origine des clients à la date de signature.
  const [propose, setPropose] = useState<{ cle: string; avecGestion: boolean; categoriePrime: CategoriePrime; origineProprietaire: Origine | null; origineLocataire: Origine | null; enGestionAvant?: boolean;
    /* 🔴 Arno (24/10/2026) — la situation du bien (première location en gestion, relocation, prime déjà versée, hors gestion). */
    cas?: CasGestion; primeDejaVersee?: { date: string; bail: string } | null;
    /** 413 — le taux de gestion HT du bien (en %). */
    tauxGestionBien?: number | null } | null>(null);
  const cle = lotId !== null && /^\d{4}-\d{2}-\d{2}$/.test(s.dateSignature) ? `${lotId}|${locataireIds.join(',')}|${s.dateSignature}` : null;
  useEffect(() => {
    if (cle === null || lu?.disponible !== true) return;
    let vivant = true;
    const [lot, locs, date] = cle.split('|');
    fetch(`${API_SUIVI}?vue=proposition&lotId=${lot}&locataires=${locs}&date=${date}`, { cache: 'no-store' }).then((r) => r.json())
      .then((d: { etat?: string; data?: Omit<NonNullable<typeof propose>, 'cle'> }) => { if (vivant && d.etat === 'ok' && d.data) setPropose({ ...d.data, cle }); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [cle, lu?.disponible]);
  /** L'origine a-t-elle été mise D'ELLE-MÊME par une case (décocher l'efface) ? Un choix dans la liste la rend « à la main ». */
  const [origineAuto, setOrigineAuto] = useState(false);
  // Les cases suivent le bien tant qu'on n'y a pas touché (une fois par bien) — PRÉ-REMPLISSAGE, toujours modifiable.
  const [gestionPourLot, setGestionPourLot] = useState<number | null>(null);
  useEffect(() => {
    if (sansPreremplissage || propose === null || propose.cle !== cle || lotId === null || gestionPourLot === lotId) return;
    setGestionPourLot(lotId);
    if (propose.cas === undefined) {
      // Un serveur d'avant le 24/10/2026 : le comportement d'avant (« Relocation » proposée si le bien était déjà en gestion).
      onChange({ ...s, avecGestion: propose.avecGestion, categoriePrime: s.categoriePrime ?? propose.categoriePrime,
        ...(propose.enGestionAvant === true && s.origineContact === null ? { origineContact: 'relocation' as const } : {}) });
      return;
    }
    /* 🔴 Arno (24/10/2026) — première location d'un nouveau mandat → « Nouveau mandat » + prime 150 € ; relocation → « Bien en gestion
       chez nous », aucune prime, origine « Relocation » ; prime déjà versée → « Bien en gestion », aucune prime ; hors gestion → rien. */
    const p = preremplissageGestion(propose.cas);
    // 🔴 Arno (24/10/2026) — l'origine suit les cases pré-cochées (`origineApresCases`) : « Relocation » l'impose ; « Nouvelle gestion »
    // ET un propriétaire déjà client avant la signature : « Propriétaire déjà client ».
    const r = lu?.annuaire === true ? origineApresCases({ origine: s.origineContact ?? null, auto: origineAuto, avecGestion: p.avecGestion,
      mandatGestion: p.mandatGestion, dejaClient: propose.origineProprietaire === 'deja' && lu?.dejaClient === true }) : null;
    if (r !== null) setOrigineAuto(r.auto);
    onChange({ ...s, avecGestion: p.avecGestion, mandatGestion: p.mandatGestion, categoriePrime: s.categoriePrime ?? propose.categoriePrime,
      ...(lu?.annuaire === true && s.primeMode !== 'personnalise' ? { primeMode: p.primeMode } : {}),
      ...(r !== null && r.origine !== (s.origineContact ?? null) ? champsOrigine(r.origine) : {}) });
  }, [propose, cle, lotId, gestionPourLot, s, onChange, lu?.annuaire, lu?.dejaClient, origineAuto, sansPreremplissage]);
  const deduit = propose !== null && propose.cle === cle ? propose : null;

  // « + Nouvel apporteur » : une petite carte, enregistrée tout de suite (le référentiel), puis choisie.
  const [nouveau, setNouveau] = useState<{ nom: string; type: TypeApporteur; taux: string; collegueId: number | null; societe: string; telephone: string; email: string } | null>(null);
  const [motifNouveau, setMotifNouveau] = useState<string | null>(null);
  const [envoiNouveau, setEnvoiNouveau] = useState(false);
  const creerApporteur = async (): Promise<void> => {
    if (nouveau === null) return;
    setEnvoiNouveau(true); setMotifNouveau(null);
    const r = await posterSuivi({ action: 'creer-apporteur', apporteur: { ...nouveau, depuis: aujourdhuiParis() } });
    setEnvoiNouveau(false);
    if (r.motif !== null) { setMotifNouveau(r.motif); return; }
    const id = (r.data as { id?: number } | undefined)?.id ?? null;
    setNouveau(null);
    parametres.rafraichir();
    if (id !== null) poser({ apporteurId: id, apporteurTaux: '', commissionApporteur: '', ...(lu?.annuaire ? { origineContact: 'apporteur' as const } : {}) });
  };
  /* Arno (24/10/2026) — l'annuaire COMPLET en modale ; fermée, la liste du champ est relue (apporteur créé ou rattaché). */
  const [annuaireOuvert, setAnnuaireOuvert] = useState(false);
  const nouvelApporteur = () => setNouveau({ nom: '', type: 'partenaire', taux: '', collegueId: lu?.moi ?? null, societe: '', telephone: '', email: '' });

  if (lu === null) return <p className={parametres.erreur ? 'gst-erreur' : 'gst-info'} role={parametres.erreur ? 'alert' : 'status'}>{parametres.erreur ?? 'Chargement…'}</p>;
  if (!lu.disponible) {
    return (
      <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} role="status" data-suivi-sans-migration>
        Mise à jour de la base à appliquer (migration 406) : le suivi commercial (date de signature, négociateur, apporteur…) ne sera pas
        enregistré. Le locataire et ses conditions d’entrée s’enregistrent comme d’habitude.</p>
    );
  }
  const actifs = lu.apporteurs.filter((a) => !a.archive);
  const apporteur = actifs.find((a) => a.id === s.apporteurId) ?? null;
  const dateRef = /^\d{4}-\d{2}-\d{2}$/.test(s.dateSignature) ? s.dateSignature : aujourdhuiParis();
  const baremeDuJour = apporteur === null ? null : baremeADate(apporteur, dateRef);
  const annuaire = lu.annuaire;
  // 407 — l'apporteur ne se choisit qu'avec l'origine « Apporteur d'affaires » ; sans la 407, comme avant (toujours).
  const avecApporteur = !annuaire || s.origineContact === 'apporteur';
  const collegueRattache = apporteur === null ? null : collegueADate(apporteur, dateRef);
  const tauxRetenu = (() => { const t = lireTauxPourcent(s.apporteurTaux); return t === undefined || t === null ? baremeDuJour?.taux ?? null : t; })();
  const caHt = (lireMontant(htProprietaire) ?? 0) + (lireMontant(htLocataire) ?? 0);
  // Le TOTAL HT, en direct : vide tant que rien n'est saisi ; « montant illisible » si l'un des deux l'est.
  const totalHonorairesHt = (() => {
    const p = lireMontant(htProprietaire); const l = lireMontant(htLocataire);
    if (p === undefined || l === undefined) return 'montant illisible';
    return p === null && l === null ? '' : ecrire((p ?? 0) + (l ?? 0));
  })();
  const commissionProposee = tauxRetenu === null ? null : caHt * tauxRetenu;
  const regleDuJour = versionADate(lu.regles, dateRef);
  const categorie: CategoriePrime = s.categoriePrime ?? typeBien?.type ?? deduit?.categoriePrime ?? 'logement';
  const parkingPermis = typeBien === undefined || typeBien?.parkingPermis === true || (typeBien === null && categorie === 'parking');
  const primeRegle = regleDuJour === null ? 150 : montantPrime(regleDuJour, categorie);
  const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  /* 🔴 Arno (24/10/2026, 413) — LA COMMISSION DE L'APPORTEUR, EN DIRECT : la même règle que le Suivi (`tableauBord`), sur ce que l'écran
     porte (honoraires HT, loyer des conditions d'entrée, taux du bail ou de la règle, taux de gestion du bien). */
  const modeRegle: ModeApporteur = baremeDuJour?.mode ?? 'one_shot';
  const tauxGestionSaisi = lireTauxPourcent(s.apporteurTauxGestion ?? '');
  const ligneDirecte: ActiviteCalcul | null = apporteur === null ? null : {
    id: 'direct', type: s.type, dateSignature: dateRef, libelleProprietaire: '', libelleLocataire: '',
    honoProprietaireHt: lireMontant(htProprietaire) ?? 0, honoLocataireHt: lireMontant(htLocataire) ?? 0, primeSaisie: null,
    mandatGestion: s.mandatGestion, categoriePrime: null, apporteurId: apporteur.id, apporteurNom: apporteur.nom,
    apporteurTaux: (() => { const t = lireTauxPourcent(s.apporteurTaux); return t === undefined ? null : t; })(),
    commissionSaisie: (() => { const c = lireMontant(s.commissionApporteur ?? ''); return c === undefined ? null : c; })(),
    negociateurId: null, negociateurLibelle: '', avecGestion: s.avecGestion, origineProprietaire: null, origineLocataire: null,
    loyerHc: (() => { const l = lireMontant(loyer?.principal ?? ''); return l === undefined ? null : l; })(),
    charges: (() => { const c = lireMontant(loyer?.provisions ?? ''); return c === undefined ? null : c; })(),
    assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache',
    apporteurMode: s.apporteurMode ?? null, apporteurTauxGestion: tauxGestionSaisi === undefined ? null : tauxGestionSaisi,
    tauxGestionBien: deduit?.tauxGestionBien ?? null,
  };

  const primeBloquee = deduit?.primeDejaVersee ?? null;
  /* 🔴 Arno (24/10/2026) — les deux cases sont EXCLUSIVES : cocher l'une décoche l'autre. La prime suit « Nouveau mandat ». */
  /* 🔴 Arno (24/10/2026, après c308b3cf) — l'origine SUIT les deux cases, en direct (`origineApresCases`) : « Relocation » l'impose ;
     « Nouvelle gestion » l'interdit (→ « Propriétaire déjà client » si le propriétaire l'était avant la signature, sinon à choisir) ;
     décocher efface ce qu'une case avait mis d'elle-même ; un choix fait à la main et cohérent reste. */
  const origineSelon = (cases: { avecGestion: boolean; mandatGestion: boolean }): Partial<SaisieSuivi> => {
    if (!annuaire) return {};
    const r = origineApresCases({ origine: s.origineContact ?? null, auto: origineAuto, ...cases,
      dejaClient: lu.dejaClient === true && deduit?.origineProprietaire === 'deja' });
    setOrigineAuto(r.auto);
    return r.origine === (s.origineContact ?? null) ? {} : champsOrigine(r.origine);
  };
  const cocherGestion = (v: boolean): void => poser({ avecGestion: v, ...(v ? { mandatGestion: false } : {}),
    ...(v && annuaire && s.primeMode !== 'personnalise' ? { primeMode: 'aucune' as const } : {}),
    ...origineSelon({ avecGestion: v, mandatGestion: v ? false : s.mandatGestion }) });
  const cocherMandat = (v: boolean): void => poser({ mandatGestion: v, ...(v ? { avecGestion: false } : {}),
    ...origineSelon({ avecGestion: v ? false : s.avecGestion, mandatGestion: v }),
    // 407 — un mandat signé avec la location : « 150 € » par défaut ; décoché : « Aucune » (un montant personnalisé reste).
    ...(annuaire && s.primeMode !== 'personnalise' ? { primeMode: v ? 'regle' as const : 'aucune' as const } : {}) });
  const libelle = (mot: React.ReactNode, oblig = false) => <span className="loc-suivi-libelle">{mot}{oblig && <> <span className="loc-oblig">*</span></>}</span>;

  return (
    <div className="loc-suivi" data-suivi-commercial>
      {/* ── Ligne 1 : date de signature · nature · négociateur ── */}
      <div className="loc-grille loc-suivi-ligne" data-suivi-ligne="1">
        <label className="loc-champ">{libelle('Date de signature du bail', true)}
          <input type="date" value={s.dateSignature} required onChange={(e) => poser({ dateSignature: e.target.value })} data-date-signature /></label>
        <label className="loc-champ">{libelle('Nature')}
          <ListeChoix options={NATURES} valeur={s.type} vide={null} libelle="Nature"
            onChange={(v) => poser({ type: v === 'avenant' ? 'avenant' : 'bail' })} donnees={{ 'data-type-activite': '' }} /></label>
        <label className="loc-champ">{libelle('Négociateur')}
          <ListeChoix options={lu.negociateurs} valeur={s.negociateurId === null || s.negociateurId === undefined ? '' : String(s.negociateurId)} vide="— aucun —" libelle="Négociateur"
            onChange={(v) => poser({ negociateurId: v === '' ? null : Number(v) })} donnees={{ 'data-negociateur': '' }} /></label>
      </div>
      {/* ── Ligne 2 : les deux cases (exclusives) · prime de gestion · prime de nouvelle gestion (toujours visibles) ── */}
      <div className="loc-grille loc-suivi-ligne" data-suivi-ligne="2">
        <div className="loc-champ">{libelle('Portefeuille de gestion')}
          <label className={`loc-suivi-case${s.avecGestion ? ' loc-suivi-case--cochee' : ''}`}>
            <input type="checkbox" checked={s.avecGestion} onChange={(e) => cocherGestion(e.target.checked)} data-avec-gestion />
            <span>Relocation</span></label>
          {deduit !== null && <small className="loc-muet">D’après la fiche du bien : {deduit.avecGestion ? 'en gestion' : 'pas en gestion'}.</small>}</div>
        <div className="loc-champ">{libelle('Nouvelle gestion')}
          <label className={`loc-suivi-case${s.mandatGestion ? ' loc-suivi-case--cochee' : ''}${primeBloquee !== null && !s.mandatGestion ? ' loc-suivi-case--inactive' : ''}`}>
            <input type="checkbox" checked={s.mandatGestion} disabled={primeBloquee !== null && !s.mandatGestion} onChange={(e) => cocherMandat(e.target.checked)} data-mandat-gestion />
            <span>Nouveau mandat de gestion signé (prime)</span></label>
          {primeBloquee !== null && <small className="loc-muet" data-prime-deja-versee>{motPrimeDejaVersee(primeBloquee)} : une seule prime de nouvelle gestion par bien.</small>}</div>
        {annuaire && (
          <label className="loc-champ">{libelle('Prime de gestion')}
            <ListeChoix options={[{ id: 'regle', libelle: euros(primeRegle).replace(',00', '') }, { id: 'personnalise', libelle: 'Personnalisé' }, { id: 'aucune', libelle: 'Aucune' }]}
              valeur={s.mandatGestion ? s.primeMode ?? 'aucune' : 'aucune'} vide={null} libelle="Prime de gestion" desactive={!s.mandatGestion}
              onChange={(v) => poser({ primeMode: v as ModePrime })} donnees={{ 'data-prime-mode': '' }} /></label>
        )}
        {/* 🔴 Arno (24/10/2026) — « Prime de nouvelle gestion » devient « TYPE DE BIEN » : pré-rempli d'après les lots loués ;
            « Parking » seulement si tous les lots loués sont des parkings. */}
        <label className="loc-champ">{libelle('Type de bien')}
          <ListeChoix options={CATEGORIES_PRIME.filter((c) => c !== 'parking' || parkingPermis).map((c) => ({ id: c, libelle: LIBELLE_CATEGORIE_PRIME[c] }))} valeur={categorie} vide={null}
            libelle="Type de bien" desactive={!s.mandatGestion || (annuaire && s.primeMode !== 'regle')}
            onChange={(v) => poser({ categoriePrime: (CATEGORIES_PRIME as readonly string[]).includes(v) ? v as CategoriePrime : 'logement' })} donnees={{ 'data-categorie-prime': '' }} /></label>
        {annuaire && s.mandatGestion && s.primeMode === 'personnalise' && (
          <label className="loc-champ">{libelle('Montant de la prime', true)}
            <CaseEuros value={s.primeMontant ?? ''} placeholder="ex. 15" onChange={(e) => poser({ primeMontant: e.target.value })} data-prime-montant /></label>
        )}
      </div>
      {/* ── Ligne 3 : honoraires HT ── */}
      {/* 🔴 Arno (24/10/2026, après 56700ffb) — trois colonnes de même largeur : propriétaire HT · locataire HT · TOTAL HT (lecture seule).
          Arno (24/10/2026, accord explicite) : les trois aides sous ces champs sont retirées ; les champs restent liés (HT ↔ TTC). */}
      <div className="loc-grille loc-suivi-ligne loc-suivi-ligne--trois" data-suivi-ligne="3">
        <label className="loc-champ">{libelle('Honoraires propriétaire HT')}
          <CaseEuros value={htProprietaire} placeholder="ex. 416,67" data-hono-proprietaire-ht
            onChange={(e) => { const v = e.target.value; setFrappe((f) => ({ ...f, proprietaire: v })); const t = ttcDepuisHt(v); if (t !== null) onTtcProprietaire(t); }}
            onBlur={() => setFrappe((f) => ({ ...f, proprietaire: null }))} />
        </label>
        <label className="loc-champ">{libelle('Honoraires locataire HT')}
          <CaseEuros value={htLocataire} placeholder="ex. 226,95" data-hono-locataire-ht
            onChange={(e) => { const v = e.target.value; setFrappe((f) => ({ ...f, locataire: v })); const t = ttcDepuisHt(v); if (t !== null) onTtcLocataire(t); }}
            onBlur={() => setFrappe((f) => ({ ...f, locataire: null }))} />
        </label>
        <label className="loc-champ">{libelle('Total des honoraires (HT)')}
          <CaseEuros value={totalHonorairesHt} readOnly tabIndex={-1} aria-readonly="true" className="loc-suivi-lecture" data-hono-total-ht /></label>
      </div>
      {/* ── Ligne 4 : origine du contact propriétaire, puis l'apporteur d'affaires quand il s'affiche ── */}
      {(annuaire || avecApporteur) && (
        <div className="loc-grille loc-suivi-ligne loc-suivi-ligne--deux" data-suivi-ligne="4" data-origine-contact-bloc={annuaire ? '' : undefined}>
          {annuaire && (
            <label className="loc-champ">{libelle('Origine du contact propriétaire', true)}
              {/* « Relocation » n'est choisissable qu'avec la case « Relocation » (grisée sinon) ; la case cochée l'IMPOSE (liste figée). */}
              <ListeChoix options={originesProposees(lu.personnalisable === true, lu.dejaClient === true).map((o) => ({ id: o, libelle: LIBELLE_ORIGINE_CONTACT[o],
                ...(o === 'relocation' && !s.avecGestion ? { bloque: true, mention: ' — cochez « Relocation »' } : {}) }))} valeur={s.origineContact ?? ''}
                libelle="Origine du contact propriétaire" donnees={{ 'data-origine-contact': '' }} desactive={s.avecGestion}
                onChange={(x) => { setOrigineAuto(false); poser(champsOrigine(x === '' ? null : x as OrigineContact)); }} />
              {s.avecGestion && <small className="loc-muet" data-origine-imposee>Imposée par « Relocation » (portefeuille de gestion).</small>}
              {deduit?.cas === 'relocation' && <small className="loc-muet">Le bien a déjà été loué dans notre portefeuille de gestion : « Relocation » proposée.</small>}</label>
          )}
          {annuaire && s.origineContact === 'personnalise' && (
            <label className="loc-champ">{libelle('Origine personnalisée', true)}
              <input value={s.origineContactPrecision ?? ''} maxLength={PRECISION_ORIGINE_MAX} placeholder="ex. Salon de l’immobilier" required
                onChange={(e) => poser({ origineContactPrecision: e.target.value })} data-origine-precision />
              <small className="loc-muet">{PRECISION_ORIGINE_MAX} caractères au plus.</small></label>
          )}
          {annuaire && s.origineContact === 'collegue' && (
            <label className="loc-champ">{libelle('Collègue', true)}
              <ListeChoix options={lu.collegues} valeur={s.collegueId === null || s.collegueId === undefined ? '' : String(s.collegueId)} libelle="Collègue"
                onChange={(v) => poser({ collegueId: v === '' ? null : Number(v) })} donnees={{ 'data-collegue': '' }} /></label>
          )}
          {avecApporteur && (
            <label className="loc-champ">
              <span className="loc-suivi-libelle loc-suivi-libelle--action">
                <span>Apporteur d’affaires{annuaire && <> <span className="loc-oblig">*</span></>}</span>
                <button type="button" className="loc-suivi-annuaire" onClick={(e) => { e.preventDefault(); setAnnuaireOuvert(true); }} data-ouvrir-annuaire>Ouvrir l’annuaire</button>
              </span>
              {/* Un apporteur « à rattacher » reste MONTRÉ dans la liste, avec sa mention, sans être choisissable. Arno (24/10/2026,
                  accord explicite) : l'aide qui le redisait sous le champ est retirée — le champ s'aligne sur son voisin de gauche. */}
              <ListeChoix valeur={s.apporteurId === null || s.apporteurId === undefined ? '' : String(s.apporteurId)} vide={annuaire ? '— choisir dans l’annuaire —' : '— aucun —'}
                options={[...[...trierApporteurs(actifs.filter(estInterne)), ...trierApporteurs(actifs.filter((a) => !estInterne(a)))].map((a) => {
                  // Arno (24/10/2026, 414) — « NOM Prénom », dans l'ordre alphabétique des noms de famille (une structure par son nom).
                  // 🔴 419 — GROUPÉS : les internes (badge « INTERNE »), puis les partenaires externes ; rien d'autre ne change.
                  const bloque = annuaire && aRattacher(a);
                  const interne = estInterne(a);
                  return { id: a.id, libelle: interne ? `${libelleApporteur(a)} (${badgeApporteur(a)})` : `${libelleApporteur(a)} (${LIBELLE_TYPE_APPORTEUR[a.type]})`, bloque,
                    mention: bloque ? ' — à rattacher' : undefined, ...(annuaire ? { groupe: interne ? 'Internes' : 'Partenaires externes' } : {}) };
                }), { id: '+', libelle: '+ Nouvel apporteur…' }]}
                libelle="Apporteur d’affaires" donnees={{ 'data-apporteur': '' }}
                onChange={(v) => { if (v === '+') { nouvelApporteur(); return; } poser({ apporteurId: v === '' ? null : Number(v), apporteurTaux: '', commissionApporteur: '', apporteurMode: null, apporteurTauxGestion: '' }); }} />
              {annuaire && apporteur !== null && (estInterne(apporteur)
                ? <small className="loc-muet" data-collegue-rattache>Apporteur interne — rattaché à personne</small>
                : <small className="loc-muet" data-collegue-rattache>Collègue de rattachement : {collegueRattache?.collegueLibelle ?? 'à rattacher'}</small>)}
              {/* 🔴 Arno (24/10/2026) — les conditions de l'apporteur choisi, gestion comprise : aucun 0 % implicite (création rapide comprise). */}
              {apporteur !== null && (
                <small className="loc-muet" data-conditions-apporteur-choisi>{baremeDuJour === null ? 'Conditions : aucun taux à cette date'
                  : `Conditions : ${LIBELLE_MODE_APPORTEUR[baremeDuJour.mode ?? 'one_shot']} — location ${pourcent(baremeDuJour.taux)} · gestion : ${pourcent(baremeDuJour.tauxGestion ?? 0)}`}</small>
              )}</label>
          )}
          {avecApporteur && apporteur !== null && (
            <label className="loc-champ">{libelle('Taux appliqué à ce bail (%)')}
              <input inputMode="decimal" value={s.apporteurTaux} onChange={(e) => poser({ apporteurTaux: e.target.value })} data-apporteur-taux
                placeholder={baremeDuJour === null ? 'aucun taux à cette date' : pourcent(baremeDuJour.taux).replace(' %', '')} />
              <small className="loc-muet">{baremeDuJour === null ? 'Aucun taux daté à la signature : saisissez-le.' : `Vide = le taux de l’apporteur à la signature (${pourcent(baremeDuJour.taux)}).`}</small></label>
          )}
          {avecApporteur && apporteur !== null && (
            <label className="loc-champ">{libelle('Mode de commission')}
              <ListeChoix options={MODES_APPORTEUR.map((m) => ({ id: m, libelle: LIBELLE_MODE_APPORTEUR[m] }))} valeur={s.apporteurMode ?? modeRegle} vide={null}
                libelle="Mode de commission" onChange={(v) => poser({ apporteurMode: v === 'recurrent' ? 'recurrent' : 'one_shot' })}
                donnees={{ 'data-apporteur-mode': '' }} />
              <small className="loc-muet">Proposé par la règle de l’apporteur ({LIBELLE_MODE_APPORTEUR[modeRegle]}) — modifiable pour ce bail.</small></label>
          )}
          {avecApporteur && apporteur !== null && (
            <label className="loc-champ">{libelle('Taux sur la gestion (%)')}
              <input inputMode="decimal" value={s.apporteurTauxGestion ?? ''} onChange={(e) => poser({ apporteurTauxGestion: e.target.value })} data-apporteur-taux-gestion
                placeholder={pourcent(baremeDuJour?.tauxGestion ?? 0).replace(' %', '')} />
              <small className="loc-muet">Vide = le taux de l’apporteur à la signature ({pourcent(baremeDuJour?.tauxGestion ?? 0)}).</small></label>
          )}
          {avecApporteur && apporteur !== null && annuaire && (
            <label className="loc-champ">{libelle('Honoraires d’apporteur')}
              <CaseEuros value={s.commissionApporteur ?? ''} onChange={(e) => poser({ commissionApporteur: e.target.value })} data-commission-apporteur
                placeholder={commissionProposee === null ? '' : commissionProposee.toFixed(2).replace('.', ',')} />
              <small className="loc-muet">{commissionProposee === null ? 'Saisissez le montant.' : `Vide = proposé au taux : ${euros(commissionProposee)}.`}</small></label>
          )}
        </div>
      )}
      {avecApporteur && ligneDirecte !== null && <EncartCommission a={ligneDirecte} apporteur={apporteur!} euros={euros} />}
      {annuaireOuvert && (
        <ModaleAnnuaireApporteurs
          onFermer={() => { setAnnuaireOuvert(false); parametres.rafraichir(); }}
          onChoisir={(a) => {
            setAnnuaireOuvert(false);
            parametres.rafraichir();
            poser({ apporteurId: a.id, apporteurTaux: '', commissionApporteur: '', ...(annuaire ? { origineContact: 'apporteur' as const, collegueId: null, origineContactPrecision: '' } : {}) });
          }} />
      )}
      {nouveau !== null && (
        <div className="loc-suivi-nouveau" data-nouvel-apporteur>
          <p className="loc-muet" style={{ margin: 0 }}>Nouvel apporteur : il rejoint le référentiel (roue « Paramètres Location ») ; son taux vaut à partir d’aujourd’hui.</p>
          <div className="loc-grille">
            <label className="loc-champ">Nom<input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} data-nouvel-apporteur-nom /></label>
            <label className="loc-champ">Type
              <ListeChoix options={TYPES_APPORTEUR.map((t) => ({ id: t, libelle: LIBELLE_TYPE_APPORTEUR[t] }))} valeur={nouveau.type} vide={null} libelle="Type d’apporteur"
                onChange={(v) => setNouveau({ ...nouveau, type: v as TypeApporteur })} donnees={{ 'data-nouvel-apporteur-type': '' }} /></label>
            <label className="loc-champ">Taux de commission (%)<input inputMode="decimal" value={nouveau.taux} placeholder="ex. 10" onChange={(e) => setNouveau({ ...nouveau, taux: e.target.value })} />
              <small className="loc-muet" data-nouvel-apporteur-gestion>One shot · gestion : 0 % (modifiable ensuite dans l’annuaire, panneau « Taux »)</small></label>
            {annuaire && (
              <>
                <label className="loc-champ"><span>Collègue de rattachement <span className="loc-oblig">*</span></span>
                  <ListeChoix options={lu.collegues} valeur={nouveau.collegueId === null || nouveau.collegueId === undefined ? '' : String(nouveau.collegueId)} libelle="Collègue de rattachement"
                    onChange={(v) => setNouveau({ ...nouveau, collegueId: v === '' ? null : Number(v) })} donnees={{ 'data-nouvel-apporteur-collegue': '' }} /></label>
                <label className="loc-champ">Société (facultatif)<input value={nouveau.societe} onChange={(e) => setNouveau({ ...nouveau, societe: e.target.value })} /></label>
                <label className="loc-champ">Téléphone (facultatif)<input inputMode="tel" value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} /></label>
                <label className="loc-champ">E-mail (facultatif)<input inputMode="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} /></label>
              </>
            )}
          </div>
          {motifNouveau !== null && <p className="loc-manque" role="alert">{motifNouveau}</p>}
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setNouveau(null); setMotifNouveau(null); }} disabled={envoiNouveau}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void creerApporteur(); }} disabled={envoiNouveau} data-creer-apporteur>
              {envoiNouveau ? 'Enregistrement…' : 'Ajouter l’apporteur'}</button>
          </div>
        </div>
      )}
      {/* 🔴 Arno (24/10/2026, accord explicite) — le bloc « Origine client » (Propriétaire / Locataire) est retiré du formulaire :
          l'origine client reste DÉDUITE à l'enregistrement (`deduireOrigines`), affichée et filtrable dans le Suivi et les exports. */}
      {manque}
    </div>
  );
}

/**
 * 🔴 Arno (24/10/2026, 413) — L'ENCART « COMMISSION DE L'APPORTEUR », sous la ligne Origine / Apporteur, sur trame grise, recalculé à
 * chaque frappe : « One shot » → part location · part gestion (1ʳᵉ année) · prime apporteur (la somme) ; « Récurrent » → part
 * location (une fois) · part gestion par mois tant que le bien est en gestion. Le détail du calcul en info-bulle.
 */
export function EncartCommission({ a, apporteur, euros: eurosTexte }: { a: ActiviteCalcul; apporteur: Apporteur; euros: (x: number) => string }) {
  // Un montant ne se coupe jamais de son « € » (espace insécable), même au téléphone.
  const euros = (x: number): string => eurosTexte(x).replace(/ €$/, '\u00a0€');
  const aps = [apporteur];
  const location = partLocationDe(a, aps);
  const h = honorairesGestionDuBail(a);
  const mode = a.apporteurMode ?? baremeADate(apporteur, a.dateSignature)?.mode ?? 'one_shot';
  const tauxGestion = a.apporteurTauxGestion ?? baremeADate(apporteur, a.dateSignature)?.tauxGestion ?? 0;
  const tauxLocation = a.apporteurTaux ?? baremeADate(apporteur, a.dateSignature)?.taux ?? 0;
  const pct = (x: number): string => pourcent(x);
  const ca = a.honoProprietaireHt + a.honoLocataireHt;
  const gestionUneFois = partGestionSignatureDe(a, aps);
  const gestionMois = partGestionMensuelleDe(a, aps);
  const detail = (
    <span className="loc-bulle-calcul" data-detail-calcul="commission-apporteur">
      <span>Honoraires de location HT : {euros(a.honoProprietaireHt)} + {euros(a.honoLocataireHt)} = <strong>{euros(ca)}</strong></span>
      <span>Part location : {a.commissionSaisie !== null ? <>montant saisi = <strong>{euros(location)}</strong></> : <>{euros(ca)} × {pct(tauxLocation)} = <strong>{euros(location)}</strong></>}</span>
      {'montant' in h ? (
        <>
          <span>Honoraires de gestion mensuels HT : ({euros(a.loyerHc ?? 0)} + {euros(a.charges ?? 0)}) × {String(a.tauxGestionBien).replace('.', ',')} % = <strong>{euros(h.montant)}</strong></span>
          <span>Part gestion : {mode === 'one_shot'
            ? <>{euros(h.montant)} × 12 × {pct(tauxGestion)} = <strong>{euros(gestionUneFois)}</strong></>
            : <>{euros(h.montant)} × {pct(tauxGestion)} = <strong>{euros(gestionMois)}</strong> / mois</>}</span>
        </>
      ) : <span>Part gestion : 0 € — {MOT_MANQUE_GESTION[h.manque]}.</span>}
    </span>
  );
  return (
    <div className="loc-suivi-ligne loc-suivi-commission" data-commission-apporteur-direct={mode} aria-live="polite">
      <p className="loc-suivi-commission-texte">
        <strong>{LIBELLE_MODE_APPORTEUR[mode]}</strong>{' — '}
        {mode === 'one_shot' ? (
          <span data-commission-texte>Part location : {euros(location)} · Part gestion (1<sup>re</sup> année) : {euros(gestionUneFois)} · Prime apporteur : {euros(location + gestionUneFois)}</span>
        ) : (
          <span data-commission-texte>Part location (une fois) : {euros(location)} · Part gestion : {euros(gestionMois)} / mois tant que le bien est en gestion</span>
        )}
        <InfoBulle libelle="Commission de l’apporteur" etiquette="Détail du calcul" cible="commission-apporteur" contenu={detail} dansLEcran />
      </p>
      {'manque' in h && <small className="loc-muet" data-commission-manque>Part gestion : 0 € — {MOT_MANQUE_GESTION[h.manque]}.</small>}
    </div>
  );
}

export const CSS_SUIVI_COMMERCIAL = `
.loc-suivi-commission{display:flex;flex-direction:column;gap:6px}
.loc-suivi-commission-texte{margin:0;color:var(--color-svv-ink);font-weight:600;line-height:1.5;overflow-wrap:anywhere}
.loc-suivi-commission-texte .svv-ib,.loc-suivi-commission-texte > span:last-child{margin-left:6px;vertical-align:middle}
.loc-suivi{display:flex;flex-direction:column;gap:12px}
:where(.loc-suivi) select,:where(.loc-suivi) input:not([type=checkbox]){min-height:44px}
/* Arno (24/10/2026) — PRESENTATION HOMOGENE : les libelles d'une ligne sur la meme ligne de base (meme boite, meme hauteur), les
   champs alignes en haut ; la liste du negociateur (ListeChoix) et les cases prennent l'allure des autres champs du bloc. */
.loc-suivi-ligne,.loc-ample .loc-grille.loc-suivi-ligne{align-items:start}
/* Arno (24/10/2026) — RELIEF : chaque ligne sur une trame gris clair arrondie (en sombre : un peu plus claire que le fond) ; les
   champs restent sur leur fond (blanc en clair). */
.loc-suivi-ligne{background:var(--color-svv-field);border-radius:16px;padding:12px 14px}
/* La ligne 4 (origine du contact propriétaire / apporteur) : DEUX colonnes fixes — l'origine garde sa demi-ligne, que l'apporteur
   (ou le texte de « Personnalisé ») soit là ou non ; rien ne saute. Une colonne au telephone. */
.loc-suivi-ligne--deux,.loc-ample .loc-grille.loc-suivi-ligne--deux{grid-template-columns:repeat(2,minmax(0,1fr))}
/* Arno (24/10/2026) — la ligne des honoraires : TROIS colonnes de meme largeur ; au telephone, l'une sous l'autre. */
.loc-suivi-ligne--trois,.loc-ample .loc-grille.loc-suivi-ligne--trois{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:640px){.loc-suivi-ligne--trois,.loc-ample .loc-grille.loc-suivi-ligne--trois{grid-template-columns:minmax(0,1fr)}}
/* Le total : le meme champ, meme style, en lecture seule (texte en gras), jamais saisissable. */
.loc-ample .loc-suivi .loc-champ input.loc-suivi-lecture{font-weight:700;cursor:default}
/* Arno (24/10/2026) — TOUS les champs d'argent : « € » DANS le champ, a droite (la case des conditions d'entree), le texte ne passe
   jamais dessous. Les intitules ne portent plus « (€) ». */
.loc-ample .loc-suivi .loc-champ .loc-case-euros input{padding-right:2.4em}
@media (max-width:640px){.loc-suivi-ligne--deux,.loc-ample .loc-grille.loc-suivi-ligne--deux{grid-template-columns:minmax(0,1fr)}}
/* Tous les libelles ont la MEME hauteur, celle du bouton « Ouvrir l'annuaire » : les libelles d'une ligne restent sur la meme ligne
   de base et les champs a la meme hauteur, bouton ou non. */
.loc-suivi-libelle{display:flex;align-items:center;gap:8px;min-height:32px;line-height:1.3}
/* Au repos (et apres un choix a la souris), la bordure grise des autres champs ; l'encre n'apparait qu'au focus clavier. */
.loc-ample .loc-suivi .loc-champ input:focus:not(:focus-visible),.loc-ample .loc-suivi .loc-champ select:focus:not(:focus-visible){border-color:var(--color-svv-line)}
.loc-suivi .loc-champ small{font-size:.78rem}
.loc-suivi-libelle--action{justify-content:space-between}
.loc-suivi-annuaire{appearance:none;border:1px solid var(--color-svv-line-strong);border-radius:999px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.8rem;font-weight:700;min-height:32px;padding:0 12px;cursor:pointer;white-space:nowrap}
.loc-suivi-annuaire:hover{border-color:var(--color-svv-ink)}
.loc-suivi-annuaire:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.loc-suivi .lch-champ{min-height:44px;border:1px solid var(--color-svv-line);border-radius:9px;font-size:inherit}
.loc-ample .loc-suivi .lch-champ{min-height:58px;font-size:1.1rem;border:2px solid var(--color-svv-line);border-radius:16px;padding:0 16px}
/* Arno (24/10/2026) — sur cette page, les listes maison sont VERTES (surlignage vert pale, texte et coche vert fonce, contour du champ
   ouvert vert), en clair comme en sombre (jetons du theme) : plus aucun rouge dans ces listes. */
.loc-suivi .lch-champ:focus-visible,.loc-suivi .lch-champ[aria-expanded="true"]{outline-color:var(--color-svv-green-ink)}
.loc-suivi select:disabled{opacity:.6;cursor:not-allowed}
/* Arno (24/10/2026) — LA DATE DE SIGNATURE a EXACTEMENT l'allure de « Nature » et « Négociateur » (la liste maison .lch-champ) :
   meme hauteur, bordure, rayon, police, marge interieure ; l'icone calendrier a droite, a la place du chevron (16 px du bord). */
.loc-suivi input[type=date]{-webkit-appearance:none;appearance:none;display:flex;align-items:center;width:100%;min-width:0;height:44px;min-height:44px;box-sizing:border-box;border:1px solid var(--color-svv-line);border-radius:9px;padding:0 10px;margin:0;font:inherit;font-weight:400;line-height:normal;color:var(--color-svv-ink);background:var(--color-svv-surface);text-align:left}
.loc-ample .loc-suivi .loc-champ input[type=date]{height:58px;min-height:58px;border:2px solid var(--color-svv-line);border-radius:16px;padding:0 16px;font-size:1.1rem;font-weight:400}
.loc-suivi input[type=date]{position:relative}
.loc-suivi input[type=date]::-webkit-datetime-edit{padding:0}
.loc-suivi input[type=date]::-webkit-datetime-edit-fields-wrapper{padding:0}
.loc-suivi input[type=date]::-webkit-date-and-time-value{text-align:left;margin:0}
/* l'icone : mesure dans Chrome, une marge « auto » ne la pousse pas a droite — placee comme le chevron, au bord interieur droit */
.loc-suivi input[type=date]::-webkit-calendar-picker-indicator{position:absolute;top:50%;right:10px;transform:translateY(-50%);margin:0;padding:0;width:16px;height:16px;cursor:pointer;opacity:.6}
.loc-ample .loc-suivi input[type=date]::-webkit-calendar-picker-indicator{right:16px}
/* Les deux cases : des l'ouverture la presentation de l'etat coche (taille, alignement, texte a droite) ; decochees, meme taille,
   bordure grise ; cochee, bordure rouge. */
.loc-suivi-case{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;box-sizing:border-box;border:1px solid var(--color-svv-line);border-radius:9px;background:var(--color-svv-surface);color:var(--color-svv-ink);font-weight:600;cursor:pointer}
.loc-ample .loc-suivi-case{min-height:58px;border:2px solid var(--color-svv-line);border-radius:16px;padding:0 16px;font-size:1rem}
.loc-suivi-case--cochee,.loc-ample .loc-suivi-case--cochee{border-color:var(--color-svv-red)}
.loc-suivi-case--inactive{opacity:.55;cursor:not-allowed}
.loc-suivi-case input[type=checkbox],.loc-ample .loc-suivi-case input[type=checkbox]{width:22px;height:22px;min-height:0;margin:0;padding:0;border:0;flex:0 0 auto;accent-color:var(--color-svv-red)}
.loc-suivi-nouveau{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px dashed var(--color-svv-line-strong);border-radius:12px}
`;
