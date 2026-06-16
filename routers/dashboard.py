from fastapi import APIRouter, status

router = APIRouter(
    prefix="/api/v1/dashboard",
    tags=["Dashboard"]
)

@router.get("/", status_code=status.HTTP_200_OK, summary="Get Dashboard Summary")
def get_dashboard_summary():
    """
    Returns a simple state check for the dashboard module.
    """
    return {"status": "Dashboard subsystem active"}
