# pyright: reportMissingImports=false
# ruff: noqa: F401
import os
from typing import List, Dict, Any, Optional
from pydantic import BaseModel  # type: ignore
import modal  # type: ignore

# 1. Define the Modal Environment with igraph and leidenalg
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "python-igraph>=0.11.0",
        "leidenalg>=0.10.0",
        "supabase>=2.0.0",
        "pydantic>=2.0.0",
        "fastapi>=0.110.0"
    )
)

app = modal.App("eyes-leiden")

# 2. Define Request & Response Schemas
class GraphNodePayload(BaseModel):
    id: str
    name: Optional[str] = None
    label: Optional[str] = "Entity"
    attributes: Optional[Dict[str, Any]] = None

class GraphEdgePayload(BaseModel):
    head_node_id: str
    tail_node_id: str
    relation_label: Optional[str] = None
    confidence: Optional[float] = 1.0

class ClusterRequest(BaseModel):
    userId: str
    nodes: List[GraphNodePayload]
    edges: List[GraphEdgePayload]
    resolution: Optional[float] = 1.0

# 3. Serverless Clustered Leiden Execution Function
@app.function(
    image=image,
    cpu=4.0,
    memory=8192,
    timeout=600,
    scaledown_window=60,
    region="eu"
)
@modal.fastapi_endpoint(method="POST")
def cluster_large_graph(payload: ClusterRequest) -> Dict[str, Any]:
    """
    High-performance C++ Leiden community detection for large graphs (>50,000 edges).
    Calculates CPM or Modularity partition and syncs clusters to Supabase.
    """
    import igraph as ig  # type: ignore
    import leidenalg as la  # type: ignore
    from supabase import create_client  # type: ignore
    import uuid
    from datetime import datetime, timezone

    user_id = payload.userId
    nodes = payload.nodes
    edges = payload.edges
    resolution = float(payload.resolution or 1.0)

    if not nodes or not edges:
        return {"success": True, "clustersFound": 0, "message": "Empty graph"}

    print(f"[Modal Leiden] Processing graph for user {user_id[:8]} with {len(nodes)} nodes and {len(edges)} edges...")

    # Build node-index mapping
    node_to_idx = {n.id: idx for idx, n in enumerate(nodes)}
    idx_to_node = {idx: n for idx, n in enumerate(nodes)}

    g = ig.Graph(directed=False)
    g.add_vertices(len(nodes))

    edge_tuples = []
    weights = []

    for e in edges:
        u = node_to_idx.get(e.head_node_id)
        v = node_to_idx.get(e.tail_node_id)
        if u is not None and v is not None and u != v:
            edge_tuples.append((u, v))
            weights.append(max(0.01, float(e.confidence or 1.0)))

    if not edge_tuples:
        return {"success": True, "clustersFound": 0, "message": "No valid edges found"}

    g.add_edges(edge_tuples)
    g.es["weight"] = weights

    # Run Leiden with Constant Potts Model (CPM) partition
    partition = la.find_partition(
        g,
        la.CPMVertexPartition,
        weights=g.es["weight"],
        resolution_parameter=resolution
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    clusters_to_upsert = []

    for cluster_idx, member_indices in enumerate(partition):
        if len(member_indices) == 0:
            continue

        member_nodes = [idx_to_node[i] for i in member_indices]
        member_node_ids = [n.id for n in member_nodes]

        # Extract dominant label
        label_counts: Dict[str, int] = {}
        for n in member_nodes:
            lbl = n.label or "Entity"
            label_counts[lbl] = label_counts.get(lbl, 0) + 1
        dominant_label = max(label_counts.items(), key=lambda x: x[1])[0]

        cluster_uuid = str(uuid.uuid4())
        cluster_id = f"graph-cluster-{cluster_idx}-{cluster_uuid[:8]}"

        top_names = [n.name for n in member_nodes if n.name][:5]
        description = f"Cluster of {len(member_nodes)} {dominant_label} nodes: {', '.join(top_names)}"

        clusters_to_upsert.append({
            "id": cluster_uuid,
            "user_id": user_id,
            "cluster_id": cluster_id,
            "cluster_label": f"{dominant_label} Community {cluster_idx + 1}",
            "cluster_description": description,
            "characteristics": top_names,
            "occurrence_count": len(member_nodes),
            "is_current": True,
            "last_entered_at": now_iso,
            "updated_at": now_iso,
        })

    # Upsert clusters into Supabase if keys exist in environment
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key and clusters_to_upsert:
        supabase = create_client(supabase_url, supabase_key)
        # Mark previous graph clusters as inactive
        supabase.table("cognitive_clusters").update({"is_current": False}).eq("user_id", user_id).like("cluster_id", "graph-cluster-%").execute()
        
        # Batch insert
        chunk_size = 100
        for i in range(0, len(clusters_to_upsert), chunk_size):
            chunk = clusters_to_upsert[i:i + chunk_size]
            supabase.table("cognitive_clusters").upsert(chunk, on_conflict="user_id,cluster_id").execute()

    print(f"[Modal Leiden] Successfully clustered {len(clusters_to_upsert)} communities for user {user_id[:8]}.")

    return {
        "success": True,
        "clustersFound": len(clusters_to_upsert),
        "totalNodes": len(nodes),
        "totalEdges": len(edge_tuples)
    }
