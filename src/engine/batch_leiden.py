import os
import uuid
import networkx as nx
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Note: In production, install cdlib and leidenalg:
# pip install cdlib leidenalg networkx
# from cdlib import algorithms

current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))
supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(supabase_url, supabase_key)

import sys

def fetch_all_active_edges(user_id: str, batch_size: int = 1000):
    """
    Paginated streaming fetch of active edges for a user to handle large graphs (>10,000 edges)
    without hitting Supabase default 1,000 item payload caps or memory bottlenecks.
    """
    all_edges = []
    offset = 0
    while True:
        res = (
            supabase.table("chronic_edges")
            .select("head_node_id, tail_node_id, confidence, user_id")
            .eq("user_id", user_id)
            .is_("valid_to", "null")
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        data = res.data or []
        all_edges.extend(data)
        if len(data) < batch_size:
            break
        offset += batch_size
    return all_edges

def run_leiden_clustering(user_id: str):
    """
    Phase 4.B: Leiden Community Detection
    Runs nightly against the graph for a SPECIFIC user.
    Requires an explicit user_id — never processes all users at once.
    """
    print(f"Starting Nightly Leiden Community Detection for user {user_id[:8]}...")

    # 1. Fetch the graph in paginated chunks — scoped to this user ONLY
    edges = fetch_all_active_edges(user_id)
    
    if not edges:
        print("Graph is empty. Skipping clustering.")
        return
        
    print(f"Loaded {len(edges)} active edges from the Knowledge Graph across paginated batches.")
    
    # 2. Build NetworkX Graph iteratively
    G = nx.Graph()
    for e in edges:
        G.add_edge(e['head_node_id'], e['tail_node_id'], weight=e.get('confidence', 1.0))
        
    print(f"Built network with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges.")
    
    # 3. Run Leiden Algorithm
    print("Executing Leiden algorithm for community detection...")
    try:
        from cdlib import algorithms
        coms = algorithms.leiden(G)
        communities = coms.communities
    except ImportError:
        print("[Notice] 'cdlib' or 'leidenalg' not installed. Falling back to Louvain approximation for local dev.")
        # Fallback for local development if pip install hasn't run
        communities = list(nx.community.louvain_communities(G, weight='weight'))
        
    print(f"Discovered {len(communities)} distinct cognitive clusters.")
    
    # 4. Save to Database
    clusters_to_insert = []
    
    for i, comm in enumerate(communities):
        if len(comm) < 2:
            continue  # Skip trivial clusters

        cluster_id = str(uuid.uuid4())
        label = f"Emerging Pattern #{i+1}"

        clusters_to_insert.append({
            "id": cluster_id,
            "user_id": user_id,
            "cluster_id": cluster_id,
            "cluster_label": label,
            "cluster_description": f"Automatically grouped cluster containing {len(comm)} entities.",
            "characteristics": list(comm)[:10],
            "is_current": True,
            "occurrence_count": len(comm),
            "last_entered_at": datetime.utcnow().isoformat()
        })
        
    if clusters_to_insert:
        # Cleanly replace old clusters for this specific user
        supabase.table("cognitive_clusters").delete().eq("user_id", user_id).execute()
        
        # Batch insert in 500-item chunks to avoid Supabase payload limits
        chunk_size = 500
        for i in range(0, len(clusters_to_insert), chunk_size):
            chunk = clusters_to_insert[i:i + chunk_size]
            supabase.table("cognitive_clusters").insert(chunk).execute()

        print(f"Successfully saved {len(clusters_to_insert)} clusters to Supabase for user {user_id[:8]}.")
        print("The Mindmap UI and User can now review and name these clusters.")
    else:
        print("No significant clusters found.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python batch_leiden.py <user_id>")
        print("You must supply an explicit user_id — this script never processes all users at once.")
        sys.exit(1)
    run_leiden_clustering(sys.argv[1])
