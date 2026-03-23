import random
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def generate_otp() -> str:
    return str(random.randint(100000, 999999))


async def send_otp_email(to_email: str, otp: str):
    from app.core.config import settings

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2563eb;">🔐 SecureCloud Email Verification</h2>
        <p>Your OTP to verify your account is:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px;
                    background: #f1f5f9; padding: 20px; text-align: center;
                    border-radius: 8px; color: #2563eb;">
            {otp}
        </div>
        <p style="color: #666; font-size: 13px; margin-top: 16px;">
            This OTP expires in <strong>10 minutes</strong>.<br>
            If you didn't create a SecureCloud account, ignore this email.
        </p>
    </div>
    """

    message = MIMEMultipart("alternative")
    message["Subject"] = "SecureCloud — Your Verification OTP"
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=465
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        use_tls=True,
    )