"""Read only: parse first page, never infer identity from references."""
import json, sys, re
from pypdf import PdfReader
try:
    reader = PdfReader(sys.argv[1], strict=False)
    if reader.is_encrypted and not reader.decrypt(''):
        raise ValueError('PDF 加密，无法自动读取')
    if not reader.pages:
        raise ValueError('PDF 没有页面')
    text = reader.pages[0].extract_text() or ''
    text = re.split(r'\n\s*(?:references|bibliography)\s*\n', text, flags=re.I)[0]
    print(json.dumps({'pages': len(reader.pages), 'firstPage': text[:16000]}, ensure_ascii=True))
except Exception as exc:
    print(json.dumps({'error': str(exc)}, ensure_ascii=True))
