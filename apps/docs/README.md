# au1h docs

The documentation site (Fumadocs on Next.js, static export). Content lives in
`content/docs`; the home page in `app/(home)` and `components/home`.

```bash
bun run dev          # http://localhost:4446
bun run build        # static export to out/
```

Built as `ghcr.io/ad12-codes/au1h-docs` by `.github/workflows/build-images.yml`.
