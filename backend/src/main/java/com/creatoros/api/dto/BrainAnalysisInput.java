package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;

import java.util.UUID;

@Value
@Builder
public class BrainAnalysisInput {
    UUID workspaceId;
    String knowledgeText;
}
