package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;
import java.util.List;

@Value
@Builder
public class GrowthAuditResult {
    int growthScore;
    int contentScore;
    int engagementScore;
    int consistencyScore;
    int audienceScore;
    String summary;
    List<String> strengths;
    List<String> weaknesses;
    List<Recommendation> recommendations;

    @Value
    @Builder
    public static class Recommendation {
        String title;
        String description;
        String impact;     // HIGH, MEDIUM, LOW
        String category;   // CONTENT, SEO, AUDIENCE, MONETIZATION, etc.
    }
}
