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
    # Additional demo patients
    ("Ethan Tremblay", "ethan.tremblay@example.com", Role.patient),
    ("Olivia Gagnon", "olivia.gagnon@example.com", Role.patient),
    ("Noah MacDonald", "noah.macdonald@example.com", Role.patient),
    # Joke demo users
    ("Fih", "fih@example.com", Role.patient),
    ("Cuh", "cuh@example.com", Role.patient),
    ("Tung Tung Tung Sahur", "tung.sahur@example.com", Role.patient),
    ("Goopy Grumstein", "goopy.grumstein@example.com", Role.patient),
    ("Professor Yustin Jao", "yustin.jao@example.com", Role.professional),
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