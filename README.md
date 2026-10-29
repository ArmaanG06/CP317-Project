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
- **Auth:** `backend/app/deps.py` `get_current_user()` is a placeholder returning patient `DEV_PATIENT_ID`. Replace its body with real session/JWT verification; endpoints don't need to change. The patient ID always comes from the logged-in user, never the request, and non-patients get 403.
- **Database:** the `readings` table stores one row per vital value (blood pressure is two rows linked by `submission_id`), with UTC `recorded_at` and an index on `(patient_id, vital_type, recorded_at)`. `patient_id` needs a foreign key once the patients table exists. Tables are created on startup by `create_all`, which can be replaced with migrations.

### Roles and access control (Arica Ng: AUTH-2-T1, AUTH-2-T2, AUTH-2-T3)
Server-side rules in `backend/app/access.py`, tests in `backend/tests/test_access.py`.

- **Roles:** `patient` and `professional`, read from `CurrentUser.role`.
- **Assignments:** the `patient_assignments` table links a professional to the patients they may monitor (`professional_id`, `patient_id`, `assigned_at`, unique per pair). Create one with `assign_patient(db, professional_id, patient_id)`.
- **Rule:** a patient can only access their own records; a professional can only access assigned patients; everyone else gets 403. Non-existent patient IDs also return 403 so IDs can't be probed.
- **Using it:** add `Depends(require_patient_access)` to any route with `{patient_id}` in its path, or `Depends(require_role(ROLE_PROFESSIONAL))` for professional-only routes.

### Professional roster (Arica Ng: MON-1-T1, MON-1-T2)
Code in `backend/app/monitoring.py`, tests in `backend/tests/test_monitoring.py`.

| Endpoint | Description |
|---|---|
| `GET /professionals/me/patients` | Signed-in professional's assigned patients: `patient_id`, `assigned_at`, `dashboard_path`. Empty list when none; 403 for patients |
| `GET /patients/{patient_id}/readings/latest` | Latest vitals for one patient (same shape as `/readings/latest`); the roster links here. Patient themselves or an assigned professional only |

### Frontend: patient navigation and roster page (Arica Ng: UI-2-T1, UI-2-T2, MON-1 UI)
React app in `frontend/` (Vite). `src/components/PatientNav.jsx` links Dashboard, Enter reading, History and Appointments, marks the current page with `aria-current="page"`, and is fully keyboard operable. `src/pages/ProfessionalRoster.jsx` lists assigned patients with loading, empty and error states and links each to `/patients/:patientId`. Pages owned by other stories are placeholders in `src/AppRoutes.jsx`; replace them as they land.

**Notes for teammates**
- **AUTH-1 (Zakir):** the users table needs a `role` column (`patient` / `professional`), and `get_current_user()` must return it. `patient_assignments` gets foreign keys to users once that table exists. Add the session token in `frontend/src/api.js` so every request is authenticated.
- Roster entries show "Patient #id" until the users table has names; then join the name into `RosterEntry`.

## Running locally
Setup instructions coming as the project is built.

### Backend
From `backend/`:
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # Windows: copy .env.example .env
uvicorn app.main:app --reload   # API at http://127.0.0.1:8000, docs at http://127.0.0.1:8000/docs
pytest -q                       # run tests
```

### Frontend
From `frontend/` (start the backend first; Vite forwards `/api/...` to it):
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # run tests
```
