# Python OR-Tools Solver Service

This FastAPI microservice accepts staff, availability, and shift requirement
data as JSON, runs a CP-SAT model with OR-Tools, and returns the best schedule
it can find.

## Quick start

```bash
cd staff-scheduler/python-service
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The service exposes:

- `GET /health` — liveness check
- `POST /solve` — accepts the scheduler payload and returns `solutions`
  (an array of schedule results) plus `bestIndex`.

Set `NEXT_PUBLIC_SOLVER_URL=http://localhost:8000` in the Next.js app to have
the UI call this service.

## Payload shape

The request matches the TypeScript types in `lib/types.ts`:

- `staff`: Staff[] (with `minHoursPerWeek`/`maxHoursPerWeek`)
- `availability`: Availability[]
- `requirements`: ShiftRequirement[] (with `minStaff`/`maxStaff`)
- `locations`, `qualifications`
- `weekStartDate`: ISO datetime string
- `constraints`: scheduler constraints (`allowSplitShifts`, `minHoursPerStaff`,
  `maxHoursPerStaff`, `solveSeconds`, `solutionPoolSize`, etc.)

Responses mirror the `ScheduleResult` shape the app already uses.

