from pathlib import Path
import fitz

source = Path("attached_assets/Hydranet_Franchise_Agreement_Updated_v4_1788664827904.pdf")
output = Path(".agents/outputs/franchise-agreement-pages")
output.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    target = output / f"page-{index + 1:02d}.png"
    pixmap.save(target)
    print(f"{index + 1}: {page.rect.width}x{page.rect.height} -> {target}")