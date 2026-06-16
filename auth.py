from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from pydantic import BaseModel
from enum import Enum
import os
import jwt
import httpx

# --- Configuration (would be loaded from .env in a real app) ---
OIDC_DOMAIN = os.getenv("OIDC_DOMAIN") # e.g., "https://your-tenant.auth0.com/"
OIDC_API_AUDIENCE = os.getenv("OIDC_API_AUDIENCE") # e.g., "https://api.infinityproductos.com"
OIDC_ALGORITHMS = os.getenv("OIDC_ALGORITHMS", "RS256").split(',')

# --- Models ---

class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    AUDITOR = "auditor"
    VIEWER = "viewer"
    SALES = "sales"
    RISK = "risk"
    C_LEVEL = "c_level"

class CurrentUser(BaseModel):
    id: str
    role: UserRole

# --- JWT Handling ---

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl is not used in this flow but is required

jwks_client = None
if OIDC_DOMAIN:
    jwks_client = jwt.PyJWKClient(f"{OIDC_DOMAIN}.well-known/jwks.json")

def get_current_user_from_jwt(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    """
    Decodes and validates a JWT, returning a CurrentUser model.
    """
    if not jwks_client:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OIDC/JWT client not configured.")
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=OIDC_ALGORITHMS,
            audience=OIDC_API_AUDIENCE,
            issuer=OIDC_DOMAIN
        )
        # Assumes a custom claim for roles, e.g., "https://infinityproductos.com/roles": "admin"
        user_role_claim = payload.get("https://infinityproductos.com/roles", "")
        return CurrentUser(id=payload.get("sub"), role=UserRole(user_role_claim.lower()))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired.")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect token audience.")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Could not validate credentials: {e}")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials.")

# --- Coexistence Strategy ---

async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None)
) -> CurrentUser:
    """
    Coexistence dependency. Tries JWT first, then falls back to legacy headers.
    
    This function allows us to continue development using simple headers while
    being fully prepared for the production OIDC/JWT flow.
    """
    if authorization and authorization.lower().startswith("bearer "):
        # If the OIDC environment is configured, ONLY accept JWTs.
        if OIDC_DOMAIN:
            token = authorization.split(" ")[1]
            return get_current_user_from_jwt(token)
    
    # Fallback to headers ONLY if OIDC is not configured (for local development).
    if not OIDC_DOMAIN and x_user_id and x_user_role:
        try:
            return CurrentUser(id=x_user_id, role=UserRole(x_user_role.lower()))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid X-User-Role header value '{x_user_role}'.")
    
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated. Bearer token is required.")

# --- RBAC Dependencies ---

def require_admin(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action requires admin privileges.")
    return current_user

def require_admin_or_auditor(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role not in [UserRole.ADMIN, UserRole.AUDITOR]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action requires admin or auditor privileges.")
    return current_user

def require_designer_privileges(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role not in [UserRole.ADMIN, UserRole.OPERATOR]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action requires admin or operator privileges.")
    return current_user