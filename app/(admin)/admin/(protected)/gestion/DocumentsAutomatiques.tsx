'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  anneesDe, AUCUN_DOCUMENT, MENTION_GARANT, SOUS_TYPES, type DocumentDeFiche,
} from '../../../../lib/gestion/documentsAuto';

/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — LE DOSSIER « DOCUMENTS AUTOMATIQUES » D'UNE FICHE ════════════════════
 *
 * DÉCISION D'ARNO (01/10/2026) : « Dans chaque fiche propriétaire et locataire, une section “Documents
 * automatiques” : le nombre, une liste par date décroissante (date, sous-type lisible, objet), un filtre par
 * sous-type et par année, un clic ouvre le mail. »
 *
 * 🔴 CE N'EST PAS L'HISTORIQUE DU BIEN, et l'écran doit le dire. Un document automatique est rangé chez une
 * PERSONNE, pas dans un logement : il n'entre dans l'historique d'aucun bien, ni dans aucune fenêtre de
 * conversation. La phrase d'introduction le rappelle, parce que deux listes de mails dans la même fiche se
 * confondraient au premier coup d'œil.
 *
 * ⚠️ SANS LA MIGRATION 291, LA ROUTE REND « sans_schema » ET LA SECTION NE S'AFFICHE PAS DU TOUT. Pas de cadre
 * vide, pas de « bientôt disponible » : la fiche est exactement celle d'avant ce lot.
 *
 * ⚠️ UNE FICHE SANS DOCUMENT N'A PAS DE SECTION NON PLUS — une ligne discrète, et rien d'autre (demande d'Arno).
 */
export function DocumentsAutomatiques({ sorte, id }: {
  sorte: 'proprietaire' | 'locataire';
  /** L'identifiant de la fiche. La CLÉ est relue par le serveur : elle ne transite pas par le navigateur. */
  id: number;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'absent' } | { v: 'ok'; docs: DocumentDeFiche[] }
  >({ v: 'charge' });
  const [sousType, setSousType] = useState<string>('');
  const [annee, setAnnee] = useState<string>('');

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/annuaire/documents?sorte=${sorte}&id=${id}`,
          { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; data?: DocumentDeFiche[] };
        if (!vivant) return;
        // 🔴 « sans_schema » ET TOUTE ERREUR MÈNENT AU MÊME ÉTAT : la section disparaît. Une fiche ne doit jamais
        //   afficher un cadre en panne pour une nouveauté qui n'est pas encore installée.
        setEtat(d.etat === 'ok' && Array.isArray(d.data) ? { v: 'ok', docs: d.data } : { v: 'absent' });
      } catch {
        if (vivant) setEtat({ v: 'absent' });
      }
    })();
    return () => { vivant = false; };
  }, [sorte, id]);

  const docs = etat.v === 'ok' ? etat.docs : [];
  const annees = useMemo(() => anneesDe(docs.map((d) => d.le)), [docs]);
  const sousTypesPresents = useMemo(
    () => SOUS_TYPES.filter((s) => docs.some((d) => d.sousType === s)), [docs]);
  const visibles = useMemo(() => docs.filter(
    (d) => (sousType === '' || d.sousType === sousType) && (annee === '' || d.le.startsWith(annee)),
  ), [docs, sousType, annee]);

  if (etat.v === 'charge' || etat.v === 'absent') return null;
  if (docs.length === 0) {
    return <p className="ann-discret dau-aucun">{AUCUN_DOCUMENT}</p>;
  }

  return (
    <section className="ann-bloc dau" aria-labelledby="dau-titre">
      <style>{CSS_DOCUMENTS_AUTO}</style>
      <h4 className="ann-bloc-titre" id="dau-titre">
        Documents automatiques <span className="gst-compte">{docs.length}</span>
      </h4>
      {/* 🔴 ON DIT CE QUE C'EST, parce que la fiche porte déjà une liste de mails juste à côté. */}
      <p className="ann-gris">
        Les documents envoyés par le logiciel de gestion à <strong>cette fiche</strong> (quittances, décomptes,
        relances…). Ils sont rangés par personne, et n’entrent dans l’historique d’aucun bien.
      </p>

      {/* ══ LES DEUX FILTRES. Ils n'apparaissent que s'il y a quelque chose à filtrer. ═══════════════════════ */}
      {(sousTypesPresents.length > 1 || annees.length > 1) && (
        <div className="dau-filtres">
          {sousTypesPresents.length > 1 && (
            <label className="dau-filtre">
              <span className="dau-filtre-mot">Type</span>
              <select value={sousType} onChange={(e) => setSousType(e.target.value)}>
                <option value="">tous ({docs.length})</option>
                {sousTypesPresents.map((s) => (
                  <option key={s} value={s}>{s} ({docs.filter((d) => d.sousType === s).length})</option>
                ))}
              </select>
            </label>
          )}
          {annees.length > 1 && (
            <label className="dau-filtre">
              <span className="dau-filtre-mot">Année</span>
              <select value={annee} onChange={(e) => setAnnee(e.target.value)}>
                <option value="">toutes</option>
                {annees.map((a) => (
                  <option key={a} value={a}>{a} ({docs.filter((d) => d.le.startsWith(a)).length})</option>
                ))}
              </select>
            </label>
          )}
          {(sousType !== '' || annee !== '') && (
            <button type="button" className="gst-lien-bouton"
              onClick={() => { setSousType(''); setAnnee(''); }}>tout afficher</button>
          )}
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="ann-discret">Aucun document ne correspond à ce filtre.</p>
      ) : (
        <ul className="dau-liste">
          {visibles.map((d) => (
            <li key={d.messageId} className="dau-ligne">
              {/* ⚠️ UN VRAI LIEN, pas un bouton : on ouvre un mail, et l'on veut pouvoir le faire dans un
                  nouvel onglet. Le lien WIPPIMMO du corps, lui, reste cliquable tel quel dans le mail. */}
              <a className="dau-lien" href={`/admin/gestion?fil=${d.filId}&message=${d.messageId}`}>
                <span className="dau-date">{d.le}</span>
                <span className="dau-type">{d.sousType}</span>
                <span className="dau-objet">{d.objet}</span>
                {/* 🔴 LA MENTION CHANGE LE SENS DE LA LIGNE, elle ne la décore pas : sans elle, une mise en
                    demeure partie chez la caution se lirait « on a écrit au locataire ». Décision d'Arno. */}
                {d.garant && <span className="dau-garant">{MENTION_GARANT}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const CSS_DOCUMENTS_AUTO = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL (piege TS1005 du depot).

   ══ 🔴 LE DOSSIER DES DOCUMENTS AUTOMATIQUES ════════════════════════════════════════════════════════════════════
   Meme langage visuel que le reste de la fiche : les jetons du theme, rien en dur, lisible en Clair comme en
   Sombre. Une ligne = une date, un mot, un objet — l'oeil balaye la colonne des dates. */
.dau-filtres{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;margin:.4rem 0 .6rem}
.dau-filtre{display:inline-flex;align-items:center;gap:.35rem;font-size:.82rem}
.dau-filtre-mot{color:var(--color-svv-muted);font-weight:600;font-size:.72rem;text-transform:uppercase;
  letter-spacing:.03em}
.dau-filtre select{font:inherit;font-size:.82rem;padding:.2rem .4rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.4rem}

.dau-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.dau-ligne{min-width:0}
/* LA LIGNE ENTIERE EST CLIQUABLE, et la cible tactile ne descend pas sous 36 px de hauteur. */
.dau-lien{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;min-height:36px;padding:.3rem .5rem;
  color:var(--color-svv-ink);text-decoration:none;border-radius:.4rem;border:1px solid transparent}
.dau-lien:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.dau-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* La date en chiffres tabulaires : les colonnes s'alignent, meme en proportionnel. */
.dau-date{flex:0 0 auto;font-variant-numeric:tabular-nums;font-size:.8rem;color:var(--color-svv-muted)}
.dau-type{flex:0 0 auto;padding:.05rem .4rem;font-size:.72rem;font-weight:700;letter-spacing:.02em;
  color:var(--color-svv-ink);background:var(--color-svv-field);border-radius:.3rem}
.dau-objet{flex:1 1 12rem;min-width:0;font-size:.84rem;overflow-wrap:anywhere}
/* LA MENTION « envoye au garant » : discrete, mais jamais effacee — elle change le sens de la ligne. */
.dau-garant{flex:0 0 auto;padding:.05rem .4rem;font-size:.68rem;font-weight:700;letter-spacing:.02em;
  text-transform:uppercase;color:var(--color-svv-red);border:1px solid currentColor;border-radius:.3rem}
.dau-aucun{margin:.3rem 0}
@media (max-width:560px){
  .dau-lien{gap:.3rem}
  .dau-objet{flex-basis:100%}
}
`;
