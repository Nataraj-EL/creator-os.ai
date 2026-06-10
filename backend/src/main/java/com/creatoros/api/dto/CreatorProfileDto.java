package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreatorProfileDto {
    private UUID workspaceId;
    private String creatorName;
    private String niche;
    private String primaryPlatform;
    private String targetAudience;
    private String contentStyle;
    private String brandVoice;
    private String growthGoal;
    private String postingFrequency;
}
