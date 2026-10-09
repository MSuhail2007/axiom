import unittest
from pathlib import Path
from catalog import Catalog
from workspace import Workspace
from types import SimpleNamespace


class CatalogPageTests(unittest.TestCase):
    def setUp(self):
        if not Path('data/geonames.sqlite').exists():
            self.skipTest('Local India catalog required')
        self.catalog = Catalog()
        self.workspace = Workspace(SimpleNamespace(catalog=self.catalog, photon=None), ':memory:')

    def tearDown(self):
        self.workspace.db.close()
        self.catalog.conn.close()

    def test_full_catalog_pagination(self):
        expected = self.catalog.conn.execute("SELECT COUNT(*) FROM places WHERE country='India'").fetchone()[0]
        first = self.workspace.location_page()
        second = self.workspace.location_page(offset=40)
        self.assertEqual(first['total'], expected)
        self.assertGreater(expected, 500000)
        self.assertEqual(len(first['items']), 40)
        self.assertEqual(len(second['items']), 40)
        self.assertFalse({p['id'] for p in first['items']} & {p['id'] for p in second['items']})
        last = self.workspace.location_page(offset=expected-2)
        self.assertEqual(len(last['items']), 2)

    def test_alias_search_spans_catalog_and_keeps_geography(self):
        page = self.workspace.location_page('Madras', limit=1)
        self.assertGreaterEqual(page['total'], 2)
        self.assertEqual(page['items'][0]['canonical_name'], 'Chennai')
        next_page = self.workspace.location_page('Madras', limit=1, offset=1)
        self.assertNotEqual(page['items'][0]['id'], next_page['items'][0]['id'])
        river = self.workspace.location_page('Hooghly')
        self.assertIn('river', [p['kind'] for p in river['items']])
