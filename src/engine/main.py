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
        # 1. Predict entities and try extraction via Modal cloud engine (if configured)
        entities = []
        relations = []
        modal_url = os.environ.get("MODAL_WEBHOOK_URL") or os.environ.get("MODAL_GLINER_URL")
        if modal_url:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    m_res = await client.post(modal_url, json={"text": request.text, "labels": labels_to_use})
                    if m_res.status_code == 200:
                        m_data = m_res.json()
                        entities = m_data.get("entities", [])
                        relations = m_data.get("relations", [])
            except Exception as modal_err:
                print(f"[Relationship Engine] Modal Cloud Call Failed/Skipped: {modal_err}. Falling back to LiteLLM.")

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
                        "You are an elite, highly precise relationship extraction engine. Your job is to extract commitments, delays, and decisions.\n\n"
                        "CRITICAL RULES TO AVOID NOISE (FALSE POSITIVES):\n"
                        "1. NO AI COMMANDS: If the text is a prompt instructing an AI (e.g., 'Summarize this'), DO NOT extract it.\n"
                        "2. NO PASSIVE INSTITUTIONAL PLEDGES: Ignore passive statements without a clear actor (e.g., 'The check will be mailed', 'No changes in the schedule').\n"
                        "3. NO THIRD-PARTY ACTIONS: If someone else did something (e.g., 'Matt sent you an email'), DO NOT extract it. Only extract future or pending actions.\n"
                        "4. NO THINKING OUT LOUD: If the author says 'I don't know if we should' or 'maybe we can', this is NOT a commitment or decision. It must be firm.\n\n"
                        "CRITICAL RULES TO ENSURE CAPTURE (FALSE NEGATIVES):\n"
                        "5. CAPTURE IMPLICIT AND EXPLICIT COMMITMENTS: You MUST extract personal promises, even if they don't say 'I will'. Examples of implicit commitments: 'Thursday is great', 'Leave it with me', 'Count on me', 'I am developing a proposal', 'I'll get it to you Friday'.\n"
                        "6. CAPTURE THIRD-PARTY DECISIONS: If someone else makes a firm decision (e.g., 'Ken Lay will not be able to attend'), extract it, but set the Head to that person's name ('Ken Lay'), NOT 'User'.\n"
                        "7. CAPTURE DELAYS: Extract any sentence implying a delay or reschedule, even if implicit (e.g., 'However, there's always next week').\n\n"
                        "LABEL DEFINITIONS (Use ONLY these exact labels):\n"
                        "- 'commitment': A personal promise, plan, or task. (e.g., Head: 'User', Label: 'commitment', Tail: 'finish the pitch deck').\n"
                        "- 'delayed_on': The person is late, behind, or explicitly deferring action.\n"
                        "- 'blocked_by': The person cannot proceed because of an external blocker.\n"
                        "- 'decided_against': An active rejection, cancellation, or decision not to do something.\n\n"
                        "*** FEW-SHOT EXAMPLES ***\n"
                        "Example 1 (Ignore passive institutional noise and thinking out loud):\n"
                        "Text: 'The project will launch on Friday. I don't know if we should scrap the data.'\n"
                        "Output: []\n\n"
                        "Example 2 (Catch implicit commitments and soft delays):\n"
                        "Text: 'I shall attend. However, there is always next week.'\n"
                        "Output: [{\"head\": \"User\", \"label\": \"commitment\", \"tail\": \"attend\", \"score\": 0.95}, {\"head\": \"User\", \"label\": \"delayed_on\", \"tail\": \"rescheduled to next week\", \"score\": 0.90}]\n\n"
                        "Example 3 (Catch implicit conversational commitments):\n"
                        "Text: 'I have to hurry and send in my money for the event.'\n"
                        "Output: [{\"head\": \"User\", \"label\": \"commitment\", \"tail\": \"send in money for the event\", \"score\": 0.90}]\n\n"
                        "Example 4 (Catch direct rejections):\n"
                        "Text: 'I cannot play on Thursday but thanks for letting me know.'\n"
                        "Output: [{\"head\": \"User\", \"label\": \"decided_against\", \"tail\": \"play on Thursday\", \"score\": 0.95}]\n\n"
                        "Example 5 (Catch basic commitments):\n"
                        "Text: 'I shall call Risk on Thursday.'\n"
                        "Output: [{\"head\": \"User\", \"label\": \"commitment\", \"tail\": \"call Risk on Thursday\", \"score\": 0.95}]\n\n"
                        "Example 3 (Third-party decisions):\n"
                        "Text: 'Ken Lay will not be able to attend.'\n"
                        "Output: [{\"head\": \"Ken Lay\", \"label\": \"decided_against\", \"tail\": \"attend\", \"score\": 0.98}]\n\n"
                        "Example 4 (Ignore AI prompts):\n"
                        "Text: 'Please review this email and tell me what you think.'\n"
                        "Output: []\n\n"
                        "OUTPUT FORMAT:\n"
                        "- The 'head' should be 'User' UNLESS the text is explicitly about a named third party's decision (e.g., 'Ken Lay').\n"
                        "- The 'tail' must be a concise summary of the action/blocker.\n"
                        "Return ONLY a valid JSON array of objects with keys: 'head', 'label', 'tail', 'score' (0.0-1.0). If no relations exist, return []."
                    )
 
                    platform = request.platform_id if request.platform_id else "unknown"
                    user_prompt = f"Source Platform: {platform}\n\nText:\n{request.text}\n\nEntities Found:\n{entity_list_str}"

                    # Route through the EYES LLM Gateway to the upgraded Haiku model
                    response = await acompletion(
                        model="openai/claude-haiku", # Upgraded for better reasoning, prefixed for proxy routing
                        api_base=os.environ.get("LITELLM_BASE_URL"),
                        api_key=os.environ.get("LITELLM_KEY"),
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.0,
                        timeout=60
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
                    
                    # Inject a placeholder entity for the User to satisfy downstream graph mapping
                    has_user_entity = any(e.get("text") == "User" for e in entities)
                    if not has_user_entity and relations:
                        entities.append({
                            "label": "person",
                            "text": "User",
                            "score": 1.0,
                            "start": 0,
                            "end": 0
                        })

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
