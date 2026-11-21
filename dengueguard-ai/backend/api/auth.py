"""Minimal, honest demo authentication.

* Demo mode needs no credentials and is labelled as such in the UI.
* Email/password sign-in only works for accounts created locally with
  `python -m backend.api.auth add <email>`; passwords are stored as salted
  PBKDF2-SHA256 hashes in backend/auth_users.json (git-ignored). With no accounts
  configured the endpoint says so instead of pretending to authenticate.
* Sessions are random tokens held in memory (lost on restart). Prototype only.
"""
from __future__ import annotations

import getpass
import hashlib
import hmac
import json
import secrets
import sys
from pathlib import Path

USERS_FILE = Path(__file__).resolve().parent.parent / "auth_users.json"
ITERATIONS = 200_000
_sessions: dict[str, dict] = {}


def _hash(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS).hex()


def _users() -> dict:
    return json.loads(USERS_FILE.read_text()) if USERS_FILE.exists() else {}


def accounts_configured() -> bool:
    return bool(_users())


def verify(email: str, password: str) -> dict | None:
    u = _users().get(email.strip().lower())
    if not u:
        _hash(password, b"timing-equaliser")
        return None
    if not hmac.compare_digest(_hash(password, bytes.fromhex(u["salt"])), u["hash"]):
        return None
    token = secrets.token_urlsafe(32)
    _sessions[token] = {"email": email.strip().lower(), "role": "Public Health Officer", "mode": "account"}
    return {"token": token, **_sessions[token]}


def demo_session() -> dict:
    token = secrets.token_urlsafe(32)
    _sessions[token] = {"email": None, "role": "Public Health Officer (Demo)", "mode": "demo"}
    return {"token": token, **_sessions[token]}


def session(token: str | None) -> dict | None:
    return _sessions.get(token or "")


def logout(token: str | None) -> None:
    _sessions.pop(token or "", None)


def add_user(email: str, password: str) -> None:
    users = _users()
    salt = secrets.token_bytes(16)
    users[email.strip().lower()] = {"salt": salt.hex(), "hash": _hash(password, salt)}
    USERS_FILE.write_text(json.dumps(users, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "add":
        sys.exit("usage: python -m backend.api.auth add <email>")
    pw = getpass.getpass("Password (min 8 chars): ")
    if len(pw) < 8:
        sys.exit("Password too short")
    add_user(sys.argv[2], pw)
    print(f"Added {sys.argv[2]}")
