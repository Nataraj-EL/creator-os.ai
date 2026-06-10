package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class ContentGenerationInput {
    String niche;
    String platform;
    String voice;
    String topic;
    String primaryGoal;

    // Brain Twin Personalization Context
    String creatorIdentity;
    String audienceProfile;
    String communicationStyle;
    String writingStyle;
    String preferredCTAStyle;
    String creatorDNA;
    String contentExamples;
}
