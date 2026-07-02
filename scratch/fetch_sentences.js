const url = 'https://rwywnbkvbztzosvbmrqw.supabase.co/rest/v1/memories?select=content&user_id=eq.043eff80-871a-4b89-a3fa-b65dbe8717bb&limit=200';
const key = 'REMOVED_SECRET';

fetch(url, {
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
})
.then(res => res.json())
.then(data => {
    if (data.error) {
        console.error("Error:", data.error);
        return;
    }
    
    // Clean and filter content
    const sentences = data
        .map(d => (d.content || '').trim())
        .filter(c => c.length > 20) // exclude very short fragments
        .filter(c => !c.match(/^[\d,\.\s€\$]+$/)); // exclude pure numbers/currency
        
    // Find sentences with keywords that imply our target relations
    const targetKeywords = ['will', 'plan', 'delay', 'wait', 'late', 'decide', 'cancel', 'not going to', 'purchase', 'buy', 'consider', 'target', 'achieve'];
    
    let selected = sentences.filter(s => targetKeywords.some(k => s.toLowerCase().includes(k)));
    
    // If too many, take a slice. If too few, add some random ones.
    if (selected.length > 50) {
        selected = selected.slice(0, 50);
    } else if (selected.length < 50) {
        const others = sentences.filter(s => !selected.includes(s));
        selected = [...selected, ...others.slice(0, 50 - selected.length)];
    }
    
    console.log(JSON.stringify(selected, null, 2));
})
.catch(err => console.error("Fetch error:", err));
