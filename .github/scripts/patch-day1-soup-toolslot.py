from pathlib import Path

path = Path("frontend/app/kitchen.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
'''    if (next === null) {
      for (let i = 0; i < lcs.length; i++) {
        if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) {
          const t = 12 + i; next = t !== soupSlotRef.current ? t : null; break;
        }
      }
    }''',
'''    if (next === null) {
      // Day-1 Herb Soup may use ingredient slots 0-2, but never the Tool slot (index 3).
      for (let i = 0; i < 3; i++) {
        if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) {
          const t = 12 + i; next = t !== soupSlotRef.current ? t : null; break;
        }
      }
    }''',
"limit Day-1 soup hover targets to ingredient slots",
)

replace_once(
'''      if (target === -1) {
        for (let i = 0; i < lcs.length; i++) {
          if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { target = 12 + i; break; }
        }
      }''',
'''      if (target === -1) {
        // Day-1 Herb Soup may be moved into ingredient slots 0-2 only.
        // The Tool slot is not a valid destination for this tutorial item.
        for (let i = 0; i < 3; i++) {
          if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { target = 12 + i; break; }
        }
      }''',
"limit Day-1 soup drop targets to ingredient slots",
)

path.write_text(text)
print("Day-1 soup Tool-slot patch applied")
