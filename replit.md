# LiftLog - Workout Tracking App

## Overview

LiftLog is a mobile-first iOS-style workout tracking app built for real-world gym usage. It's fast, minimal, and focused on logging workouts quickly with minimal typing. All data is stored locally in the browser (localStorage) — no backend, no cloud, no login required.

## Architecture

- **Frontend**: React + TypeScript + Vite (mobile-first SPA)
- **Styling**: Tailwind CSS v3 + shadcn/ui components
- **Data**: localStorage (all workout data persists locally in browser)
- **Routing**: wouter
- **State**: React useState + custom hooks + localStorage sync
- **Backend**: Express.js (serves static frontend only, no API routes used)

## Key Features

1. **Workout Templates** - Create, edit, duplicate, delete workout plans (Push, Pull, Legs, etc.)
2. **Exercise Library** - Custom exercises with muscle group categorization
3. **Active Session** - Real-time workout logging with timer
4. **Advanced Set Logging** - Weight, reps, partial reps, set type (Normal/Assisted/Failure)
5. **Smart Input UI** - +/- buttons for fast weight/rep adjustments, tap-to-edit
6. **Previous Session Comparison** - Shows last workout data inline while logging
7. **Rest Timer** - Auto-starts after completing a set
8. **Workout History** - Full history with expandable session details
9. **Progress Tracking** - Volume charts, personal bests, exercise-level progression
10. **Dark Mode** - Default dark mode, iOS-inspired design

## Data Model (localStorage keys)

- `liftlog_exercises` - Exercise[] (name, muscle group)
- `liftlog_templates` - WorkoutTemplate[] (name, description, color, exercises list)
- `liftlog_sessions` - WorkoutSession[] (completed workouts with all set data)
- `liftlog_active_session` - WorkoutSession (current in-progress session)
- `liftlog_pbs` - PersonalBest[] (best weight/volume per exercise)

## Pages & Routes

- `/` - Home: workout template cards, create/edit/duplicate/delete
- `/session/:id` - Active Session: real-time workout logging
- `/history` - History: past workouts, expandable details, stats
- `/exercises` - Exercises: exercise library with search/filter by muscle group
- `/progress` - Progress: volume charts, personal bests, exercise trends
- `/template/:id/edit` - Template Editor: manage exercises in a template

## Project Structure

```
client/src/
  pages/
    Home.tsx          - Template cards + create/edit dialogs
    Session.tsx       - Active workout session with set logging
    History.tsx       - Workout history list
    Exercises.tsx     - Exercise library management
    Progress.tsx      - Progress charts and personal bests
    TemplateEditor.tsx - Exercise management for templates
  components/
    BottomNav.tsx     - Bottom tab navigation (hidden during session)
    ui/               - shadcn/ui components
  lib/
    types.ts          - TypeScript interfaces
    storage.ts        - localStorage CRUD operations + seed data
    hooks.ts          - Custom hooks (timer, rest timer, formatters)
server/
  index.ts            - Express server
  routes.ts           - API routes (minimal, data is client-side)
shared/
  schema.ts           - Drizzle schema (users only, not used for workout data)
```

## Running

```bash
npm run dev
```

Starts Express + Vite on port 5000.

## Design Tokens

Dark mode by default with iOS-inspired palette:
- Background: Very dark navy-black
- Primary: Vibrant blue (217 91% 60%)
- Accent: Orange (28 90% 58%)
- Cards: Slightly lighter than background

## Seed Data

On first load, the app seeds realistic workout data:
- 20 exercises across 10 muscle groups
- 4 workout templates (Push, Pull, Legs, Full Body)
- 3 completed sessions with detailed set data
- 5 personal bests
