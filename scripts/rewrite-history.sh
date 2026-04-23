#!/bin/bash
set -e

# Run from current state where HEAD is one big commit on top of 053bede.
# This splits it into logical commits.

echo "⚠️  This will rewrite history and force-push to origin/main."
printf "Type 'yes' to continue: "
read -r confirm
[ "$confirm" = "yes" ] || { echo "Aborted."; exit 0; }

BACKUP="backup/pre-split-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP"
echo "✓ Backup branch created: $BACKUP"

# Mixed reset: HEAD goes back to 053bede, all changes become unstaged working tree modifications
git reset HEAD~1
echo "✓ Mixed reset done. All changes unstaged."
echo ""

# ── 1. Layer 1 modernization ──────────────────────────────────────────────
git add \
  package.json \
  yarn.lock \
  src/package.json \
  tsconfig.json \
  .eslintrc.js \
  .github/workflows/publish-macos.yml \
  .github/workflows/publish-windows.yml \
  .github/workflows/publish-linux.yml \
  .github/workflows/test.yml \
  scripts/release.sh \
  src/types/nodejs-fs-utils.d.ts \
  src/main.dev.js \
  src/hooks/usePlayerControls.ts

git commit -m "Layer 1: Electron 34, TypeScript 5, navigator.mediaSession, CI/CD

- Upgrade Electron 13 → 34, TypeScript 4 → 5
- Replace MPRIS (Linux) and SMTC (Windows) with navigator.mediaSession API
- Remove native node modules (mpris-service, @nodert-win10-au)
- Upgrade ESLint to @typescript-eslint v8
- Add tag-triggered CI builds and release script
- Add mediaSession seek handlers (seekbackward, seekforward, seekto)"
echo "✓ Commit 1: Layer 1"

# ── 2. Cache fixes ────────────────────────────────────────────────────────
git add \
  src/components/shared/cacheImage.ts \
  src/components/shared/cacheSong.ts \
  src/components/settings/ConfigPanels/CacheConfig.tsx \
  src/redux/miscSlice.ts \
  src/components/viewtypes/TableCells/CoverArtCell.tsx \
  src/components/viewtypes/ListViewTable.tsx \
  src/components/library/FolderList.tsx \
  src/components/dashboard/Dashboard.tsx \
  src/components/card/Card.tsx \
  src/components/layout/GenericPageHeader.tsx

git commit -m "Fix image and song caching

- Replace image-downloader with direct HTTPS using rejectUnauthorized agent
  (fixes TLS certificate errors on Windows/macOS with local servers)
- Fix caching in list view: add missing afterLoad callback for artists/folders
- Fix Dashboard cache type (music → album) for Recently Played/Most Played
- Fix folder cacheIdProperty bug (albumId → id)
- Create cache directories on startup to prevent ENOENT on fresh installs
- Fix MB counter after partial cache clear"
echo "✓ Commit 2: Cache fixes"

# ── 3. Synced lyrics ──────────────────────────────────────────────────────
git add \
  src/hooks/useGetLyrics.ts \
  src/components/player/LyricsModal.tsx \
  src/api/api.ts \
  src/api/controller.ts

git commit -m "Add synced lyrics support"
echo "✓ Commit 3: Synced lyrics"

# ── 4. Quality of life ────────────────────────────────────────────────────
git add \
  src/components/settings/ConfigPanels/PlaybackConfig.tsx \
  src/redux/playQueueSlice.ts

git commit -m "Quality of life improvements

- Better defaults: volume 100%, gapless playback, no shuffle/repeat, retain window size
- Fix shuffle default: parse string 'false' correctly (Boolean('false') === true bug)
- Volume fade: disabled by default, greyed out when crossfade duration is 0
- Repeat-one: show '1' badge overlay on repeat button"
echo "✓ Commit 4: Quality of life"

# ── 5. Graphic EQ ─────────────────────────────────────────────────────────
git add \
  src/redux/eqSlice.ts \
  src/components/settings/ConfigPanels/EQConfig.tsx \
  src/components/shared/setDefaultSettings.ts \
  src/components/player/Player.tsx \
  src/components/player/PlayerBar.tsx \
  src/components/settings/Config.tsx \
  src/redux/store.ts

git commit -m "Add 10-band graphic equalizer

- 10 bands at fixed frequencies (32Hz–16kHz), ±12dB per band, 0.5dB steps
- 9 built-in presets (Flat, Bass Boost, Treble Boost, Rock, Pop, Jazz, etc.)
- Custom preset save/load/delete with overwrite confirmation
- All controls disabled when EQ is off
- Web Audio chain: audio element → BiquadFilters → MediaStreamDestination → hidden audio
- Persisted to electron-store via useEffect hooks (avoids stale closure bugs)"
echo "✓ Commit 5: Graphic EQ"

# ── 6. Anything remaining ─────────────────────────────────────────────────
git add -A
if ! git diff --cached --quiet; then
  echo ""
  echo "Remaining files:"
  git diff --cached --name-only
  git commit -m "Miscellaneous fixes"
  echo "✓ Commit 6: Miscellaneous"
else
  echo "✓ No remaining changes"
fi

echo ""
echo "─────────────────────────────────────"
echo "New history:"
git log --oneline HEAD~10..HEAD
echo "─────────────────────────────────────"
echo ""
echo "To push:  git push --force"
echo "To undo:  git reset --hard $BACKUP"
