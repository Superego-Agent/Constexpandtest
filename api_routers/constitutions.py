# api_routers/constitutions.py
import logging
import traceback
from typing import List
from fastapi import APIRouter, HTTPException, Path as FastApiPath
from fastapi.responses import PlainTextResponse

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

# api_routers/constitutions.py (additions)
from fastapi import APIRouter, HTTPException, Body, Query, Path, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr

# Import from your existing models file
from backend_models import ConstitutionHierarchy

# Define additional models for the API
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

class SuperegoCheck(BaseModel):
    score: int = Field(..., ge=0, le=100)
    issues: List[str] = []
    warnings: List[str] = []
    recommendations: List[str] = []
    passedChecks: List[str] = []

# Extend the existing router (assuming it's already created)
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
        # Validate format with the superego system
        validation_result = await run_superego_check(submission.text)
        
        # Store submission in database
        submission_id = f"sub_{uuid.uuid4().hex[:10]}"
        
        # If public submission, add to review queue
        if not submission.is_private:
            # Add to review queue
            background_tasks.add_task(add_to_review_queue, 
                                      submission_id=submission_id,
                                      text=submission.text,
                                      superego_result=validation_result,
                                      email=submission.email,
                                      title=submission.title,
                                      description=submission.description,
                                      tags=submission.tags)
            
            # Send email notification
            if submission.email:
                background_tasks.add_task(send_submission_notification, 
                                         email=submission.email,
                                         submission_id=submission_id)
        
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

# --- Helper Functions ---

async def run_superego_check(text: str) -> SuperegoCheck:
    """
    Run a superego check on the constitution text.
    In a real implementation, this would call the actual superego system.
    For now, we'll implement a basic simulation.
    """
    # Simulate processing time
    await asyncio.sleep(0.5)
    
    # Initialize with default passing values
    score = 85
    issues = []
    warnings = []
    recommendations = []
    
    # Check for basic format issues
    if len(text) < 50:
        score -= 20
        issues.append("Constitution is too short.")
    
    if '#' not in text:
        score -= 15
        warnings.append("No headings found. Consider using markdown headings.")
    
    # Check for potentially problematic content
    problematic_terms = [
        ("ignore safety", "Constitution encourages ignoring safety guidelines", 25),
        ("bypass", "Constitution may encourage bypassing intended constraints", 15),
        ("dangerous", "Constitution references dangerous content without appropriate safeguards", 20),
        ("illegal content", "Constitution references illegal content", 30)
    ]
    
    for term, issue, penalty in problematic_terms:
        if term.lower() in text.lower():
            score = max(0, score - penalty)
            issues.append(issue)
    
    # Add some standard recommendations
    recommendations = [
        "Consider adding more specific guidelines for edge cases.",
        "Add clear examples of allowed and disallowed behaviors.",
        "Define terms that might be ambiguous or context-dependent."
    ]
    
    # Standard passed checks
    passed_checks = [
        "Basic format validation",
        "Structure check",
        "Minimum content check"
    ]
    
    if not issues:
        passed_checks.append("Content safety check")
    
    return SuperegoCheck(
        score=score,
        issues=issues,
        warnings=warnings,
        recommendations=recommendations,
        passedChecks=passed_checks
    )

async def add_to_review_queue(
    submission_id: str,
    text: str,
    superego_result: SuperegoCheck,
    email: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None
):
    """
    Add a submission to the review queue.
    In a real implementation, this would store the submission in a database.
    """
    # Simulate database storage
    print(f"Added submission {submission_id} to review queue")
    # In a real implementation, this would be a database call

async def send_submission_notification(email: str, submission_id: str):
    """
    Send an email notification about the submission.
    In a real implementation, this would use an email service.
    """
    # Simulate sending an email
    print(f"Sending notification email to {email} for submission {submission_id}")
    # In a real implementation, this would use an email service
