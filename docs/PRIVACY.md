# Privacy

Last updated: 26 August 2026

Movena is a local desktop application. The Movena project does not operate an
account service, analytics service, advertising service, telemetry endpoint, or
media proxy, and does not receive your provider credentials, playlists, viewing
history, searches, recordings, or downloads.

## Data stored on your device

Movena stores preferences, source descriptions, library state, searches, and
cached metadata locally. The active download queue is session-only; completed
media remains wherever you chose to save it. Passwords, access tokens, and the
optional TMDB API key are stored through the operating-system credential vault.
Portable settings exports intentionally exclude credentials, source and guide
URLs, library data, and caches.

## Network connections

Your device connects directly to sources you configure and may fetch metadata
or artwork directly from those sources. When enabled, it also connects directly
to TMDB, TVmaze, and IntroDB. Automatic update checks are enabled by default and request
release metadata from GitHub; they can be disabled in Settings > General, and an
update is downloaded only after confirmation. These independent services
receive the information normally included in an Internet request, such as your
IP address, requested title or resource, and user agent, and process it under
their own privacy terms.

Movena accepts legacy HTTP source addresses when they are configured. HTTP is
not encrypted and can expose credentials, requested media, and viewing
activity to network observers. Prefer HTTPS wherever the source supports it.

## Deleting data

Settings > About > Delete All App Data removes Movena-owned preferences,
sources and credentials, history, favorites, collections, searches, the active
download queue, and application caches. It does not remove original playlist files selected by the user or completed
recordings/downloads stored outside Movena's application data. Those files must
be deleted with the operating system.

Uninstalling the application may not remove completed media files or every
operating-system credential-vault record. Use Delete All App Data first when
possible.

## Project website and Git hosting

GitHub and any project website are separate services with their own logs and
privacy terms. This policy describes the desktop application only. Any future
project-operated telemetry, crash reporting, accounts, or hosted service must
be opt-in where required and documented here before release.
