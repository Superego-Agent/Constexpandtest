# api_routers/constitutions.py
import logging
import traceback
import re
import asyncio
import uuid
from datetime import datetime
from enum import Enum
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, Path as FastApiPath, Body, Query, BackgroundTasks
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, EmailStr

# Project-specific imports
from backend_models import ConstitutionHierarchy
try:
    from constitution_utils import get_constitution_hierarchy, get_constitution_content
except ImportError as e:
    print(f"Error importing constitution_utils in constitutions router: {e}")
    # Handle appropriately, maybe raise an error or log
    raise

router = APIRouter()

@router.get("/api/constitutions", response_model=ConstitutionHierarchy)
async def get_constitutions_endpoint():
    """Returns a hierarchical structure of available constitutions."""
    try:
        # Call the new utility function that returns the hierarchy directly
        hierarchy = get_constitution_hierarchy()
        return hierarchy
    except Exception as e:
        logging.error(f"Error loading constitutions in endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to load constitutions: {str(e)}")

@router.get("/api/constitutions/{relativePath:path}/content", response_model=str)
async def get_constitution_content_endpoint(
    relativePath: str = FastApiPath(..., title="The relative path of the constitution")
):
    """Returns the raw text content of a single constitution."""
    try:
        content = get_constitution_content(relativePath)
        if content is None:
            raise HTTPException(status_code=404, detail=f"Constitution '{relativePath}' not found or invalid.")
        return PlainTextResponse(content=content)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting content for constitution {relativePath}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to load content for constitution '{relativePath}'.")

# Define review status enum
class ReviewStatus(str, Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    REQUIRES_CHANGES = "requires_changes"

# Define submission models
class ConstitutionSubmission(BaseModel):
    text: str
    is_private: bool
    is_unlisted: Optional[bool] = False
    email: Optional[EmailStr] = None
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = []

class SubmissionResponse(BaseModel):
    status: str
    message: str
    email_sent: bool
    submission_id: Optional[str] = None
    shareableLink: Optional[str] = None

# Enhanced SuperegoCheck model with dimension-specific scores
class SuperegoCheck(BaseModel):
    score: int = Field(..., ge=0, le=100)
    issues: List[str] = []
    warnings: List[str] = []
    recommendations: List[str] = []
    passedChecks: List[str] = []
    dimensions: Dict[str, int] = Field(default_factory=dict)  # Add dimension-specific scores
    flagged: bool = False  # Quick reference for whether serious issues exist

# Review submission model
class ReviewSubmission(BaseModel):
    id: str
    text: str
    title: Optional[str] = None
    description: Optional[str] = None
    email: Optional[EmailStr] = None
    superego_result: Optional[SuperegoCheck] = None
    status: ReviewStatus = ReviewStatus.PENDING
    reviewer_id: Optional[str] = None
    reviewer_comments: Optional[str] = None
    submitted_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    tags: List[str] = []
    is_whitelisted: bool = False

# Extend the existing router
# router = APIRouter()

# --- Submission Endpoints ---

@router.post("/constitutions", response_model=SubmissionResponse)
async def submit_constitution(
    submission: ConstitutionSubmission,
    background_tasks: BackgroundTasks
):
    """
    Submit a constitution for use on the platform.
    
    If is_private=False, the constitution will go through the review process 
    for potential inclusion in the public marketplace.
    """
    try:
        # Run superego check first
        validation_result = await run_superego_check(submission.text)
        
        # Generate submission ID
        submission_id = f"sub_{uuid.uuid4().hex[:10]}"
        
        # Store metadata about the submission
        timestamp = datetime.now()
        review_submission = ReviewSubmission(
            id=submission_id,
            text=submission.text,
            title=submission.title,
            description=submission.description,
            email=submission.email,
            superego_result=validation_result,
            status=ReviewStatus.PENDING,
            submitted_at=timestamp,
            updated_at=timestamp,
            tags=submission.tags
        )
        
        # Store in database (simulation)
        await store_submission(review_submission)
        
        # If public submission, add to review queue
        if not submission.is_private:
            # Determine initial review priority based on superego result
            priority = "high" if validation_result.flagged else "normal"
            
            # Add to review queue with priority
            background_tasks.add_task(
                add_to_review_queue, 
                submission_id=submission_id,
                priority=priority
            )
            
            # Send confirmation email
            if submission.email:
                background_tasks.add_task(
                    send_submission_notification,
                    email=submission.email,
                    submission_id=submission_id,
                    status=ReviewStatus.PENDING,
                    message="Your constitution has been received and is pending review."
                )
        
        # Generate shareable link for unlisted constitutions
        shareable_link = None
        if submission.is_unlisted:
            shareable_link = f"https://creeds.world/c/{submission_id}"
        
        return SubmissionResponse(
            status="success",
            message="Constitution submitted successfully" + 
                   (" and added to review queue" if not submission.is_private else ""),
            email_sent=bool(submission.email),
            submission_id=submission_id,
            shareableLink=shareable_link
        )
        
    except Exception as e:
        logging.error(f"Failed to process submission: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process submission: {str(e)}")

@router.post("/constitutions/check", response_model=SuperegoCheck)
async def check_constitution(
    text: str = Body(..., embed=True)
):
    """
    Run a preliminary superego check on a constitution without saving it.
    """
    try:
        result = await run_superego_check(text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run superego check: {str(e)}")

# --- Enhanced Superego Check ---
async def run_superego_check(text: str) -> SuperegoCheck:
    """
    Run a comprehensive superego check on the constitution text.
    In production, this would call the actual superego system.
    """
    # Simulate processing time
    await asyncio.sleep(0.5)
    
    # Initialize scores and feedback lists
    score = 85
    issues = []
    warnings = []
    recommendations = []
    dimensions = {
        "safety": 85,
        "clarity": 80,
        "completeness": 75,
        "compliance": 90
    }
    
    # Format validation checks
    if len(text) < 100:
        score -= 20
        dimensions["completeness"] -= 30
        issues.append("Constitution is too short (minimum 100 characters recommended).")
    
    if '#' not in text:
        score -= 10
        dimensions["clarity"] -= 15
        warnings.append("No heading structure found. Consider using markdown headings for better organization.")
    
    # Content analysis checks
    problematic_terms = [
        ("ignore safety", "Constitution encourages ignoring safety guidelines", 25, "safety"),
        ("bypass", "Constitution may encourage bypassing intended constraints", 15, "compliance"),
        ("dangerous", "Constitution references dangerous content without appropriate safeguards", 20, "safety"),
        ("illegal content", "Constitution references illegal content", 30, "compliance"),
        ("harmful", "Constitution contains potentially harmful guidance", 20, "safety")
    ]
    
    for term, issue, penalty, dimension in problematic_terms:
        if term.lower() in text.lower():
            score = max(0, score - penalty)
            dimensions[dimension] = max(0, dimensions[dimension] - penalty)
            issues.append(issue)
    
    # Structure analysis
    section_patterns = {
        "principles": r'#+ .*\b(principles|values|core|tenets)\b',
        "guidelines": r'#+ .*\b(guidelines|rules|instructions)\b',
        "exceptions": r'#+ .*\b(exceptions|limitations|bounds)\b'
    }
    
    missing_sections = []
    for section_name, pattern in section_patterns.items():
        if not re.search(pattern, text, re.IGNORECASE):
            missing_sections.append(section_name)
    
    if missing_sections:
        dimensions["completeness"] -= 5 * len(missing_sections)
        recommendations.append(f"Consider adding these sections: {', '.join(missing_sections)}")
    
    # Add standard recommendations
    if not issues and not warnings:
        recommendations.append("Your constitution looks good! Consider getting feedback from others before finalizing.")
    else:
        recommendations.append("Address the identified issues to improve your constitution's effectiveness.")
    
    # Standard passed checks
    passed_checks = [
        "Basic format validation",
        "Structure check",
        "Minimum content check"
    ]
    
    if not issues:
        passed_checks.append("Content safety check")
    
    # Determine if the constitution should be flagged for special review
    flagged = len(issues) > 0 or score < 70
    
    return SuperegoCheck(
        score=score,
        issues=issues,
        warnings=warnings,
        recommendations=recommendations,
        passedChecks=passed_checks,
        dimensions=dimensions,
        flagged=flagged
    )

# --- Enhanced Review Endpoints ---
@router.get("/admin/reviews/pending", response_model=List[ReviewSubmission])
async def get_pending_reviews():
    """Get all pending constitution reviews."""
    # In production, would fetch from database
    # For demo, return simulated data
    return await get_all_pending_reviews()

@router.get("/admin/reviews/submissions/{submission_id}", response_model=ReviewSubmission)
async def get_submission_details(submission_id: str):
    """Get detailed information about a specific submission."""
    # In production, would fetch from database
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    return submission

@router.post("/admin/reviews/submissions/{submission_id}/check", response_model=SuperegoCheck)
async def run_review_check(submission_id: str):
    """Run a superego check on a specific submission."""
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    
    result = await run_superego_check(submission.text)
    
    # Update the submission with the check result
    submission.superego_result = result
    await update_submission(submission)
    
    return result

@router.post("/admin/reviews/submissions/{submission_id}/update-status")
async def update_submission_status(
    submission_id: str,
    status: ReviewStatus,
    background_tasks: BackgroundTasks,
    reviewer_id: Optional[str] = None,
    comments: Optional[str] = None
):
    """Update the status of a submission."""
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    
    # Update status and review information
    submission.status = status
    submission.updated_at = datetime.now()
    
    if reviewer_id:
        submission.reviewer_id = reviewer_id
    
    if comments:
        submission.reviewer_comments = comments
    
    # Save the updated submission
    await update_submission(submission)
    
    # Send notification if email is available
    if submission.email:
        background_tasks.add_task(
            send_submission_notification,
            email=submission.email,
            submission_id=submission_id,
            status=status,
            message=comments or f"Your submission has been marked as {status.value}."
        )
    
    return {"status": "success", "message": f"Submission status updated to {status.value}."}

@router.post("/admin/reviews/submissions/{submission_id}/approve")
async def approve_submission(
    submission_id: str,
    data: dict = Body(...),
    background_tasks: BackgroundTasks
):
    """Approve a submission and add it to the marketplace."""
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    
    # Extract data from request
    comment = data.get("comment", "")
    tags = data.get("tags", [])
    is_whitelisted = data.get("isWhitelisted", False)
    
    # Update submission
    submission.status = ReviewStatus.APPROVED
    submission.updated_at = datetime.now()
    submission.reviewer_comments = comment
    submission.tags = tags
    submission.is_whitelisted = is_whitelisted
    
    # Save the updated submission
    await update_submission(submission)
    
    # Whitelist for MCP if requested
    if is_whitelisted:
        background_tasks.add_task(whitelist_for_mcp, submission_id, submission.text)
    
    # Send notification if email is available
    if submission.email:
        background_tasks.add_task(
            send_submission_notification,
            email=submission.email,
            submission_id=submission_id,
            status=ReviewStatus.APPROVED,
            message=comment or "Your constitution has been approved!"
        )
    
    return {"status": "success", "message": "Submission approved and added to marketplace."}

@router.post("/admin/reviews/submissions/{submission_id}/reject")
async def reject_submission(
    submission_id: str,
    data: dict = Body(...),
    background_tasks: BackgroundTasks
):
    """Reject a submission."""
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    
    # Extract data from request
    comment = data.get("comment", "")
    reason = data.get("reason", "other")
    
    # Update submission
    submission.status = ReviewStatus.REJECTED
    submission.updated_at = datetime.now()
    submission.reviewer_comments = comment
    
    # Save the updated submission
    await update_submission(submission)
    
    # Send notification if email is available
    if submission.email:
        background_tasks.add_task(
            send_submission_notification,
            email=submission.email,
            submission_id=submission_id,
            status=ReviewStatus.REJECTED,
            message=comment or f"Your constitution was rejected. Reason: {reason}"
        )
    
    return {"status": "success", "message": "Submission rejected."}

@router.post("/admin/reviews/submissions/{submission_id}/request-changes")
async def request_submission_changes(
    submission_id: str,
    data: dict = Body(...),
    background_tasks: BackgroundTasks
):
    """Request changes to a submission."""
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    
    # Extract data from request
    comment = data.get("comment", "")
    reason = data.get("reason", "other")
    
    # Update submission
    submission.status = ReviewStatus.REQUIRES_CHANGES
    submission.updated_at = datetime.now()
    submission.reviewer_comments = comment
    
    # Save the updated submission
    await update_submission(submission)
    
    # Send notification if email is available
    if submission.email:
        background_tasks.add_task(
            send_submission_notification,
            email=submission.email,
            submission_id=submission_id,
            status=ReviewStatus.REQUIRES_CHANGES,
            message=comment or f"Changes requested. Reason: {reason}"
        )
    
    return {"status": "success", "message": "Changes requested."}

# --- Helper Functions ---

async def store_submission(submission: ReviewSubmission):
    """
    Store a submission in the database.
    In production, this would use a real database.
    """
    # Simulate database storage
    print(f"Storing submission {submission.id} with status {submission.status}")
    # In a real implementation, this would be a database call

async def update_submission(submission: ReviewSubmission):
    """
    Update a submission in the database.
    In production, this would use a real database.
    """
    # Simulate database update
    print(f"Updating submission {submission.id} with status {submission.status}")
    # In a real implementation, this would be a database call

async def get_submission_by_id(submission_id: str) -> Optional[ReviewSubmission]:
    """
    Get a submission by ID from the database.
    In production, this would use a real database.
    """
    # Simulate database lookup
    # In a real implementation, this would be a database call
    # For now, return a mock submission
    return ReviewSubmission(
        id=submission_id,
        text="# Sample Constitution\n\nThis is a sample constitution text for testing.",
        title="Sample Constitution",
        description="A sample constitution for testing purposes.",
        email="test@example.com",
        status=ReviewStatus.PENDING,
        submitted_at=datetime.now(),
        updated_at=datetime.now(),
        tags=["sample", "test"]
    )

async def get_all_pending_reviews() -> List[ReviewSubmission]:
    """
    Get all pending reviews from the database.
    In production, this would use a real database.
    """
    # Simulate database query
    # In a real implementation, this would be a database call
    # For now, return mock data
    return [
        ReviewSubmission(
            id=f"sub_{i}",
            text=f"# Test Constitution {i}\n\nThis is test constitution {i}.",
            title=f"Test Constitution {i}",
            description=f"Description for test constitution {i}.",
            email="test@example.com",
            status=ReviewStatus.PENDING,
            submitted_at=datetime.now(),
            updated_at=datetime.now(),
            tags=["test"]
        )
        for i in range(1, 5)
    ]

async def add_to_review_queue(
    submission_id: str,
    priority: str = "normal"
):
    """
    Add a submission to the review queue.
    In production, this would use a queue system or database table.
    """
    # Simulate adding to a review queue
    print(f"Added submission {submission_id} to review queue with priority {priority}")
    # In a real implementation, this might use a queue system

async def send_submission_notification(
    email: EmailStr, 
    submission_id: str, 
    status: ReviewStatus,
    message: str
):
    """
    Send an email notification about the submission status.
    In production, this would use a proper email service.
    """
    # Define templates for different notification types
    templates = {
        ReviewStatus.PENDING: {
            "subject": "Constitution Submission Received",
            "template": """
                Thank you for submitting your constitution to Creeds.World!
                
                Your submission (ID: {submission_id}) has been received and is pending review.
                We'll notify you when its status changes.
                
                {message}
                
                You can check the status of your submission at: https://creeds.world/submissions
                
                Thank you,
                The Creeds.World Team
            """
        },
        ReviewStatus.UNDER_REVIEW: {
            "subject": "Your Constitution is Under Review",
            "template": """
                Your constitution submission (ID: {submission_id}) is now being reviewed by our team.
                
                {message}
                
                We'll notify you once the review is complete.
                
                Thank you for your patience,
                The Creeds.World Team
            """
        },
        ReviewStatus.APPROVED: {
            "subject": "Constitution Approved!",
            "template": """
                Good news! Your constitution submission (ID: {submission_id}) has been approved.
                
                {message}
                
                Your constitution is now available in the Marketplace and can be used with MCP-compatible systems.
                
                View it here: https://creeds.world/marketplace/constitutions/{submission_id}
                
                Thank you,
                The Creeds.World Team
            """
        },
        ReviewStatus.REJECTED: {
            "subject": "Constitution Submission Update",
            "template": """
                We've completed the review of your constitution submission (ID: {submission_id}).
                
                Unfortunately, we couldn't approve it at this time.
                
                {message}
                
                You can submit a revised version addressing these concerns at any time.
                
                Thank you,
                The Creeds.World Team
            """
        },
        ReviewStatus.REQUIRES_CHANGES: {
            "subject": "Constitution Submission Needs Changes",
            "template": """
                We've reviewed your constitution submission (ID: {submission_id}) and would like to suggest some changes.
                
                {message}
                
                Please revise your submission and resubmit it for review.
                
                Thank you,
                The Creeds.World Team
            """
        }
    }
    
    # Get template for this status
    template_data = templates.get(status, templates[ReviewStatus.PENDING])
    subject = template_data["subject"]
    body = template_data["template"].format(
        submission_id=submission_id,
        message=message
    )
    
    # In production, use a proper email service (e.g., SendGrid, AWS SES)
    # For now, just log the email we would send
    print(f"\n--- Would send email to {email} ---")
    print(f"Subject: {subject}")
    print(f"Body:\n{body}")
    print("-----------------------------------\n")
    
    # In production, update the database to track that notification was sent
    await update_notification_log(submission_id, status, email)

async def update_notification_log(submission_id: str, status: ReviewStatus, email: str):
    """
    Update the notification log in the database.
    In production, this would use a real database.
    """
    # Simulate database update
    print(f"Logged notification for submission {submission_id} with status {status} to {email}")
    # In a real implementation, this would be a database call

async def whitelist_for_mcp(submission_id: str, text: str):
    """
    Whitelist a constitution for use with MCP servers.
    In production, this would interact with the MCP system.
    """
    # Simulate whitelisting
    print(f"Whitelisting constitution {submission_id} for MCP servers")
    # In a real implementation, this would interact with the MCP system