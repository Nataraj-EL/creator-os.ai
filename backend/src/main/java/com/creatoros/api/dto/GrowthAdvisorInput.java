package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GrowthAdvisorInput {
    private String profileUrl;
    private String platform;
    private String niche;
    private ChannelMetadata metadata;

    // Brain Twin Personalization Context
    private String creatorIdentity;
    private String audienceProfile;
    private String contentPillars;
    private String strategicFocus;
    private String longTermGoals;
}
