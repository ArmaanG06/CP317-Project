from sqlalchemy import select

from app import access, models, readings  # noqa: F401  (imports register every table for create_all)
from app.access import assign_patient
from app.db import Base, SessionLocal, engine
from app.models import Role, User
from app.security import hash_password

DEMO_PASSWORD = "Demo-Pass-123"  # fake demo data only
USERS = [
    ("Maya Chen", "maya.chen@example.com", Role.patient),
    ("Daniel Okafor", "daniel.okafor@example.com", Role.patient),
    ("Priya Raman", "priya.raman@example.com", Role.patient),
    ("Lucas Bouchard", "lucas.bouchard@example.com", Role.patient),
    ("Hannah Weiss", "hannah.weiss@example.com", Role.patient),
    ("Dr. Lee", "dr.lee@example.com", Role.professional),
]
# MON-1 demo: Dr. Lee monitors these patients (the others stay unassigned).
ASSIGNMENTS = [
    ("dr.lee@example.com", "maya.chen@example.com"),
    ("dr.lee@example.com", "daniel.okafor@example.com"),
]


def main():
    Base.metadata.create_all(engine)  # creates any missing tables
    with SessionLocal() as db:
        for name, email, role in USERS:
            if db.scalar(select(User).where(User.email == email)):
                print("exists:", email)
                continue
            db.add(User(full_name=name, email=email, role=role, password_hash=hash_password(DEMO_PASSWORD)))
            print("added:", email)
        db.commit()

        for professional_email, patient_email in ASSIGNMENTS:
            professional = db.scalar(select(User).where(User.email == professional_email))
            patient = db.scalar(select(User).where(User.email == patient_email))
            assign_patient(db, professional.id, patient.id)
            print("assigned:", patient_email, "->", professional_email)


if __name__ == "__main__":
    main()