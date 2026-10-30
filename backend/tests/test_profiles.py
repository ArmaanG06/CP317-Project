import pytest

VALID = {
    "legal_name": "Patient One",
    "preferred_name": "Pat",
    "date_of_birth": "1990-05-17",
    "sex": "female",
    "gender": "Woman",
    "address_line1": "12 Maple Grove Rd",
    "city": "Waterloo",
    "province": "on",
    "postal_code": "n2l3c5",
    "phone": "519.555.0123",
    "emergency_contact_name": "Sam One",
    "emergency_contact_phone": "+1 519 555 0199",
}


def errors(response):
    assert response.status_code == 422
    return {e["field"]: e["message"] for e in response.json()["errors"]}


# --- Read ---
def test_profile_empty_before_first_save(patient1_client):
    r = patient1_client.get("/profile")
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "p1@example.com"
    assert body["role"] == "patient"
    assert body["legal_name"] is None and body["updated_at"] is None


# --- Save ---
def test_save_profile_normalizes_values(patient1_client):
    r = patient1_client.put("/profile", json=VALID)
    assert r.status_code == 200
    body = r.json()
    assert body["province"] == "ON"
    assert body["postal_code"] == "N2L 3C5"
    assert body["phone"] == "(519) 555-0123"
    assert body["emergency_contact_phone"] == "(519) 555-0199"
    assert body["updated_at"] is not None
    assert patient1_client.get("/profile").json()["legal_name"] == "Patient One"


def test_update_replaces_previous_values(patient1_client):
    patient1_client.put("/profile", json=VALID)
    r = patient1_client.put("/profile", json={**VALID, "preferred_name": "", "city": "Kitchener"})
    assert r.json()["preferred_name"] is None
    assert r.json()["city"] == "Kitchener"


def test_professional_can_save_profile(professional_client):
    r = professional_client.put("/profile", json=VALID)
    assert r.status_code == 200
    assert r.json()["role"] == "professional"


# --- Validation ---
def test_empty_profile_lists_every_required_field(patient1_client):
    found = errors(patient1_client.put("/profile", json={}))
    assert found == {
        "legal_name": "Enter your full legal name.",
        "date_of_birth": "Enter your date of birth.",
        "sex": "Choose your sex.",
        "address_line1": "Enter your street address.",
        "city": "Enter your city.",
        "province": "Choose your province or territory.",
        "postal_code": "Enter your postal code.",
        "phone": "Enter your phone number.",
    }


@pytest.mark.parametrize(
    "field,value,message",
    [
        ("legal_name", "   ", "Enter your full legal name."),
        ("legal_name", "x" * 121, "Use 120 characters or fewer."),
        ("date_of_birth", "2999-01-01", "Date of birth can't be in the future."),
        ("date_of_birth", "1850-01-01", "Enter a date of birth after 1900."),
        ("date_of_birth", "17/05/1990", "Enter your date of birth as YYYY-MM-DD."),
        ("date_of_birth", 642902400, "Enter text for this field."),
        ("sex", "unknown", "Choose female, male or intersex."),
        ("province", "XX", "Choose a Canadian province or territory."),
        ("postal_code", "12345", "Enter a Canadian postal code, like N2L 3C5."),
        ("phone", "555-0123", "Phone number must be a 10-digit phone number, like 519-555-0123."),
    ],
)
def test_invalid_field_rejected(patient1_client, field, value, message):
    assert errors(patient1_client.put("/profile", json={**VALID, field: value})) == {field: message}


def test_emergency_contact_needs_name_and_phone(patient1_client):
    found = errors(patient1_client.put("/profile", json={**VALID, "emergency_contact_phone": ""}))
    assert found == {None: "Enter both a name and a phone number for your emergency contact, or leave both blank."}


def test_unknown_field_rejected(patient1_client):
    assert errors(patient1_client.put("/profile", json={**VALID, "role": "professional"})) == {
        "role": "Unknown field: role."
    }


def test_invalid_profile_saves_nothing(patient1_client):
    patient1_client.put("/profile", json={**VALID, "postal_code": "bad"})
    assert patient1_client.get("/profile").json()["legal_name"] is None


# --- Access ---
def test_patients_only_see_their_own_profile(patient1_client, patient2_client):
    patient1_client.put("/profile", json=VALID)
    body = patient2_client.get("/profile").json()
    assert body["email"] == "p2@example.com"
    assert body["legal_name"] is None
