'use client';

import { useCallback, useEffect, useState } from 'react';
// 🔴 LOT LISTE-PAGINATION — la MÊME barre que les trois autres listes du module (voir son encadré).
import { BarrePages, CSS_BARRE_PAGES } from './BarrePages';
import { ChoisirCible, CSS_CHOISIR_CIBLE, type CibleChoisie } from './ChoisirCible';
import { motSorte, CSS_ENCART_RATTACHEMENT } from './EncartRattachement';
import type { LigneFile, PageFile } from '../../../../lib/gestion/rattachementRepo';
import type { Issue, Statut } from '../../../../lib/gestion/rattachement';

/**
 * LOT RATTACHEMENT-1 — LA FILE « À TRIER » : les mails dont aucun rattachement n'est certain.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 ELLE MONTRE LES DEUX SORTES, et c'est le point. « À trier » (des candidats à départager) ET « aucun candidat »
 * (rien à proposer). Un mail sans candidat qu'aucun écran ne montre est un mail perdu — or c'est souvent celui d'un
 * nouvel interlocuteur, donc précisément celui qu'il faut rattacher à la main.
 *
 * 🔴 LES MAILS PAS ENCORE EXAMINÉS SONT COMPTÉS À PART, en toutes lettres. Les fondre dans « aucun candidat » ferait
 * croire à un travail de tri là où il n'y a qu'une commande à relancer.
 *
 * TROIS GESTES PAR MAIL, comme demandé : CONFIRMER une proposition, en CHOISIR UNE AUTRE (recherche dans
 * l'annuaire), ou REJETER. Et les mêmes par LOT SÉLECTIONNÉ — parce que trier 3 261 mails un par un ne se fait pas.
 *
 * ⚠️ LE TRI PAR LOT NE FAIT QUE CE QU'IL DIT. « Confirmer la sélection » confirme, pour chaque mail coché, SES
 * propres propositions — jamais une cible commune devinée. Un bouton qui appliquerait le même logement à vingt mails
 * hétéroclites serait une machine à erreurs silencieuses.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const VIDE: PageFile = {
  lignes: [], totaux: { aTrier: 0, sansCandidat: 0, automatiques: 0, nonExamines: 0 }, tronque: false,
};

export function FileATrier({ onRetour, onOuvrirFil, onGeste }: {
  onRetour: () => void;
  /** Ouvrir l'échange du mail, pour le lire avant de trancher. Absent = pas de lien. */
  /**
   * LOT MESSAGE-CLIQUÉ — on ouvre l'échange SUR LE MAIL DE LA LIGNE, celui qu'on est en train de départager, et non
   * sur le dernier de la conversation : c'est ce mail-là qu'on veut lire avant de trancher.
   */
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  onGeste?: (message: string) => void;
}) {
  const [etat, setEtat] = useState<'charge' | 'ok' | 'sans_schema' | 'erreur'>('charge');
  const [page, setPage] = useState(0);
  const [issue, setIssue] = useState<Issue | 'toutes'>('toutes');
  const [data, setData] = useState<PageFile>(VIDE);
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [autre, setAutre] = useState<number | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setEtat('charge');
    try {
      const res = await fetch(
        `/api/admin/gestion/rattachements?file=1&page=${page}&issue=${issue}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: PageFile };
      if (d.etat === 'ok') { setData(d.data ?? VIDE); setEtat('ok'); }
      else if (d.etat === 'sans_schema') setEtat('sans_schema');
      else setEtat('erreur');
    } catch {
      setEtat('erreur');
    }
  }, [page, issue]);

  useEffect(() => { void charger(); }, [charger]);

  /** Un geste, puis rechargement. Rend le nombre de gestes réussis. */
  const agir = async (
    appels: { corps: Record<string, unknown>; methode: 'POST' | 'PATCH' }[], dit: (n: number) => string,
  ): Promise<void> => {
    if (appels.length === 0) return;
    setOccupe(true);
    setErreur(null);
    let faits = 0;
    let dernierMotif: string | null = null;
    try {
      for (const a of appels) {
        try {
          const res = await fetch('/api/admin/gestion/rattachements', {
            method: a.methode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(a.corps),
          });
          const d = (await res.json()) as { ok?: boolean; erreur?: string };
          if (res.ok && d.ok === true) faits += 1; else dernierMotif = d.erreur ?? 'geste refusé';
        } catch {
          dernierMotif = 'le serveur n’a pas répondu';
        }
      }
      // ON DIT CE QUI A ÉCHOUÉ, pas seulement ce qui a marché : un silence sur 3 échecs sur 20 serait un mensonge.
      if (dernierMotif !== null) {
        setErreur(faits === 0
          ? `Aucun geste n’a abouti : ${dernierMotif}.`
          : `${faits} geste(s) sur ${appels.length} — le reste a échoué : ${dernierMotif}.`);
      }
      if (faits > 0) { onGeste?.(dit(faits)); setCoches(new Set()); await charger(); }
    } finally {
      setOccupe(false);
    }
  };

  const changerLiens = (lignes: readonly LigneFile[], statut: Statut, mot: string): Promise<void> => agir(
    lignes.flatMap((l) => l.candidats.map((c) => ({ corps: { lienId: c.id, statut }, methode: 'PATCH' as const }))),
    (n) => `${n} proposition(s) ${mot}`);

  const cochees = data.lignes.filter((l) => coches.has(l.messageId));
  const cocheesAvecCandidats = cochees.filter((l) => l.candidats.length > 0);

  /**
   * ══ 🔴🔴 LOT LISTE-PAGINATION — COMBIEN DE MAILS DANS **CETTE** LISTE, selon le filtre posé ══════════════════
   *
   * Les trois filtres de cet écran ne montrent pas la même chose, et le total doit suivre — c'est la règle du
   * lot : « N = le nombre de la liste affichée ». Les trois nombres existent déjà, calculés par le serveur avec
   * les mêmes prédicats que les lignes (`totaux`) ; on ne recompte rien, on choisit.
   *
   * ⚠️ « Tous » EST BIEN LA SOMME DES DEUX AUTRES, et non un quatrième nombre : le filtre « toutes » réunit
   * exactement les mails à départager et ceux sans candidat. Les mails RATTACHÉS AUTOMATIQUEMENT
   * (`totaux.automatiques`) n'entrent dans aucune des trois listes — ils n'ont rien à y faire, il n'y a plus
   * rien à trancher — et les compter ferait annoncer un total que la liste ne montrerait jamais.
   */
  const totalDuFiltre = issue === 'a_trier' ? data.totaux.aTrier
    : issue === 'sans_candidat' ? data.totaux.sansCandidat
      : data.totaux.aTrier + data.totaux.sansCandidat;
  /**
   * La barre, en haut et en bas. Le MÊME composant que la boîte, les brouillons et les échanges sans événement.
   *
   * ⚠️ CHANGER DE PAGE DÉCOCHE LA SÉLECTION, comme avant ce lot : les cases désignent des mails de la page
   * affichée, et un geste par lot appliqué à des lignes qu'on ne voit plus serait une machine à erreurs
   * silencieuses. C'est écrit ici, dans le geste, plutôt que répété dans deux boutons.
   */
  const rendreBarre = (ou: 'haut' | 'bas') => (
    <BarrePages ou={ou} page={page} lignes={data.lignes.length} total={totalDuFiltre}
      /* 🔴 LA SUITE VIENT DU SERVEUR (`tronque` : il a lu une ligne de plus), jamais d'une soustraction. */
      suite={data.tronque} occupe={occupe || etat === 'charge'} nom="la file"
      onPage={(v) => { setPage(Math.max(v, 0)); setCoches(new Set()); }} />
  );

  return (
    <section className="fat" aria-labelledby="fat-titre">
      <style>{CSS_FILE_A_TRIER}</style>
      <style>{CSS_CHOISIR_CIBLE}</style>
      <style>{CSS_ENCART_RATTACHEMENT}</style>

      <div className="fat-entete">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>← Écran partagé</button>
        {/* 🔴 LOT ERGO-BOITE-2 — LE COMPTEUR DU TITRE COMPTE LES MAILS À TRANCHER, et dit les autres À CÔTÉ.
            Il affichait `aTrier + sansCandidat`, soit 19 108 là où 3 261 mails seulement ont une proposition à
            confirmer ou rejeter. Un seul nombre pour deux travaux très différents (trancher d'un clic / inventer
            un rattachement à la main) ne renseignait sur aucun des deux. Les deux sont maintenant NOMMÉS — rien
            n'a disparu de l'écran, et le filtre « Sans candidat » les liste toujours. */}
        <h2 className="fat-titre" id="fat-titre">
          À trier <span className="gst-compte">{data.totaux.aTrier}</span>
          {data.totaux.sansCandidat > 0 && (
            <span className="fat-titre-suite"> + {data.totaux.sansCandidat} sans candidat</span>
          )}
        </h2>
      </div>

      {etat === 'sans_schema' && (
        <p className="gst-tronc">
          File de tri pas encore installée : la mise à jour de la base (migration 257) reste à appliquer.
        </p>
      )}
      {etat === 'erreur' && <p className="gst-tronc" role="alert">La file n’a pas pu être lue. Réessayez.</p>}

      {(etat === 'ok' || etat === 'charge') && (
        <>
          {/* LES CHIFFRES D'ABORD : ils disent l'ampleur du travail, ce qu'une page de 25 lignes ne dit pas. */}
          <p className="fat-chiffres" role="status">
            {data.totaux.automatiques} rattaché(s) automatiquement · {data.totaux.aTrier} à départager ·{' '}
            {data.totaux.sansCandidat} sans candidat
            {data.totaux.nonExamines > 0 && (
              <>
                {' · '}
                <strong>{data.totaux.nonExamines} pas encore examiné(s)</strong>
                {' — relancer '}
                <code className="fat-code">npm run gestion:rattachement:proposer -- --appliquer</code>
              </>
            )}
          </p>

          <div className="fat-filtres" role="group" aria-label="Quels mails montrer">
            {([['toutes', 'Tous'], ['a_trier', 'À départager'], ['sans_candidat', 'Sans candidat']] as const)
              .map(([v, mot]) => (
                <button key={v} type="button"
                  className={`svv-btn gst-btn ${issue === v ? 'svv-btn-primary' : 'svv-btn-outline'}`}
                  aria-pressed={issue === v}
                  onClick={() => { setIssue(v); setPage(0); setCoches(new Set()); }}>
                  {mot}
                </button>
              ))}
          </div>

          {/* LES GESTES PAR LOT — ils n'apparaissent que s'il y a quelque chose de coché ET d'actionnable. */}
          {cochees.length > 0 && (
            <div className="fat-lot" role="group" aria-label="Gestes sur la sélection">
              <span className="fat-lot-compte">{cochees.length} mail(s) sélectionné(s)</span>
              <button type="button" className="svv-btn svv-btn-primary gst-btn"
                disabled={occupe || cocheesAvecCandidats.length === 0}
                onClick={() => void changerLiens(cocheesAvecCandidats, 'confirme', 'confirmée(s)')}>
                Confirmer leurs propositions
              </button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                disabled={occupe || cocheesAvecCandidats.length === 0}
                onClick={() => void changerLiens(cocheesAvecCandidats, 'rejete', 'rejetée(s)')}>
                Rejeter leurs propositions
              </button>
              <button type="button" className="gst-lien-bouton" onClick={() => setCoches(new Set())}>
                Tout décocher
              </button>
              {cocheesAvecCandidats.length !== cochees.length && (
                <span className="fat-note">
                  {cochees.length - cocheesAvecCandidats.length} sans aucune proposition : rien à confirmer pour eux.
                </span>
              )}
            </div>
          )}

          {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

          {etat === 'charge' && <p className="gst-info" role="status">Chargement…</p>}

          {etat === 'ok' && data.lignes.length === 0 && (
            <p className="gst-vide">
              {data.totaux.nonExamines > 0
                ? 'Rien à trier pour l’instant — mais des mails n’ont pas encore été examinés (voir ci-dessus).'
                : 'Rien à trier : tous les mails examinés ont un rattachement certain.'}
            </p>
          )}

          {/* ══ 🔴 LOT LISTE-PAGINATION — LA BARRE DU HAUT, entre les filtres et la liste ═══════════════════════
              Demande d'Arno : la MÊME pagination que la boîte, ici aussi. Elle remplace les deux gros boutons
              « ← Précédents / page 3 / Suivants → » qui vivaient SEULEMENT en bas : il fallait dérouler
              vingt-cinq mails pour savoir où l'on en était, et autant pour revenir en arrière. */}
          {rendreBarre('haut')}

          <ul className="fat-liste">
            {data.lignes.map((l) => (
              <li key={l.messageId} className="fat-item">
                <div className="fat-item-tete">
                  <label className="fat-coche">
                    <input type="checkbox" checked={coches.has(l.messageId)}
                      onChange={() => setCoches((s) => {
                        const n = new Set(s);
                        if (n.has(l.messageId)) n.delete(l.messageId); else n.add(l.messageId);
                        return n;
                      })} />
                    <span className="fat-sr">Sélectionner ce mail</span>
                  </label>
                  <div className="fat-item-corps">
                    <p className="fat-objet">
                      {(l.objet ?? '').trim() === '' ? '(sans objet)' : l.objet}
                    </p>
                    <p className="fat-meta">
                      {l.sens === 'envoye' ? 'envoyé à' : 'reçu de'}{' '}
                      {(l.deNom ?? '').trim() === '' ? l.de : l.deNom}
                      {' · '}{l.recuLe.slice(0, 10)}
                      {l.nbPieces > 0 && ` · ${l.nbPieces} pièce${l.nbPieces > 1 ? 's' : ''} jointe${l.nbPieces > 1 ? 's' : ''}`}
                      {/* L'ÉTAT EN MOTS : « aucun candidat » se lit en niveaux de gris. */}
                      {' · '}<span className="fat-issue">{l.issue === 'a_trier' ? 'à départager' : 'aucun candidat'}</span>
                    </p>
                    {l.motif && <p className="fat-motif">{l.motif}</p>}
                  </div>
                  {onOuvrirFil && (
                    <button type="button" className="gst-lien-bouton" onClick={() => onOuvrirFil(l.filId, l.messageId)}>
                      Lire l’échange
                    </button>
                  )}
                </div>

                {l.candidats.length > 0 && (
                  <ul className="ert-liste fat-candidats">
                    {l.candidats.map((c) => (
                      <li key={c.id} className="ert-ligne ert-ligne--propose">
                        <span className="ert-sorte">{motSorte(c.cible.sorte)}</span>
                        <span className="ert-nom">{c.libelle}</span>
                        {c.motif && <span className="ert-motif">{c.motif}</span>}
                        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe}
                          onClick={() => void agir(
                            [{ corps: { lienId: c.id, statut: 'confirme' }, methode: 'PATCH' }],
                            () => `Rattachement confirmé : ${c.libelle}`)}>
                          Confirmer
                        </button>
                        <button type="button" className="gst-lien-bouton" disabled={occupe}
                          onClick={() => void agir(
                            [{ corps: { lienId: c.id, statut: 'rejete' }, methode: 'PATCH' }],
                            () => `Proposition rejetée : ${c.libelle}`)}>
                          Rejeter
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {autre === l.messageId ? (
                  <ChoisirCible titre="Rattacher ce mail à…"
                    dejaLa={l.candidats.map((c) => c.cible)}
                    onAnnuler={() => setAutre(null)}
                    onValider={async (choix: CibleChoisie[]) => {
                      await agir(
                        choix.map((c) => ({ corps: { messageId: l.messageId, cible: c.cible }, methode: 'POST' as const })),
                        (n) => `${n} rattachement(s) posé(s)`);
                      setAutre(null);
                    }} />
                ) : (
                  <button type="button" className="gst-lien-bouton fat-autre" disabled={occupe}
                    onClick={() => setAutre(l.messageId)}>
                    {l.candidats.length === 0 ? '+ Rattacher à…' : 'Choisir un autre…'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* ══ 🔴 LOT LISTE-PAGINATION — LA BARRE DU BAS ═══════════════════════════════════════════════════
              CE QUI ÉTAIT ICI : trois commandes en gros boutons (« ← Précédents », « page 3 », « Suivants → »),
              qui ne disaient NI combien de mails il reste, NI où l'on en est dans le total. « page 3 » sur
              16 628 mails à rattacher n'apprend rien. La barre dit « 51–75 sur 16 628 ». */}
          {rendreBarre('bas')}
        </>
      )}
    </section>
  );
}

export const CSS_FILE_A_TRIER = `
/* Mobile d'abord : une colonne, tout s'enroule, aucune largeur fixe. Les cases à cocher et les boutons font au
   moins 44 px. Aucune information ne tient à une couleur — l'état est écrit. */
.fat{display:flex;flex-direction:column;gap:.6rem;min-width:0}
.fat-entete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.6rem}
.fat-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink)}
.fat-titre-suite{font-size:.8rem;font-weight:500;color:var(--color-svv-muted)}
.fat-chiffres{margin:0;font-size:.82rem;color:var(--color-svv-muted);line-height:1.5;overflow-wrap:anywhere}
.fat-code{font-size:.78rem;padding:1px 4px;border-radius:4px;background:var(--color-svv-field);
  border:1px solid var(--color-svv-line)}
.fat-filtres{display:flex;flex-wrap:wrap;gap:.4rem}
.fat-lot{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:8px 10px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field)}
.fat-lot-compte{font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.fat-note{font-size:.76rem;color:var(--color-svv-muted)}
.fat-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.5rem}
.fat-item{display:flex;flex-direction:column;gap:.3rem;padding:10px 12px;border-radius:10px;
  border:1px solid var(--color-svv-line);min-width:0}
.fat-item-tete{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.5rem}
.fat-coche{display:flex;align-items:center;min-width:44px;min-height:44px}
.fat-coche input{min-width:20px;min-height:20px}
.fat-item-corps{flex:1 1 14rem;min-width:0}
.fat-objet{margin:0;font-size:.9rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.fat-meta{margin:2px 0 0;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.fat-issue{font-weight:700}
.fat-motif{margin:2px 0 0;font-size:.76rem;font-style:italic;color:var(--color-svv-muted);overflow-wrap:anywhere}
.fat-candidats{margin-top:.2rem}
.fat-autre{align-self:flex-start}
/* 🔴 LOT LISTE-PAGINATION — .fat-pages a disparu avec les trois gros boutons qu'elle habillait. C'est la feuille
   partagee (posee plus bas) qui porte desormais la pagination, la meme que partout ailleurs dans le module.
   ⚠️ NE PAS ECRIRE ICI LE NOM DE LA CONSTANTE PRECEDE D'UN DOLLAR-ACCOLADE : ce commentaire vit DANS un litteral
   de gabarit, et la constante serait INTERPOLEE — la feuille entiere se retrouverait a l'interieur d'un
   commentaire CSS, en double. Piege rencontre a l'ecriture de ce lot. */
.fat-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);
  white-space:nowrap;border:0}

${CSS_BARRE_PAGES}
`;
