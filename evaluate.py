"""Tiny illustrative comparison; replace cases before making accuracy claims."""

from pathlib import Path

from catalog import Catalog
from resolver import Resolver, ReviewStore

CASES = [
    ("Heavy rain closed roads in Aurangabad. बिहार disaster officials sent rescue teams.", "Aurangabad", "Bihar"),
    ("Heavy rain closed roads in Aurangabad. महाराष्ट्र officials sent rescue teams.", "Aurangabad", "Maharashtra"),
    ("Heavy rain closed roads in Aurangabad. Officials sent rescue teams.", "Aurangabad", None),
    ("Reports from Bombay described heavy rain.", "Bombay", "Maharashtra"),
    ("Flights from Hyd were delayed. తెలంగాణ officials responded.", "Hyd", "Telangana"),
    ("Flights from Hyd were delayed.", "Hyd", None),
]


def main():
    r = Resolver(Catalog(Path("data/missing.sqlite")), ReviewStore(Path(":memory:")))
    for use_context in (False, True):
        correct = 0
        for text, mention, expected in CASES:
            item = next(x for x in r.resolve(text, use_context=use_context, use_llm=False)
                        if x["mention"] == mention)
            actual = item["selected"]["state"] if item["selected"] else None
            correct += actual == expected
        label = "context-aware" if use_context else "name-only"
        print(f"{label}: {correct}/{len(CASES)} correct on illustrative cases")
    r.reviews.db.close()


if __name__ == "__main__":
    main()
