import fitz
from pathlib import Path
src = Path('artifacts/api-server/src/assets/franchise-agreement-template.pdf')
out = Path('.agents/outputs/partner-template')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(src)
print('pages', doc.page_count, 'size', src.stat().st_size)
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    target = out / f'page-{index+1}.png'
    pix.save(target)
    print(index + 1, target)
