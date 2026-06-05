# CodePal Promo Video

This Remotion project renders the short release-facing CodePal walkthrough video.

Inputs are sanitized 2x screenshots and walkthrough frames copied into `public/screens/` by:

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
The default MP4 render is 4K and intentionally favors clarity over file size.
Do not copy real local session logs, provider settings, account views, tokens,
terminal output, or user paths into `public/`.
