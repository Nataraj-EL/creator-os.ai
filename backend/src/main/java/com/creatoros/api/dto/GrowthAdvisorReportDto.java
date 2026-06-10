package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GrowthAdvisorReportDto {
    private UUID id;
    private UUID workspaceId;
    private String platform;
    private String profileUrl;
    private String niche;
    private GrowthAdvisorResult report;
    private Instant createdAt;
}
