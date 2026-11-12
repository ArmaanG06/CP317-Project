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

### Roles and access control (Zakir Hasham: AUTH-1-T1, AUTH-1-T2, AUTH-1-T3)
Server-side rules in `backend/app/access.py`, tests in `backend/tests/test_access.py`.

- **Roles:** `patient` and `professional`, stored on the `users` table and read from the signed-in user.
- **Assignments:** the `patient_assignments` table links a professional to the patients they may monitor (`professional_id` and `patient_id` are UUID foreign keys to `users.id`; unique per pair). Create one with `assign_patient(db, professional_id, patient_id)`, which rejects accounts with the wrong role and skips pairs that already exist.
- **Rule:** a patient can only access their own records; a professional can only access assigned patients; everyone else gets 403. Unknown patient IDs also return 403, so IDs can't be probed.
- **Using it:** add `Depends(require_patient_access)` to any route with `{patient_id}` in its path, or `Depends(require_role(ROLE_PROFESSIONAL))` for professional-only routes.

### Professional roster (Arica Ng: AUTH-2-T1, AUTH-2-T2, AUTH-2-T3, MON-1-T1, MON-1-T2)
Backend in `backend/app/monitoring.py` (tests: `backend/tests/test_monitoring.py`); pages in `frontend/src/pages/ProfessionalRoster.jsx` and `ProfessionalPatientView.jsx` (tests: `ProfessionalRoster.test.jsx`).

| Endpoint | Description |
|---|---|
| `GET /professionals/me/patients` | Signed-in professional's assigned patients, sorted by name: `patient_id`, `full_name`, `assigned_at`, `dashboard_path`. Empty list when none; 403 for patients |
| `GET /patients/{patient_id}/readings/latest` | Latest vitals for one patient (same shape as `/readings/latest`). The patient themselves or an assigned professional only |

**My patients** (`/professional`) lists the roster with loading, empty and error states. Each entry opens `/professional/patients/:patientId`, which shows that patient's latest readings with the same cards as the patient dashboard. `python seed.py` assigns demo patients: Dr. Lee (Maya, Daniel, Priya), Dr. Armaan Gandhara (Lucas, Hannah, Ethan) and Dr. Zakir Hasham (Arica, Jenny). Dr. Dingle Fritz has none, to show the empty state.

### Patient navigation (Zakir Hasham: UI-2-T1, UI-2-T2)
The sidebar in `frontend/src/components/AppShell.jsx` links Dashboard, Record vitals, Trends & history, Appointments and My profile, and marks the current page (`aria-current="page"` plus highlight). Added a **Skip to main content** link as the first Tab stop so keyboard users can jump past the navigation. Tests in `frontend/src/components/AppShell.test.jsx` check one-click navigation between every pair of pages, a single current-page marker, Tab order, Enter to open, and the skip link.

### Trends and patient dashboard (Armaan Gandhara: TR_REP-1, MON-2)
Backend in `backend/app/readings.py` and `backend/app/monitoring.py` (tests: `backend/tests/test_trends.py`); frontend in `frontend/src/components/TrendsPanel.jsx`, `frontend/src/pages/Trends.jsx` and `ProfessionalPatientView.jsx` (tests: `Trends.test.jsx`, `ProfessionalPatientView.test.jsx`, `lib/trends.test.js`).

| Endpoint | Description |
|---|---|
| `GET /readings/history?start=…&end=…` | The signed-in patient's readings in a period, oldest first: `{start, end, readings}`. Patients only |
| `GET /patients/{patient_id}/readings/history?start=…&end=…` | Same for one patient. The patient themselves or an assigned professional only (AUTH-2) |

`start` and `end` are ISO date-times and both are **inclusive**. Times without a timezone are read as UTC. With no period given, the last 30 days are returned; periods longer than 366 days, or a start after the end, return the usual 422 `errors`.

- **Trends & history** (`/patient/trends`): choose the last 7, 30 or 90 days, or any From/To dates (both days included, in the user's local time). Each vital has a chart (blood pressure shows systolic and diastolic as two lines), a written summary (count, lowest, highest, average, latest) and a "Show values as a table" option.
- **Patient dashboard for professionals** (`/professional/patients/:patientId`): latest readings, the same trends, and saved flagged readings. A **Switch patient** menu moves between assigned patients, and the page reloads fully for each one so no data carries over. Unassigned patients still get a 403.
- **Demo history:** `python seed.py` adds about 30 days of morning and evening readings for 8 demo patients, including a few out-of-range values for testing flags. These rows have `source = 'demo_seed'`; remove them with `DELETE FROM readings WHERE source = 'demo_seed';`.

### Automatic reading flags (Jacob Habte: ALT-2)
Accepted readings are checked against alert thresholds in `backend/app/thresholds.py`, separately from the input-validation limits above. Code is integrated with `backend/app/readings.py` and `backend/seed.py`; tests are in `backend/tests/test_flags.py` and `frontend/src/pages/Flags.test.jsx`. The patient dashboard and assigned professional's patient view show saved flags with text and icons.

**Prototype adult alert thresholds** (inclusive; values strictly outside the range are flagged):

| Vital | Alert range |
|---|---|
| `heart_rate` | 60–100 bpm |
| `systolic` | 90–139 mmHg |
| `diastolic` | 60–89 mmHg |
| `temperature` | 35.0–37.9 °C |
| `spo2` | 95–100% |

These are demo monitoring limits, not diagnostic rules. Systolic and diastolic are evaluated separately. Each accepted measurement keeps the limits, direction and breached boundary used when it was evaluated; later patient-specific threshold changes affect future readings only. A rejected submission saves nothing.

| Endpoint | Description |
|---|---|
| `GET /readings/flags` | Signed-in patient's recent flagged measurements |
| `GET /patients/{patient_id}/readings/flags` | Flags for the patient or an assigned professional only |

### Professional alert review (Jacob Habte: ALT-1)
Backend in `backend/app/alerts.py` (tests: `backend/tests/test_alerts.py`); page in `frontend/src/pages/ProfessionalAlerts.jsx` (tests: `ProfessionalAlerts.test.jsx`). The **Alerts** link in the professional sidebar opens `/professional/alerts` and shows the unreviewed count.

Each new flag creates one alert for **each professional assigned to that patient at submission time**, in the same transaction as the reading. Every professional has an independent review state. An alert identifies the patient, vital sign, value, breached limit, direction and reading time. Marking it reviewed lowers the count but keeps both the alert and the underlying reading and flag in history.

| Endpoint | Description |
|---|---|
| `GET /professionals/me/alerts` | Signed-in professional's alerts; optional `patient_id` and `status` (`all`, `unreviewed`, `reviewed`) filters |
| `GET /professionals/me/alerts/count` | Unreviewed count across all the professional's patients |
| `PATCH /professionals/me/alerts/{alert_id}/review` | Mark the professional's alert reviewed; repeating the request leaves the review time unchanged |

The list's `unreviewed_count` is global and does not change with the filters. Patients cannot use these routes, and a professional cannot access another professional's alerts. For a database with flags saved before ALT-1, run `python backfill_alerts.py` from `backend/` after updating; it creates missing recipient alerts for current assignments and is safe to rerun. `seed.py` performs the same step for fictional demo data. Do not run the demo seeder against a production database.

### Appointment booking and scheduling (Zakir Hasham: APT-1, APT-2, APT-3)

Patients use **Appointments** (`/patient/appointments`) to choose a date and time with an assigned health professional, confirm a booking, and review upcoming, completed, or cancelled visits. The confirmation page accepts an optional reason for the visit.

Health professionals use **Schedule** (`/professional/schedule`) to create availability in 15-, 30-, 45-, or 60-minute slots, remove open slots, and search or filter bookings. The API rejects past start times, overlapping availability, and double bookings. Patient cancellation reopens the slot. Professional cancellation closes it. Both users can still see the cancelled booking in their history.

| Endpoint | Description |
|---|---|
| `GET /appointments` | List the signed-in user's bookings and appointment history |
| `GET /appointments/slots` | List future slots for the professional or the patient's assigned care team |
| `POST /appointments/slots` | Split a professional's availability window into bookable slots |
| `POST /appointments/slots/{slot_id}/book` | Book an open slot as an assigned patient |
| `DELETE /appointments/bookings/{booking_id}` | Cancel an upcoming booking as either participant |
| `DELETE /appointments/slots/{slot_id}` | Remove an open slot from the professional's schedule |

The API uses the existing session cookie. Appointment times are stored in UTC and displayed in the browser's time zone. The API creates the `appointment_slots` and `appointment_bookings` tables on startup.

**Demo:** Run `python seed.py` from `backend/`. Sign in as `dr.lee@example.com` to add future availability, then as `maya.chen@example.com` to book it. Both accounts use the demo password `Demo-Pass-123`.

**Tests:** Run `pytest -q tests/test_appointments.py` from `backend/` and `npm test -- src/pages/Appointments.test.jsx` from `frontend/`.

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
