from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.site import SPAStaticFiles, site


def _static_app(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>shell</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    app = FastAPI()
    app.mount("/", SPAStaticFiles(directory=tmp_path, html=True))
    return TestClient(app)


def test_serves_index_and_assets(tmp_path):
    c = _static_app(tmp_path)
    assert "shell" in c.get("/").text
    assert c.get("/assets/app.js").text == "console.log(1)"


def test_deep_link_falls_back_to_app_shell(tmp_path):
    r = _static_app(tmp_path).get("/patient/appointments")
    assert r.status_code == 200
    assert "shell" in r.text


def test_api_is_mounted_under_api_prefix():
    # Not used as a context manager, so the lifespan (create_all) does not run.
    r = TestClient(site).get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
