"""
@deprecated Vercel artik backend.ai_server:app kullanir (pyproject.toml [tool.vercel]).
Eski serverless api/index.py modeli kaldirildi.
"""
from backend.ai_server import app  # noqa: F401
