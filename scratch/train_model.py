import json
from gliner import GLiNER
from gliner.training import Trainer, TrainingArguments

def train_model():
    print("Loading the training data...")
    with open('e:\\Projects\\The EYES\\scratch\\implicit_training_data.json', 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    # Convert our JSON format into the exact format GLiNER expects
    training_data = []
    for item in raw_data:
        text = item["text"]
        entities = []
        for ent in item["entities"]:
            label = ent["label"]
            ent_text = ent["text"]
            start_idx = text.find(ent_text)
            if start_idx != -1:
                end_idx = start_idx + len(ent_text)
                entities.append([start_idx, end_idx, label])
        
        # GLiNER format dict
        training_data.append({
            "text": text,
            "entities": entities
        })

    print(f"Prepared {len(training_data)} training examples.")
    
    print("Loading base GLiNER model for fine-tuning...")
    model = GLiNER.from_pretrained("knowledgator/gliner-multitask-large-v0.5")
    
    print("Setting up Training Arguments...")
    training_args = TrainingArguments(
        output_dir="e:\\Projects\\The EYES\\fine_tuned_gliner",
        learning_rate=5e-6,
        weight_decay=0.01,
        others_lr=1e-5,
        others_weight_decay=0.01,
        lr_scheduler_type="linear",
        warmup_ratio=0.1,
        per_device_train_batch_size=4,
        per_device_eval_batch_size=4,
        num_train_epochs=5,
        save_steps=100,
        dataloader_num_workers=0,
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=training_data,
        eval_dataset=training_data,
    )
    
    print("Starting Fine-Tuning Process (This may take some time depending on your GPU/CPU)...")
    try:
        trainer.train()
        model.save_pretrained("e:\\Projects\\The EYES\\fine_tuned_gliner_final")
        print("Fine-tuning complete! Model saved to e:\\Projects\\The EYES\\fine_tuned_gliner_final")
    except Exception as e:
        print(f"Error during training: {e}")
        print("Note: If 'Trainer' requires the 'datasets' library or fails on Windows, we will use the EU Box for full training.")

if __name__ == "__main__":
    train_model()
