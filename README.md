# CampusReddit — Complete Frontend Prototype

A polished React/Vite prototype for a university-first community platform.

## Included in this pass

- First-visit full-screen welcome experience
- Intro panel explaining the platform before the home feed
- Flexible **Maybe later** / skip flow
- Optional onboarding step for selecting suggested communities
- Suggested communities are added to the user's local feed preference
- Login / signup modal with university-email and SSO-ready surfaces
- Working profile dropdown with profile, saved, settings and account actions
- Working notification panel with mark-all-read state
- Working comments modal
- Working post options menu with save, share and report interactions
- Working share-to-clipboard interaction
- Working save, vote, sort, search and community join/leave interactions
- Working image/spoiler/tag controls in the post composer
- Community pages now correctly filter posts to the selected community
- My Feed and Saved views have dedicated empty states
- Home now has a cleaner hero plus a "Find your people" community discovery section
- Explore page with all communities
- Mobile navigation and responsive layouts
- Custom favicon + PWA manifest
- About, Rules, Privacy, Help and Settings information surfaces

## Important prototype note

This is intentionally frontend-only. Login, university verification, comments, notifications, moderation, search, profiles and posts are simulated locally so the UX can be reviewed before connecting the production backend.

## Production architecture after UI approval

Recommended next layer: Supabase Auth + PostgreSQL + Row Level Security + Storage + Realtime, with moderation/report tables, university verification, notification persistence, profile data, community membership, comments, votes and anti-spam/rate limits.
