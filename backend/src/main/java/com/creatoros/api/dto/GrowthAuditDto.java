package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GrowthAuditDto {
    private UUID id;
    private UUID workspaceId;
    private int growthScore;
    private int contentScore;
    private int engagementScore;
    private int consistencyScore;
    private int audienceScore;
    private String summary;

    // Metrics Snapshot
    private Long views;
    private Long subscribers;
    private Double ctr;
    private Integer avdSeconds;
    private Integer weeklyUploads;

    private List<String> strengths;
    private List<String> weaknesses;
    private List<GrowthRecommendationDto> recommendations;
    private Instant createdAt;
}
