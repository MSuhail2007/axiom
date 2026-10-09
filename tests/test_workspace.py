import io
import unittest
import zipfile
from pathlib import Path
from email.message import EmailMessage
from catalog import Catalog
from resolver import Resolver, ReviewStore
from workspace import Workspace, parse_upload


class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.resolver = Resolver(Catalog(Path('data/missing.sqlite')), ReviewStore(Path(':memory:')))

    def setUp(self):
        self.workspace = Workspace(self.resolver, ':memory:')

    def tearDown(self):
        self.workspace.db.close()

    @classmethod
    def tearDownClass(cls):
        cls.resolver.reviews.db.close()

    def test_utf16_spans_and_real_statistics(self):
        text = '😀 Merchants arrived in Madras.'
        result = self.workspace.analyze(text, 'document', False)
        city = next(x for x in result['locations'] if x['mention'] == 'Madras')
        self.assertEqual(city['canonical_name'], 'Chennai')
        self.assertEqual(city['start_char'], text.index('Madras') + 1)
        self.assertEqual(city['confidence'], 1)
        self.workspace.analyze(text, 'document', False)
        self.assertEqual(self.workspace.overview()['documents_processed'], 1)

    def test_queue_validates_and_saves_context_review(self):
        text = 'Heavy rain closed roads in Aurangabad. Officials responded.'
        self.workspace.analyze(text, 'document', False)
        item = self.workspace.queue()[0]
        with self.assertRaises(ValueError):
            self.workspace.decide(item['id'], {'action':'confirm', 'selected_canonical_id':'invalid'})
        self.assertEqual(len(self.workspace.queue()), 1)
        candidate = next(x for x in item['candidates'] if x['state'] == 'Bihar')
        self.workspace.decide(item['id'], {'action':'confirm', 'selected_canonical_id':candidate['id']})
        self.assertEqual(self.workspace.queue(), [])
        result = self.workspace.analyze(text, 'document', False)
        self.assertEqual(result['locations'][0]['canonical_name'], 'Aurangabad')
        self.assertEqual(result['locations'][0]['state'], 'Bihar')

    def test_codes_and_low_score_suggestions(self):
        result = self.workspace.analyze('BLR, MAA, BOM, CCU, Bxnglxrx', 'names', False)
        self.assertEqual([x['candidates'][0]['canonical_name'] for x in result['locations'][:4]], ['Bengaluru','Chennai','Mumbai','Kolkata'])
        typo = result['locations'][-1]
        self.assertLess(typo['confidence'], .8)
        self.assertEqual(typo['status'], 'AMBIGUOUS')
        self.assertTrue(typo['candidates'])

    def upload(self, name, data):
        message = EmailMessage()
        message.add_attachment(data, maintype='application', subtype='octet-stream', filename=name)
        serialized = message.as_bytes()
        body = serialized.split(b'\n\n', 1)[1]
        return parse_upload(message['Content-Type'], body)

    def test_local_txt_and_docx_parsing(self):
        self.assertEqual(self.upload('report.txt', 'Madras → Chennai'.encode()), 'Madras → Chennai')
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Madras</w:t></w:r></w:p><w:p><w:r><w:t>Bombay</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(self.upload('report.docx', data.getvalue()), 'Madras\n\nBombay')

    def test_blank_pdf_and_unsupported_upload(self):
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        data = io.BytesIO()
        writer.write(data)
        with self.assertRaisesRegex(ValueError, 'OCR'):
            self.upload('scan.pdf', data.getvalue())
        with self.assertRaisesRegex(ValueError, 'Supported'):
            self.upload('report.exe', b'abc')


if __name__ == '__main__':
    unittest.main()
