'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  aRattacher, aujourdhuiParis, type Apporteur, type CategoriePrime, collegueADate, htVersTtc, LIBELLE_ORIGINE, LIBELLE_ORIGINE_CONTACT, LIBELLE_TYPE_APPORTEUR,
  lireMontant, lireTauxPourcent, type ModePrime, type Origine, ORIGINES_CONTACT, type OrigineContact, pourcent, type RegleCommission,
  type SaisieActivite, ttcVersHt, TYPES_APPORTEUR, type TypeApporteur, verifierActivite, versionADate,
} from '../../../../lib/location/suivi/suivi';
import { ENTETE_CONFIRMATION } from '../../../../lib/location/confirmationEnregistrement';

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
 */
export const API_SUIVI = '/api/admin/location/suivi';

export interface ParametresSuivi {
  disponible: boolean;
  apporteurs: Apporteur[];
  negociateurs: { id: number; libelle: string }[];
  moi: number | null;
  /** 407 — les collègues (comptes ayant accès à la Location), la règle de prime, et la migration est-elle là ? */
  collegues: { id: number; libelle: string }[];
  regles: RegleCommission[];
  annuaire: boolean;
}

export interface SaisieSuivi extends SaisieActivite { categoriePrime: CategoriePrime | null }

export { aujourdhuiParis };

export const SUIVI_VIDE = (): SaisieSuivi => ({
  type: 'bail', dateSignature: aujourdhuiParis(), honoProprietaireHt: '', honoLocataireHt: '', negociateurId: null, apporteurId: null,
  apporteurTaux: '', mandatGestion: false, avecGestion: false, origineProprietaire: null, origineLocataire: null, categoriePrime: null,
  origineContact: null, collegueId: null, commissionApporteur: '', primeMode: 'aucune', primeMontant: '',
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
    collegues: Array.isArray(o.collegues) ? o.collegues : [], regles: Array.isArray(o.regles) ? o.regles : [], annuaire: o.annuaire === true };
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

/** `propre` : l'écran a déjà sa modale (Nouveau locataire) — la confirmation de la tuile ne s'y ajoute pas. */
export async function posterSuivi(corps: Record<string, unknown>, o: { propre?: boolean } = {}): Promise<{ motif: string | null; data?: unknown }> {
  try {
    const r = await fetch(API_SUIVI, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(o.propre ? { [ENTETE_CONFIRMATION]: 'propre' } : {}) }, body: JSON.stringify(corps) });
    const d = await r.json() as { etat?: string; motif?: string; message?: string; data?: unknown };
    if (d.etat === 'ok') return { motif: null, data: d.data };
    if (r.status === 401 || r.status === 403) return { motif: 'Accès refusé : droit « Location » requis (ou session expirée).' };
    return { motif: d.motif ?? d.message ?? 'Enregistrement refusé.' };
  } catch {
    return { motif: 'Enregistrement impossible : le serveur n’a pas répondu.' };
  }
}

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
}

export function BlocSuiviCommercial({ valeur: s, onChange, parametres, lotId, locataireIds, ttcProprietaire, ttcLocataire, onTtcProprietaire, onTtcLocataire, manque }: Props) {
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
    if (lu === null || s.negociateurId !== null || lu.moi === null || !lu.negociateurs.some((n) => n.id === lu.moi)) return;
    onChange({ ...s, negociateurId: lu.moi });
  }, [lu, s, onChange]);

  // Ce que le serveur déduit : la gestion du bien, la catégorie de prime, l'origine des clients à la date de signature.
  const [propose, setPropose] = useState<{ cle: string; avecGestion: boolean; categoriePrime: CategoriePrime; origineProprietaire: Origine | null; origineLocataire: Origine | null; enGestionAvant?: boolean } | null>(null);
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
  // « Avec gestion » suit le bien tant qu'on n'y a pas touché (une fois par bien).
  const [gestionPourLot, setGestionPourLot] = useState<number | null>(null);
  useEffect(() => {
    if (propose === null || propose.cle !== cle || lotId === null || gestionPourLot === lotId) return;
    setGestionPourLot(lotId);
    // 407 — « Relocation » proposée quand le bien était déjà en gestion avant le bail (si l'origine n'est pas déjà choisie).
    onChange({ ...s, avecGestion: propose.avecGestion, categoriePrime: s.categoriePrime ?? propose.categoriePrime,
      ...(propose.enGestionAvant === true && s.origineContact === null ? { origineContact: 'relocation' as const } : {}) });
  }, [propose, cle, lotId, gestionPourLot, s, onChange]);
  const deduit = propose !== null && propose.cle === cle ? propose : null;

  // « + Nouvel apporteur » : une petite carte, enregistrée tout de suite (le référentiel), puis choisie.
  const [nouveau, setNouveau] = useState<{ nom: string; type: TypeApporteur; taux: string; coutFixe: string; collegueId: number | null; societe: string; telephone: string; email: string } | null>(null);
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
  const nouvelApporteur = () => setNouveau({ nom: '', type: 'partenaire', taux: '', coutFixe: '', collegueId: lu?.moi ?? null, societe: '', telephone: '', email: '' });

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
  const baremeDuJour = apporteur === null ? null : versionADate(apporteur.baremes, dateRef);
  const annuaire = lu.annuaire;
  // 407 — l'apporteur ne se choisit qu'avec l'origine « Apporteur d'affaires » ; sans la 407, comme avant (toujours).
  const avecApporteur = !annuaire || s.origineContact === 'apporteur';
  const collegueRattache = apporteur === null ? null : collegueADate(apporteur, dateRef);
  const tauxRetenu = (() => { const t = lireTauxPourcent(s.apporteurTaux); return t === undefined || t === null ? baremeDuJour?.taux ?? null : t; })();
  const caHt = (lireMontant(htProprietaire) ?? 0) + (lireMontant(htLocataire) ?? 0);
  const commissionProposee = tauxRetenu === null ? null : caHt * tauxRetenu;
  const regleDuJour = versionADate(lu.regles, dateRef);
  const primeRegle = regleDuJour === null ? 150 : (s.categoriePrime ?? deduit?.categoriePrime ?? 'logement') === 'parking' ? regleDuJour.primeParking : regleDuJour.primeLogement;
  const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const origine = (cote: 'proprietaire' | 'locataire') => {
    const d = cote === 'proprietaire' ? deduit?.origineProprietaire ?? null : deduit?.origineLocataire ?? null;
    const saisie = cote === 'proprietaire' ? s.origineProprietaire : s.origineLocataire;
    return (
      <label className="loc-champ" data-origine={cote}>{cote === 'proprietaire' ? 'Propriétaire' : 'Locataire'}
        <select value={saisie ?? ''} onChange={(e) => {
          const v = e.target.value === '' ? null : e.target.value as Origine;
          poser(cote === 'proprietaire' ? { origineProprietaire: v } : { origineLocataire: v });
        }}>
          <option value="">{d === null ? 'Déduit à l’enregistrement' : `Déduit : ${LIBELLE_ORIGINE[d]}`}</option>
          <option value="nouveau">{LIBELLE_ORIGINE.nouveau} (corrigé)</option>
          <option value="deja">{LIBELLE_ORIGINE.deja} (corrigé)</option>
        </select>
      </label>
    );
  };

  return (
    <div className="loc-suivi" data-suivi-commercial>
      <div className="loc-grille">
        <label className="loc-champ"><span>Date de signature du bail <span className="loc-oblig">*</span></span>
          <input type="date" value={s.dateSignature} required onChange={(e) => poser({ dateSignature: e.target.value })} data-date-signature /></label>
        <label className="loc-champ">Nature
          <select value={s.type} onChange={(e) => poser({ type: e.target.value === 'avenant' ? 'avenant' : 'bail' })} data-type-activite>
            <option value="bail">Bail</option>
            <option value="avenant">Avenant</option>
          </select></label>
        <label className="loc-champ">Négociateur
          <select value={s.negociateurId ?? ''} onChange={(e) => poser({ negociateurId: e.target.value === '' ? null : Number(e.target.value) })} data-negociateur>
            <option value="">— aucun —</option>
            {lu.negociateurs.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
          </select></label>
      </div>
      <div className="loc-grille">
        <label className="loc-champ">Honoraires propriétaire HT (€)
          <input inputMode="decimal" value={htProprietaire} placeholder="ex. 416,67" data-hono-proprietaire-ht
            onChange={(e) => { const v = e.target.value; setFrappe((f) => ({ ...f, proprietaire: v })); const t = ttcDepuisHt(v); if (t !== null) onTtcProprietaire(t); }}
            onBlur={() => setFrappe((f) => ({ ...f, proprietaire: null }))} />
          <small className="loc-muet" data-hono-proprietaire-ttc>= {ttcProprietaire.trim() === '' ? '—' : `${ttcProprietaire} € TTC`} (Conditions d’entrée)</small></label>
        <label className="loc-champ">Honoraires locataire HT (€)
          <input inputMode="decimal" value={htLocataire} placeholder="ex. 226,95" data-hono-locataire-ht
            onChange={(e) => { const v = e.target.value; setFrappe((f) => ({ ...f, locataire: v })); const t = ttcDepuisHt(v); if (t !== null) onTtcLocataire(t); }}
            onBlur={() => setFrappe((f) => ({ ...f, locataire: null }))} />
          <small className="loc-muet" data-hono-locataire-ttc>= {ttcLocataire.trim() === '' ? '—' : `${ttcLocataire} € TTC`} (« Honoraires agence »)</small></label>
      </div>
      {annuaire && (
        <div className="loc-grille" data-origine-contact-bloc>
          <label className="loc-champ"><span>Origine du contact <span className="loc-oblig">*</span></span>
            <select value={s.origineContact ?? ''} required data-origine-contact
              onChange={(e) => {
                const v = e.target.value === '' ? null : e.target.value as OrigineContact;
                poser({ origineContact: v, ...(v !== 'apporteur' ? { apporteurId: null, apporteurTaux: '', commissionApporteur: '' } : {}), ...(v !== 'collegue' ? { collegueId: null } : {}) });
              }}>
              <option value="">— choisir —</option>
              {ORIGINES_CONTACT.map((o) => <option key={o} value={o}>{LIBELLE_ORIGINE_CONTACT[o]}</option>)}
            </select>
            {deduit?.enGestionAvant === true && <small className="loc-muet">Le bien était déjà en gestion avant ce bail : « Relocation » proposée.</small>}</label>
          {s.origineContact === 'collegue' && (
            <label className="loc-champ"><span>Collègue <span className="loc-oblig">*</span></span>
              <select value={s.collegueId ?? ''} onChange={(e) => poser({ collegueId: e.target.value === '' ? null : Number(e.target.value) })} data-collegue>
                <option value="">— choisir —</option>
                {lu.collegues.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select></label>
          )}
        </div>
      )}
      {avecApporteur && <div className="loc-grille">
        <label className="loc-champ"><span>Apporteur d’affaires{annuaire && <> <span className="loc-oblig">*</span></>}</span>
          <select value={s.apporteurId ?? ''} data-apporteur
            onChange={(e) => { if (e.target.value === '+') { nouvelApporteur(); return; } poser({ apporteurId: e.target.value === '' ? null : Number(e.target.value), apporteurTaux: '', commissionApporteur: '' }); }}>
            <option value="">{annuaire ? '— choisir dans l’annuaire —' : '— aucun —'}</option>
            {actifs.map((a) => {
              const bloque = annuaire && aRattacher(a);
              return <option key={a.id} value={a.id} disabled={bloque} data-a-rattacher={bloque ? '' : undefined}>{a.nom} ({LIBELLE_TYPE_APPORTEUR[a.type]}){bloque ? ' — à rattacher' : ''}</option>;
            })}
            <option value="+">+ Nouvel apporteur…</option>
          </select>
          {annuaire && apporteur !== null && <small className="loc-muet" data-collegue-rattache>Collègue de rattachement : {collegueRattache?.collegueLibelle ?? 'à rattacher'}</small>}
          {annuaire && actifs.some(aRattacher) && <small className="loc-muet">Un apporteur « à rattacher » se rattache à un collègue dans la roue « Paramètres Location » avant d’être choisi.</small>}</label>
        {apporteur !== null && (
          <label className="loc-champ">Taux appliqué à ce bail (%)
            <input inputMode="decimal" value={s.apporteurTaux} onChange={(e) => poser({ apporteurTaux: e.target.value })} data-apporteur-taux
              placeholder={baremeDuJour === null ? 'aucun taux à cette date' : pourcent(baremeDuJour.taux).replace(' %', '')} />
            <small className="loc-muet">{baremeDuJour === null ? 'Aucun taux daté à la signature : saisissez-le.' : `Vide = le taux de l’apporteur à la signature (${pourcent(baremeDuJour.taux)}).`}</small></label>
        )}
        {apporteur !== null && annuaire && (
          <label className="loc-champ">Honoraires d’apporteur (€)
            <input inputMode="decimal" value={s.commissionApporteur ?? ''} onChange={(e) => poser({ commissionApporteur: e.target.value })} data-commission-apporteur
              placeholder={commissionProposee === null ? '' : commissionProposee.toFixed(2).replace('.', ',')} />
            <small className="loc-muet">{commissionProposee === null ? 'Saisissez le montant.' : `Vide = proposé au taux : ${euros(commissionProposee)}.`}</small></label>
        )}
      </div>}
      {nouveau !== null && (
        <div className="loc-suivi-nouveau" data-nouvel-apporteur>
          <p className="loc-muet" style={{ margin: 0 }}>Nouvel apporteur : il rejoint le référentiel (roue « Paramètres Location ») ; son taux vaut à partir d’aujourd’hui.</p>
          <div className="loc-grille">
            <label className="loc-champ">Nom<input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} data-nouvel-apporteur-nom /></label>
            <label className="loc-champ">Type
              <select value={nouveau.type} onChange={(e) => setNouveau({ ...nouveau, type: e.target.value as TypeApporteur })}>
                {TYPES_APPORTEUR.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_APPORTEUR[t]}</option>)}
              </select></label>
            <label className="loc-champ">Taux de commission (%)<input inputMode="decimal" value={nouveau.taux} placeholder="ex. 10" onChange={(e) => setNouveau({ ...nouveau, taux: e.target.value })} /></label>
            <label className="loc-champ">Coût fixe mensuel (€, facultatif)<input inputMode="decimal" value={nouveau.coutFixe} onChange={(e) => setNouveau({ ...nouveau, coutFixe: e.target.value })} /></label>
            {annuaire && (
              <>
                <label className="loc-champ"><span>Collègue de rattachement <span className="loc-oblig">*</span></span>
                  <select value={nouveau.collegueId ?? ''} onChange={(e) => setNouveau({ ...nouveau, collegueId: e.target.value === '' ? null : Number(e.target.value) })} data-nouvel-apporteur-collegue>
                    <option value="">— choisir —</option>
                    {lu.collegues.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
                  </select></label>
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
      <div className="loc-grille">
        <label className="loc-champ loc-suivi-case"><span><input type="checkbox" checked={s.avecGestion} onChange={(e) => poser({ avecGestion: e.target.checked })} data-avec-gestion /> Bien en gestion chez nous</span>
          <small className="loc-muet">{deduit === null ? '' : `D’après la fiche du bien : ${deduit.avecGestion ? 'en gestion' : 'pas en gestion'}.`}</small></label>
        <label className="loc-champ loc-suivi-case"><span><input type="checkbox" checked={s.mandatGestion} data-mandat-gestion
          onChange={(e) => poser({ mandatGestion: e.target.checked,
            // 407 — un mandat signé avec la location : « 150 € » par défaut ; décoché : « Aucune » (un montant personnalisé reste).
            ...(annuaire && s.primeMode !== 'personnalise' ? { primeMode: e.target.checked ? 'regle' as const : 'aucune' as const } : {}) })} /> Nouveau mandat de gestion signé (prime)</span></label>
        {annuaire && (
          <label className="loc-champ">Prime de gestion
            <select value={s.primeMode ?? 'aucune'} onChange={(e) => poser({ primeMode: e.target.value as ModePrime })} data-prime-mode>
              <option value="regle">{euros(primeRegle).replace(',00', '')}</option>
              <option value="personnalise">Personnalisé</option>
              <option value="aucune">Aucune</option>
            </select></label>
        )}
        {annuaire && s.primeMode === 'personnalise' && (
          <label className="loc-champ"><span>Montant de la prime (€) <span className="loc-oblig">*</span></span>
            <input inputMode="decimal" value={s.primeMontant ?? ''} placeholder="ex. 15" onChange={(e) => poser({ primeMontant: e.target.value })} data-prime-montant /></label>
        )}
        {s.mandatGestion && (!annuaire || s.primeMode === 'regle') && (
          <label className="loc-champ">Prime de nouvelle gestion
            <select value={s.categoriePrime ?? deduit?.categoriePrime ?? 'logement'} onChange={(e) => poser({ categoriePrime: e.target.value === 'parking' ? 'parking' : 'logement' })} data-categorie-prime>
              <option value="logement">Logement</option>
              <option value="parking">Parking</option>
            </select></label>
        )}
      </div>
      <fieldset className="loc-suivi-origine">
        <legend>Origine client</legend>
        <div className="loc-grille">{origine('proprietaire')}{origine('locataire')}</div>
      </fieldset>
      {manque}
    </div>
  );
}

export const CSS_SUIVI_COMMERCIAL = `
.loc-suivi{display:flex;flex-direction:column;gap:12px}
.loc-suivi select,.loc-suivi input:not([type=checkbox]){min-height:44px}
.loc-suivi-case span{display:flex;align-items:center;gap:8px;color:var(--color-svv-ink);font-weight:600;min-height:44px}
.loc-suivi-case input{width:20px;height:20px}
.loc-suivi-nouveau{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px dashed var(--color-svv-line-strong);border-radius:12px}
.loc-suivi-origine{border:1px solid var(--color-svv-line);border-radius:12px;padding:8px 12px 12px;margin:0}
.loc-suivi-origine legend{font-weight:800;font-size:.85rem;padding:0 4px}
`;
