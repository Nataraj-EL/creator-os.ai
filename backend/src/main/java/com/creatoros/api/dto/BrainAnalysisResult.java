package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BrainAnalysisResult {
    private String creatorIdentity;
    private String creatorMission;
    private String creatorVision;
    private String audienceProfile;
    private String communicationStyle;
    private String writingStyle;
    private String contentStyle;
    private String preferredCTAStyle;
    private String niche;
    private String strategicFocus;
    private String personalityTraits;
    private String contentPillars;
    private String expertiseAreas;
    private String longTermGoals;
    private String creatorDNA;
    private String contentExamples; // signature writing patterns
}
