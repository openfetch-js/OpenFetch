# Claude skill plugin — structure reference

This tree is a **copy-paste template**. It mirrors the published plugin repo **[openfetch-js/openFetchSkill](https://github.com/openfetch-js/openFetchSkill)** (see its [README](https://github.com/openfetch-js/openFetchSkill/blob/main/README.md)), which is what [`.claude-plugin/marketplace.json`](https://github.com/openfetch-js/OpenFetch/blob/main/.claude-plugin/marketplace.json) points at from this monorepo.

**Package / API content** the skill should describe lives in **[openfetch-js/OpenFetch](https://github.com/openfetch-js/OpenFetch)** at the repo root: [`package.json`](https://github.com/openfetch-js/OpenFetch/blob/main/package.json), [`src/`](https://github.com/openfetch-js/OpenFetch/tree/main/src), [`README.md`](https://github.com/openfetch-js/OpenFetch/blob/main/README.md).

## Directory tree

```text
your-plugin/                    # production equivalent: openfetchskill/
├── .claude-plugin/
│   └── plugin.json             # required: name, description, version
├── skills/
│   └── your-skill-name/        # one folder per skill; name should match SKILL frontmatter
│       ├── SKILL.md            # required: YAML frontmatter + Markdown instructions
│       └── references/         # optional: extra .md the agent can open
│           └── notes.md
└── README.md                   # optional: human docs for the plugin
```

## SKILL.md frontmatter

```yaml
---
name: your-skill-name
description: One precise sentence: when the agent must load this skill (routing).
---
```

- **`name`:** Usually matches the folder under `skills/` (e.g. `openfetch`).
- **`description`:** Routing text for the model — be specific.

## plugin.json (minimal)

```json
{
  "name": "your-plugin-id",
  "description": "Short summary of what this plugin adds.",
  "version": "1.0.0",
  "author": { "name": "You" }
}
```

Path: **`your-plugin/.claude-plugin/plugin.json`**.

## marketplace.json entry

At repo root, **`.claude-plugin/marketplace.json`** lists plugins with a relative `source`:

```json
{
  "name": "your-marketplace-id",
  "owner": { "name": "Your Name" },
  "plugins": [
    {
      "name": "your-plugin-id",
      "source": "./your-plugin-folder",
      "description": "Catalog blurb"
    }
  ]
}
```

For this repo, the shipped plugin is **`./openfetchskill`** (not `./skills/claude-skill`).

## Files in this template

| Path | Role |
|------|------|
| [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json) | Dummy manifest — template only. |
| [`skills/sample-skill/SKILL.md`](./skills/sample-skill/SKILL.md) | Minimal `SKILL.md` to copy. |

## See also

- [Claude Code — plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- Published plugin repo: [openfetch-js/openFetchSkill](https://github.com/openfetch-js/openFetchSkill)
- Agent skills index: [skills/README.md](https://github.com/openfetch-js/OpenFetch/blob/main/skills/README.md)
- Library usage examples (separate folder): [examples/README.md](https://github.com/openfetch-js/OpenFetch/blob/main/examples/README.md)
