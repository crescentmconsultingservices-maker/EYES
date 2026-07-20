import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const LITELLM_URL = process.env.LITELLM_BASE_URL || 'https://eyes-llm-gateway.fly.dev/v1';
const LITELLM_KEY = process.env.LITELLM_KEY || process.env.EYES_GATEWAY_KEY;

async function testLLM() {
  const response = await fetch(`${LITELLM_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LITELLM_KEY}`
    },
    body: JSON.stringify({
      model: "claude-haiku",
      messages: [
        { role: "system", content: "You are a test bot. Output valid JSON." },
        { role: "user", content: "Hello! Reply with { \"status\": \"ok\" }" }
      ],
      temperature: 0.0,
      response_format: { type: "json_object" }
    })
  });

  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Body:', text);
}

testLLM();
