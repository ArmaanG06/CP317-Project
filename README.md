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

### User profiles (Armaan Gandhara)
Patients and professionals view and update their own personal details on the **My profile** page (`/profile`). Code lives in `backend/app/profiles.py` and `frontend/src/pages/Profile.jsx`, tests in `backend/tests/test_profiles.py`.

| Endpoint | Description |
|---|---|
| `GET /profile` | The signed-in user's profile (fields are `null` until first saved) |
| `PUT /profile` | Create or replace the signed-in user's profile |

Stored in the `profiles` table (one row per user, keyed by `users.id`): full legal name, preferred name, date of birth, sex (female/male/intersex), gender (free text), address (street, unit, city, province/territory, postal code) and contact details (phone, emergency contact name and phone). Postal codes and phone numbers are normalized (e.g. `N2L 3C5`, `(519) 555-0123`), and invalid input returns the same 422 `errors` format as readings. `python seed.py` creates all tables and fills in fictional profiles for every demo user.

### Roles and access control (Arica Ng: AUTH-2-T1, AUTH-2-T2, AUTH-2-T3)
Server-side rules in `backend/app/access.py`, tests in `backend/tests/test_access.py`.

- **Roles:** `patient` and `professional`, stored on the `users` table and read from the signed-in user.
- **Assignments:** the `patient_assignments` table links a professional to the patients they may monitor (`professional_id` and `patient_id` are UUID foreign keys to `users.id`; unique per pair). Create one with `assign_patient(db, professional_id, patient_id)`, which rejects accounts with the wrong role and skips pairs that already exist.
- **Rule:** a patient can only access their own records; a professional can only access assigned patients; everyone else gets 403. Unknown patient IDs also return 403, so IDs can't be probed.
- **Using it:** add `Depends(require_patient_access)` to any route with `{patient_id}` in its path, or `Depends(require_role(ROLE_PROFESSIONAL))` for professional-only routes.

### Professional roster (Arica Ng: MON-1-T1, MON-1-T2)
Backend in `backend/app/monitoring.py` (tests: `backend/tests/test_monitoring.py`); pages in `frontend/src/pages/ProfessionalRoster.jsx` and `ProfessionalPatientView.jsx` (tests: `ProfessionalRoster.test.jsx`).

| Endpoint | Description |
|---|---|
| `GET /professionals/me/patients` | Signed-in professional's assigned patients, sorted by name: `patient_id`, `full_name`, `assigned_at`, `dashboard_path`. Empty list when none; 403 for patients |
| `GET /patients/{patient_id}/readings/latest` | Latest vitals for one patient (same shape as `/readings/latest`). The patient themselves or an assigned professional only |

**My patients** (`/professional`) lists the roster with loading, empty and error states. Each entry opens `/professional/patients/:patientId`, which shows that patient's latest readings with the same cards as the patient dashboard. `python seed.py` assigns demo patients: Dr. Lee (Maya, Daniel, Priya), Dr. Armaan Gandhara (Lucas, Hannah, Ethan) and Arica Ng (Zakir, Jenny). Jacob Habte has none, to show the empty state.

### Patient navigation (Arica Ng: UI-2-T1, UI-2-T2)
The sidebar in `frontend/src/components/AppShell.jsx` links Dashboard, Record vitals, Trends & history, Appointments and My profile, and marks the current page (`aria-current="page"` plus highlight). Added a **Skip to main content** link as the first Tab stop so keyboard users can jump past the navigation. Tests in `frontend/src/components/AppShell.test.jsx` check one-click navigation between every pair of pages, a single current-page marker, Tab order, Enter to open, and the skip link.

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

### Frontend
From `frontend/` (start the backend first):
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # run tests (Vitest; the API is faked, no backend needed)
```
