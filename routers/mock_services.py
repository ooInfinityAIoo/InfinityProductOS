from fastapi import APIRouter, Path

router = APIRouter(
    prefix="/mock/core-banking",
    tags=["Mock External Services"],
    # This makes it clear in the docs that this is not a core service
    include_in_schema=False 
)

@router.get("/accounts/{account_id}/balance")
def get_mock_account_balance(account_id: str = Path(..., description="The account ID to look up.")):
    """
    A mock endpoint simulating a core banking system API to fetch an account balance.
    """
    # In a real mock, you might have some logic here. For now, return a static response.
    return {
        "account_id": account_id,
        "balance": 12345.67,
        "currency": "USD",
        "status": "ACTIVE",
        "last_transaction_date": "2026-06-12T14:30:00Z"
    }