import os
import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Load Environment
current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(supabase_url, supabase_key)

def run_decay_batch(user_id: str):
    """
    Phase 4: Behavioral Decay & Drift Engine
    Finds knowledge graph edges that have not been reinforced recently 
    and applies 'decay' by marking valid_to = NOW(), retaining them historically
    but removing them from active state.
    """
    print(f"Starting Phase 4 Decay Engine for user {user_id[:8]}...")
    
    # Threshold for decay: 30 days of inactivity
    decay_threshold_days = 30
    cutoff_date = (datetime.datetime.utcnow() - datetime.timedelta(days=decay_threshold_days)).isoformat()
    
    # We want to decay active edges (valid_to is null) that haven't been observed recently.
    # Since every observation creates a new edge row, we need to find relation groups 
    # that have NO observations newer than the cutoff.
    
    # In a full production Postgres environment, we'd use a single SQL RPC for this.
    # Here, we'll fetch active edges and evaluate them.
    print("Fetching active edges...")
    res = supabase.table("chronic_edges")\
        .select("id, head_node_id, tail_node_id, relation_label, observed_from")\
        .eq("user_id", user_id)\
        .is_("valid_to", "null")\
        .execute()
        
    edges = res.data
    if not edges:
        print("No active edges to decay.")
        return
        
    # Group by relation
    relation_groups = {}
    for edge in edges:
        key = f"{edge['head_node_id']}::{edge['tail_node_id']}::{edge['relation_label']}"
        if key not in relation_groups:
            relation_groups[key] = []
        relation_groups[key].append(edge)
        
    edges_to_decay = []
    edges_to_escalate = []
    
    # Define relation classifications as specified in Build Note 02
    factual_relations = {'works_at', 'member_of', 'located_in', 'family_of', 'parent_of', 'child_of', 'spouse_of', 'sibling_of', 'friend_of', 'knows'}
    
    for key, group in relation_groups.items():
        # Check if the MOST RECENT observation in this group is older than the cutoff
        most_recent_obs = max(group, key=lambda x: x['observed_from'])
        if most_recent_obs['observed_from'] < cutoff_date:
            relation = most_recent_obs['relation_label'].lower().strip()
            
            if relation == 'commitment':
                # commitment edges that go quiet past expected window escalate to delayed_on
                for e in group:
                    edges_to_escalate.append(e['id'])
            elif relation in factual_relations:
                # identity/factual edges end only on contradicting evidence — never on silence
                continue
            else:
                # Default: mention-frequency (discusses, referenced_alongside) fade with silence
                for e in group:
                    edges_to_decay.append(e['id'])
                    
    now = datetime.datetime.utcnow().isoformat()
    
    if edges_to_escalate:
        print(f"Found {len(edges_to_escalate)} stale commitments. Escalating to delayed_on...")
        for edge_id in edges_to_escalate:
            supabase.table("chronic_edges")\
                .update({"relation_label": "delayed_on"})\
                .eq("id", edge_id)\
                .execute()
                
    if edges_to_decay:
        print(f"Found {len(edges_to_decay)} stale edges. Applying decay...")
        # Update valid_to for stale edges
        # Batch update is not natively supported by Supabase JS/Py easily without looping or RPC, 
        # so we update in chunks or loop (safe for cron).
        for edge_id in edges_to_decay:
            supabase.table("chronic_edges")\
                .update({"valid_to": now})\
                .eq("id", edge_id)\
                .execute()
        print(f"Decay applied. {len(edges_to_decay)} edges shifted from Active to Historic.")
    else:
        print("No silence-based decay applied to other active edges.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python batch_decay.py <user_id>")
        sys.exit(1)
    run_decay_batch(sys.argv[1])
