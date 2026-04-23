"""Password hashing and session-token helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets


PBKDF2_ITERATIONS = 390_000


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256."""

    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against the stored PBKDF2 hash."""

    try:
        salt_b64, digest_b64 = password_hash.split("$", 1)
    except ValueError:
        return False
    salt = base64.b64decode(salt_b64.encode())
    expected = base64.b64decode(digest_b64.encode())
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return hmac.compare_digest(actual, expected)


def generate_session_token() -> str:
    """Generate a random raw session token."""

    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """Hash a raw session token for storage."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()

