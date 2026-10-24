'use client';

import { useState } from 'react';
import { ListeChoix } from './ListeChoix';
import { posterSuivi } from './suiviApi';
import { ChampApplication, ChampDuree, ChoixMode, champTaux, depuisRegle, dureeEnvoyee, EncartEffet, FormulaireNouveauTaux, historiqueRegles, remuDeSaisie, useDossiersApporteur } from './ReglageApporteur';
import { effetReglage } from '../../../../lib/location/suivi/tableauBord';
import type { AutresConditions } from '../../../../lib/location/suivi/detailDossier';
import { AutresConditionsTaux } from './CumulEtConditions';
import {
  type Apporteur, baremeADate, collegueADate, depuisLibelle, estInterne, LIBELLE_TYPE_APPORTEUR, libelleApporteur, libelleRegleApporteur, libelleRemuneration,
  remunerationADate, TYPES_APPORTEUR, aujourdhuiParis, libelleHistorique, type ModeApporteur, trierHistorique, tauxVide,
} from '../../../../lib/location/suivi/suivi';
import { nomCorrespond } from '../../../../lib/location/suivi/apporteursInternes';
import { CIVILITES, changementsFiche, ficheDe, type FicheApporteur, verifierFiche } from '../../../../lib/location/suivi/ficheApporteur';

/**
 * ══ 🔴 Arno (24/10/2026) — LES PANNEAUX D'UNE CARTE D'APPORTEUR : « FICHE », « RATTACHEMENT », « TAUX » ══════════════════════════
 * (« Cumul » vit dans `OngletsSuivi`, à côté du cumul et de la cascade par dossier qu'il réunit.) Tout le contenu des anciens « Nouveau
 * taux » et « Fiche et cumul » est ici, redistribué : rien ne disparaît.
 */
type Faire = (corps: Record<string, unknown>, reussite: string) => Promise<boolean>;
export type Panneau = 'fiche' | 'rattachement' | 'taux' | 'cumul';
export const PANNEAUX: readonly Panneau[] = ['fiche', 'rattachement', 'taux', 'cumul'];
export const LIBELLE_PANNEAU: Record<Panneau, string> = { fiche: 'Fiche', rattachement: 'Rattachement', taux: 'Taux', cumul: 'Cumul' };
export const MOT_RATTACHER_DABORD = 'Partenaire externe « à rattacher » : rattachez-le d’abord à un collègue (panneau « Rattachement »), puis enregistrez.';

// ── « FICHE » ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Une liste de numéros ou d'adresses en plus du principal : ajouter, retirer. */
function ListeAutres({ valeurs, onChange, mot, repere, mode }: { valeurs: string[]; onChange: (v: string[]) => void; mot: string; repere: string; mode: 'tel' | 'email' }) {
  return (
    <div className="plo-champ" data-autres={repere}><span>{mot}</span>
      {valeurs.map((v, i) => (
        <span key={i} className="plo-autre">
          <input inputMode={mode} value={v} aria-label={`${mot} ${i + 1}`} onChange={(e) => onChange(valeurs.map((x, j) => (j === i ? e.target.value : x)))} data-autre={`${repere}-${i}`} />
          <button type="button" className="plo-x-petit" aria-label={`Retirer ${mot.toLowerCase()} ${i + 1}`} onClick={() => onChange(valeurs.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      <button type="button" className="plo-lien" onClick={() => onChange([...valeurs, ''])} data-ajouter-autre={repere}>+ Ajouter</button>
    </div>
  );
}

/**
 * EXTERNE : l'identité éditable (civilité, nom, prénom, société, téléphones, e-mails, adresse, notes, type) — « Enregistrer » montre
 * d'abord le RÉCAPITULATIF des seuls champs modifiés ; le serveur refuse si la fiche a changé depuis son ouverture (conflit), et
 * journalise chaque champ (compte, session). INTERNE : l'identité de son compte, en lecture seule.
 */
/**
 * 🔴 Arno (24/10/2026, 422) — « PASSER EN INTERNE » : le compte de l'interface (ceux déjà liés à un autre apporteur sont montrés, non
 * choisissables, avec la mention), puis le récapitulatif, puis Confirmer / Revenir. Le serveur applique la règle du script
 * `location:apporteurs-internes` (`passerEnInterne`) et journalise.
 */
function PasserEnInterne({ a, comptes, apporteurs, possible, onFait }: { a: Apporteur; comptes: readonly { id: number; libelle: string; actif?: boolean }[];
  apporteurs: readonly Apporteur[]; possible: boolean; onFait: (message: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [compte, setCompte] = useState('');
  const [recap, setRecap] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const jour = aujourdhuiParis();
  const collegue = collegueADate(a, jour);
  const choisi = comptes.find((c) => String(c.id) === compte) ?? null;
  const options = comptes.map((c) => {
    const lie = apporteurs.find((x) => !x.archive && x.compteId === c.id && x.id !== a.id);
    return { ...c, ...(lie ? { bloque: true, mention: ` — déjà l’apporteur interne « ${libelleApporteur(lie)} »` } : {}) };
  });
  const [prenom, ...nomParts] = (choisi?.libelle ?? '').split(' ');
  const confirmer = async (): Promise<void> => {
    setEnvoi(true);
    // Rester sur place : la carte confirme elle-même (pas la fenêtre verte de la tuile, qui rechargeait la page).
    const r = await posterSuivi({ action: 'passer-interne', apporteurId: a.id, compteId: Number(compte) }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); setRecap(false); return; }
    onFait(`${libelleApporteur(a)} est maintenant apporteur interne`);
  };
  if (!ouvert) {
    return (
      <p className="plo-passer-interne">
        <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" disabled={!possible} title={possible ? undefined : 'Mise à jour de la base à appliquer (migration 422)'}
          onClick={() => { setOuvert(true); setMotif(null); }} data-passer-interne={a.id}>Passer en interne</button>
        {!possible && <small className="plo-muet"> Mise à jour de la base à appliquer (migration 422).</small>}
      </p>
    );
  }
  return (
    <div className="plo-remuneration" data-passage-interne={a.id}>
      <h4 className="plo-h4">Passer en interne</h4>
      <div className="plo-grille">
        <label className="plo-champ"><span>Compte de l’interface</span>
          <ListeChoix options={options} valeur={compte} libelle="Compte de l’interface" onChange={(v) => { setCompte(v); setRecap(false); setMotif(null); }} donnees={{ 'data-passage-compte': '' }} /></label>
      </div>
      {recap && choisi !== null ? (
        <div className="plo-recap" role="alertdialog" aria-label="Récapitulatif du passage en interne" data-recap-passage>
          <span data-recap-passage-texte>{libelleApporteur(a)} devient apporteur INTERNE lié au compte {choisi.libelle}.
            {' '}{collegue !== null
              ? `Le rattachement à ${collegue.collegueLibelle} et la rémunération de ce collègue (${libelleRemuneration(remunerationADate(a, jour))}) prennent fin à compter d’aujourd’hui ; les dossiers déjà signés gardent leur calcul.`
              : 'Il n’avait pas de collègue de rattachement ; les dossiers déjà signés gardent leur calcul.'}</span>
          {!nomCorrespond(a.nom, { prenom: prenom ?? null, nom: nomParts.join(' ') || null }) && (
            <span className="plo-effet-reste" data-passage-nom-different>Le nom de l’apporteur (« {a.nom} ») n’est pas celui du compte : vérifiez qu’il s’agit bien de la même personne.</span>
          )}
          <span className="plo-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRecap(false)} data-recap-revenir>Revenir</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void confirmer(); }} data-recap-confirmer>Confirmer</button>
          </span>
        </div>
      ) : (
        <span className="plo-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setOuvert(false); setCompte(''); }} data-passage-annuler>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={choisi === null} onClick={() => setRecap(true)} data-passage-continuer>Continuer</button>
        </span>
      )}
      {motif !== null && <p className="plo-erreur" role="alert" data-passage-motif>{motif}</p>}
    </div>
  );
}

export function PanneauFiche({ a, nomPrenom, identite, orphelin, onEnregistre, comptes = [], apporteurs = [], passage = false, message }: { a: Apporteur; nomPrenom: boolean; identite: boolean;
  orphelin: boolean; onEnregistre: (message?: string) => void; comptes?: readonly { id: number; libelle: string; actif?: boolean }[]; apporteurs?: readonly Apporteur[]; passage?: boolean;
  /** 🔴 Arno (24/10/2026) — le message de confirmation de la carte (« Fiche enregistrée »), près du bouton. */
  message?: React.ReactNode }) {
  const [f, setF] = useState<FicheApporteur>(() => ficheDe(a));
  const [recap, setRecap] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [conflit, setConflit] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  if (estInterne(a)) {
    return (
      <div className="plo-panneau" data-panneau="fiche" data-fiche-interne={a.id}>
        <dl className="plo-lecture">
          <div><dt>Type</dt><dd>Interne — {LIBELLE_TYPE_APPORTEUR[a.type]}</dd></div>
          <div><dt>Nom</dt><dd>{a.compteLibelle ?? a.nom}</dd></div>
          <div><dt>Identifiant (e-mail)</dt><dd>{a.compteIdentifiant ?? '—'}</dd></div>
          {/* Les coordonnées de la fiche (venues de la carte) : en lecture, quand il y en a. */}
          {(a.societe || a.telephone || a.email) && <div><dt>Coordonnées</dt><dd data-fiche-interne-coordonnees>{[a.societe, a.telephone, a.email].filter(Boolean).join(' · ')}</dd></div>}
        </dl>
        <p className="plo-muet plo-petit-texte" data-compte-apporteur>Lié à son compte de l’interface — rattaché à personne{a.interneDepuis ? ` (interne depuis le ${a.interneDepuis.split('-').reverse().join('/')})` : ''}.</p>
        <p className="plo-muet plo-petit-texte" data-fiche-interne-mention>Identité lue depuis son compte de l’interface — modifiable dans la gestion des comptes.</p>
      </div>
    );
  }
  const changements = changementsFiche(ficheDe(a), f);
  const poser = (x: Partial<FicheApporteur>): void => { setF({ ...f, ...x }); setRecap(false); setMotif(null); };
  const demander = (): void => {
    if (orphelin) { setMotif(MOT_RATTACHER_DABORD); return; }
    const v = verifierFiche(f);
    if (!v.ok) { setMotif(v.motif); return; }
    setMotif(null); setRecap(true);
  };
  const confirmer = async (): Promise<void> => {
    setEnvoi(true);
    const r = await posterSuivi({ action: 'fiche-apporteur', apporteurId: a.id, fiche: f, version: a.version ?? null }, { propre: true });
    setEnvoi(false); setRecap(false);
    if (r.motif !== null) { setMotif(r.motif); setConflit(r.etat === 'conflit'); return; }
    onEnregistre('Fiche enregistrée');
  };
  return (
    <div className="plo-panneau" data-panneau="fiche" data-fiche-apporteur={a.id}>
      <p className="plo-muet plo-petit-texte" data-fiche-sorte>Apporteur <strong>externe</strong> (sans accès à l’interface) — passer en interne : `npm run location:apporteurs-internes`.</p>
      <div className="plo-grille">
        {identite && (
          <label className="plo-champ"><span>Civilité</span>
            <ListeChoix options={CIVILITES.map((c) => ({ id: c, libelle: c }))} valeur={f.civilite} vide="— aucune —" libelle="Civilité"
              onChange={(v) => poser({ civilite: v })} donnees={{ 'data-fiche-civilite': '' }} /></label>
        )}
        <label className="plo-champ"><span>Type</span>
          <ListeChoix options={TYPES_APPORTEUR.map((t) => ({ id: t, libelle: LIBELLE_TYPE_APPORTEUR[t] }))} valeur={f.type} vide={null} libelle="Type"
            onChange={(v) => poser({ type: v as FicheApporteur['type'] })} donnees={{ 'data-fiche-type': '' }} /></label>
        {nomPrenom ? (
          <>
            <label className="plo-champ"><span>Nom de famille</span><input value={f.nomFamille} onChange={(e) => poser({ nomFamille: e.target.value })} data-fiche-nom-famille /></label>
            <label className="plo-champ"><span>Prénom</span><input value={f.prenom} onChange={(e) => poser({ prenom: e.target.value })} data-fiche-prenom /></label>
            <small className="plo-muet plo-champ--large">Affiché « NOM Prénom », trié par nom de famille. Une structure (agence, société) : videz les deux, son nom s’affiche tel quel.</small>
          </>
        ) : <p className="plo-muet plo-petit-texte plo-champ--large" data-nom-prenom-sans-migration>Nom de famille et prénom : la séparation est proposée (dernier mot = nom) ; mise à jour de la base à appliquer (migration 414) pour la corriger.</p>}
        <label className="plo-champ"><span>Société</span><input value={f.societe} onChange={(e) => poser({ societe: e.target.value })} data-fiche-societe /></label>
        <label className="plo-champ"><span>Téléphone</span><input inputMode="tel" value={f.telephone} onChange={(e) => poser({ telephone: e.target.value })} data-fiche-telephone /></label>
        <label className="plo-champ"><span>E-mail</span><input inputMode="email" value={f.email} onChange={(e) => poser({ email: e.target.value })} data-fiche-email /></label>
        {identite ? (
          <>
            <ListeAutres valeurs={f.telephonesAutres} onChange={(v) => poser({ telephonesAutres: v })} mot="Autres téléphones" repere="telephones" mode="tel" />
            <ListeAutres valeurs={f.emailsAutres} onChange={(v) => poser({ emailsAutres: v })} mot="Autres e-mails" repere="emails" mode="email" />
            <label className="plo-champ plo-champ--large"><span>Adresse</span><input value={f.adresse} onChange={(e) => poser({ adresse: e.target.value })} data-fiche-adresse /></label>
            <label className="plo-champ plo-champ--large"><span>Notes</span><textarea rows={3} value={f.notes} onChange={(e) => poser({ notes: e.target.value })} data-fiche-notes /></label>
          </>
        ) : <p className="plo-muet plo-petit-texte plo-champ--large" data-fiche-sans-421>Civilité, autres téléphones et e-mails, adresse, notes : mise à jour de la base à appliquer (migration 421).</p>}
      </div>
      {recap ? (
        <div className="plo-recap" role="alertdialog" aria-label="Récapitulatif des modifications" data-recap-fiche>
          <strong>Champs modifiés ({changements.length})</strong>
          <ul className="plo-recap-liste">{changements.map((c) => <li key={c.cle} data-recap-champ={c.cle}>{c.champ} : {c.avant} → {c.apres}</li>)}</ul>
          <span className="plo-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRecap(false)} data-recap-revenir>Revenir</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void confirmer(); }} data-recap-confirmer>Confirmer</button>
          </span>
        </div>
      ) : (
        <span className="plo-boutons">
          <span className="plo-muet plo-petit-texte" data-etat-fiche>{changements.length === 0 ? 'Aucune modification.' : `${changements.length} champ(s) modifié(s).`}</span>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={changements.length === 0 || envoi} onClick={demander} data-enregistrer-fiche>Enregistrer la fiche</button>
        </span>
      )}
      {motif !== null && <p className="plo-erreur" role="alert" data-refus-local>{motif}</p>}
      {message}
      {conflit && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onEnregistre()} data-recharger-fiche>Recharger</button>}
      <PasserEnInterne a={a} comptes={comptes} apporteurs={apporteurs} possible={passage} onFait={onEnregistre} />
    </div>
  );
}

// ── « RATTACHEMENT » ───────────────────────────────────────────────────────────────────────────────────────────────────

const dateFrR = (iso: string): string => iso.split('-').reverse().join('/');
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** « Rattaché à X depuis toujours — One shot — location 3 %, gestion 0 % » : le résumé UNIQUE du panneau. PUR. */
export function resumeRattachement(a: Apporteur, jour: string): string {
  const c = collegueADate(a, jour);
  // Un rattachement daté APRÈS aujourd'hui (enregistré, pas encore en vigueur) : dit dans la même ligne.
  const prochain = [...(a.collegues ?? [])].filter((x) => x.depuis > jour).sort((x, y) => x.depuis.localeCompare(y.depuis))[0];
  const avenir = prochain === undefined ? '' : ` · à partir du ${dateFrR(prochain.depuis)} : ${prochain.collegueLibelle} — ${libelleRemuneration(remunerationADate(a, prochain.depuis))}`;
  if (c === null || c.depuis > jour) return `À rattacher : aucun collègue de rattachement aujourd’hui${avenir}.`;
  return `Rattaché à ${c.collegueLibelle} ${depuisLibelle(c)} — ${libelleRemuneration(remunerationADate(a, jour))}${avenir}`;
}

interface SaisieRattachement {
  collegueId: string; depuis: string; toujours: boolean;
  /** « X touche des honoraires sur l'activité de cet apporteur ? » : null tant que la question n'est pas tranchée (obligatoire). */
  reponse: 'oui' | 'non' | null;
  mode: ModeApporteur; taux: string; tauxGestion: string; indeterminee: boolean; duree: string;
  /** Sorte « remuneration » : la date d'application de la nouvelle version (ou « depuis toujours »). */
  remDepuis: string; remToujours: boolean;
}

/**
 * ══ 🔴 Arno (24/10/2026) — LE RATTACHEMENT D'UN APPORTEUR EXTERNE : UN SEUL FORMULAIRE, UN SEUL BOUTON ══════════════════════════════
 *   a. le collègue (liste verte) ; b. à partir du — date, ou « Depuis toujours » ;
 *   c. « <collègue> touche des honoraires sur l'activité de cet apporteur ? » — Non / Oui, OBLIGATOIRE (aucun choix par défaut pour un
 *      nouveau rattachement : le bouton reste inactif) ;
 *   d. Oui : One shot / Récurrent, taux location et gestion, durée du récurrent, et l'« Effet de ce réglage » en direct ;
 *   e. le récapitulatif, puis Confirmer / Revenir. Le serveur écrit rattachement ET rémunération dans UNE transaction, journalisée.
 * « Modifier la rémunération » : les étapes c → e avec le collègue actuel (la valeur en vigueur présélectionnée, et sa date
 * d'application). En tête : UN résumé ; en bas : l'historique (déroulant). INTERNE : « pas de rattachement ».
 */
export function PanneauRattachement({ a, apporteurs, collegues, jour, faire, envoi, avec419, toujoursPossible, cle, message }: { a: Apporteur; apporteurs: readonly Apporteur[];
  collegues: readonly { id: number; libelle: string; actif?: boolean }[]; jour: string; faire: Faire; envoi: boolean; avec419: boolean; toujoursPossible: boolean; cle: unknown;
  message?: React.ReactNode }) {
  const rattache = (a.collegues ?? []).length > 0;
  const actuel = collegueADate(a, jour);
  const remu = remunerationADate(a, jour);
  const vide = (sorte: 'rattacher' | 'remuneration'): SaisieRattachement => {
    // « Modifier la rémunération » : la valeur EN VIGUEUR présélectionnée ; un rattachement nouveau : rien (la question est obligatoire).
    const pre = sorte === 'remuneration';
    return { collegueId: '', depuis: jour, toujours: !rattache, reponse: pre ? (remu?.remunere ? 'oui' : 'non') : null,
      mode: pre && remu?.remunere ? remu.mode : 'one_shot', taux: pre && remu?.remunere ? champTaux(remu.taux) : '', tauxGestion: pre && remu?.remunere ? champTaux(remu.tauxGestion) : '',
      indeterminee: !(pre && remu?.dureeAnnees), duree: pre && remu?.dureeAnnees ? String(remu.dureeAnnees) : '', remDepuis: jour, remToujours: false };
  };
  const [sorte, setSorte] = useState<'rattacher' | 'remuneration'>('rattacher');
  const [f, setF] = useState<SaisieRattachement>(() => vide('rattacher'));
  const [recap, setRecap] = useState(false);
  const d = useDossiersApporteur(a.id, cle);
  if (estInterne(a)) {
    return (
      <div className="plo-panneau" data-panneau="rattachement">
        <p className="plo-muet" data-rattachement-interne>Apporteur interne — pas de rattachement.</p>
        {/* 422 — l'historique d'avant le passage en interne est conservé (lecture seule) : les dossiers d'alors en dépendent. */}
        {(a.collegues ?? []).length > 0 && (
          <p className="plo-muet plo-petit-texte" data-historique-collegues-clos>Rattachements clos{a.interneDepuis ? ` le ${dateFrR(a.interneDepuis)}` : ''} : {(a.collegues ?? []).map((c) => `${c.collegueLibelle} ${depuisLibelle(c)}`).join(' · ')}
            {(a.remunerations ?? []).length > 0 ? ` — rémunérations : ${(a.remunerations ?? []).map((v) => libelleRemuneration(v)).join(' · ')}` : ''}</p>
        )}
      </div>
    );
  }
  const poser = (x: Partial<SaisieRattachement>): void => { setF({ ...f, ...x }); setRecap(false); };
  const changerSorte = (s2: 'rattacher' | 'remuneration'): void => { setSorte(s2); setF(vide(s2)); setRecap(false); };
  const nomCollegue = sorte === 'remuneration' ? actuel?.collegueLibelle ?? 'Le collègue' : collegues.find((c) => String(c.id) === f.collegueId)?.libelle ?? 'Le collègue choisi';
  const dateRemu = sorte === 'rattacher' ? (f.toujours ? jour : f.depuis) : f.remToujours ? jour : f.remDepuis;
  const toujoursRemu = sorte === 'rattacher' ? f.toujours : f.remToujours;
  const versionSaisie = f.reponse === null ? null : remuDeSaisie({ remunere: f.reponse === 'oui', mode: f.mode, taux: f.taux, tauxGestion: f.tauxGestion,
    indeterminee: f.indeterminee, duree: f.duree, depuis: dateRemu, toujours: toujoursRemu });
  // 🔴 Arno (24/10/2026) — 0 % est une valeur (même les deux à 0 %) ; seul un champ VIDE bloque l'enregistrement.
  const tauxSaisi = f.reponse !== 'oui' || (!tauxVide(f.taux) && !tauxVide(f.tauxGestion));
  const pret = f.reponse !== null && versionSaisie !== null && tauxSaisi
    && (sorte === 'remuneration' || (f.collegueId !== '' && (f.toujours || ISO.test(f.depuis))))
    && (sorte === 'rattacher' || f.remToujours || ISO.test(f.remDepuis))
    && (f.reponse === 'non' || avec419);
  const lu = d !== null && d !== 'erreur' ? d : null;
  const effet = lu === null || versionSaisie === null || !avec419 ? null
    : effetReglage({ dossiers: lu.dossiers, apporteurs, apporteurId: a.id, aujourdhui: lu.aujourdhui || jour, remuneration: versionSaisie });
  const confirmer = async (): Promise<void> => {
    const ok = await faire({ action: 'rattachement', apporteurId: a.id, rattachement: {
      sorte, ...(sorte === 'rattacher' ? { collegueId: Number(f.collegueId), ...(f.toujours ? { depuisToujours: true } : { depuis: f.depuis }) } : {}),
      remuneration: { remunere: f.reponse === 'oui', mode: f.mode, taux: f.taux, tauxGestion: f.tauxGestion, dureeAnnees: dureeEnvoyee(f),
        ...(sorte === 'remuneration' ? (f.remToujours ? { toujours: true } : { depuis: f.remDepuis }) : {}) } } },
    sorte === 'rattacher' ? 'Rattachement enregistré' : 'Rémunération du collègue enregistrée');
    setRecap(false);
    if (ok) { setSorte('rattacher'); setF(vide('rattacher')); }
  };
  return (
    <div className="plo-panneau" data-panneau="rattachement" data-fiche-apporteur={a.id}>
      {/* 2 — UN SEUL résumé, en tête. */}
      <p className="plo-version-valeurs plo-resume-rattachement" data-resume-rattachement={a.id}>{resumeRattachement(a, jour)}</p>
      <div className="plo-onglets-rattachement" role="group" aria-label="Rattachement">
        <button type="button" className="plo-mode" aria-pressed={sorte === 'rattacher'} onClick={() => changerSorte('rattacher')} data-sorte-rattachement="rattacher">
          {rattache ? 'Changer de collègue' : 'Rattacher à un collègue'}</button>
        {rattache && <button type="button" className="plo-mode" aria-pressed={sorte === 'remuneration'} onClick={() => changerSorte('remuneration')} data-modifier-remuneration>Modifier la rémunération</button>}
      </div>
      <div className="plo-grille" data-formulaire-rattachement={sorte}>
        {sorte === 'rattacher' ? (
          <>
            {/* a. */}
            <label className="plo-champ"><span>Collègue</span>
              <ListeChoix options={collegues} valeur={f.collegueId} libelle="Collègue de rattachement" onChange={(v) => poser({ collegueId: v })} donnees={{ 'data-rattacher-collegue': '' }} /></label>
            {/* b. */}
            <div className="plo-champ"><span>À partir du</span>
              <label className="plo-case"><input type="checkbox" checked={f.toujours} onChange={(e) => poser({ toujours: e.target.checked })} data-rattacher-toujours />
                Depuis toujours <small className="plo-muet">(tout l’historique, et la suite)</small></label>
              <input type="date" aria-label="À partir du" value={f.toujours ? '' : f.depuis} disabled={f.toujours} onChange={(e) => poser({ depuis: e.target.value })} data-rattacher-depuis /></div>
          </>
        ) : <p className="plo-muet plo-petit-texte plo-champ--large" data-collegue-actuel>Collègue actuel : <strong>{actuel?.collegueLibelle}</strong> — en vigueur : {libelleRemuneration(remu)}</p>}
        {/* c. */}
        <div className="plo-champ plo-champ--large" data-question-honoraires><span>{nomCollegue} touche des honoraires sur l’activité de cet apporteur ?</span>
          <span className="plo-modes" role="radiogroup" aria-label="Honoraires du collègue">
            <button type="button" role="radio" className="plo-mode" aria-checked={f.reponse === 'non'} onClick={() => poser({ reponse: 'non' })} data-reponse="non">Non</button>
            <button type="button" role="radio" className="plo-mode" aria-checked={f.reponse === 'oui'} onClick={() => poser({ reponse: 'oui' })} data-reponse="oui">Oui</button>
          </span>
          {f.reponse === null && <small className="plo-muet" data-reponse-attendue>À trancher pour enregistrer.</small>}
          {f.reponse === 'oui' && !avec419 && <small className="plo-alerte">Mise à jour de la base à appliquer (migration 419) : la rémunération du collègue ne peut pas encore être enregistrée.</small>}
        </div>
        {/* d. */}
        {f.reponse === 'oui' && (
          <>
            <ChoixMode valeur={f.mode} onChange={(m) => poser({ mode: m })} />
            <label className="plo-champ"><span>Taux sur la location (%)</span><input inputMode="decimal" value={f.taux} placeholder="ex. 5" onChange={(e) => poser({ taux: e.target.value })} data-remuneration-taux /></label>
            <label className="plo-champ"><span>Taux sur la gestion (%)</span><input inputMode="decimal" value={f.tauxGestion} placeholder="ex. 10" onChange={(e) => poser({ tauxGestion: e.target.value })} data-remuneration-taux-gestion /></label>
            {f.mode === 'recurrent' && <ChampDuree indeterminee={f.indeterminee} duree={f.duree} repere="remuneration" onChange={(x) => poser(x)} />}
          </>
        )}
        {sorte === 'remuneration' && f.reponse !== null && (
          <ChampApplication depuis={f.remDepuis} toujours={f.remToujours} repere="remuneration" possible={toujoursPossible} onChange={(x) => poser({ remDepuis: x.depuis, remToujours: x.toujours })} />
        )}
        {f.reponse !== null && (
          <EncartEffet effet={effet} quoi="collegue" nom={nomCollegue}
            attente={!avec419 ? 'Sans la migration 419, aucune rémunération n’est calculée.' : d === null ? 'Calcul…' : d === 'erreur' ? 'Dossiers illisibles : l’effet ne peut pas être calculé.' : undefined} />
        )}
      </div>
      {/* e. */}
      {recap && versionSaisie !== null ? (
        <div className="plo-recap" role="alertdialog" aria-label="Récapitulatif du rattachement" data-recap-rattachement>
          <strong>{sorte === 'rattacher' ? 'Rattachement' : 'Rémunération du collègue'} — récapitulatif</strong>
          <ul className="plo-recap-liste">
            <li data-recap-ligne="collegue">Collègue : {nomCollegue}{sorte === 'remuneration' ? ' (inchangé)' : ''}</li>
            <li data-recap-ligne="date">À partir du : {toujoursRemu ? 'depuis toujours (tous les dossiers)' : dateFrR(dateRemu)}</li>
            <li data-recap-ligne="remuneration">Rémunération : {f.reponse === 'non' ? 'Non — aucune rémunération' : `Oui — ${libelleRemuneration(versionSaisie)}`}</li>
            {effet !== null && <li data-recap-ligne="effet">Dû à {nomCollegue} HT : {effet.avantCollegue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € → {effet.apresCollegue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</li>}
          </ul>
          <span className="plo-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRecap(false)} data-recap-revenir>Revenir</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void confirmer(); }} data-recap-confirmer>Confirmer</button>
          </span>
        </div>
      ) : (
        <span className="plo-boutons">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!pret || envoi} onClick={() => setRecap(true)} data-enregistrer-rattachement
            title={pret ? undefined : f.reponse === null ? 'Répondez d’abord à la question sur les honoraires du collègue.' : undefined}>
            {sorte === 'rattacher' ? 'Enregistrer le rattachement' : 'Enregistrer la rémunération'}</button>
        </span>
      )}
      {message}
      {/* 2 — l'historique des rattachements et des versions de rémunération, en déroulant (rien ne disparaît). */}
      {(rattache || (a.remunerations ?? []).length > 0) && (
        <details className="plo-historique" data-historique-rattachement>
          <summary>Historique des rattachements et des rémunérations</summary>
          {rattache && <p className="plo-muet plo-petit-texte" data-historique-collegues>{(a.collegues ?? []).map((c) => `Rattaché à ${c.collegueLibelle} ${depuisLibelle(c)}`).join(' · ')}</p>}
          {(a.remunerations ?? []).length > 0 && <p className="plo-muet plo-petit-texte" data-historique-remuneration>Rémunération : {trierHistorique(a.remunerations ?? []).map((x) => libelleHistorique(x, libelleRemuneration(x))).join(' · ')}</p>}
        </details>
      )}
    </div>
  );
}

// ── « TAUX » ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Le commissionnement de l'apporteur : la règle en vigueur, l'historique des versions, le formulaire (effet en direct, récapitulatif). */
export function PanneauTaux({ a, apporteurs, jour, faire, envoi, orphelin, toujoursPossible, cle, onFermer, message, autres = [] }: { a: Apporteur; apporteurs: readonly Apporteur[]; jour: string;
  faire: Faire; envoi: boolean; orphelin: boolean; toujoursPossible: boolean; cle: unknown; onFermer: () => void; message?: React.ReactNode;
  /** 🔴 Arno (24/10/2026) — les dossiers calculés à d'autres conditions (venus de la carte) : en tête du panneau, sous la règle en vigueur. */
  autres?: readonly AutresConditions[] }) {
  const v = baremeADate(a, jour);
  return (
    <div className="plo-panneau" data-panneau="taux">
      <p className="plo-version-valeurs" data-taux-en-vigueur data-regle-apporteur={a.id}>En vigueur : {v === null ? 'aucun taux aujourd’hui.' : `${libelleRegleApporteur(v)} (${depuisRegle(v)})`}</p>
      <AutresConditionsTaux autres={autres} />
      {a.baremes.length > 0 && <p className="plo-muet plo-petit-texte" data-historique-taux data-historique-regles-apporteur>Historique : {historiqueRegles(a)}</p>}
      <h4 className="plo-h4">Nouveau taux</h4>
      <FormulaireNouveauTaux key={`${a.id}-${a.baremes.length}`} a={a} apporteurs={apporteurs} collegue={null} jour={jour} envoi={envoi} faire={faire}
        refusAvant={orphelin ? MOT_RATTACHER_DABORD : null} toujoursPossible={toujoursPossible} cle={cle} onFermer={onFermer}
        apresEnregistrement={() => { /* 🔴 rester sur place : le panneau reste ouvert, le formulaire repart de la règle enregistrée */ }}
        message={message} />
    </div>
  );
}

export const CSS_PANNEAUX_APPORTEUR = `
/* 🔴 Arno (24/10/2026) — les 4 boutons CENTRÉS sur leur ligne, même écart ; retour à la ligne centré sur un écran étroit. */
.plo-boutons-carte{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;justify-content:center}
.plo-bouton-panneau[aria-pressed="true"]{border-color:var(--color-svv-red);background:var(--color-svv-red-soft);color:var(--color-svv-red)}
.plo-bouton-panneau.plo-bouton-alerte{border-color:var(--color-svv-amber);color:var(--color-svv-amber);font-weight:800}
.plo-bouton-panneau.plo-bouton-alerte[aria-pressed="true"]{background:var(--color-svv-amber-soft)}
.plo-panneau{margin-top:10px;padding:12px;border:1px solid var(--color-svv-line-strong);border-radius:12px;display:flex;flex-direction:column;gap:8px;background:var(--color-svv-surface)}
.plo-autre{display:flex;gap:6px;align-items:center}
.plo-champ>.plo-lien{align-self:flex-start;min-height:32px}
.plo-autre input{flex:1;min-width:0}
.plo-x-petit{min-width:36px;min-height:36px;border:1px solid var(--color-svv-line-strong);border-radius:8px;background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.plo-champ textarea{border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:8px 10px;font:inherit;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.plo-lecture{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px 16px}
.plo-lecture dt{font-size:.75rem;font-weight:700;color:var(--color-svv-muted)}
.plo-lecture dd{margin:0;color:var(--color-svv-ink)}
.plo-recap-liste{margin:0;padding-left:18px}
/* La liste des cartes de l'annuaire (« .plo-versions li ») ne s'applique pas aux lignes du récapitulatif. */
.plo-versions .plo-recap-liste>li{border:0;padding:0;margin:2px 0;background:none;box-shadow:none;border-radius:0}
.plo-onglets-rattachement{display:flex;flex-wrap:wrap;gap:8px}
.plo-historique summary{cursor:pointer;font-weight:700;color:var(--color-svv-muted);min-height:32px}
.plo-message-carte{margin:0;font-weight:700;color:var(--color-svv-green-ink)}
`;
