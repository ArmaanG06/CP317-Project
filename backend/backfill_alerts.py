r"""Create recipient alerts for already evaluated flags (safe to rerun).

Run from backend/: .venv\Scripts\python.exe backfill_alerts.py
"""

from app import access, alerts, models, readings, thresholds  # noqa: F401 (register models)
from app.alerts import backfill_alerts
from app.db import Base, SessionLocal, engine


def main():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        try:
            added = backfill_alerts(db)
            db.commit()
        except Exception:
            db.rollback()
            raise
    print(f"Alerts created for existing flags: {added}")


if __name__ == "__main__":
    main()
