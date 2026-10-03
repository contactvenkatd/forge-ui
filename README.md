# Forge UI

Frontend-only React and Tailwind CSS concept for a generative engineering workspace.

```bash
npm install
npm run dev
```

## Deployment (GitHub Pages)

Pushing to `main` builds and deploys the site via `.github/workflows/deploy.yml` to
https://contactvenkatd.github.io/forge-ui/. The build reads `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, and `VITE_XAI_API_KEY` from GitHub repository secrets.

> **⚠️ API keys are public once deployed.** This is a client-side-only app with no
> backend. Vite inlines every `VITE_*` variable into the JavaScript bundle at build
> time, so anyone visiting the site can read `VITE_XAI_API_KEY` and the Supabase
> keys from their browser's dev tools. Keeping `.env` out of git (it is in
> `.gitignore`) prevents committing the keys, but it does **not** hide them from the
> deployed site.
>
> - The Supabase anon key is designed to be public; protect data with Row Level
>   Security policies.
> - The xAI key is **not** designed to be public. Anyone can copy it and spend your
>   credits. Set a low spending limit, rotate it if abused, or move xAI calls
>   behind a server-side proxy (e.g. a Supabase Edge Function) before sharing the
>   URL widely.
