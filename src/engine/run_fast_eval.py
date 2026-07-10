import asyncio
import os
import json
import httpx
from litellm import acompletion
from supabase import create_client
from dotenv import load_dotenv
import time

current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
supabase = create_client(sb_url, sb_key)

ENGINE_URL = "http://127.0.0.1:8000/extract"

EXPERT_SYSTEM_PROMPT = """You are a meticulous human data labeler building a Ground Truth dataset.
Read the text and output a JSON array of relations with 'head', 'label', 'tail', 'score' (score=1.0).
Labels allowed: commitment, delayed_on, decided_against, blocked_by.
CRITICAL GROUND TRUTH RULES:
1. ONLY extract if the USER (the person who owns the account) explicitly and personally committed, decided, or is delayed.
2. If it is a newsletter, job alert, Google sheet financial model, or intelligence dossier, output [].
3. Only output a relation if there is a real, undeniable human speech act or calendar event indicating a personal task.
4. Output raw JSON array only. No markdown, no intro."""

async def get_expert_ground_truth(text: str, platform: str, sem: asyncio.Semaphore) -> list:
    async with sem:
        try:
            response = await acompletion(
                model="openai/gemini-flash-lite", 
                api_base=os.environ.get("LITELLM_BASE_URL"),
                api_key=os.environ.get("LITELLM_KEY"),
                messages=[
                    {"role": "system", "content": EXPERT_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Platform: {platform}\nText:\n{text}"}
                ],
                temperature=0.0
            )
            output = response.choices[0].message.content.strip()
            if output.startswith("```"):
                output = output.split("\n", 1)[1]
            if output.endswith("```"):
                output = output.rsplit("\n", 1)[0]
            return json.loads(output.strip())
        except Exception as e:
            return []

async def test_engine(text: str, platform: str, sem: asyncio.Semaphore) -> list:
    async with sem:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(ENGINE_URL, json={"text": text, "platform_id": platform})
                res.raise_for_status()
                data = res.json()
                return data.get("relations", [])
        except Exception as e:
            return []

def compare_extractions(truth, engine):
    truth_tails = [r['tail'].lower() for r in truth]
    engine_tails = [r['tail'].lower() for r in engine]
    misses = 0
    hallucinations = 0
    for t_tail in truth_tails:
        if not any(t_tail in e_tail or e_tail in t_tail for e_tail in engine_tails):
            misses += 1
    for e_tail in engine_tails:
        if not any(e_tail in t_tail or t_tail in e_tail for t_tail in truth_tails):
            hallucinations += 1
    return misses, hallucinations

async def process_record(idx, r, total, sem):
    text = r.get('content', '')
    platform = r.get('platform', 'unknown')
    truth = await get_expert_ground_truth(text, platform, sem)
    engine = await test_engine(text, platform, sem)
    misses, hallucinations = compare_extractions(truth, engine)
    
    if misses > 0 or hallucinations > 0:
        print(f"[{idx}/{total}] ❌ Mismatch on {platform} record: {r['id'][:8]}")
        print(f"   Truth: {truth}")
        print(f"   Engine: {engine}")
    else:
        print(f"[{idx}/{total}] 🟢 Perfect Match (Found {len(truth)} relations)")
        
    return len(truth), len(engine), misses, hallucinations

async def run_evaluation():
    print("=============================================")
    print(" ASYNC GROUND TRUTH EVALUATION (500 RECORDS)")
    print("=============================================\n")
    
    res = supabase.table('memories').select('user_id').limit(1).execute()
    if not res.data:
        print("No users found.")
        return
    
    target_user = res.data[0]['user_id']
    print(f"Targeting User ID: {target_user[:8]}...")
    
    res = supabase.table('memories').select('id, content, platform').eq('user_id', target_user).limit(500).execute()
    records = res.data
    total = len(records)
    print(f"Fetched {total} unlabelled records for this user.\n")
    
    print("Beginning Expert Labeling vs Engine Evaluation...")
    sem = asyncio.Semaphore(15) # 15 concurrent requests to avoid rate limits
    
    tasks = [process_record(idx, r, total, sem) for idx, r in enumerate(records, 1)]
    results = await asyncio.gather(*tasks)
    
    total_truth = sum(r[0] for r in results)
    total_engine = sum(r[1] for r in results)
    total_misses = sum(r[2] for r in results)
    total_hallucinations = sum(r[3] for r in results)
    
    print("\n=============================================")
    print(" FINAL ACCURACY REPORT")
    print("=============================================")
    print(f"Records Evaluated: {total}")
    print(f"Ground Truth Relations (Answer Key): {total_truth}")
    print(f"Engine Extracted Relations: {total_engine}")
    print("---------------------------------------------")
    print(f"Total Misses (False Negatives): {total_misses}")
    print(f"Total Hallucinations (False Positives): {total_hallucinations}")
    
    recall = max(0, ((total_truth - total_misses) / total_truth) * 100) if total_truth > 0 else (100.0 if total_misses == 0 else 0.0)
    precision = max(0, ((total_engine - total_hallucinations) / total_engine) * 100) if total_engine > 0 else (100.0 if total_hallucinations == 0 else 0.0)
        
    print(f"\nRecall (Did we catch all truth?): {recall:.1f}%")
    print(f"Precision (Is what we caught real?): {precision:.1f}%")
    print("=============================================\n")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
