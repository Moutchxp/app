'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EtatLecture, envoyer, useLecture } from './commun';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import { BlocsEnvois, CSS_CONFIRMATION_ENVOIS } from './ConfirmationEnvois';
import { CSS_PARCOURS, TexteDuMail } from './ParcoursPreavisSortie';
import { CSS_PREVISITE } from './PrevisiteAccueil';
import { useContextePreavis } from './preavisSynchro';
import type { FinParcours } from './ParcoursPreavisSortie';
import { libelleMail, type MailParti } from '../../../../lib/location/confirmationEnvois';
import { dateFrPreavis, type LignePreavisAccueil } from '../../../../lib/location/preavis';
import { etapesPreavis } from '../../../../lib/location/frisePreavis';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';
import { tonDuGroupe } from '../../../../lib/gestion/historiqueBien';
import { cleLocataire, cleProprietaire, COMPTE_RENDU_MAX, verifierValidation } from '../../../../lib/location/validationSortie';
import { prenomNom } from '../../../../lib/location/mailsPreavisSortie';

/**
 * ══ 🔴🔴 « VALIDER L'ÉTAT DES LIEUX DE SORTIE » — LA FENÊTRE (spec d'Arno du 11/11/2026, lot 4) ═══════════════════════════════════════════════
 * Ouverte DIRECTEMENT par « Valider la sortie » sur la ligne de préavis (le sélecteur « Sélectionner / Enregistrer un préavis / Faire sortir »
 * n'y est plus, sur accord d'Arno pour CET endroit seulement ; le lien « Écran de sortie » reste). Trois temps :
 *   1. la SAISIE — « L'état des lieux de sortie a été réalisé », la date de sortie effective (jamais dans le futur), les locataires concernés
 *      (tous cochés), le compte rendu, les destinataires cochés un par un par famille (LOCATAIRES, puis PROPRIÉTAIRES ; aucun : copie interne
 *      seule), et comme avant « Informer nos partenaires » (bien en gestion) ;
 *   2. le RÉCAPITULATIF — l'action, les destinataires par famille, le nombre de mails, le texte intégral de chacun ; « Revenir » / « Confirmer » ;
 *      🔴 si le compte rendu porte les coordonnées d'une autre partie : « Attention : ce texte contient les coordonnées de … » en rouge, et
 *      « Confirmer » reste fermé tant que le texte n'est pas corrigé ;
 *   3. le RÉSULTAT — d'après la réponse du serveur : la sortie, l'étape 4 « Sortie validée » au vert, chaque mail (échecs en rouge).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

type FamilleVue = 'locataire' | 'proprietaire';
interface PartieVue { cle: string; famille: FamilleVue; nom: string; email: boolean }
interface MailPrevu { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; cle: string | null; famille: FamilleVue | 'interne' | 'partenaires' }
interface Apercu { mails: MailPrevu[]; alertes: { cle: string; libelle: string; phrase: string }[]; sansEmail: string[]; vacant: boolean; enGestion: boolean; date: string }
interface Resultat { date: string; vacant: boolean; restants: string[]; reintegrations?: string[]; envois: (MailParti & { famille: MailPrevu['famille'] })[] }
type Etape = { etape: 'saisie' } | { etape: 'recap'; a: Apercu } | { etape: 'resultat'; r: Resultat };

const aujourdhuiParis = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const MOT_FAMILLE: Record<FamilleVue, string> = { locataire: 'Locataires', proprietaire: 'Propriétaires' };

/** Les parties à cocher, lues dans l'encart du logement (le même que la fiche d'intervention). PUR. */
export function partiesDeLEncart(e: EncartLogement): PartieVue[] {
  const c = e.coordonnees;
  const locs = (c?.locataires ?? []).map((l) => ({ cle: cleLocataire(l.occupationId), famille: 'locataire' as const, nom: prenomNom({ nom: l.nom, prenom: l.prenom ?? null }), email: l.emails.length > 0 }));
  const pros = (c?.proprietaires ?? (e.proprietaire ? [{ id: e.proprietaire.id, nom: e.proprietaire.nom, emails: c?.proprietaire?.emails ?? [] }] : []))
    .map((p) => ({ cle: cleProprietaire(p.id), famille: 'proprietaire' as const, nom: p.nom, email: p.emails.length > 0 }));
  return [...locs, ...pros];
}

export function ValidationSortieEdls({ l, onFermer }: { l: LignePreavisAccueil; onFermer: (fin: FinParcours | null) => void }) {
  const titreId = useId();
  const { base } = useContextePreavis();
  const encart = useLecture<EncartLogement>(`encartBail=${l.occupationId}`, base);
  const partenaires = useLecture<{ enGestion: boolean; liste: { adresse: string; libelle?: string | null }[] }>(`partenairesSortie=${l.occupationId}`, base);
  const jour = aujourdhuiParis();
  const [etape, setEtape] = useState<Etape>({ etape: 'saisie' });
  const [realise, setRealise] = useState(false);
  const [date, setDate] = useState(jour);
  const [sortants, setSortants] = useState<number[]>(l.locataires.map((x) => x.occupationId));
  const [compteRendu, setCompteRendu] = useState('');
  const [destinataires, setDestinataires] = useState<string[]>([]);
  const [informer, setInformer] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const parties = useMemo(() => (encart.etat.etat === 'ok' ? partiesDeLEncart(encart.etat.data) : []), [encart.etat]);
  const enGestion = partenaires.etat.etat === 'ok' && partenaires.etat.data.enGestion && partenaires.etat.data.liste.length > 0;
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !envoi && etape.etape !== 'resultat') onFermer(null); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, etape, onFermer]);

  const verdict = verifierValidation({ realise, date, sortants, compteRendu }, jour);
  const corps = { occupationId: l.occupationId, realise, date, sortants, compteRendu, destinataires, informerPartenaires: enGestion && informer };
  const basculer = (cle: string): void => setDestinataires((d) => (d.includes(cle) ? d.filter((x) => x !== cle) : [...d, cle]));

  const voirRecap = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const r = await envoyer({ action: 'apercu-validation-sortie', ...corps }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    setEtape({ etape: 'recap', a: r.data as Apercu });
  };
  const confirmer = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const r = await envoyer({ action: 'valider-sortie-edls', ...corps }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    setEtape({ etape: 'resultat', r: r.data as Resultat });
  };
  const fermerResultat = (r: Resultat): void => {
    const partis = r.envois.filter((x) => x.envoye).length;
    onFermer({ geste: 'sortie', noms: l.locataires.filter((x) => sortants.includes(x.occupationId)).map((x) => x.nom), avecMails: r.envois.length > 0,
      phrase: `État des lieux de sortie validé le ${dateFrPreavis(r.date)} — ${r.vacant ? 'le logement est libre' : `le logement reste loué à ${r.restants.join(', ')}`} ; ${partis} mail${partis > 1 ? 's' : ''} envoyé${partis > 1 ? 's' : ''}.` });
  };

  const familles = (['locataire', 'proprietaire'] as const);
  let contenu: ReactNode;
  if (etape.etape === 'saisie') {
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-validation-sortie>Valider l’état des lieux de sortie</h2>
      <p className="loc-muet pss-rien">{l.locataires.map((x) => x.nom).join(', ')} — {l.adresse ?? `Bien ${l.lotId}`}</p>
      <label className="pvv-case vse-realise"><input type="checkbox" checked={realise} onChange={(e) => { setRealise(e.target.checked); setRefus(null); }} data-edls-realise />
        <span>L’état des lieux de sortie a été réalisé *</span></label>
      <label className="pvs-champ vse-date"><span className="pvs-libelle">{'Date de sortie effective *'}</span>
        <input type="date" value={date} max={jour} onChange={(e) => { setDate(e.target.value); setRefus(null); }} data-date-sortie-effective /></label>
      <fieldset className="pvv-choix" data-locataires-concernes>
        <legend className="pvs-libelle">Locataires concernés *</legend>
        {l.locataires.map((x) => (
          <label key={x.occupationId} className="pvv-case">
            <input type="checkbox" checked={sortants.includes(x.occupationId)} data-sortant={x.occupationId}
              onChange={(e) => setSortants((s) => (e.target.checked ? [...s, x.occupationId] : s.filter((o) => o !== x.occupationId)))} />
            <span>{x.nom}</span>
          </label>))}
      </fieldset>
      <label className="pvs-champ"><span className="pvs-libelle">Compte rendu de l’état des lieux de sortie</span>
        <textarea value={compteRendu} maxLength={COMPTE_RENDU_MAX} onChange={(e) => { setCompteRendu(e.target.value); setRefus(null); }} rows={8} data-compte-rendu-edls /></label>
      <fieldset className="pvv-choix vse-destinataires" data-destinataires-sortie>
        <legend className="pvs-libelle">Destinataires du compte rendu</legend>
        {encart.etat.etat !== 'ok' ? <EtatLecture etat={encart.etat} /> : familles.map((f) => {
          const liste = parties.filter((p) => p.famille === f);
          return (
            <div key={f} className={`vse-famille vse-famille--${tonDuGroupe(f)}`} data-famille-destinataires={f}>
              <p className="vse-famille-titre"><span aria-hidden="true" className="vse-pastille" />{MOT_FAMILLE[f]}</p>
              {liste.length === 0 ? <p className="loc-muet">Aucun.</p> : liste.map((p) => (
                <label key={p.cle} className="pvv-case">
                  <input type="checkbox" checked={p.email && destinataires.includes(p.cle)} disabled={!p.email} onChange={() => basculer(p.cle)} data-destinataire-sortie={p.cle} />
                  <span>{p.nom}{p.email ? '' : ' (pas d’adresse e-mail)'}</span>
                </label>))}
            </div>
          );
        })}
        <p className="loc-muet" data-copie-interne>Chaque destinataire coché reçoit SON mail (seul destinataire, sans copie visible). Aucun coché : copie interne seule (gestion@ et vous).</p>
      </fieldset>
      {enGestion && (
        <label className="pvv-case"><input type="checkbox" checked={informer} onChange={(e) => setInformer(e.target.checked)} data-informer-partenaires />
          <span>Informer nos partenaires (bien en gestion)</span></label>
      )}
      {!verdict.ok && (realise || compteRendu !== '') && <p className="cp-refus" role="status" data-validation-message>{verdict.motif}</p>}
      {refus !== null && <p className="cev-alerte" role="alert" data-validation-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => onFermer(null)} disabled={envoi} data-annuler-validation>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void voirRecap(); }} disabled={envoi || !verdict.ok} data-recap-validation>
          {envoi ? 'Préparation…' : 'Voir le récapitulatif'}</button>
      </div>
    </>;
  } else if (etape.etape === 'recap') {
    const a = etape.a;
    const groupes: [MailPrevu['famille'], string][] = [['locataire', 'Locataires'], ['proprietaire', 'Propriétaires'], ['interne', 'Copie interne (agence)'], ['partenaires', 'Nos partenaires']];
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-validation-sortie>Récapitulatif — Valider l’état des lieux de sortie</h2>
      <p className="loc-muet pss-rien" data-rien-enregistre>Rien n’est encore enregistré ni envoyé : vérifiez, puis « Confirmer et envoyer ».</p>
      <dl className="mis-resume" data-resume-validation>
        <div><dt>Action</dt><dd>Sortie effective le {dateFrPreavis(a.date)} — {a.vacant ? 'le logement devient libre' : 'le logement reste loué'}</dd></div>
        <div><dt>Locataires concernés</dt><dd>{l.locataires.filter((x) => sortants.includes(x.occupationId)).map((x) => x.nom).join(', ')}</dd></div>
      </dl>
      {a.alertes.map((x) => <p key={x.cle} className="cev-alerte" role="alert" data-alerte-coordonnees={x.cle}>Mail à {x.libelle} — {x.phrase} Corrigez le compte rendu avant l’envoi.</p>)}
      <p className="pss-sous-titre" data-nombre-mails>{a.mails.length === 1 ? '1 mail partira.' : `${a.mails.length} mails partiront.`}</p>
      {groupes.map(([f, mot]) => {
        const mails = a.mails.filter((m) => m.famille === f);
        if (mails.length === 0) return null;
        return (
          <div key={f} className={`vse-famille${f === 'locataire' || f === 'proprietaire' ? ` vse-famille--${tonDuGroupe(f)}` : ''}`} data-recap-famille={f}>
            <p className="vse-famille-titre"><span aria-hidden="true" className="vse-pastille" />{mot} ({mails.length})</p>
            <ul className="cev-mails">{mails.map((m, i) => (
              <li key={`${i}-${m.sorte}`} className="cev-mail" data-mail-prevu={m.sorte}>
                <p className="cev-mail-titre">{libelleMail(m)}</p>
                <dl className="cev-dl"><dt>Objet</dt><dd data-objet>{m.objet}</dd><dt>Destinataire</dt><dd data-a>{m.a.join(', ')}</dd>
                  <dt>En copie</dt><dd data-cc>{m.cc.length > 0 ? m.cc.join(', ') : 'aucune'}</dd></dl>
                <TexteDuMail key={m.texte} texte={m.texte} ouvert={f !== 'interne'} />
              </li>))}</ul>
          </div>
        );
      })}
      {a.sansEmail.map((n) => <p key={n} className="mis-note" data-sans-email>⚠ {n} : pas d’adresse e-mail, ne recevra pas ce mail</p>)}
      {refus !== null && <p className="cev-alerte" role="alert" data-validation-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => setEtape({ etape: 'saisie' })} disabled={envoi} data-revenir-validation>Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void confirmer(); }} disabled={envoi || a.alertes.length > 0} data-confirmer-validation>
          {envoi ? 'Envoi…' : 'Confirmer et envoyer'}</button>
      </div>
    </>;
  } else {
    const r = etape.r;
    const etapes = etapesPreavis(l, jour, { sortieValidee: r.date });
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-validation-sortie>✓ Sortie validée</h2>
      <dl className="mis-resume" data-resume>
        <div><dt>Sortie effective</dt><dd>le {dateFrPreavis(r.date)}</dd></div>
        <div><dt>Le logement</dt><dd>{r.vacant ? 'libre' : `reste loué à ${r.restants.join(', ')}`}</dd></div>
        {(r.reintegrations ?? []).map((x) => <div key={x}><dt>Regroupement</dt><dd>{x}</dd></div>)}
      </dl>
      <ol className="frp vse-frise" data-frise-resultat>{etapes.map((e) => (
        <li key={e.cle} className={`frp-etape frp-etape--${e.statut}`} data-etape={e.cle} data-statut-etape={e.statut}>
          <div className="frp-tete"><span className="frp-numero" aria-hidden="true">{e.statut === 'faite' ? '✓' : e.numero}</span><span className="frp-titre">{e.numero}. {e.titre}</span></div>
        </li>))}</ol>
      <BlocsEnvois issue={{ informer: false, mails: r.envois, motifGlobal: r.envois.length === 0 ? 'Aucun mail n’est parti pour cette opération.' : null }} sansPartenaires />
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => fermerResultat(r)} data-fermer-validation>Fermer</button>
      </div>
    </>;
  }
  const echec = etape.etape === 'resultat' && etape.r.envois.some((m) => !m.envoye);
  const boite = (
    <div className="mis-voile">
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_CONFIRMATION_ENVOIS + CSS_PREVISITE + CSS_VALIDATION_SORTIE}</style>
      <div className={`mis-boite pss-boite ${etape.etape === 'resultat' ? (echec ? 'mis-boite--attention' : 'mis-boite--succes') : 'pss-boite-recap'}`} role="dialog" aria-modal="true"
        aria-labelledby={titreId} data-fenetre-validation-sortie={etape.etape}>
        {contenu}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme (couleurs de famille = celles du bloc PARTIES : locataire vert, proprietaire rouge). */
export const CSS_VALIDATION_SORTIE = `
.vse-realise{font-weight:800}
.vse-date input{min-height:44px}
.vse-famille{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:10px;border-left:4px solid var(--color-svv-line-strong);background:var(--color-svv-surface);min-width:0}
.vse-famille--vert{border-left-color:var(--color-svv-green)}
.vse-famille--rouge{border-left-color:var(--color-svv-red)}
.vse-famille-titre{margin:0;font-weight:900;font-size:.82rem;letter-spacing:.05em;text-transform:uppercase;display:inline-flex;align-items:center;gap:6px}
.vse-pastille{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--color-svv-line-strong)}
.vse-famille--vert .vse-pastille{background:var(--color-svv-green)}
.vse-famille--rouge .vse-pastille{background:var(--color-svv-red)}
.vse-destinataires{display:flex;flex-direction:column;gap:8px}
.vse-frise{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:600px){.vse-frise{grid-template-columns:1fr 1fr}}
`;
