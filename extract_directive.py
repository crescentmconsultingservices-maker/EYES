from pypdf import PdfReader

try:
    reader = PdfReader(r'img\EYES_Directive_02.pdf')
    text = '\n'.join([p.extract_text() for p in reader.pages[:2] if p.extract_text()])

    with open(r'img\EYES_Directive_02_text.txt', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Extracted successfully.")
except Exception as e:
    print(f"Error: {e}")
