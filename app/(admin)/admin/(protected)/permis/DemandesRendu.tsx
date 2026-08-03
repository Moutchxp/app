import type { CSSProperties, ReactNode } from 'react';

/**
 * Rendu PUR de la visibilité PRADA de l'onglet Demandes (chantier S14e) — aucun état, aucun effet → testable en Node via
 * `renderToStaticMarkup`. ⚠️ a11y : l'information est portée par du TEXTE (« PRADA » / « contact mairie »), la couleur n'est
 * qu'un appui. Aucune dépendance serveur ici.
 */

export interface ArbitrageAffiche {
  codeInsee: string; communeNom: string | null; pradaNom: string | null; pradaCourriel: string | null;
  contactCanal: string | null; contactEmail: string | null; contactAdressePostale: string | null;
}
export interface AmbiguiteAffiche {
  id: number; nomAdministration: string | null; departement: string | null; codePostalVille: string | null;
  courriel: string | null; adresse: string | null; prenom: string | null; nom: string | null; millesime: string;
}
export interface CommuneInjoignableAffiche { codeInsee: string; nom: string; departement: string }
export interface DepotAffiche { id: number; reference: string; communeNom: string | null; url: string | null; corps: string | null; nbDossiers: number; statut: string }

/** Retire une commune d'une liste par son code (retrait optimiste après enregistrement). Pur → testable. */
export function retirerCommune<T extends { codeInsee: string }>(liste: T[], code: string): T[] {
  return liste.filter((c) => c.codeInsee !== code);
}

const aide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.45, margin: '.3rem 0 0' };

/** Indication d'origine du destinataire par ligne : « PRADA — Nom » ou « contact mairie ». Texte d'abord, couleur en appui. */
export function OrigineDest({ origine, nom }: { origine?: string | null; nom?: string | null }) {
  const prada = origine === 'prada';
  const style: CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '.05rem .4rem', borderRadius: '.35rem', whiteSpace: 'nowrap',
    background: prada ? 'var(--color-svv-green-soft)' : 'var(--color-svv-field)',
    color: prada ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)',
  };
  return <span style={style}>{prada ? `PRADA${nom && nom.trim() !== '' ? ` — ${nom}` : ''}` : 'contact mairie'}</span>;
}

const detailContact = (a: ArbitrageAffiche): string =>
  [a.contactCanal, a.contactEmail, a.contactAdressePostale].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' · ');

/**
 * Encart d'ARBITRAGE (information seule, AUCUNE bascule) : communes où une PRADA au courriel connu existe mais le contact
 * a été confirmé à la main → rien n'a basculé (le travail humain prime). Groupe nommé pour lecteur d'écran.
 */
export function EncartArbitrages({ arbitrages }: { arbitrages: ArbitrageAffiche[] }) {
  if (arbitrages.length === 0) return null;
  return (
    <section role="group" aria-label="Arbitrages PRADA à rendre" className="svv-card" style={{ background: '#fff4e0', color: '#8a5a00' }}>
      <strong>{arbitrages.length} commune(s) : PRADA disponible, mais contact confirmé conservé</strong>
      <p style={aide}>
        Une PRADA au courriel connu existe pour ces communes, mais leur destinataire a été validé À LA MAIN (contact
        « confirmé ») : <strong>rien n’a basculé automatiquement</strong> — le travail humain prime. À arbitrer manuellement
        si vous souhaitez plutôt écrire à la PRADA.
      </p>
      <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem', fontSize: 13, lineHeight: 1.5 }}>
        {arbitrages.map((a) => (
          <li key={a.codeInsee}>
            <strong>{a.communeNom ?? a.codeInsee}</strong> — PRADA {a.pradaNom ?? '(nom non renseigné)'}
            {a.pradaCourriel ? ` · ${a.pradaCourriel}` : ''} — <em>retenu&nbsp;:</em> {detailContact(a) || '(contact incomplet)'}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Carte d'une ligne AMBIGUË (mobile-first : repli en carte, jamais un tableau qui déborde). Affiche les colonnes brutes ;
 * les contrôles interactifs (recherche de commune, boutons) sont fournis par le parent via `children`.
 */
/**
 * Carte d'une commune INJOIGNABLE (aucune adresse e-mail) — mobile-first (carte). Le département est affiché en TEXTE
 * (« dép. 92 »), jamais porté par la seule couleur. Le champ e-mail + le bouton d'enregistrement sont fournis en `children`.
 */
export function CarteInjoignable({ c, children }: { c: CommuneInjoignableAffiche; children?: ReactNode }) {
  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{c.nom}</strong>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '.05rem .4rem', borderRadius: '.35rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)' }}>dép. {c.departement}</span>
        <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>({c.codeInsee})</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Carte « à déposer à la main » (S16) : commune, URL de téléservice cliquable (nouvel onglet, rel noopener), nombre de
 * dossiers, et le TEXTE COMPLET de la demande (celui de genererTexte, figé en base) prêt à copier. Boutons fournis en
 * `children`. Mobile-first (carte, texte en zone scrollable).
 */
export function CarteDepot({ d, children }: { d: DepotAffiche; children?: ReactNode }) {
  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{d.communeNom ?? d.reference}</strong>
        <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{d.nbDossiers} dossier(s)</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-svv-mono, monospace)', color: 'var(--color-svv-muted)' }}>{d.reference}</span>
      </div>
      {d.url && d.url.trim() !== ''
        ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="svv-link" style={{ width: 'auto', fontSize: 13 }}>Ouvrir le téléservice ↗</a>
        : <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>URL de téléservice manquante — à compléter dans l’éditeur de contact (canal formulaire).</span>}
      <textarea readOnly value={d.corps ?? ''} rows={10} aria-label={`Texte de la demande pour ${d.communeNom ?? d.reference}`}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
      {children}
    </div>
  );
}

export function CarteAmbiguite({ a, children }: { a: AmbiguiteAffiche; children?: ReactNode }) {
  const lignes: [string, string | null][] = [
    ['Département', a.departement],
    ['Code postal / ville', a.codePostalVille],
    ['Courriel', (a.courriel ?? '').trim() === '' ? '(vide)' : a.courriel],
    ['Adresse', a.adresse],
    ['PRADA', [a.prenom, a.nom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ') || null],
    ['Millésime', a.millesime],
  ];
  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <strong style={{ fontSize: 14 }}>{a.nomAdministration ?? '(sans nom d’administration)'}</strong>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '.15rem .6rem', fontSize: 12 }}>
        {lignes.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt style={{ color: 'var(--color-svv-muted)' }}>{k}</dt>
            <dd style={{ margin: 0, wordBreak: 'break-word' }}>{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
