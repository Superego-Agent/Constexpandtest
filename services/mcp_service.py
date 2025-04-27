# Add to services directory
# services/mcp_service.py

import aiohttp
import logging
from typing import Dict, Any, Optional, List

class MCPService:
    """Service for interacting with MCP servers"""
    
    def __init__(self, mcp_registry_url: str, api_key: str = None):
        self.mcp_registry_url = mcp_registry_url
        self.api_key = api_key
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    
    async def register_constitution(self, constitution_id: str, constitution_text: str, metadata: Dict[str, Any]) -> bool:
        """
        Register a constitution with the MCP registry.
        Returns True if successful, False otherwise.
        """
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "constitution_id": constitution_id,
                    "text": constitution_text,
                    "metadata": metadata
                }
                
                async with session.post(
                    f"{self.mcp_registry_url}/register",
                    json=payload,
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        logging.info(f"Successfully registered constitution {constitution_id} with MCP")
                        return True
                    else:
                        logging.error(f"Failed to register constitution {constitution_id}: {await response.text()}")
                        return False
        except Exception as e:
            logging.error(f"Error registering constitution {constitution_id} with MCP: {e}")
            return False
    
    async def check_status(self, constitution_id: str) -> Dict[str, Any]:
        """
        Check the status of a constitution in the MCP registry.
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.mcp_registry_url}/status/{constitution_id}",
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logging.error(f"Failed to check status for {constitution_id}: {await response.text()}")
                        return {"status": "error", "message": await response.text()}
        except Exception as e:
            logging.error(f"Error checking status for {constitution_id}: {e}")
            return {"status": "error", "message": str(e)}
    
    async def get_usage_metrics(self, constitution_id: str) -> Dict[str, Any]:
        """
        Get usage metrics for a constitution from MCP servers.
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.mcp_registry_url}/metrics/{constitution_id}",
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logging.error(f"Failed to get metrics for {constitution_id}: {await response.text()}")
                        return {"status": "error", "message": await response.text()}
        except Exception as e:
            logging.error(f"Error getting metrics for {constitution_id}: {e}")
            return {"status": "error", "message": str(e)}