# services/embedding_service.py

import numpy as np
from typing import List, Dict, Any, Optional
import logging
import aiohttp
import os

class EmbeddingService:
    """Service for generating and comparing text embeddings."""
    
    def __init__(self, embedding_api_url: str = None, api_key: str = None, embedding_dim: int = 768):
        """
        Initialize the embedding service.
        
        Args:
            embedding_api_url: URL for embedding API (e.g., OpenAI, Cohere, etc.)
            api_key: API key for the embedding service
            embedding_dim: Dimension of the embeddings
        """
        self.embedding_api_url = embedding_api_url or os.getenv("EMBEDDING_API_URL")
        self.api_key = api_key or os.getenv("EMBEDDING_API_KEY")
        self.embedding_dim = embedding_dim
        
        # Check if using local model
        self.use_local_model = not self.embedding_api_url
        
        if self.use_local_model:
            # Load local model if no API URL provided
            try:
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer('all-MiniLM-L6-v2')  # Lightweight model
                logging.info("Using local SentenceTransformer model for embeddings")
            except ImportError:
                logging.error("SentenceTransformer not installed. Please install with: pip install sentence-transformers")
                raise
    
    async def get_embedding(self, text: str) -> List[float]:
        """Generate embedding vector for text."""
        if not text:
            raise ValueError("Cannot generate embedding for empty text")
        
        try:
            if self.use_local_model:
                # Use local model
                return self.model.encode(text).tolist()
            else:
                # Use API
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        self.embedding_api_url,
                        json={"input": text, "model": "text-embedding-3-small"},
                        headers=headers
                    ) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            logging.error(f"Embedding API error: {error_text}")
                            raise RuntimeError(f"Embedding API returned {response.status}: {error_text}")
                        
                        result = await response.json()
                        return result["data"][0]["embedding"]
        except Exception as e:
            logging.error(f"Error generating embedding: {e}")
            raise
    
    def compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Compute cosine similarity between two embedding vectors."""
        # Convert to numpy arrays for efficient computation
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        
        # Normalize vectors
        vec1_norm = vec1 / np.linalg.norm(vec1)
        vec2_norm = vec2 / np.linalg.norm(vec2)
        
        # Compute cosine similarity
        similarity = np.dot(vec1_norm, vec2_norm)
        
        # Ensure result is in [0, 1] range
        return float(max(0.0, min(1.0, similarity)))
    
    def find_relevant_excerpt(self, text: str, query: str, window_size: int = 200) -> str:
        """Find most relevant excerpt from text based on query."""
        if len(text) <= window_size:
            return text
        
        # Split text into chunks with overlap
        chunks = []
        for i in range(0, len(text) - window_size + 1, window_size // 2):
            chunks.append(text[i:i+window_size])
        
        # Add final chunk if needed
        if len(text) - len(chunks) * (window_size // 2) > window_size // 2:
            chunks.append(text[-window_size:])
        
        # If using local model, use it directly
        if self.use_local_model:
            # Encode query and chunks
            query_embedding = self.model.encode(query)
            chunk_embeddings = self.model.encode(chunks)
            
            # Calculate similarities
            similarities = np.dot(chunk_embeddings, query_embedding) / (
                np.linalg.norm(chunk_embeddings, axis=1) * np.linalg.norm(query_embedding)
            )
            
            # Return most similar chunk
            best_idx = np.argmax(similarities)
            return chunks[best_idx]
        else:
            # This would need to be implemented asynchronously with API calls
            # For simplicity in this example, we'll just return the first chunk
            return chunks[0]