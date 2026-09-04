"""Email delivery helpers for account and password reset workflows."""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def send_password_reset_email(to_email: str, code: str) -> bool:
    """Attempt to send a password reset verification code via SMTP if configured.

    In development, this logs the code when SMTP settings are not configured.

    Args:
        to_email: Recipient email address.
        code: Password reset verification code to send.

    Returns:
        True when SMTP delivery succeeds, False otherwise.
    """
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "0") or 0)
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")

    subject = "Your SynapseIQ password reset verification code"
    body = f"Your verification code is: {code}\nThis code expires in 10 minutes."
    message = f"Subject: {subject}\n\n{body}"

    if smtp_host and smtp_port and smtp_user and smtp_password:
        try:
            import smtplib

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as client:
                client.starttls()
                client.login(smtp_user, smtp_password)
                client.sendmail(smtp_user, [to_email], message)
            logger.info("Sent password reset email to %s", to_email)
            return True
        except Exception:
            logger.exception("Failed to send password reset email")
            return False

    # fallback: log the code for development
    logger.info("Password reset code for %s: %s", to_email, code)
    return False
