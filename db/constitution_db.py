import asyncpg
from typing import List, Optional, Dict, Any
import logging
import json
from datetime import datetime

# Database connection pool (should be initialized at app startup)
pool = None

async def init_db_pool(dsn: str):
    global pool
    pool = await asyncpg.create_pool(dsn)
    
    # Create tables if they don't exist
    async with pool.acquire() as conn:
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS constitutions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                text TEXT NOT NULL,
                author_id TEXT,
                author_email TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status TEXT NOT NULL DEFAULT 'pending',
                is_private BOOLEAN NOT NULL DEFAULT TRUE,
                is_unlisted BOOLEAN NOT NULL DEFAULT FALSE,
                is_whitelisted BOOLEAN NOT NULL DEFAULT FALSE,
                reviewer_id TEXT,
                reviewer_comments TEXT,
                superego_result JSONB
                mcp_status TEXT DEFAULT NULL,
                mcp_registered_at TIMESTAMP DEFAULT NULL,
                mcp_last_updated_at TIMESTAMP DEFAULT NULL,
            )
        ''')
        
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS constitution_tags (
                constitution_id TEXT REFERENCES constitutions(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                PRIMARY KEY (constitution_id, tag)
            )
        ''')
        
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS constitution_analytics (
                constitution_id TEXT REFERENCES constitutions(id) ON DELETE CASCADE,
                views INTEGER NOT NULL DEFAULT 0,
                downloads INTEGER NOT NULL DEFAULT 0,
                uses INTEGER NOT NULL DEFAULT 0,
                stars INTEGER NOT NULL DEFAULT 0,
                average_rating FLOAT,
                PRIMARY KEY (constitution_id)
            )
        ''')

# Store a new constitution submission
async def store_submission(submission):
    if not pool:
        raise RuntimeError("Database pool not initialized")
    
    async with pool.acquire() as conn:
        # Start a transaction
        async with conn.transaction():
            # Insert the constitution
            await conn.execute('''
                INSERT INTO constitutions (
                    id, title, description, text, author_email, status, 
                    is_private, superego_result
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ''', 
            submission.id, 
            submission.title, 
            submission.description, 
            submission.text, 
            submission.email, 
            submission.status.value,
            not (submission.status != 'pending'),  # is_private
            json.dumps(submission.superego_result.dict()) if submission.superego_result else None
            )
            
            # Insert tags if any
            if submission.tags:
                values = [(submission.id, tag) for tag in submission.tags]
                await conn.executemany('''
                    INSERT INTO constitution_tags (constitution_id, tag) VALUES ($1, $2)
                ''', values)
            
            # Initialize analytics
            await conn.execute('''
                INSERT INTO constitution_analytics (constitution_id) VALUES ($1)
            ''', submission.id)

# Update a submission status
async def update_submission(submission):
    if not pool:
        raise RuntimeError("Database pool not initialized")
    
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute('''
                UPDATE constitutions SET
                    title = $1,
                    description = $2,
                    status = $3,
                    updated_at = CURRENT_TIMESTAMP,
                    reviewer_id = $4,
                    reviewer_comments = $5,
                    is_whitelisted = $6,
                    superego_result = $7
                WHERE id = $8
            ''',
            submission.title,
            submission.description,
            submission.status.value,
            submission.reviewer_id,
            submission.reviewer_comments,
            submission.is_whitelisted,
            json.dumps(submission.superego_result.dict()) if submission.superego_result else None,
            submission.id
            )
            
            # Delete old tags and insert new ones
            await conn.execute('DELETE FROM constitution_tags WHERE constitution_id = $1', submission.id)
            if submission.tags:
                values = [(submission.id, tag) for tag in submission.tags]
                await conn.executemany('''
                    INSERT INTO constitution_tags (constitution_id, tag) VALUES ($1, $2)
                ''', values)

# Get a submission by ID
async def get_submission_by_id(submission_id):
    if not pool:
        raise RuntimeError("Database pool not initialized")
    
    async with pool.acquire() as conn:
        # Get the constitution data
        row = await conn.fetchrow('''
            SELECT * FROM constitutions WHERE id = $1
        ''', submission_id)
        
        if not row:
            return None
        
        # Get the tags
        tags = await conn.fetch('''
            SELECT tag FROM constitution_tags WHERE constitution_id = $1
        ''', submission_id)
        
        # Convert to ReviewSubmission object
        from api_routers.constitutions import ReviewSubmission, SuperegoCheck, ReviewStatus
        
        superego_result = None
        if row['superego_result']:
            superego_dict = json.loads(row['superego_result'])
            superego_result = SuperegoCheck(**superego_dict)
        
        return ReviewSubmission(
            id=row['id'],
            text=row['text'],
            title=row['title'],
            description=row['description'],
            email=row['author_email'],
            superego_result=superego_result,
            status=ReviewStatus(row['status']),
            reviewer_id=row['reviewer_id'],
            reviewer_comments=row['reviewer_comments'],
            submitted_at=row['created_at'],
            updated_at=row['updated_at'],
            tags=[t['tag'] for t in tags],
            is_whitelisted=row['is_whitelisted']
        )

# Get all pending reviews
async def get_all_pending_reviews():
    if not pool:
        raise RuntimeError("Database pool not initialized")
    
    async with pool.acquire() as conn:
        # Get all pending submissions
        rows = await conn.fetch('''
            SELECT c.*, array_agg(t.tag) as tags
            FROM constitutions c
            LEFT JOIN constitution_tags t ON c.id = t.constitution_id
            WHERE c.status = 'pending'
            GROUP BY c.id
            ORDER BY c.created_at DESC
        ''')
        
        # Convert to ReviewSubmission objects
        from api_routers.constitutions import ReviewSubmission, SuperegoCheck, ReviewStatus
        
        submissions = []
        for row in rows:
            superego_result = None
            if row['superego_result']:
                superego_dict = json.loads(row['superego_result'])
                superego_result = SuperegoCheck(**superego_dict)
            
            tags = row['tags'] if row['tags'] != [None] else []
            
            submissions.append(ReviewSubmission(
                id=row['id'],
                text=row['text'],
                title=row['title'],
                description=row['description'],
                email=row['author_email'],
                superego_result=superego_result,
                status=ReviewStatus(row['status']),
                reviewer_id=row['reviewer_id'],
                reviewer_comments=row['reviewer_comments'],
                submitted_at=row['created_at'],
                updated_at=row['updated_at'],
                tags=tags,
                is_whitelisted=row['is_whitelisted']
            ))
        
        return submissions

# Add function to update MCP status
async def update_mcp_status(submission_id: str, status: str):
    """Update the MCP status for a constitution."""
    if not pool:
        raise RuntimeError("Database pool not initialized")
    
    async with pool.acquire() as conn:
        await conn.execute('''
            UPDATE constitutions 
            SET mcp_status = $1, 
                mcp_last_updated_at = CURRENT_TIMESTAMP,
                mcp_registered_at = CASE WHEN mcp_registered_at IS NULL THEN CURRENT_TIMESTAMP ELSE mcp_registered_at END
            WHERE id = $2
        ''', status, submission_id)


# Add to background tasks in app startup

async def sync_mcp_metrics():
    """
    Background task to sync metrics from MCP servers.
    Run periodically (e.g., every hour).
    """
    logging.info("Starting MCP metrics sync...")
    
    try:
        # Get all whitelisted constitutions
        whitelisted = await get_all_whitelisted_constitutions()
        
        for constitution in whitelisted:
            try:
                # Get metrics from MCP
                metrics = await mcp_service.get_usage_metrics(constitution.id)
                
                if "status" in metrics and metrics["status"] == "error":
                    logging.warning(f"Error getting metrics for {constitution.id}: {metrics['message']}")
                    continue
                
                # Update local analytics
                await update_constitution_analytics(
                    constitution.id,
                    uses=metrics.get("uses", 0),
                    # Other metrics as needed
                )
                
                logging.info(f"Updated metrics for constitution {constitution.id}")
            except Exception as e:
                logging.error(f"Error processing metrics for {constitution.id}: {e}")
                continue
    except Exception as e:
        logging.error(f"Error in MCP metrics sync: {e}")
    
    logging.info("MCP metrics sync completed")


# Add to db/constitution_db.py

async def init_db_pool(dsn: str):
    global pool
    pool = await asyncpg.create_pool(dsn)
    
    # Create tables if they don't exist
    async with pool.acquire() as conn:
        # ... existing table creation ...
        
        # Add embedding table
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS constitution_embeddings (
                constitution_id TEXT REFERENCES constitutions(id) ON DELETE CASCADE,
                embedding VECTOR(768), -- Adjust dimension as needed
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (constitution_id)
            )
        ''')
        
        # Create index for similarity search
        await conn.execute('''
            CREATE INDEX IF NOT EXISTS constitution_embeddings_idx 
            ON constitution_embeddings USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100); -- Adjust based on expected data size
        ''')

# Add functions to store and retrieve embeddings
async def store_constitution_embedding(constitution_id: str, embedding: List[float]):
    """Store embedding vector for a constitution."""
    if not pool:
        raise RuntimeError("Database pool not initialized")
    
    async with pool.acquire() as conn:
        # Check if embedding exists
        exists = await conn.fetchval(
            "SELECT 1 FROM constitution_embeddings WHERE constitution_id = $1",
            constitution_id
        )
        
        if exists:
            # Update existing
            await conn.execute('''
                UPDATE constitution_embeddings
                SET embedding = $1, updated_at = CURRENT_TIMESTAMP
                WHERE constitution_id = $2
            ''', embedding, constitution_id)
        else:
            # Insert new
            await conn.execute('''
                INSERT INTO constitution_embeddings (constitution_id, embedding)
                VALUES ($1, $2)
            ''', constitution_id, embedding)

async def find_similar_constitutions(embedding: List[float], limit: int = 10, min_similarity: float = 0.5):
    """Find constitutions with similar embeddings."""
    if not pool:
        raise RuntimeError("Database pool not initialized")
    
    async with pool.acquire() as conn:
        results = await conn.fetch('''
            SELECT 
                c.id, 
                c.title, 
                c.description, 
                c.author_id, 
                c.author_email,
                c.created_at,
                array_agg(t.tag) as tags,
                1 - (e.embedding <=> $1) as similarity
            FROM constitution_embeddings e
            JOIN constitutions c ON e.constitution_id = c.id
            LEFT JOIN constitution_tags t ON c.id = t.constitution_id
            WHERE 1 - (e.embedding <=> $1) >= $3
            AND c.is_private = FALSE
            GROUP BY c.id, e.embedding
            ORDER BY similarity DESC
            LIMIT $2
        ''', embedding, limit, min_similarity)
        
        return results


# Add to background tasks

async def generate_embeddings_for_new_constitutions():
    """Background job to generate embeddings for constitutions without them."""
    logging.info("Starting embedding generation job...")
    
    try:
        # Get constitutions without embeddings
        async with pool.acquire() as conn:
            constitutions = await conn.fetch('''
                SELECT c.id, c.text
                FROM constitutions c
                LEFT JOIN constitution_embeddings e ON c.id = e.constitution_id
                WHERE e.constitution_id IS NULL
                AND c.status = 'approved'
                LIMIT 50 -- Process in batches
            ''')
        
        if not constitutions:
            logging.info("No new constitutions found needing embeddings")
            return
        
        # Initialize embedding service
        embedding_service = EmbeddingService()
        
        # Process each constitution
        for constitution in constitutions:
            try:
                # Generate embedding
                embedding = await embedding_service.get_embedding(constitution['text'])
                
                # Store in database
                await store_constitution_embedding(constitution['id'], embedding)
                
                logging.info(f"Generated embedding for constitution {constitution['id']}")
            except Exception as e:
                logging.error(f"Error generating embedding for {constitution['id']}: {e}")
                continue
        
        logging.info(f"Completed embedding generation for {len(constitutions)} constitutions")
    except Exception as e:
        logging.error(f"Error in embedding generation job: {e}")

# Add to db/constitution_db.py init function

# Add detailed analytics tables
await conn.execute('''
    CREATE TABLE IF NOT EXISTS constitution_views (
        id SERIAL PRIMARY KEY,
        constitution_id TEXT REFERENCES constitutions(id) ON DELETE CASCADE,
        user_id TEXT, -- NULL for anonymous
        ip_hash TEXT, -- Hashed IP for privacy
        viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
''')

await conn.execute('''
    CREATE TABLE IF NOT EXISTS constitution_downloads (
        id SERIAL PRIMARY KEY,
        constitution_id TEXT REFERENCES constitutions(id) ON DELETE CASCADE,
        user_id TEXT, -- NULL for anonymous
        downloaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
''')

await conn.execute('''
    CREATE TABLE IF NOT EXISTS constitution_stars (
        constitution_id TEXT REFERENCES constitutions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        starred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (constitution_id, user_id)
    )
''')

await conn.execute('''
    CREATE TABLE IF NOT EXISTS constitution_uses (
        id SERIAL PRIMARY KEY,
        constitution_id TEXT REFERENCES constitutions(id) ON DELETE CASCADE,
        mcp_server_id TEXT,
        used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
''')

# Create indexes for performance
await conn.execute('CREATE INDEX IF NOT EXISTS constitution_views_date_idx ON constitution_views (viewed_at)')
await conn.execute('CREATE INDEX IF NOT EXISTS constitution_stars_user_idx ON constitution_stars (user_id)')