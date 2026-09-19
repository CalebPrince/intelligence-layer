"""Third-party integration credentials: catalog, save, test, remove. See
app/integrations.py for what's actually checked live versus stored only."""
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from app import database, integrations
from app.schemas import IntegrationCatalogEntry, IntegrationCredential, IntegrationCredentialCreate

router = APIRouter(prefix="/v1/integrations", tags=["integrations"])


@router.get("/catalog", response_model=list[IntegrationCatalogEntry])
async def catalog() -> list[dict]:
    return [
        {
            "key": i.key,
            "name": i.name,
            "category": i.category,
            "fields": [{"key": f.key, "label": f.label, "secret": f.secret} for f in i.fields],
            "has_live_check": i.test is not None,
        }
        for i in integrations.CATALOG.values()
    ]


def _to_credential(row: dict) -> dict:
    return {
        "service": row["service"],
        "status": row["status"],
        "status_detail": row.get("status_detail"),
        "last_checked_at": row.get("last_checked_at"),
        "updated_at": row["updated_at"],
        "fields_set": [k for k, v in row["credential"].items() if v],
    }


@router.get("", response_model=list[IntegrationCredential])
async def list_credentials(owner_id: str = Query(...)) -> list[dict]:
    return [_to_credential(r) for r in database.list_integration_credentials(owner_id)]


@router.put("/{service}", response_model=IntegrationCredential)
async def save_credential(service: str, req: IntegrationCredentialCreate, owner_id: str = Query(...)) -> dict:
    if service not in integrations.CATALOG:
        raise HTTPException(status_code=404, detail="Unknown integration")
    database.set_integration_credential(owner_id, service, req.credential)
    return await test_credential(service, owner_id=owner_id)


@router.post("/{service}/test", response_model=IntegrationCredential)
async def test_credential(service: str, owner_id: str = Query(...)) -> dict:
    row = database.get_integration_credential(owner_id, service)
    if not row:
        raise HTTPException(status_code=404, detail="No credential saved for this integration yet")
    ok, detail = await run_in_threadpool(integrations.test_connection, service, row["credential"])
    status = "connected" if ok else ("unknown" if not integrations.CATALOG[service].test else "invalid")
    database.set_integration_status(owner_id, service, status, detail)
    return _to_credential(database.get_integration_credential(owner_id, service))  # type: ignore[arg-type]


@router.delete("/{service}", status_code=204)
async def delete_credential(service: str, owner_id: str = Query(...)) -> None:
    database.delete_integration_credential(owner_id, service)
