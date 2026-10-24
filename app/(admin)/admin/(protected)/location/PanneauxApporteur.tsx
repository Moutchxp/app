'use client';

import { useState } from 'react';
import { ListeChoix } from './ListeChoix';
import { posterSuivi } from './suiviApi';
import { BlocRemuneration, depuisRegle, FormulaireNouveauTaux, historiqueRegles } from './ReglageApporteur';
import {
  type Apporteur, baremeADate, collegueADate, depuisLibelle, estInterne, LIBELLE_TYPE_APPORTEUR, libelleRegleApporteur, TYPES_APPORTEUR,
} from '../../../../lib/location/suivi/suivi';
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
export function PanneauFiche({ a, nomPrenom, identite, orphelin, onEnregistre }: { a: Apporteur; nomPrenom: boolean; identite: boolean; orphelin: boolean; onEnregistre: () => void }) {
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
        </dl>
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
    const r = await posterSuivi({ action: 'fiche-apporteur', apporteurId: a.id, fiche: f, version: a.version ?? null });
    setEnvoi(false); setRecap(false);
    if (r.motif !== null) { setMotif(r.motif); setConflit(r.etat === 'conflit'); return; }
    onEnregistre();
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
      {conflit && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onEnregistre} data-recharger-fiche>Recharger</button>}
    </div>
  );
}

// ── « RATTACHEMENT » ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EXTERNE : le collègue de rattachement (date ou « Depuis toujours »), l'historique des rattachements, puis la rémunération du collègue
 * (effet en direct, versions). INTERNE : « Apporteur interne — pas de rattachement », aucun champ.
 */
export function PanneauRattachement({ a, apporteurs, collegues, jour, faire, envoi, avec419, toujoursPossible, cle }: { a: Apporteur; apporteurs: readonly Apporteur[];
  collegues: readonly { id: number; libelle: string; actif?: boolean }[]; jour: string; faire: Faire; envoi: boolean; avec419: boolean; toujoursPossible: boolean; cle: unknown }) {
  // Arno (23/10/2026, 409) — « Depuis toujours » proposé d'office au 1er rattachement.
  const [r, setR] = useState(() => ({ collegueId: '', depuis: jour, toujours: (a.collegues ?? []).length === 0 }));
  if (estInterne(a)) return <div className="plo-panneau" data-panneau="rattachement"><p className="plo-muet" data-rattachement-interne>Apporteur interne — pas de rattachement.</p></div>;
  const collegue = collegueADate(a, jour);
  return (
    <div className="plo-panneau" data-panneau="rattachement" data-fiche-apporteur={a.id}>
      <h4 className="plo-h4">Collègue de rattachement</h4>
      {(a.collegues ?? []).length === 0
        ? <p className="plo-alerte" role="status">À rattacher : choisissez le collègue et la date à partir de laquelle ses affaires lui reviennent.</p>
        : <p className="plo-muet plo-petit-texte" data-historique-collegues>{(a.collegues ?? []).map((c) => `Rattaché à ${c.collegueLibelle} ${depuisLibelle(c)}`).join(' · ')}</p>}
      <div className="plo-grille">
        <label className="plo-champ"><span>Collègue</span>
          <ListeChoix options={collegues} valeur={r.collegueId} libelle="Collègue de rattachement" onChange={(v) => setR({ ...r, collegueId: v })} donnees={{ 'data-rattacher-collegue': '' }} /></label>
        <div className="plo-champ"><span>À partir du</span>
          <label className="plo-case"><input type="checkbox" checked={r.toujours} onChange={(e) => setR({ ...r, toujours: e.target.checked })} data-rattacher-toujours />
            Depuis toujours <small className="plo-muet">(tout l’historique, et la suite)</small></label>
          <input type="date" aria-label="À partir du" value={r.toujours ? '' : r.depuis} disabled={r.toujours} onChange={(e) => setR({ ...r, depuis: e.target.value })} data-rattacher-depuis /></div>
      </div>
      <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={envoi} data-rattacher
        onClick={() => { void faire({ action: 'rattacher-apporteur', apporteurId: a.id, rattachement: { collegueId: r.collegueId === '' ? null : Number(r.collegueId), ...(r.toujours ? { depuisToujours: true } : { depuis: r.depuis }) } },
          `${a.nom} est rattaché à ${collegues.find((c) => String(c.id) === r.collegueId)?.libelle ?? 'son collègue'}.`); }}>
        {(a.collegues ?? []).length === 0 ? 'Rattacher' : 'Changer de collègue'}</button>
      {(a.collegues ?? []).length > 0
        ? <BlocRemuneration key={`${a.id}-${(a.remunerations ?? []).length}`} a={a} apporteurs={apporteurs} collegue={collegue?.collegueLibelle ?? null} jour={jour}
            disponible={avec419} toujoursPossible={toujoursPossible} envoi={envoi} faire={faire} cle={cle} />
        : <p className="plo-muet plo-petit-texte" data-remuneration-apres-rattachement>La rémunération du collègue se règle une fois l’apporteur rattaché.</p>}
    </div>
  );
}

// ── « TAUX » ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Le commissionnement de l'apporteur : la règle en vigueur, l'historique des versions, le formulaire (effet en direct, récapitulatif). */
export function PanneauTaux({ a, apporteurs, jour, faire, envoi, orphelin, toujoursPossible, cle, onFermer }: { a: Apporteur; apporteurs: readonly Apporteur[]; jour: string;
  faire: Faire; envoi: boolean; orphelin: boolean; toujoursPossible: boolean; cle: unknown; onFermer: () => void }) {
  const v = baremeADate(a, jour);
  return (
    <div className="plo-panneau" data-panneau="taux">
      <p className="plo-version-valeurs" data-taux-en-vigueur>En vigueur : {v === null ? 'aucun taux aujourd’hui.' : `${libelleRegleApporteur(v)} (${depuisRegle(v)})`}</p>
      {a.baremes.length > 0 && <p className="plo-muet plo-petit-texte" data-historique-taux>Historique : {historiqueRegles(a)}</p>}
      <h4 className="plo-h4">Nouveau taux</h4>
      <FormulaireNouveauTaux key={`${a.id}-${a.baremes.length}`} a={a} apporteurs={apporteurs} collegue={null} jour={jour} envoi={envoi} faire={faire}
        refusAvant={orphelin ? MOT_RATTACHER_DABORD : null} toujoursPossible={toujoursPossible} cle={cle} onFermer={onFermer} />
    </div>
  );
}

export const CSS_PANNEAUX_APPORTEUR = `
.plo-boutons-carte{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
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
`;
