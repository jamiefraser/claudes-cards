/**
 * CreditsPage — /credits
 *
 * Lists all sound assets from SPEC.md §10 Sound Asset Catalogue.
 * Required for CC BY 3.0 attribution and best practice for all CC0 assets.
 *
 * NOTE FOR UNIT 8 (Frontend):
 *   Wire this into App.tsx routing:
 *     import { CreditsPage } from './pages/CreditsPage';
 *     // Add to your router:
 *     <Route path="/credits" element={<CreditsPage />} />
 *   Also add a link in the footer: <Link to="/credits">Credits</Link>
 */

import React from 'react';

interface SoundCredit {
  file: string;
  description: string;
  source: string;
  creator: string;
  url: string | null;
  license: string;
  requiresAttribution: boolean;
}

// Sound asset catalogue — matches SPEC.md §10.1 exactly
const SOUND_CREDITS: SoundCredit[] = [
  {
    file: 'card-deal.mp3',
    description: 'Single card dealt to a position',
    source: 'Freesound',
    creator: 'Cultureshock007',
    url: 'https://freesound.org/s/719539/',
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'card-flip.mp3',
    description: 'Card flipped face-up',
    source: 'Freesound',
    creator: 'f4ngy',
    url: 'https://freesound.org/s/240776/',
    license: 'CC BY 3.0',
    requiresAttribution: true,
  },
  {
    file: 'card-discard.mp3',
    description: 'Card placed on discard pile',
    source: 'Freesound',
    creator: 'Cultureshock007',
    url: 'https://freesound.org/s/719539/',
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'card-draw.mp3',
    description: 'Card drawn from draw pile',
    source: 'Freesound',
    creator: 'Cultureshock007',
    url: 'https://freesound.org/s/719539/',
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'card-shuffle.mp3',
    description: 'Deck shuffle at round start',
    source: 'Freesound',
    creator: 'diammati',
    url: 'https://freesound.org/s/534981/',
    license: 'CC BY 3.0',
    requiresAttribution: true,
  },
  {
    file: 'phase-complete.mp3',
    description: 'Phase laid down (Phase 10)',
    source: 'Generated',
    creator: 'Synthesised tone',
    url: null,
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'round-win.mp3',
    description: 'Round won',
    source: 'Freesound',
    creator: 'Audeption',
    url: 'https://freesound.org/s/564920/',
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'game-win.mp3',
    description: 'Game won (full victory)',
    source: 'Freesound',
    creator: 'Audeption',
    url: 'https://freesound.org/s/564920/',
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'game-lose.mp3',
    description: 'Game lost',
    source: 'Freesound',
    creator: 'jhillam',
    url: 'https://freesound.org/s/431894/',
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'skip-played.mp3',
    description: 'Skip card played',
    source: 'Generated',
    creator: 'Synthesised swoosh tone',
    url: null,
    license: 'CC0',
    requiresAttribution: false,
  },
  {
    file: 'notification.mp3',
    description: 'DM / friend request / spectator alert',
    source: 'Pixabay',
    creator: 'Royalty-free',
    url: 'https://pixabay.com/sound-effects/',
    license: 'Royalty-free',
    requiresAttribution: false,
  },
  {
    file: 'peg-move.mp3',
    description: 'Cribbage peg advancing on board',
    source: 'Generated',
    creator: 'Synthesised click tone',
    url: null,
    license: 'CC0',
    requiresAttribution: false,
  },
];

export function CreditsPage(): React.ReactElement {
  const attributionRequired = SOUND_CREDITS.filter((c) => c.requiresAttribution);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Credits</h1>
      <p className="text-gray-600 mb-8">
        Sound assets used in this platform. We thank all creators for their
        contributions. CC BY assets are clearly marked.
      </p>

      {/* Attribution required callout */}
      {attributionRequired.length > 0 && (
        <section aria-labelledby="attribution-required-heading" className="mb-8 p-4 border-l-4 border-yellow-400 bg-yellow-50">
          <h2 id="attribution-required-heading" className="text-lg font-semibold text-yellow-800 mb-2">
            Attribution Required (CC BY 3.0)
          </h2>
          <p className="text-yellow-700 text-sm mb-3">
            The following assets are licensed under Creative Commons Attribution 3.0.
            Attribution is legally required when distributing or publicly performing this work.
          </p>
          <ul className="space-y-1">
            {attributionRequired.map((credit) => (
              <li key={credit.file} className="text-sm text-yellow-800">
                <strong>{credit.file}</strong> by{' '}
                {credit.url ? (
                  <a
                    href={credit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-yellow-600"
                    aria-label={`${credit.creator} on ${credit.source} (opens in new tab)`}
                  >
                    {credit.creator}
                  </a>
                ) : (
                  credit.creator
                )}{' '}
                &mdash; {credit.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Full catalogue */}
      <section aria-labelledby="sound-catalogue-heading">
        <h2 id="sound-catalogue-heading" className="text-2xl font-semibold mb-4">
          Sound Asset Catalogue
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" aria-label="Sound asset credits">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th scope="col" className="px-4 py-3 font-semibold border-b border-gray-200">
                  File
                </th>
                <th scope="col" className="px-4 py-3 font-semibold border-b border-gray-200">
                  Description
                </th>
                <th scope="col" className="px-4 py-3 font-semibold border-b border-gray-200">
                  Creator
                </th>
                <th scope="col" className="px-4 py-3 font-semibold border-b border-gray-200">
                  License
                </th>
              </tr>
            </thead>
            <tbody>
              {SOUND_CREDITS.map((credit, index) => (
                <tr
                  key={credit.file}
                  className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-4 py-3 border-b border-gray-100 font-mono text-xs whitespace-nowrap">
                    {credit.file}
                  </td>
                  <td className="px-4 py-3 border-b border-gray-100">
                    {credit.description}
                  </td>
                  <td className="px-4 py-3 border-b border-gray-100">
                    {credit.url ? (
                      <a
                        href={credit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                        aria-label={`${credit.creator} on ${credit.source} (opens in new tab)`}
                      >
                        {credit.creator}
                      </a>
                    ) : (
                      <span className="text-gray-500">{credit.creator}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 border-b border-gray-100">
                    {credit.requiresAttribution ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800"
                        aria-label={`${credit.license} — attribution required`}
                      >
                        {credit.license}
                        <span aria-hidden="true" title="Attribution required">*</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        {credit.license}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          * CC BY 3.0 requires attribution when distributing or publicly performing the work.
          See{' '}
          <a
            href="https://creativecommons.org/licenses/by/3.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            aria-label="Creative Commons Attribution 3.0 license (opens in new tab)"
          >
            creativecommons.org/licenses/by/3.0
          </a>{' '}
          for full terms.
        </p>
      </section>
    </main>
  );
}
