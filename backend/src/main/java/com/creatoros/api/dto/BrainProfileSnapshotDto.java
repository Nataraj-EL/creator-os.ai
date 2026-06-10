package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;

import java.time.Instant;
import java.util.UUID;

@Value
@Builder
public class BrainProfileSnapshotDto {
    UUID snapshotId;
    UUID workspaceId;
    int version;
    String creatorIdentity;
    String audienceProfile;
    String communicationStyle;
    String writingStyle;
    String niche;
    String contentPillars;
    String longTermGoals;
    String extractedCreatorDNA;
    Instant createdAt;
}
