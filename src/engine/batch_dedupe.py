import os
import sys
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Load Environment
current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing Supabase credentials")
    sys.exit(1)

supabase: Client = create_client(supabase_url, supabase_key)

def run_splink_batch(user_id: str):
    """
    Phase 3.B: Entity Deduplication (Deterministic Node Merging)
    Merges duplicate nodes in the graph natively.
    """
    print(f"Starting Nightly Entity Deduplication Batch for user {user_id[:8]}...")

    # 1. Extract nodes from chronic_nodes
    res = supabase.table("chronic_nodes").select("id, name, created_at").eq("user_id", user_id).execute()
    nodes = res.data

    if not nodes:
        print("No nodes found. Graph is empty.")
        return

    # 2. Cluster nodes by normalized exact match
    clusters = defaultdict(list)
    for node in nodes:
        normalized_name = str(node.get("name", "")).lower().strip()
        clusters[normalized_name].append(node)

    # 3. Perform True Merge Operations
    merged_count = 0
    for norm_name, group in clusters.items():
        if len(group) > 1:
            # Sort by created_at to keep the oldest node as the canonical one
            group.sort(key=lambda x: x.get('created_at', ''))
            canonical_node = group[0]
            duplicate_nodes = group[1:]
            
            canonical_id = canonical_node['id']
            duplicate_ids = [d['id'] for d in duplicate_nodes]
            
            # Update edges pointing to duplicates to point to the canonical node
            for dup_id in duplicate_ids:
                supabase.table("chronic_edges").update({"head_node_id": canonical_id}).eq("head_node_id", dup_id).execute()
                supabase.table("chronic_edges").update({"tail_node_id": canonical_id}).eq("tail_node_id", dup_id).execute()
                
                # Delete the duplicate node
                supabase.table("chronic_nodes").delete().eq("id", dup_id).execute()
                merged_count += 1

    if merged_count > 0:
        print(f"Deduplication complete. Successfully merged {merged_count} duplicate nodes into their canonical originals.")
    else:
        print("No duplicate nodes found. Graph is clean.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python batch_dedupe.py <user_id>")
        sys.exit(1)
    run_splink_batch(sys.argv[1])
