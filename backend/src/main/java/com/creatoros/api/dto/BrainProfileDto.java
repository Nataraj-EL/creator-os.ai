package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;

import java.time.Instant;
import java.util.UUID;

@Value
@Builder
public class BrainProfileDto {
    UUID profileId;
    UUID workspaceId;
    String creatorIdentity;
    String creatorMission;
    String creatorVision;
    String audienceProfile;
    String communicationStyle;
    String writingStyle;
    String contentStyle;
    String preferredCTAStyle;
    String niche;
    String strategicFocus;
    String personalityTraits;
    String contentPillars;
    String expertiseAreas;
    String longTermGoals;
    String extractedCreatorDNA;
    String contentExamples;
    Integer documentCount;
    Long totalWordsAnalyzed;
    int confidenceScore;
    boolean upToDate;
    Instant createdAt;
    Instant updatedAt;
}
