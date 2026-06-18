from database import SessionLocal
from models import SymbolicFormulaAsset
db = SessionLocal()
try:
    formulas = db.query(SymbolicFormulaAsset).all()
    print("Success:", formulas)
except Exception as e:
    import traceback
    traceback.print_exc()
