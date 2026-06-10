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
public class ContentProjectDto {
    private UUID projectId;
    private UUID workspaceId;
    private String title;
    private String topic;
    private String hook;
    private String script;
    private String cta;
    private String status;
    private String primaryGoal;
    private List<ContentVariantDto> variants;
    private Instant createdAt;
    private Instant updatedAt;
}
