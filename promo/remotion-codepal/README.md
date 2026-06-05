# CodePal Promo Video

This Remotion project renders the short release-facing CodePal walkthrough video.

Inputs are sanitized screenshots and walkthrough frames copied into `public/screens/` by:

```bash
npm run build
npm run promo:capture
```

Then render from this directory:

```bash
npm install
npm run still
npm run render
```

The composition must only use synthetic screenshots from an isolated CodePal profile.
Do not copy real local session logs, provider settings, account views, tokens,
terminal output, or user paths into `public/`.
