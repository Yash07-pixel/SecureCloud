import random
import resend


def generate_otp() -> str:
    return str(random.randint(100000, 999999))


async def send_otp_email(to_email: str, otp: str):
    from app.core.config import settings

    resend.api_key = "re_fC9QJ4sm_DyPMWvsTBgu3fGYkmfYeBQRa"

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

    params: resend.Emails.SendParams = {
        "from": "SecureCloud <onboarding@resend.dev>",
        "to": [to_email],
        "subject": "SecureCloud — Your Verification OTP",
        "html": html,
    }

    resend.Emails.send(params)