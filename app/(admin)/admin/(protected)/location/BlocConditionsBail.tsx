'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlocConditionsEntree } from './ConditionsEntree';
import { LoyersRevises } from './IndicesLoyers';
import { useLecture } from './commun';
import type { CalculHonoraires } from '../../../../lib/location/honorairesProprietaire';
import { BlocEntretien, versEnvoiEntretien, versSaisieEntretien, type SaisieEntretien } from './EntretienBien';
import { versSaisieConditions, type SaisieConditions } from '../../../../lib/location/conditionsEntree';
import { chargesDesLots, signalCharges } from '../../../../lib/location/chargesDesLots';
import { changementsDossier, type ChangementDossier, type LectureDossier, type NomsDossier, type SaisieDossier } from '../../../../lib/location/dossierLocation';

const API = '/api/admin/gestion/annuaire/location';

/**
 * 🔴 Arno (27/10/2026) — LE BLOC 2 « LE BIEN LOUÉ » D'UN BAIL : le MÊME contenu dans le Dossier de location et dans la « Fiche locataire »
 * du Suivi du mois (aucune copie) — le bien, ses lots, la date d'entrée (un bail ne change ni de bien ni de date ici) et « Caractéristiques
 * du bien loué ». Lecture seule, comme au Dossier.
 */
export function ContenuBienLoue({ l, onCaracteristiques, repere }: { l: LectureDossier; onCaracteristiques: () => void; repere: string }) {
  return (
    <>
      <p className="mdl-bien"><strong>{l.bien.titre}</strong></p>
      <ul className="mdl-lots" data-lots-dossier>{l.lots.map((x) => <li key={x.id}>{x.libelle}</li>)}</ul>
      <p className="loc-muet" data-entree-dossier>Date d’entrée : {l.entree === null ? '—' : l.entree.split('-').reverse().join('/')} · un bail ne change ni de bien ni de date ici.</p>
      <button type="button" className="svv-btn svv-btn-outline gst-btn loc-bouton-bien" onClick={onCaracteristiques} data-caracteristiques-bien={repere}>Caractéristiques du bien loué</button>
    </>
  );
}

/**
 * ══ 🔴 Arno (25/10/2026) — LE BLOC 3 « CONDITIONS D'ENTRÉE ET SOMMES DUES » D'UN BAIL, EN MODIFICATION ═══════════════════════════════════
 * Le MÊME contenu dans le Dossier de location et dans la « Fiche locataire » du Suivi du mois (aucune copie) : les conditions de
 * « Nouveau locataire » (`BlocConditionsEntree`, dossier complet), l'entretien du bien, le paiement des charges présélectionné depuis le
 * bien, les loyers révisés réels, les lignes d'honoraires propriétaire.
 */
export function ContenuConditionsBail({ l, conditions, onConditions, entretien, onEntretien }: {
  l: LectureDossier; conditions: SaisieConditions | null; onConditions: (c: SaisieConditions) => void;
  entretien: SaisieEntretien | null; onEntretien: (e: SaisieEntretien) => void;
}) {
  // 🔴 Arno (25/10/2026) — le barème des honoraires agence (part du locataire) : le même calcul que « Nouveau locataire » (bien, date d'entrée).
  const bareme = useLecture<CalculHonoraires>(`honorairesProprietaire=${l.lotId}${l.entree !== null && /^\d{4}-\d{2}-\d{2}$/.test(l.entree) ? `&entree=${l.entree}` : ''}`);
  return (
    <>
      {conditions === null ? (
        <p className="loc-muet" data-sans-conditions>Aucune condition d’entrée n’est enregistrée pour ce bail : il n’y a rien à modifier ici.</p>
      ) : (
        <BlocConditionsEntree valeur={conditions} onChange={onConditions} manque={() => null} dateEntree={l.entree} loyer={{}} agenceEnHt indice={{ famille: l.bien.famille }} complet
          baremeAgence={{ calcul: bareme.etat.etat === 'ok' ? bareme.etat.data : null, charge: bareme.etat.etat === 'charge' }}
          charges={conditions.chargesCopro === undefined ? undefined
            : { signal: signalCharges(conditions.chargesCopro, chargesDesLots(l.lots.map((x) => x.chargesCopro))) }}
          entretien={entretien !== null ? <BlocEntretien valeur={entretien} onChange={onEntretien} obligatoire /> : undefined} />
      )}
      {conditions === null && entretien !== null && <BlocEntretien valeur={entretien} onChange={onEntretien} obligatoire />}
      {/* 🔴 Arno (25/10/2026, Q2) — le loyer révisé RÉEL du bail (prioritaire sur le calcul, « réel » dans le tableau mensuel). */}
      <LoyersRevises bailId={l.bailId} />
      {l.conditions !== null && l.conditions.lignesHonoraires.length > 0 && (
        <dl className="mdl-honoraires" data-honoraires-dossier>{l.conditions.lignesHonoraires.map((x) => <div key={x.mot}><dt>{x.mot}</dt><dd>{x.valeur}</dd></div>)}</dl>
      )}
    </>
  );
}

/**
 * 🔴 Arno (25/10/2026) — « Paiement des charges » modifié dans la fiche du bien (« Caractéristiques du bien loué ») : la saisie SUIT la
 * fiche relue, sauf un choix fait ici à la main (gardé, et signalé « différent de la fiche du bien »). PUR.
 */
export function conditionsApresRelecture(c: SaisieConditions | null, chargesAvant: string | null, chargesApres: SaisieConditions['chargesCopro'] | undefined): SaisieConditions | null {
  if (chargesApres === undefined || c === null || c.chargesCopro === undefined || (c.chargesCopro ?? null) !== chargesAvant) return c;
  return { ...c, chargesCopro: chargesApres };
}

const NOMS_SANS_BLOC4: NomsDossier = { negociateur: (id) => `n° ${id}`, collegue: (id) => `n° ${id}`, apporteur: (id) => `n° ${id}` };

export type EtatConditionsBail =
  | { sorte: 'aucun' } | { sorte: 'lecture' } | { sorte: 'non_rattache' } | { sorte: 'erreur'; motif: string }
  | { sorte: 'ok'; l: LectureDossier; conditions: SaisieConditions | null; entretien: SaisieEntretien | null };

/**
 * Le bloc 3 d'une ligne du Suivi, pour la « Fiche locataire » : la lecture du Dossier de location (`activiteId`), la saisie (conditions,
 * entretien), ses changements (bloc 3 seulement) et la saisie à envoyer. `null` : la ligne n'a pas de bail rattaché (rien n'est lu).
 */
export function useConditionsBail(activiteId: number | null) {
  const [etat, setEtat] = useState<EtatConditionsBail>(activiteId === null ? { sorte: 'non_rattache' } : { sorte: 'lecture' });
  const vue = useRef<LectureDossier | null>(null);
  const charger = useCallback((): Promise<{ etat?: string; data?: LectureDossier } | null> =>
    fetch(`${API}?dossierLocation=${activiteId}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: LectureDossier }>).catch(() => null), [activiteId]);
  const appliquer = useCallback((d: { etat?: string; data?: LectureDossier } | null, garder: boolean): void => {
    if (d === null) { setEtat({ sorte: 'erreur', motif: 'Les conditions d’entrée n’ont pas pu être lues : le serveur n’a pas répondu.' }); return; }
    if (d.etat === 'non_rattache') { setEtat({ sorte: 'non_rattache' }); return; }
    if (d.etat !== 'ok' || d.data === undefined) { setEtat({ sorte: 'erreur', motif: d.etat === 'sans_schema' ? 'La base n’est pas à jour pour ce dossier (migration 407).' : 'Les conditions d’entrée n’ont pas pu être lues.' }); return; }
    const l = d.data;
    const avant = vue.current?.conditions?.valeurs.chargesCopro ?? null;
    vue.current = l;
    setEtat((e) => {
      if (garder && e.sorte === 'ok') return { ...e, l, conditions: conditionsApresRelecture(e.conditions, avant, l.conditions?.valeurs.chargesCopro) };
      return { sorte: 'ok', l, conditions: l.conditions === null ? null : versSaisieConditions(l.conditions.valeurs, l.conditions.loyer),
        entretien: l.entretien === null ? null : versSaisieEntretien(l.entretien.aPrevoir, l.entretien.entretiens as Parameters<typeof versSaisieEntretien>[1]) };
    });
  }, []);
  /** Relire (`garder` : en gardant la saisie en cours — après « Caractéristiques du bien loué »). */
  const lire = useCallback(async (garder: boolean): Promise<void> => { if (activiteId !== null) appliquer(await charger(), garder); }, [activiteId, appliquer, charger]);
  // La lecture à l'ouverture (une ligne sans bail : rien n'est lu, l'état initial le dit).
  useEffect(() => {
    if (activiteId === null) return;
    let vivant = true;
    void charger().then((d) => { if (vivant) appliquer(d, false); });
    return () => { vivant = false; };
  }, [activiteId, charger, appliquer]);
  const saisie: SaisieDossier | null = etat.sorte !== 'ok' ? null : {
    version: etat.l.version, locataires: [], conditions: etat.conditions, suivi: etat.l.suivi,
    entretien: etat.entretien === null ? null : (() => { const e = versEnvoiEntretien(etat.entretien); return { aPrevoir: e.entretienAPrevoir, entretiens: e.entretiens }; })(),
  };
  const changements: ChangementDossier[] = etat.sorte !== 'ok' || saisie === null ? [] : changementsDossier(etat.l, saisie, NOMS_SANS_BLOC4).filter((c) => c.bloc === 3);
  return {
    etat, saisie, changements, lire,
    poserConditions: (c: SaisieConditions) => setEtat((e) => (e.sorte === 'ok' ? { ...e, conditions: c } : e)),
    poserEntretien: (x: SaisieEntretien) => setEtat((e) => (e.sorte === 'ok' ? { ...e, entretien: x } : e)),
    /** Ce qui part au serveur (bloc 3 seulement : le serveur ignore le reste). */
    envoi: saisie === null || activiteId === null ? null : { activiteId, saisie: { version: saisie.version, conditions: saisie.conditions, entretien: saisie.entretien } },
  };
}

/** Les lignes d'honoraires propriétaire du bail (lecture). AUCUN ACCENT GRAVE DANS CE LITTERAL. */
export const CSS_CONDITIONS_BAIL = `
.mdl-honoraires{margin:10px 0 0;display:flex;flex-direction:column;gap:4px;font-size:.88rem}
.mdl-honoraires div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--color-svv-line);padding:4px 0}
.mdl-honoraires dt{color:var(--color-svv-muted)}
.mdl-honoraires dd{margin:0;text-align:right}
.mdl-lots{margin:0;padding-left:18px}
.mdl-bien{margin:0 0 6px}
`;
