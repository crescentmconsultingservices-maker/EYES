from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Security
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
import httpx
from litellm import acompletion
from supabase import create_client, Client
from datetime import datetime
import re
# Initialize Supabase
from dotenv import load_dotenv
current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))
sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
supabase: Optional[Client] = create_client(sb_url, sb_key) if sb_url and sb_key else None

# ── Auth: Bearer token check (H1 fix) ──────────────────────────────────────
CHRONIC_ENGINE_SECRET = os.environ.get("CHRONIC_ENGINE_SECRET", "")
api_key_header = APIKeyHeader(name="X-Engine-Secret", auto_error=False)

async def verify_engine_secret(key: Optional[str] = Security(api_key_header)) -> bool:
    """Validates that the caller knows the CHRONIC_ENGINE_SECRET.
    Allows unauthenticated calls only in local dev (no secret configured)."""
    if not CHRONIC_ENGINE_SECRET:
        # No secret configured — allow all calls (local dev only)
        return True
    if key != CHRONIC_ENGINE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid engine secret.")
    return True

app = FastAPI(title="EYES Chronic Layer Engine", version="1.0.0")

# Note: Counters for candidate filter monitoring have been migrated to Supabase 
# to support multiple workers safely without race conditions.

# Default schema from the Build Directive
DEFAULT_ENTITY_LABELS = [
    "person", "organization", "place", "project",
    "commitment", "decision", "goal", "emotional_state",
    "event", "topic", "document", "financial_transaction",
    "task", "blocker"
]

class ExtractRequest(BaseModel):
    user_id: Optional[str] = None
    platform_id: Optional[str] = None
    text: str
    labels: Optional[List[str]] = None
    threshold: Optional[float] = 0.6

class EntityResult(BaseModel):
    label: str
    text: str
    score: float
    start: int
    end: int

class RelationResult(BaseModel):
    head: str
    label: str
    tail: str
    score: float

class ExtractResponse(BaseModel):
    entities: List[EntityResult]
    relations: List[RelationResult]
    routed_to_llm: Optional[bool] = False
    routed_share_percentage: Optional[float] = 0.0


@app.post("/extract", response_model=ExtractResponse)
async def extract_entities(request: ExtractRequest, _: bool = Depends(verify_engine_secret)):
    """
    Receives raw text from the Next.js Perception Layer,
    runs it through the Modal GLiNER cloud engine, and returns structured entities with their exact character anchors.
    Requires X-Engine-Secret header when CHRONIC_ENGINE_SECRET env var is set.
    """
    if not request.text:
        return {"entities": [], "relations": [], "routed_to_llm": False, "routed_share_percentage": 0.0}

    # Increment and fetch processed counter safely from Supabase
    total_records_processed = 1
    try:
        res = supabase.rpc("increment_engine_metric", {"metric_name": "total_records_processed"}).execute()
        if res.data is not None:
            total_records_processed = res.data
    except Exception as e:
        print(f"Metrics Error: {e}")

    labels_to_use = request.labels if request.labels else DEFAULT_ENTITY_LABELS

    routed_to_llm = False
    routed_share_percentage = 0.0
    total_records_routed_to_llm = 0

    try:
        # 1. Predict entities and try local extraction via Modal cloud engine
        entities = []
        relations = []
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                modal_res = await client.post(
                    "https://crescentmconsultingservices-maker--eyes-gliner-engine-gl-495c6c.modal.run",
                    json={"text": request.text, "labels": labels_to_use}
                )
                modal_res.raise_for_status()
                modal_data = modal_res.json()
                
                # Apply threshold filtering
                raw_entities = modal_data.get("entities", [])
                entities = [e for e in raw_entities if e.get("score", 0) >= request.threshold]
                relations = modal_data.get("relations", [])
        except Exception as modal_err:
            print(f"[Relationship Engine] Modal Cloud Error: {modal_err}. Falling back to LLM.")

        # 2B. Fallback to LiteLLM (Gemini) only if local extraction yielded nothing
        if not relations:
            # Apply the candidate filter specified in Build Note 02 to route only potential speech-acts (~10-30% of records)
            speech_act_patterns = [
                # Commitments: I'll, let me, count on me, leave it to, we'll, by [time], will, promise
                r"\bi'll\b",
                r"\bwe'll\b",
                r"\blet me\b",
                r"\bcount on me\b",
                r"\bleave it (with|to)\b",
                r"\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|eod|eow|next week|tonight)\b",
                r"\bwill\b",
                r"\bpromise(d|s)?\b",
                # Delays: waiting, blocked, stuck, still hasn't, delay, delayed, haven't, hasn't, late, missed, behind
                r"\bwaiting\b",
                r"\bblocked\b",
                r"\bstuck\b",
                r"\bstill hasn't\b",
                r"\bdelay(ed)?\b",
                r"\bhaven't\b",
                r"\bhasn't\b",
                r"\blate\b",
                r"\bmisse(d)?\b",
                r"\bbehind\b",
                # Decisions: pass on, drop, kill, scrap, opted not, decide, decided, resolved
                r"\bpass on\b",
                r"\bdrop\b",
                r"\bkill\b",
                r"\bscrap\b",
                r"\bopted not\b",
                r"\bdecide(d|s)?\b",
                r"\bresolve(d|s)?\b"
            ]
            speech_act_re = re.compile("|".join(speech_act_patterns), re.IGNORECASE)
            is_potentially_implicit = bool(speech_act_re.search(request.text))

            if is_potentially_implicit:
                routed_to_llm = True
                
                # Increment LLM routing counter
                try:
                    res = supabase.rpc("increment_engine_metric", {"metric_name": "total_records_routed_to_llm"}).execute()
                    if res.data is not None:
                        total_records_routed_to_llm = res.data
                except Exception as e:
                    print(f"Metrics Error: {e}")
                    total_records_routed_to_llm += 1
                
                if total_records_processed > 0:
                    routed_share_percentage = (total_records_routed_to_llm / total_records_processed) * 100
                
                print(f"[Routing Filter] Record routed to LLM. Total routed: {total_records_routed_to_llm}/{total_records_processed} ({routed_share_percentage:.1f}%)")
                try:
                    # Only include entities that exist within the request text
                    valid_entities = [e for e in entities if e.get('end', 0) <= len(request.text)]
                    entity_list_str = ", ".join([f"[{e['label']}] {e['text']}" for e in valid_entities])
                    
                    system_prompt = (
                        "You are a personal relationship extraction engine. Your job is to extract commitments, delays, blockers, and decisions made by or affecting the central user ('User').\n\n"
                        "CRITICAL RULES FOR CONTEXT VERIFICATION:\n"
                        "1. First, evaluate the context. If the text is a spreadsheet, financial model, newsletter, intelligence dossier, job alert, or passive formal report, assume it contains NO personal commitments and return [].\n"
                        "2. THE FIRST-PERSON OVERRIDE: Even in formal documents, if you find a sentence where the User explicitly uses SINGULAR first-person direct action (e.g., 'I will...', 'I am blocked by...', 'I have decided to...'), you MUST extract that specific commitment. Do NOT trigger this override for plural 'we' (e.g., 'We will purchase') or passive business statements like 'The company will purchase...'\n"
                        "3. AI COMMAND RULE: If the User is commanding or prompting an AI (e.g., 'audit this dossier', 'be brutally honest', 'write a report'), these are instructions FOR THE AI, not commitments by the User. Do NOT extract AI commands as User commitments.\n\n"
                        "EXTRACTION RULES:\n"
                        "4. The 'head' field for ALL extracted relations MUST be exactly 'User'. Do not use 'I', 'we', 'you', 'team'. Always use 'User' as the head.\n"
                        "5. Do NOT extract relations for third parties or general features of apps/news.\n"
                        "6. Label definitions:\n"
                        "   - 'commitment': Promises, plans, or tasks the User intends to do (e.g. Head: 'User', Label: 'commitment', Tail: 'finish the pitch deck by tomorrow').\n"
                        "   - 'delayed_on': Personal delays or missed deadlines of the User.\n"
                        "   - 'blocked_by': External dependencies or rules blocking the User.\n"
                        "   - 'decided_against': Active decisions by the User to scrap, pivot, reject, or drop a path.\n\n"
                        "Return ONLY a valid JSON array of objects with keys: 'head', 'label', 'tail', 'score' (0.0-1.0). If no relationships exist, return []."
                    )
 
                    platform = request.platform_id if request.platform_id else "unknown"
                    user_prompt = f"Source Platform: {platform}\n\nText:\n{request.text}\n\nEntities Found:\n{entity_list_str}"

                    # Route through the EYES LLM Gateway as defined in .env.local
                    response = await acompletion(
                        model="openai/auto-extract", # Use custom gateway model alias
                        api_base=os.environ.get("LITELLM_BASE_URL"),
                        api_key=os.environ.get("LITELLM_KEY"),
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.0,
                        timeout=15
                    )

                    llm_output = response.choices[0].message.content.strip()
                    if llm_output.startswith("```"):
                        llm_output = llm_output.split("\n", 1)[1]
                    if llm_output.endswith("```"):
                        llm_output = llm_output.rsplit("\n", 1)[0]
                    llm_output = llm_output.strip()
                    
                    relations = json.loads(llm_output)
                    
                    # Force normalize 'head' to 'User' as per system requirements
                    if isinstance(relations, list):
                        for rel in relations:
                            if isinstance(rel, dict):
                                rel["head"] = "User"

                except Exception as llm_err:
                    print(f"[Relationship Engine] LiteLLM Error: {llm_err}. Skipping relation extraction.")

        return {
            "entities": entities,
            "relations": relations,

            "routed_to_llm": routed_to_llm,
            "routed_share_percentage": routed_share_percentage
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """Root endpoint so the browser doesn't return a 404."""
    return {"message": "EYES Chronic Layer Engine is running. Visit /docs for the API dashboard."}

@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "mode": "serverless_gpu"}

class CronRequest(BaseModel):
    user_id: str

@app.post("/cron/dedupe")
async def trigger_dedupe_cron(request: CronRequest, background_tasks: BackgroundTasks, _: bool = Depends(verify_engine_secret)):
    """
    Nightly cron endpoint triggered by Vercel.
    Fires the Splink entity deduplication in the background.
    """
    from batch_dedupe import run_splink_batch
    background_tasks.add_task(run_splink_batch, request.user_id)
    return {"status": "accepted", "message": f"Splink deduplication started in background for user {request.user_id[:8]}"}

@app.post("/cron/decay")
async def trigger_decay_cron(request: CronRequest, background_tasks: BackgroundTasks, _: bool = Depends(verify_engine_secret)):
    """
    Nightly cron endpoint triggered by Vercel.
    Fires the Phase 4 behavioral decay engine in the background.
    """
    from batch_decay import run_decay_batch
    background_tasks.add_task(run_decay_batch, request.user_id)
    return {"status": "accepted", "message": f"Phase 4 Decay engine started in background for user {request.user_id[:8]}"}
