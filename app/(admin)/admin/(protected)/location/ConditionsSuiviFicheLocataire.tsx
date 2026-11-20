'use client';

import { useState } from 'react';
import { ContenuConditionsBail, CSS_CONDITIONS_BAIL, useConditionsBail } from './BlocConditionsBail';
import { ContenuSuiviLocataire, CSS_SUIVI_LOCATAIRE, RecapSuivi, useSuiviLocataire } from './SuiviCommercialLocataire';
import { BlocEnvoiFicheLocataire } from './EnvoiAdhocMonga';
import { CSS_SUIVI_COMMERCIAL } from './SuiviCommercial';
import { CSS_CONDITIONS } from './ConditionsEntree';
import { CSS_ENTRETIEN } from './EntretienBien';
import { CSS_BLOC_REPLIE } from './BlocReplie';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS } from './commun';
import { LigneManques } from './LigneManques';
import { ModaleIssue } from './ModaleIssue';
import { refusDossier, TITRE_BLOC } from '../../../../lib/location/dossierLocation';
import { ECRAN_FICHE_LOCATAIRE_LOCATION } from '../../../../lib/location/suiviLocataire';

/**
 * ══ 🔴🔴 Arno (20/11/2026) — LES BLOCS 3 « CONDITIONS D'ENTRÉE » ET 4 « SUIVI COMMERCIAL » DE « NOUVEAU LOCATAIRE » SUR LA FICHE DU LOCATAIRE ═══
 * Les MÊMES composants que le formulaire et le Dossier de location (`ContenuConditionsBail` → `BlocConditionsEntree` ; `ContenuSuiviLocataire`
 * → `BlocSuiviCommercial`), remplis avec les valeurs du BAIL EN COURS ; un bail jamais saisi : les deux blocs VIDES (le formulaire de création).
 *   · Par défaut REPLIÉS ENSEMBLE sur une seule ligne (titre lisible, « non renseignées » si vides) ; un clic les déplie tous les deux, un
 *     nouveau clic les replie ;
 *   · modifiables, avec leur propre « Enregistrer » : mêmes contrôles et obligations que le formulaire, récapitulatif, journal ; AUCUN MAIL ;
 *   · sous le bloc 4, dans la partie dépliée : « Bail en cours · adresse · entrée le … » et « Envoi ADHOC & MONGA » (déplacé, même composant) ;
 *   · sans bail en cours : rien ne s'affiche.
 */
const API = '/api/admin/gestion/annuaire/location';
type Issue = null | { sorte: 'recap' } | { sorte: 'erreur' | 'conflit'; motif: string };

export function ConditionsSuiviFicheLocataire({ locataireId }: { locataireId: number }) {
  const bloc3 = useConditionsBail(null, { locataireId });
  if (bloc3.etat.sorte === 'aucun') return null;   // sans bail en cours : rien
  if (bloc3.etat.sorte === 'lecture') return null;
  if (bloc3.etat.sorte !== 'ok') {
    return <section className="svv-card loc-page" data-conditions-suivi-fiche="erreur">
      <p className="gst-erreur" role="alert">{bloc3.etat.sorte === 'erreur' ? bloc3.etat.motif : 'Les conditions d’entrée n’ont pas pu être lues.'}</p></section>;
  }
  return <Blocs locataireId={locataireId} bloc3={bloc3} bailId={bloc3.etat.l.bailId} />;
}

/** Le titre de la ligne repliée, et la mention de ce qui n'a jamais été renseigné. PUR. */
export function ligneRepliee(o: { conditionsVides: boolean; suiviVide: boolean; ouvert: boolean }): { titre: string; mention: string | null; geste: string } {
  const mention = o.conditionsVides && o.suiviVide ? 'non renseignées'
    : o.conditionsVides ? 'conditions d’entrée non renseignées' : o.suiviVide ? 'suivi commercial non renseigné' : null;
  // Les titres des blocs 3 et 4 du formulaire « Nouveau locataire » (« Conditions d’entrée », « Suivi commercial »).
  return { titre: 'Conditions d’entrée et suivi commercial', mention, geste: o.ouvert ? 'cliquer pour replier' : 'cliquer pour afficher' };
}

function Blocs({ locataireId, bloc3, bailId }: { locataireId: number; bloc3: ReturnType<typeof useConditionsBail>; bailId: number }) {
  const bloc4 = useSuiviLocataire(locataireId, { bailId });
  const [ouvert, setOuvert] = useState(false);
  const [issue, setIssue] = useState<Issue>(null);
  const [envoi, setEnvoi] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  if (bloc3.etat.sorte !== 'ok') return null;
  const e3 = bloc3.etat;
  const c4 = bloc4.courant;
  const suiviVide = c4 === null || c4.sorte === 'sans_ligne' || (c4.sorte === 'ligne' && !c4.valide);
  const ligne = ligneRepliee({ conditionsVides: e3.creation === true, suiviVide, ouvert });
  const changements = [...bloc3.changements, ...bloc4.changements];
  const aEnregistrer = bloc3.changements.length > 0 || bloc3.touche || bloc4.touche;
  const manques = [...(bloc3.touche ? bloc3.manques : []), ...(bloc4.touche ? bloc4.manques : [])];

  const enregistrer = (): void => {
    if (!aEnregistrer || envoi) return;
    // Le bloc 3 en CRÉATION (bail sans conditions), touché : les obligatoires de « Nouveau locataire ».
    if (bloc3.touche && bloc3.manques.length > 0) {
      bloc3.setTente(true);
      setIssue({ sorte: 'erreur', motif: `Conditions d’entrée — reste à renseigner : ${bloc3.manques.join(' · ')}` }); return;
    }
    // Le bloc 3 : les mêmes contrôles que le Dossier de location (dossier complet).
    if (bloc3.changements.length > 0 && bloc3.saisie !== null) {
      const r3 = refusDossier(e3.l, bloc3.saisie, { suivi: false, charges: e3.conditions?.chargesCopro !== undefined });
      if (r3 !== null) { setIssue({ sorte: 'erreur', motif: r3 }); return; }
    }
    // Le bloc 4 : « Reste à renseigner » de « Nouveau locataire ».
    if (bloc4.touche && bloc4.manques.length > 0) {
      setIssue({ sorte: 'erreur', motif: `Suivi commercial — reste à renseigner : ${bloc4.manques.map((m) => m.replace(/^Suivi commercial : /, '')).join(' · ')}.` }); return;
    }
    if (changements.length === 0) { setIssue({ sorte: 'erreur', motif: 'Aucune modification à enregistrer.' }); return; }
    setOk(null);
    setIssue({ sorte: 'recap' });
  };
  const confirmer = async (): Promise<void> => {
    if (envoi || bloc3.saisie === null) return;
    setEnvoi(true);
    try {
      const s = bloc3.saisie;
      const avec3 = bloc3.changements.length > 0;
      const conditions = !avec3 ? null : { version: s.version, conditions: s.conditions, entretien: s.entretien,
        ...(s.honorairesSaisis !== undefined ? { honorairesSaisis: s.honorairesSaisis } : {}) };
      const suivi = bloc4.changements.length > 0 ? bloc4.envoi : null;
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
        body: JSON.stringify({ action: 'enregistrer-conditions-fiche-locataire', id: locataireId, bailId, conditions, suivi, ecran: ECRAN_FICHE_LOCATAIRE_LOCATION }) });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string; data?: { note?: string } };
      if (d.etat === 'ok') {
        setIssue(null);
        setOk(typeof d.data?.note === 'string' ? `✓ Modifications enregistrées. ${d.data.note}` : '✓ Modifications enregistrées.');
        void bloc3.lire(false); void bloc4.lire();
        return;
      }
      setIssue({ sorte: d.etat === 'conflit' ? 'conflit' : 'erreur', motif: d.motif ?? 'Les modifications n’ont pas été enregistrées.' });
    } catch {
      setIssue({ sorte: 'erreur', motif: 'Les modifications n’ont pas été enregistrées : le serveur n’a pas répondu.' });
    } finally { setEnvoi(false); }
  };

  return (
    <section className="svv-card loc-page csf" aria-label={ligne.titre} data-conditions-suivi-fiche={bailId}>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CONDITIONS + CSS_CONDITIONS_BAIL + CSS_ENTRETIEN + CSS_SUIVI_COMMERCIAL + CSS_BLOC_REPLIE
        + CSS_SUIVI_LOCATAIRE + CSS_CSF}</style>
      <button type="button" className="csf-ligne" aria-expanded={ouvert} onClick={() => setOuvert((x) => !x)} data-ligne-conditions-suivi>
        <span className="csf-chevron" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
        <span className="csf-titre">{ligne.titre}</span>
        {ligne.mention !== null && <span className="csf-mention" data-mention-vide>{ligne.mention}</span>}
        <span className="csf-geste">— {ligne.geste}</span>
      </button>
      {ouvert && (
        <div className="csf-corps" data-conditions-suivi-deplies>
          <section className="loc-section loc-section--bouton-bien" aria-labelledby="csf-3" data-bloc-conditions>
            <h3 id="csf-3"><span className="loc-num">3</span>Conditions d’entrée</h3>
            {/* Un bail sans conditions : le formulaire VIDE de « Nouveau locataire », créé à l'enregistrement (journal, aucun mail). */}
            <ContenuConditionsBail l={e3.l} conditions={e3.conditions} onConditions={bloc3.poserConditions}
              entretien={e3.entretien} onEntretien={bloc3.poserEntretien}
              {...(bloc3.creation ? { creation: {
                hono: { ...bloc3.hono, onChange: bloc3.setHono },
                manque: (k: string) => { const m = bloc3.manqueDe(k); return m === null ? null : <p className="loc-manque" role="alert">{m}</p>; },
                onTouche: bloc3.toucher,
              } } : {})} />
          </section>
          <section className="loc-section" aria-labelledby="csf-4" data-bloc-suivi-locataire data-suivi-commercial>
            <h3 id="csf-4"><span className="loc-num">4</span>{TITRE_BLOC[4]}</h3>
            <ContenuSuiviLocataire s={bloc4} ecran={ECRAN_FICHE_LOCATAIRE_LOCATION}
              loyer={e3.conditions?.loyer}
              onTtcLocataire={(t) => {
                // La règle de « Nouveau locataire » : les honoraires locataire du suivi SONT les honoraires agence des sommes dues.
                if (e3.conditions !== null) bloc3.poserConditions({ ...e3.conditions, sommes: { ...e3.conditions.sommes, honorairesAgence: t }, agenceManuel: t !== '' });
              }} />
          </section>
          {/* 🔴 Arno (20/11/2026) — « Bail en cours · … · Envoi ADHOC & MONGA », déplacé ici (même composant, même comportement). */}
          <BlocEnvoiFicheLocataire locataireId={locataireId} />
          <div className="loc-collant csf-pied" data-pied-conditions-suivi>
            {ok !== null && <p className="mfl-ok" role="status" data-conditions-suivi-enregistres>{ok}</p>}
            {manques.length > 0 ? <LigneManques manques={manques} attributs={{ 'data-manques-conditions-suivi': '' }} />
              : <p className="loc-manques" role="status" data-etat-conditions-suivi>{changements.length === 0 ? 'Aucune modification.' : `${changements.length} modification${changements.length > 1 ? 's' : ''} à enregistrer.`}</p>}
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!aEnregistrer || envoi} onClick={enregistrer} data-enregistrer-conditions-suivi>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
      {issue?.sorte === 'recap' && (
        <ModaleIssue sorte="attention" titre="Enregistrer ces modifications ?" onFermer={() => setIssue(null)}
          actions={[{ libelle: 'Revenir', onClick: () => setIssue(null), repere: 'revenir-conditions-suivi' },
            { libelle: envoi ? 'Enregistrement…' : 'Confirmer', onClick: () => { void confirmer(); }, principal: true, repere: 'confirmer-conditions-suivi' }]}>
          <div data-recap-conditions-suivi>
            {bloc3.changements.length > 0 && (
              <div className="mfl-recap-bloc" data-recap-bloc="3"><p className="mfl-recap-titre">3. {TITRE_BLOC[3]}{e3.creation ? ' — créées sur le bail en cours' : ''}</p>
                <ul>{bloc3.changements.map((c) => <li key={c.champ}>{c.champ} : <span className="mfl-avant">{c.avant}</span> → <strong>{c.apres}</strong></li>)}</ul>
              </div>
            )}
            {bloc4.changements.length > 0 && <RecapSuivi changements={bloc4.changements} creation={c4?.sorte === 'sans_ligne'} />}
            <p className="loc-muet" data-aucun-mail-conditions-suivi>Aucun mail n’est envoyé par cet enregistrement.</p>
          </div>
        </ModaleIssue>
      )}
      {(issue?.sorte === 'erreur' || issue?.sorte === 'conflit') && (
        <ModaleIssue sorte={issue.sorte === 'conflit' ? 'attention' : 'erreur'} titre={issue.sorte === 'conflit' ? 'Fiche modifiée entre-temps' : 'Rien n’a été enregistré'}
          onFermer={() => setIssue(null)} notes={[issue.motif]}
          actions={issue.sorte === 'conflit'
            ? [{ libelle: 'Revenir à la saisie', onClick: () => setIssue(null), repere: 'revenir-conflit-conditions-suivi' },
              { libelle: 'Recharger', onClick: () => { setIssue(null); void bloc3.lire(false); void bloc4.lire(); }, principal: true, repere: 'recharger-conditions-suivi' }]
            : [{ libelle: 'Fermer', onClick: () => setIssue(null), principal: true, repere: 'fermer-erreur-conditions-suivi' }]} />
      )}
    </section>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons --color-svv-* seulement (clair, sombre) ; cibles de 44 px. */
const CSS_CSF = `
.csf{display:flex;flex-direction:column;gap:12px}
.csf-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;text-align:left;cursor:pointer}
.csf-ligne:focus-visible{outline:2px solid var(--color-svv-line-strong-hover);outline-offset:2px}
.csf-chevron{flex:0 0 auto;color:var(--color-svv-muted)}
.csf-titre{font-weight:800}
.csf-mention{padding:1px 8px;border-radius:999px;background:var(--color-svv-amber-soft);color:var(--color-svv-ink);font-size:.78rem;font-weight:700}
.csf-geste{color:var(--color-svv-muted);font-size:.9rem}
.csf-corps{display:flex;flex-direction:column;gap:14px}
.csf-pied{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.csf-pied .gst-btn{width:auto;min-height:44px;margin-left:auto}
`;
