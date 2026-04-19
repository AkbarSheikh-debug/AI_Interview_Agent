from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)  # must run before routers import os.getenv("DEMO_MODE")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import resume, interview, voice, report, vision, config
import cProfile
import pstats
import io
import time
import logging

# Configure basic logging system
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("api_profiler")

app = FastAPI(title="AI Interview Agent", version="1.0.0")

@app.middleware("http")
async def profile_request_logging_middleware(request: Request, call_next):
    # Only run cProfile against /api/ endpoints to avoid cluttering logs
    if not request.url.path.startswith("/api/"):
        return await call_next(request)

    profiler = cProfile.Profile()
    profiler.enable()
    start_time = time.time()
    
    response = await call_next(request)
    
    profiler.disable()
    process_time = time.time() - start_time
    
    s = io.StringIO()
    ps = pstats.Stats(profiler, stream=s).sort_stats('cumulative')
    ps.print_stats(15) # Show top 15 operations
    
    logger.info(f"{request.method} {request.url.path} completed in {process_time:.4f}s\n"
                f"--- cProfile Stats ---\n{s.getvalue()}")
    
    # Inject diagnostic header
    response.headers["X-Process-Time"] = str(process_time)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router, prefix="/api/resume", tags=["resume"])
app.include_router(interview.router, prefix="/api/interview", tags=["interview"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(report.router, prefix="/api/report", tags=["report"])
app.include_router(vision.router, prefix="/api/vision", tags=["vision"])
app.include_router(config.router, prefix="/api/config", tags=["config"])


@app.get("/")
def root():
    return {"status": "AI Interview Agent running"}


