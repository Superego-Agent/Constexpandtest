import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import asyncio
from api_routers.constitutions import ReviewStatus

class EmailService:
    """Service for sending email notifications."""
    
    def __init__(self, 
                 smtp_server: str, 
                 smtp_port: int, 
                 username: str, 
                 password: str, 
                 from_email: str, 
                 use_tls: bool = True):
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
        self.from_email = from_email
        self.use_tls = use_tls
    
    async def send_email_async(self, 
                         to_email: str, 
                         subject: str, 
                         body_html: str, 
                         body_text: Optional[str] = None) -> bool:
        """Send an email asynchronously."""
        # Run the email sending in a thread pool to avoid blocking
        return await asyncio.to_thread(
            self._send_email_sync, 
            to_email, 
            subject, 
            body_html, 
            body_text
        )
    
    def _send_email_sync(self, 
                        to_email: str, 
                        subject: str, 
                        body_html: str, 
                        body_text: Optional[str] = None) -> bool:
        """Synchronous implementation of email sending."""
        if not body_text:
            # Simple HTML to text conversion if text version not provided
            body_text = body_html.replace('<br>', '\n').replace('</p>', '\n\n')
            # Strip remaining HTML tags (very basic)
            import re
            body_text = re.sub(r'<[^>]+>', '', body_text)
        
        try:
            # Create message
            message = MIMEMultipart('alternative')
            message['Subject'] = subject
            message['From'] = self.from_email
            message['To'] = to_email
            
            # Attach parts
            part1 = MIMEText(body_text, 'plain')
            part2 = MIMEText(body_html, 'html')
            message.attach(part1)
            message.attach(part2)
            
            # Connect and send
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                if self.username and self.password:
                    server.login(self.username, self.password)
                server.sendmail(self.from_email, to_email, message.as_string())
            
            logging.info(f"Email sent to {to_email}: {subject}")
            return True
        
        except Exception as e:
            logging.error(f"Failed to send email to {to_email}: {e}")
            return False
    
    def get_status_template(self, status: ReviewStatus, submission_id: str, message: str) -> dict:
        """Get email template based on submission status."""
        templates = {
            ReviewStatus.PENDING: {
                "subject": "Constitution Submission Received",
                "body_html": f"""
                    <p>Thank you for submitting your constitution to Creeds.World!</p>
                    <p>Your submission (ID: {submission_id}) has been received and is pending review.
                    We'll notify you when its status changes.</p>
                    <p>{message}</p>
                    <p>You can check the status of your submission at: 
                    <a href="https://creeds.world/submissions">https://creeds.world/submissions</a></p>
                    <p>Thank you,<br>The Creeds.World Team</p>
                """
            },
            ReviewStatus.UNDER_REVIEW: {
                "subject": "Your Constitution is Under Review",
                "body_html": f"""
                    <p>Your constitution submission (ID: {submission_id}) is now being reviewed by our team.</p>
                    <p>{message}</p>
                    <p>We'll notify you once the review is complete.</p>
                    <p>Thank you for your patience,<br>The Creeds.World Team</p>
                """
            },
            ReviewStatus.APPROVED: {
                "subject": "Constitution Approved!",
                "body_html": f"""
                    <p>Good news! Your constitution submission (ID: {submission_id}) has been approved.</p>
                    <p>{message}</p>
                    <p>Your constitution is now available in the Marketplace and can be used with MCP-compatible systems.</p>
                    <p>View it here: 
                    <a href="https://creeds.world/marketplace/constitutions/{submission_id}">
                        https://creeds.world/marketplace/constitutions/{submission_id}
                    </a></p>
                    <p>Thank you,<br>The Creeds.World Team</p>
                """
            },
            ReviewStatus.REJECTED: {
                "subject": "Constitution Submission Update",
                "body_html": f"""
                    <p>We've completed the review of your constitution submission (ID: {submission_id}).</p>
                    <p>Unfortunately, we couldn't approve it at this time.</p>
                    <p>{message}</p>
                    <p>You can submit a revised version addressing these concerns at any time.</p>
                    <p>Thank you,<br>The Creeds.World Team</p>
                """
            },
            ReviewStatus.REQUIRES_CHANGES: {
                "subject": "Constitution Submission Needs Changes",
                "body_html": f"""
                    <p>We've reviewed your constitution submission (ID: {submission_id}) and would like to suggest some changes.</p>
                    <p>{message}</p>
                    <p>Please revise your submission and resubmit it for review.</p>
                    <p>Thank you,<br>The Creeds.World Team</p>
                """
            }
        }
        
        default_template = templates.get(ReviewStatus.PENDING)
        return templates.get(status, default_template)