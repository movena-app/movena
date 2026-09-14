# Distribution materials

This folder contains submission-ready copy and manifests for channels beyond
GitHub Releases. External directory approval and account-owned publishing are
not automated.

| Channel         | Material                                                     | Current status                                                                                         |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Microsoft Store | [`microsoft-store-listing.md`](microsoft-store-listing.md)   | Listing copy ready; build/upload requires Windows SDK and Partner Center.                              |
| WinGet          | [`../../distribution/winget`](../../distribution/winget)     | v0.1.8 manifest prepared; run `winget validate` before a PR.                                           |
| Homebrew        | [`../../distribution/homebrew`](../../distribution/homebrew) | Cask draft; macOS currently requires Homebrew `libmpv`, so clean-machine validation is still required. |
| Flathub         | [`../../distribution/flathub`](../../distribution/flathub)   | Metadata/build checklist; Flatpak source build must be validated before submission.                    |
| AUR             | [`../../distribution/aur`](../../distribution/aur)           | PKGBUILD draft; test in a clean Arch environment before publishing.                                    |

Do not describe any channel as approved, signed, notarized, or certified until
the corresponding service has accepted the submission and the exact artifact
has been verified.
