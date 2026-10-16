import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { modeRecette } from '../../../../lib/recette/mode';
import { lireBoite, type EntreeBoite } from '../../../../lib/recette/boite';
import { verrouRecettePose } from '../../../../lib/recette/installer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Boîte de test (recette) — Sans Vis-à-Vis®' };

const LIBELLE: Record<EntreeBoite['canal'], string> = {
  smtp: 'Mail (SMTP)',
  gmail_envoi: 'Mail (Gmail de gestion@)',
  gmail_ecriture: 'Boîte Gmail (libellé, lu/non lu, corbeille…)',
  agenda: 'Agenda Google',
  drive: 'Drive',
  google_lot: 'Lot Google',
};
const ISSUE: Record<EntreeBoite['issue'], string> = {
  intercepte: 'intercepté, rien n’est parti',
  simule: 'non effectué (réponse simulée)',
  refuse: 'refusé (lecture seule)',
};

/**
 * BOÎTE DE TEST du mode recette (lot RECETTE-MAC) : ce qui AURAIT eu un effet réel, et n'en a pas eu. N'existe QU'EN
 * recette (sinon 404). Réservée aux administrateurs (proxy : chemin non déclaré → administrateurs seulement) et à une
 * session valide (coquille protégée). Lecture des fichiers `.recette/boite/` ; aucune écriture.
 */
export default async function PageRecette({ searchParams }: { searchParams: Promise<{ essai?: string }> }) {
  if (!modeRecette()) notFound();
  const entrees = lireBoite();
  const { essai } = await searchParams;
  const resultats = (essai ?? '').split(',').filter(Boolean).map((r) => r.split(':') as [string, string]);
  const verrou = verrouRecettePose();
  return (
    <main style={{ padding: '1.5rem 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>Boîte de test — recette</h1>
      <p style={{ color: 'var(--color-svv-muted)', marginTop: '.4rem' }}>
        Ce que le site aurait envoyé ou écrit pour de vrai, et qui a été retenu sur le Mac. Les {entrees.length} plus récents en tête.
      </p>
      <p id="etat-verrou" style={{ marginTop: '.6rem', fontWeight: 700, color: verrou ? 'var(--color-svv-ink)' : 'var(--color-svv-red)' }}>
        Verrou réseau (Gmail, Agenda, Drive) : {verrou ? 'posé' : 'ABSENT — arrêtez le serveur et relancez « npm run recette »'}
      </p>
      <form action="/api/admin/recette/essai" method="post" style={{ marginTop: '.6rem' }}>
        <button type="submit" className="svv-btn svv-btn-outline" style={{ width: 'auto', padding: '.5rem 1rem' }}>Tester le verrou (sans risque)</button>
      </form>
      {resultats.length > 0 && (
        <p id="resultat-essai" style={{ marginTop: '.5rem', fontWeight: 700, color: resultats.every(([, v]) => v === 'retenu') ? 'var(--color-svv-ink)' : 'var(--color-svv-red)' }}>
          Essai : {resultats.map(([k, v]) => `${k} ${v === 'retenu' ? 'retenu ✓' : 'NON RETENU ✗'}`).join(' · ')}
        </p>
      )}
      {entrees.length === 0 ? (
        <p style={{ marginTop: '1.5rem' }}>Rien pour l’instant.</p>
      ) : (
        <ul style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '.6rem', listStyle: 'none', padding: 0 }}>
          {entrees.map((e, i) => (
            <li key={`${e.quand}-${i}`} style={{ border: '1px solid var(--color-svv-line)', borderRadius: 10, padding: '.75rem', background: 'var(--color-svv-field)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '.5rem', fontSize: '.85rem' }}>
                <strong>{LIBELLE[e.canal] ?? e.canal}</strong>
                <span style={{ color: 'var(--color-svv-muted)' }}>{new Date(e.quand).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · {ISSUE[e.issue] ?? e.issue}</span>
              </div>
              {e.a && <div style={{ marginTop: '.3rem', wordBreak: 'break-word' }}>À : {e.a}</div>}
              {e.objet && <div style={{ wordBreak: 'break-word' }}>Objet : {e.objet}</div>}
              {e.pieces && e.pieces.length > 0 && <div style={{ fontSize: '.85rem' }}>Pièces : {e.pieces.join(', ')}</div>}
              {e.requete && <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', wordBreak: 'break-all' }}>{e.requete}</div>}
              {e.apercu && (
                <pre style={{ marginTop: '.4rem', whiteSpace: 'pre-wrap', fontSize: '.8rem', maxHeight: 200, overflow: 'auto' }}>{e.apercu}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
