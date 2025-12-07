from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import SolveRequest, SolveResponse
from solver import solve_schedule

app = FastAPI(title="Staff Scheduler Solver", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
def solve(req: SolveRequest) -> SolveResponse:
    solutions = solve_schedule(req)
    if not solutions:
        raise HTTPException(status_code=400, detail="No feasible schedule found")
    return SolveResponse(solutions=solutions, bestIndex=0)

