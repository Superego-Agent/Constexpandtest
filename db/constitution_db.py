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