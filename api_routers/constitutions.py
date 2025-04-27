# api_routers/constitutions.py
import logging
import traceback
import re
import asyncio
import uuid
import hashlib
import base64
import os
from datetime import datetime
from enum import Enum
from typing import List, Dict, Optional, Any
from fastapi import APIRouter, HTTPException, Path as FastApiPath, Body, Query, BackgroundTasks, Depends, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, EmailStr

# Project-specific imports
from backend_models import ConstitutionHierarchy
from db.constitution_db import (
    store_submission, update_submission, get_submission_by_id, 
    get_all_pending_reviews, store_shareable_link, update_mcp_status,
    get_all_whitelisted_constitutions, store_constitution_embedding,
    find_similar_constitutions
)
from services.superego import SuperegoService
from services.email_service import EmailService
from services.embedding_service import EmbeddingService
from services.mcp_service import MCPService
from auth.auth import get_admin_user, User
from middleware.bot_detection import BotDetection
from middleware.ip_throttling import IPThrottler

try:
    from constitution_utils import get_constitution_hierarchy, get_constitution_content
except ImportError as e:
    print(f"Error importing constitution_utils in constitutions router: {e}")
    # Handle appropriately, maybe raise an error or log
    raise

router = APIRouter()

# Initialize services
superego_service = SuperegoService()
embedding_service = EmbeddingService()

# Initialize MCP service
mcp_service = MCPService(
    mcp_registry_url=os.getenv("MCP_REGISTRY_URL", "https://registry.mcp.so"),
    api_key=os.getenv("MCP_API_KEY")
)

# Initialize protection services
ip_throttler = IPThrottler()
bot_detection = BotDetection()

# Initialize email service (should be done at app startup with config values)
email_service = EmailService(
    smtp_server="smtp.example.com",  # Replace with actual SMTP server
    smtp_port=587,                  # Replace with actual port
    username="notifications@creeds.world",  # Replace with actual username
    password="your-password",       # Replace with actual password
    from_email="notifications@creeds.world",  # Replace with actual email
    use_tls=True
)

async def analytics_protection(request: Request):
    """Dependency for analytics endpoints to prevent gaming."""
    # Check if bot
    if not await bot_detection.check_request(request):
        raise HTTPException(
            status_code=403,
            detail="Request identified as automated. Analytics actions blocked."
        )
    
    # Continue with request
    return request

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
        validation_result = await superego_service.check_constitution(submission.text)
        
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
        
        # Store in database
        await store_submission(review_submission)
        
        # Generate embedding for similarity search
        background_tasks.add_task(
            generate_and_store_embedding,
            submission_id=submission_id,
            text=submission.text
        )
        
        # Generate shareable link for unlisted constitutions
        shareable_link = None
        if submission.is_unlisted:
            # Create a secure hash of the submission ID
            hash_object = hashlib.sha256(submission_id.encode())
            hash_digest = hash_object.digest()
            # Convert to a URL-safe base64 string and take first 16 chars
            hash_b64 = base64.urlsafe_b64encode(hash_digest).decode()[:16]
            # Create the shareable link
            shareable_link = f"https://creeds.world/c/{hash_b64}"
            
            # Store the link association in the database
            await store_shareable_link(submission_id, hash_b64)
        
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
        result = await superego_service.check_constitution(text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run superego check: {str(e)}")

@router.post("/constitutions/test")
async def test_constitution(
    constitution_text: str = Body(..., embed=True),
    user_input: str = Body(..., embed=True)
):
    """
    Test a constitution in the sandbox environment.
    Returns a simulated AI response based on the constitution.
    """
    try:
        # Validate the constitution format first
        validation_result = await superego_service.check_constitution(constitution_text)
        
        # Prepare the test configuration
        test_config = {
            "constitution": constitution_text,
            "adherence_level": 5,  # Maximum adherence by default
            "user_input": user_input
        }
        
        # Call the sandbox testing service
        response = await run_sandbox_test(test_config)
        
        return {
            "status": "success",
            "validation": validation_result,
            "response": response
        }
    except Exception as e:
        logging.error(f"Failed to run constitution test: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to test constitution: {str(e)}")

async def run_sandbox_test(config):
    """
    Run a test in the sandbox environment.
    This is a placeholder for the actual AI testing service.
    """
    # Simulate processing time
    await asyncio.sleep(1)
    
    # Example response generation - very basic simulation
    constitution = config["constitution"]
    user_input = config["user_input"]
    
    # Extremely simple response generation based on keywords
    if "dangerous" in user_input.lower() and "safety" in constitution.lower():
        return "I cannot assist with that request as it may involve dangerous content, which goes against my constitution's safety guidelines."
    elif "creative" in user_input.lower() and "creativity" in constitution.lower():
        return "Here's a creative response based on your request, guided by my constitution's creativity principles..."
    else:
        return "I've processed your request according to my constitution guidelines. [This is a simulated response for testing purposes]"

# --- Enhanced Review Endpoints ---
@router.get("/admin/reviews/pending", response_model=List[ReviewSubmission])
async def get_pending_reviews(current_user: User = Depends(get_admin_user)):
    """Get all pending constitution reviews."""
    # Fetch from database
    return await get_all_pending_reviews()

@router.get("/admin/reviews/submissions/{submission_id}", response_model=ReviewSubmission)
async def get_submission_details(
    submission_id: str,
    current_user: User = Depends(get_admin_user)
):
    """Get detailed information about a specific submission."""
    # Fetch from database
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    return submission

@router.post("/admin/reviews/submissions/{submission_id}/check", response_model=SuperegoCheck)
async def run_review_check(
    submission_id: str,
    current_user: User = Depends(get_admin_user)
):
    """Run a superego check on a specific submission."""
    submission = await get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail=f"Submission '{submission_id}' not found.")
    
    result = await superego_service.check_constitution(submission.text)
    
    # Update the submission with the check result
    submission.superego_result = result
    await update_submission(submission)
    
    return result

@router.post("/admin/reviews/submissions/{submission_id}/update-status")
async def update_submission_status(
    submission_id: str,
    status: ReviewStatus,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_admin_user),
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
    else:
        submission.reviewer_id = current_user.username
    
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_admin_user)
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
    submission.reviewer_id = current_user.username
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_admin_user)
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
    submission.reviewer_id = current_user.username
    
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_admin_user)
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
    submission.reviewer_id = current_user.username
    
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

# --- MCP Integration Endpoints ---
@router.get("/admin/mcp/status/{constitution_id}")
async def get_mcp_status_endpoint(
    constitution_id: str,
    current_user: User = Depends(get_admin_user)
):
    """Get MCP status for a constitution."""
    try:
        status = await mcp_service.check_status(constitution_id)
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check MCP status: {str(e)}")

@router.post("/admin/mcp/test_integration")
async def test_mcp_integration_endpoint(
    current_user: User = Depends(get_admin_user)
):
    """Test MCP integration."""
    try:
        test_result = await mcp_service.check_status("test")
        if "status" in test_result and test_result["status"] == "error":
            return {"status": "error", "message": f"MCP connection failed: {test_result['message']}"}
        return {"status": "success", "message": "MCP connection successful"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MCP integration test failed: {str(e)}")

# --- Analytics Integration ---
@router.post("/api/analytics/view/{constitution_id}")
async def record_view_endpoint(
    constitution_id: str = FastApiPath(...),
    request: Request = Depends(analytics_protection)
):
    """Record a view of a constitution."""
    # Check if view limit is exceeded
    if not await ip_throttler.check_view_limit(request, constitution_id):
        return {"status": "throttled", "message": "View limit reached. Try again later."}
    
    # Get client IP and hash it for privacy
    client_ip = request.client.host
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()
    
    # Record view (in a real implementation, this would call analytics_db)
    from db.analytics_db import record_view
    await record_view(
        constitution_id=constitution_id,
        user_id=None,  # Anonymous
        ip_hash=ip_hash
    )
    
    return {"status": "success"}

# --- Similarity Search Endpoints ---

@router.post("/api/constitutions/similar")
async def get_similar_constitutions_endpoint(
    text: str = Body(..., embed=True),
    limit: int = Query(10, ge=1, le=50),
    min_similarity: float = Query(0.5, ge=0.1, le=0.99)
):
    """Returns constitutions that are semantically similar to the provided text."""
    try:
        # Generate embedding for input text
        query_embedding = await embedding_service.get_embedding(text)
        
        # Find similar constitutions
        similar_results = await find_similar_constitutions(
            embedding=query_embedding,
            limit=limit,
            min_similarity=min_similarity
        )
        
        # Format results
        similar_constitutions = []
        for result in similar_results:
            # Extract relevant excerpt
            excerpt = embedding_service.find_relevant_excerpt(
                text=await get_constitution_content_by_id(result['id']),
                query=text
            )
            
            similar_constitutions.append({
                "id": result['id'],
                "title": result['title'],
                "similarity": result['similarity'],
                "author": result['author_id'] or "Anonymous",
                "description": result['description'],
                "excerpt": excerpt,
                "tags": result['tags'] if result['tags'][0] is not None else [],
                "source": "marketplace",
                "isStarred": False  # Client should check this client-side
            })
        
        return similar_constitutions
    except Exception as e:
        logging.error(f"Error finding similar constitutions: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to find similar constitutions.")

@router.get("/api/constitutions/{constitution_id}/similar")
async def get_similar_constitutions_by_id_endpoint(
    constitution_id: str = FastApiPath(..., title="The constitution ID to find similar constitutions for"),
    limit: int = Query(10, ge=1, le=50),
    min_similarity: float = Query(0.5, ge=0.1, le=0.99)
):
    """Returns constitutions that are semantically similar to the specified constitution."""
    try:
        # Check if constitution exists
        constitution = await get_constitution_by_id(constitution_id)
        if not constitution:
            raise HTTPException(status_code=404, detail=f"Constitution '{constitution_id}' not found.")
        
        # Get embedding for this constitution
        async with pool.acquire() as conn:
            embedding = await conn.fetchval(
                "SELECT embedding FROM constitution_embeddings WHERE constitution_id = $1",
                constitution_id
            )
        
        if not embedding:
            # Generate embedding if not found
            embedding = await embedding_service.get_embedding(constitution['text'])
            await store_constitution_embedding(constitution_id, embedding)
        
        # Find similar constitutions
        similar_results = await find_similar_constitutions(
            embedding=embedding,
            limit=limit,
            min_similarity=min_similarity
        )
        
        # Format results (similar to previous endpoint)
        similar_constitutions = []
        for result in similar_results:
            # Skip the original constitution
            if result['id'] == constitution_id:
                continue
                
            # Extract excerpt for context
            excerpt = embedding_service.find_relevant_excerpt(
                text=await get_constitution_content_by_id(result['id']),
                query=constitution['text']
            )
            
            similar_constitutions.append({
                "id": result['id'],
                "title": result['title'],
                "similarity": result['similarity'],
                "author": result['author_id'] or "Anonymous",
                "description": result['description'],
                "excerpt": excerpt,
                "tags": result['tags'] if result['tags'][0] is not None else [],
                "source": "marketplace",
                "isStarred": False  # Client should check this client-side
            })
        
        return similar_constitutions
    except Exception as e:
        logging.error(f"Error finding similar constitutions for {constitution_id}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to find similar constitutions.")

# --- Constitution Relationship Endpoints ---

@router.get("/api/constitutions/{constitution_id}/relationships")
async def get_constitution_relationships_endpoint(
    constitution_id: str = FastApiPath(..., title="The constitution ID to get relationships for"),
):
    """Returns relationships between this constitution and others."""
    try:
        # This would connect to a database to fetch real relationship data
        # For now, we'll generate mock data
        
        relationships = {
            "nodes": [
                {"id": constitution_id, "title": "Selected Constitution", "type": "focus"},
                # Additional nodes would be pulled from database in real implementation
            ],
            "links": [
                # Links would be pulled from database in real implementation
            ]
        }
        
        # Generate some mock nodes and links
        for i in range(1, 4):
            derived_id = f"derived-{i}"
            relationships["nodes"].append({
                "id": derived_id,
                "title": f"Derived Constitution {i}",
                "type": "derived",
                "description": "Based on the selected constitution"
            })
            relationships["links"].append({
                "source": constitution_id,
                "target": derived_id,
                "type": "derives",
                "strength": 0.8 - (i * 0.1)
            })
        
        for i in range(1, 3):
            original_id = f"original-{i}"
            relationships["nodes"].append({
                "id": original_id,
                "title": f"Original Constitution {i}",
                "type": "original",
                "description": "A foundation for the selected constitution"
            })
            relationships["links"].append({
                "source": original_id,
                "target": constitution_id,
                "type": "derives",
                "strength": 0.7
            })
        
        for i in range(1, 6):
            similar_id = f"similar-{i}"
            relationships["nodes"].append({
                "id": similar_id,
                "title": f"Similar Constitution {i}",
                "type": "similar",
                "description": "Contains similar concepts"
            })
            relationships["links"].append({
                "source": constitution_id,
                "target": similar_id,
                "type": "similar",
                "strength": 0.9 - (i * 0.15)
            })
        
        return relationships
        
    except Exception as e:
        logging.error(f"Error getting relationships for constitution {constitution_id}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch constitution relationships.")


# --- Tag Endpoints ---

@router.get("/api/tags")
async def get_tags_endpoint():
    """Returns all tags with their usage count."""
    try:
        # In a real implementation, this would query the database
        # For now, generate mock data
        tags = [
            {"tag": "safety", "count": 28},
            {"tag": "ethics", "count": 22},
            {"tag": "creativity", "count": 15},
            {"tag": "guidelines", "count": 42},
            {"tag": "corporate", "count": 8},
            {"tag": "governance", "count": 12},
            {"tag": "assistance", "count": 18},
            {"tag": "education", "count": 7},
            {"tag": "healthcare", "count": 5},
            {"tag": "legal", "count": 9},
            {"tag": "finance", "count": 6},
            {"tag": "technical", "count": 11},
            {"tag": "research", "count": 14},
        ]
        return tags
    except Exception as e:
        logging.error(f"Error getting tags: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch tags.")

# --- Helper Functions ---

async def send_submission_notification(
    email: EmailStr, 
    submission_id: str, 
    status: ReviewStatus,
    message: str
):
    """
    Send an email notification about the submission status.
    """
    # Get the template for this status
    template = email_service.get_status_template(status, submission_id, message)
    
    # Send the email
    success = await email_service.send_email_async(
        to_email=email,
        subject=template["subject"],
        body_html=template["body_html"]
    )
    
    if success:
        logging.info(f"Notification email sent to {email} for submission {submission_id} with status {status}")
    else:
        logging.error(f"Failed to send notification email to {email} for submission {submission_id}")
    
    # Update the notification log
    await update_notification_log(submission_id, status, email)

async def update_notification_log(submission_id: str, status: ReviewStatus, email: str):
    """
    Update the notification log in the database.
    In production, this would use a real database.
    """
    # Simulate database update
    print(f"Logged notification for submission {submission_id} with status {status} to {email}")
    # In a real implementation, this would be a database call

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

async def whitelist_for_mcp(submission_id: str, text: str):
    """
    Whitelist a constitution for use with MCP servers.
    """
    try:
        # Get full submission details
        submission = await get_submission_by_id(submission_id)
        if not submission:
            logging.error(f"Cannot whitelist {submission_id}: Submission not found")
            return False
        
        # Prepare metadata
        metadata = {
            "title": submission.title,
            "description": submission.description,
            "author_email": submission.email,
            "tags": submission.tags,
            "approved_at": datetime.now().isoformat(),
            "platform": "Creeds.World"
        }
        
        # Register with MCP
        success = await mcp_service.register_constitution(submission_id, text, metadata)
        
        if success:
            # Update local database to mark as whitelisted
            await update_mcp_status(submission_id, "whitelisted")
            logging.info(f"Constitution {submission_id} successfully whitelisted for MCP")
        
        return success
    except Exception as e:
        logging.error(f"Error whitelisting constitution {submission_id}: {e}")
        traceback.print_exc()
        return False

async def generate_and_store_embedding(submission_id: str, text: str):
    """
    Generate embedding vector for a constitution text and store it.
    """
    try:
        # Generate embedding
        embedding = await embedding_service.get_embedding(text)
        
        # Store in database
        await store_constitution_embedding(submission_id, embedding)
        
        logging.info(f"Generated and stored embedding for constitution {submission_id}")
    except Exception as e:
        logging.error(f"Error generating embedding for {submission_id}: {e}")
        traceback.print_exc()

async def get_constitution_content_by_id(constitution_id: str) -> str:
    """
    Get the content of a constitution by its ID.
    """
    try:
        # In a real implementation, this would fetch from database
        submission = await get_submission_by_id(constitution_id)
        if submission:
            return submission.text
        return "Constitution text not found."
    except Exception as e:
        logging.error(f"Error fetching constitution content by ID {constitution_id}: {e}")
        return "Error fetching constitution content."