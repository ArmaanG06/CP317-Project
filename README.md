# CP317 Group 19: Health Monitoring System

**Authors:** Zakir Hasham, Armaan Gandhara, Jacob Habte, Arica Ng, Jenny Wang
**Stack:** React.js (Front-End), FastAPI, Python, Supabase (SQL Backend)

## Structure
- `backend/`: FastAPI API and database code
- `frontend/`: React UI

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
