from __future__ import annotations

from typing import TypedDict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/v1/documents", tags=["documents"])


class DocumentInfo(TypedDict):
    id: str
    file_name: str
    chunk_count: int
    word_count: int
    created_at: str
    status: str
    selected: bool


class SelectionRequest(BaseModel):
    selected: bool


_LOCAL_DOCS: dict[str, DocumentInfo] = {}


@router.get("/local")
async def list_local_documents():
    return list(_LOCAL_DOCS.values())


@router.delete("/local/{doc_id}")
async def delete_local_document(doc_id: str):
    if doc_id not in _LOCAL_DOCS:
        raise HTTPException(status_code=404, detail="Document not found")
    del _LOCAL_DOCS[doc_id]
    return {"ok": True}


@router.post("/local/{doc_id}/selection")
async def set_local_document_selection(doc_id: str, request: SelectionRequest):
    doc = _LOCAL_DOCS.get(doc_id)
    if doc is None:
        # Allow lazy placeholder so frontend toggles do not fail in browser mode.
        _LOCAL_DOCS[doc_id] = {
            "id": doc_id,
            "file_name": doc_id,
            "chunk_count": 0,
            "word_count": 0,
            "created_at": "",
            "status": "ready",
            "selected": request.selected,
        }
    else:
        doc["selected"] = request.selected
    return {"ok": True}
