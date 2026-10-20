'use client';

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { formaterDateIso } from '../../../../lib/gestion/annuaireRecherche';
import type { FicheLocataire } from '../../../../lib/gestion/annuaireRepo';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import {
  formaterCentimes, formuleProrata, LIBELLE_ASSURANCE, LIBELLE_COMPTE, LIBELLE_DEPOT, LIBELLE_JOUR, LIBELLE_REGLEMENT, prorataEntree,
  type JourPrelevement,
} from '../../../../lib/location/conditionsEntree';
import { eurosAffiches, lireDecimal, LIBELLE_ZONE, tarifAffiche, totalDesHonoraires, ZERO } from '../../../../lib/location/honorairesProprietaire';
import { libelleEntretien } from '../../../../lib/location/entretien';
import type { ResumeBail } from '../../../../lib/location/resumeBailRepo';
import { CSS_RESUME_BIEN } from './ResumeBien';
import { GestesConditionsBail } from './SectionsLocationFiche';
import { InfoBulle, INFOBULLE_CSS } from '../InfoBulle';

/**
 * ══ 🔴🔴 FICHE LOCATAIRE — L'ENCART DU BAIL : RÉSUMÉ + DÉTAIL DÉPLIABLE (Arno, 20/10/2026) ══════════════════════════════════════
 *
 * Même modèle que l'encart de la fiche bien (`ResumeBien.tsx`) : juste sous le titre, au-dessus de « Coordonnées ».
 *   · RÉSUMÉ (deux colonnes dès 768 px) — « Le bail » : date d'entrée, colocataires, garants (et qui
 *     ils garantissent) · « Ce qu'il paie » : loyer principal, provision, total CC, dépôt de garantie, prélèvement ;
 *   · DÉTAIL replié (« Voir le détail du bail ⌄ ») : sommes dues à l'entrée (proratas avec la bulle ⓘ du calcul, honoraires
 *     agence), honoraires (comptes, honoraires propriétaire avec tarif, surface, barème daté, total), garanties et règlement,
 *     le reste du bail (lots loués, contacts du locataire, commentaire, saisie), entretiens du bien ;
 *   · les GESTES de l'ancien encart « Conditions d'entrée » (Modifier, Calculer les honoraires avec la surface actuelle),
 *     fusionné ici (décision d'Arno) — l'encart lui-même ne porte aucun champ de saisie.
 * Lu à la source (`resumeBailRepo.ts`, par bail_id) : le bail en cours, sinon le dernier (« bail terminé le … »).
 */
const API = '/api/admin/gestion/annuaire/location';
const rien = (mot = 'non renseigné'): ReactNode => <span className="ann-inconnu">{mot}</span>;
const ouiNon = (v: boolean | null | undefined): ReactNode => (v === true ? 'oui' : v === false ? 'non' : rien());

function Groupe({ titre, cle, vide, children }: { titre: string; cle: string; vide: boolean; children: ReactNode }) {
  return (
    <section className="rb-groupe" data-groupe={cle}>
      <h4 className="rb-titre">{titre}</h4>
      {vide ? <p className="rb-vide" data-rb-vide={cle}>{rien()}</p> : <dl className="ann-champs">{children}</dl>}
    </section>
  );
}

/** Une liste de liens vers des fiches (bien, propriétaires, colocataires). */
function Liens({ sorte, items, ouvrir }: { sorte: FicheUrl['sorte']; items: { id: number; nom: string }[]; ouvrir: (s: FicheUrl['sorte'], id: number) => void }) {
  return <span className="rb-liens">{items.map((x) => <button key={x.id} type="button" className="rb-lien" onClick={() => ouvrir(sorte, x.id)}>{x.nom}</button>)}</span>;
}

export function ResumeBailFiche({ f, ouvrir }: { f: FicheLocataire; ouvrir: (s: FicheUrl['sorte'], id: number) => void }) {
  const [r, setR] = useState<ResumeBail | null>(null);
  const [deplie, setDeplie] = useState(false);
  const [version, setVersion] = useState(0);
  const idDetail = useId();
  const idBulle = useId();
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`${API}?resumeBail=${f.id}`, { cache: 'no-store' });
        const d = await res.json() as { etat?: string; data?: ResumeBail };
        if (vivant && d.etat === 'ok' && d.data !== undefined && d.data !== null && typeof d.data === 'object' && 'bail' in d.data) setR(d.data);
      } catch { /* la lecture a échoué : l'encart ne s'affiche pas, la fiche reste celle d'avant */ }
    })();
    return () => { vivant = false; };
  }, [f.id, version]);
  const relire = useCallback(() => setVersion((v) => v + 1), []);
  if (r === null || r.bail === null) return null;

  const b = r.bail;
  const c = r.conditions?.conditions ?? null;
  const h = r.conditions?.honoraires ?? null;
  const loyer = r.loyer;
  const total = loyer === null || (loyer.principal === null && loyer.provisions === null) ? null : (loyer.principal ?? 0) + (loyer.provisions ?? 0);
  const surClic = (e: React.MouseEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('a, button, input, select, textarea, [role="tooltip"]') !== null) return;
    if (typeof window.getSelection === 'function' && (window.getSelection()?.toString() ?? '') !== '') return;
    setDeplie((v) => !v);
  };
  // La bulle ⓘ d'un prorata : le calcul refait à l'affichage, avec la date d'entrée et le loyer du bail (rien n'est stocké).
  const bulleProrata = (k: 'prorataLoyer' | 'prorataCharges'): ReactNode => {
    const montant = k === 'prorataLoyer' ? loyer?.principal ?? null : loyer?.provisions ?? null;
    const p = prorataEntree(montant, b.entree);
    const contenu = p === null || montant === null
      ? <span className="loc-bulle-calcul"><span>Pas de calcul : la date d’entrée ou le loyer mensuel n’est pas renseigné.</span></span>
      : (
        <span className="loc-bulle-calcul" data-detail-calcul={k}>
          <span>Montant mensuel : <strong>{formaterCentimes(montant)}</strong></span>
          <span>Jours d’occupation : <strong>{p.jours}</strong> sur <strong>{p.joursDuMois}</strong> jours du mois (du {p.du} au {p.au})</span>
          <span>{formuleProrata(montant, p)} = <strong>{formaterCentimes(p.centimes)}</strong> (arrondi au centime)</span>
        </span>
      );
    return <InfoBulle libelle={k === 'prorataLoyer' ? 'Prorata loyer' : 'Prorata provisions / charges'} etiquette="Détail du calcul" cible={`${idBulle}-${k}`} contenu={contenu} dansLEcran />;
  };
  const somme = (v: number | null | undefined): ReactNode => (v === null || v === undefined ? rien() : formaterCentimes(v));
  const totalDu = c === null ? null : [c.sommes.prorataLoyer, c.sommes.prorataCharges, c.sommes.depotGarantie, c.sommes.honorairesAgence]
    .filter((x): x is number => x !== null).reduce<number | null>((t, x) => (t ?? 0) + x, null);
  const totalHonoraires = c === null ? null : totalDesHonoraires(c.sommes.honorairesAgence, h);
  const entretiens = r.entretiens === null ? null : r.entretiens.aPrevoir === false ? 'non'
    : r.entretiens.liste.length > 0 ? `oui — ${r.entretiens.liste.map((e) => `${libelleEntretien({ sorte: e.sorte as 'chaudiere' | 'ramonage' | 'autre', nom: e.nom })}${e.dateAnniversaire ? ` (${formaterDateIso(e.dateAnniversaire)})` : ''}`).join(' · ')}`
      : r.entretiens.aPrevoir === true ? 'oui' : null;
  const sienne = b.occupationId === null ? undefined : { occupationId: b.occupationId, lotId: b.bien?.id ?? null, entree: b.entree };

  return (
    <section className="ann-bloc" data-encart-bail>
      <div className="ann-personne">
        <div className={`rb${deplie ? ' rb--deplie' : ''}`} data-resume-bail data-deplie={deplie ? 'oui' : 'non'} onClick={surClic}>
          <style>{CSS_RESUME_BIEN + INFOBULLE_CSS + CSS_RESUME_BAIL}</style>
          <section className="rb-groupe rb-resume" data-groupe="bail">
            <h4 className="rb-titre">{b.enCours ? 'Le bail' : <>Le bail <span className="rb-termine" data-bail-termine>· bail terminé le {b.termineLe ? formaterDateIso(b.termineLe) : '—'}</span></>}</h4>
            <div className="rb-colonnes">
              <dl className="ann-champs rb-colonne" data-colonne="bail" aria-label="Le bail">
                {/* Arno (20/10/2026) : « Bien loué » et « Propriétaire » retirés de l'encart — ils restent dans la carte « Son logement ». */}
                <dt>Date d’entrée</dt>
                <dd data-rb="entree">{b.entree === null ? rien('non renseignée') : formaterDateIso(b.entree)}</dd>
                <dt>Colocataire{b.colocataires.length > 1 ? 's' : ''}</dt>
                <dd data-rb="colocataires">{b.colocataires.length === 0 ? rien('aucun') : <Liens sorte="locataire" items={b.colocataires} ouvrir={ouvrir} />}</dd>
                <dt>Garant{r.garants.length > 1 ? 's' : ''}</dt>
                <dd data-rb="garants" className="rb-liste">{r.garants.length === 0 ? rien('aucun') : r.garants.map((g) => (
                  <span key={g.carteId} data-rb-garant={g.carteId}>{g.nom} <span className={g.locataires.length === 0 ? 'rb-a-rattacher' : 'rb-note'}>— {g.mot}</span></span>
                ))}</dd>
              </dl>
              <dl className="ann-champs rb-colonne" data-colonne="paie" aria-label="Ce qu'il paie">
                <dt>Loyer principal</dt><dd data-rb="loyer-principal">{somme(loyer?.principal)}</dd>
                <dt>Provision pour charges</dt><dd data-rb="provisions">{somme(loyer?.provisions)}</dd>
                <dt>Total charges comprises</dt><dd data-rb="total-cc">{total === null ? rien() : <strong>{formaterCentimes(total)} / mois</strong>}</dd>
                <dt>Dépôt de garantie</dt>
                <dd data-rb="depot">{c === null ? rien() : <>{c.sommes.depotGarantie === null ? rien('montant non renseigné') : formaterCentimes(c.sommes.depotGarantie)} — {LIBELLE_DEPOT[c.depot].toLowerCase()}</>}</dd>
                <dt>Prélèvement</dt>
                <dd data-rb="prelevement">{c === null ? rien() : c.prelevement ? `oui, ${LIBELLE_JOUR[String(c.jour) as JourPrelevement] ?? `le ${c.jour}`}` : 'non'}</dd>
              </dl>
            </div>
            <button type="button" className="rb-bascule" aria-expanded={deplie} aria-controls={idDetail} data-bascule-detail
              onClick={() => setDeplie((v) => !v)}>{deplie ? 'Masquer le détail ⌃' : 'Voir le détail du bail ⌄'}</button>
          </section>

          <div className="rb-detail" id={idDetail} data-detail-bail aria-hidden={!deplie} inert={!deplie}>
            <div className="rb-detail-dedans">
              <Groupe titre="Sommes dues à l’entrée" cle="sommes" vide={c === null}>
                {c !== null && (
                  <>
                    <dt>Prorata loyer</dt><dd data-rb="prorata-loyer">{somme(c.sommes.prorataLoyer)} {bulleProrata('prorataLoyer')}</dd>
                    <dt>Prorata provisions / charges</dt><dd data-rb="prorata-charges">{somme(c.sommes.prorataCharges)} {bulleProrata('prorataCharges')}</dd>
                    <dt>Honoraires agence</dt><dd data-rb="honoraires-agence">{somme(c.sommes.honorairesAgence)}</dd>
                    <dt>Total dû à l’entrée</dt><dd data-rb="total-du">{totalDu === null ? rien() : <strong>{formaterCentimes(totalDu)}</strong>}</dd>
                  </>
                )}
              </Groupe>
              <Groupe titre="Honoraires" cle="honoraires" vide={c === null}>
                {c !== null && (
                  <>
                    <dt>Honoraires du locataire</dt><dd data-rb="compte-locataire">{LIBELLE_COMPTE[c.honorairesLocataire]}</dd>
                    <dt>Honoraires du propriétaire</dt><dd data-rb="compte-proprietaire">{LIBELLE_COMPTE[c.honorairesProprietaire]}</dd>
                    <dt>Honoraires propriétaire</dt>
                    <dd data-rb="honoraires-proprietaire">{h === null ? rien() : h.etat !== 'ok' ? <span className="ann-inconnu">{h.motif}</span> : (
                      <span className="rb-liste">
                        <span>Visite, dossier, rédaction du bail : <strong>{eurosAffiches(lireDecimal(h.visiteBail) ?? ZERO)}</strong>
                          <span className="rb-note"> — {h.surface.replace('.', ',')} m² × {tarifAffiche(lireDecimal(h.tarifZone) ?? ZERO)} ({LIBELLE_ZONE[h.zone]})</span></span>
                        <span>État des lieux d’entrée : <strong>{eurosAffiches(lireDecimal(h.etatDesLieux) ?? ZERO)}</strong>
                          <span className="rb-note"> — {h.surface.replace('.', ',')} m² × {tarifAffiche(lireDecimal(h.tarifEdl) ?? ZERO)}</span></span>
                        <span>Total : <strong>{eurosAffiches(lireDecimal(h.total) ?? ZERO)}</strong>
                          <span className="rb-note"> — barème du {formaterDateIso(h.baremeDepuis)}, à la date du {formaterDateIso(h.date)}{h.dateSupposee ? ' (date du jour, sans date d’entrée)' : ''}</span></span>
                      </span>
                    )}</dd>
                    <dt>Total des honoraires</dt><dd data-rb="total-honoraires">{totalHonoraires === null ? rien() : eurosAffiches(totalHonoraires)}</dd>
                  </>
                )}
              </Groupe>
              <Groupe titre="Garanties et règlement" cle="garanties" vide={c === null}>
                {c !== null && (
                  <>
                    <dt>Garant personne physique</dt><dd data-rb="garant-physique">{ouiNon(c.garant)}</dd>
                    <dt>Assurance loyers impayés</dt><dd data-rb="assurance">{LIBELLE_ASSURANCE[c.assurance]}{c.assurancePrecision ? ` — ${c.assurancePrecision}` : ''}</dd>
                    <dt>Mode de règlement</dt><dd data-rb="reglement">{LIBELLE_REGLEMENT[c.reglement]}{c.reglementPrecision ? ` — ${c.reglementPrecision}` : ''}</dd>
                  </>
                )}
              </Groupe>
              <Groupe titre="Le bail en détail" cle="bail-detail" vide={false}>
                <dt>Lots loués</dt>
                <dd data-rb="lots" className="rb-liste">{b.lots.length === 0 ? rien() : b.lots.map((l) => <span key={l.id}>{l.libelle}</span>)}</dd>
                <dt>Contacts du locataire</dt>
                <dd data-rb="contacts" className="rb-liste">{r.contacts.length === 0 ? rien('aucun') : r.contacts.map((x) => (
                  <span key={x.carteId} data-rb-contact={x.carteId}>{x.nom}{x.qualite ? ` (${x.qualite})` : ''} <span className={x.locataires.length === 0 ? 'rb-a-rattacher' : 'rb-note'}>— {x.mot}</span></span>
                ))}</dd>
                <dt>Commentaire</dt>
                <dd data-rb="commentaire" className="rb-commentaire">{c?.commentaire ?? rien()}</dd>
                <dt>Conditions saisies</dt>
                <dd data-rb="saisie">{r.conditions === null ? rien('aucune condition d’entrée enregistrée') : `${r.conditions.modifiees ? 'modifiées' : 'saisies'} le ${formaterDateIso(r.conditions.saisiLe.slice(0, 10))} par ${r.conditions.saisiPar}`}</dd>
              </Groupe>
              <Groupe titre="Entretiens" cle="entretiens" vide={entretiens === null}>
                <dt>Entretiens à prévoir</dt><dd data-rb="entretiens">{entretiens}</dd>
              </Groupe>
              {r.conditions !== null && (
                <div className="rb-gestes" data-gestes-conditions>
                  <GestesConditionsBail c={r.conditions} l={sienne} modifiable={f.modifiable} apres={relire} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const CSS_RESUME_BAIL = `
.rb-termine{font-weight:700;text-transform:none;letter-spacing:0;color:var(--color-svv-muted)}
.rb-liens{display:flex;flex-wrap:wrap;gap:0 12px}
/* La cible reste de 44 px, mais déborde sur les marges (−12 px en haut et en bas) : la ligne garde la hauteur d'une ligne de
   texte, en face de son intitulé, sans trou sous elle. */
.rb-liens .rb-lien{border:0;background:none;padding:0;font:inherit;display:inline-flex;align-items:center;min-height:44px;margin:-12px 0}
.rb-a-rattacher{color:var(--color-svv-amber);font-weight:700}
.rb-gestes{grid-column:1/-1;min-width:0;cursor:auto}
`;
