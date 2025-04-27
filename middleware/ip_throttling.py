# middleware/ip_throttling.py

from fastapi import Request, HTTPException, status
import time
import hashlib
from typing import Dict, Set, List, Tuple

class IPThrottler:
    """
    Prevents a single IP from manipulating metrics by multiple rapid requests.
    Uses a sliding window to track requests per IP for specific actions.
    """
    
    def __init__(self):
        self.view_windows: Dict[str, List[float]] = {}  # {ip_hash: [timestamps]}
        self.download_windows: Dict[str, List[float]] = {}
        self.star_windows: Dict[str, List[float]] = {}
        self.cleanup_interval = 3600  # Clean up every hour
        self.last_cleanup = time.time()
        
        # Configure limits
        self.view_limit = (10, 60)  # 10 views per minute per IP
        self.download_limit = (5, 3600)  # 5 downloads per hour per IP
        self.star_limit = (20, 3600)  # 20 stars per hour per IP
    
    async def _cleanup_old_records(self):
        """Clean up old records to prevent memory leaks."""
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return
        
        # Clean up view windows
        for ip, timestamps in list(self.view_windows.items()):
            self.view_windows[ip] = [ts for ts in timestamps if now - ts < self.view_limit[1]]
            if not self.view_windows[ip]:
                del self.view_windows[ip]
        
        # Clean up download windows
        for ip, timestamps in list(self.download_windows.items()):
            self.download_windows[ip] = [ts for ts in timestamps if now - ts < self.download_limit[1]]
            if not self.download_windows[ip]:
                del self.download_windows[ip]
        
        # Clean up star windows
        for ip, timestamps in list(self.star_windows.items()):
            self.star_windows[ip] = [ts for ts in timestamps if now - ts < self.star_limit[1]]
            if not self.star_windows[ip]:
                del self.star_windows[ip]
        
        self.last_cleanup = now
    
    def _get_ip_hash(self, request: Request) -> str:
        """Get a hash of the client IP for privacy."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"
        
        return hashlib.sha256(ip.encode()).hexdigest()
    
    async def check_view_limit(self, request: Request, constitution_id: str) -> bool:
        """Check if view rate limit is exceeded."""
        await self._cleanup_old_records()
        
        ip_hash = self._get_ip_hash(request)
        now = time.time()
        
        # Initialize if not exists
        if ip_hash not in self.view_windows:
            self.view_windows[ip_hash] = []
        
        # Remove old timestamps
        self.view_windows[ip_hash] = [ts for ts in self.view_windows[ip_hash] if now - ts < self.view_limit[1]]
        
        # Check limit
        if len(self.view_windows[ip_hash]) >= self.view_limit[0]:
            return False
        
        # Add timestamp
        self.view_windows[ip_hash].append(now)
        return True
    
    async def check_download_limit(self, request: Request, constitution_id: str) -> bool:
        """Check if download rate limit is exceeded."""
        await self._cleanup_old_records()
        
        ip_hash = self._get_ip_hash(request)
        now = time.time()
        
        # Initialize if not exists
        if ip_hash not in self.download_windows:
            self.download_windows[ip_hash] = []
        
        # Remove old timestamps
        self.download_windows[ip_hash] = [ts for ts in self.download_windows[ip_hash] if now - ts < self.download_limit[1]]
        
        # Check limit
        if len(self.download_windows[ip_hash]) >= self.download_limit[0]:
            return False
        
        # Add timestamp
        self.download_windows[ip_hash].append(now)
        return True
    
    async def check_star_limit(self, request: Request) -> bool:
        """Check if star rate limit is exceeded."""
        await self._cleanup_old_records()
        
        ip_hash = self._get_ip_hash(request)
        now = time.time()
        
        # Initialize if not exists
        if ip_hash not in self.star_windows:
            self.star_windows[ip_hash] = []
        
        # Remove old timestamps
        self.star_windows[ip_hash] = [ts for ts in self.star_windows[ip_hash] if now - ts < self.star_limit[1]]
        
        # Check limit
        if len(self.star_windows[ip_hash]) >= self.star_limit[0]:
            return False
        
        # Add timestamp
        self.star_windows[ip_hash].append(now)
        return True