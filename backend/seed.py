from sqlalchemy import select

from app import access, models, readings  # noqa: F401  (registers every table for create_all)
from app.access import assign_patient
from app.db import Base, SessionLocal, engine
from app.models import Role, User
from app.profiles import Profile, ProfileUpdate, save_profile
from app.security import hash_password

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
    ("Jacob Habte", "jacob.habte@example.com", Role.professional),
    ("Zakir Hasham", "zakir.hasham@example.com", Role.patient),
    ("Arica Ng", "arica.ng@example.com", Role.professional),
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


# MON-1 demo assignments (professional -> patients). Jacob Habte is left with none, to demo the empty roster.
ASSIGNMENTS = {
    "dr.lee@example.com": ["maya.chen@example.com", "daniel.okafor@example.com", "priya.raman@example.com"],
    "armaan.gandhara@example.com": ["lucas.bouchard@example.com", "hannah.weiss@example.com", "ethan.tremblay@example.com"],
    "arica.ng@example.com": ["zakir.hasham@example.com", "jenny.wang@example.com"],
}


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


if __name__ == "__main__":
    main()