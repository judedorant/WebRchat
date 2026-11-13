# WebRchat frontend

React, Vite, TypeScript, Tailwind CSS, Zustand, Axios, React Router and Lucide.

See the [project README](../README.md) for the Docker workflow. For host development with Node 24 LTS:

```bash
npm ci
API_PROXY_TARGET=http://127.0.0.1:8080 npm run dev
npm run build
npm test
npm run lint
```

The API and Redis/MySQL services must be running for live health checks. `npm run test:e2e` requires the API and Reverb; see the root README for browser installation and port settings. Unit tests mock the health transport; browser tests use the real services. This release provides the foundation workspace, authentication, verification/recovery, profile settings, sessions and role guards. See docs/authentication.md for the local email workflow. The chat dashboard belongs to Phase 3.
