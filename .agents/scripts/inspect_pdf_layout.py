import fitz
from pathlib import Path
src=Path('artifacts/api-server/src/assets/franchise-agreement-template.pdf')
doc=fitz.open(src)
for page_number in [1,2,3,4,6,8,9]:
    page=doc[page_number-1]
    print(f'\n=== PAGE {page_number} {page.rect} ===')
    for word in page.get_text('words'):
        x0,y0,x1,y1,w,*_=word
        if page_number in [1,2,4,6,8,9]:
            print(f'W {x0:6.1f},{y0:6.1f},{x1:6.1f},{y1:6.1f}: {w}')
    print('LINES')
    for d in page.get_drawings():
        r=d['rect']
        items=d['items']
        for item in items:
            if item[0]=='l':
                p1,p2=item[1],item[2]
                if abs(p1.y-p2.y)<2 or abs(p1.x-p2.x)<2:
                    print(f'L {p1.x:6.1f},{p1.y:6.1f} -> {p2.x:6.1f},{p2.y:6.1f}')
