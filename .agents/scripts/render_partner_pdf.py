import fitz
from pathlib import Path
src = Path('attached_assets/c117d0a4-1120-48fa-b7e2-b19624a68d41_1788667250981.pdf')
out = Path('.agents/outputs/partner-uploaded')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(src)
print('pages', doc.page_count, 'size', src.stat().st_size)
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    target = out / f'page-{index+1}.png'
    pix.save(target)
    print(index + 1, page.rect, target)
    text = page.get_text('text')
    if 'Submission' in text or 'Proper' in text or 'submission' in text:
        print('MATCH', index + 1, repr(text))
