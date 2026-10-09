#!/usr/bin/env bash
# Syncs repository agent-profiles/ to ~/.hermes/profiles/
set -euo pipefail

HERMES_PROFILES_DIR="${HOME}/.hermes/profiles"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_PROFILES_DIR="${REPO_DIR}/agent-profiles"

if [ ! -d "${AGENT_PROFILES_DIR}" ]; then
  echo "Error: agent-profiles directory not found at ${AGENT_PROFILES_DIR}" >&2
  exit 1
fi

echo "Syncing agent profiles from ${AGENT_PROFILES_DIR} to ${HERMES_PROFILES_DIR}..."

for role_dir in "${AGENT_PROFILES_DIR}"/*; do
  if [ -d "${role_dir}" ]; then
    role="$(basename "${role_dir}")"
    target_dir="${HERMES_PROFILES_DIR}/${role}"
    mkdir -p "${target_dir}"
    
    if [ -f "${role_dir}/SOUL.md" ]; then
      cp "${role_dir}/SOUL.md" "${target_dir}/SOUL.md"
    fi
    if [ -f "${role_dir}/profile.yaml" ]; then
      cp "${role_dir}/profile.yaml" "${target_dir}/config.yaml"
    fi
    echo "  ✓ Synced profile: ${role}"
  fi
done

echo "Successfully synced all agent profiles."
