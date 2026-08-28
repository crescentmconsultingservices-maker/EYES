import os
from pypdf import PdfReader

# Platform-agnostic paths
current_dir = os.path.dirname(os.path.abspath(__file__))
pdf_path = os.path.join(current_dir, 'img', 'EYES_Directive_02.pdf')
out_path = os.path.join(current_dir, 'img', 'EYES_Directive_02_full_text.txt')

if not os.path.exists(pdf_path):
    print(f"Error: Source PDF not found at {pdf_path}")
    exit(1)

try:
    reader = PdfReader(pdf_path)
    text = '\n'.join([p.extract_text() for p in reader.pages if p.extract_text()])
    
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Full extraction successful.")
except Exception as e:
    print(f"Error: {e}")
