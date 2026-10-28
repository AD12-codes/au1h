# au1h CLI

```bash
npm i -g @au1h/cli   # or: bunx @au1h/cli, npx @au1h/cli
au1h login           # paste a personal access token from the admin portal
au1h apps create todo --origins http://localhost:3000 --init
```

| Command | What |
| --- | --- |
| `au1h login` / `logout` / `whoami` | Store, forget or show the token and workspace |
| `au1h apps list \| create \| show \| update \| delete` | Manage applications |
| `au1h apps secret rotate <slug>` | New application secret (shown once) |
| `au1h routes list \| add \| remove \| enable \| disable` | Gateway routes |
| `au1h init --app <slug>` | Scaffold the SDK into the current project |

`AU1H_URL` and `AU1H_TOKEN` override the stored login for CI. Docs: https://au1h.dev/docs/cli
