# Staff Scheduler

The simplest, most beautiful staff scheduling app. One button, perfectly balanced schedules.

![Staff Scheduler](https://img.shields.io/badge/Next.js-14-black) ![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## Features

- **One-Button Magic** - Generate perfectly balanced schedules in seconds
- **Staff Management** - Add team members with qualifications (Tech, Beauty, Cash Register, etc.)
- **Availability Tracking** - Visual weekly grid with drag-to-select
- **iCal Import** - Import availability from Google Calendar, Outlook, Apple Calendar
- **Shift Requirements** - Define coverage needs by location, time, and qualifications
- **Smart Balancing** - Algorithm ensures fair hour distribution across all staff
- **Mobile First** - Beautiful responsive design, works on any device
- **PWA Ready** - Install on your phone, works offline

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How It Works

1. **Add Staff** - Create team members and assign their qualifications
2. **Set Availability** - Each staff member marks when they can work
3. **Define Requirements** - Specify what shifts need coverage (which days, times, locations)
4. **Generate!** - One click creates an optimized schedule

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS with custom glass-morphism design
- **State:** Zustand with localStorage persistence
- **PWA:** next-pwa for installability and offline support
- **Algorithm:** Custom constraint-satisfaction scheduler

## Scheduling Algorithm

The scheduler uses a multi-pass approach:

1. **Constraint Building** - Maps which staff can work which shifts based on availability and qualifications
2. **Greedy Assignment** - Fills shifts prioritizing staff who need more hours
3. **Balancing Pass** - Redistributes to equalize hours across team
4. **Optimization** - Local search to improve preference matching

## Project Structure

```
staff-scheduler/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard with schedule grid
│   ├── staff/             # Staff management
│   ├── availability/      # Availability editor
│   └── requirements/      # Shift requirements
├── components/
│   ├── ui/                # Reusable UI components
│   ├── Navigation.tsx     # App navigation
│   ├── ScheduleGrid.tsx   # Weekly schedule view
│   └── ...
├── lib/
│   ├── types.ts           # TypeScript interfaces
│   ├── store.ts           # Zustand state management
│   ├── scheduler.ts       # Scheduling algorithm
│   └── ical-parser.ts     # iCal import utility
└── public/
    └── manifest.json      # PWA manifest
```

## License

MIT

