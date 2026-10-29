'use client';

import { useState, type ReactNode } from 'react';
import type { DetailDu, LigneDu, PersonneDu, SommeDu } from '../../../../lib/transaction/detailCommissions';
import { LIBELLE_SOCIETE, type Societe } from '../../../../lib/transaction/modele';
import { libelleStatut } from '../../../../lib/admin/statut';
import { montantAffiche, Montants, useAffichage } from './commun';

/**
 * ══ 🔴 LOT AQ (Arno, 29/10/2026) — « CE QUE L'ON DOIT — COMPROMIS NON ENCORE SIGNÉS » ══════════════════════════════════════════════════
 * Sous la liste des compromis en cours, au-dessus de « Compromis annulés » : ce que la société devra verser sur tous ses compromis pas encore
 * signés (quel que soit leur mois) — par négociateur, apporteur, agence extérieure, et l'inter-cabinet avec l'autre société (reversé, reçu,
 * solde). Les mêmes lignes au centime que les tuiles et les fenêtres (`detailDu`, qui relit `detailCommissions` / `detailCa`) ; le « Total
 * à verser » est celui de la tuile « Commissions versées ». Lecture seule ; sections repliables (ouvertes par défaut, choix retenu).
 */

const date = (d: string | null): string => (d === null ? 'date à renseigner' : d.split('-').reverse().join('/'));
const motDossiers = (n: number): string => `${n} dossier${n > 1 ? 's' : ''}`;

/** « dont ce mois : … · dont date à renseigner : … » (rien si aucune des deux). */
function Parts({ s, avant = false }: { s: SommeDu; avant?: boolean }) {
  const u = useAffichage();
  const parts = [
    ...(s.moisHtC !== 0 || s.moisTtcC !== 0 ? [<span key="m" data-dont-mois>dont ce mois : {montantAffiche(u, s.moisHtC / 100, s.moisTtcC / 100)}</span>] : []),
    ...(s.sansDateHtC !== 0 || s.sansDateTtcC !== 0 ? [<span key="d" data-dont-sans-date>dont date à renseigner : {montantAffiche(u, s.sansDateHtC / 100, s.sansDateTtcC / 100)}</span>] : []),
  ];
  if (parts.length === 0) return null;
  const suite = parts.flatMap((x, i) => (i === 0 ? [x] : [<span key={`s${i}`} aria-hidden="true">{' · '}</span>, x]));
  return avant ? <>{[<span key="a" aria-hidden="true">{' · '}</span>, ...suite]}</> : <span className="trx-du-parts">{suite}</span>;
}

/** Une section repliable : l'en-tête (sur la trame des sommes, lot AP) et son sous-total. 🔴 LOT AV — ouverte à chaque ouverture du bloc :
 *  les replis de catégorie ne sont plus mémorisés (ils restent utilisables une fois le bloc ouvert). */
function Section({ cle, titre, somme, sens, enfants, apresTitre }: { cle: string; titre: string; somme: SommeDu | null; sens: 'verse' | 'recu' | 'neutre'; enfants: ReactNode; apresTitre?: ReactNode }) {
  const [ouverte, setOuverte] = useState(true);
  const basculer = (): void => { setOuverte((o) => !o); };
  return (
    <section className="trx-du-section" data-section-du={cle} aria-label={titre}>
      <button type="button" className="trx-du-tete trx-somme" aria-expanded={ouverte} onClick={basculer} data-replier-du={cle}>
        <span className="trx-du-titre"><span className="trx-du-chevron" aria-hidden="true">{ouverte ? '▾' : '▸'}</span><strong>{titre}</strong>{apresTitre}</span>
        {somme !== null && <span className="trx-du-montant"><Montants ht={somme.htC / 100} ttc={somme.ttcC / 100} sens={sens} donnees={{ 'data-sous-total-du': cle }} /><Parts s={somme} /></span>}
      </button>
      {ouverte && <div className="trx-du-corps">{enfants}</div>}
    </section>
  );
}

export function BlocDu({ detail, societe, autreSociete, titres, onAller }: {
  detail: DetailDu;
  /** La société vue ; null : nos deux sociétés (CA global). */
  societe: Societe | null;
  /** Une vente porte un négociateur de l'autre société : la ligne grise « rémunérés par … ». */
  autreSociete: boolean;
  titres: Record<number, string>;
  onAller: (id: number) => void;
}) {
  const u = useAffichage();
  // 🔴 LOT AV (accord d'Arno) — fermé à chaque arrivée, sur une ligne ; un clic sur la ligne ouvre tout, un autre referme. Non retenu.
  const [ouvert, setOuvert] = useState(false);
  // 🔴 LOT AU — le nom vient de la société de l'écran (ou des deux sur le CA global), jamais écrit en dur.
  const qui = societe === null ? `${LIBELLE_SOCIETE.criterimmo} et ${LIBELLE_SOCIETE.macj}` : LIBELLE_SOCIETE[societe];
  const lienAffaire = (id: number): ReactNode => (
    <a className="trx-du-lien" href={`?vente=${id}`} onClick={(e) => { e.preventDefault(); onAller(id); }} data-aller-affaire-du={id}>{titres[id] ?? `Vente n° ${id}`}</a>
  );
  // 🔴 LOT AR — niveau 3, les dossiers : TOUJOURS visibles sous l'intervenant, en petit et en gris, indentés ; l'affaire (lien qui déplie sa
  // carte), sa date, puis le seul montant principal (l'unité du sélecteur), aligné à droite sous le cumul.
  const affaires = (p: PersonneDu) => (
    <ul className="trx-du-affaires" data-affaires-du={p.cle}>{p.lignes.map((l: LigneDu, i) => (
      <li key={i} className="trx-du-affaire">
        <span className="trx-du-quoi">{lienAffaire(l.venteId)}<span className={l.date === null ? 'trx-a-renseigner' : undefined}>{date(l.date)}</span>
          {l.statut !== undefined && p.statuts !== undefined && p.statuts.length > 1 && <span>{libelleStatut(l.statut ?? null)}</span>}</span>
        <span className="trx-du-montant-dossier" data-montant-dossier-du>{montantAffiche(u, l.htC / 100, l.ttcC / 100)}</span>
      </li>))}</ul>
  );
  // 🔴 LOT AR — niveau 2, l'intervenant : nom (et mention), puis en petit « N dossiers · dont … » ; le cumul, chiffre dominant, à droite.
  const ligne = (p: PersonneDu, sens: 'verse' | 'recu' | 'neutre', mention?: ReactNode) => (
    <li key={p.cle} className="trx-du-ligne" data-ligne-du={p.cle}>
      <div className="trx-du-personne">
        <span className="trx-du-qui"><strong data-nom-du>{p.nom}</strong>{mention}
          <span className="trx-du-detail"><span data-dossiers-du>{motDossiers(p.nbDossiers)}</span><Parts s={p} avant /></span></span>
        <span className="trx-du-montant"><Montants ht={p.htC / 100} ttc={p.ttcC / 100} sens={sens} donnees={{ 'data-cumul-du': p.cle }} /></span>
      </div>
      {p.lignes.length > 0 && affaires(p)}
    </li>
  );
  const aucune = (mot: string) => <p className="trx-du-aucun" data-aucun-du>{mot}</p>;
  const somme = (ps: readonly PersonneDu[]): SommeDu => ps.reduce((t, p) => ({ htC: t.htC + p.htC, ttcC: t.ttcC + p.ttcC, moisHtC: t.moisHtC + p.moisHtC, moisTtcC: t.moisTtcC + p.moisTtcC,
    sansDateHtC: t.sansDateHtC + p.sansDateHtC, sansDateTtcC: t.sansDateTtcC + p.sansDateTtcC }), { htC: 0, ttcC: 0, moisHtC: 0, moisTtcC: 0, sansDateHtC: 0, sansDateTtcC: 0 });
  const comptabilises = detail.negociateurs.filter((p) => p.classe === 'independant');
  const mentionNego = (p: PersonneDu): ReactNode => (
    <span className={p.classe === 'independant' ? 'trx-du-mention trx-rouge' : p.classe === 'a_renseigner' ? 'trx-du-mention trx-alerte' : 'trx-du-mention loc-muet'} data-mention-du>
      {(p.statuts ?? []).map((s) => libelleStatut(s ?? null)).join(' / ')} — {p.classe === 'independant' ? 'comptabilisé dans « Commissions versées »' : p.classe === 'interne' ? 'interne — non déduit' : 'statut à renseigner — non déduit'}</span>
  );
  // l'inter-cabinet : qui doit combien à qui (reçu − reversé), dans l'unité choisie
  const solde = (): string => {
    if (societe === null || detail.autre === null) return '';
    const ht = Math.abs(detail.soldeInterHtC) / 100; const ttc = Math.abs(detail.soldeInterTtcC) / 100;
    if (detail.soldeInterHtC === 0 && detail.soldeInterTtcC === 0) return `Aucun solde : ${LIBELLE_SOCIETE[societe]} et ${LIBELLE_SOCIETE[detail.autre]} ne se doivent rien`;
    const [doit, a] = detail.soldeInterTtcC < 0 || (detail.soldeInterTtcC === 0 && detail.soldeInterHtC < 0) ? [societe, detail.autre] : [detail.autre, societe];
    return `${LIBELLE_SOCIETE[doit]} doit ${montantAffiche(u, ht, ttc)} à ${LIBELLE_SOCIETE[a]}`;
  };
  return (
    <section className={`trx-du${ouvert ? ' trx-du--ouvert' : ''}`} aria-labelledby="trx-du-titre" data-bloc-du={societe ?? 'tous'} data-du-ouvert={ouvert ? '' : undefined}>
      <style>{CSS_BLOC_DU}</style>
      {/* 🔴 LOT AR — un vrai changement de section : grand espace, filet, un titre du niveau de « Compromis en cours », un fond à lui.
          🔴 LOT AV — toute la ligne d'en-tête est le bouton : la flèche et le titre à gauche ; « N dossiers » et le total à verser à droite. */}
      <h3 className="trx-du-entete">
        <button type="button" className="trx-du-bascule" aria-expanded={ouvert} aria-controls="trx-du-contenu" onClick={() => setOuvert((o) => !o)} data-ouvrir-du>
          <span className="trx-du-gauche"><span className="trx-du-chevron" aria-hidden="true">{ouvert ? '▾' : '▸'}</span><span id="trx-du-titre">Synthèse — ce que l’on doit et à qui</span></span>
          <span className="trx-du-droite"><span className="loc-muet" data-dossiers-du-bloc>{motDossiers(detail.nbDossiers)}</span>
            <span className="trx-du-total-entete"><span className="trx-du-mot-total">Total à verser par {qui}</span>
              <Montants ht={detail.total.htC / 100} ttc={detail.total.ttcC / 100} sens="verse" disposition="ligne" donnees={{ 'data-total-entete-du': '' }} /></span></span>
        </button>
      </h3>
      {ouvert && <div className="trx-du-contenu" id="trx-du-contenu">
      <p className="trx-du-sous-titre loc-muet" data-sous-titre-du>Compromis non encore signés, quel que soit leur mois</p>
      {/* 🔴 LOT AS — l'ordre : Négociateurs, Inter-cabinet, Apporteurs d'affaires, Agences extérieures ; chaque catégorie, une carte à part. */}
      <div className="trx-du-cartes" data-cartes-du>
        <Section cle="negociateurs" titre="Négociateurs" somme={somme(comptabilises)} sens="verse" apresTitre={<span className="loc-muet trx-du-note">comptabilisés</span>} enfants={<>
          {detail.negociateurs.length === 0 ? aucune('Aucun') : <ul className="trx-du-lignes">{detail.negociateurs.map((p) => ligne(p, p.classe === 'independant' ? 'verse' : 'neutre', mentionNego(p)))}</ul>}
          {autreSociete && societe !== null && <p className="trx-du-mention-autre" data-autre-societe-du>Négociateurs de {LIBELLE_SOCIETE[societe === 'criterimmo' ? 'macj' : 'criterimmo']} : rémunérés par {LIBELLE_SOCIETE[societe === 'criterimmo' ? 'macj' : 'criterimmo']} — non comptés ici</p>}
        </>} />
        {societe !== null && detail.reverse !== null && detail.recu !== null && detail.autre !== null ? (
          <Section cle="inter-cabinet" titre={`Inter-cabinet ${LIBELLE_SOCIETE[societe]} ↔ ${LIBELLE_SOCIETE[detail.autre]}`} somme={null} sens="neutre" enfants={<>
            <ul className="trx-du-lignes">
              {ligne({ ...detail.reverse, nom: `Reversé à ${LIBELLE_SOCIETE[detail.autre]}` }, 'verse')}
              {ligne({ ...detail.recu, nom: `Reçu de ${LIBELLE_SOCIETE[detail.autre]}` }, 'recu')}
            </ul>
            <p className="trx-du-solde trx-somme" data-solde-inter><span>= Solde inter-cabinet</span><strong>{solde()}</strong></p>
          </>} />
        ) : detail.neutralise !== null ? (
          <Section cle="inter-cabinet" titre="Inter-cabinet CRITERIMMO ↔ MACJ — neutralisé (compté une fois)" somme={detail.neutralise} sens="neutre" enfants={
            detail.neutralise.lignes.length === 0 ? aucune('Aucun') : <ul className="trx-du-lignes">{ligne({ ...detail.neutralise, nom: 'Entre nos sociétés' }, 'neutre')}</ul>} />
        ) : null}
        <Section cle="apporteurs" titre="Apporteurs d’affaires" somme={somme(detail.apporteurs)} sens="verse" enfants={
          detail.apporteurs.length === 0 ? aucune('Aucun') : <ul className="trx-du-lignes">{detail.apporteurs.map((p) => ligne(p, 'verse'))}</ul>} />
        <Section cle="agences" titre="Agences extérieures" somme={somme(detail.agences)} sens="verse" enfants={
          detail.agences.length === 0 ? aucune('Aucune') : <ul className="trx-du-lignes">{detail.agences.map((p) => ligne(p, 'verse'))}</ul>} />
      </div>
      <div className="trx-du-total trx-somme--finale" data-total-du>
        <span data-libelle-total-du>Total à verser par {qui}</span>
        <span className="trx-du-montant"><Montants ht={detail.total.htC / 100} ttc={detail.total.ttcC / 100} sens="verse" donnees={{ 'data-total-a-verser': '' }} /><Parts s={detail.total} /></span>
      </div>
      <p className="trx-du-internes loc-muet" data-internes-du>Commissions internes (non déduites) : {montantAffiche(u, detail.internes.htC / 100, detail.internes.ttcC / 100)}
        {(detail.aRenseigner.htC !== 0 || detail.aRenseigner.ttcC !== 0) && <> · statuts à renseigner (non déduits) : {montantAffiche(u, detail.aRenseigner.htC / 100, detail.aRenseigner.ttcC / 100)}</>}</p>
      </div>}
    </section>
  );
}

export const CSS_BLOC_DU = `
/* 🔴 LOT AR — un vrai changement de section : grand espace avant (LOT AT : la synthèse est le dernier bloc de la page, « Compromis annulés » passe au-dessus), un filet sur toute la largeur,
   un fond propre au bloc (--trx-fond-synthese, clair et sombre) ; les en-têtes de catégorie sur la trame (plus soutenue ici, pour se voir
   sur ce fond : contrastes AA mesurés au lot AP). */
.trx-du{display:flex;flex-direction:column;gap:12px;margin:48px 0 0;padding:16px 14px 14px;border-top:2px solid var(--color-svv-line-strong);border-radius:0 0 14px 14px;background:var(--trx-fond-synthese);--trx-trame:var(--trx-trame-finale)}
.trx-du-entete{margin:0;font-size:1rem;font-weight:800}
/* 🔴 LOT AV — la ligne d'en-tête, bouton sur toute la largeur : à gauche la flèche et le titre, à droite « N dossiers » et le total à verser ;
   au téléphone, deux lignes au plus (le titre, puis le reste). */
.trx-du-bascule{appearance:none;width:100%;display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;min-height:44px;margin:0;padding:4px 2px;
  border:0;border-radius:8px;background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
.trx-du-bascule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-du-gauche{display:flex;align-items:baseline;gap:8px;min-width:0;overflow-wrap:anywhere}
.trx-du-gauche .trx-du-chevron{font-size:.9rem}
.trx-du-droite{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:flex-end;gap:2px 16px;margin-left:auto;font-weight:400;text-align:right}
.trx-du-total-entete{display:inline-flex;flex-wrap:wrap;align-items:baseline;justify-content:flex-end;gap:0 8px;white-space:nowrap}
.trx-du-mot-total{font-weight:700}
.trx-du-total-entete .trx-mt-grand{font-size:1.15rem}
.trx-du-contenu{display:flex;flex-direction:column;gap:12px}
.trx-du-sous-titre{margin:-4px 0 0;font-size:.9rem}
/* 🔴 LOT AS — chaque catégorie, une CARTE posée sur le fond du bloc : surface des cartes d'affaires, bordure fine, coins arrondis, ombre plus
   discrète, un liseré de couleur à gauche (une couleur par catégorie, --trx-lisere-*, clair et sombre ; jamais le rouge, réservé aux montants) ;
   entre deux cartes, l'écart des cartes d'affaires (16 px). En tête, la catégorie sur la trame ; repliée, la carte ne garde que son en-tête. */
.trx-du-cartes{display:flex;flex-direction:column;gap:16px}
.trx-du-section{display:flex;flex-direction:column;gap:4px;overflow:hidden;border:1px solid var(--color-svv-line);border-left:5px solid var(--trx-du-lisere,var(--color-svv-line-strong));border-radius:12px;
  background:var(--color-svv-surface-raised);box-shadow:0 1px 2px color-mix(in srgb, var(--color-svv-tip-bg) 10%, transparent)}
.trx-du-section[data-section-du='negociateurs']{--trx-du-lisere:var(--trx-lisere-negociateurs)}
.trx-du-section[data-section-du='inter-cabinet']{--trx-du-lisere:var(--trx-lisere-inter)}
.trx-du-section[data-section-du='apporteurs']{--trx-du-lisere:var(--trx-lisere-apporteurs)}
.trx-du-section[data-section-du='agences']{--trx-du-lisere:var(--trx-lisere-agences)}
/* en sombre, la surface des cartes (#37455a) : le rouge « surélevé » de la charte (4,8:1) et un gris un cran plus clair (#b3bdc9, 5,1:1) pour tenir l'AA */
.svv-adm-root[data-theme='dark'] .trx-du-section{--color-svv-red:var(--color-svv-red-raised);--color-svv-muted:#b3bdc9}
@media (prefers-color-scheme: dark){ .svv-adm-root[data-theme='system'] .trx-du-section{--color-svv-red:var(--color-svv-red-raised);--color-svv-muted:#b3bdc9} }
.trx-du-section > .trx-du-tete{border-radius:0}
.trx-du-section > .trx-du-corps{padding:0 4px 8px}
.trx-du-section .trx-du-solde{margin:4px 8px 0}
/* niveau 1 : la catégorie, en gros */
.trx-du-tete{appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;min-height:44px;padding:10px 12px;border:0;font:inherit;font-size:1.08rem;color:inherit;text-align:left;cursor:pointer}
.trx-du-tete .trx-mt-grand{font-size:1.15rem}
.trx-du-tete:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.trx-du-titre,.trx-du-qui{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0;overflow-wrap:anywhere}
.trx-du-chevron{color:var(--color-svv-muted);font-size:.8rem}
/* LOT AS — l'en-tête de carte coule comme un texte : le chevron reste devant le nom quand un long titre passe à la ligne (téléphone). */
.trx-du-tete .trx-du-titre{display:block}
.trx-du-tete .trx-du-titre > *{margin-right:8px}
.trx-du-note{font-size:.82rem;font-weight:600}
/* niveau 2 : l'intervenant, taille normale ; le cumul domine la ligne */
.trx-du-personne{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:start;padding:10px 12px 2px;border-top:1px solid var(--color-svv-line)}
.trx-du-lignes > .trx-du-ligne:first-child > .trx-du-personne{border-top:0}
.trx-du-personne .trx-mt-grand{font-size:1.05rem}
.trx-du-mention{font-size:.82rem;font-weight:700}
.trx-du-detail{flex-basis:100%;font-size:.8rem;color:var(--color-svv-muted)}
.trx-du-montant{display:flex;flex-direction:column;align-items:flex-end;text-align:right}
.trx-du-parts{font-size:.78rem;color:var(--color-svv-muted);display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0 4px}
.trx-du-corps{display:flex;flex-direction:column;gap:4px;padding:0 4px}
.trx-du-lignes,.trx-du-affaires{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
/* niveau 3 : les dossiers, toujours visibles, en petit et en gris, indentés ; montants alignés à droite sous le cumul */
.trx-du-affaires{padding:0 12px 8px 28px;font-size:.84rem;color:var(--color-svv-muted)}
.trx-du-affaire{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline}
.trx-du-quoi{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px;min-width:0;overflow-wrap:anywhere}
.trx-du-montant-dossier{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.trx-du-lien{color:var(--color-svv-muted);font-weight:600;text-decoration:underline;display:inline-flex;align-items:center;min-height:28px;overflow-wrap:anywhere}
.trx-du-lien:hover,.trx-du-lien:focus-visible{color:var(--color-svv-red)}
@media (pointer:coarse){ .trx-du-lien{min-height:44px} }
.trx-du-solde{margin:4px 0 0;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline;padding:8px 10px}
.trx-du-solde strong{text-align:right}
.trx-du-total{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;padding:10px;border-radius:10px}
.trx-du-internes{margin:0;font-size:.88rem;text-align:right}
.trx-du-aucun{margin:0;padding:6px 12px;color:var(--color-svv-muted);font-style:italic;font-size:.85rem}
.trx-du-mention-autre{margin:0;padding:4px 12px;color:var(--color-svv-muted);font-size:.85rem}
/* Téléphone : une seule colonne — le nom (et sa mention) d'abord, le montant dessous, aligné à droite ; rien n'écrase le nom. */
@media (max-width:560px){
  .trx-du{padding:12px 10px 10px;margin:36px 0 0}
  /* LOT AV — au téléphone, la ligne fermée ne tient pas en deux rangées sans rien raccourcir : trois au plus — la flèche et le titre ;
     « N dossiers » et « Total à verser par … » ; le montant, aligné à droite (choix fait seul, rien n'est retiré). */
  .trx-du-bascule{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;row-gap:2px;align-items:baseline;padding:2px 0}
  .trx-du-droite,.trx-du-total-entete{display:contents}
  .trx-du-gauche{grid-column:1/-1;gap:6px;font-size:.88rem}
  [data-dossiers-du-bloc]{font-size:.85rem;white-space:nowrap}
  .trx-du-mot-total{font-size:.85rem;text-align:right;min-width:0}
  .trx-du-total-entete [data-total-entete-du]{grid-column:1/-1;justify-self:end;white-space:nowrap}
  .trx-du-tete,.trx-du-personne,.trx-du-total,.trx-du-solde{grid-template-columns:minmax(0,1fr);row-gap:4px}
  .trx-du-montant{align-items:flex-end}
  .trx-du-affaires{padding-left:14px;padding-right:8px}
  .trx-du-solde strong{text-align:left}
}
`;
