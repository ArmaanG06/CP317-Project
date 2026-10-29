from sqlalchemy import select

from app import models
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
    # Group 19 team members
    ("Dr. Armaan Gandhara", "armaan.gandhara@example.com", Role.professional),  # head doctor
    ("Jacob Habte", "jacob.habte@example.com", Role.professional),
    ("Zakir Hasham", "zakir.hasham@example.com", Role.patient),
    ("Arica Ng", "arica.ng@example.com", Role.professional),
    ("Jenny Wang", "jenny.wang@example.com", Role.patient),
    # Generated demo users (fictional names)
    ("Sofia Marquez", "sofia.marquez@example.com", Role.patient),
    ("Ethan Kowalski", "ethan.kowalski@example.com", Role.patient),
    ("Amara Nwosu", "amara.nwosu@example.com", Role.patient),
    ("Liam O'Connell", "liam.oconnell@example.com", Role.patient),
    ("Yuki Tanaka", "yuki.tanaka@example.com", Role.patient),
    ("Omar Haddad", "omar.haddad@example.com", Role.patient),
    ("Chloe Tremblay", "chloe.tremblay@example.com", Role.patient),
    ("Ravi Patel", "ravi.patel@example.com", Role.patient),
    ("Isabella Rossi", "isabella.rossi@example.com", Role.patient),
    ("Noah Fischer", "noah.fischer@example.com", Role.patient),
    ("Fatima Al-Sayed", "fatima.alsayed@example.com", Role.patient),
    ("Dr. Samuel Mensah", "samuel.mensah@example.com", Role.professional),
    ("Dr. Elena Petrova", "elena.petrova@example.com", Role.professional),
    ("Dr. Marcus Reid", "marcus.reid@example.com", Role.professional),
    ("Dr. Aisha Khan", "aisha.khan@example.com", Role.professional),
]


def main():
    Base.metadata.create_all(engine)  # creates the users table if missing
    with SessionLocal() as db:
        for name, email, role in USERS:
            if db.scalar(select(User).where(User.email == email)):
                print("exists:", email)
                continue
            db.add(User(full_name=name, email=email, role=role, password_hash=hash_password(DEMO_PASSWORD)))
            print("added:", email)
        db.commit()


if __name__ == "__main__":
    main()