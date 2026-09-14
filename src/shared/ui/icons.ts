import { createElement } from 'react';
import {
  Bell,
  CalendarDays,
  Captions,
  Circle,
  CircleHelp,
  CirclePlay,
  Clock3,
  Contrast,
  Download,
  Film,
  Folder,
  Gauge,
  Grid3X3,
  HardDrive,
  Heart,
  History,
  Home,
  Import,
  Keyboard,
  ListVideo,
  Maximize,
  Minimize,
  Moon,
  Music2,
  Palette,
  Pause,
  Play,
  RadioTower,
  Ratio,
  Rows3,
  Search,
  Server,
  Settings,
  SkipForward,
  Sparkles,
  Star,
  Sun,
  Terminal,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';

/**
 * Stable semantic aliases for the application's icon vocabulary.
 *
 * These names intentionally preserve the existing call sites while removing
 * the incompatible Remix Icon dependency. All implementations come from
 * lucide-react (ISC). Line/fill aliases share geometry; active state remains
 * conveyed by the surrounding selected surface and accessible state.
 */
export type RemixiconComponentType = LucideIcon;

export const RiAspectRatioFill = Ratio;
export const RiAspectRatioLine = Ratio;
export const RiCalendarScheduleFill = CalendarDays;
export const RiCalendarScheduleLine = CalendarDays;
export const RiClosedCaptioningFill = Captions;
export const RiClosedCaptioningLine = Captions;
export const RiContrastFill = Contrast;
export const RiContrastLine = Contrast;
export const RiDownload2Fill = Download;
export const RiDownload2Line = Download;
export const RiEqualizer3Fill = Gauge;
export const RiEqualizer3Line = Gauge;
export const RiFolderFill = Folder;
export const RiFolderLine = Folder;
export const RiFullscreenExitFill = Minimize;
export const RiFullscreenLine = Maximize;
export const RiHardDrive2Fill = HardDrive;
export const RiHardDrive2Line = HardDrive;
export const RiHeartFill = Heart;
export const RiHeartLine = Heart;
export const RiHistoryFill = History;
export const RiHistoryLine = History;
export const RiHome5Fill = Home;
export const RiHome5Line = Home;
export const RiHomeLine = Home;
export const RiImportFill = Import;
export const RiImportLine = Import;
export const RiKeyboardFill = Keyboard;
export const RiKeyboardLine = Keyboard;
export const RiLayoutGridFill = Grid3X3;
export const RiLayoutGridLine = Grid3X3;
export const RiLayoutRowFill = Rows3;
export const RiLayoutRowLine = Rows3;
export const RiLiveLine = RadioTower;
export const RiMovie2Fill = Film;
export const RiMovie2Line = Film;
export const RiMusic2Fill = Music2;
export const RiMusic2Line = Music2;
export const RiMoonFill = Moon;
export const RiMoonLine = Moon;
export const RiNotification3Fill = Bell;
export const RiNotification3Line = Bell;
export const RiPaletteFill = Palette;
export const RiPaletteLine = Palette;
export const RiPauseFill = Pause;
export const RiPlayCircleFill = CirclePlay;
export const RiPlayCircleLine = CirclePlay;
export const RiPlayFill = Play;
export const RiPlayList2Fill = ListVideo;
export const RiPlayList2Line = ListVideo;
export const RiQuestionFill = CircleHelp;
export const RiQuestionLine = CircleHelp;
export const RiRecordCircleFill = Circle;
export const RiRecordCircleLine = Circle;
export const RiSearchFill = Search;
export const RiSearchLine = Search;
export const RiServerFill = Server;
export const RiServerLine = Server;
export const RiSettings3Fill = Settings;
export const RiSettings3Line = Settings;
export const RiSkipForwardFill = SkipForward;
export const RiSlideshow3Fill = Tv;
export const RiSlideshow3Line = Tv;
export const RiSparklingFill = Sparkles;
export const RiSparklingLine = Sparkles;
export const RiSpeedUpFill = Gauge;
export const RiSpeedUpLine = Gauge;
export const RiStarFill = Star;
export const RiStarLine = Star;
export const RiSunFill = Sun;
export const RiSunLine = Sun;
export const RiTerminalBoxFill = Terminal;
export const RiTerminalBoxLine = Terminal;
export const RiTimeFill = Clock3;
export const RiTimeLine = Clock3;
export const RiTv2Fill = Tv;
export const RiTv2Line = Tv;
export const RiVolumeDownLine = Volume1;
export const RiVolumeMuteFill = VolumeX;
export const RiVolumeUpLine = Volume2;

export function DiscordIcon({
  size = 15,
  className,
}: {
  size?: number | string;
  className?: string;
}) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      className,
      'aria-hidden': 'true',
    },
    createElement('path', {
      d: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z',
    }),
  );
}

export function GithubIcon({
  size = 15,
  className,
}: {
  size?: number | string;
  className?: string;
}) {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      className,
      'aria-hidden': 'true',
    },
    createElement('path', {
      d: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z',
    }),
  );
}
