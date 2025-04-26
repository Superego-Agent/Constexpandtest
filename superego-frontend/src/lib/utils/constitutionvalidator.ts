// src/lib/utils/constitutionValidator.ts

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
}

export async function validateConstitutionFormat(text: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for minimum length
    if (text.length < 50) {
        errors.push("Constitution is too short (minimum 50 characters).");
    }
    
    // Check for maximum length
    if (text.length > 50000) {
        errors.push("Constitution is too long (maximum 50,000 characters).");
    }
    
    // Check for appropriate formatting
    if (!text.includes('#')) {
        errors.push("Missing heading structure. Use # for main headings and ## for subheadings.");
    }
    
    // Check for empty lines
    const lines = text.split('\n');
    if (lines.filter(line => line.trim()).length < 5) {
        errors.push("Constitution has too few content lines. Add more substantial content.");
    }
    
    // Check for balanced structure
    const headingRatio = (text.match(/#/g) || []).length / text.length;
    if (headingRatio > 0.05) {
        warnings.push("Too many headings relative to content. Consider adding more detailed text.");
    }
    
    // Check for proper section organization
    let hasPrinciples = false;
    let hasGuidelines = false;
    
    for (const line of lines) {
        if (line.match(/^#+\s+(principles|values|core|tenets)/i)) {
            hasPrinciples = true;
        }
        if (line.match(/^#+\s+(guidelines|rules|requirements|instructions)/i)) {
            hasGuidelines = true;
        }
    }
    
    if (!hasPrinciples) {
        warnings.push("Consider adding a 'Principles' or 'Core Values' section.");
    }
    
    if (!hasGuidelines) {
        warnings.push("Consider adding a 'Guidelines' or 'Rules' section.");
    }
    
    // Run a basic "superego" check simulation
    // In a real implementation, this would call the backend superego system
    const superego = await simulateSuperegoPrelimCheck(text);
    if (superego.issues.length > 0) {
        errors.push(...superego.issues.map(issue => `Potential policy concern: ${issue}`));
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
    };
}

// Simulates what a real superego check would do
// In the real implementation, this would call the backend API
async function simulateSuperegoPrelimCheck(text: string): Promise<{issues: string[]}> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const issues: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Example checks for potentially problematic content
    const problematicTerms = [
        { term: "ignore safety", issue: "Constitution encourages ignoring safety guidelines" },
        { term: "bypass", issue: "Constitution may encourage bypassing intended constraints" },
        { term: "dangerous", issue: "Constitution references dangerous content without appropriate safeguards" },
        { term: "illegal content", issue: "Constitution references illegal content" }
    ];
    
    for (const { term, issue } of problematicTerms) {
        if (lowerText.includes(term)) {
            issues.push(issue);
        }
    }
    
    return { issues };
}