# CP317 Group 19: Health Monitoring System

**Authors:** Zakir Hasham, Armaan Gandhara, Jacob Habte, Arica Ng, Jenny Wang\
**Stack:** React.js (Front-End), FastAPI, Python, Supabase (SQL Backend)

## Structure
- `backend/`: FastAPI API and database code
- `frontend/`: React UI

## Features

### Vital sign readings (Armaan Gandhara: DATA-1-T2, DATA-1-T3, UI-1-T1)
Patients submit vital signs and view their most recent values. Code lives in `backend/app/readings.py`, tests in `backend/tests/test_readings.py`.

| Endpoint | Description |
|---|---|
| `POST /readings` | Validate and save a submission (201, returns saved rows) |
| `GET /readings/latest` | Newest value for each vital; vitals with no data return `available: false` and "No reading available" |
| `GET /health` | Health check |

**Supported vitals and accepted input ranges** (input validation only, not alert thresholds):

| Vital | Unit | Range | Format |
|---|---|---|---|
| `heart_rate` | bpm | 20–250 | whole number |
| `systolic` | mmHg | 50–250 | whole number |
| `diastolic` | mmHg | 30–150 | whole number |
| `temperature` | °C | 30.0–45.0 | up to 1 decimal |
| `spo2` | % | 50–100 | whole number |

**Validation rules:** at least one vital is required; systolic and diastolic must be entered together, with systolic greater than diastolic; text, booleans, NaN/infinity and unknown fields are rejected.

**Error format:** invalid submissions return 422 and nothing is saved:
```json
{"errors": [{"field": "heart_rate", "message": "Heart rate must be between 20 and 250 bpm."}]}
```
`field` is `null` for form-level errors (e.g. "Enter at least one vital sign.").

**Notes for teammates**
- **Auth:** both endpoints require a signed-in user (session cookie from `POST /auth/login`; 401 otherwise). The patient ID always comes from the logged-in user, never the request, and professionals get 403.
- **Database:** the `readings` table stores one row per vital value (blood pressure is two rows linked by `submission_id`), with UTC `recorded_at` and an index on `(patient_id, vital_type, recorded_at)`. `patient_id` is a UUID foreign key to `users.id`. Tables are created on startup by `create_all`, which can be replaced with migrations.

## Running locally
Setup instructions coming as the project is built.

### Backend
From `backend/`:
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # Windows: copy .env.example .env, then fill in DATABASE_URL and JWT_SECRET
python seed.py                  # optional: add demo users (password Demo-Pass-123)
uvicorn app.main:app --reload   # API at http://127.0.0.1:8000, docs at http://127.0.0.1:8000/docs
pytest -q                       # run tests
```
`tests/test_auth.py` uses the real database and the seeded demo users, so it needs a filled-in `.env` and `python seed.py`. The readings tests use an in-memory database and run without one.
