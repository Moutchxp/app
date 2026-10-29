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

const CLE_SECTION = (cle: string): string => `trx-du-section-${cle}`;
const lireOuverte = (cle: string): boolean => { try { return window.localStorage.getItem(CLE_SECTION(cle)) !== 'fermee'; } catch { return true; } };
const ecrireOuverte = (cle: string, ouverte: boolean): void => {
  try { if (ouverte) window.localStorage.removeItem(CLE_SECTION(cle)); else window.localStorage.setItem(CLE_SECTION(cle), 'fermee'); } catch { /* préférence d'affichage seulement */ }
};
const date = (d: string | null): string => (d === null ? 'date à renseigner' : d.split('-').reverse().join('/'));
const motDossiers = (n: number): string => `${n} dossier${n > 1 ? 's' : ''}`;

/** « dont ce mois : … · dont date à renseigner : … » (rien si aucune des deux). */
function Parts({ s }: { s: SommeDu }) {
  const u = useAffichage();
  const parts = [
    ...(s.moisHtC !== 0 || s.moisTtcC !== 0 ? [<span key="m" data-dont-mois>dont ce mois : {montantAffiche(u, s.moisHtC / 100, s.moisTtcC / 100)}</span>] : []),
    ...(s.sansDateHtC !== 0 || s.sansDateTtcC !== 0 ? [<span key="d" data-dont-sans-date>dont date à renseigner : {montantAffiche(u, s.sansDateHtC / 100, s.sansDateTtcC / 100)}</span>] : []),
  ];
  return parts.length === 0 ? null : <span className="trx-du-parts">{parts.flatMap((x, i) => (i === 0 ? [x] : [<span key={`s${i}`} aria-hidden="true">{' · '}</span>, x]))}</span>;
}

/** Une section repliable : l'en-tête (sur la trame des sommes, lot AP) et son sous-total. */
function Section({ cle, titre, somme, sens, enfants, apresTitre }: { cle: string; titre: string; somme: SommeDu | null; sens: 'verse' | 'recu' | 'neutre'; enfants: ReactNode; apresTitre?: ReactNode }) {
  const [ouverte, setOuverte] = useState(() => lireOuverte(cle));
  const basculer = (): void => { setOuverte((o) => { ecrireOuverte(cle, !o); return !o; }); };
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
  const [depliees, setDepliees] = useState<Record<string, boolean>>({});
  const qui = societe === null ? 'CRITERIMMO et MACJ' : LIBELLE_SOCIETE[societe];
  const lienAffaire = (id: number): ReactNode => (
    <a className="trx-du-lien" href={`?vente=${id}`} onClick={(e) => { e.preventDefault(); onAller(id); }} data-aller-affaire-du={id}>{titres[id] ?? `Vente n° ${id}`}</a>
  );
  const affaires = (p: PersonneDu, sens: 'verse' | 'recu' | 'neutre') => (
    <ul className="trx-du-affaires" data-affaires-du={p.cle}>{p.lignes.map((l: LigneDu, i) => (
      <li key={i} className="trx-du-affaire">
        <span className="trx-du-quoi">{lienAffaire(l.venteId)}<span className={l.date === null ? 'loc-muet trx-a-renseigner' : 'loc-muet'}>{date(l.date)}</span>
          {l.statut !== undefined && p.statuts !== undefined && p.statuts.length > 1 && <span className="loc-muet">{libelleStatut(l.statut ?? null)}</span>}</span>
        <Montants ht={l.htC / 100} ttc={l.ttcC / 100} sens={sens} disposition="ligne" />
      </li>))}</ul>
  );
  const ligne = (p: PersonneDu, sens: 'verse' | 'recu' | 'neutre', mention?: ReactNode) => {
    const ouverte = depliees[p.cle] === true;
    return (
      <li key={p.cle} className="trx-du-ligne" data-ligne-du={p.cle}>
        <button type="button" className="trx-du-personne" aria-expanded={ouverte} onClick={() => setDepliees((x) => ({ ...x, [p.cle]: !ouverte }))} data-deplier-du={p.cle}>
          <span className="trx-du-qui"><span className="trx-du-chevron" aria-hidden="true">{ouverte ? '▾' : '▸'}</span><strong data-nom-du>{p.nom}</strong>
            {mention}<span className="loc-muet" data-dossiers-du>{motDossiers(p.nbDossiers)}</span></span>
          <span className="trx-du-montant"><Montants ht={p.htC / 100} ttc={p.ttcC / 100} sens={sens} donnees={{ 'data-cumul-du': p.cle }} /><Parts s={p} /></span>
        </button>
        {ouverte && affaires(p, sens)}
      </li>
    );
  };
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
    <section className="trx-du" aria-labelledby="trx-du-titre" data-bloc-du={societe ?? 'tous'}>
      <style>{CSS_BLOC_DU}</style>
      <div className="trx-du-entete">
        <h3 id="trx-du-titre">Ce que l’on doit — compromis non encore signés</h3>
        <span className="loc-muet" data-dossiers-du-bloc>{motDossiers(detail.nbDossiers)}</span>
      </div>
      <Section cle="negociateurs" titre="Négociateurs" somme={somme(comptabilises)} sens="verse" apresTitre={<span className="loc-muet trx-du-note">comptabilisés</span>} enfants={<>
        {detail.negociateurs.length === 0 ? aucune('Aucun') : <ul className="trx-du-lignes">{detail.negociateurs.map((p) => ligne(p, p.classe === 'independant' ? 'verse' : 'neutre', mentionNego(p)))}</ul>}
        {autreSociete && societe !== null && <p className="trx-du-mention-autre" data-autre-societe-du>Négociateurs de {LIBELLE_SOCIETE[societe === 'criterimmo' ? 'macj' : 'criterimmo']} : rémunérés par {LIBELLE_SOCIETE[societe === 'criterimmo' ? 'macj' : 'criterimmo']} — non comptés ici</p>}
      </>} />
      <Section cle="apporteurs" titre="Apporteurs d’affaires" somme={somme(detail.apporteurs)} sens="verse" enfants={
        detail.apporteurs.length === 0 ? aucune('Aucun') : <ul className="trx-du-lignes">{detail.apporteurs.map((p) => ligne(p, 'verse'))}</ul>} />
      <Section cle="agences" titre="Agences extérieures" somme={somme(detail.agences)} sens="verse" enfants={
        detail.agences.length === 0 ? aucune('Aucune') : <ul className="trx-du-lignes">{detail.agences.map((p) => ligne(p, 'verse'))}</ul>} />
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
      <div className="trx-du-total trx-somme--finale" data-total-du>
        <span>Total à verser — {qui}</span>
        <span className="trx-du-montant"><Montants ht={detail.total.htC / 100} ttc={detail.total.ttcC / 100} sens="verse" donnees={{ 'data-total-a-verser': '' }} /><Parts s={detail.total} /></span>
      </div>
      <p className="trx-du-internes loc-muet" data-internes-du>Commissions internes (non déduites) : {montantAffiche(u, detail.internes.htC / 100, detail.internes.ttcC / 100)}
        {(detail.aRenseigner.htC !== 0 || detail.aRenseigner.ttcC !== 0) && <> · statuts à renseigner (non déduits) : {montantAffiche(u, detail.aRenseigner.htC / 100, detail.aRenseigner.ttcC / 100)}</>}</p>
    </section>
  );
}

export const CSS_BLOC_DU = `
.trx-du{display:flex;flex-direction:column;gap:10px;margin-top:20px;padding:14px;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.trx-du-entete{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px}
.trx-du-entete h3{margin:0;font-size:1.05rem;font-weight:800;min-width:0;overflow-wrap:anywhere}
.trx-du-section{display:flex;flex-direction:column;gap:4px}
.trx-du-tete,.trx-du-personne{appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;min-height:44px;padding:8px 10px;border:0;font:inherit;color:inherit;text-align:left;cursor:pointer}
.trx-du-personne{background:transparent;border-top:1px solid var(--color-svv-line);border-radius:0}
.trx-du-tete:focus-visible,.trx-du-personne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.trx-du-titre,.trx-du-qui{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0;overflow-wrap:anywhere}
.trx-du-chevron{color:var(--color-svv-muted);font-size:.8rem}
.trx-du-note{font-size:.82rem;font-weight:600}
.trx-du-mention{font-size:.82rem;font-weight:700}
.trx-du-montant{display:flex;flex-direction:column;align-items:flex-end;text-align:right}
.trx-du-parts{font-size:.78rem;color:var(--color-svv-muted);display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0 4px}
.trx-du-corps{display:flex;flex-direction:column;gap:4px;padding:0 4px}
.trx-du-lignes,.trx-du-affaires{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.trx-du-affaires{padding:0 0 6px 26px}
.trx-du-affaire{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline}
.trx-du-quoi{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px;min-width:0;overflow-wrap:anywhere}
.trx-du-solde{margin:4px 0 0;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:baseline;padding:8px 10px}
.trx-du-solde strong{text-align:right}
.trx-du-total{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;padding:10px;border-radius:10px}
.trx-du-internes{margin:0;font-size:.88rem;text-align:right}
.trx-du-lien{color:var(--color-svv-red);font-weight:700;text-decoration:underline;display:inline-flex;align-items:center;min-height:44px;overflow-wrap:anywhere}
.trx-du-aucun{margin:0;padding:6px 10px;color:var(--color-svv-muted);font-style:italic}
.trx-du-mention-autre{margin:0;padding:4px 10px;color:var(--color-svv-muted);font-size:.9rem}
/* Téléphone : une seule colonne — le nom (et sa mention) d'abord, le montant dessous, aligné à droite ; rien n'écrase le nom. */
@media (max-width:560px){
  .trx-du{padding:10px}
  .trx-du-tete,.trx-du-personne,.trx-du-affaire,.trx-du-total,.trx-du-solde{grid-template-columns:minmax(0,1fr);row-gap:4px}
  .trx-du-montant{align-items:flex-end}
  .trx-du-affaire > .trx-mt{justify-self:end}
  .trx-du-affaires{padding-left:12px}
  .trx-du-solde strong{text-align:left}
}
`;
