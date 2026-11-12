import random
import uuid
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select

from app import access, appointments, models, readings, thresholds  # noqa: F401  (registers every table for create_all)
from app.access import assign_patient
from app.alerts import backfill_alerts, queue_alerts
from app.db import Base, SessionLocal, engine
from app.models import Role, User
from app.profiles import Profile, ProfileUpdate, save_profile
from app.readings import VITAL_LIMITS, Reading
from app.security import hash_password
from app.thresholds import ReadingEvaluation, assess_readings

DEMO_PASSWORD = "Demo-Pass-123"  # fake demo data only
USERS = [
    ("Maya Chen", "maya.chen@example.com", Role.patient),
    ("Daniel Okafor", "daniel.okafor@example.com", Role.patient),
    ("Priya Raman", "priya.raman@example.com", Role.patient),
    ("Lucas Bouchard", "lucas.bouchard@example.com", Role.patient),
    ("Hannah Weiss", "hannah.weiss@example.com", Role.patient),
    ("Dr. Lee", "dr.lee@example.com", Role.professional),
    ("Ethan Tremblay", "ethan.tremblay@example.com", Role.patient),
    ("Olivia Gagnon", "olivia.gagnon@example.com", Role.patient),
    ("Noah MacDonald", "noah.macdonald@example.com", Role.patient),
    # Group 19 team members
    ("Dr. Armaan Gandhara", "armaan.gandhara@example.com", Role.professional),  # head doctor
    ("Jacob Habte", "jacob.habte@example.com", Role.patient),
    ("Dr. Zakir Hasham", "zakir.hasham@example.com", Role.professional),
    ("Arica Ng", "arica.ng@example.com", Role.patient),
    ("Jenny Wang", "jenny.wang@example.com", Role.patient),
    # Joke demo users
    ("Fih", "fih@example.com", Role.patient),
    ("Cuh", "cuh@example.com", Role.patient),
    ("Tung Tung Tung Sahur", "tung.sahur@example.com", Role.patient),
    ("Goopy Grumstein", "goopy.grumstein@example.com", Role.patient),
    ("Professor Yustin Jao", "yustin.jao@example.com", Role.professional),
    ("504 Mountainbatin Avenue", "504.mountainbatin@example.com", Role.patient),
    ("Toaster Strudelman", "toaster.strudelman@example.com", Role.patient),
    ("Dr. Dingle Fritz", "dingle.fritz@example.com", Role.professional),
]


# MON-1 demo assignments (professional -> patients). Dr. Dingle Fritz is left with none, to demo the empty roster.
ASSIGNMENTS = {
    "dr.lee@example.com": ["maya.chen@example.com", "daniel.okafor@example.com", "priya.raman@example.com"],
    "armaan.gandhara@example.com": ["lucas.bouchard@example.com", "hannah.weiss@example.com", "ethan.tremblay@example.com"],
    "zakir.hasham@example.com": ["arica.ng@example.com", "jenny.wang@example.com"],
}

# TR_REP-1 / MON-2 demo history: about 30 days of morning and evening readings for these patients.
# Values are fictional. Each (day, vital, value) override is an out-of-range reading for ALT-2 flags to catch.
# Rows are marked source="demo_seed"; remove them with: DELETE FROM readings WHERE source = 'demo_seed';
DEMO_DAYS = 30
DEMO_READINGS = {
    # email: (baseline heart rate, systolic, diastolic, temperature, SpO2), overrides
    "maya.chen@example.com": ((72, 118, 76, 36.7, 98), [(5, "heart_rate", 118)]),
    "daniel.okafor@example.com": ((78, 132, 84, 36.8, 97), [(9, "systolic", 152), (9, "diastolic", 96)]),
    "priya.raman@example.com": ((68, 112, 72, 36.6, 98), [(3, "temperature", 38.6)]),
    "lucas.bouchard@example.com": ((75, 126, 82, 36.8, 97), [(12, "systolic", 148), (12, "diastolic", 95)]),
    "hannah.weiss@example.com": ((70, 110, 70, 36.5, 98), [(7, "spo2", 90)]),
    "ethan.tremblay@example.com": ((64, 120, 78, 36.7, 99), [(15, "heart_rate", 48)]),
    "arica.ng@example.com": ((74, 116, 74, 36.6, 98), []),
    "jenny.wang@example.com": ((71, 114, 73, 36.7, 98), [(20, "temperature", 38.2)]),
}


def demo_readings(patient_id, baseline, overrides, now):
    """Readings at about 8:00 and 20:00 UTC for the last DEMO_DAYS days, none in the future."""
    rng = random.Random(str(patient_id))  # same values every time for the same patient
    spread = {"heart_rate": 6, "systolic": 7, "diastolic": 5, "temperature": 0.3, "spo2": 1}
    special = {(day, vital): value for day, vital, value in overrides}
    rows = []
    for days_ago in range(DEMO_DAYS - 1, -1, -1):
        for hour in (8, 20):
            when = datetime.combine(now.date() - timedelta(days=days_ago), time(hour, rng.randrange(60)), timezone.utc)
            if when > now:
                continue
            submission_id = str(uuid.uuid4())
            for vital, base in zip(spread, baseline):
                value = special.get((days_ago, vital)) if hour == 8 else None
                if value is None:
                    value = base + rng.uniform(-1, 1) * spread[vital]
                limits = VITAL_LIMITS[vital]
                value = min(max(value, limits["min"]), limits["max"])
                value = round(value, 1) if vital == "temperature" else round(value)
                if vital == "spo2":
                    value = min(value, 100)
                rows.append(Reading(
                    patient_id=patient_id, vital_type=vital, value=float(value), unit=limits["unit"],
                    recorded_at=when, submission_id=submission_id, source="demo_seed",
                ))
    return rows


def profile(legal, preferred, dob, sex, street, city, province, postal, phone, contact=None, contact_phone=None):
    return {
        "legal_name": legal, "preferred_name": preferred, "date_of_birth": dob, "sex": sex,
        "gender": "Man" if sex == "male" else "Woman", "address_line1": street, "city": city,
        "province": province, "postal_code": postal, "phone": phone,
        "emergency_contact_name": contact, "emergency_contact_phone": contact_phone,
    }


# Fictional demo details: made-up streets and 555-01xx phone numbers.
PROFILES = {
    "maya.chen@example.com": profile("Maya Chen", "Maya", "1994-03-12", "female", "48 Willowbrook Cres", "Waterloo", "ON", "N2L 4K1", "519-555-0101", "Wei Chen", "519-555-0151"),
    "daniel.okafor@example.com": profile("Daniel Chukwuemeka Okafor", "Daniel", "1988-07-24", "male", "215 Birchmount Ave", "Kitchener", "ON", "N2H 3R7", "519-555-0102", "Ada Okafor", "519-555-0152"),
    "priya.raman@example.com": profile("Priya Lakshmi Raman", "Priya", "1991-11-02", "female", "9 Cedar Hollow Dr", "Cambridge", "ON", "N1R 6T2", "519-555-0103", "Arun Raman", "519-555-0153"),
    "lucas.bouchard@example.com": profile("Lucas Antoine Bouchard", "Lucas", "1985-01-30", "male", "1120 Rue des Érables", "Montréal", "QC", "H2X 1Y4", "514-555-0104", "Camille Bouchard", "514-555-0154"),
    "hannah.weiss@example.com": profile("Hannah Ruth Weiss", "Hannah", "1999-09-15", "female", "77 Lakeshore Pine Rd", "Guelph", "ON", "N1E 2W8", "519-555-0105", "Miriam Weiss", "519-555-0155"),
    "dr.lee@example.com": profile("Hanna Lee", "Dr. Lee", "1979-04-08", "female", "300 Highland Ridge Rd", "Waterloo", "ON", "N2T 1B6", "519-555-0106", "Daniel Lee", "519-555-0156"),
    "ethan.tremblay@example.com": profile("Ethan Jacques Tremblay", "Ethan", "1996-06-21", "male", "62 Spruce Meadow Way", "Ottawa", "ON", "K1S 2C3", "613-555-0107", "Marie Tremblay", "613-555-0157"),
    "olivia.gagnon@example.com": profile("Olivia Claire Gagnon", "Olivia", "2001-02-14", "female", "18 Rue du Moulin", "Québec", "QC", "G1R 3P5", "418-555-0108", "Luc Gagnon", "418-555-0158"),
    "noah.macdonald@example.com": profile("Noah Alexander MacDonald", "Noah", "1993-10-05", "male", "5 Harbourview Lane", "Halifax", "NS", "B3H 2Y9", "902-555-0109", "Fiona MacDonald", "902-555-0159"),
    "armaan.gandhara@example.com": profile("Armaan Gandhara", "Armaan", "2004-08-19", "male", "140 Columbia Grove", "Waterloo", "ON", "N2L 3E9", "519-555-0110", "Gandhara Family", "519-555-0160"),
    "jacob.habte@example.com": profile("Jacob Habte", "Jacob", "2004-12-03", "male", "26 Orchard Park Dr", "Waterloo", "ON", "N2J 2K8", "519-555-0111", "Habte Family", "519-555-0161"),
    "zakir.hasham@example.com": profile("Zakir Hasham", "Zakir", "2005-01-27", "male", "310 Silver Birch Rd", "Kitchener", "ON", "N2M 4B3", "519-555-0112", "Hasham Family", "519-555-0162"),
    "arica.ng@example.com": profile("Arica Ng", "Arica", "2005-04-11", "female", "71 Larkspur Crt", "Waterloo", "ON", "N2K 3V6", "519-555-0113", "Ng Family", "519-555-0163"),
    "jenny.wang@example.com": profile("Jenny Wang", "Jenny", "2004-10-30", "female", "88 Bluebell Terrace", "Toronto", "ON", "M5V 2T6", "416-555-0114", "Wang Family", "416-555-0164"),
    "fih@example.com": profile("Fih Fishington", "Fih", "2003-06-06", "male", "1 Coral Reef Way", "Victoria", "BC", "V8W 1N4", "250-555-0115", "Big Fih", "250-555-0165"),
    "cuh@example.com": profile("Cuh Cuzzington", "Cuh", "2002-02-02", "male", "67 Sixseven St", "Mississauga", "ON", "L5B 2C9", "905-555-0116", "Lil Cuh", "905-555-0166"),
    "tung.sahur@example.com": profile("Tung Tung Tung Sahur", "Tung", "1999-03-30", "male", "3 Kentongan Blvd", "Calgary", "AB", "T2P 1J9", "403-555-0117", "Sahur Sr.", "403-555-0167"),
    "goopy.grumstein@example.com": profile("Goopy Grumstein", "Goopy", "1987-08-08", "male", "88 Gloop Lane", "Winnipeg", "MB", "R3C 0V8", "204-555-0118", "Gloria Grumstein", "204-555-0168"),
    "yustin.jao@example.com": profile("Yustin Jao", "Professor Jao", "1975-05-05", "male", "12 Lecture Hall Rd", "Waterloo", "ON", "N2L 6R5", "519-555-0119", "Lin Jao", "519-555-0169"),
    "504.mountainbatin@example.com": profile("504 Mountainbatin Avenue", "504", "1998-05-04", "female", "504 Mountainbatin Ave", "Hamilton", "ON", "L8P 4R5", "905-555-0120", "503 Mountainbatin Avenue", "905-555-0170"),
    "toaster.strudelman@example.com": profile("Toaster Strudelman", "Toaster", "1990-09-09", "male", "2 Breakfast Nook Cres", "Saskatoon", "SK", "S7K 1J5", "306-555-0121", "Pop Tartson", "306-555-0171"),
    "dingle.fritz@example.com": profile("Dingle Fritz", "Dr. Fritz", "1968-12-12", "male", "45 Fritzwood Dr", "Edmonton", "AB", "T5J 0N3", "780-555-0122", "Dangle Fritz", "780-555-0172"),
}


def main():
    Base.metadata.create_all(engine)  # creates the users, readings, profiles and patient_assignments tables if missing
    with SessionLocal() as db:
        for name, email, role in USERS:
            if db.scalar(select(User).where(User.email == email)):
                print("exists:", email)
                continue
            db.add(User(full_name=name, email=email, role=role, password_hash=hash_password(DEMO_PASSWORD)))
            print("added:", email)
        db.commit()

        for email, fields in PROFILES.items():
            user = db.scalar(select(User).where(User.email == email))
            if user is None or db.get(Profile, user.id):
                continue
            save_profile(db, user.id, ProfileUpdate(**fields))  # same validation as the API
            print("profile added:", email)

        for pro_email, patient_emails in ASSIGNMENTS.items():
            pro = db.scalar(select(User).where(User.email == pro_email))
            for patient_email in patient_emails:
                patient = db.scalar(select(User).where(User.email == patient_email))
                assign_patient(db, pro.id, patient.id)  # skips pairs that already exist
                print("assigned:", patient_email, "->", pro_email)

        now = datetime.now(timezone.utc)
        for email, (baseline, overrides) in DEMO_READINGS.items():
            patient = db.scalar(select(User).where(User.email == email))
            if patient is None:
                continue
            has_demo_history = db.scalar(
                select(Reading.id).where(Reading.patient_id == patient.id, Reading.source == "demo_seed").limit(1)
            )
            if has_demo_history:
                # Deliberate demo-only backfill for databases seeded before ALT-2.
                # Evaluated rows, including normal ones, are never reclassified.
                rows = list(db.scalars(
                    select(Reading)
                    .outerjoin(ReadingEvaluation, ReadingEvaluation.reading_id == Reading.id)
                    .where(
                        Reading.patient_id == patient.id,
                        Reading.source == "demo_seed",
                        ReadingEvaluation.reading_id.is_(None),
                    )
                ))
            else:
                rows = demo_readings(patient.id, baseline, overrides, now)
            if rows:
                try:
                    if not has_demo_history:
                        db.add_all(rows)
                        db.flush()
                    evaluations = assess_readings(db, rows)
                    queue_alerts(db, rows, evaluations)
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
                print(f"demo readings evaluated: {email} ({len(rows)} values)")

        # Existing saved flags predate ALT-1. Give current demo assignees one
        # review record per flag; uniqueness makes repeat seeding safe.
        try:
            added = backfill_alerts(db)
            db.commit()
        except Exception:
            db.rollback()
            raise
        print(f"existing flags given alerts: {added}")


if __name__ == "__main__":
    main()
