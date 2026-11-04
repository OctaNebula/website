#!/usr/bin/env bash
# octanebula.dev push-to-deploy (replaces the old GitHub Pages workflow).
# Runs under pm2 as 'website-deploy' on octanebula-vps, as user octanebula.
#
# Every INTERVAL seconds: fetch main from GitHub. On a new commit, build it
# into releases/<sha>, flip the 'current' symlink, restart the 'website' pm2
# app, and roll back to the previous release if it doesn't answer.
#
#   deploy.sh          loop forever (what pm2 runs)
#   deploy.sh --once   one pass, then exit
#
# The running copy is /var/www/octanebula.dev/deploy.sh. The source of truth
# is deploy/deploy.sh in the repo: when a deploy changes it, the new copy is
# installed and this exits so pm2 restarts on the new version.
set -uo pipefail

ROOT=/var/www/octanebula.dev
REPO=https://github.com/OctaNebula/website.git
ECOSYSTEM=$HOME/ecosystem.config.cjs
PORT=4530
INTERVAL=60
KEEP=3

cd "$ROOT" || exit 1
log() { echo "[deploy] $*"; }

healthy() {
  local _
  for _ in $(seq 20); do
    sleep 1
    curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:$PORT/" && return 0
  done
  return 1
}

restart_site() {
  pm2 startOrRestart "$ECOSYSTEM" --only website >/dev/null
}

switch_to() {
  ln -sfn "$1" current.new && mv -T current.new current
}

prune() {
  local live keep=0 d
  live=$(readlink current)
  for d in $(ls -1td releases/*/ 2>/dev/null); do
    d=${d%/}
    if [ "$d" = "$live" ] || [ $keep -lt $KEEP ]; then keep=$((keep + 1)); continue; fi
    rm -rf "$d"
  done
}

deploy_once() {
  local sha rel prev
  [ -d repo.git ] || git clone -q --bare "$REPO" repo.git || { log "clone failed"; return 1; }
  git -C repo.git fetch -q origin +refs/heads/main:refs/heads/main || { log "fetch failed"; return 1; }
  sha=$(git -C repo.git rev-parse main) || return 1
  [ "$sha" = "$(cat deployed 2>/dev/null)" ] && return 0
  [ "$sha" = "$(cat failed 2>/dev/null)" ] && return 0   # don't rebuild a known-bad commit every minute

  log "building ${sha:0:7}: $(git -C repo.git log -1 --format=%s "$sha")"
  rel=releases/$sha
  rm -rf "$rel.tmp" && mkdir -p "$rel.tmp"
  if ! { git -C repo.git archive "$sha" | tar -x -C "$rel.tmp" \
         && (cd "$rel.tmp" && npm ci --no-audit --no-fund --prefer-offline --loglevel=error && npm run build --silent); }; then
    log "build failed for ${sha:0:7}"
    echo "$sha" > failed
    rm -rf "$rel.tmp"
    return 1
  fi
  rm -rf "$rel" && mv "$rel.tmp" "$rel"

  prev=$(readlink current 2>/dev/null || true)
  switch_to "$rel"
  restart_site
  if ! healthy; then
    log "${sha:0:7} didn't come up, rolling back to ${prev:-nothing}"
    echo "$sha" > failed
    if [ -n "$prev" ]; then switch_to "$prev"; restart_site; fi
    return 1
  fi
  echo "$sha" > deployed
  rm -f failed
  log "live: ${sha:0:7}"
  prune

  if [ -f "$rel/deploy/deploy.sh" ] && ! cmp -s "$rel/deploy/deploy.sh" "$ROOT/deploy.sh"; then
    install -m 755 "$rel/deploy/deploy.sh" "$ROOT/deploy.sh.new" && mv deploy.sh.new deploy.sh
    log "deploy.sh changed, restarting on the new copy"
    exit 0
  fi
}

if [ "${1:-}" = "--once" ]; then deploy_once; exit; fi
while :; do
  deploy_once
  sleep "$INTERVAL"
done
