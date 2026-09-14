interface ShortcutItem {
  keys: string[];
  desc: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

/**
 * The app-wide shortcut catalogue used by both Settings and the in-player
 * shortcut helper. Keep the key names here aligned with the actual handlers.
 */
export function getShortcutGroups(seekJumpSecs: number): ShortcutGroup[] {
  return [
    {
      title: 'Global Navigation',
      items: [
        { keys: ['Ctrl', '1'], desc: 'Go to Home' },
        { keys: ['Ctrl', '2'], desc: 'Go to Live TV' },
        { keys: ['Ctrl', '3'], desc: 'Go to TV Guide (EPG)' },
        { keys: ['Ctrl', '4'], desc: 'Go to Movies' },
        { keys: ['Ctrl', '5'], desc: 'Go to Series' },
        { keys: ['Ctrl', 'K'], desc: 'Go to Search' },
        { keys: ['Ctrl', '\\'], desc: 'Toggle Sidebar Collapse' },
        { keys: ['?'], desc: 'Show / Hide Keyboard Shortcuts' },
      ],
    },
    {
      title: 'Player Controls',
      items: [
        { keys: ['Space / K'], desc: 'Play / Pause' },
        { keys: ['F'], desc: 'Toggle Fullscreen' },
        { keys: ['M'], desc: 'Toggle Mute' },
        { keys: ['←'], desc: `Seek Backward (${seekJumpSecs}s, VOD)` },
        { keys: ['→'], desc: `Seek Forward (${seekJumpSecs}s, VOD)` },
        { keys: ['↑'], desc: 'Volume Up (+5%)' },
        { keys: ['↓'], desc: 'Volume Down (-5%)' },
        { keys: ['Esc'], desc: 'Dismiss overlays / Close Player' },
      ],
    },
    {
      title: 'Live TV Channel Navigation',
      items: [
        { keys: ['↑ / ↓'], desc: 'Switch channels in the channel drawer' },
        { keys: ['0–9'], desc: 'Enter a channel number in the channel drawer' },
      ],
    },
  ];
}
