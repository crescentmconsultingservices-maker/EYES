import modal
from typing import List, Dict, Any
from pydantic import BaseModel

# 1. Define the Modal Environment
# We install gliner and its dependencies.
image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "gliner", "torch", "huggingface_hub", "fastapi"
)

app = modal.App("eyes-gliner-engine")

# 2. Define the Request Schema
class ExtractRequest(BaseModel):
    text: str
    labels: List[str]

# 3. Define the Inference Class
# A class allows us to load the heavy 1.7GB model once when the container starts,
# keeping it hot in memory for all subsequent requests.
@app.cls(image=image, cpu=2.0, memory=4096, scaledown_window=120)
class GlinerEngine:
    
    @modal.enter()
    def load_model(self):
        """This runs exactly once when a new Modal container spins up."""
        print("Downloading and Loading GLiNER Model into RAM...")
        from gliner import GLiNER
        
        # We use CPU on Modal's free tier because it's cheaper and perfectly fine for text extraction.
        # If you ever want GPU, you just add `gpu="T4"` to the @app.cls decorator!
        self.model = GLiNER.from_pretrained("knowledgator/gliner-multitask-large-v0.5")
        print("GLiNER Model successfully loaded and ready.")

    @modal.fastapi_endpoint(method="POST")
    def extract(self, request: ExtractRequest) -> Dict[str, Any]:
        """This is the actual web API endpoint that FastAPI will call."""
        if not request.text.strip():
            return {"entities": [], "relations": []}
            
        print(f"Extracting entities for text of length: {len(request.text)}")
        
        # 1. Extract Entities
        entities = self.model.predict_entities(request.text, request.labels)
        
        # 2. Extract Relations (if the model architecture supports it)
        relations = []
        if hasattr(self.model, 'predict_relations') and len(entities) > 0:
            try:
                relations = self.model.predict_relations(request.text, entities=entities)
            except Exception as e:
                print(f"Relation extraction skipped: {e}")
                pass

        return {
            "entities": entities,
            "relations": relations
        }
