'use client';

import { Fragment, type CSSProperties, type ReactNode } from 'react';
// ⚠️ Bundle client (piège du 13/08) : des modules serveur (pg), on n'importe QUE des `type`, jamais une valeur.
import type { GlobalPermis, CorpsBatiment, OrigineValeur } from '../../../../lib/permis/caracteristiquesRepo';
import type { JournalPermis } from '../../../../lib/permis/journalLecture';
import type { ParcelleLigne } from '../../../../lib/permis/parcellesRepo';
import type { DeclarationsRecapCerfa } from '../../../../lib/permis/recapCerfa';
import type { FaitsPermis } from './caracteristiquesForm';
import {
  libelleProvenance, provenanceChamp, divergenceNiveauxHorsSol, LIBELLE_NON_DECLARE, LIBELLE_NON_INSTRUIT,
  type Provenance, type EtatLigne, type PieceCerfa,
} from './compteRendu';
import type { LienPiece } from './CaracteristiquesRendu';
import type { CompteRenduIa } from '../../../../lib/permis/compteRenduIaSchema'; // CR-2b1 — type SEUL (zod non embarqué côté client)
import type { JournalTransmissionPiece } from '../../../../lib/permis/selectionPagesCerfaIa';

/**
 * CR-2a — CARTOUCHE de COMPTE RENDU du Cerfa : remplace le pavé de texte brut par un compte rendu LISIBLE, construit UNIQUEMENT à
 * partir de ce qui est déjà en base (aucune IA, aucune écriture). Présentationnel PUR (toutes les données en props) → testable en
 * node pur (renderToStaticMarkup). Mobile-first : grilles à une colonne en portrait, cibles tactiles, aucune interaction au survol.
 *
 * Chaque ligne porte SA PROVENANCE en clair (jamais un nom de méthode interne), et distingue TROIS états : valeur connue /
 * « non déclaré dans ce Cerfa » / « pas encore instruit ». Les divergences sont MONTRÉES (jamais un écrasement silencieux).
 */

export interface DonneesCartouche {
  faits: FaitsPermis;
  global: GlobalPermis | null;
  corps: CorpsBatiment[];
  journal: JournalPermis;
  parcelles: ParcelleLigne[];
  declarations: DeclarationsRecapCerfa;
  piecesCerfa: PieceCerfa[] | null;
  lienPiece?: LienPiece;
  passeIa?: PasseIaCartouche | null; // CR-2b1 — dernière passe de lecture IA (informative, jamais autoritative)
}

/** CR-2b1 — dernière passe IA telle que l'écran la reçoit (lecture seule). `null` = aucune passe (migration 216 non appliquée / jamais lancée). */
export interface PasseIaCartouche {
  statut: 'lu' | 'abstention' | 'echec' | string;
  lecture: CompteRenduIa | null;
  motif: string | null;
  modele: string | null;
  transmission: JournalTransmissionPiece | null;
  passeLe: string | null;
}

const styleAide: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const styleTitreSection: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-svv-muted)', margin: '.1rem 0 0' };
const styleProv: CSSProperties = { fontSize: 10.5, color: 'var(--color-svv-muted)', fontStyle: 'italic', whiteSpace: 'nowrap' };
const styleAbsent: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', fontStyle: 'italic' };
const styleAlerte: CSSProperties = { fontSize: 12, lineHeight: 1.45, color: 'var(--color-svv-ink)', background: 'var(--color-svv-note-bg)', border: '1px solid var(--color-svv-red)', borderRadius: '.4rem', padding: '.35rem .5rem' };

/** Pastille de provenance lisible (contour discret). */
function PastilleProv({ p }: { p: Provenance }) {
  return <span style={styleProv}>· {libelleProvenance(p)}</span>;
}

/** Une ligne du compte rendu, dans ses TROIS états. */
function Ligne({ label, valeur, etat }: { label: string; valeur?: ReactNode; etat: EtatLigne }) {
  return (
    <Fragment>
      <dt style={{ color: 'var(--color-svv-muted)', fontSize: 12.5 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, minWidth: 0 }}>
        {etat.statut === 'connu'
          ? <><strong style={{ color: 'var(--color-svv-ink)' }}>{valeur}</strong> <PastilleProv p={etat.provenance} /></>
          : <span style={styleAbsent}>{etat.statut === 'non_declare' ? LIBELLE_NON_DECLARE : LIBELLE_NON_INSTRUIT}</span>}
      </dd>
    </Fragment>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <h5 style={styleTitreSection}>{titre}</h5>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(9rem, max-content) 1fr', gap: '.1rem .6rem', margin: 0 }}>{children}</dl>
    </div>
  );
}

// ── CR-2b1 — LECTURE IA (à corroborer). Informative, JAMAIS autoritative : elle ne remplace aucune valeur déterministe, dit franchement
//   quand elle ABSTIENT (jamais un tiret muet, jamais une valeur inventée), et expose le journal de transmission (preuve RGPD). ──
const LIBELLES_IA: Record<string, string> = { natureProjet: 'Nature (case cochée)', typeOperationSvav: "Type d'opération (SVAV)", recoursArchitecte: "Recours à l'architecte", demolition: 'Démolition', travauxParTranches: 'Travaux par tranches' };
const styleIaBox: CSSProperties = { border: '1px dashed var(--color-svv-violet)', borderRadius: '.45rem', padding: '.4rem .55rem', background: 'var(--color-svv-field)' };
function valeurIaLisible(champ: string, valeur: unknown): string {
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  if (champ === 'natureProjet') return valeur === 'nouvelle_construction' ? 'nouvelle construction' : valeur === 'travaux_sur_existant' ? 'travaux sur existant' : String(valeur);
  return String(valeur);
}
function LigneIa({ champ, c }: { champ: string; c: { valeur: unknown; confiance: string; page: number | null } | undefined }) {
  return (
    <Fragment>
      <dt style={{ color: 'var(--color-svv-muted)', fontSize: 12.5 }}>{LIBELLES_IA[champ] ?? champ}</dt>
      <dd style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, minWidth: 0 }}>
        {!c || c.valeur === null || c.valeur === undefined
          ? <span style={styleAbsent}>l’IA n’a pas su lire cette information</span>
          : <><strong style={{ color: 'var(--color-svv-violet)' }}>{valeurIaLisible(champ, c.valeur)}</strong> <span style={styleProv}>· confiance {c.confiance}{c.page != null ? `, page ${c.page}` : ''} · à corroborer</span></>}
      </dd>
    </Fragment>
  );
}

/** État « connu / non déclaré / pas encore instruit » d'un champ. `absentDuCerfa` = l'info n'est structurellement pas dans ce Cerfa. */
function etat(valeurConnue: boolean, origine: OrigineValeur | null, methode: string | null | undefined, absentDuCerfa = false): EtatLigne {
  if (valeurConnue) return { statut: 'connu', provenance: provenanceChamp(origine, methode) ?? 'pieces' };
  return absentDuCerfa ? { statut: 'non_declare' } : { statut: 'non_instruit' };
}

export function CompteRenduCartouche({ donnees }: { donnees: DonneesCartouche }) {
  const { faits, global: g, corps, journal, parcelles, declarations: d, piecesCerfa, lienPiece, passeIa } = donnees;
  const jp = journal.permis ?? {};
  const methPermis = (colonne: string): string | null | undefined => jp[colonne]?.methode;
  const methCorps = (corpsId: number, colonne: string): string | null | undefined => journal.parCorps?.[corpsId]?.[colonne]?.methode;
  const sc = d.descriptionScission;
  const divNiveaux = divergenceNiveauxHorsSol(sc);
  const absentsNoms = new Set(d.absents.map((a) => a.champ));

  return (
    <div className="svv-card flex flex-col gap-3" style={{ minWidth: 0 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--color-svv-ink)' }}>
        Compte rendu du Cerfa <span style={{ ...styleAide, fontWeight: 400 }}>— reconstitué à partir de ce qui est déjà en base (aucune IA)</span>
      </h4>

      <Section titre="Identité">
        <Ligne label="Adresse du terrain" valeur={faits.adresse} etat={etat(!!faits.adresse, g?.adresseTerrainOrigine ?? null, methPermis('adresse_terrain'), false)} />
        <Ligne label="Date de dépôt" valeur={d.dateDepot} etat={d.dateDepot ? { statut: 'connu', provenance: 'cerfa' } : { statut: 'non_instruit' }} />
        {/* Le Cerfa est la pièce de DÉPÔT, jamais l'arrêté : la date d'obtention n'y figure pas. Connue via Sitadel si elle existe, sinon non déclarée dans ce Cerfa. */}
        <Ligne label="Date d’obtention" valeur={faits.dateAutorisation} etat={faits.dateAutorisation ? { statut: 'connu', provenance: 'sitadel' } : { statut: 'non_declare' }} />
      </Section>

      <Section titre="Nature">
        <Ligne label="Type d’opération" valeur={g?.designation || g?.natureProjet || faits.natureTravaux} etat={etat(!!(g?.designation || g?.natureProjet || faits.natureTravaux), (g?.designation ? g?.designationOrigine : g?.natureProjetOrigine) ?? null, methPermis(g?.designation ? 'designation' : 'nature_projet'), false)} />
        {/* Aucune colonne structurée « démolition » aujourd'hui : donnée non instruite (jamais un tiret muet). */}
        <Ligne label="Démolition associée" etat={{ statut: 'non_instruit' }} />
      </Section>

      <Section titre="Le bâti">
        <Ligne label="Nombre de bâtiments" valeur={corps.length > 0 ? corps.length : undefined} etat={corps.length > 0 ? { statut: 'connu', provenance: 'pieces' } : (absentsNoms.has('nombre de bâtiments') ? { statut: 'non_declare' } : { statut: 'non_instruit' })} />
        {corps.length > 0 ? corps.map((c) => (
          <Fragment key={c.id}>
            <Ligne label={`Étages — ${c.repere ?? `bâtiment ${c.id}`}`} valeur={c.nbEtages} etat={etat(c.nbEtages !== null, c.nbEtagesOrigine, methCorps(c.id, 'nb_etages'), false)} />
            <Ligne label={`Sous-sols — ${c.repere ?? `bâtiment ${c.id}`}`} valeur={c.nbNiveauxSousSol} etat={etat(c.nbNiveauxSousSol !== null, c.nbNiveauxSousSolOrigine, methCorps(c.id, 'nb_niveaux_sous_sol'), false)} />
          </Fragment>
        )) : null}
      </Section>

      <Section titre="Le programme">
        <Ligne label="Logements" valeur={g?.nbLogements} etat={etat(g?.nbLogements != null, g?.nbLogementsOrigine ?? null, methPermis('nb_logements'), false)} />
        <Ligne label="Autres destinations" valeur={g?.destinations?.length ? g.destinations.join(' · ') : undefined} etat={etat(!!g?.destinations?.length, g?.destinationsOrigine ?? null, methPermis('destinations'), false)} />
        <Ligne label="Stationnement" valeur={g?.nbPlacesStationnement != null ? `${g.nbPlacesStationnement} place(s)` : undefined} etat={etat(g?.nbPlacesStationnement != null, g?.nbPlacesStationnementOrigine ?? null, methPermis('nb_places_stationnement'), false)} />
        <Ligne label="Surface de plancher" valeur={g?.surfacePlancherM2 != null ? `${g.surfacePlancherM2} m²` : undefined} etat={etat(g?.surfacePlancherM2 != null, g?.surfacePlancherM2Origine ?? null, methPermis('surface_plancher_m2'), false)} />
      </Section>

      <Section titre="Hauteur">
        <Ligne label="Gabarit / altitude max PLU" valeur={corps.find((c) => c.hauteurMaxPluNgf != null) ? corps.filter((c) => c.hauteurMaxPluNgf != null).map((c) => `${c.repere ?? `bâtiment ${c.id}`} : ${c.hauteurMaxPluNgf} m NGF`).join(' · ') : undefined} etat={corps.some((c) => c.hauteurMaxPluNgf != null) ? { statut: 'connu', provenance: 'plans_coupes' } : { statut: 'non_instruit' }} />
      </Section>

      <Section titre="Foncier">
        <Ligne label="Parcelles cadastrales" valeur={parcelles.length ? parcelles.map((p) => `${p.prefixe ? p.prefixe + ' ' : ''}${p.section} ${p.numero}`).join(' · ') : undefined} etat={parcelles.length ? { statut: 'connu', provenance: parcelles.some((p) => p.origine === 'saisie') ? 'saisie' : 'cerfa' } : { statut: 'non_instruit' }} />
      </Section>

      {/* Les DEUX parts de la description, jamais confondues. */}
      <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
        <h5 style={styleTitreSection}>Ce que le pétitionnaire a écrit</h5>
        {sc.humain
          ? <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--color-svv-ink)' }}>{sc.humain} <span style={styleProv}>· {libelleProvenance('petitionnaire')}</span></p>
          : <p style={styleAbsent}>Aucune déclaration libre du pétitionnaire dans ce Cerfa.</p>}
      </div>

      {(sc.genere || sc.valeurs) && (
        <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <h5 style={styleTitreSection}>Ce que le téléservice a généré</h5>
          <p style={styleAide}>Phrase pré-remplie par le téléservice de la mairie — un dérivé, pas une déclaration d’architecte.</p>
          {sc.genere && <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--color-svv-ink)' }}>{sc.genere} <span style={styleProv}>· {libelleProvenance('teleservice')}</span></p>}
          {sc.valeurs && (
            <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(9rem, max-content) 1fr', gap: '.1rem .6rem', margin: '.15rem 0 0' }}>
              <Ligne label="Niveaux hors sol (R+N)" valeur={sc.valeurs.niveauxHorsSol} etat={sc.valeurs.niveauxHorsSol != null ? { statut: 'connu', provenance: 'teleservice' } : { statut: 'non_declare' }} />
              <Ligne label="Niveaux de sous-sol" valeur={sc.valeurs.niveauxSousSol} etat={sc.valeurs.niveauxSousSol != null ? { statut: 'connu', provenance: 'teleservice' } : { statut: 'non_declare' }} />
              <Ligne label="Destination" valeur={sc.valeurs.destination} etat={sc.valeurs.destination ? { statut: 'connu', provenance: 'teleservice' } : { statut: 'non_declare' }} />
              <Ligne label="Surface créée" valeur={sc.valeurs.surfaceCreeeM2 != null ? `${sc.valeurs.surfaceCreeeM2} m²` : undefined} etat={sc.valeurs.surfaceCreeeM2 != null ? { statut: 'connu', provenance: 'teleservice' } : { statut: 'non_declare' }} />
            </dl>
          )}
        </div>
      )}

      {/* DIVERGENCES — jamais un écrasement silencieux : les deux valeurs, leurs sources, la valeur retenue selon la précédence. */}
      {(divNiveaux || d.ambigus.length > 0) && (
        <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <h5 style={styleTitreSection}>Divergences</h5>
          {divNiveaux && (
            <p role="note" style={styleAlerte}>
              ⚠ Niveaux hors sol : le téléservice indique <strong>R+{divNiveaux.genere}</strong>, la déclaration du pétitionnaire indique <strong>R+{divNiveaux.humain}</strong>.
              {' '}Retenu : <strong>R+{divNiveaux.retenu}</strong> (déclaration du pétitionnaire, prioritaire sur le téléservice) — <em>à corroborer</em>.
            </p>
          )}
          {d.ambigus.length > 0 && (
            <p role="note" style={styleAlerte}>Ambigu, non retenu : {d.ambigus.map((a) => `${a.champ} (${a.motif})`).join(' ; ')}.</p>
          )}
        </div>
      )}

      {/* PIÈCES ANALYSÉES (demande d'Arno) — nom, nombre de pages, lien signé (mécanisme GED existant). */}
      <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
        <h5 style={styleTitreSection}>Pièces analysées</h5>
        {piecesCerfa && piecesCerfa.length > 0
          ? <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 12.5, lineHeight: 1.6 }}>
              {piecesCerfa.map((p) => {
                const ouvrir = lienPiece?.(p.nom);
                return (
                  <li key={p.id}>
                    {ouvrir
                      ? <button type="button" onClick={ouvrir} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-svv-lien-source)', fontSize: 12.5, textDecoration: 'underline', fontFamily: 'inherit' }}>{p.nom}</button>
                      : <span style={{ color: 'var(--color-svv-ink)' }}>{p.nom}</span>}
                    <span style={styleAide}> — {p.pages != null ? `${p.pages} page(s)` : 'nombre de pages indéterminé'}</span>
                  </li>
                );
              })}
            </ul>
          : <p style={styleAbsent}>Aucune pièce Cerfa dans la GED de ce dossier.</p>}
      </div>

      {/* CR-2b1 — LECTURE IA (à corroborer) : visuellement DISTINCTE (encadré pointillé violet), informative, jamais autoritative. */}
      <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
        <h5 style={styleTitreSection}>Lecture IA <span style={{ textTransform: 'none', fontWeight: 400 }}>(à corroborer)</span></h5>
        <div style={styleIaBox}>
          {!passeIa
            ? <p style={styleAbsent}>Lecture IA non disponible (non encore produite).</p>
            : passeIa.statut === 'echec'
              ? <p role="note" style={{ ...styleAbsent, color: 'var(--color-svv-red)' }}>Lecture IA échouée{passeIa.motif ? ` — ${passeIa.motif}` : ''}.</p>
              : passeIa.statut === 'abstention' || !passeIa.lecture
                ? <p style={styleAbsent}>L’IA n’a rien pu lire ici{passeIa.motif ? ` — ${passeIa.motif}` : ''}.</p>
                : <>
                    <p style={styleAide}>Ce que l’IA vision a lu sur les pages transmises — à corroborer, ne remplace jamais le déterministe ci-dessus.</p>
                    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(9rem, max-content) 1fr', gap: '.1rem .6rem', margin: 0 }}>
                      {['natureProjet', 'typeOperationSvav', 'recoursArchitecte', 'demolition', 'travauxParTranches'].map((k) => (
                        <LigneIa key={k} champ={k} c={(passeIa.lecture as unknown as Record<string, { valeur: unknown; confiance: string; page: number | null }>)[k]} />
                      ))}
                    </dl>
                    {passeIa.lecture.resumeDescription && <p style={{ margin: '.3rem 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-svv-ink)' }}><span style={{ color: 'var(--color-svv-muted)' }}>Résumé IA : </span>{passeIa.lecture.resumeDescription}</p>}
                  </>}
          {/* Journal de transmission (preuve RGPD de ce qui est parti chez le fournisseur), replié par défaut. */}
          {passeIa?.transmission && (
            <details style={{ marginTop: '.35rem', fontSize: 11.5 }}>
              <summary style={{ ...styleAide, cursor: 'pointer' }}>Ce qui a été transmis au fournisseur</summary>
              <p style={{ ...styleAide, margin: '.25rem 0 0' }}>
                Envoyées : {passeIa.transmission.envoyees.map((e) => `p${e.page} [${e.cibles.join('+')}]`).join(', ') || '(aucune — abstention)'}
              </p>
              <p style={{ ...styleAide, margin: '.1rem 0 0' }}>
                Refusées : {passeIa.transmission.refusees.filter((r) => !/aucune cible/.test(r.motif)).map((r) => `p${r.page} (${r.motif})`).join(' ; ') || '(aucune page-cible refusée)'}
              </p>
              {passeIa.modele && <p style={{ ...styleAide, margin: '.1rem 0 0' }}>Modèle : {passeIa.modele}{passeIa.passeLe ? ` · ${passeIa.passeLe}` : ''}</p>}
            </details>
          )}
        </div>
      </div>

      {/* PIÈCE DE PREUVE — le texte source complet reste atteignable, replié par défaut. */}
      {d.descriptionProjet && (
        <details style={{ fontSize: 12, lineHeight: 1.5, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.35rem .5rem', background: 'var(--color-svv-field)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-svv-ink)' }}>Voir le texte source du Cerfa</summary>
          <p style={{ margin: '.4rem 0 0', whiteSpace: 'pre-wrap', color: 'var(--color-svv-ink)' }}>{d.descriptionProjet}</p>
          <p style={{ ...styleAide, marginTop: '.3rem' }}>Texte repris tel quel du formulaire (pièce de preuve), sans résumé ni interprétation.</p>
        </details>
      )}
    </div>
  );
}
