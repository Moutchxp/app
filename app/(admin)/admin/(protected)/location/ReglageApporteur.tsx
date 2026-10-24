'use client';

import { type KeyboardEvent, useEffect, useState } from 'react';
import {
  type Apporteur, type BaremeApporteur, type ModeApporteur, type RemunerationCollegue, LIBELLE_MODE_APPORTEUR, MODES_APPORTEUR, baremeADate, libelleHistorique,
  libelleRegleApporteur, libelleRemuneration, lireDuree, lireMontant, lireTauxPourcent, MOT_DUREE, remunerationADate,
} from '../../../../lib/location/suivi/suivi';
import { type ActiviteCalcul, type EffetReglage, effetReglage } from '../../../../lib/location/suivi/tableauBord';
import { API_SUIVI } from './suiviApi';

/**
 * ══ 🔴 Arno (24/10/2026) — LE RÉGLAGE D'UN APPORTEUR : « NOUVEAU TAUX », RÉMUNÉRATION DU COLLÈGUE, EFFET EN DIRECT ═════════════════
 *   · « Nouveau taux » : mode, taux location / gestion, durée, coût fixe, date d'application — ou « Depuis toujours » (tous les
 *     dossiers, passés compris ; les versions d'avant restent dans l'historique) ;
 *   · pour un EXTERNE rattaché, la rémunération de son collègue DANS LE MÊME FORMULAIRE (et toujours dans « Fiche et cumul ») ;
 *   · « Effet de ce réglage », recalculé à chaque frappe SANS RIEN ENREGISTRER : dossiers concernés, dû avant → après (`effetReglage`,
 *     les règles du Suivi) ; « Depuis toujours » passe par un récapitulatif (combien de dossiers changent, et de combien).
 */
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
/** 413 — « 10 » (fraction 0,1 → texte du champ). */
export const champTaux = (x: number | undefined): string => (x === undefined ? '' : String(Math.round(x * 1000000) / 10000).replace('.', ','));
/** 419 — la durée envoyée : « Indéterminée » ou le nombre d'années saisi. */
export const dureeEnvoyee = (x: { indeterminee: boolean; duree: string }): string => (x.indeterminee ? 'indeterminee' : x.duree.trim());
const echap = (fermer: () => void) => (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } };

/** 🔴 Arno (24/10/2026, 413) — le CHOIX qui ouvre la règle d'un apporteur : « One shot » ou « Récurrent ». */
export function ChoixMode({ valeur, onChange }: { valeur: ModeApporteur; onChange: (m: ModeApporteur) => void }) {
  return (
    <div className="plo-champ plo-champ--large" data-mode-apporteur><span>Mode de commission</span>
      <span className="plo-modes" role="group" aria-label="Mode de commission">
        {MODES_APPORTEUR.map((m) => (
          <button key={m} type="button" className="plo-mode" aria-pressed={valeur === m} data-mode={m} onClick={() => onChange(m)}>{LIBELLE_MODE_APPORTEUR[m]}</button>
        ))}
      </span>
      <small className="plo-muet">{valeur === 'one_shot' ? 'Part gestion due une fois, à la signature : 12 mois d’honoraires de gestion (la première année).'
        : 'Part gestion due chaque mois, tant que le bien reste en gestion.'}</small>
    </div>
  );
}

/** 🔴 Arno (24/10/2026, 419) — LA DURÉE DU « RÉCURRENT » : un nombre d'années entier (1 au moins, saisie libre) OU « Indéterminée ». */
export function ChampDuree({ indeterminee, duree, onChange, repere }: { indeterminee: boolean; duree: string; onChange: (x: { indeterminee: boolean; duree: string }) => void; repere: string }) {
  return (
    <div className="plo-champ" data-duree-recurrent={repere}><span>Durée du récurrent</span>
      <label className="plo-case"><input type="checkbox" checked={indeterminee} onChange={(e) => onChange({ indeterminee: e.target.checked, duree })} data-duree-indeterminee />Indéterminée</label>
      <span className="plo-duree">
        <input inputMode="numeric" aria-label="Durée en années" value={indeterminee ? '' : duree} disabled={indeterminee} placeholder="ex. 3"
          onChange={(e) => onChange({ indeterminee, duree: e.target.value })} data-duree-annees /> <span className="plo-muet">an(s)</span></span>
    </div>
  );
}

/** 🔴 420 — « Applicable à partir du » ou « Depuis toujours » (tous les dossiers, passés compris). */
function ChampApplication({ depuis, toujours, onChange, repere, possible }: { depuis: string; toujours: boolean; repere: string; possible: boolean;
  onChange: (x: { depuis: string; toujours: boolean }) => void }) {
  return (
    <div className="plo-champ" data-application={repere}><span>Applicable à partir du</span>
      <input type="date" aria-label="Applicable à partir du" value={toujours ? '' : depuis} disabled={toujours} onChange={(e) => onChange({ depuis: e.target.value, toujours })} data-application-date />
      <label className="plo-case" title={possible ? undefined : 'Mise à jour de la base à appliquer (migration 420)'}>
        <input type="checkbox" checked={toujours} disabled={!possible} onChange={(e) => onChange({ depuis, toujours: e.target.checked })} data-application-toujours />
        Depuis toujours <small className="plo-muet">(tous les dossiers, passés compris)</small></label>
    </div>
  );
}

// ── Les saisies et leur lecture ───────────────────────────────────────────────────────────────────────────────────────────────

export interface SaisieRegle { mode: ModeApporteur; taux: string; tauxGestion: string; coutFixe: string; depuis: string; toujours: boolean; indeterminee: boolean; duree: string }
export interface SaisieRemu { remunere: boolean; mode: ModeApporteur; taux: string; tauxGestion: string; depuis: string; toujours: boolean; indeterminee: boolean; duree: string }

/** La saisie pré-remplie avec la règle en vigueur aujourd'hui (date : aujourd'hui). */
export function saisieRegleDepuis(a: Apporteur, jour: string): SaisieRegle {
  const v = baremeADate(a, jour);
  return { mode: v?.mode ?? 'one_shot', taux: v === null ? '' : champTaux(v.taux), tauxGestion: v === null ? '' : champTaux(v.tauxGestion ?? 0),
    coutFixe: v === null ? '' : String(v.coutFixeMensuel).replace('.', ','), depuis: jour, toujours: false,
    indeterminee: (v?.dureeAnnees ?? null) === null, duree: v?.dureeAnnees ? String(v.dureeAnnees) : '' };
}
export function saisieRemuDepuis(a: Apporteur, jour: string): SaisieRemu {
  const v = remunerationADate(a, jour);
  return { remunere: v?.remunere === true, mode: v?.mode ?? 'one_shot', taux: v?.remunere ? champTaux(v.taux) : '', tauxGestion: v?.remunere ? champTaux(v.tauxGestion) : '',
    depuis: jour, toujours: false, indeterminee: (v?.dureeAnnees ?? null) === null, duree: v?.dureeAnnees ? String(v.dureeAnnees) : '' };
}
/** La version que la saisie poserait (null : illisible — l'effet attend). PUR. */
export function regleDeSaisie(s: SaisieRegle): BaremeApporteur | null {
  const taux = lireTauxPourcent(s.taux); const tg = lireTauxPourcent(s.tauxGestion); const cout = lireMontant(s.coutFixe);
  const duree = s.mode === 'recurrent' ? lireDuree(dureeEnvoyee(s)) : null;
  if (taux === undefined || tg === undefined || cout === undefined || duree === undefined || (!s.toujours && !/^\d{4}-\d{2}-\d{2}$/.test(s.depuis))) return null;
  return { depuis: s.depuis, taux: taux ?? 0, tauxGestion: tg ?? 0, coutFixeMensuel: cout ?? 0, mode: s.mode, dureeAnnees: duree, ...(s.toujours ? { toujours: true } : {}) };
}
export function remuDeSaisie(s: SaisieRemu): RemunerationCollegue | null {
  if (!s.toujours && !/^\d{4}-\d{2}-\d{2}$/.test(s.depuis)) return null;
  const toujours = s.toujours ? { toujours: true } : {};
  if (!s.remunere) return { depuis: s.depuis, remunere: false, mode: 'one_shot', taux: 0, tauxGestion: 0, dureeAnnees: null, ...toujours };
  const taux = lireTauxPourcent(s.taux); const tg = lireTauxPourcent(s.tauxGestion);
  const duree = s.mode === 'recurrent' ? lireDuree(dureeEnvoyee(s)) : null;
  if (taux === undefined || tg === undefined || duree === undefined) return null;
  return { depuis: s.depuis, remunere: true, mode: s.mode, taux: taux ?? 0, tauxGestion: tg ?? 0, dureeAnnees: duree, ...toujours };
}
/** Ce qui part au serveur (la date d'une « depuis toujours » est fixée par le serveur : le jour même). */
const corpsRegle = (s: SaisieRegle, jour: string) => ({ mode: s.mode, taux: s.taux, tauxGestion: s.tauxGestion, coutFixe: s.coutFixe, depuis: s.toujours ? jour : s.depuis,
  ...(s.mode === 'recurrent' ? { dureeAnnees: dureeEnvoyee(s) } : {}), ...(s.toujours ? { toujours: true } : {}) });
const corpsRemu = (s: SaisieRemu, jour: string) => ({ remunere: s.remunere, mode: s.mode, taux: s.taux, tauxGestion: s.tauxGestion, dureeAnnees: dureeEnvoyee(s),
  depuis: s.toujours ? jour : s.depuis, ...(s.toujours ? { toujours: true } : {}) });

/** Les dossiers d'un apporteur (lecture seule), relus à chaque `cle` (après un enregistrement). */
export function useDossiersApporteur(id: number, cle: unknown): { dossiers: ActiviteCalcul[]; aujourdhui: string } | null | 'erreur' {
  const [d, setD] = useState<{ dossiers: ActiviteCalcul[]; aujourdhui: string } | null | 'erreur'>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_SUIVI}?vue=dossiers-apporteur&id=${id}`, { cache: 'no-store' }).then((r) => r.json())
      .then((x: { etat?: string; data?: { dossiers?: ActiviteCalcul[]; aujourdhui?: string } }) => {
        if (!vivant) return;
        setD(x.etat === 'ok' && Array.isArray(x.data?.dossiers) ? { dossiers: x.data.dossiers, aujourdhui: x.data.aujourdhui ?? '' } : 'erreur');
      }).catch(() => { if (vivant) setD('erreur'); });
    return () => { vivant = false; };
  }, [id, cle]);
  return d;
}

/** « Effet de ce réglage » : dossiers concernés, dû avant → après ; ce qui reste au taux d'avant, dit en clair. */
export function EncartEffet({ effet, quoi, nom, attente }: { effet: EffetReglage | null; quoi: 'apporteur' | 'collegue'; nom: string; attente?: string }) {
  return (
    <div className="plo-effet plo-champ--large" role="status" data-effet-reglage={quoi}>
      <strong className="plo-effet-titre">Effet de ce réglage</strong>
      {effet === null ? <span className="plo-muet" data-effet-attente>{attente ?? 'Saisie incomplète : l’effet s’affiche dès que les valeurs sont lisibles.'}</span> : (
        <>
          <span data-effet-ligne>Dossiers concernés : <strong>{effet.concernes} sur {effet.total}</strong> ({effet.toujours ? 'depuis toujours — tous les dossiers, passés compris' : `signés à partir du ${dateFr(effet.depuis)}`})
            {' · '}{quoi === 'apporteur' ? 'Dû à l’apporteur HT' : `Dû à ${nom} HT`} : avant <strong>{euros(quoi === 'apporteur' ? effet.avantApporteur : effet.avantCollegue)}</strong> → après <strong>{euros(quoi === 'apporteur' ? effet.apresApporteur : effet.apresCollegue)}</strong></span>
          {/* 🔴 Arno (24/10/2026) — le piège du fichier : un dossier concerné qui porte un taux ou un montant SAISI le garde. */}
          {!effet.toujours && effet.figes > 0 && (
            <span className="plo-effet-reste" data-effet-figes>{effet.figes === 1 ? 'Le dossier concerné garde' : `Les ${effet.figes} dossiers concernés gardent`} le taux et le montant saisis sur leur ligne
              {' '}(repris du fichier) : seul « Depuis toujours » les remplace.</span>
          )}
          {!effet.toujours && effet.concernes < effet.total && (
            <span className="plo-effet-reste" data-effet-reste>{effet.total - effet.concernes === 1 ? 'Le dossier signé' : `Les ${effet.total - effet.concernes} dossiers signés`} avant le {dateFr(effet.depuis)}
              {' '}{effet.total - effet.concernes === 1 ? 'reste' : 'restent'} {quoi === 'apporteur' ? 'au taux précédent' : 'à la rémunération précédente'}.</span>
          )}
        </>
      )}
    </div>
  );
}

/** Les champs de la rémunération du collègue (aucune / rémunération, mode, taux, durée, application). */
function ChampsRemuneration({ s, onChange, toujoursPossible }: { s: SaisieRemu; onChange: (s: SaisieRemu) => void; toujoursPossible: boolean }) {
  return (
    <>
      <span className="plo-modes plo-champ--large" role="group" aria-label="Rémunération du collègue">
        <button type="button" className="plo-mode" aria-pressed={!s.remunere} data-remunere="non" onClick={() => onChange({ ...s, remunere: false })}>Aucune rémunération</button>
        <button type="button" className="plo-mode" aria-pressed={s.remunere} data-remunere="oui" onClick={() => onChange({ ...s, remunere: true })}>Rémunération</button>
      </span>
      {s.remunere && (
        <>
          <ChoixMode valeur={s.mode} onChange={(m) => onChange({ ...s, mode: m })} />
          <label className="plo-champ"><span>Taux sur la location (%)</span><input inputMode="decimal" value={s.taux} placeholder="ex. 5" onChange={(e) => onChange({ ...s, taux: e.target.value })} data-remuneration-taux /></label>
          <label className="plo-champ"><span>Taux sur la gestion (%)</span><input inputMode="decimal" value={s.tauxGestion} placeholder="ex. 10" onChange={(e) => onChange({ ...s, tauxGestion: e.target.value })} data-remuneration-taux-gestion /></label>
          {s.mode === 'recurrent' && <ChampDuree indeterminee={s.indeterminee} duree={s.duree} repere="remuneration" onChange={(x) => onChange({ ...s, ...x })} />}
        </>
      )}
      <ChampApplication depuis={s.depuis} toujours={s.toujours} repere="remuneration" possible={toujoursPossible} onChange={(x) => onChange({ ...s, ...x })} />
    </>
  );
}

/** Le récapitulatif d'un « Depuis toujours », avant d'enregistrer : combien de dossiers changent, et de combien. */
function RecapToujours({ effets, collegue, onConfirmer, onRevenir, envoi }: { effets: { regle: EffetReglage | null; remu: EffetReglage | null }; collegue: string;
  onConfirmer: () => void; onRevenir: () => void; envoi: boolean }) {
  const e = effets.regle ?? effets.remu;
  return (
    <div className="plo-recap plo-champ--large" role="alertdialog" aria-label="Récapitulatif « Depuis toujours »" data-recap-toujours>
      <strong>« Depuis toujours » : {e === null ? '—' : `${Math.max(effets.regle?.changes ?? 0, effets.remu?.changes ?? 0)} dossier(s) sur ${e.total} changent`}</strong>
      {effets.regle !== null && <span data-recap-ligne="apporteur">Dû à l’apporteur HT : {euros(effets.regle.avantApporteur)} → {euros(effets.regle.apresApporteur)}
        {' '}({effets.regle.apresApporteur - effets.regle.avantApporteur >= 0 ? '+' : '−'}{euros(Math.abs(effets.regle.apresApporteur - effets.regle.avantApporteur))})</span>}
      {effets.remu !== null && <span data-recap-ligne="collegue">Dû à {collegue} HT : {euros(effets.remu.avantCollegue)} → {euros(effets.remu.apresCollegue)}
        {' '}({effets.remu.apresCollegue - effets.remu.avantCollegue >= 0 ? '+' : '−'}{euros(Math.abs(effets.remu.apresCollegue - effets.remu.avantCollegue))})</span>}
      <span className="plo-muet">Les versions précédentes ne sont pas effacées : elles restent dans l’historique, et le changement est journalisé (compte, session).</span>
      <span className="plo-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRevenir} data-recap-revenir>Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={onConfirmer} data-recap-confirmer>Confirmer</button>
      </span>
    </div>
  );
}

type Faire = (corps: Record<string, unknown>, reussite: string) => Promise<boolean>;

/**
 * « NOUVEAU TAUX » : la règle de l'apporteur, et — pour un externe rattaché (`collegue`) — la rémunération de son collègue dans le
 * même formulaire. Chaque partie a son « Effet de ce réglage » ; « Enregistrer » écrit la règle, et la rémunération si elle a été
 * touchée ; un « Depuis toujours » passe d'abord par le récapitulatif. `refus` : un motif dit avant tout envoi (externe à rattacher).
 */
export function FormulaireNouveauTaux({ a, apporteurs, collegue, jour, envoi, faire, refusAvant, toujoursPossible, onFermer, cle }: {
  a: Apporteur; apporteurs: readonly Apporteur[]; collegue: string | null; jour: string; envoi: boolean; faire: Faire; refusAvant: string | null; toujoursPossible: boolean;
  onFermer: () => void; cle: unknown;
}) {
  const [regle, setRegle] = useState(() => saisieRegleDepuis(a, jour));
  const [remu, setRemu] = useState(() => saisieRemuDepuis(a, jour));
  const [remuTouchee, setRemuTouchee] = useState(false);
  const [recap, setRecap] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const d = useDossiersApporteur(a.id, cle);
  const lu = d !== null && d !== 'erreur' ? d : null;
  const jourCalcul = lu?.aujourdhui || jour;
  const vRegle = regleDeSaisie(regle);
  const effetRegle = lu === null || vRegle === null ? null : effetReglage({ dossiers: lu.dossiers, apporteurs, apporteurId: a.id, aujourdhui: jourCalcul, bareme: vRegle });
  const effetRemu = lu === null || collegue === null || remuDeSaisie(remu) === null ? null
    : effetReglage({ dossiers: lu.dossiers, apporteurs, apporteurId: a.id, aujourdhui: jourCalcul, remuneration: remuDeSaisie(remu) });
  const attente = d === null ? 'Calcul…' : d === 'erreur' ? 'Dossiers illisibles : l’effet ne peut pas être calculé.' : undefined;
  const enregistrer = async (): Promise<void> => {
    setRecap(false);
    const ok = await faire({ action: 'bareme-apporteur', apporteurId: a.id, bareme: corpsRegle(regle, jour) },
      regle.toujours ? `Nouveau taux de ${a.nom} enregistré « depuis toujours ».` : `Nouveau taux de ${a.nom} enregistré.`);
    if (!ok) return;
    if (collegue !== null && remuTouchee) {
      const ok2 = await faire({ action: 'remuneration-collegue', apporteurId: a.id, remuneration: corpsRemu(remu, jour) }, `Nouveau taux et rémunération de ${collegue} enregistrés.`);
      if (!ok2) return;
    }
    onFermer();
  };
  const cliquer = (): void => {
    if (refusAvant !== null) { setRefus(refusAvant); return; }
    if (regle.mode === 'recurrent' && lireDuree(dureeEnvoyee(regle)) === undefined) { setRefus(MOT_DUREE); return; }
    if (remuTouchee && remu.remunere && remu.mode === 'recurrent' && lireDuree(dureeEnvoyee(remu)) === undefined) { setRefus(MOT_DUREE); return; }
    setRefus(null);
    if (regle.toujours || (remuTouchee && remu.toujours)) { setRecap(true); return; }
    void enregistrer();
  };
  return (
    <div className="plo-grille" data-nouvelle-version={a.id} onKeyDown={echap(onFermer)}>
      <ChoixMode valeur={regle.mode} onChange={(m) => setRegle({ ...regle, mode: m })} />
      <label className="plo-champ"><span>Taux sur la location (%)</span><input inputMode="decimal" value={regle.taux} onChange={(e) => setRegle({ ...regle, taux: e.target.value })} data-version-taux /></label>
      <label className="plo-champ"><span>Taux sur la gestion (%)</span><input inputMode="decimal" value={regle.tauxGestion} placeholder="ex. 20" onChange={(e) => setRegle({ ...regle, tauxGestion: e.target.value })} data-version-taux-gestion /></label>
      {regle.mode === 'recurrent' && <ChampDuree indeterminee={regle.indeterminee} duree={regle.duree} repere="version" onChange={(x) => setRegle({ ...regle, ...x })} />}
      <label className="plo-champ"><span>Coût fixe mensuel (€)</span><input inputMode="decimal" value={regle.coutFixe} onChange={(e) => setRegle({ ...regle, coutFixe: e.target.value })} data-version-cout /></label>
      <ChampApplication depuis={regle.depuis} toujours={regle.toujours} repere="version" possible={toujoursPossible} onChange={(x) => setRegle({ ...regle, ...x })} />
      <EncartEffet effet={effetRegle} quoi="apporteur" nom={a.nom} attente={attente} />
      {collegue !== null && (
        <div className="plo-remuneration plo-champ--large" data-remuneration-formulaire={a.id}>
          <h4 className="plo-h4">Rémunération de {collegue} <small className="plo-muet">(a apporté cet apporteur)</small></h4>
          <p className="plo-muet plo-petit-texte">En vigueur : {libelleRemuneration(remunerationADate(a, jour))}{remuTouchee ? '' : ' — inchangée tant que vous ne la modifiez pas.'}</p>
          <div className="plo-grille">
            <ChampsRemuneration s={remu} toujoursPossible={toujoursPossible} onChange={(x) => { setRemu(x); setRemuTouchee(true); }} />
            <EncartEffet effet={remuTouchee ? effetRemu : null} quoi="collegue" nom={collegue}
              attente={remuTouchee ? attente : 'Rémunération inchangée : modifiez-la pour voir son effet.'} />
          </div>
        </div>
      )}
      {refus !== null && <p className="plo-erreur plo-champ--large" role="alert" data-refus-local-version>{refus}</p>}
      {recap ? (
        <RecapToujours effets={{ regle: regle.toujours ? effetRegle : null, remu: remuTouchee && remu.toujours ? effetRemu : null }} collegue={collegue ?? 'collègue'} envoi={envoi}
          onRevenir={() => setRecap(false)} onConfirmer={() => { void enregistrer(); }} />
      ) : (
        <span className="plo-boutons plo-champ--large">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-annuler-version>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} data-enregistrer-version onClick={cliquer}>Enregistrer</button>
        </span>
      )}
    </div>
  );
}

/**
 * La rémunération du collègue dans « Fiche et cumul » (419) : en vigueur, historique (« remplacé depuis toujours » compris), la saisie
 * et son effet en direct, « Depuis toujours » par le récapitulatif.
 */
export function BlocRemuneration({ a, apporteurs, collegue, jour, disponible, toujoursPossible, envoi, faire, cle }: { a: Apporteur; apporteurs: readonly Apporteur[]; collegue: string | null;
  jour: string; disponible: boolean; toujoursPossible: boolean; envoi: boolean; faire: Faire; cle: unknown }) {
  const enVigueur = remunerationADate(a, jour);
  const [r, setR] = useState(() => saisieRemuDepuis(a, jour));
  const [touchee, setTouchee] = useState(false);
  const [recap, setRecap] = useState(false);
  const qui = collegue ?? 'du collègue';
  const d = useDossiersApporteur(a.id, cle);
  const lu = d !== null && d !== 'erreur' ? d : null;
  const v = remuDeSaisie(r);
  const effet = lu === null || v === null ? null : effetReglage({ dossiers: lu.dossiers, apporteurs, apporteurId: a.id, aujourdhui: lu.aujourdhui || jour, remuneration: v });
  const enregistrer = (): void => {
    setRecap(false);
    void faire({ action: 'remuneration-collegue', apporteurId: a.id, remuneration: corpsRemu(r, jour) },
      r.toujours ? `Rémunération de ${qui} enregistrée « depuis toujours ».` : `Rémunération de ${qui} enregistrée (à partir du ${dateFr(r.depuis)}).`);
  };
  return (
    <div className="plo-remuneration" data-remuneration-collegue={a.id}>
      <h4 className="plo-h4">Rémunération de {qui} <small className="plo-muet">(a apporté cet apporteur)</small></h4>
      <p className="plo-muet plo-petit-texte" data-remuneration-en-vigueur>{libelleRemuneration(enVigueur)}{enVigueur !== null ? ` (${enVigueur.toujoursLe ? `depuis toujours, enregistrée le ${dateFr(enVigueur.toujoursLe)}` : `depuis le ${dateFr(enVigueur.depuis)}`})` : ''}</p>
      {(a.remunerations ?? []).length > 1 && (
        <p className="plo-muet plo-petit-texte" data-historique-remuneration>Historique : {(a.remunerations ?? []).map((x) => libelleHistorique(x, libelleRemuneration(x))).join(' · ')}</p>
      )}
      {!disponible ? <p className="plo-alerte" role="status" data-remuneration-sans-migration>Mise à jour de la base à appliquer (migration 419) : la rémunération du collègue ne peut pas encore être enregistrée.</p> : (
        <>
          <div className="plo-grille">
            <ChampsRemuneration s={r} toujoursPossible={toujoursPossible} onChange={(x) => { setR(x); setTouchee(true); }} />
            <EncartEffet effet={touchee ? effet : null} quoi="collegue" nom={qui}
              attente={!touchee ? 'Modifiez la rémunération pour voir son effet.' : d === null ? 'Calcul…' : d === 'erreur' ? 'Dossiers illisibles : l’effet ne peut pas être calculé.' : undefined} />
            {recap && <RecapToujours effets={{ regle: null, remu: effet }} collegue={qui} envoi={envoi} onRevenir={() => setRecap(false)} onConfirmer={enregistrer} />}
          </div>
          {!recap && (
            <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={envoi} data-enregistrer-remuneration
              onClick={() => { if (r.toujours) { setRecap(true); return; } enregistrer(); }}>Enregistrer la rémunération</button>
          )}
        </>
      )}
    </div>
  );
}

/** L'historique des règles d'un apporteur (« remplacé depuis toujours par … » pour une version « depuis toujours »). */
export function historiqueRegles(a: Apporteur, eurosTexte: (x: number) => string): string {
  return a.baremes.map((b) => `${libelleHistorique(b, libelleRegleApporteur(b))}${b.coutFixeMensuel > 0 ? ` + ${eurosTexte(b.coutFixeMensuel)}/mois` : ''}`).join(' · ');
}
/** La règle en vigueur : « (depuis le 01/01/2026) » ou « (depuis toujours, enregistrée le 24/10/2026) ». */
export const depuisRegle = (v: BaremeApporteur): string => (v.toujoursLe ? `depuis toujours, enregistrée le ${dateFr(v.toujoursLe)}` : `depuis le ${dateFr(v.depuis)}`);

export const CSS_REGLAGE_APPORTEUR = `
.plo-effet{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px dashed var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);font-size:.88rem;color:var(--color-svv-ink)}
.plo-effet strong{font-variant-numeric:tabular-nums}
.plo-effet-titre{font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;color:var(--color-svv-muted)}
.plo-effet-reste{color:var(--color-svv-amber);font-weight:700}
.plo-recap{display:flex;flex-direction:column;gap:6px;padding:12px;border:2px solid var(--color-svv-red);border-radius:12px;background:var(--color-svv-red-soft);color:var(--color-svv-ink);font-variant-numeric:tabular-nums}
`;
