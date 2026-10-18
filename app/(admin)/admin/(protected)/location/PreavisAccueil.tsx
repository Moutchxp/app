'use client';

import { useEffect, useState } from 'react';
import { EtatLecture, envoyer, useLecture } from './commun';
import { ConfirmationSortie, MESSAGE_SORTIE_GESTION } from './SortieLocataires';
import { aujourdhuiParisEcran, CSS_PREAVIS, MentionPreavis } from './Preavis';
import {
  ajouterMois, dateFrPreavis, EDL_MOIS_APRES_FIN, lireTri, trierPreavis, TRI_DEFAUT, verifierEtatDesLieux,
  type LignePreavisAccueil, type TriPreavis,
} from '../../../../lib/location/preavis';
import type { BailLogement } from '../../../../lib/location/sortieLocataires';

/**
 * ══ 🔴🔴 ACCUEIL LOCATION — LE BLOC « LOCATAIRES EN PRÉAVIS » (Arno, 18/10/2026) ═════════════════════════════════════════
 * Sous les trois grosses cases, séparé d'elles par EXACTEMENT le même espace que celui qui sépare la barre de recherche des
 * cases (le même espace réservé `loc-zone-resultats loc-zone-resultats--vide`, posé par l'accueil). Une ligne par préavis,
 * TOUTES DE LA MÊME HAUTEUR (deux lignes de texte) : les locataires ; l'adresse · « Fin de préavis le … » · « État des lieux
 * le … » ; la mention orange (« en préavis » / « Préavis échu — sortie à saisir », avec le mot) ; « Ouvrir » / « Fermer ».
 * Dépliée : la date d'état des lieux prévue (saisie, modifiable, effaçable — journalisé), la SORTIE OFFICIELLE par LA
 * confirmation réduite commune (`ConfirmationSortie` → action `sortie-locataires` → `enregistrerSortie`, droit Gestion vérifié
 * au serveur), les liens vers la fiche et l'écran de sortie. Deux tris segmentés, mémorisés en préférence LOCALE.
 * Les données sont celles du préavis (`preavisEnCours`) : aucune table propre à l'accueil, aucune deuxième implémentation.
 */

export const CLE_TRI = 'svav.location.preavis.tri';

function lireTriMemorise(): TriPreavis {
  try { return lireTri(window.localStorage.getItem(CLE_TRI)); } catch { return TRI_DEFAUT; }
}
function memoriserTri(t: TriPreavis): void {
  try { window.localStorage.setItem(CLE_TRI, `${t.cle}:${t.sens}`); } catch { /* préférence d'affichage seulement : l'écran marche sans */ }
}

interface Donnees { disponible: boolean; etatDesLieux: boolean; lignes: LignePreavisAccueil[] }

export function BlocPreavisAccueil({ gestion }: { gestion: boolean }) {
  const [version, setVersion] = useState(0);
  const lu = useLecture<Donnees>(`preavisEnCours=1&v=${version}`);
  const [tri, setTri] = useState<TriPreavis>(TRI_DEFAUT);
  // La préférence locale est lue APRÈS le montage : le rendu serveur et le premier rendu client restent identiques.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTri(lireTriMemorise()); }, []);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);
  const choisirTri = (t: TriPreavis): void => { setTri(t); memoriserTri(t); };
  const d = lu.etat.etat === 'ok' ? lu.etat.data : null;
  // Une réponse inattendue (serveur plus ancien que l'écran) ne fait jamais tomber l'accueil : on n'affiche que ce qui est lisible.
  const lignes = d === null || !Array.isArray(d.lignes) ? [] : trierPreavis(d.lignes, tri);
  const jour = aujourdhuiParisEcran();
  const segment = (t: TriPreavis, libelle: string) => (
    <button type="button" className="pva-segment" aria-pressed={tri.cle === t.cle && tri.sens === t.sens}
      data-tri={`${t.cle}:${t.sens}`} onClick={() => choisirTri(t)}>{libelle}</button>
  );
  return (
    <section className="pva" aria-label="Locataires en préavis" data-bloc-preavis>
      <style>{CSS_PREAVIS + CSS_PREAVIS_ACCUEIL}</style>
      <h2 className="pva-titre">Locataires en préavis <span className="loc-pastille" data-nombre-preavis>{lignes.length}</span></h2>
      {lu.etat.etat !== 'ok' ? <EtatLecture etat={lu.etat} /> : !d!.disponible ? (
        <p className="loc-muet" data-preavis-indisponible>Préavis : la mise à jour de la base (migration 383) reste à appliquer.</p>
      ) : (
        <>
          <div className="pva-tris" role="group" aria-label="Trier les préavis">
            <div className="pva-tri" role="group" aria-label="Fin de préavis">
              <span className="pva-tri-libelle">Fin de préavis</span>
              {segment({ cle: 'fin', sens: 'asc' }, 'Plus proche d’abord')}
              {segment({ cle: 'fin', sens: 'desc' }, 'Plus lointaine d’abord')}
            </div>
            <div className="pva-tri" role="group" aria-label="État des lieux">
              <span className="pva-tri-libelle">État des lieux</span>
              {segment({ cle: 'edl', sens: 'asc' }, 'Plus proche d’abord')}
              {segment({ cle: 'edl', sens: 'desc' }, 'Plus lointain d’abord')}
            </div>
          </div>
          {bilan !== null && <p className="gst-info" role="status" data-preavis-bilan>{bilan}</p>}
          {lignes.length === 0 ? <p className="loc-muet" data-preavis-vide>Aucun locataire en préavis</p> : (
            <ul className="pva-liste">
              {lignes.map((l) => {
                const noms = l.locataires.map((x) => x.nom).join(', ');
                const detail = [l.adresse ?? `Bien ${l.lotId}`, `Fin de préavis le ${dateFrPreavis(l.dateMax)}`,
                  l.etatDesLieuxLe ? `État des lieux le ${dateFrPreavis(l.etatDesLieuxLe)}` : null].filter((x) => x !== null).join(' · ');
                const estOuverte = ouverte === l.cle;
                return (
                  <li key={l.cle} className="pva-item" data-ligne-preavis={l.cle}>
                    <div className="pva-ligne">
                      <div className="pva-textes">
                        <span className="pva-noms" title={noms}>{noms}</span>
                        <span className="pva-detail" title={detail}>{detail}</span>
                      </div>
                      <MentionPreavis p={l} jour={jour} court />
                      <button type="button" className="svv-btn svv-btn-outline gst-btn pva-ouvrir" aria-expanded={estOuverte}
                        aria-label={`${estOuverte ? 'Fermer' : 'Ouvrir'} le préavis de ${noms}`} data-ouvrir-preavis={l.cle}
                        onClick={() => setOuverte(estOuverte ? null : l.cle)}>{estOuverte ? 'Fermer' : 'Ouvrir'}</button>
                    </div>
                    {estOuverte && (
                      <LigneDepliee l={l} gestion={gestion} edlDisponible={d!.etatDesLieux}
                        apres={() => setVersion((v) => v + 1)}
                        sortieFaite={(phrase, mail) => {
                          setOuverte(null);
                          setBilan(`Sortie enregistrée — ${noms}. ${phrase}${mail === null ? '' : ` ${mail}`}`);
                          setVersion((v) => v + 1);
                        }} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function LigneDepliee({ l, gestion, edlDisponible, apres, sortieFaite }: {
  l: LignePreavisAccueil; gestion: boolean; edlDisponible: boolean; apres: () => void; sortieFaite: (phrase: string, mail: string | null) => void;
}) {
  const [edl, setEdl] = useState(l.etatDesLieuxLe ?? '');
  const [refusEdl, setRefusEdl] = useState<string | null>(null);
  const [envoiEdl, setEnvoiEdl] = useState(false);
  const [sortie, setSortie] = useState(false);
  const verdict = verifierEtatDesLieux(edl, [{ recuLe: l.recuLe, dateMax: l.dateMax }]);
  const enregistrerEdl = async (date: string): Promise<void> => {
    setEnvoiEdl(true); setRefusEdl(null);
    const r = await envoyer({ action: 'etat-des-lieux', occupationIds: l.occupationIds, date });
    setEnvoiEdl(false);
    if (r.motif !== null) { setRefusEdl(r.motif); return; }
    if (date === '') setEdl('');
    apres();
  };
  const premier = l.locataires[0];
  return (
    <div className="pva-depliee" data-ligne-depliee={l.cle}>
      <div className="pva-bloc" data-bloc-edl>
        <label className="pvs-champ">
          <span className="pvs-libelle">Date d’état des lieux de sortie prévue</span>
          <input type="date" value={edl} min={l.recuLe} max={ajouterMois(l.dateMax, EDL_MOIS_APRES_FIN)} disabled={!edlDisponible}
            onChange={(e) => { setEdl(e.target.value); setRefusEdl(null); }} data-date-edl />
        </label>
        {!edlDisponible && <p className="loc-muet">La mise à jour de la base (migration 384) reste à appliquer.</p>}
        {edlDisponible && !verdict.ok && <p className="cp-refus" role="status" data-message-edl>{verdict.motif}</p>}
        {refusEdl !== null && <p className="cp-refus" role="alert">{refusEdl}</p>}
        <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!edlDisponible || envoiEdl || !verdict.ok || edl === '' || edl === (l.etatDesLieuxLe ?? '')}
            onClick={() => { void enregistrerEdl(edl); }} data-enregistrer-edl>Enregistrer la date</button>
          {l.etatDesLieuxLe !== null && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoiEdl} onClick={() => { void enregistrerEdl(''); }} data-effacer-edl>Effacer la date</button>
          )}
        </div>
      </div>
      <div className="pva-bloc" data-bloc-sortie-officielle>
        <p className="pvs-libelle" style={{ margin: 0 }}>Date officielle de sortie</p>
        {!gestion ? <p className="sor-gestion-seule-texte" role="note" data-sortie-gestion-seule>{MESSAGE_SORTIE_GESTION}</p>
          : !sortie ? (
            <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setSortie(true)} data-valider-sortie>Valider la sortie</button>
            </div>
          ) : <SortieDuPreavis l={l} onAnnuler={() => setSortie(false)} onFait={sortieFaite} />}
      </div>
      <p className="pva-liens">
        {l.locataires.map((x) => (
          <a key={x.occupationId} href={`/admin/location/locataire/${x.locataireId}`} data-lien-fiche={x.locataireId}>
            Voir la fiche du locataire{l.locataires.length > 1 ? ` (${x.nom})` : ''}</a>
        ))}
        {premier !== undefined && <a href={`/admin/location/locataire/${premier.locataireId}?sortie=${l.occupationId}`} data-lien-ecran-sortie>Écran de sortie</a>}
      </p>
    </div>
  );
}

/** La confirmation réduite COMMUNE, sur le bail du préavis, avec ses locataires cochés (ceux du préavis). */
function SortieDuPreavis({ l, onAnnuler, onFait }: { l: LignePreavisAccueil; onAnnuler: () => void; onFait: (phrase: string, mail: string | null) => void }) {
  const lu = useLecture<BailLogement>(`bail=${l.occupationId}`);
  if (lu.etat.etat !== 'ok') return <EtatLecture etat={lu.etat} />;
  const bail = lu.etat.data;
  const choix = bail.locataires.filter((x) => l.occupationIds.includes(x.occupationId)).map((x) => x.occupationId);
  if (choix.length === 0) return <p className="loc-muet">Ces locataires ne sont plus en place : rechargez la page.</p>;
  return <ConfirmationSortie bail={bail} choix={choix} occupationId={choix[0]} onAnnuler={onAnnuler} onFait={onFait} />;
}

/**
 * Jetons du thème uniquement. 🔴 HAUTEUR CONSTANTE des lignes : deux lignes de texte (une chacune, tronquée proprement,
 * texte complet en infobulle et dans l'intitulé du bouton), une hauteur FIXE — au bureau comme au téléphone.
 */
export const CSS_PREAVIS_ACCUEIL = `
.pva{display:flex;flex-direction:column;gap:12px;min-width:0}
.pva-titre{margin:0;font-size:1.15rem;font-weight:800;display:flex;align-items:center;gap:8px}
.pva-tris{display:flex;flex-wrap:wrap;gap:10px 18px}
.pva-tri{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.pva-tri-libelle{font-size:.85rem;font-weight:700;color:var(--color-svv-muted)}
.pva-segment{min-height:44px;padding:8px 12px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.9rem;cursor:pointer}
.pva-segment[aria-pressed="true"]{background:var(--color-svv-ink);color:var(--color-svv-surface);border-color:var(--color-svv-ink);font-weight:700}
.pva-liste{list-style:none;margin:0;padding:0;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.pva-item + .pva-item{border-top:1px solid var(--color-svv-line)}
.pva-ligne{box-sizing:border-box;height:4.75rem;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 12px}
.pva-textes{display:flex;flex-direction:column;gap:2px;min-width:0}
.pva-noms,.pva-detail{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pva-noms{font-weight:800;color:var(--color-svv-ink)}
.pva-detail{font-size:.88rem;color:var(--color-svv-muted)}
.pva-ouvrir{min-height:44px}
.pva-depliee{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;padding:4px 12px 14px}
.pva-bloc{display:flex;flex-direction:column;gap:8px;min-width:0}
.pva-liens{grid-column:1 / -1;margin:0;display:flex;flex-wrap:wrap;gap:6px 18px}
.pva-liens a{display:inline-flex;align-items:center;min-height:44px;color:var(--color-svv-ink);font-weight:600;text-decoration:underline}
.sor-gestion-seule-texte{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink)}
@media (max-width:760px){
  .pva-ligne{height:6.25rem;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto}
  .pva-textes{grid-column:1 / -1}
  .pva-ligne .pvs-mention{justify-self:start}
  .pva-depliee{grid-template-columns:1fr}
}
`;
