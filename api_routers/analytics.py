# api_routers/analytics.py

from fastapi import APIRouter, Path, Query, Depends, HTTPException
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import hashlib

from db.analytics_db import (
    record_view, record_download, toggle_star, record_use,
    get_analytics_summary
)
from auth.auth import get_current_user, User

router = APIRouter(tags=["analytics"])

@router.post("/api/analytics/view/{constitution_id}")
async def record_view_endpoint(
    constitution_id: str = Path(...),
    user: Optional[User] = Depends(get_current_user)
):
    """Record a view of a constitution."""
    # Get client IP and hash it for privacy
    client_ip = request.client.host
    ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()
    
    # Record view
    await record_view(
        constitution_id=constitution_id,
        user_id=user.username if user else None,
        ip_hash=ip_hash
    )
    
    return {"status": "success"}

@router.post("/api/analytics/download/{constitution_id}")
async def record_download_endpoint(
    constitution_id: str = Path(...),
    user: Optional[User] = Depends(get_current_user)
):
    """Record a download of a constitution."""
    await record_download(
        constitution_id=constitution_id,
        user_id=user.username if user else None
    )
    
    return {"status": "success"}

@router.post("/api/analytics/star/{constitution_id}")
async def star_constitution_endpoint(
    constitution_id: str = Path(...),
    user: User = Depends(get_current_user)
):
    """Star a constitution."""
    success = await toggle_star(
        constitution_id=constitution_id,
        user_id=user.username,
        is_starred=True
    )
    
    return {"status": "success" if success else "unchanged"}

@router.delete("/api/analytics/star/{constitution_id}")
async def unstar_constitution_endpoint(
    constitution_id: str = Path(...),
    user: User = Depends(get_current_user)
):
    """Unstar a constitution."""
    success = await toggle_star(
        constitution_id=constitution_id,
        user_id=user.username,
        is_starred=False
    )
    
    return {"status": "success" if success else "unchanged"}

@router.get("/api/analytics/summary/{constitution_id}")
async def get_analytics_summary_endpoint(
    constitution_id: str = Path(...),
    user: Optional[User] = Depends(get_current_user)
):
    """Get analytics summary for a constitution."""
    # Check if user has access
    # For now, all approved constitutions are public
    
    summary = await get_analytics_summary(constitution_id)
    
    if summary["status"] == "not_found":
        raise HTTPException(status_code=404, detail=f"Constitution {constitution_id} not found")
    
    return summary

@router.get("/api/analytics/trending")
async def get_trending_constitutions(
    limit: int = Query(10, ge=1, le=50),
    period: str = Query("week", regex="^(day|week|month)$")
):
    """Get trending constitutions based on views, stars, and downloads."""
    try:
        # Convert period to days
        days = {"day": 1, "week": 7, "month": 30}[period]
        cutoff = datetime.now() - timedelta(days=days)
        
        async with pool.acquire() as conn:
            trending = await conn.fetch('''
                WITH recent_activity AS (
                    SELECT 
                        v.constitution_id,
                        COUNT(DISTINCT v.id) as views,
                        COUNT(DISTINCT d.id) as downloads,
                        COUNT(DISTINCT s.user_id) as stars
                    FROM constitutions c
                    LEFT JOIN constitution_views v ON c.id = v.constitution_id AND v.viewed_at >= $2
                    LEFT JOIN constitution_downloads d ON c.id = d.constitution_id AND d.downloaded_at >= $2
                    LEFT JOIN constitution_stars s ON c.id = s.constitution_id AND s.starred_at >= $2
                    WHERE c.is_private = FALSE AND c.status = 'approved'
                    GROUP BY c.id
                )
                SELECT 
                    c.id, 
                    c.title,
                    c.description,
                    c.author_id,
                    c.created_at,
                    COALESCE(ra.views, 0) as recent_views,
                    COALESCE(ra.downloads, 0) as recent_downloads,
                    COALESCE(ra.stars, 0) as recent_stars,
                    a.views as total_views,
                    a.downloads as total_downloads,
                    a.stars as total_stars,
                    a.uses as total_uses,
                    (COALESCE(ra.views, 0) + COALESCE(ra.downloads, 0) * 3 + COALESCE(ra.stars, 0) * 5) as trend_score
                FROM constitutions c
                JOIN constitution_analytics a ON c.id = a.constitution_id
                LEFT JOIN recent_activity ra ON c.id = ra.constitution_id
                WHERE c.is_private = FALSE AND c.status = 'approved'
                ORDER BY trend_score DESC
                LIMIT $1
            ''', limit, cutoff)
            
            # Format results
            result = []
            for row in trending:
                tags = await conn.fetch('''
                    SELECT tag FROM constitution_tags WHERE constitution_id = $1
                ''', row['id'])
                
                result.append({
                    "id": row['id'],
                    "title": row['title'],
                    "description": row['description'],
                    "author": row['author_id'] or "Anonymous",
                    "created_at": row['created_at'].isoformat(),
                    "tags": [tag['tag'] for tag in tags],
                    "analytics": {
                        "views": row['total_views'],
                        "downloads": row['total_downloads'],
                        "stars": row['total_stars'],
                        "uses": row['total_uses'],
                        "recent": {
                            "views": row['recent_views'],
                            "downloads": row['recent_downloads'],
                            "stars": row['recent_stars']
                        },
                        "trend_score": row['trend_score']
                    }
                })
            
            return result
    except Exception as e:
        logging.error(f"Error getting trending constitutions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get trending constitutions: {str(e)}")

# Add to api_routers/analytics.py

# Initialize protection services
ip_throttler = IPThrottler()
bot_detection = BotDetection()

async def analytics_protection(request: Request):
    """Dependency for analytics endpoints to prevent gaming."""
    # Check if bot
    if not await bot_detection.check_request(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Request identified as automated. Analytics actions blocked."
        )
    
    # Continue with request
    return request

# Update endpoints to use the protection
@router.post("/api/analytics/view/{constitution_id}")
async def record_view_endpoint(
    constitution_id: str = Path(...),
    user: Optional[User] = Depends(get_current_user),
    protected_request: Request = Depends(analytics_protection)
):
    """Record a view of a constitution."""
    # Check view limit
    if not await ip_throttler.check_view_limit(protected_request, constitution_id):
        return {"status": "throttled", "message": "View limit reached. Try again later."}
    
    # Rest of the function...