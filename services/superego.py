import re
import logging
import asyncio
from typing import List, Dict, Optional, Any
import json
import traceback

# Import the SuperegoCheck model
from api_routers.constitutions import SuperegoCheck

class SuperegoService:
    """Service for analyzing constitutions for safety, clarity, and compliance."""
    
    def __init__(self, use_external_api=False, api_url=None):
        self.use_external_api = use_external_api
        self.api_url = api_url
        self.safety_patterns = self._compile_safety_patterns()
        self.clarity_patterns = self._compile_clarity_patterns()
        self.completeness_patterns = self._compile_completeness_patterns()
        self.compliance_patterns = self._compile_compliance_patterns()
    
    def _compile_safety_patterns(self):
        """Compile regex patterns for safety checks."""
        return [
            (re.compile(r'ignore\s+safety', re.I), 
             "Constitution encourages ignoring safety guidelines", 25),
            (re.compile(r'bypass\s+(secur|protect|safe)', re.I), 
             "Constitution may encourage bypassing security measures", 20),
            (re.compile(r'(dangerous|harmful)\s+(content|action|behavior)', re.I), 
             "Constitution references dangerous content without appropriate safeguards", 15),
            (re.compile(r'illegal\s+content', re.I), 
             "Constitution references illegal content", 30),
            (re.compile(r'(ignore|bypass)\s+(law|regulation|rule)', re.I), 
             "Constitution suggests bypassing laws or regulations", 25),
            (re.compile(r'(remove|bypass)\s+filter', re.I), 
             "Constitution suggests bypassing content filters", 20),
        ]
    
    def _compile_clarity_patterns(self):
        """Compile regex patterns for clarity checks."""
        return [
            (re.compile(r'^\s*#', re.M), 
             "has heading structure", 5, True),  # Positive pattern
            (re.compile(r'^\s*-|\*', re.M), 
             "has bullet points", 5, True),  # Positive pattern
            (re.compile(r'^\s*\d+\.', re.M), 
             "has numbered lists", 5, True),  # Positive pattern
            (re.compile(r'(you should|please|kindly)\s+', re.I), 
             "uses request language instead of directive statements", -5, False),
            (re.compile(r'([a-z]{3,})\s+\1\s+', re.I), 
             "contains word repetition", -5, False),
        ]
    
    def _compile_completeness_patterns(self):
        """Compile regex patterns for completeness checks."""
        return [
            (re.compile(r'^\s*#+\s+.*(principle|value|core|tenet)', re.I | re.M), 
             "has principles section", 10, True),
            (re.compile(r'^\s*#+\s+.*(guideline|rule|instruction)', re.I | re.M), 
             "has guidelines section", 10, True),
            (re.compile(r'^\s*#+\s+.*(exception|limitation|bound)', re.I | re.M), 
             "has exceptions section", 10, True),
            (re.compile(r'^\s*#+\s+.*(reference|definition|gloss)', re.I | re.M), 
             "has definitions or references section", 5, True),
        ]
    
    def _compile_compliance_patterns(self):
        """Compile regex patterns for compliance checks."""
        return [
            (re.compile(r'copyright|©', re.I), 
             "mentions copyright which may need attribution", -5, False),
            (re.compile(r'(data|privacy)\s+(collect|use|process)', re.I), 
             "references data collection without clear privacy guidelines", -10, False),
            (re.compile(r'(medical|health)\s+(advice|diagnos|treat)', re.I), 
             "provides medical guidance without disclaimers", -15, False),
            (re.compile(r'(financial|investment)\s+(advice|recommend)', re.I), 
             "provides financial advice without disclaimers", -15, False),
            (re.compile(r'(disclaim|limitation|not\s+responsible)', re.I), 
             "includes appropriate disclaimers", 10, True),
        ]
    
    async def _check_external_api(self, text: str) -> Optional[Dict[str, Any]]:
        """Check constitution using external API if configured."""
        if not self.use_external_api or not self.api_url:
            return None
        
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    json={"text": text}
                ) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logging.error(f"External API error: {response.status}, {await response.text()}")
                        return None
        except Exception as e:
            logging.error(f"Error calling external API: {e}")
            traceback.print_exc()
            return None
    
    def _apply_pattern_checks(self, 
                             text: str, 
                             patterns: List[tuple], 
                             dimension: str) -> tuple:
        """Apply regex patterns and calculate score impact."""
        score_impact = 0
        issues = []
        warnings = []
        passed_checks = []
        
        for pattern_tuple in patterns:
            if len(pattern_tuple) == 4:
                pattern, message, impact, is_positive = pattern_tuple
            else:
                pattern, message, impact = pattern_tuple
                is_positive = False
            
            if pattern.search(text):
                if is_positive:
                    score_impact += impact
                    passed_checks.append(message)
                else:
                    score_impact -= impact
                    if impact >= 10:
                        issues.append(message)
                    else:
                        warnings.append(message)
        
        return score_impact, issues, warnings, passed_checks
    
    def _calculate_base_score(self, text: str) -> int:
        """Calculate base score based on text length and structure."""
        # Start with a base score
        score = 60
        
        # Length factor
        length = len(text)
        if length < 200:
            score -= 20  # Too short
        elif length > 10000:
            score -= 10  # Too long
        elif 1000 <= length <= 5000:
            score += 10  # Optimal length
        
        # Structure factor - count headings, paragraphs, etc.
        headings = len(re.findall(r'^\s*#+', text, re.M))
        if headings == 0:
            score -= 15  # No headings
        elif headings > 2 and headings < 10:
            score += 10  # Good number of headings
        
        return min(max(score, 0), 100)  # Ensure 0-100 range
    
    async def check_constitution(self, text: str) -> SuperegoCheck:
        """Run a comprehensive check on the constitution text."""
        # Try external API first if configured
        external_result = await self._check_external_api(text)
        if external_result:
            # Parse external API result into SuperegoCheck format
            try:
                return SuperegoCheck(**external_result)
            except Exception as e:
                logging.error(f"Error parsing external API result: {e}")
                # Fall back to local checks
        
        # Simulate processing time for complex analysis
        await asyncio.sleep(0.5)
        
        # Calculate base score
        base_score = self._calculate_base_score(text)
        
        # Initialize dimensions with base scores
        dimensions = {
            "safety": 80,      # Start with assumption of safety
            "clarity": 70,     # Medium clarity to start
            "completeness": 60, # Lower completeness by default
            "compliance": 75,   # Medium-high compliance assumption
        }
        
        # Initialize feedback lists
        all_issues = []
        all_warnings = []
        all_passed = []
        
        # Apply safety checks
        safety_impact, safety_issues, safety_warnings, safety_passed = self._apply_pattern_checks(
            text, self.safety_patterns, "safety"
        )
        dimensions["safety"] = max(0, min(100, dimensions["safety"] + safety_impact))
        all_issues.extend(safety_issues)
        all_warnings.extend(safety_warnings)
        all_passed.extend(safety_passed)
        
        # Apply clarity checks
        clarity_impact, clarity_issues, clarity_warnings, clarity_passed = self._apply_pattern_checks(
            text, self.clarity_patterns, "clarity"
        )
        dimensions["clarity"] = max(0, min(100, dimensions["clarity"] + clarity_impact))
        all_issues.extend(clarity_issues)
        all_warnings.extend(clarity_warnings)
        all_passed.extend(clarity_passed)
        
        # Apply completeness checks
        completeness_impact, completeness_issues, completeness_warnings, completeness_passed = self._apply_pattern_checks(
            text, self.completeness_patterns, "completeness"
        )
        dimensions["completeness"] = max(0, min(100, dimensions["completeness"] + completeness_impact))
        all_issues.extend(completeness_issues)
        all_warnings.extend(completeness_warnings)
        all_passed.extend(completeness_passed)
        
        # Apply compliance checks
        compliance_impact, compliance_issues, compliance_warnings, compliance_passed = self._apply_pattern_checks(
            text, self.compliance_patterns, "compliance"
        )
        dimensions["compliance"] = max(0, min(100, dimensions["compliance"] + compliance_impact))
        all_issues.extend(compliance_issues)
        all_warnings.extend(compliance_warnings)
        all_passed.extend(compliance_passed)
        
        # Calculate final overall score based on dimensions and base score
        dimension_avg = sum(dimensions.values()) / len(dimensions)
        final_score = int((base_score + dimension_avg) / 2)
        
        # Standard recommendations
        recommendations = []
        if not all_issues and not all_warnings:
            recommendations.append("Your constitution looks good! Consider getting feedback from others before finalizing.")
        else:
            recommendations.append("Address the identified issues to improve your constitution's effectiveness.")
            
            if "safety" in dimensions and dimensions["safety"] < 70:
                recommendations.append("Focus on improving safety considerations in your constitution.")
            if "clarity" in dimensions and dimensions["clarity"] < 70:
                recommendations.append("Improve clarity by using more headings, lists, and concise language.")
            if "completeness" in dimensions and dimensions["completeness"] < 70:
                recommendations.append("Add missing sections like principles, guidelines, or exceptions.")
            if "compliance" in dimensions and dimensions["compliance"] < 70:
                recommendations.append("Add appropriate disclaimers and address potential compliance issues.")
        
        # Add standard passed checks
        if not all_issues:
            all_passed.append("Basic safety check")
        
        return SuperegoCheck(
            score=final_score,
            issues=all_issues,
            warnings=all_warnings,
            recommendations=recommendations,
            passedChecks=all_passed,
            dimensions=dimensions,
            flagged=len(all_issues) > 0 or final_score < 70
        )