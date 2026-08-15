# Skills for agents

This folder is for **agent skill / plugin layout**, not library usage samples.

| Path | Purpose |
|------|--------|
| [`claude-skill/`](./claude-skill/README.md) | **Claude Code** plugin template: `SKILL.md`, `plugin.json`, and `references/`. Copy this tree when authoring a new skill. |

Library copy-paste examples live in [`examples/`](../examples/README.md).

## Where the real pieces live

- **Published Claude plugin** (separate repo): [openfetch-js/openFetchSkill — README](https://github.com/openfetch-js/openFetchSkill/blob/main/README.md) — contains `skills/openfetch/SKILL.md` for agents.
- **Library source & package** (this repo): **root** — [`package.json`](../package.json), [`src/`](../src), [`README.md`](../README.md).

The template under `claude-skill/` is **not** wired into [`.claude-plugin/marketplace.json`](https://github.com/openfetch-js/OpenFetch/blob/main/.claude-plugin/marketplace.json); only `openfetchskill` in this monorepo is.
