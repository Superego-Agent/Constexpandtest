# db/analytics_db.py

import asyncpg
from datetime import datetime, timedelta, date
from typing import Dict, Any, List, Optional
import logging

async def record_view(constitution_id: str, user_id: Optional[str] = None, ip_hash: Optional[str] = None):
    """Record a view of a constitution."""
    try:
        async with pool.acquire() as conn:
            # Update analytics counter
            await conn.execute('''
                UPDATE constitution_analytics
                SET views = views + 1
                WHERE constitution_id = $1
            ''', constitution_id)
            
            # Record view details for time-based analytics
            await conn.execute('''
                INSERT INTO constitution_views (
                    constitution_id, user_id, ip_hash, viewed_at
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ''', constitution_id, user_id, ip_hash)
            
            # Clean up old detailed data (optional, for privacy)
            month_ago = datetime.now() - timedelta(days=30)
            await conn.execute('''
                DELETE FROM constitution_views
                WHERE viewed_at < $1 AND ip_hash IS NOT NULL
            ''', month_ago)
    except Exception as e:
        logging.error(f"Error recording view for {constitution_id}: {e}")

async def record_download(constitution_id: str, user_id: Optional[str] = None):
    """Record a download of a constitution."""
    try:
        async with pool.acquire() as conn:
            # Update analytics counter
            await conn.execute('''
                UPDATE constitution_analytics
                SET downloads = downloads + 1
                WHERE constitution_id = $1
            ''', constitution_id)
            
            # Record download details
            await conn.execute('''
                INSERT INTO constitution_downloads (
                    constitution_id, user_id, downloaded_at
                ) VALUES ($1, $2, CURRENT_TIMESTAMP)
            ''', constitution_id, user_id)
    except Exception as e:
        logging.error(f"Error recording download for {constitution_id}: {e}")

async def toggle_star(constitution_id: str, user_id: str, is_starred: bool):
    """Toggle star status for a constitution."""
    try:
        async with pool.acquire() as conn:
            # Begin transaction
            async with conn.transaction():
                # Check current status
                existing = await conn.fetchval('''
                    SELECT 1 FROM constitution_stars
                    WHERE constitution_id = $1 AND user_id = $2
                ''', constitution_id, user_id)
                
                if is_starred and not existing:
                    # Add star
                    await conn.execute('''
                        INSERT INTO constitution_stars (
                            constitution_id, user_id, starred_at
                        ) VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ''', constitution_id, user_id)
                    
                    # Update analytics counter
                    await conn.execute('''
                        UPDATE constitution_analytics
                        SET stars = stars + 1
                        WHERE constitution_id = $1
                    ''', constitution_id)
                    
                    return True
                
                elif not is_starred and existing:
                    # Remove star
                    await conn.execute('''
                        DELETE FROM constitution_stars
                        WHERE constitution_id = $1 AND user_id = $2
                    ''', constitution_id, user_id)
                    
                    # Update analytics counter
                    await conn.execute('''
                        UPDATE constitution_analytics
                        SET stars = GREATEST(stars - 1, 0)
                        WHERE constitution_id = $1
                    ''', constitution_id)
                    
                    return True
                
                # No change needed
                return False
    except Exception as e:
        logging.error(f"Error toggling star for {constitution_id} by {user_id}: {e}")
        return False

async def record_use(constitution_id: str, mcp_server_id: Optional[str] = None):
    """Record a use of a constitution via MCP."""
    try:
        async with pool.acquire() as conn:
            # Update analytics counter
            await conn.execute('''
                UPDATE constitution_analytics
                SET uses = uses + 1
                WHERE constitution_id = $1
            ''', constitution_id)
            
            # Record use details if MCP server provided
            if mcp_server_id:
                await conn.execute('''
                    INSERT INTO constitution_uses (
                        constitution_id, mcp_server_id, used_at
                    ) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ''', constitution_id, mcp_server_id)
    except Exception as e:
        logging.error(f"Error recording use for {constitution_id}: {e}")

async def get_analytics_summary(constitution_id: str) -> Dict[str, Any]:
    """Get summary analytics for a constitution."""
    try:
        async with pool.acquire() as conn:
            # Get basic counters
            basic = await conn.fetchrow('''
                SELECT views, downloads, uses, stars
                FROM constitution_analytics
                WHERE constitution_id = $1
            ''', constitution_id)
            
            if not basic:
                return {"status": "not_found"}
            
            # Get time-based view trends (last 30 days)
            today = date.today()
            thirty_days_ago = today - timedelta(days=30)
            
            views_trend = await conn.fetch('''
                SELECT 
                    DATE(viewed_at) as day,
                    COUNT(*) as count
                FROM constitution_views
                WHERE constitution_id = $1
                AND viewed_at >= $2
                GROUP BY day
                ORDER BY day ASC
            ''', constitution_id, thirty_days_ago)
            
            # Convert to dict with all days (including zeros)
            days_dict = {}
            current_date = thirty_days_ago
            while current_date <= today:
                days_dict[current_date.isoformat()] = 0
                current_date += timedelta(days=1)
            
            for row in views_trend:
                days_dict[row['day'].isoformat()] = row['count']
            
            # Calculate engagement score (simple version)
            engagement_score = (
                basic['views'] * 1 + 
                basic['downloads'] * 3 + 
                basic['stars'] * 5 + 
                basic['uses'] * 10
            ) / 100  # Normalize to 0-10 scale
            
            return {
                "status": "success",
                "views": basic['views'],
                "downloads": basic['downloads'],
                "uses": basic['uses'],
                "stars": basic['stars'],
                "views_trend": days_dict,
                "engagement_score": min(10, engagement_score)  # Cap at 10
            }
    except Exception as e:
        logging.error(f"Error getting analytics for {constitution_id}: {e}")
        return {"status": "error", "message": str(e)}