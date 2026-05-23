"""
Symmetric encryption for GitHub tokens stored in the database.

Requires TOKEN_ENCRYPTION_KEY in the environment — a URL-safe base64-encoded
32-byte key generated with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

If the key is absent, tokens are stored as-is (dev-mode fallback only).
"""

import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet | None:
    global _fernet
    if _fernet is not None:
        return _fernet
    from core.config import settings
    key = getattr(settings, "TOKEN_ENCRYPTION_KEY", None)
    if not key:
        return None
    try:
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        return _fernet
    except Exception:
        logger.warning("TOKEN_ENCRYPTION_KEY is set but invalid — tokens will be stored unencrypted")
        return None


def encrypt_token(plaintext: str) -> str:
    f = _get_fernet()
    if f is None:
        return plaintext
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    f = _get_fernet()
    if f is None:
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception):
        # Token was stored before encryption was enabled — return as-is.
        return ciphertext
