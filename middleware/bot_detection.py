# middleware/bot_detection.py

from fastapi import Request, HTTPException, status
import re
from typing import List, Set
import logging

class BotDetection:
    """
    Basic bot detection to prevent metric manipulation.
    """
    
    def __init__(self):
        # Common bot user agents
        self.bot_patterns = [
            r'[bB]ot', r'[cC]rawler', r'[sS]pider', r'[sS]craper',
            r'PhantomJS', r'HeadlessChrome', r'Googlebot', r'bingbot',
            r'Baiduspider', r'Yandex', r'DuckDuckBot', r'Slurp'
        ]
        
        # Compile patterns for efficiency
        self.bot_regex = re.compile('|'.join(self.bot_patterns))
    
    def is_bot(self, request: Request) -> bool:
        """Check if request is likely from a bot."""
        # Check user agent
        user_agent = request.headers.get("User-Agent", "")
        if self.bot_regex.search(user_agent):
            return True
        
        # Check for missing headers that browsers typically send
        if not request.headers.get("Accept-Language"):
            return True
        
        # Check for suspiciously clean headers (bots often don't set all headers)
        if len(request.headers) < 5:
            return True
        
        return False
    
    async def check_request(self, request: Request) -> bool:
        """
        Check if request should be allowed for analytics.
        Returns True if request is valid (not a bot).
        """
        # Skip check for API endpoints not related to analytics
        analytics_paths = ["/api/analytics/", "/api/constitutions/star/"]
        if not any(path in request.url.path for path in analytics_paths):
            return True
        
        # Check if bot
        if self.is_bot(request):
            logging.warning(f"Bot detected: {request.client.host} - {request.headers.get('User-Agent')}")
            return False
        
        return True