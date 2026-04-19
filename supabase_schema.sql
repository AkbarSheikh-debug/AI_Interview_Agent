-- Enable pgvector extension for embeddings
create extension if not exists vector;

-- Resumes: parsed resume data per session
create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  filename text,
  data jsonb not null,
  created_at timestamptz default now()
);

-- Sessions: interview metadata
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  phase int default 1,
  complete boolean default false,
  created_at timestamptz default now()
);

-- Interview messages: full conversation history
create table if not exists interview_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  phase int not null,
  created_at timestamptz default now()
);
create index on interview_messages(session_id);

-- ML Questions: question bank with vector embeddings
create table if not exists ml_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  tags text[] default '{}',
  embedding vector(384),
  created_at timestamptz default now()
);
create index on ml_questions using ivfflat (embedding vector_cosine_ops) with (lists = 10);

-- Evaluations: per-phase scores
create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  phase int not null,
  score float,
  feedback text,
  created_at timestamptz default now()
);

-- Reports: final interview reports
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  data jsonb not null,
  created_at timestamptz default now()
);
