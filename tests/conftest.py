import os
import tempfile

# Point the app at a throwaway SQLite file BEFORE anything imports app.config.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["POOLBET_RATELIMIT"] = "0"  # don't rate-limit the shared-IP test client
