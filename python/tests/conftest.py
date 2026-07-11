import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "fixtures.json"


@pytest.fixture(scope="session")
def fixtures():
    if not FIXTURES.exists():
        pytest.skip("fixtures.json missing — run `npx tsx train/export-fixtures.ts`")
    with open(FIXTURES) as f:
        return json.load(f)
