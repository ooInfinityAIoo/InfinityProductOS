from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
import datetime

from database import get_db
import models
import schemas
from sqlalchemy import or_

router = APIRouter(
    prefix="/api/v1/masters",
    tags=["Common Core Masters"]
)

@router.get("/search", response_model=schemas.MastersSearchResults, summary="Search Across All Masters")
def search_masters(q: str, skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    """
    Performs a paginated, case-insensitive search across all common core master data entities.
    The search will look for matches in names, codes, and descriptions.
    """
    search_term = f"%{q}%"
    
    currencies = db.query(models.CurrencyMaster).filter(or_(models.CurrencyMaster.currency_code.ilike(search_term), models.CurrencyMaster.currency_name.ilike(search_term))).offset(skip).limit(limit).all()
    calendars = db.query(models.OperationalCalendar).filter(or_(models.OperationalCalendar.calendar_type.ilike(search_term), models.OperationalCalendar.calendar_description.ilike(search_term))).offset(skip).limit(limit).all()
    accounts = db.query(models.AccountProfile).filter(or_(models.AccountProfile.account_number.ilike(search_term), models.AccountProfile.account_name_title.ilike(search_term))).offset(skip).limit(limit).all()
    countries = db.query(models.CountryJurisdiction).filter(or_(models.CountryJurisdiction.country_iso_code.ilike(search_term), models.CountryJurisdiction.country_name_text.ilike(search_term))).offset(skip).limit(limit).all()
    fees = db.query(models.FeeConfiguration).filter(or_(models.FeeConfiguration.fee_charge_code.ilike(search_term), models.FeeConfiguration.fee_type_name.ilike(search_term))).offset(skip).limit(limit).all()

    return {
        "currencies": currencies,
        "calendars": calendars,
        "accounts": accounts,
        "countries": countries,
        "fees": fees
    }

@router.get("/stats", response_model=schemas.MastersCountResponse, summary="Get Record Counts for All Masters")
def get_masters_counts(db: Session = Depends(get_db)):
    """
    Retrieves the total count of records for each common core master data entity.
    """
    currency_count = db.query(models.CurrencyMaster).count()
    calendar_count = db.query(models.OperationalCalendar).count()
    account_count = db.query(models.AccountProfile).count()
    country_count = db.query(models.CountryJurisdiction).count()
    fee_count = db.query(models.FeeConfiguration).count()

    return {
        "currencies": currency_count,
        "calendars": calendar_count,
        "accounts": account_count,
        "countries": country_count,
        "fees": fee_count,
    }

# --- Currency Master ---

@router.post("/currencies", response_model=schemas.CurrencyDefinitionResponse, status_code=status.HTTP_201_CREATED, summary="Create a Currency")
def create_currency(payload: schemas.CurrencyDefinitionCreate, db: Session = Depends(get_db)):
    db_currency = models.CurrencyMaster(**payload.dict(), created_at=datetime.datetime.utcnow().isoformat())
    db.add(db_currency)
    db.commit()
    db.refresh(db_currency)
    return db_currency

@router.get("/currencies", response_model=schemas.CurrencyDefinitionListResponse, summary="List Currencies")
def list_currencies(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    currencies = db.query(models.CurrencyMaster).offset(skip).limit(limit).all()
    return {"currencies": currencies}

@router.get("/currencies/{currency_code}", response_model=schemas.CurrencyDefinitionResponse, summary="Get a Currency")
def get_currency(currency_code: str, db: Session = Depends(get_db)):
    currency = db.query(models.CurrencyMaster).filter(models.CurrencyMaster.currency_code == currency_code.upper()).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    return currency

@router.put("/currencies/{currency_code}", response_model=schemas.CurrencyDefinitionResponse, summary="Update a Currency")
def update_currency(currency_code: str, payload: schemas.CurrencyDefinitionCreate, db: Session = Depends(get_db)):
    db_currency = db.query(models.CurrencyMaster).filter(models.CurrencyMaster.currency_code == currency_code.upper()).first()
    if not db_currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    for key, value in payload.dict().items():
        setattr(db_currency, key, value)
        
    db.commit()
    db.refresh(db_currency)
    return db_currency

@router.delete("/currencies/{currency_code}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Currency")
def delete_currency(currency_code: str, db: Session = Depends(get_db)):
    currency = db.query(models.CurrencyMaster).filter(models.CurrencyMaster.currency_code == currency_code.upper()).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    db.delete(currency)
    db.commit()
    return

# --- Operational Calendar ---

@router.post("/calendars", response_model=schemas.OperationalCalendarResponse, status_code=status.HTTP_201_CREATED, summary="Create a Calendar")
def create_calendar(payload: schemas.OperationalCalendarCreate, db: Session = Depends(get_db)):
    calendar_id = f"CAL-{uuid.uuid4().hex[:8].upper()}"
    db_calendar = models.OperationalCalendar(**payload.dict(), calendar_id=calendar_id, created_at=datetime.datetime.utcnow().isoformat())
    db.add(db_calendar)
    db.commit()
    db.refresh(db_calendar)
    return db_calendar

@router.get("/calendars", response_model=schemas.OperationalCalendarListResponse, summary="List Calendars")
def list_calendars(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    calendars = db.query(models.OperationalCalendar).offset(skip).limit(limit).all()
    return {"calendars": calendars}

@router.get("/calendars/{calendar_id}", response_model=schemas.OperationalCalendarResponse, summary="Get a Calendar")
def get_calendar(calendar_id: str, db: Session = Depends(get_db)):
    calendar = db.query(models.OperationalCalendar).filter(models.OperationalCalendar.calendar_id == calendar_id).first()
    if not calendar:
        raise HTTPException(status_code=404, detail="Calendar not found")
    return calendar

@router.put("/calendars/{calendar_id}", response_model=schemas.OperationalCalendarResponse, summary="Update a Calendar")
def update_calendar(calendar_id: str, payload: schemas.OperationalCalendarCreate, db: Session = Depends(get_db)):
    db_calendar = db.query(models.OperationalCalendar).filter(models.OperationalCalendar.calendar_id == calendar_id).first()
    if not db_calendar:
        raise HTTPException(status_code=404, detail="Calendar not found")

    for key, value in payload.dict().items():
        setattr(db_calendar, key, value)

    db.commit()
    db.refresh(db_calendar)
    return db_calendar

@router.delete("/calendars/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Calendar")
def delete_calendar(calendar_id: str, db: Session = Depends(get_db)):
    calendar = db.query(models.OperationalCalendar).filter(models.OperationalCalendar.calendar_id == calendar_id).first()
    if not calendar:
        raise HTTPException(status_code=404, detail="Calendar not found")
    db.delete(calendar)
    db.commit()
    return

# --- Account Profile ---

@router.post("/accounts", response_model=schemas.AccountProfileResponse, status_code=status.HTTP_201_CREATED, summary="Create an Account Profile")
def create_account_profile(payload: schemas.AccountProfileCreate, db: Session = Depends(get_db)):
    db_account = models.AccountProfile(**payload.dict(), created_at=datetime.datetime.utcnow().isoformat())
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

@router.get("/accounts", response_model=schemas.AccountProfileListResponse, summary="List Account Profiles")
def list_account_profiles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    accounts = db.query(models.AccountProfile).offset(skip).limit(limit).all()
    return {"accounts": accounts}

@router.get("/accounts/{account_number}", response_model=schemas.AccountProfileResponse, summary="Get an Account Profile")
def get_account_profile(account_number: str, db: Session = Depends(get_db)):
    account = db.query(models.AccountProfile).filter(models.AccountProfile.account_number == account_number).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account profile not found")
    return account

@router.put("/accounts/{account_number}", response_model=schemas.AccountProfileResponse, summary="Update an Account Profile")
def update_account_profile(account_number: str, payload: schemas.AccountProfileCreate, db: Session = Depends(get_db)):
    db_account = db.query(models.AccountProfile).filter(models.AccountProfile.account_number == account_number).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account profile not found")

    for key, value in payload.dict().items():
        setattr(db_account, key, value)

    db.commit()
    db.refresh(db_account)
    return db_account

@router.delete("/accounts/{account_number}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an Account Profile")
def delete_account_profile(account_number: str, db: Session = Depends(get_db)):
    account = db.query(models.AccountProfile).filter(models.AccountProfile.account_number == account_number).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account profile not found")
    db.delete(account)
    db.commit()
    return

# --- Country Jurisdiction ---

@router.post("/countries", response_model=schemas.CountryJurisdictionResponse, status_code=status.HTTP_201_CREATED, summary="Create a Country Jurisdiction")
def create_country(payload: schemas.CountryJurisdictionCreate, db: Session = Depends(get_db)):
    db_country = models.CountryJurisdiction(**payload.dict(), created_at=datetime.datetime.utcnow().isoformat())
    db.add(db_country)
    db.commit()
    db.refresh(db_country)
    return db_country

@router.get("/countries", response_model=schemas.CountryJurisdictionListResponse, summary="List Country Jurisdictions")
def list_countries(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    countries = db.query(models.CountryJurisdiction).offset(skip).limit(limit).all()
    return {"countries": countries}

@router.get("/countries/{country_iso_code}", response_model=schemas.CountryJurisdictionResponse, summary="Get a Country Jurisdiction")
def get_country(country_iso_code: str, db: Session = Depends(get_db)):
    country = db.query(models.CountryJurisdiction).filter(models.CountryJurisdiction.country_iso_code == country_iso_code.upper()).first()
    if not country:
        raise HTTPException(status_code=404, detail="Country jurisdiction not found")
    return country

@router.put("/countries/{country_iso_code}", response_model=schemas.CountryJurisdictionResponse, summary="Update a Country Jurisdiction")
def update_country(country_iso_code: str, payload: schemas.CountryJurisdictionCreate, db: Session = Depends(get_db)):
    db_country = db.query(models.CountryJurisdiction).filter(models.CountryJurisdiction.country_iso_code == country_iso_code.upper()).first()
    if not db_country:
        raise HTTPException(status_code=404, detail="Country jurisdiction not found")

    for key, value in payload.dict().items():
        setattr(db_country, key, value)

    db.commit()
    db.refresh(db_country)
    return db_country

@router.delete("/countries/{country_iso_code}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Country Jurisdiction")
def delete_country(country_iso_code: str, db: Session = Depends(get_db)):
    country = db.query(models.CountryJurisdiction).filter(models.CountryJurisdiction.country_iso_code == country_iso_code.upper()).first()
    if not country:
        raise HTTPException(status_code=404, detail="Country jurisdiction not found")
    db.delete(country)
    db.commit()
    return

# --- Fee Configuration ---

@router.post("/fees", response_model=schemas.FeeConfigurationResponse, status_code=status.HTTP_201_CREATED, summary="Create a Fee Configuration")
def create_fee(payload: schemas.FeeConfigurationCreate, db: Session = Depends(get_db)):
    db_fee = models.FeeConfiguration(**payload.dict(), created_at=datetime.datetime.utcnow().isoformat())
    db.add(db_fee)
    db.commit()
    db.refresh(db_fee)
    return db_fee

@router.get("/fees", response_model=schemas.FeeConfigurationListResponse, summary="List Fee Configurations")
def list_fees(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    fees = db.query(models.FeeConfiguration).offset(skip).limit(limit).all()
    return {"fees": fees}

@router.get("/fees/{fee_charge_code}", response_model=schemas.FeeConfigurationResponse, summary="Get a Fee Configuration")
def get_fee(fee_charge_code: str, db: Session = Depends(get_db)):
    fee = db.query(models.FeeConfiguration).filter(models.FeeConfiguration.fee_charge_code == fee_charge_code).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee configuration not found")
    return fee

@router.put("/fees/{fee_charge_code}", response_model=schemas.FeeConfigurationResponse, summary="Update a Fee Configuration")
def update_fee(fee_charge_code: str, payload: schemas.FeeConfigurationCreate, db: Session = Depends(get_db)):
    db_fee = db.query(models.FeeConfiguration).filter(models.FeeConfiguration.fee_charge_code == fee_charge_code).first()
    if not db_fee:
        raise HTTPException(status_code=404, detail="Fee configuration not found")

    for key, value in payload.dict().items():
        setattr(db_fee, key, value)

    db.commit()
    db.refresh(db_fee)
    return db_fee

@router.delete("/fees/{fee_charge_code}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Fee Configuration")
def delete_fee(fee_charge_code: str, db: Session = Depends(get_db)):
    fee = db.query(models.FeeConfiguration).filter(models.FeeConfiguration.fee_charge_code == fee_charge_code).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee configuration not found")
    db.delete(fee)
    db.commit()
    return

# --- Product and Subproduct Masters for Screen Designer ---

@router.get("/products", response_model=schemas.ProductMasterListResponse, summary="List All Products")
def list_products(db: Session = Depends(get_db)):
    """Retrieves a list of all products for context selection."""
    products = db.query(models.ProductMaster).order_by(models.ProductMaster.product_name).all()
    return {"products": products}

@router.get("/subproducts", response_model=schemas.SubproductMasterListResponse, summary="List Subproducts for a Product")
def list_subproducts(product_id: str, db: Session = Depends(get_db)):
    """Retrieves a list of subproducts filtered by a specific product_id."""
    subproducts = db.query(models.SubproductMaster).filter(
        models.SubproductMaster.product_id == product_id
    ).order_by(models.SubproductMaster.subproduct_name).all()
    return {"subproducts": subproducts}

# --- Product and Subproduct Masters for Screen Designer ---

@router.get("/products", response_model=schemas.ProductMasterListResponse, summary="List All Products")
def list_products(db: Session = Depends(get_db)):
    """Retrieves a list of all products for context selection."""
    products = db.query(models.ProductMaster).order_by(models.ProductMaster.product_name).all()
    return {"products": products}

@router.get("/subproducts", response_model=schemas.SubproductMasterListResponse, summary="List Subproducts for a Product")
def list_subproducts(product_id: str, db: Session = Depends(get_db)):
    """Retrieves a list of subproducts filtered by a specific product_id."""
    subproducts = db.query(models.SubproductMaster).filter(
        models.SubproductMaster.product_id == product_id
    ).order_by(models.SubproductMaster.subproduct_name).all()
    return {"subproducts": subproducts}

```