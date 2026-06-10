package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class GrowthAuditInput {
    long subscribers;
    long views;
    double ctr;
    int weeklyUploads;
    int avdSeconds;
    String niche;
    String platform;
    String brandVoice;
    String creatorName;
}
