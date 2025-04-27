# middleware/rate_limiting.py

from fastapi import Request, HTTPException, status
import time
import asyncio
from typing import Dict, Tuple, Optional, Callable
import logging

class RateLimiter:
    """
    Rate limiter for API endpoints.
    Uses sliding window algorithm to track requests.
    """
    
    def __init__(self, window_size: int = 60, max_requests: int = 100):
        self.window_size = window_size  # Window size in seconds
        self.max_requests = max_requests  # Max requests per window
        self.windows: Dict[str, Dict[int, int]] = {}  # {key: {timestamp: count}}
        self.last_cleanup = time.time()
        self.cleanup_interval = 300  # Clean up old windows every 5 minutes
    
    def _get_key(self, request: Request) -> str:
        """
        Generate a key for the rate limit window.
        By default, uses IP address.
        """
        # Get client IP, considering forwarded headers
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"
        
        # If authenticated, include user ID
        user = getattr(request.state, "user", None)
        user_id = getattr(user, "id", "anonymous")
        
        # Create key based on IP and path
        path = request.url.path
        return f"{ip}:{user_id}:{path}"
    
    async def _cleanup_old_windows(self):
        """Clean up old windows to prevent memory leaks."""
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return
        
        cutoff = int(now) - self.window_size
        keys_to_remove = []
        
        for key, window in self.windows.items():
            # Remove old timestamps
            old_timestamps = [ts for ts in window.keys() if ts < cutoff]
            for ts in old_timestamps:
                del window[ts]
            
            # If window is empty, mark for removal
            if not window:
                keys_to_remove.append(key)
        
        # Remove empty windows
        for key in keys_to_remove:
            del self.windows[key]
        
        self.last_cleanup = now
    
    async def check_rate_limit(self, request: Request) -> Tuple[bool, Optional[int]]:
        """
        Check if request exceeds rate limit.
        Returns (is_allowed, retry_after).
        """
        await self._cleanup_old_windows()
        
        key = self._get_key(request)
        now = int(time.time())
        window = self.windows.setdefault(key, {})
        
        # Remove timestamps outside the window
        cutoff = now - self.window_size
        for ts in list(window.keys()):
            if ts < cutoff:
                del window[ts]
        
        # Count requests in current window
        current_count = sum(window.values())
        
        if current_count >= self.max_requests:
            # Calculate retry-after
            if window:
                oldest_ts = min(window.keys())
                retry_after = oldest_ts + self.window_size - now
            else:
                retry_after = self.window_size
            
            return False, max(0, retry_after)
        
        # Increment count for current timestamp
        window[now] = window.get(now, 0) + 1
        
        return True, None

# Middleware function
async def rate_limiting_middleware(request: Request, call_next: Callable):
    """
    Middleware to apply rate limiting.
    Different limits for different endpoint types.
    """
    # Skip rate limiting for some paths
    exclude_paths = ["/health", "/metrics", "/api/docs"]
    if any(request.url.path.startswith(path) for path in exclude_paths):
        return await call_next(request)
    
    # Define different rate limiters for different endpoints
    analytics_limiter = RateLimiter(window_size=60, max_requests=30)  # 30 req/min
    submission_limiter = RateLimiter(window_size=3600, max_requests=10)  # 10 req/hour
    general_limiter = RateLimiter(window_size=60, max_requests=60)  # 60 req/min
    
    # Select appropriate limiter based on path
    if "/api/analytics" in request.url.path:
        limiter = analytics_limiter
    elif "/api/constitutions/submit" in request.url.path:
        limiter = submission_limiter
    else:
        limiter = general_limiter
    
    # Check rate limit
    allowed, retry_after = await limiter.check_rate_limit(request)
    
    if not allowed:
        logging.warning(f"Rate limit exceeded for {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
            headers={"Retry-After": str(retry_after)}
        )
    
    # Continue with request
    return await call_next(request)