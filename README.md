# Interview Agent

An AI-powered mock-interviewer for ML / software-engineering candidates.
Upload a resume, get a voice-driven, phase-based technical interview with a
3D avatar interviewer, live face/gaze integrity monitoring, and an auto-
generated evaluation report.

---

## Features

- **Resume parsing** — drop in a PDF, Gemini multimodal extracts skills,
  projects, experience, and the candidate's primary ML field.
- **Phase-based interview engine** — 5 phases (intro → behavioural →
  project deep-dive → structured Q&A → close) with per-phase turn limits.
- **Multi-provider LLM routing** — pick from Groq, Google Gemini,
  OpenRouter, or OpenAI at runtime. Free tiers work out of the box.
- **Speech in / out** — Whisper-on-Groq STT, ElevenLabs TTS.
- **3D avatar** — animated GLB interviewer rendered with
  `@react-three/fiber`, lip-synced via `rhubarb-lip-sync-wasm`.
- **Anti-cheat / integrity** — MediaPipe + ONNX face-landmark + YOLO person
  detection running fully in the browser (picture-in-picture camera).
- **Demo mode** — set `DEMO_MODE=true` and the entire flow runs without
  any API keys (canned responses + pre-parsed resume).

---

## Architecture

```
┌────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (Vite/React) │  HTTP  │   Backend (FastAPI/uvicorn)  │
│  localhost:5173        │ ─────▶ │   localhost:8000             │
│                        │        │                              │
│  • Landing (upload)    │        │  routers/                    │
│  • Interview           │        │    resume.py   → Gemini PDF  │
│    – AvatarViewer      │        │    interview.py→ phase engine│
│    – Chat + PiP cam    │        │    voice.py    → STT / TTS   │
│    – Integrity panel   │        │    report.py   → evaluation  │
│  • Report              │        │    vision.py   → face checks │
│                        │        │    config.py   → model list  │
│  /api → proxied to     │        │                              │
│   backend via Vite     │        │  services/                   │
└────────────────────────┘        │    llm_router.py (dispatch)  │
                                  │    gemini_client.py          │
                                  │    groq_client.py            │
                                  │    openrouter_client.py      │
                                  │    openai_client.py          │
                                  │    stt_router.py             │
                                  │    embeddings.py (RAG)       │
                                  │    supabase_client.py        │
                                  │    model_catalog.py          │
                                  │    demo_mode.py              │
                                  └──────────────┬───────────────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          ▼                      ▼                      ▼
                    Groq / Gemini /        ElevenLabs TTS          Supabase
                    OpenRouter / OpenAI                            (transcripts)
```

### Tech stack

**Backend** — FastAPI 0.115, uvicorn, `google-genai`, `openai`, `groq`,
`supabase`, `elevenlabs`, pydantic.

**Frontend** — React 19, Vite 7, TypeScript, Tailwind v4,
`@react-three/fiber` + `drei`, `three`, `@mediapipe/tasks-vision`,
`onnxruntime-web`, `rhubarb-lip-sync-wasm`, `react-router-dom`, `axios`.

---

## Repo layout

```
.
├── backend/           FastAPI app
│   ├── main.py        app entrypoint + router mounting
│   ├── routers/       resume, interview, voice, report, vision, config
│   ├── services/      LLM / STT routing, Supabase, embeddings, demo mode
│   ├── prompts/       phase-based interviewer system prompts
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/          Vite + React app
│   ├── src/
│   │   ├── pages/     Landing, Interview, Report
│   │   ├── components/AvatarViewer, CandidateCameraPanel, ChatBubble, …
│   │   ├── lib/       api client, antiCheat, audio recorder, YOLO runner
│   │   └── main.tsx
│   ├── public/        GLB avatars, favicon, icons
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── nginx.conf
├── e2e-tests/         Playwright smoke test (run.js)
├── questions/         ML question bank (ml_questions.json, RAG source)
├── supabase_schema.sql
├── ecs-task-backend.json / ecs-task-frontend.json   AWS ECS task defs
├── start.bat          Windows one-shot: launches backend + frontend
├── .env.example
└── README.md
```

---

## Prerequisites

- Python **3.11+**
- Node.js **20+**
- (Optional) A Supabase project if you want transcripts persisted
- (Optional) At least one LLM API key — Groq, Gemini, OpenRouter, or
  OpenAI. Skip entirely by running in **demo mode**.

---

## Setup

### 1. Clone and configure env

```bash
git clone <this-repo>
cd "Interview Agent"
cp .env.example .env
# Edit .env — fill in whichever API keys you want to use, or set
# DEMO_MODE=true to run without any keys.
```

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Backend is now live at <http://localhost:8000>
(OpenAPI docs at `/docs`).

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.
Vite proxies `/api/*` to the backend automatically
(see [vite.config.ts](frontend/vite.config.ts)).

### Windows one-shot

```bat
start.bat
```

Launches both servers in separate terminals.

---

## Demo mode (no API keys)

Add to `.env`:

```
DEMO_MODE=true
```

- Resume upload is skipped — a hard-coded ML candidate resume is used.
- Every LLM / STT / TTS call is replaced with canned responses from
  [backend/services/demo_mode.py](backend/services/demo_mode.py).
- Full UI works end-to-end offline.

---

## Running the end-to-end smoke test

Playwright launches Chromium with a fake media stream, walks through the
full landing → upload → interview → message flow, and drops screenshots
in `e2e-tests/screenshots/`.

```bash
cd e2e-tests
npm install
node run.js
```

Requires both servers running. Best to pair with `DEMO_MODE=true`
unless you have API keys wired up.

---

## Supabase (optional)

If you want interview transcripts persisted, create a project at
<https://supabase.com>, apply [supabase_schema.sql](supabase_schema.sql),
and fill in `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_KEY` in
`.env`. All Supabase calls are wrapped in try/except so missing config
won't break the app.

---

## LLM model selection

The full catalog of selectable models lives in
[backend/services/model_catalog.py](backend/services/model_catalog.py).
Defaults:

- `DEFAULT_LLM_MODEL = "groq/openai/gpt-oss-120b"`
- `DEFAULT_STT_MODEL = "groq/whisper-large-v3-turbo"`

The Landing page fetches `GET /api/config/models` and exposes both as
dropdowns before the interview starts.

---

## Docker

Both services ship with a `Dockerfile`. The frontend image serves the
Vite build through nginx (see [frontend/nginx.conf](frontend/nginx.conf)).
AWS ECS task definitions are in `ecs-task-backend.json` and
`ecs-task-frontend.json`.

```bash
docker build -t interview-agent-backend ./backend
docker build -t interview-agent-frontend ./frontend
```

---

## License

Licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).
See [LICENSE](LICENSE) for the full text.

Under AGPL-3.0, if you modify this software and run it as a network service
(e.g. host it for others to use over the web), you must make your modified
source code available to those users. See
<https://www.gnu.org/licenses/agpl-3.0.html> for details.
