import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';
import { type M3uEntry, type M3uPlaylist } from '@/modules/sources/data/m3uClient';
import { detailQueryKeys } from '@/modules/catalog/data/useDetails';
import {
  getCombinedSourceQueryScope,
  getM3uQueryScope,
  getUrlQueryScope,
  getXtreamQueryScope,
  queryKeys,
} from '@/modules/sources/model/queryKeys';
import type { UpcomingRelease } from '@/modules/guide/data/useUpcomingReleases';
import type { XtreamSeriesInfoResponse, XtreamVodInfo } from '@/modules/sources/data/xtreamClient';
import { desktopApi } from '@/platform/desktop';
import { tauriApi } from '@/platform/tauri';
import type { EpgProgramme } from '@/modules/guide/data/useEpg';
import type { XmltvGuide } from '@/modules/guide/data/xmltvClient';
import { Sidebar } from '@/app/shell/Sidebar';
import { WindowChrome } from '@/app/shell/WindowChrome';
import { PageTransition } from '@/app/shell/PageTransition';
import { MovieDetailsDialog } from '@/modules/catalog/details/MovieDetailsDialog';
import { SeriesDetailsDialog } from '@/modules/catalog/details/SeriesDetailsDialog';
import { M3uEditor } from '@/modules/m3u-editor/components/M3uEditor';
import { PlayerShell } from '@/modules/playback/components/PlayerShell';
import { DownloadsPage } from '@/modules/downloads/pages/DownloadsPage';
import { CollectionsPage } from '@/modules/library/pages/CollectionsPage';
import { ContinueWatchingPage } from '@/modules/library/pages/ContinueWatchingPage';
import { EpgPage } from '@/modules/guide/pages/EpgPage';
import { HomePage } from '@/modules/catalog/pages/HomePage';
import { FavoritesPage } from '@/modules/library/pages/FavoritesPage';
import { LiveTvPage } from '@/modules/catalog/pages/LiveTVPage';
import { MoviesPage } from '@/modules/catalog/pages/MoviesPage';
import { SearchPage } from '@/modules/search/pages/SearchPage';
import { SeriesPage } from '@/modules/catalog/pages/SeriesPage';
import { SettingsPage } from '@/modules/settings/pages/SettingsPage';
import { UpcomingPage } from '@/modules/guide/pages/UpcomingPage';
import { useDownloadStore } from '@/modules/downloads/store/useDownloadStore';
import {
  useAuthStore,
  type XtreamSourceProfile,
} from '@/modules/sources/public/store/useAuthStore';
import type { XtreamCredentials } from '@/modules/sources/public/model/xtream';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useSourceStore, type M3uSourceProfile } from '@/modules/sources/store/useSourceStore';
import type { DownloadJob } from '@/modules/downloads/lib/downloads';
import {
  resolveSettingsSectionId,
  type SettingsSectionId,
} from '@/modules/settings/lib/settingsNavigation';
import appStyles from '@/app/shell/AppLayout.module.css';
import type { ReadmeSurface } from '../readmeSurfaces';
import { NotFoundPage } from '@/app/router/AppRoutes';

const SOURCE_ID = 'm3u-readme-fixture';
const XTREAM_SOURCE_ID = 'xtream-readme-fixture';
const GUIDE_URL = 'https://guide.example.test/movena.xml';

// Local data-URI artwork keeps visual QA independent of network availability.
const TMDB_ARTWORK = {
  dunePartTwo: {
    poster: artwork(0),
    backdrop: artwork(0, true),
  },
  parasite: {
    poster: artwork(1),
    backdrop: artwork(1, true),
  },
  spiritedAway: {
    poster: artwork(2),
    backdrop: artwork(2, true),
  },
  theMatrix: {
    poster: artwork(3),
    backdrop: artwork(3, true),
  },
  arrival: {
    poster: artwork(4),
    backdrop: artwork(4, true),
  },
  grandBudapestHotel: {
    poster: artwork(5),
    backdrop: artwork(5, true),
  },
  madMaxFuryRoad: {
    poster: artwork(6),
    backdrop: artwork(6, true),
  },
  theGodfather: {
    poster: artwork(7),
    backdrop: artwork(7, true),
  },
  severance: {
    poster: artwork(8),
    backdrop: artwork(8, true),
  },
  theBear: {
    poster: artwork(9),
    backdrop: artwork(9, true),
  },
  dark: {
    poster: artwork(10),
    backdrop: artwork(10, true),
  },
  arcane: {
    poster: artwork(11),
    backdrop: artwork(11, true),
  },
  shogun: {
    poster: artwork(12),
    backdrop: artwork(12, true),
  },
} as const;

const CHANNEL_LOGOS = {
  bbcNews: artwork(13, true),
  cnnInternational: artwork(14, true),
  arte: artwork(15, true),
  nationalGeographic: artwork(16, true),
  eurosport: artwork(17, true),
  mtv: artwork(18, true),
  cartoonNetwork: artwork(19, true),
  deutscheWelle: artwork(20, true),
} as const;

const XTREAM_CREDENTIALS: XtreamCredentials = {
  sourceId: XTREAM_SOURCE_ID,
  url: 'https://provider.example.test',
  username: 'readme-demo',
  password: 'readme-demo',
};

const XTREAM_PROFILE: XtreamSourceProfile = {
  id: XTREAM_SOURCE_ID,
  kind: 'xtream',
  name: 'Showcase Library',
  locationLabel: 'provider.example.test',
  username: 'readme-demo',
  userInfo: {
    username: 'readme-demo',
    message: '',
    auth: 1,
    status: 'Active',
    exp_date: '',
    is_trial: '0',
    active_cons: '0',
    created_at: '',
    max_connections: '1',
    allowed_output_formats: ['m3u8'],
  },
  serverInfo: {
    url: 'provider.example.test',
    port: '443',
    https_port: '443',
    server_protocol: 'https',
    rtmp_port: '',
    timestamp_now: Math.floor(Date.now() / 1000),
    time_now: new Date().toISOString(),
    timezone: 'UTC',
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const DUNE_DETAILS: XtreamVodInfo = {
  info: {
    movie_image: TMDB_ARTWORK.dunePartTwo.poster,
    backdrop_path: [TMDB_ARTWORK.dunePartTwo.backdrop],
    name: 'Dune: Part Two',
    description:
      'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
    plot: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
    genre: 'Science Fiction, Adventure',
    releaseDate: '2024-02-27',
    director: 'Denis Villeneuve',
    cast: 'Timothee Chalamet, Zendaya, Rebecca Ferguson, Javier Bardem, Josh Brolin, Austin Butler, Florence Pugh, Dave Bautista',
    rating: '8.1',
    duration: '2h 47m',
    youtube_trailer: '',
  },
  movie_data: {
    stream_id: '693134',
    name: 'Dune: Part Two',
    added: '2024-03-01',
    container_extension: 'mp4',
    direct_stream_url: 'https://media.example.test/vod/dune-part-two.mp4',
    source_id: XTREAM_SOURCE_ID,
  },
};

function severanceEpisode(
  season: number,
  number: number,
  title: string,
  runtimeMinutes: number,
  _imagePath: string,
  plot: string,
): XtreamSeriesInfoResponse['episodes'][string][number] {
  return {
    id: `severance-s${season}e${number}`,
    episode_num: number,
    title,
    season,
    container_extension: 'mp4',
    direct_source: `https://media.example.test/series/severance/s${season}e${number}.mp4`,
    source_id: XTREAM_SOURCE_ID,
    info: {
      duration_secs: runtimeMinutes * 60,
      duration: `${Math.floor(runtimeMinutes / 60)
        .toString()
        .padStart(2, '0')}:${(runtimeMinutes % 60).toString().padStart(2, '0')}:00`,
      movie_image: artwork(season * 10 + number, true),
      plot,
    },
  };
}

const SEVERANCE_DETAILS: XtreamSeriesInfoResponse = {
  seasons: [
    {
      id: 1,
      name: 'Season 1',
      season_number: 1,
      episode_count: 9,
      cover: TMDB_ARTWORK.severance.poster,
    },
    {
      id: 2,
      name: 'Season 2',
      season_number: 2,
      episode_count: 10,
      cover: TMDB_ARTWORK.severance.poster,
    },
  ],
  info: {
    name: 'Severance',
    cover: TMDB_ARTWORK.severance.poster,
    backdrop_path: [TMDB_ARTWORK.severance.backdrop],
    plot: 'At Lumon Industries, employees in the severance programme have their work memories surgically separated from their personal lives. Mark Scout begins to question the system after a former colleague appears outside the office.',
    cast: 'Adam Scott, Britt Lower, Zach Cherry, Tramell Tillman, Jen Tullock, Dichen Lachman, Michael Chernus, John Turturro, Christopher Walken, Patricia Arquette',
    director: 'Ben Stiller, Aoife McArdle',
    genre: 'Mystery, Drama, Sci-Fi & Fantasy',
    releaseDate: '2022-02-17',
    rating: '8.4',
  },
  episodes: {
    '1': [
      severanceEpisode(
        1,
        1,
        'Good News About Hell',
        59,
        'sP3GZe9j7BY3CAyZGFuZxxnGpN1.jpg',
        'Mark is promoted to lead a team whose work and personal memories have been surgically separated.',
      ),
      severanceEpisode(
        1,
        2,
        'Half Loop',
        57,
        'wIQP0P2tyE7VRIN3xR8Efq7UgKt.jpg',
        'The team trains Helly in macrodata refinement while Mark meets a mysterious former colleague.',
      ),
      severanceEpisode(
        1,
        3,
        'In Perpetuity',
        60,
        'hMpY4wpHlwMf42aDM25bU9fau5f.jpg',
        'Helly continues to resist Lumon as a deteriorating Petey tells Mark more about the company.',
      ),
      severanceEpisode(
        1,
        4,
        'The You You Are',
        50,
        'dzQJeDznS0I4spAqTImiLH9p252.jpg',
        'Irving discovers a forbidden book, Helly demands contact with her Outie, and Mark attends a funeral.',
      ),
      severanceEpisode(
        1,
        5,
        'The Grim Barbarity of Optics and Design',
        47,
        'oy4BZotFbNX5YoPkWuWF3kcdMVw.jpg',
        'Irving and Dylan confront Burt while Mark and Helly discover another department.',
      ),
      severanceEpisode(
        1,
        6,
        'Hide and Seek',
        44,
        '3fQp0pUtgDkqqyEbXY8KKCZPMU7.jpg',
        'The refiners form an alliance that puts them in direct conflict with Cobel.',
      ),
      severanceEpisode(
        1,
        7,
        'Defiant Jazz',
        53,
        'gHoKlbC2esqq3SXm0ZCcl3bzpFZ.jpg',
        'Cobel introduces new security measures as Mark and the team push back.',
      ),
      severanceEpisode(
        1,
        8,
        "What's for Dinner?",
        50,
        '8Gv9ELume0jo7gz7R2h4tPmVLsD.jpg',
        'The team prepares its plan while Mark attends a party hosted by Devon and Ricken.',
      ),
      severanceEpisode(
        1,
        9,
        'The We We Are',
        44,
        'dzx8D2B0ELncXuCNwtPCags43Q.jpg',
        'The refiners use the overtime contingency and uncover troubling truths about their outside lives.',
      ),
    ],
    '2': [
      severanceEpisode(
        2,
        1,
        'Hello, Ms. Cobel',
        54,
        'a97vNY8Knu45FLQib0uQZ2VReLy.jpg',
        'Mark returns to the severed floor under changed circumstances as outside secrets surface.',
      ),
      severanceEpisode(
        2,
        2,
        'Goodbye, Mrs. Selvig',
        49,
        'wjlSkqMoLngSO6fv2Ajt2CIeCSi.jpg',
        'Mark considers the meaning of a message while Lumon works to regain control.',
      ),
      severanceEpisode(
        2,
        3,
        'Who Is Alive?',
        57,
        'j4AUAq1XJOBmfXsLphZzsCz6pZs.jpg',
        'Mark, Helly, Irving, and Dylan search for answers about the people they care about.',
      ),
      severanceEpisode(
        2,
        4,
        "Woe's Hollow",
        54,
        'mioOOhTaShLd1MPKsmfirbe9AwI.jpg',
        'The team leaves the severed floor for an unsettling outdoor retreat.',
      ),
      severanceEpisode(
        2,
        5,
        "Trojan's Horse",
        50,
        'csATq6CUnvyMY26cTKy3YmlmOyK.jpg',
        'Tensions rise across the team after a painful loss changes their relationships.',
      ),
      severanceEpisode(
        2,
        6,
        'Attila',
        52,
        '4J8HXT1FIjnLJiNt6xwR0TnmLcX.jpg',
        'Personal bonds are tested as Mark continues searching for the truth.',
      ),
      severanceEpisode(
        2,
        7,
        'Chikhai Bardo',
        53,
        'dmzBzYcEtjOYJO46p7kyRmYrHZu.jpg',
        'Mark confronts memories of Gemma as past love collides with a present threat.',
      ),
      severanceEpisode(
        2,
        8,
        'Sweet Vitriol',
        41,
        'piWjCKARsSkmr9kMKHZ5ynengj3.jpg',
        'Harmony Cobel returns home and makes discoveries about Lumon and her own past.',
      ),
      severanceEpisode(
        2,
        9,
        'The After Hours',
        48,
        '2RJaWjY4dD5s7jpdo2aGeSLmtI3.jpg',
        'Mark and Devon join an ally while Helly continues her investigation inside Lumon.',
      ),
      severanceEpisode(
        2,
        10,
        'Cold Harbor',
        80,
        'gXUvGwpZxrpqMRouxM7yI28lgNa.jpg',
        'Mark forms a fragile alliance for a final attempt as the refiners make a dangerous stand.',
      ),
    ],
  },
};

function installPlayerFixtureStubs() {
  desktopApi.isDesktop = () => false;
  desktopApi.onPointerMoved = async () => () => undefined;
  tauriApi.mpvStart = async () => undefined;
  tauriApi.mpvStop = async () => undefined;
  tauriApi.mpvPlayPause = async () => undefined;
  tauriApi.mpvSeek = async () => undefined;
  tauriApi.mpvSeekRelative = async () => undefined;
  tauriApi.mpvSetVolume = async () => undefined;
  tauriApi.mpvSetSpeed = async () => undefined;
  tauriApi.mpvSetAudioTrack = async () => undefined;
  tauriApi.mpvSetSubTrack = async () => undefined;
  tauriApi.mpvSetRecording = async () => undefined;
  tauriApi.mpvSetProperty = async () => undefined;
  tauriApi.playerSetFullscreen = async (on) => on;
  tauriApi.playerSetCursorHidden = async (hidden) => hidden;
}

function artwork(seed: number, wide = false): string {
  const palettes = [
    ['#19263d', '#5978a6', '#d7c6a1'],
    ['#291f35', '#7b5a8f', '#dfb586'],
    ['#153133', '#4e8984', '#d2d39b'],
    ['#33251f', '#a2644f', '#e2c69d'],
    ['#202d25', '#648262', '#d7c1a5'],
    ['#24243a', '#5e6aa0', '#bea8d5'],
  ];
  const [background, accent, highlight] = palettes[seed % palettes.length]!;
  const width = wide ? 480 : 300;
  const height = wide ? 270 : 450;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${background}"/><stop offset="1" stop-color="${accent}"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#g)"/>
      <circle cx="${width * 0.72}" cy="${height * 0.24}" r="${height * 0.12}" fill="${highlight}" opacity=".82"/>
      <path d="M0 ${height * 0.72} L${width * 0.28} ${height * 0.42} L${width * 0.5} ${height * 0.68} L${width * 0.76} ${height * 0.34} L${width} ${height * 0.58} V${height} H0Z" fill="${background}" opacity=".78"/>
      <path d="M0 ${height * 0.86} Q${width * 0.38} ${height * 0.65} ${width} ${height * 0.82} V${height} H0Z" fill="#0d1118" opacity=".62"/>
      <g fill="none" stroke="${highlight}" opacity=".28">
        <path d="M${width * 0.08} ${height * 0.12} H${width * 0.48}"/>
        <path d="M${width * 0.12} ${height * 0.17} H${width * 0.38}"/>
      </g>
    </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const now = Date.now();

function entry(
  id: string,
  title: string,
  type: M3uEntry['type'],
  groupTitle: string,
  seed: number,
  extras: Partial<M3uEntry> = {},
): M3uEntry {
  return {
    id,
    sourceId: SOURCE_ID,
    title,
    url: `https://media.example.test/${type}/${id}.${type === 'live' ? 'm3u8' : 'mp4'}`,
    type,
    duration: type === 'live' ? -1 : 6_900,
    groupTitle,
    categoryId: `${type}-${groupTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    logo: artwork(seed, type === 'live'),
    headers: {},
    ...extras,
  };
}

const MOVIES: M3uEntry[] = [
  entry('movie-dune-part-two', 'Dune: Part Two', 'vod', 'Science Fiction', 0, {
    logo: TMDB_ARTWORK.dunePartTwo.poster,
    duration: 10_020,
    year: '2024',
    rating: 8.1,
    description:
      'Paul Atreides joins Chani and the Fremen while seeking revenge against those who destroyed his family.',
  }),
  entry('movie-parasite', 'Parasite', 'vod', 'Thriller', 1, {
    logo: TMDB_ARTWORK.parasite.poster,
    duration: 7_920,
    year: '2019',
    rating: 8.5,
    description:
      'A cash-strapped family gradually enters the household of a wealthy family, with unexpected consequences.',
  }),
  entry('movie-spirited-away', 'Spirited Away', 'vod', 'Animation', 2, {
    logo: TMDB_ARTWORK.spiritedAway.poster,
    duration: 7_500,
    year: '2001',
    rating: 8.5,
    description:
      'Chihiro enters a spirit world and must find a way to rescue her transformed parents.',
  }),
  entry('movie-the-matrix', 'The Matrix', 'vod', 'Science Fiction', 3, {
    logo: TMDB_ARTWORK.theMatrix.poster,
    duration: 8_160,
    year: '1999',
    rating: 8.3,
    description:
      'A computer hacker discovers that the world he knows is a simulated reality and joins a rebellion against its controllers.',
  }),
  entry('movie-arrival', 'Arrival', 'vod', 'Science Fiction', 4, {
    logo: TMDB_ARTWORK.arrival.poster,
    duration: 6_960,
    year: '2016',
    rating: 7.6,
    description:
      'A linguist is recruited to communicate with visitors after mysterious spacecraft appear around the world.',
  }),
  entry('movie-grand-budapest', 'The Grand Budapest Hotel', 'vod', 'Comedy', 5, {
    logo: TMDB_ARTWORK.grandBudapestHotel.poster,
    duration: 6_000,
    year: '2014',
    rating: 8.0,
    description:
      'A hotel concierge and his lobby-boy protege become entangled in a dispute over a valuable painting.',
  }),
  entry('movie-mad-max-fury-road', 'Mad Max: Fury Road', 'vod', 'Action', 2, {
    logo: TMDB_ARTWORK.madMaxFuryRoad.poster,
    duration: 7_200,
    year: '2015',
    rating: 7.6,
    description:
      'Max joins Furiosa and a band of rebels fleeing a tyrant across a ruined wasteland.',
  }),
  entry('movie-the-godfather', 'The Godfather', 'vod', 'Crime', 0, {
    logo: TMDB_ARTWORK.theGodfather.poster,
    duration: 10_500,
    year: '1972',
    rating: 8.7,
    description:
      'The aging head of a crime family transfers control of his empire to his reluctant son.',
  }),
];

const SERIES: M3uEntry[] = [
  entry(
    'series-severance-s1e1',
    'Severance S01E01 - Good News About Hell',
    'series',
    'Drama Series',
    5,
    {
      logo: TMDB_ARTWORK.severance.poster,
      duration: 3_420,
      rating: 8.4,
      year: '2022',
      description:
        'Mark leads a team whose work memories have been surgically separated from their personal lives.',
      episode: {
        seriesTitle: 'Severance',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'Good News About Hell',
      },
    },
  ),
  entry('series-severance-s1e2', 'Severance S01E02 - Half Loop', 'series', 'Drama Series', 0, {
    logo: TMDB_ARTWORK.severance.poster,
    duration: 3_180,
    rating: 8.4,
    year: '2022',
    description:
      'The severed floor welcomes a new employee while Mark navigates a life split in two.',
    episode: {
      seriesTitle: 'Severance',
      seasonNumber: 1,
      episodeNumber: 2,
      episodeTitle: 'Half Loop',
    },
  }),
  entry('series-severance-s1e3', 'Severance S01E03 - In Perpetuity', 'series', 'Drama Series', 2, {
    logo: TMDB_ARTWORK.severance.poster,
    duration: 3_360,
    rating: 8.4,
    year: '2022',
    description: 'A visit to Lumon history raises more questions about the severance programme.',
    episode: {
      seriesTitle: 'Severance',
      seasonNumber: 1,
      episodeNumber: 3,
      episodeTitle: 'In Perpetuity',
    },
  }),
  entry(
    'series-severance-s2e1',
    'Severance S02E01 - Hello, Ms. Cobel',
    'series',
    'Drama Series',
    4,
    {
      logo: TMDB_ARTWORK.severance.poster,
      duration: 2_880,
      rating: 8.4,
      year: '2025',
      description: 'Mark returns to the severed floor after the overtime contingency.',
      episode: {
        seriesTitle: 'Severance',
        seasonNumber: 2,
        episodeNumber: 1,
        episodeTitle: 'Hello, Ms. Cobel',
      },
    },
  ),
  entry('series-the-bear-s1e1', 'The Bear S01E01 - System', 'series', 'Comedy Drama', 3, {
    logo: TMDB_ARTWORK.theBear.poster,
    duration: 1_620,
    rating: 8.1,
    year: '2022',
    episode: { seriesTitle: 'The Bear', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'System' },
  }),
  entry('series-dark-s1e1', 'Dark S01E01 - Secrets', 'series', 'Mystery Series', 4, {
    logo: TMDB_ARTWORK.dark.poster,
    duration: 3_120,
    rating: 8.4,
    year: '2017',
    episode: { seriesTitle: 'Dark', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'Secrets' },
  }),
  entry(
    'series-arcane-s1e1',
    'Arcane S01E01 - Welcome to the Playground',
    'series',
    'Animation',
    1,
    {
      logo: TMDB_ARTWORK.arcane.poster,
      duration: 2_580,
      rating: 8.8,
      year: '2021',
      episode: {
        seriesTitle: 'Arcane',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'Welcome to the Playground',
      },
    },
  ),
  entry('series-shogun-s1e1', 'Shōgun S01E01 - Anjin', 'series', 'Historical Drama', 2, {
    logo: TMDB_ARTWORK.shogun.poster,
    duration: 4_200,
    rating: 8.4,
    year: '2024',
    episode: { seriesTitle: 'Shōgun', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'Anjin' },
  }),
];

const LIVE: M3uEntry[] = [
  entry('live-bbc-news', 'BBC News', 'live', 'News', 0, {
    logo: CHANNEL_LOGOS.bbcNews,
    tvgId: 'bbc.news',
    channelNumber: '101',
    catchup: 'append',
    catchupDays: 7,
  }),
  entry('live-cnn-international', 'CNN International', 'live', 'News', 1, {
    logo: CHANNEL_LOGOS.cnnInternational,
    tvgId: 'cnn.international',
    channelNumber: '102',
    catchup: 'append',
    catchupDays: 3,
  }),
  entry('live-arte', 'ARTE', 'live', 'Culture', 2, {
    logo: CHANNEL_LOGOS.arte,
    tvgId: 'arte',
    channelNumber: '110',
  }),
  entry('live-national-geographic', 'National Geographic', 'live', 'Documentary', 3, {
    logo: CHANNEL_LOGOS.nationalGeographic,
    tvgId: 'national.geographic',
    channelNumber: '120',
  }),
  entry('live-eurosport', 'Eurosport', 'live', 'Sports', 4, {
    logo: CHANNEL_LOGOS.eurosport,
    tvgId: 'eurosport',
    channelNumber: '130',
  }),
  entry('live-mtv', 'MTV', 'live', 'Music', 5, {
    logo: CHANNEL_LOGOS.mtv,
    tvgId: 'mtv',
    channelNumber: '140',
  }),
  entry('live-cartoon-network', 'Cartoon Network', 'live', 'Family', 0, {
    logo: CHANNEL_LOGOS.cartoonNetwork,
    tvgId: 'cartoon.network',
    channelNumber: '150',
  }),
  entry('live-deutsche-welle', 'DW', 'live', 'News', 2, {
    logo: CHANNEL_LOGOS.deutscheWelle,
    tvgId: 'dw',
    channelNumber: '160',
  }),
];

const PLAYLIST: M3uPlaylist = {
  name: 'Demo Library',
  epgUrls: [GUIDE_URL],
  warnings: [],
  entries: [...MOVIES, ...SERIES, ...LIVE],
};

const PROFILE: M3uSourceProfile = {
  id: SOURCE_ID,
  kind: 'm3u',
  name: 'Demo Library',
  locationType: 'remote',
  locationLabel: 'playlist.example.test',
  refreshIntervalMinutes: 360,
  lastRefreshAt: now - 8 * 60_000,
  entryCount: PLAYLIST.entries.length,
  liveCount: LIVE.length,
  vodCount: MOVIES.length,
  seriesCount: SERIES.length,
  hasEpg: true,
};

function programme(
  id: string,
  title: string,
  startMinutes: number,
  durationMinutes = 60,
): EpgProgramme {
  const anchor = new Date(now);
  anchor.setMinutes(0, 0, 0);
  const start = anchor.getTime() + startMinutes * 60_000;
  return {
    id,
    title,
    description: `Example XMLTV listing for ${title}.`,
    start,
    end: start + durationMinutes * 60_000,
  };
}

function guide(): XmltvGuide {
  const byChannel = new Map<string, EpgProgramme[]>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  const schedules = [
    ['bbc.news', ['BBC News', 'Business Today', 'The Context', 'Newsday']],
    [
      'cnn.international',
      ['CNN Newsroom', 'Connect the World', 'The Lead', 'Quest Means Business'],
    ],
    ['arte', ['ARTE Journal', 'Tracks', '28 Minutes', 'Metropolis']],
    [
      'national.geographic',
      ['Air Crash Investigation', 'Europe From Above', 'Drain the Oceans', 'Wicked Tuna'],
    ],
    ['eurosport', ['Eurosport News', 'Cycling', 'Tennis', 'Snooker']],
    ['mtv', ['MTV Hits', 'Ridiculousness', 'Catfish', 'The Challenge']],
    [
      'cartoon.network',
      ['Teen Titans Go!', 'The Amazing World of Gumball', 'We Bare Bears', 'Adventure Time'],
    ],
    ['dw', ['DW News', 'Global Us', 'Focus on Europe', 'The Day']],
  ] as const;
  let count = 0;
  for (const [channelId, titles] of schedules) {
    const scopedId = `${SOURCE_ID}::${channelId}`;
    byChannel.set(
      scopedId,
      titles.map((title, index) => {
        count += 1;
        return programme(`${channelId}-${index}`, title, (index - 1) * 60);
      }),
    );
    idByName.set(
      `${SOURCE_ID}::${LIVE.find((item) => item.tvgId === channelId)!.title.toLowerCase()}`,
      scopedId,
    );
    nameById.set(scopedId, LIVE.find((item) => item.tvgId === channelId)!.title);
  }
  return { byChannel, idByName, nameById, channelCount: schedules.length, programmeCount: count };
}

const DOWNLOADS: DownloadJob[] = [
  {
    id: 'download-dune',
    sourceUrl: 'https://media.example.test/vod/movie-dune-part-two.mp4',
    fileName: 'Dune Part Two.mp4',
    state: 'downloading',
    progress: 0.68,
    downloadedBytes: 2_720_000_000,
    totalBytes: 4_000_000_000,
    attempts: 1,
    maxAttempts: 3,
    createdAt: now - 900_000,
    updatedAt: now,
  },
  {
    id: 'download-parasite',
    sourceUrl: 'https://media.example.test/vod/movie-parasite.mp4',
    fileName: 'Parasite.mp4',
    state: 'paused',
    progress: 0.34,
    downloadedBytes: 1_020_000_000,
    totalBytes: 3_000_000_000,
    attempts: 1,
    maxAttempts: 3,
    createdAt: now - 1_800_000,
    updatedAt: now - 120_000,
  },
  {
    id: 'download-spirited-away',
    sourceUrl: 'https://media.example.test/vod/movie-spirited-away.mp4',
    fileName: 'Spirited Away.mp4',
    state: 'queued',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 3_400_000_000,
    attempts: 0,
    maxAttempts: 3,
    createdAt: now - 600_000,
    updatedAt: now - 300_000,
  },
  {
    id: 'download-matrix',
    sourceUrl: 'https://media.example.test/vod/movie-the-matrix.mp4',
    filePath: 'C:\\Movena\\The Matrix.mp4',
    fileName: 'The Matrix.mp4',
    state: 'completed',
    progress: 1,
    downloadedBytes: 2_800_000_000,
    totalBytes: 2_800_000_000,
    attempts: 1,
    maxAttempts: 3,
    createdAt: now - 7_200_000,
    updatedAt: now - 3_600_000,
  },
];

function seedFixture(queryClient: QueryClient, surface: ReadmeSurface) {
  installPlayerFixtureStubs();
  useSettingsStore.setState({
    sidebarCollapsed: false,
    showCollapsedSidebarBadges: true,
    onboardingDismissed: true,
    motionPreference: 'reduced',
    accentColor: '#78aef8',
    upcomingEnabled: surface === 'upcoming',
    upcomingHomeEnabled: surface === 'upcoming',
    upcomingCalendarEnabled: true,
    upcomingCountdownEnabled: true,
    upcomingHistoryDays: 7,
    tmdbEnabled: surface === 'upcoming',
    tmdbApiKey: surface === 'upcoming' ? 'fixture-key' : '',
    epgSource: 'provider',
    epgXmltvUrl: '',
    skipIntroEnabled: true,
    skipRecapEnabled: true,
    autoPlayNextEpisode: true,
    streamFoldingEnabled: true,
  });
  useSourceStore.setState({
    profiles: [PROFILE],
    enabledSourceIds: [SOURCE_ID],
    isInitializing: false,
    initializationError: null,
    runtimes: {
      [SOURCE_ID]: {
        connection: {
          location: 'https://playlist.example.test/demo.m3u',
          epgUrl: GUIDE_URL,
          headers: {},
        },
        playlist: PLAYLIST,
        baseUrl: 'https://media.example.test/',
        status: 'ready',
        error: null,
        revision: 1,
      },
    },
  });
  useAuthStore.setState({
    profiles: [XTREAM_PROFILE],
    runtimes: {
      [XTREAM_SOURCE_ID]: {
        credentials: XTREAM_CREDENTIALS,
        status: 'ready',
        error: null,
        revision: 1,
      },
    },
    isInitializing: false,
    initializationError: null,
  });
  const favoriteDune = {
    id: 'movie-dune-part-two',
    sourceId: SOURCE_ID,
    sourceItemId: 'movie-dune-part-two',
    title: 'Dune: Part Two',
    type: 'vod' as const,
    posterUrl: TMDB_ARTWORK.dunePartTwo.poster,
    year: '2024',
    rating: 8.1,
  };
  const favoriteArrival = {
    id: 'movie-arrival',
    sourceId: SOURCE_ID,
    sourceItemId: 'movie-arrival',
    title: 'Arrival',
    type: 'vod' as const,
    posterUrl: TMDB_ARTWORK.arrival.poster,
    year: '2016',
    rating: 7.6,
  };
  const favoriteSeverance = {
    id: 'series-severance',
    sourceId: XTREAM_SOURCE_ID,
    sourceItemId: 'severance-s1e1',
    title: 'Severance',
    type: 'series' as const,
    posterUrl: TMDB_ARTWORK.severance.poster,
    year: '2022',
    rating: 8.4,
  };
  const favoriteTheBear = {
    id: 'series-the-bear',
    sourceId: XTREAM_SOURCE_ID,
    sourceItemId: 'the-bear-s1e1',
    title: 'The Bear',
    type: 'series' as const,
    posterUrl: TMDB_ARTWORK.theBear.poster,
    year: '2022',
    rating: 8.1,
  };
  const mockFavorites = [favoriteDune, favoriteArrival, favoriteSeverance, favoriteTheBear];

  useLibraryStore.setState({
    favorites: mockFavorites,
    collections: [{ id: 'weekend', name: 'Weekend picks', items: [] }],
    history: [
      {
        id: 'movie-parasite',
        sourceId: SOURCE_ID,
        sourceItemId: 'movie-parasite',
        title: 'Parasite',
        type: 'vod',
        posterUrl: TMDB_ARTWORK.parasite.poster,
        year: '2019',
        rating: 8.5,
        progressPercentage: 46,
        currentTime: 3_643,
        duration: 7_920,
        lastWatchedAt: now - 900_000,
      },
      {
        id: 'series-severance',
        sourceId: XTREAM_SOURCE_ID,
        sourceItemId: 'severance-s1e1',
        title: 'Severance',
        type: 'series',
        posterUrl: TMDB_ARTWORK.severance.poster,
        progressPercentage: 23,
        currentTime: 814,
        duration: 3_540,
        lastWatchedAt: now - 7_200_000,
        seriesId: 'series-severance',
        seriesSourceItemId: '95396',
        seasonNum: 1,
        episodeNum: 1,
        episodeId: 'severance-s1e1',
        episodeTitle: 'Good News About Hell',
      },
    ],
    watched: [],
  });
  useDownloadStore.setState({ jobs: DOWNLOADS });
  usePlayerStore.setState({ activeStream: null, showControls: true, isFullscreen: false });

  const sourceScope = getCombinedSourceQueryScope([getM3uQueryScope(SOURCE_ID, 1)]);
  const descriptorScope = `${SOURCE_ID}:${getUrlQueryScope(GUIDE_URL)}`;
  queryClient.setQueryData(['xmltv_guides', sourceScope, descriptorScope], guide());
  const xtreamScope = getXtreamQueryScope(XTREAM_SOURCE_ID, XTREAM_CREDENTIALS);
  queryClient.setQueryData(detailQueryKeys.vod('693134', xtreamScope), DUNE_DETAILS);
  queryClient.setQueryData(detailQueryKeys.series('95396', xtreamScope), SEVERANCE_DETAILS);
  queryClient.setQueryData(
    detailQueryKeys.series('series-severance', xtreamScope),
    SEVERANCE_DETAILS,
  );
  queryClient.setQueryDefaults(['series_info'], {
    queryFn: async () => SEVERANCE_DETAILS,
    initialData: () => SEVERANCE_DETAILS,
  });
  queryClient.setQueryDefaults(['xc_series_info'], {
    queryFn: async () => SEVERANCE_DETAILS,
    initialData: () => SEVERANCE_DETAILS,
  });

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(d.getTime() + 86_400_000);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const in3Days = new Date(d.getTime() + 3 * 86_400_000);
  const in3DaysStr = `${in3Days.getFullYear()}-${String(in3Days.getMonth() + 1).padStart(2, '0')}-${String(in3Days.getDate()).padStart(2, '0')}`;
  const nextWeek = new Date(d.getTime() + 7 * 86_400_000);
  const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;

  const mockUpcomingList: UpcomingRelease[] = [
    {
      favorite: favoriteSeverance,
      tmdbId: 95396,
      airDate: todayStr,
      kind: 'episode',
      title: 'Severance',
      seasonNumber: 2,
      episodeNumber: 8,
      artworkUrl: TMDB_ARTWORK.severance.backdrop,
      exactAirTime: `${todayStr}T20:00:00Z`,
      timeSource: 'tvmaze',
    },
    {
      favorite: favoriteTheBear,
      tmdbId: 136315,
      airDate: tomorrowStr,
      kind: 'episode',
      title: 'The Bear',
      seasonNumber: 4,
      episodeNumber: 1,
      artworkUrl: TMDB_ARTWORK.theBear.backdrop,
      exactAirTime: `${tomorrowStr}T01:00:00Z`,
      timeSource: 'tvmaze',
    },
    {
      favorite: favoriteDune,
      tmdbId: 693134,
      airDate: in3DaysStr,
      kind: 'movie',
      title: 'Dune: Messiah',
      seasonNumber: null,
      episodeNumber: null,
      artworkUrl: TMDB_ARTWORK.dunePartTwo.backdrop,
      exactAirTime: null,
      timeSource: 'tmdb',
    },
    {
      favorite: favoriteArrival,
      tmdbId: 329865,
      airDate: nextWeekStr,
      kind: 'movie',
      title: 'Arrival: 4K Remaster',
      seasonNumber: null,
      episodeNumber: null,
      artworkUrl: TMDB_ARTWORK.arrival.backdrop,
      exactAirTime: null,
      timeSource: 'tmdb',
    },
  ];
  queryClient.setQueryDefaults(['tmdb_upcoming'], {
    queryFn: async () => mockUpcomingList,
    initialData: () => mockUpcomingList,
  });
  const scope =
    'movie-arrival:Arrival|movie-dune-part-two:Dune: Part Two|series-severance:Severance|series-the-bear:The Bear';
  queryClient.setQueryData(
    queryKeys.tmdbUpcoming(scope, 'en-US', false, 'w500', true, 7, todayStr),
    mockUpcomingList,
  );

  if (surface === 'player-vod') {
    usePlayerStore.getState().playStream({
      id: 'movie-dune-part-two',
      sourceId: SOURCE_ID,
      sourceItemId: 'movie-dune-part-two',
      title: 'Dune: Part Two',
      type: 'vod',
      streamUrl: 'https://media.example.test/vod/movie-dune-part-two.mp4',
      posterUrl: TMDB_ARTWORK.dunePartTwo.poster,
      knownDuration: 10_020,
      startPosition: 4_145,
      tags: ['4K', 'HDR', 'DOLBY ATMOS'],
    });
    usePlayerStore.setState({
      isPlaying: true,
      currentTime: 4_145,
      duration: 10_020,
      volume: 74,
      isMuted: false,
      playbackSpeed: 1,
      isBuffering: false,
      isVideoReady: true,
      showControls: true,
      audioTracks: [
        { id: 1, type: 'audio', title: 'English', lang: 'en', selected: true, codec: 'eac3' },
        { id: 2, type: 'audio', title: 'Deutsch', lang: 'de', codec: 'aac' },
      ],
      subtitleTracks: [
        { id: 3, type: 'sub', title: 'English', lang: 'en', selected: true },
        { id: 4, type: 'sub', title: 'Deutsch', lang: 'de' },
      ],
      currentAudioTrack: 1,
      currentSubTrack: 3,
      subtitlesVisible: true,
      chapters: [
        { title: 'Opening', time: 0 },
        { title: 'The Desert', time: 2_760 },
        { title: 'Final Act', time: 8_040 },
      ],
    });
  }

  if (surface === 'player-series') {
    usePlayerStore.getState().playStream({
      id: 'series-severance-s1e1',
      sourceId: XTREAM_SOURCE_ID,
      sourceItemId: 'severance-s1e1',
      title: 'Severance S01E01 - Good News About Hell',
      type: 'series',
      streamUrl: 'https://media.example.test/series/severance/s1e1.mp4',
      posterUrl: TMDB_ARTWORK.severance.poster,
      knownDuration: 3_540,
      startPosition: 140,
      tags: ['4K', 'HDR', 'DOLBY 5.1'],
      seriesId: 'series-severance',
      seriesSourceItemId: '95396',
      seriesTitle: 'Severance',
      seasonNum: 1,
      episodeNum: 1,
    });
    usePlayerStore.setState({
      isPlaying: true,
      currentTime: 140,
      duration: 3_540,
      volume: 78,
      isMuted: false,
      playbackSpeed: 1,
      isBuffering: false,
      isVideoReady: true,
      showControls: true,
      showEpisodesDrawer: true,
      audioTracks: [
        {
          id: 1,
          type: 'audio',
          title: 'English [Original]',
          lang: 'en',
          selected: true,
          codec: 'eac3',
        },
        { id: 2, type: 'audio', title: 'Deutsch', lang: 'de', codec: 'aac' },
      ],
      subtitleTracks: [
        { id: 3, type: 'sub', title: 'English [CC]', lang: 'en', selected: true },
        { id: 4, type: 'sub', title: 'Deutsch', lang: 'de' },
      ],
      currentAudioTrack: 1,
      currentSubTrack: 3,
      subtitlesVisible: true,
      chapters: [
        { title: 'Intro', time: 90 },
        { title: 'Lumon Floor', time: 240 },
        { title: 'Refinement', time: 1_200 },
      ],
    });
  }
}

function PlayerFixture({ surface }: { surface: ReadmeSurface }) {
  const background =
    surface === 'player-series'
      ? TMDB_ARTWORK.severance.backdrop
      : TMDB_ARTWORK.dunePartTwo.backdrop;
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#070a10',
          backgroundImage: `linear-gradient(rgba(5, 8, 13, .08), rgba(5, 8, 13, .2)), url("${background}")`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />
      <PlayerShell />
    </>
  );
}

function Surface({ surface }: { surface: ReadmeSurface }) {
  if (surface === 'hero' || surface === 'light-theme') return <HomePage />;
  if (surface === 'movies') return <MoviesPage />;
  if (surface === 'series') return <SeriesPage />;
  if (surface === 'continue-watching') return <ContinueWatchingPage />;
  if (surface === 'favorites') return <FavoritesPage />;
  if (surface === 'collections') return <CollectionsPage />;
  if (surface === 'not-found') return <NotFoundPage />;
  if (surface === 'live-tv') return <LiveTvPage />;
  if (surface === 'live-epg') return <EpgPage />;
  if (surface === 'upcoming') return <UpcomingPage />;
  if (surface === 'search') return <SearchPage />;
  if (surface === 'downloads')
    return (
      <PageTransition>
        <DownloadsPage />
      </PageTransition>
    );
  if (surface === 'settings' || surface === 'playback-settings') return <SettingsPage />;
  if (surface === 'm3u-editor')
    return <M3uEditor initialSourceId={SOURCE_ID} onClose={() => undefined} />;
  if (surface === 'm3u-raw-editor')
    return <M3uEditor initialSourceId={SOURCE_ID} initialMode="raw" onClose={() => undefined} />;
  if (surface === 'series-details') {
    return (
      <>
        <SeriesPage />
        <SeriesDetailsDialog
          seriesId="series-severance"
          sourceId={XTREAM_SOURCE_ID}
          sourceItemId="95396"
          seriesTitle="Severance"
          seriesPoster={TMDB_ARTWORK.severance.poster}
          initialSeasonNumber={1}
          initialEpisodeNumber={2}
          onClose={() => undefined}
        />
      </>
    );
  }
  return (
    <>
      <MoviesPage />
      <MovieDetailsDialog
        movieId="movie-dune-part-two"
        sourceId={XTREAM_SOURCE_ID}
        sourceItemId="693134"
        movieTitle="Dune: Part Two"
        moviePoster={TMDB_ARTWORK.dunePartTwo.poster}
        onClose={() => undefined}
      />
    </>
  );
}

const ROUTES: Record<ReadmeSurface, string> = {
  hero: '/',
  movies: '/movies',
  series: '/series',
  'continue-watching': '/continue',
  favorites: '/favorites',
  collections: '/collections',
  'not-found': '/does-not-exist',
  'live-tv': '/live',
  'live-epg': '/epg',
  'player-vod': '/movies',
  'player-series': '/series',
  'library-details': '/movies',
  'series-details': '/series',
  upcoming: '/upcoming',
  search: '/search?q=dune',
  'm3u-editor': `/m3u-editor/${SOURCE_ID}`,
  'm3u-raw-editor': `/m3u-editor/${SOURCE_ID}`,
  downloads: '/downloads',
  settings: '/settings?section=sources',
  'playback-settings': '/settings?section=playback',
  'light-theme': '/',
};

export function ReadmeHarness({
  surface,
  settingsSection,
}: {
  surface: ReadmeSurface;
  settingsSection?: string | null | undefined;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false },
    },
  });
  seedFixture(queryClient, surface);
  const isPlayerSurface = surface === 'player-vod' || surface === 'player-series';

  const resolvedSettingsSection: SettingsSectionId = resolveSettingsSectionId(
    settingsSection ?? null,
  );
  const initialRoute =
    surface === 'settings' ? `/settings?section=${resolvedSettingsSection}` : ROUTES[surface];
  const scenarioId = surface === 'settings' ? `settings-${resolvedSettingsSection}` : surface;

  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="always">
          <div className={appStyles.appContainer} data-ui-qa-scenario={scenarioId}>
            <div className={appStyles.windowDragArea} data-tauri-drag-region aria-hidden="true" />
            {isPlayerSurface ? (
              <PlayerFixture surface={surface} />
            ) : (
              <div className={appStyles.appUi}>
                <Sidebar />
                <main className={appStyles.mainContent}>
                  <div className={appStyles.pageContainer}>
                    <Surface surface={surface} />
                  </div>
                </main>
              </div>
            )}
            <WindowChrome />
          </div>
        </MotionConfig>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
